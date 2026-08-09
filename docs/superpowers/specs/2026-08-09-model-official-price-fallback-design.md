# FanAPI 官方价补充与自动汇率设计

## 目标

扩展现有模型分组官方折扣能力，使 LiteLLM 未覆盖的国内模型、未收录 LLM，以及图片、视频、音频和按次计费模型也能计算官方价折扣。

LiteLLM 仍是主价格源。管理员维护的价格只补充 LiteLLM 缺失的模型或价格维度，不允许覆盖 LiteLLM 已成功匹配的价格。

本功能只影响模型分组的官方价折扣展示，不修改渠道售价、实际扣费、路由、分组顺序或 API-Key 授权。

## 已确认的产品规则

- 官方价按“模型厂商 + 标准模型名 + 计费类型”全局维护。
- 支持 USD 和 CNY 原始报价。
- `1 CNY = 1,000,000 credits`，运行时价格统一使用整数积分。
- LiteLLM 和补充价格按价格维度合并，而不是按整个模型二选一。
- 补充价格支持新增、编辑、启用、停用和删除。
- 汇率由系统在线获取，管理员不能手填或修改。
- 服务启动时立即同步汇率，之后每 6 小时同步一次。
- 汇率同步失败时继续使用最近一次成功结果；从未成功同步时，不计算 USD 价格。

## 数据来源优先级

每个价格维度独立选择来源：

1. LiteLLM 中存在该维度价格，且系统已有有效自动汇率可以完成换算时使用 LiteLLM；
2. LiteLLM 缺失该维度，或该维度因汇率缺失、解析失败、非正数等原因不可用时，使用已启用的补充官方价；
3. 两者都不存在时，该维度不可用于折扣计算。

当前 LiteLLM 解析范围继续围绕 token 计费，并扩展为输入、输出、缓存写入和缓存读取四个维度。非 token 计费类型在本期视为 LiteLLM 不支持，使用补充官方价。LiteLLM 后续增加可稳定映射的非 token 字段不在本次范围内。

## 数据模型

新增 `model_official_prices` 表：

| 字段 | 含义 |
| --- | --- |
| `id` | 主键 |
| `model_provider_id` | 关联 `model_providers.id`，删除厂商时限制删除 |
| `model_name` | 去除首尾空白后的标准模型名，运行时与渠道 `model` 精确匹配 |
| `billing_type` | `token`、`image`、`video`、`audio` 或 `count` |
| `currency` | `USD` 或 `CNY` |
| `source_price_config` | 原币报价 JSON，数值以十进制字符串保存，供编辑和追溯 |
| `normalized_price_config` | 与渠道售价字段同单位的整数积分 JSON，供运行时计算 |
| `exchange_rate_used` | USD 记录换算时使用的汇率；CNY 记录为空 |
| `exchange_rate_date` | USD 记录所用汇率的来源日期；CNY 记录为空 |
| `is_active` | 是否参与官方价补充 |
| `created_at`、`updated_at` | 创建和更新时间 |

唯一约束为 `(model_provider_id, model_name, billing_type)`。同一记录只能选择一种原始币种；修改币种属于编辑该记录。

价格配置沿用渠道的字段和计费单位：

| 计费类型 | 原始报价单位 | 配置维度 |
| --- | --- | --- |
| `token` | 每百万 token | `input_price_per_1m_tokens`、`output_price_per_1m_tokens`、`cache_creation_price_per_1m_tokens`、`cache_read_price_per_1m_tokens` |
| `image` | 每张 | `base_price`、`default_size_price`、`size_prices.1k/2k/3k/4k` |
| `video` | 每秒 | `price_per_second` |
| `audio` | 每秒 | `price_per_second` |
| `count` | 每次 | `price_per_call` |

音乐模型不新增计费类型，继续按其选择的 token、audio 或 count 类型维护。

所有已填写维度必须为有限正数，至少填写一个维度。空白维度表示“未提供”，可以由 LiteLLM 或其他有效维度决定折扣。标准化结果必须能安全存入 `int64`。

## 价格换算

换算公式：

```text
CNY 原价：normalized_credits = source_price_cny * 1,000,000
USD 原价：normalized_credits = source_price_usd * usd_cny_rate * 1,000,000
```

结果按四舍五入生成整数积分，与当前渠道管理页把 CNY 输入换算为 credits 的口径保持一致。实现使用十进制字符串和 Go 标准库的精确有理数运算，避免二进制浮点误差；换算前检查正数和 `int64` 溢出。

