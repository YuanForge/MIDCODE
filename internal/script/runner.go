package script

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/dop251/goja"
)

var errScriptTimeout = errors.New("script execution timeout")

const scriptExecutionTimeout = 2 * time.Second

// compiledScript 缓存同一脚本源码对应的编译结果（AST Program），
// 避免每次请求都重复 parse/compile，显著降低高并发下的 CPU 开销。
type compiledScript struct {
	program *goja.Program
}

var (
	scriptCache   = make(map[string]*compiledScript)
	scriptCacheMu sync.RWMutex
)

// getProgram 返回 scriptSrc 对应的已编译 Program（命中缓存则直接返回）。
func getProgram(scriptSrc string) (*goja.Program, error) {
	scriptCacheMu.RLock()
	if c, ok := scriptCache[scriptSrc]; ok {
		scriptCacheMu.RUnlock()
		return c.program, nil
	}
	scriptCacheMu.RUnlock()

	prog, err := goja.Compile("script", scriptSrc, false)
	if err != nil {
		return nil, fmt.Errorf("script compile error: %w", err)
	}

	scriptCacheMu.Lock()
	scriptCache[scriptSrc] = &compiledScript{program: prog}
	scriptCacheMu.Unlock()

	return prog, nil
}

// RunMapRequest 执行 JS 脚本中的 mapRequest(input) 函数，将平台标准请求映射为上游格式。
// poolKeyValue 会以全局变量 poolKey 注入到 VM 中，展示示例：
//
//	function mapRequest(input) {
//	    return { ...input, model: "vendor-model-name", api_key: poolKey };
//	}
func RunMapRequest(scriptSrc string, input map[string]interface{}, poolKeyValue string) (map[string]interface{}, error) {
	return runMapFnWithGlobals(scriptSrc, "mapRequest", input, map[string]interface{}{
		"poolKey": poolKeyValue,
	})
}

// RunMapResponse 执行 JS 脚本中的 mapResponse(input) 函数，将上游响应映射为平台标准格式。
//
// 脚本示例：
//
//	function mapResponse(output) {
//	    return { url: output.data[0].url, status: 2 };
//	}
func RunMapResponse(scriptSrc string, input map[string]interface{}) (map[string]interface{}, error) {
	return runMapFn(scriptSrc, "mapResponse", input)
}

// RunCheckError 执行 JS 脚本中的 checkError(response) 函数，检测上游错误。
//
// 脚本约定：
//   - 返回 null / undefined / false / ""           → 无错误
//   - 返回非空字符串                                → 普通错误消息（平台据此 failTask/退款，仅触发重试）
//   - 返回 true                                     → 通用错误（使用默认消息）
//   - 返回 {msg: string, fatal: bool}              → fatal=true 时表示该渠道永久故障（如余额不足），平台会停用渠道
//
// 示例（ChatFire 格式）：
//
//	function checkError(resp) {
//	    if (resp.error?.code === "insufficient_quota") {
//	        return { msg: resp.error.message, fatal: true };
//	    }
//	    if (resp.error) return resp.error.code + ": " + resp.error.message;
//	    return null;
//	}
func RunCheckError(scriptSrc string, response map[string]interface{}) (string, bool, error) {
	prog, err := getProgram(scriptSrc)
	if err != nil {
		return "", false, err
	}
	vm := goja.New()
	if _, err := runProgramWithTimeout(vm, prog); err != nil {
		return "", false, fmt.Errorf("script run error: %w", err)
	}
	fn, ok := goja.AssertFunction(vm.Get("checkError"))
	if !ok {
		return "", false, fmt.Errorf("function \"checkError\" not found in error_script")
	}
	res, err := callWithTimeout(vm, func() (goja.Value, error) {
		return fn(goja.Undefined(), vm.ToValue(response))
	})
	if err != nil {
		return "", false, fmt.Errorf("checkError execution error: %w", err)
	}
	if goja.IsNull(res) || goja.IsUndefined(res) {
		return "", false, nil
	}
	switch v := res.Export().(type) {
	case bool:
		if v {
			return "upstream returned error", false, nil
		}
		return "", false, nil
	case string:
		return v, false, nil
	case map[string]interface{}:
		msg, _ := v["msg"].(string)
		fatal, _ := v["fatal"].(bool)
		if msg == "" && fatal {
			msg = "upstream returned fatal error"
		}
		return msg, fatal, nil
	default:
		return "", false, nil
	}
}

func runMapFn(scriptSrc, fnName string, input map[string]interface{}) (map[string]interface{}, error) {
	return runMapFnWithGlobals(scriptSrc, fnName, input, nil)
}

func runMapFnWithGlobals(scriptSrc, fnName string, input map[string]interface{}, globals map[string]interface{}) (map[string]interface{}, error) {
	prog, err := getProgram(scriptSrc)
	if err != nil {
		return nil, err
	}

	// 每次请求创建独立的 VM Runtime，保证并发安全（goja Runtime 非线程安全）
	vm := goja.New()
	if _, err := runProgramWithTimeout(vm, prog); err != nil {
		return nil, fmt.Errorf("script run error: %w", err)
	}
	for k, v := range globals {
		vm.Set(k, v)
	}

	fn, ok := goja.AssertFunction(vm.Get(fnName))
	if !ok {
		return nil, fmt.Errorf("function %q not found in script", fnName)
	}

	res, err := callWithTimeout(vm, func() (goja.Value, error) {
		return fn(goja.Undefined(), vm.ToValue(input))
	})
	if err != nil {
		return nil, fmt.Errorf("function %q execution error: %w", fnName, err)
	}

	if goja.IsNull(res) || goja.IsUndefined(res) {
		return input, nil
	}

	exported := res.Export()
	result, ok := exported.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("function %q must return an object, got %T", fnName, exported)
	}
	return result, nil
}

func runProgramWithTimeout(vm *goja.Runtime, prog *goja.Program) (goja.Value, error) {
	return callWithTimeout(vm, func() (goja.Value, error) {
		return vm.RunProgram(prog)
	})
}

func callWithTimeout(vm *goja.Runtime, fn func() (goja.Value, error)) (goja.Value, error) {
	timer := time.AfterFunc(scriptExecutionTimeout, func() {
		vm.Interrupt(errScriptTimeout)
	})
	defer timer.Stop()

	value, err := fn()
	if errors.Is(err, errScriptTimeout) {
		return nil, errScriptTimeout
	}
	return value, err
}
