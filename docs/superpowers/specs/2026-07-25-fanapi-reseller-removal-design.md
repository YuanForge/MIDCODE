# FanAPI 代理商模块移除设计

## 目标

FanAPI 不再承担代理商、代理站或复制部署能力。多租户与站点能力统一由 OctoAPI 的租户架构提供，因此从 FanAPI 完整删除 reseller 运行时代码和用户界面，避免两套站点模型继续并存。

## 采用方案

采用编译期完整移除，不保留功能开关、兼容接口或返回 `410 Gone` 的占位实现。

未采用的方案：

- 仅关闭 `reseller_builder.auto_build`：仍保留旧模型、路由和维护成本。
- 隐藏前端但保留后端接口：旧能力仍可被直接调用。
- 保留兼容接口：仍属于需要维护的旧代码，不符合清理目标。

## 后端范围

- 删除 reseller model、service、handler、middleware 和 router 文件。
- 删除管理员 reseller 管理接口、代理商认证与门户接口，以及 `/reseller/platform/channels` 桥接接口。
- 从应用依赖和路由注册中移除 Reseller handler。
- 从 `db.Sync2` 中移除 `resellers`、`reseller_sites`、`reseller_site_build_jobs`、`reseller_site_key_bindings`。
- 删除仅供旧模块使用的 `ResellerBuilderConfig`、`PlatformAPIConfig`、`app.mode=reseller_site` 特殊配置与校验。
- 删除 reseller 登录专用限流规则。

## 前端范围

- 删除代理商登录、工作台、API Key、代理站页面及 `ResellerLayout`。
- 删除 reseller API 客户端、类型、token 存储和未授权跳转逻辑。
- 删除管理员代理商管理页面、导航入口和 API 方法。
- 从共享布局、上传工具和路由守卫的角色类型中删除 `reseller`。

## 文档范围

- 删除专门描述旧代理站实现的需求与方案文档。
- 更新当前产品设计说明，不再把 reseller 列为支持的应用上下文。
- 保留其他历史实施记录，不进行与本次清理无关的重写。

## 数据库处理

应用不会执行 `DROP TABLE`，避免在旧生产数据库上产生不可逆删除。新数据库不再由 `Sync2` 创建四张旧表；从旧库导出时完整排除这些表，而不只是排除表数据。

如果迁移前发现任一旧表存在业务数据，迁移流程必须停止并单独确认，不把其数据混入新库。

## 验证

- 先添加路由回归测试，证明 reseller 路由在当前代码中存在并在清理后消失。
- 运行 `go test ./... -count=1`。
- 运行前端 TypeScript 构建和生产构建。
- 扫描运行时代码，确保不再存在 `reseller`、`ResellerBuilder`、`PlatformAPI` 或 `reseller_site` 引用。
- 检查 Git 变更，只包含本次清理文件，并保留现有未跟踪目录和用户改动。