`source_price_config` 始终保留管理员输入的原币报价。`normalized_price_config` 是运行时唯一读取的补充价格。USD 汇率刷新时重新生成所有 USD 记录的标准化积分，包括当前停用的记录，保证记录重新启用时价格已是最新值。CNY 记录不参与汇率刷新。

## 自动汇率

固定使用以下 HTTPS 接口，不提供可配置 URL：

```text
https://api.frankfurter.dev/v2/rate/USD/CNY
```

该接口无需 API Key，返回带来源日期的每日参考汇率。周末或节假日返回最近一个可用交易日属于正常结果。

复用 `system_settings` 保存系统管理的汇率状态：

- `usd_cny_exchange_rate`：最近成功的数值；
- `usd_cny_exchange_rate_source`：固定为 `frankfurter`；
- `usd_cny_exchange_rate_date`：接口返回的汇率日期；
- `usd_cny_exchange_rate_synced_at`：最近成功请求时间；
- `usd_cny_exchange_rate_last_attempt_at`：最近尝试时间；
- `usd_cny_exchange_rate_last_error`：最近失败摘要，成功后清空。

现有人工填写或默认的 `usd_cny_exchange_rate` 不能单独作为有效自动汇率。只有同时具有合法来源、来源日期和成功同步时间的记录才可用于 USD 换算。系统设置更新接口拒绝客户端写入上述系统管理字段，前端保存其他设置时也必须从请求中移除这些字段。

汇率客户端使用 10 秒超时和 64 KiB 响应上限，并验证：

- HTTP 状态成功；
- `amount` 为 1；
- `base` 为 `USD`；
- `quote` 为 `CNY`；
- `rate` 是有限正数；
- `date` 是合法日期。

同步成功后，在同一数据库事务中更新汇率状态并重新生成所有 USD 记录。任何数据库写入或价格换算失败都会回滚整次更新，继续保留上一版汇率和积分。若汇率值与来源日期均未变化，只更新同步状态，不重复写全部价格记录。

同步失败不会影响模型分组查询。系统保存失败时间和简短错误，记录服务日志，并继续使用最近一次完整成功的汇率与积分。系统从未完整成功时，LiteLLM 的 USD 价格和手工 USD 补充价格都不可用，CNY 补充价格仍可使用。

## 后台任务

在现有 `internal/app/jobs.go` 启动作业中增加官方汇率同步任务：

1. 服务启动后立即执行一次；
2. 此后每 6 小时执行；
3. 使用上下文在服务退出时停止；
4. 单进程内防止重入。

不增加新的第三方依赖、消息队列任务或历史汇率表。

## 管理 API

在管理员路由下提供独立 CRUD，统一要求现有 `settings:write` 权限：

- `GET /admin/model-official-prices`：分页、筛选并返回汇率状态；
- `POST /admin/model-official-prices`：新增；
- `PUT /admin/model-official-prices/:id`：编辑；
- `PATCH /admin/model-official-prices/:id/status`：启用或停用；
- `DELETE /admin/model-official-prices/:id`：删除。

列表支持按模型厂商、模型名、计费类型和启用状态筛选。

创建和更新时执行以下验证：

- 厂商存在；
- 标准模型名去除首尾空白后非空；
- 计费类型和价格字段对应；
- 币种只能是 USD 或 CNY；
- 所有已提供价格均为有限正数且至少一个维度存在；
- USD 记录必须存在有效的自动汇率；
- 唯一键冲突返回 HTTP 409；
- 输入错误返回 HTTP 400；
- 不存在的记录返回 HTTP 404。

新增、编辑、启停和删除写入现有 `admin_audit_logs`，`resource_type` 使用 `model_official_price`。自动汇率同步只写服务日志和同步状态，不伪装成管理员操作。

## 管理页面

在“系统设置”增加“官方价”页签，具体内容拆成独立 React 组件。现有设置页顶部“保存设置”按钮不保存官方价记录，官方价 CRUD 各自立即提交。

页签顶部显示只读汇率状态：

- 当前 USD/CNY；
- 来源 `Frankfurter`；
- 汇率日期；
- 最近同步时间；
- 最近同步是否失败。

页面不提供汇率输入框或人工换算按钮。

价格表显示厂商、标准模型名、计费类型、币种、原始报价摘要、积分报价摘要、启用状态和更新时间，并提供新增、编辑、启停和删除操作。删除需要二次确认。

新增和编辑弹窗根据计费类型只显示对应维度。模型厂商从现有厂商接口选择；标准模型名允许输入，以便在渠道创建前维护价格，但页面明确提示必须与渠道 `model` 精确一致。

设置页页签在窄宽度下允许横向滚动；价格表在小屏幕使用横向滚动，弹窗内容独立滚动，底部操作按钮固定可见，避免在 `1280x720` 或更小视口中丢失操作入口。

