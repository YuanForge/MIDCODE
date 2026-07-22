# LLM Fast Mode Support and Billing TODO

> 按任务顺序实施；优先复用现有协议转换、原始请求、重试准备、预扣和多退少补链路。

**目标：** 支持 GPT Priority processing 和 Claude Fast Mode，并在上游实际降级到标准档位时按标准价格结算。

**改动范围：** 中等偏小。不新建计费引擎，不新增数据库字段，不重写格式转换。只给现有转换补 fast 字段，并在现有 token 标准价格上应用渠道级 Fast 倍率。

**不改数据库：**

- 标准售价和标准进价继续使用现有字段；运营只在渠道编辑页填写一个“Fast 倍率”，前端自动写入 `channels.billing_config.fast_ratio`。
- requested/actual tier、降级信息和实际生效价格保存在现有 `billing_transactions.metrics` JSON。
- LLM 日志档位信息暂存在现有 `llm_logs.usage` JSON；已有输入/输出价格列继续保存本次实际生效价格。
- 不新增迁移脚本，不增加 `llm_logs` 独立档位列。

**协议约定：**

- GPT/OpenAI 请求：`service_tier: "priority"`。
- GPT/OpenAI 响应：`service_tier: "priority" | "default"`。
- Claude 请求：`speed: "fast"`，并发送 `anthropic-beta: fast-mode-2026-02-01`。
- Claude 响应：`usage.speed: "fast" | "standard"`。
- FanAPI 内部只使用两个统一档位：`standard`、`fast`。

---

## Task 1：在现有 billing_config 增加 Fast 倍率

**文件：**

- Modify: `internal/billing/pricer.go`
- Modify: `internal/billing/pricer_test.go`
- Modify: `README.md`

- [ ] 在现有 `billing_config` JSON 中增加唯一配置项 `fast_ratio`，表示该渠道/模型的 Fast 倍率，例如 `2.0`、`1.8`、`6.0`。
- [ ] 运营不直接编辑 JSON；`fast_ratio` 由渠道编辑页的结构化输入框读写。
- [ ] `fast_ratio` 为空或不大于 0 表示该渠道不支持 Fast；填写有效倍率后即自动启用，不再增加单独的 `fast_enabled` 开关。
- [ ] 同一个 `fast_ratio` 同时应用于用户售价和上游进价，保持现有利润比例。
- [ ] 倍率应用于全部 token 价格组件：普通输入、输出、缓存写入、缓存读取。
- [ ] Claude Prompt Cache 与数据驻留等附加倍率继续叠加；这里的 Fast 倍率只负责从标准 token 单价派生 Fast token 单价。
- [ ] Fast 请求要求 `fast_ratio > 0`，否则在发送上游前失败。
- [ ] 普通请求继续使用现有顶层价格，行为完全不变。
- [ ] 先应用现有 `pricing_groups` 和 VIP 折扣得到用户的标准实际价格，再应用 `fast_ratio`，确保分组价和 VIP 价保持相同比例。
- [ ] 上游进价读取现有标准进价后应用相同的 `fast_ratio`。
- [ ] 倍率计算统一向上取整到 credits，避免浮点截断和少扣；测试覆盖 `1.7`、`1.75`、`1.8`、`2.0`、`6.0`。
- [ ] README 增加配置示例和 credits 单位说明。

建议配置：

```json
{
  "input_price_per_1m_tokens": 2500000,
  "output_price_per_1m_tokens": 15000000,
  "cache_read_price_per_1m_tokens": 250000,
  "input_cost_per_1m_tokens": 2000000,
  "output_cost_per_1m_tokens": 12000000,
  "fast_ratio": 2.0
}
```

这里的倍率是渠道级、模型级倍率，不是全站统一倍率。例如 GPT-5.4 渠道可以配置 `2.0`，GPT-4o 渠道可以配置 `1.7`，Claude Opus 不同版本也可以分别配置各自倍率。

## Task 2：从原始请求识别 Fast 档位

**文件：**

- Modify: `internal/handler/llm.go`
- Modify: `internal/handler/llm_upstream_attempt.go`
- Modify: `internal/handler/responses_ws.go`
- Modify: `internal/handler/llm_test.go`

