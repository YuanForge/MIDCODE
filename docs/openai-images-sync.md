# OpenAI 图片同步接口

`POST /v1/images/generations` 与 `POST /v1/images/edits` 使用现有 LLM 同步转发流程。请求通过 API Key 模型分组、渠道权限和模型路由选取渠道，复用号池认证、重试、预扣、结算及 LLM 日志。成功时直接返回上游 JSON，包括 `data`、`b64_json`、`url`、`revised_prompt` 和 `usage`，不创建任务或等待 Worker。

## 渠道配置

- 在当前 LLM 渠道中配置图片模型及模型分组，模型映射规则沿用 LLM。上游必须支持 OpenAI 图片接口。
- Base URL 推荐填写 `https://上游域名/v1`。已有 `/v1/chat/completions`、`/v1/responses` 或标准图片接口地址会根据本次请求切换到生成/编辑路径，查询参数保留；号池 Base URL 覆盖同样生效。非标准完整路径保持配置值。
- 按张计费使用 `billing_type=image`：按请求 `n` 预扣，成功后按实际 `data` 数量调整。按 token 计费使用现有 token 定价，GPT 图片的 `input_tokens/output_tokens` 会转换成内部计费字段。上游不返回 token usage 的模型应采用按张或按次计费。
- 超时沿用渠道 `timeout_ms`，网关或反向代理的读取超时也应覆盖图片生成耗时。
- `passthrough_body=true` 保持原始请求体，因此不会替换模型或执行请求脚本。需要模型映射时关闭此选项。

生成接口使用 JSON；编辑支持 multipart 上传（`image` 或重复的 `image[]`，以及可选 `mask`），也可转发上游支持的 JSON 编辑请求。multipart 文件内容、文件名和 MIME 类型保留，模型和文本字段按当前渠道处理后重新组装；重试复用原始文件，不生成公开上传 URL。

本次两个接口只支持同步请求，`stream=true` 返回 400。原生 `/v1/image` 仍使用原有异步任务流程。
