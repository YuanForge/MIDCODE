# Caddy 直连迁移记录 — 2026-11-05

## 结果

新服务器 `103.145.190.198` 已将公网入口从 `Caddy → migration-router(OpenResty) → 服务` 切换为 `Caddy → 服务`。Caddy 继续监听 80/443，`migration-router` 已在确认 8080 无活动连接后停止并删除；其 `1panel/openresty:1.21.4.3-3-3-focal` 镜像保留，供回退核对。

## 路由

- `midcode.cc` 主站及 `/v1/*`、`/api/*` → `127.0.0.1:8151`
- `/studio-preview/*` → `127.0.0.1:8198`
- `image.midcode.cc` 视频网关 → `127.0.0.1:8183`
- `image.midcode.cc` 图片服务 → `127.0.0.1:8798`
- `octoapi.xyz` 及相关站点 → `127.0.0.1:8091`
- `/api-mart/*` 与 `/pangyu/*` 保留 HTTPS 外部转发

原 OpenResty 中的统一工作台入口、视频入口、请求体大小、长连接和超时设置已迁移到 Caddy；静态入口文件保存在 `/srv/fanapi-edge-v1.0.81`。

## 验证

候选 Caddy 在回环端口完成 54 条主站、图片、视频和 OctoAPI 路由对比检查，并通过 `caddy validate`。正式切换后：

- `midcode.cc/api/public/settings` 连续 20 次 HTTP 200
- `image.midcode.cc/health` 连续 20 次 HTTP 200
- `image.midcode.cc/video/` 连续 20 次 HTTP 200
- `octoapi.xyz/` HTTP 200
- `/v1/responses` 未带认证时返回 401，响应头只保留 Caddy 与后端 nginx，不再出现 OpenResty
- FanAPI 容器 `midcode-sol61-v1076-api-1` healthy，重启次数为 0
- 图片和视频服务容器保持运行

## 502 证据

切换前 OpenResty 日志记录了 `127.0.0.1:8151` 的 `connection refused` 和 `connection reset by peer`，所以原始 502 是入口到 FanAPI 后端的连接异常。切换后 Caddy 日志仍可能记录客户端主动断开造成的 `broken pipe`，这类日志不等于入口代理故障；后端容器和接口需继续按业务请求观察。

## 回退

切换前配置保存在服务器：

- `/root/fanapi-caddy-v1.0.81/Caddyfile.live-before`
- `/root/fanapi-caddy-v1.0.81/Caddyfile.before`
- `/root/fanapi-caddy-v1.0.81/nginx.before`

回退时恢复 `/etc/caddy/Caddyfile` 后执行 `caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy`。旧 OpenResty 镜像仍保留，但容器已删除；若需要回退，按保存的 `router-inspect.json` 重建容器。