- [ ] 继续使用现有 `origReqData`，不从协议转换后的 `mappedReq` 判断计费档位。
- [ ] 新增轻量 `LLMServiceTierContext`：
  - `RequestedTier`
  - `RequestedServiceTier`
  - `RequestedSpeed`
  - `ClaudeFastBetaEnabled`
- [ ] 请求体满足以下任一条件时，内部档位为 `fast`：
  - `service_tier == "priority"`
  - 兼容 `service_tier == "fast"`
  - `speed == "fast"`
- [ ] 保存客户端 `Anthropic-Beta` 的安全快照，仅用于协议透传和计费判定。
- [ ] fast 请求选中缺少有效 `fast_ratio` 的渠道时，在预扣和上游请求之前返回清晰错误。
- [ ] 每次渠道重试和 Pool Key 轮转继续使用现有 `prepareLLMUpstreamAttempt`，从相同原始请求和 tier context 重新生成上游请求。

## Task 3：给现有协议转换补 Fast 字段

**文件：**

- Modify: `internal/protocol/convert_claude.go`
- Modify: Responses/OpenAI conversion files under `internal/protocol/`
- Modify: `internal/handler/llm_upstream_attempt.go`
- Modify: `internal/handler/llm_upstream.go`
- Modify: protocol tests

### GPT / OpenAI

- [ ] OpenAI Chat 同协议请求保留 `service_tier`。
- [ ] Responses 同协议请求保留 `service_tier`。
- [ ] OpenAI Chat → Responses 时复制 `service_tier`。
- [ ] Responses → OpenAI Chat 时复制兼容的 `service_tier`。
- [ ] GPT fast 上游统一使用官方值 `service_tier: "priority"`。
- [ ] `/v1/responses/compact` 和 Responses WebSocket 保留该字段。

### Claude

- [ ] Claude 同协议请求保留 `speed`。
- [ ] 内部档位为 fast 且上游协议为 Claude 时写入 `speed: "fast"`。
- [ ] Claude fast 请求自动合并 `anthropic-beta: fast-mode-2026-02-01`。
- [ ] 合并 header 时保留渠道已有的其他 Anthropic beta，不重复、不覆盖。
- [ ] 普通 Claude 请求不自动添加 fast beta。
- [ ] Claude → OpenAI/Responses 标准化可以丢弃上游不认识的字段，但不能丢失独立保存的 tier context。

## Task 4：按请求档位预扣

**文件：**

- Modify: `internal/billing/pricer.go`
- Modify: `internal/billing/pricer_test.go`
- Modify: `internal/handler/llm.go`
- Modify: `internal/handler/responses_ws.go`

- [ ] 给 `CalcForUser` 增加显式 requested tier 参数，或新增兼容 wrapper，避免破坏其他调用方。
- [ ] requested tier 为 `standard` 时继续读取现有顶层售价。
- [ ] requested tier 为 `fast` 时，把用户当前有效标准售价乘以 `fast_ratio`。
- [ ] 给 `CalcUpstreamCost` 增加相同档位选择，把标准进价乘以相同的 `fast_ratio`。
- [ ] 继续使用现有 token 估算方式；fast 只改变单价，不改变 token 数。
- [ ] hold 交易的现有 `metrics` JSON 增加：
  - `requested_tier`
  - `effective_input_price`
  - `effective_output_price`
  - `effective_cache_prices`
- [ ] 增加标准请求、GPT fast、Claude fast、缺少 fast 配置、用户组价格和 VIP 折扣测试。

## Task 5：捕获实际档位并按实际档位结算

**文件：**

- Modify: `internal/handler/llm_stream.go`
- Modify: `internal/handler/llm_billing.go`
- Modify: `internal/billing/pricer.go`
- Modify: `internal/billing/pricer_test.go`
- Modify: sync/SSE/Responses WS tests

- [ ] 同步 OpenAI/Responses 响应提取顶层 `service_tier`。
- [ ] OpenAI/Responses SSE 最终事件提取 `service_tier`。
- [ ] 同步 Claude 响应提取 `usage.speed`。
- [ ] Claude SSE 从 `message_start`、`message_delta` 或最终 usage 提取 `speed`。
- [ ] 在现有标准化 usage map 中增加内部字段：
  - `actual_service_tier`
  - `actual_speed`
  - `actual_tier`
- [ ] actual tier 判定顺序：
  1. `usage.speed == "fast"` → fast。
  2. `usage.speed == "standard"` → standard。
  3. `service_tier == "priority"` → fast。
  4. `service_tier == "default"` → standard。
  5. 上游没有返回实际档位 → 回退 requested tier，并标记 `tier_unconfirmed=true`。