## 运行时合并与折扣计算

模型分组折扣查询同时取得绑定渠道的 `model_provider_id`、`model`、`billing_type` 和默认 `billing_config`，并批量取得相关启用补充价格，避免逐模型查询。

对于 token 维度：

1. 使用现有规则匹配 LiteLLM 模型；
2. LiteLLM 对该维度存在有限正价时，将其按最近成功汇率转换为对应的整数积分；
3. LiteLLM 缺失该维度或该维度不可用时，读取匹配补充记录的标准化积分。

对于 image、video、audio 和 count 维度，本期将 LiteLLM 视为未提供可用官方价，直接读取匹配补充记录。计费类型不匹配时不跨类型猜测。

合并后的官方价与渠道默认售价使用同单位的积分直接比较。继续沿用现有分组折扣规则：

- 每个可比较维度计算折扣并四舍五入到 10 个基点，即 `0.01折`；
- 同一分组所有可用维度结果一致时返回 `available`；
- 有多个不同结果时返回 `inconsistent`，不求平均值；
- 没有任何可比较维度时返回 `unavailable`；
- 缺失维度本身不会导致 `inconsistent`。

LiteLLM 请求失败时优先使用现有的最近成功缓存。冷启动且 LiteLLM 从未成功时，仍可使用数据库中匹配的补充维度；其余维度不可用。价格刷新和折扣计算都不修改渠道 `billing_config`。

用户 API 继续返回现有 `official_discount_bps` 和 `official_discount_status`，不增加价格来源字段。用户界面继续只显示折扣结果。

## 并发与一致性

- 汇率和 USD 标准化积分在同一事务中切换，运行时不会看到新汇率配旧积分。
- 新建或编辑 USD 记录在事务内读取当前有效汇率并写入原价、标准化积分和汇率元数据。
- 数据库唯一约束是并发重复创建的最终防线。
- 启停和删除完成后，下一次模型分组查询立即使用新状态；不增加额外价格缓存。

## 测试

后端单元测试覆盖：

- Frankfurter 正常响应；
- 非成功状态、超大响应、错误币种、缺失字段、非法日期和非正数汇率；
- USD/CNY 各计费类型到整数积分的换算、四舍五入和溢出；
- LiteLLM 输入、输出、缓存写入和缓存读取解析；
- LiteLLM 按维度优先和补充价格补缺；
- 非 token 价格维度映射；
- `available`、`inconsistent` 和 `unavailable` 状态。

服务和 API 测试覆盖：

- CRUD、筛选、启停、删除、权限和审计；
- 重复唯一键、错误字段、无自动汇率时保存 USD；
- 汇率成功刷新后批量重算 USD 且不修改 CNY；
- 任一换算或数据库步骤失败时整体回滚；
- 汇率请求失败时保留最近成功值；
- 设置 API 拒绝人工修改系统管理的汇率字段。

涉及 PostgreSQL JSONB、唯一约束和事务行为的测试使用 `FANAPI_TEST_DATABASE_URL`。没有真实 PostgreSQL 测试库时，只能报告单元测试结果，不能声称数据库迁移与事务已验证。

前端测试覆盖：

- “官方价”页签和只读汇率状态；
- 按计费类型切换动态字段；
- 新增、编辑、启停、删除和 API 错误提示；
- 筛选和价格摘要；
- 系统设置保存请求不包含自动汇率字段；
- 用户侧折扣展示保持兼容。

使用浏览器在桌面和移动视口验证页面。至少覆盖 `1920x1080`、`1280x720` 和一个移动视口，确认页签、表格、弹窗内容和底部按钮均可访问且没有重叠。

## 迁移与兼容

- 新模型加入 XORM `Sync2`，用于全新数据库。
- 同时提供显式、可重复执行的 PostgreSQL 迁移脚本，创建表、约束和索引，供现有生产数据库升级。
- 现有 LiteLLM 缓存和用户 API 字段保持兼容。
- 删除系统设置页的人工汇率输入与校验，但保留 `usd_cny_exchange_rate` 键作为后台维护的当前汇率值。
- 不把现有人工汇率或写死的 `7.20` 当作自动同步成功记录。

## 不在本次范围

- 手工修改汇率；
- 使用补充价格覆盖 LiteLLM 已有维度；
- 汇率历史版本和历史折扣重放；
- 官方价批量导入导出；
- 为官方价新增独立 RBAC 权限；
- 用户端展示 LiteLLM、手工补充或汇率来源；
- 修改实际计费、渠道成本或渠道售价。
