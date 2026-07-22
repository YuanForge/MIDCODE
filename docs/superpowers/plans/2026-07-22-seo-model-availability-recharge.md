# FanAPI SEO、模型可用性与充值套餐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为独立的 FanAPI 平台补齐可生效的 SEO，并在用户模型列表每张卡片中显示基于真实日志的模型可用性，同时用回归测试保护充值套餐链路。

**Architecture:** SEO 继续使用平台级 `system_settings`，不引入租户、站点或 `station_id`。可用性通过一次批量用户接口按可见 `routing_model` 聚合最近 7 天 `llm_logs`，前端与模型列表并行加载并将统计合并到卡片；充值套餐保持现有 `recharge_plans` 和三个支付入口不变。

**Tech Stack:** Go、Gin、XORM/PostgreSQL、React、TypeScript、现有 `useAsync` 和 Vitest/Mocha 契约测试。

---

### Task 1: 平台 SEO 设置与页面元信息

**Files:**
- Modify: `internal/handler/settings.go`
- Modify: `web/app/src/hooks/use-site-settings.ts`
- Modify: `web/app/src/pages/admin/AdminSettingsPage.tsx`
- Test: `web/app/tests/unit/site-settings-loading.test.mjs`
- Create: `internal/handler/settings_public_test.go`

- [ ] **Step 1: 写失败测试**：在新建的 `settings_public_test.go` 断言 `seo_title`、`seo_description` 属于公开设置，且前端解析结果包含两个字段；空标题回退到 `site_name`。
- [ ] **Step 2: 运行测试确认失败**：`go test ./internal/handler -run 'Settings|PublicSettings' -count=1`；`cd web/app; npm test -- --runInBand tests/unit/site-settings-loading.test.mjs`，预期缺少字段断言失败。
- [ ] **Step 3: 实现设置链路**：在 `publicSettingKeys` 增加两个键；在 `SiteSettings` 增加 `seoTitle`、`seoDescription`；设置加载完成后以 `seo_title || siteName` 更新 `document.title`，维护唯一 `meta[name=description]`，空值时移除；在平台设置页面的 SEO 区域增加输入框并随现有 `UpdateSettings` 保存。
- [ ] **Step 4: 运行测试确认通过**：重复 Step 2，预期全部通过，并检查公开响应不包含敏感设置。
- [ ] **Step 5: 提交**：`git add internal/handler/settings.go internal/handler/settings_public_test.go web/app/src/hooks/use-site-settings.ts web/app/src/pages/admin/AdminSettingsPage.tsx web/app/tests/unit/site-settings-loading.test.mjs; git commit -m "feat: add platform seo metadata"`。

### Task 2: 真实日志模型可用性后端

**Files:**
- Create: `internal/handler/model_availability.go`
- Modify: `internal/router/user.go`
- Modify: `web/app/src/lib/api/user.ts`
- Test: `internal/handler/model_availability_test.go`

- [ ] **Step 1: 写失败测试**：使用测试数据库插入两个可见模型和一个不可见模型的 `llm_logs`，验证 `GET /user/model-availability` 返回每个可见 `routing_model` 的 `total`、`success`、成功请求 P50 和最多 60 条正序记录；`pending` 不计入分母。
- [ ] **Step 2: 运行测试确认失败**：`go test ./internal/handler -run TestModelAvailability -count=1`，预期路由或 handler 不存在而失败。
- [ ] **Step 3: 实现查询与 handler**：新增 `ModelAvailability`/`RecentModelRequest` 响应类型；从当前 API Key/用户可见模型集合建立参数化 `model = ANY($1)` 条件，查询最近 7 天已结束日志，按 `model` 聚合成功数和 `PERCENTILE_CONT(0.5)`，另取每模型最近 60 条；只返回允许模型，不返回用户、Key、请求体或错误正文。
- [ ] **Step 4: 注册路由并补齐无数据/查询错误**：在 `registerUserRoutes` 增加 `user.GET("/model-availability", handler.GetModelAvailability)`；无日志返回空统计，数据库错误返回 500，不阻断 `/user/channels`。
- [ ] **Step 5: 运行测试确认通过**：`go test ./internal/handler -run TestModelAvailability -count=1`。
- [ ] **Step 6: 提交**：`git add internal/handler/model_availability.go internal/handler/model_availability_test.go internal/router/user.go web/app/src/lib/api/user.ts; git commit -m "feat: expose model availability metrics"`。

