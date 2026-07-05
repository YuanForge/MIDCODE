package billing

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/dop251/goja"
)

const billingScriptExecutionTimeout = 2 * time.Second

var (
	billingScriptCache      = make(map[string]*goja.Program)
	billingScriptCacheMu    sync.RWMutex
	errBillingScriptTimeout = errors.New("billing script execution timeout")
)

func getBillingProgram(scriptSrc string) (*goja.Program, error) {
	billingScriptCacheMu.RLock()
	if p, ok := billingScriptCache[scriptSrc]; ok {
		billingScriptCacheMu.RUnlock()
		return p, nil
	}
	billingScriptCacheMu.RUnlock()

	prog, err := goja.Compile("billing", scriptSrc, false)
	if err != nil {
		return nil, fmt.Errorf("billing script compile error: %w", err)
	}

	billingScriptCacheMu.Lock()
	billingScriptCache[scriptSrc] = prog
	billingScriptCacheMu.Unlock()

	return prog, nil
}

// RunBillingScript 执行自定义计费 JS 脚本。
//   - resp == nil 时调用 calcCost(req)，计算预扣金额
//   - resp != nil 时调用 calcActualCost(req, resp)，计算实际结算金额
//
// 脚本示例：
//
//	function calcCost(req) {
//	    return 100; // 固定费用
//	}
//
//	function calcActualCost(req, resp) {
//	    return Math.ceil(resp.usage.total_tokens / 1000000 * 2000);
//	}
func RunBillingScript(script string, req, resp map[string]interface{}) (int64, error) {
	prog, err := getBillingProgram(script)
	if err != nil {
		return 0, err
	}

	vm := goja.New()
	if _, err := runBillingScriptWithTimeout(vm, func() (goja.Value, error) {
		return vm.RunProgram(prog)
	}); err != nil {
		return 0, fmt.Errorf("billing script run error: %w", err)
	}

	var res goja.Value

	if resp == nil {
		fn, ok := goja.AssertFunction(vm.Get("calcCost"))
		if !ok {
			return 0, fmt.Errorf("billing script: calcCost function not found")
		}
		res, err = runBillingScriptWithTimeout(vm, func() (goja.Value, error) {
			return fn(goja.Undefined(), vm.ToValue(req))
		})
	} else {
		fn, ok := goja.AssertFunction(vm.Get("calcActualCost"))
		if !ok {
			return 0, fmt.Errorf("billing script: calcActualCost function not found")
		}
		res, err = runBillingScriptWithTimeout(vm, func() (goja.Value, error) {
			return fn(goja.Undefined(), vm.ToValue(req), vm.ToValue(resp))
		})
	}

	if err != nil {
		return 0, fmt.Errorf("billing script execution error: %w", err)
	}

	switch v := res.Export().(type) {
	case int64:
		return v, nil
	case float64:
		return int64(v), nil
	default:
		return 0, fmt.Errorf("billing script must return a number, got %T", res.Export())
	}
}

func runBillingScriptWithTimeout(vm *goja.Runtime, fn func() (goja.Value, error)) (goja.Value, error) {
	timer := time.AfterFunc(billingScriptExecutionTimeout, func() {
		vm.Interrupt(errBillingScriptTimeout)
	})
	defer timer.Stop()

	value, err := fn()
	if errors.Is(err, errBillingScriptTimeout) {
		return nil, errBillingScriptTimeout
	}
	return value, err
}
