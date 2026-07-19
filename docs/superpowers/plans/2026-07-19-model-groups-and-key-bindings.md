# 模型分组与 API Key 绑定实施计划

> **给执行代理的说明：** 按任务逐项执行，每一步使用复选框跟踪。实现前必须遵循测试优先和分阶段验证。

**目标：** 用有序模型分组替代 low_price/stable API Key 路由，实现跨分组重试，以及日志和账单流水按 API Key 筛选。

**架构：** 新增 model_groups、model_group_models、api_key_model_groups 三张规范化表。所有请求通过统一的分组感知选择器路由；每个分组内一个对外模型只绑定一个渠道，后续分组作为故障回退。api_keys.key_type 暂时保留用于回滚和数据库兼容，但新逻辑不再依赖它。

**技术栈：** Go、Gin、Xorm、PostgreSQL、Redis 路由缓存、React/TypeScript/Vite、现有 shadcn UI。

---

### 任务 1：增加模型分组持久化和数据库迁移

**文件：**
- 新建：internal/model/model_group.go
- 新建：internal/model/model_group_model.go
- 新建：internal/model/api_key_model_group.go
- 修改：internal/db/db.go
- 新建：scripts/migrate_20260719_model_groups.sql
- 测试：internal/service/model_group_test.go

- [ ] 定义三个 Xorm 模型，包含时间字段、启用状态、外键 ID 和分组排序字段。
- [ ] 在 db.Init 的 Sync2 中注册三个模型。
- [ ] 增加以下幂等索引：model_group_models(group_id, routing_model)、api_key_model_groups(api_key_id, priority, id)、api_key_model_groups(group_id, api_key_id)，以及 llm_logs(user_id, api_key_id, created_at DESC) WHERE api_key_id > 0。
- [ ] 编写显式 SQL 迁移，创建三张表、外键和唯一约束：UNIQUE(group_id, routing_model)、UNIQUE(group_id, channel_id)、UNIQUE(api_key_id, group_id)、UNIQUE(api_key_id, priority)。不得创建默认分组，也不得自动绑定现有 Key。
- [ ] 为模型名清理、优先级规范化、同组重复模型拒绝增加单元测试。
- [ ] 运行：go test ./internal/service ./internal/model ./internal/db -count=1，以及 git diff --check。
- [ ] 提交：feat: add model group persistence。

### 任务 2：实现模型分组服务和管理员接口

**文件：**
- 新建：internal/service/model_group.go
- 新建：internal/handler/admin_model_group.go
- 修改：internal/router/admin.go
- 修改：web/app/src/lib/api/admin.ts
- 新建或修改：web/app/src/pages/admin/AdminModelGroupsPage.tsx
- 修改：web/app/src/app/router.tsx
- 测试：internal/service/model_group_test.go、internal/handler/admin_model_group_test.go

- [ ] 实现分组查询、新建、编辑、启停、删除，以及分组模型查询、绑定、解绑服务方法。
- [ ] 校验分组编码/名称非空、渠道存在、ChannelRoutingKey 一致、分组启用状态和同组重复模型。
- [ ] 如果分组仍被 API Key 引用，禁止直接删除。
- [ ] 增加接口：GET/POST /admin/model-groups、PUT/PATCH/DELETE /admin/model-groups/:id、GET /admin/model-groups/:id/models、POST/DELETE /admin/model-groups/:id/models。
- [ ] 增加管理页面，支持分组 CRUD 和渠道模型绑定，显示模型、渠道及价格。
- [ ] 测试渠道与模型不匹配、重复模型、停用分组和正常 CRUD。
- [ ] 运行 Go 定向测试、web/app 下的 npm run build、git diff --check；提交 feat: add model group management。

### 任务 3：增加 API Key 有序分组绑定

**文件：**
- 新建或修改：internal/service/api_key_groups.go
- 修改：internal/handler/auth_api_key.go
- 修改：internal/router/user.go
- 修改：web/app/src/lib/api/user.ts
- 修改：web/app/src/pages/user/UserKeysPage.tsx
- 测试：internal/service/api_key_groups_test.go、internal/handler/auth_api_key_test.go

- [ ] 实现可用分组列表、Key 分组列表、事务性替换绑定和有序绑定加载。
- [ ] 将提交的分组 ID 规范化为 1..N 的连续优先级；拒绝重复 ID、停用分组、不存在分组和空绑定。
- [ ] Key 创建接口接收有序 group_ids，不再接收 key_type；数据库字段暂时保留。
- [ ] Key 列表返回 model_groups 和 needs_group_binding。
- [ ] 增加 GET /user/model-groups、GET /user/apikeys/:id/model-groups、PUT /user/apikeys/:id/model-groups，并执行所有权校验。
- [ ] 将 UserKeysPage 的低价/稳定选择器改为多选 + 拖拽排序，并提示未绑定分组的 Key。
- [ ] 测试事务回滚、排序、重复/停用分组拒绝和跨用户访问隔离。
- [ ] 运行 Go 定向测试、npm run build、git diff --check；提交 feat: bind API keys to ordered model groups。

### 任务 4：引入统一的分组感知路由选择器

**文件：**
- 新建：internal/service/model_group_routing.go
- 修改：internal/middleware/auth.go
- 修改：internal/handler/llm.go
- 修改：internal/handler/proxy.go
- 修改：internal/handler/llm_routing.go
- 修改：internal/handler/realtime_ws.go
- 修改：internal/handler/responses_ws.go
- 视需要修改：internal/handler/llm_upstream.go
- 测试：internal/service/model_group_routing_test.go，以及现有 LLM/proxy/WS 测试