### Task 3: 模型卡片可用性 UI

**Files:**
- Modify: `web/app/src/lib/api/user.ts`
- Modify: `web/app/src/pages/user/UserModelsPage.tsx`
- Test: `web/app/tests/unit/model-availability.test.mjs`

- [ ] **Step 1: 写失败测试**：覆盖正常、降级、异常、数据较少、暂无数据、接口失败六种状态，并断言模型列表只发起一次批量统计请求。
- [ ] **Step 2: 运行测试确认失败**：`cd web/app; npm test -- --runInBand tests/unit/model-availability.test.mjs`。
- [ ] **Step 3: 实现 API 类型与并行加载**：在 `userApi` 增加 `getModelAvailability()`；`UserModelsPage` 用一个 `Promise.all` 并行请求 `listChannels()` 和统计接口，按 `routing_model` 合并，不因统计请求失败清空模型卡片。
- [ ] **Step 4: 实现 A 布局**：卡片底部增加 7 天百分比、P50、请求数、最近 60 条绿色/红色柱图；按 20/99%/95% 规则映射状态，零数据和错误显示明确文本；使用稳定高度、可访问标签和响应式网格，保证移动端不溢出。
- [ ] **Step 5: 运行测试和构建**：重复 Step 2；`cd web/app; npm run build`。
- [ ] **Step 6: 提交**：`git add web/app/src/lib/api/user.ts web/app/src/pages/user/UserModelsPage.tsx web/app/tests/unit/model-availability.test.mjs; git commit -m "feat: show model availability on cards"`。

### Task 4: 充值套餐回归保护

**Files:**
- Modify/Create: `internal/handler/payment_helpers_test.go`
- Modify/Create: existing payment handler tests under `internal/handler/*payment*_test.go`
- Test: `web/app/tests/unit/user-billing-plans.test.mjs`

- [ ] **Step 1: 写失败测试**：覆盖匹配套餐含 bonus、未匹配金额按标准汇率、三个支付创建 handler 都调用相同 `planCredits` 结果，以及前端展示套餐金额和总到账积分。
- [ ] **Step 2: 运行测试确认失败**：`go test ./internal/handler -run 'Payment|PlanCredits' -count=1`；`cd web/app; npm test -- --runInBand tests/unit/user-billing-plans.test.mjs`。
- [ ] **Step 3: 只补测试所需的最小修复**：若发现某支付入口或前端套餐解析偏离现有契约，复用 `planCredits` 和现有 settings API 修正；不得改变历史账务、余额或 `recharge_allow_custom` 语义。
- [ ] **Step 4: 运行测试确认通过**：重复 Step 2。
- [ ] **Step 5: 提交**：`git add internal/handler/*payment*_test.go internal/handler/payment_helpers_test.go web/app/tests/unit/user-billing-plans.test.mjs; git commit -m "test: protect recharge plan billing"`。

### Task 5: FanAPI 综合验证

- [ ] **Step 1: 运行后端全量测试**：`go test ./... -count=1`。
- [ ] **Step 2: 运行前端测试和构建**：`cd web/app; npm test -- --runInBand; npm run build`。
- [ ] **Step 3: 检查差异**：`git diff --check`；确认只包含批准文件，保留工作区已有 `pnpm-lock.yaml`、`UserKeysPage.tsx`、计划和测试产物。
- [ ] **Step 4: 浏览器检查**：启动隔离的前端/假数据环境，检查桌面和移动端模型卡片、SEO title/description、无数据和统计失败状态；不得连接生产数据库、Redis 或支付上游。
