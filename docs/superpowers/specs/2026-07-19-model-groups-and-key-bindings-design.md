# 模型分组与 API Key 分组绑定设计

## 目标

将当前“同一模型名下多个渠道统一按价格/权重路由”的模式，改为“模型分组中的模型商品独立展示，API Key 绑定有序分组并按顺序跨组重试”。同一分组内同一个对外模型名只能存在一个渠道；不同分组可以存在同名模型并使用不同渠道和价格。

## 业务规则

1. 管理员维护启用/停用的模型分组。
2. 一个分组通过模型映射绑定渠道；同一分组内 `routing_model` 唯一。
3. 一个渠道可以被多个分组复用。
4. 用户创建或编辑 API Key 时，可以选择多个分组并拖拽排序。
5. Key 的第一分组是主路由，后续分组按顺序作为故障回退。
6. 请求模型按 Key 的分组顺序查找；不包含目标模型的分组跳过。
7. 只有超时、限流、上游 5xx、号池不可用等可重试错误才跨组重试；参数、余额、审核等业务错误不跨组。
8. 每次实际命中的渠道独立计费；跨组重试前必须结清/退回前一次预扣款。
9. Key 未绑定任何分组时，模型调用接口拒绝请求并提示先绑定分组。
10. `low_price` / `stable` 不再作为新 Key 的业务选择和路由策略；旧字段短期保留用于数据库兼容，代码不再依赖它决定新路由。

## 数据模型

### `model_groups`

- `id bigint primary key`
- `code varchar(64) unique not null`
- `name varchar(128) not null`
- `description text not null default ''`
- `is_active boolean not null default true`
- `created_at`, `updated_at`

### `model_group_models`

- `id bigint primary key`
- `group_id bigint not null references model_groups(id)`
- `routing_model varchar(255) not null`
- `channel_id bigint not null references channels(id)`
- `created_at`, `updated_at`
- `unique(group_id, routing_model)`
- 建议增加 `unique(group_id, channel_id)`，避免同一渠道在同一分组重复绑定。

`routing_model` 使用现有 `service.ChannelRoutingKey` 的对外模型标识；`channel_id` 指向唯一实际渠道。保存映射时必须校验渠道的 `routing_model` 与请求值一致，且渠道处于可用配置状态。

### `api_key_model_groups`

- `id bigint primary key`
- `api_key_id bigint not null references api_keys(id) on delete cascade`
- `group_id bigint not null references model_groups(id)`
- `priority integer not null`
- `created_at`, `updated_at`
- `unique(api_key_id, group_id)`
- `unique(api_key_id, priority)`

分组顺序以 `priority ASC, id ASC` 读取。保存排序时由服务端重排为连续值，不能直接信任客户端传入的重复或跳跃序号。

## 请求与路由

鉴权完成后加载当前 API Key 绑定的有序分组。所有模型入口都通过同一个分组感知的候选选择器：普通 HTTP/SSE、Responses、Realtime、Gemini 原生、图片/视频/音频接口以及显式 `channel_id` 请求都必须经过分组校验。

候选选择器按以下顺序工作：

1. 规范化请求中的 `model` / `routing_model`。
2. 按 Key 分组顺序查询该模型映射。
3. 选择第一个启用且可用的映射作为当前渠道。
4. 发生可重试错误时，跳过已经尝试过的分组/渠道，继续查找后续分组中的同名模型。
5. 没有候选时返回统一的模型不可用错误。

显式 `channel_id` 不能绕过权限：目标渠道必须能通过当前 Key 的分组映射命中，否则返回禁止访问。

路由和模型列表缓存必须包含分组或 Key 绑定版本，修改分组内容、Key 绑定或排序后立即失效相关缓存。

## API 与 UI

- 管理端新增模型分组 CRUD，以及在分组内添加/移除渠道模型的操作。
- 用户 API Key 创建/编辑接口改为接收有序 `group_ids`。
- 用户 Key 页面使用多选 + 拖拽排序，显示分组名称、模型数量和参考价格。
- 用户模型页面显示分组标签，允许同名模型以不同分组/价格并列展示。
- 停止展示和创建 `key_type`；旧 Key 如未绑定分组，页面显示“需要配置分组”，调用时拒绝。

## 迁移与发布

1. 增加三张表、外键、唯一约束和必要索引；将新模型加入 `Sync2`。
2. 先在本地/测试环境由管理员创建分组并绑定渠道，验证同组模型唯一约束和价格。
3. 部署新代码后，旧 Key 保持可查询但没有分组绑定时不可调用；用户自行选择分组后恢复调用。
4. 稳定运行后再删除或重命名 `api_keys.key_type`，避免首版回滚困难。

## 测试重点

- 同组重复模型被拒绝，不同组同名模型可保存。
- Key 分组排序决定主路由和跨组重试顺序。
- 无分组 Key、停用分组、停用渠道、显式越权 `channel_id` 均被拒绝。
- 跨组重试的预扣、退款、结算和日志关联正确。
- HTTP、SSE、Responses WS、Realtime WS、Gemini、图片/视频/音频入口行为一致。
- 修改分组或 Key 排序后路由缓存不使用旧配置。

## 首版审计字段范围

首版不为日志和账单新增专用的模型分组列，避免扩大迁移面；账单 `metrics` 写入命中分组和重试链，日志继续通过现有模型、渠道、Key 与关联账单追踪。后续查询量证明需要时，再增加专用 `model_group_id` 字段和索引。

## 按 API Key 筛选日志与流水

现有 `llm_logs.api_key_id` 和 `billing_transactions.api_key_id` 已能表达归属关系，因此不新增关联表。补充 `api_key_id` 查询参数并贯通管理员和用户接口：

- `/admin/llm-logs`、`/admin/transactions` 支持按 Key 筛选，汇总统计同步应用该条件。
- `/v1/llm-logs`、`/user/transactions` 支持按 Key 筛选，始终叠加当前用户条件，不能查看其他用户的 Key。
- 用户日志列表补充返回 `api_key_id`，流水沿用现有字段。
- 用户端和管理端筛选器提供当前用户/系统可见的 Key 选项。
- 流水表已有 `(user_id, api_key_id, created_at)` 索引；日志表增加 `(user_id, api_key_id, created_at DESC)` 索引以支持分页筛选。