- [ ] 定义选择器接口，输入 apiKeyID、routing model、协议、排除渠道 ID 和上下文，输出分组 ID、优先级、渠道 ID、渠道对象及剩余候选。
- [ ] API-Key 调用没有分组绑定时，返回统一的 403 错误。
- [ ] 将 LLM 和代理流程中的 SelectChannelStableForUser、SelectChannel、SelectChannelByWeight 及按名称兜底逻辑替换为分组选择器。
- [ ] 使用显式 channel_id 前，校验该渠道是否属于当前 Key 已绑定的启用分组，且模型名匹配。
- [ ] 保留现有预扣、退款和结算逻辑；仅在超时、限流、上游 5xx、号池失败等可重试错误下进入后续分组。
- [ ] 对 HTTP/SSE、Responses WS、Realtime WS、Gemini 原生、图片、视频和音频接口使用相同选择器。
- [ ] 测试主分组选择、无模型分组跳过、回退顺序、协议过滤、越权 channel_id、无绑定拒绝和不可重试错误。
- [ ] 运行：go test ./internal/service ./internal/handler ./internal/protocol -count=1，以及 git diff --check；提交 feat: route requests through ordered model groups。

### 任务 5：更新模型发现、文档和调试页面

**文件：**
- 修改：internal/handler/auth_models.go
- 修改：web/app/src/lib/api/user.ts
- 修改：web/app/src/pages/user/UserModelsPage.tsx
- 修改：web/app/src/pages/user/UserPlaygroundPage.tsx
- 如文档示例在此生成则修改：web/app/src/pages/user/UserDocsPage.tsx
- 测试：internal/handler/auth_test.go、web/app/tests/e2e

- [ ] 按分组-模型映射返回模型列表；同名模型不去重，同时返回分组名、优先级、渠道 ID 和价格。
- [ ] 未选择 Key 的 JWT 浏览只展示启用分组及标签，不暗示当前请求一定有权限。
- [ ] 保持 routing_model 作为请求模型名兼容现有客户端；重复名称旁显示分组和价格。
- [ ] 更新复制代码、请求示例和调试页，使其使用选定 Key 与 routing_model。
- [ ] 增加重复模型、分组标签/价格、Key 选择和请求示例的 E2E 测试。
- [ ] 运行 npm run build 和定向 Playwright 测试；提交 feat: show grouped models and prices。

### 任务 6：增加日志和流水按 API Key 筛选

**文件：**
- 修改：internal/handler/llm_log.go
- 修改：internal/handler/admin_transaction_list.go
- 如聚合查询需要则修改：internal/handler/admin_transaction_extra.go
- 修改：internal/handler/auth_billing.go
- 修改：internal/service/billing.go
- 修改：web/app/src/lib/api/user.ts、web/app/src/lib/api/admin.ts
- 修改：用户端和管理端日志/流水页面
- 测试：相关 handler/service 测试

- [ ] 管理端和用户端日志/流水查询增加可选 api_key_id；用户查询始终叠加当前 user_id。
- [ ] 管理端汇总金额和返回行使用完全相同的 Key 条件。
- [ ] 扩展 ListTransactions 和 CountTransactions，增加可选 Key ID 参数。
- [ ] 用户日志列表的查询列和响应补充 api_key_id。
- [ ] 用户端和管理端筛选栏增加 Key 选择器，保留 URL 参数，切换 Key 时重置分页。
- [ ] 测试行筛选、汇总筛选、非本人 Key 隔离和不带筛选时的兼容行为。
- [ ] 运行 Go 定向测试、npm run build、git diff --check；提交 feat: filter logs and billing by API key。

### 任务 7：完成 key_type 切换和迁移演练

**文件：**
- 修改：internal/handler/auth_api_key.go
- 修改：internal/middleware/auth.go
- 修改：internal/handler/llm.go、internal/handler/proxy.go
- 修改：web/app/src/lib/api/user.ts、web/app/src/pages/user/UserKeysPage.tsx
- 测试：API Key、路由、计费、WS 和 E2E 测试

- [ ] 删除新 Key 创建、前端展示和路由中的 key_type 分支，但暂时保留数据库字段以便回滚。
- [ ] 增加回归测试：旧的未绑定 Key 必须收到“请先绑定模型分组”，不能调用模型或显式渠道。
- [ ] 在临时 PostgreSQL 中执行迁移，启动带迁移的服务，创建分组和映射，给 Key 绑定两种顺序，验证主路由、跨组回退及日志/流水按 Key 筛选。
- [ ] 运行：go test ./... -count=1；进入 web/app 运行 npm run build；最后执行 git diff --check。
- [ ] 记录是否执行了真实 PostgreSQL 验收；不能把单元测试结果表述为生产验证。
- [ ] 提交：feat: complete model group routing cutover。

## 自检清单

- 任务 1～3 覆盖三张新表、约束、索引、后台 CRUD、Key 排序和无默认分组迁移。
- 任务 4 覆盖所有请求协议、显式渠道授权、跨组顺序回退和计费重试。
- 任务 5 覆盖重复模型展示和价格展示。
- 任务 6 覆盖用户/管理员日志和流水按 Key 筛选、汇总筛选及所有权隔离。
- 任务 7 覆盖 key_type 移除和本地 PostgreSQL 演练。
- 执行时不得把工作区中与本功能无关的已有修改加入提交。