- [ ] 给 `CalcActualCostForUser` 增加 actual tier 价格选择。
- [ ] 给 `CalcActualUpstreamCost` 增加 actual tier 价格选择。
- [ ] 复用现有多退少补：请求 fast、实际 standard 时自动退还差价。
- [ ] 请求 standard、上游意外执行 fast 时仍按 standard 向用户收费，在 metrics 记录成本异常，不补扣未经用户请求的 premium。
- [ ] 增加 OpenAI `priority → default` 降级退款测试。
- [ ] 增加 Claude `fast → standard` 降级退款测试。
- [ ] 增加流中断、未获得实际档位时按 requested tier 结算的测试。

## Task 6：使用现有 JSON 和价格列记录日志

**文件：**

- Modify: `internal/handler/llm.go`
- Modify: `internal/handler/llm_billing.go`
- Modify: `internal/handler/llm_log.go`
- Modify: `internal/handler/llm_log_writer.go`
- Modify: `web/app/src/lib/api/user.ts`
- Modify: `web/app/src/pages/user/UserLogsPage.tsx`

- [ ] 不新增数据库字段和迁移脚本。
- [ ] hold/settle/refund 的现有 `billing_transactions.metrics` 保存：
  - `requested_tier`
  - `actual_tier`
  - `tier_confirmed`
  - `tier_downgraded`
  - 本次实际生效售价和进价
- [ ] `llm_logs.usage` JSON 保存实际档位和上游原始档位值。
- [ ] 现有 `input_price_per_1m_tokens`、`output_price_per_1m_tokens` 列保存本次最终结算实际使用的价格；发生降级时在结算后 patch 为标准价格。
- [ ] 用户日志详情从 usage JSON 展示“标准 / Fast / Fast→标准降级”。
- [ ] 暂不增加数据库级按档位筛选和聚合统计；后续确有运营需求再单独设计索引或列。

## Task 7：后台配置和验收

**文件：**

- Modify: `web/app/src/pages/admin/AdminChannelsPage.tsx`
- Modify: relevant frontend/admin tests

- [ ] 在现有渠道编辑页 token 价格配置区域增加一个“Fast 倍率”数字输入框。
- [ ] 输入框允许小数，建议步进 `0.01`；为空表示关闭，填写正数表示启用。
- [ ] 表单保存时自动序列化为 `billing_config.fast_ratio`，编辑已有渠道时自动回填；运营无需打开高级 JSON。
- [ ] 清空输入框时从 `billing_config` 删除 `fast_ratio`，不能残留旧倍率。
- [ ] 后端渠道保存接口校验 `fast_ratio` 必须为有限正数，并设置合理上限，建议不超过 `100`。
- [ ] 后台根据标准价格实时展示倍率换算后的 Fast 输入、输出和缓存价格，供管理员确认。
- [ ] 提示 GPT Priority 倍率因模型而异，不能假设全部为 2 倍。
- [ ] 提示 Claude Fast 需要 beta header，且支持模型由上游官方决定。
- [ ] 导入上游模型但没有 fast 倍率数据时保持输入框为空。
- [ ] 验收 GPT：上游收到 `service_tier=priority`；实际返回 default 时退差价。
- [ ] 验收 Claude：上游收到 `speed=fast` 和 beta header；实际返回 standard 时退差价。
- [ ] 验收普通请求：协议转换、价格、缓存计费、重试和日志行为保持不变。

## 测试命令

```powershell
go test ./internal/billing -count=1
go test ./internal/protocol -count=1
go test ./internal/handler -count=1
go test ./... -count=1

Set-Location web/app
npm run lint
npm run build
npm run test:e2e
```

## 实施边界

- [ ] 不解析用户消息文本中的字面 `/fast`；客户端负责转换为 API 参数。
- [ ] 不引入 New API 的通用计费表达式引擎。
- [ ] 不新增数据库字段或迁移脚本。
- [ ] 不使用全站统一倍率；倍率必须配置在具体渠道/模型的 `billing_config` 中。
- [ ] 未配置有效 fast 倍率的渠道不能透传 premium 请求。
- [ ] 官方支持模型和价格由运营配置维护，不硬编码到核心计费逻辑。
