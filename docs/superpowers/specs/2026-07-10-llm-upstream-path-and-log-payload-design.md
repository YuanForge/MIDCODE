# LLM 上游路径跟随与日志正文停存设计

**日期：** 2026-07-10
**状态：** 已确认
**范围：** LLM HTTP 上游 URL 解析、LLM 调用日志持久化

## 目标

1. 允许渠道把上游 URL 配置为供应商的 `/v1` 基础地址，并根据用户实际调用的白名单接口拼接上游路径。
2. 动态路径模式下，请求和响应协议跟随客户端入口，避免把 Chat Completions 工具消息错误转换成 Responses 消息。
3. 从功能上线后的新调用开始，停止保存客户端和上游的请求、响应正文，降低 `llm_logs` 的存储增长。

## 非目标

- 不清理或改写已有 `llm_logs` 历史数据。
- 不删除数据库中的请求、响应正文字段。
- 不提供任意 `/v1/*` 路径代理。
- 不改变图片、视频、音频和异步任务的上游 URL 规则或任务日志。
- 不改变 LLM 请求、响应的实际转发、协议转换、流式处理和计费行为。

## 一、上游 URL 基础地址模式

### 启用规则

系统先应用号池的 `base_url_override`；没有覆盖地址时使用渠道 `base_url`。解析最终生效的绝对 URL，并在去掉路径末尾斜杠后检查路径：

- 路径正好为 `/v1`：启用基础地址模式。
- 路径不是 `/v1`：继续使用现有固定完整 URL 逻辑。

该规则同时接受 `https://example.com/v1` 和 `https://example.com/v1/`。不新增数据库字段、后台开关或 `auto` 协议值。

### 白名单映射

基础地址模式只处理系统已经注册并匹配成功的以下 HTTP POST 路由：

| 客户端入口 | 上游目标路径 | 有效上游协议 |
|---|---|---|
| `/v1/chat/completions` | `/v1/chat/completions` | `openai` |
| `/v1/responses` | `/v1/responses` | `responses` |
| `/v1/responses/compact` | `/v1/responses/compact` | `responses` |

示例：渠道上游 URL 为 `https://us.zzshu.cc/v1` 时，客户端调用 `https://ai.midaccs.com/v1/chat/completions`，最终上游地址为 `https://us.zzshu.cc/v1/chat/completions`。

系统从已匹配的内部路由标识选择后缀，不直接复制未经验证的原始用户路径。新增路由默认不进入基础地址模式，必须显式加入白名单和测试。

### 协议处理

基础地址模式下，有效上游协议由客户端入口决定，而不是固定使用渠道的 `protocol`：

- Chat Completions 请求保持 Chat Completions 请求体和响应格式。
- Responses 和 Responses Compact 请求保持 Responses 原生请求体和响应格式。

因此，Chat Completions 中合法的 `messages[].role = "tool"` 会发送到上游 `/v1/chat/completions`，不会先转成非法的 Responses `input[].role = "tool"`。

固定完整 URL 模式继续使用渠道现有 `protocol` 和转换链，保持向后兼容。

### URL 细节

- 使用结构化 URL 解析和路径拼接，避免重复 `/v1/v1`、双斜杠及字符串误判。
- 保留渠道或号池最终生效 URL 中配置的查询参数。
- 不转发客户端 URL 的任意查询参数；认证和固定查询参数继续来自渠道、号池与现有认证逻辑。
- `{model}`、`{stream_action}` 和密钥占位符仍按现有顺序解析；基础地址模式仅适用于最终解析后路径为 `/v1` 的地址。
- Responses WebSocket、Realtime WebSocket 不纳入本次动态 URL 改造，继续使用现有专用 URL 解析逻辑。

### 异常处理

- URL 无法解析时沿用现有上游请求创建错误处理，不回退为任意路径拼接。
- 路由不在白名单时不启用动态拼接，并禁止把用户原始路径作为上游路径。
- Responses Compact 只选择符合现有渠道约束的渠道；基础地址模式不放宽选渠规则。

## 二、停止保存 LLM 请求与响应正文

