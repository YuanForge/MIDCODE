# FanAPI 旧功能清理设计

## 目标

FanAPI 不再承担代理商、代理站或复制部署能力。多租户与站点能力统一由 OctoAPI 的租户架构提供，因此从 FanAPI 完整删除 reseller 运行时代码和用户界面，避免两套站点模型继续并存。

同时删除已经失去后端实现的 OCPC 推广前端，以及已下线 agent 客服门户留下的孤立代码。清理必须精准限定旧功能，不影响仍在使用的邀请返佣、平台微信客服联系方式、提现客服初审、AI Agent 文案或 HTTP `User-Agent` 处理。

## 采用方案

采用编译期完整移除，不保留功能开关、兼容接口或返回 `410 Gone` 的占位实现。OCPC 和 agent 残留没有可用后端，不增加替代实现。

未采用的方案：

- 仅关闭 `reseller_builder.auto_build`：仍保留旧模型、路由和维护成本。
- 隐藏前端但保留后端接口：旧能力仍可被直接调用。
- 保留兼容接口：仍属于需要维护的旧代码，不符合清理目标。
- 按 `agent` 或“客服”关键词批量删除：会误伤邀请返佣、提现审核、AI Agent 和 HTTP 协议代码。

## 后端范围

- 删除 reseller model、service、handler、middleware 和 router 文件。
- 删除管理员 reseller 管理接口、代理商认证与门户接口，以及 `/reseller/platform/channels` 桥接接口。
- 从应用依赖和路由注册中移除 Reseller handler。
- 从 `db.Sync2` 中移除 `resellers`、`reseller_sites`、`reseller_site_build_jobs`、`reseller_site_key_bindings`。
- 删除仅供旧模块使用的 `ResellerBuilderConfig`、`PlatformAPIConfig`、`app.mode=reseller_site` 特殊配置与校验。
- 删除 reseller 登录专用限流规则。

## OCPC 范围

- 删除管理端 OCPC 页面、路由、导航、权限映射、API 类型与方法。
- 删除 OCPC 相关国际化文案和 E2E Mock/断言。
- 删除失去运行时消费者的 OCPC 手工 SQL，并清理 README、部署文档中的旧说明。
- 当前代码没有 OCPC 后端路由、服务或模型，不新增兼容实现。

## 旧 Agent 客服范围

- 删除未被任何页面引用的 `web/app/src/lib/api/agent.ts`。
- 从用户模型中移除旧客服个人二维码 `wechat_qr` 字段。
- 删除注册和登录响应中的邀请人客服二维码查询及 `inviter_wechat_qr` 返回值。
- 将混合了邀请系统与旧客服字段的手工 SQL 改为只保留仍在使用的邀请和微信登录字段，并更新对应文档名称。
- 删除 README、部署文档和旧需求文档中的 agent 门户、客服登录入口和代理站描述。

以下能力明确保留：

- `invite_code`、`inviter_id`、邀请返佣和冻结返佣余额。
- `wechat_openid` 微信身份字段。
- 平台设置 `wechat_cs_url` 以及前台统一微信客服按钮。
- `support` 管理角色、提现客服初审和财务复审流程。
- AI Agent 产品文案、HTTP `User-Agent` 请求头及依赖包中的 agent 名称。

## 前端范围

- 删除代理商登录、工作台、API Key、代理站页面及 `ResellerLayout`。
- 删除 reseller API 客户端、类型、token 存储和未授权跳转逻辑。
- 删除管理员代理商管理页面、导航入口和 API 方法。
- 从共享布局、上传工具和路由守卫的角色类型中删除 `reseller`。

## 文档范围

- 删除专门描述旧代理站实现的需求与方案文档。
- 更新当前产品设计说明、README 和部署文档，不再把 reseller、旧 agent 门户或 OCPC 列为支持的应用上下文。
- 保留其他历史实施记录，不进行与本次清理无关的重写。

## 数据库处理

应用不会执行 `DROP TABLE` 或 `DROP COLUMN`，避免在旧生产数据库上产生不可逆删除。新数据库不再由 `Sync2` 创建四张 reseller 旧表，也不会创建旧 `wechat_qr` 字段；从旧库导出时完整排除 reseller 表及实际存在的 OCPC 旧表，而不只是排除表数据。

如果迁移前发现任一旧表存在业务数据，迁移流程必须停止并单独确认，不把其数据混入新库。

## 验证

- 先添加路由回归测试，证明 reseller 路由在当前代码中存在并在清理后消失。
- 运行 `go test ./... -count=1`。
- 运行前端 TypeScript 构建和生产构建。
- 运行相关 Playwright E2E，确认管理员导航与路由不再暴露 OCPC 和 reseller 页面。
- 扫描运行时代码，确保不再存在 `reseller`、`ResellerBuilder`、`PlatformAPI`、`reseller_site`、OCPC 页面/API、agent API 客户端或 `inviter_wechat_qr` 引用。
- 单独确认保留项仍存在，避免关键词清理误伤邀请返佣、平台客服和提现审核。
- 检查 Git 变更，只包含本次清理文件，并保留现有未跟踪目录和用户改动。