### 停存字段

所有新建的 LLM 调用日志在成功、上游错误、流式和非流式场景下都不再写入以下字段：

- `client_request`
- `upstream_request`
- `upstream_response`
- `client_response`

适用传输链路：

- 普通 HTTP 和 SSE
- Responses WebSocket
- Realtime WebSocket

请求与响应仍可在当前请求生命周期内用于上游调用、协议转换、计费、用量提取和客户端返回，但不得复制进 `LLMLog` 插入或后续补丁更新。

### 继续保存的元数据

调用日志继续保存排障和计费所需的小型字段，包括：

- 用户、API Key、渠道、模型和关联 ID
- 流式标记与传输类型
- 上游 URL、请求方法、上游 HTTP 状态和上游请求头
- Token 用量、计费价格与结算状态
- 调用状态、错误摘要和创建、更新时间

原始错误响应正文也不保存；失败原因只保留在现有 `error_msg` 等摘要字段中。

### 数据库和界面兼容

- 保留四个现有数据库字段，不新增删除字段迁移。
- 不批量清空历史记录，不在本次改动中执行数据库空间回收。
- 历史日志详情仍可展示已经保存的正文。
- 新日志的四个字段为空，管理端和用户端现有条件渲染自动隐藏对应详情区块。
- 日志详情 API 保持字段兼容，避免破坏旧前端或外部调用方。

## 三、实现边界

预计修改职责如下：

- `internal/handler/llm_upstream.go`：根据内部路由和最终生效的上游基础地址生成白名单目标 URL。
- `internal/handler/llm.go`：在基础地址模式下确定有效上游协议，并停止 HTTP/SSE 链路的四类正文落库。
- `internal/handler/responses_ws.go`：停止 Responses WebSocket 的请求和响应正文落库。
- `internal/handler/realtime_ws.go`：停止 Realtime WebSocket 的请求和响应正文落库。
- `internal/handler/llm_log_writer.go`：移除四类正文补丁处理，防止其他生产路径以后再次把大字段写入日志；历史数据读取不受影响。
- 相关测试文件：覆盖 URL、协议和日志字段行为。

前端原则上无需修改：现有详情区块已根据字段是否存在进行条件展示。实施时如发现某个区块对空对象仍展示，再做最小范围修正。

## 四、验收标准

1. 渠道 URL 为 `https://us.zzshu.cc/v1` 或末尾带 `/` 时，三个白名单入口分别请求对应的上游完整路径。
2. 渠道填写 `https://us.zzshu.cc/v1/responses` 等完整 URL 时，行为与改动前一致。
3. 号池覆盖 URL 的基础地址和固定完整地址两种模式均正确。
4. 渠道或号池 URL 自带查询参数时，路径拼接后参数仍保留。
5. Chat Completions 工具调用消息保持 Chat 格式发往上游，不再出现 `role: "tool"` 被 Responses API 拒绝的错误。
6. Responses 和 Responses Compact 请求继续使用 Responses 原生协议。
7. 非白名单用户路径不能被拼接到上游基础地址。
8. HTTP、SSE、Responses WebSocket 和 Realtime WebSocket 的新日志均不包含四个正文大字段。
9. Token、费用、状态、错误摘要、上游 URL 等元数据仍正确记录，计费和退款测试保持通过。
10. 历史日志无需迁移，仍可通过现有详情接口查看已经保存的正文。

## 五、测试要求

- 为 URL 解析增加表驱动测试：三个白名单路径、末尾斜杠、完整 URL、查询参数、非法 URL、非白名单路径和号池覆盖。
- 增加协议决策测试：基础地址模式的 Chat、Responses、Responses Compact，以及固定 URL 的原有协议行为。
- 增加包含 assistant `tool_calls` 和 `role: "tool"` 的 Chat 回归用例，验证不会进入 Responses 转换器。
- 覆盖同步、SSE、Responses WebSocket、Realtime WebSocket 日志写入，断言四个正文为空且元数据存在。
- 运行 `go test ./internal/protocol ./internal/handler`，再运行 `go test ./...` 做全量回归。
