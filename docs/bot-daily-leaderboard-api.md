# 机器人每日消费排行榜

接口：`GET https://midcode.cc/api/v1/bot/leaderboard/daily`

沿用现有机器人专用密钥，无需重新创建。支持 `Authorization: Bearer bot_...` 或 `X-API-Key`。普通 API Key、登录 JWT、无效或撤销的机器人密钥不能访问。不要把专用密钥放到前端或群消息中。

## 查询

```http
GET /api/v1/bot/leaderboard/daily
Authorization: Bearer <机器人专用密钥>
```

不传 `date` 默认北京时间今天；指定某天使用 `?date=2026-11-16`。日期必须为 `YYYY-MM-DD`，不能晚于北京时间今天。每次固定返回最多十人；当天无正消费返回 `items: []`，不会用零消费用户补齐。

示例（虚构数据）：

```json
{
  "date": "2026-11-16",
  "timezone": "Asia/Shanghai",
  "currency": "CNY",
  "start_at": "2026-11-16T00:00:00+08:00",
  "end_at": "2026-11-17T00:00:00+08:00",
  "as_of": "2026-11-17T09:00:00Z",
  "is_partial": false,
  "accounting_basis": "ledger_created_at_net_spend",
  "limit": 10,
  "count": 1,
  "items": [
    {"rank": 1, "user_id": 123, "username": "example", "qq": "123456789", "consumed_cny": "145.561700"}
  ]
}
```

`consumed_cny` 为六位小数字符串，避免浮点误差。`rank` 从 1 开始；金额相同按用户 ID 升序排列。QQ 只返回已通过机器人确认且属于指定绑定群配置的映射，未绑定/待确认返回 `null`。用户名为空时机器人可显示“用户 #ID”。不返回邮箱字段；用户自己以邮箱作为用户名的情况不改写。

## 消费口径

与后台今日 Top 10 榜单一致，按账单记录的北京时间自然日 `[00:00,次日00:00)` 计算：`charge + hold + settle - refund`，包括通用和模型专属积分消费；充值、人工调账、转赠不计入。只返回净消费大于零且用户记录仍存在的账号，不限定是否绑定 QQ，也不排除已停用账号当天已有的消费。

跨天退款计入退款发生日。这与个人 `financial-summary` 按原请求归属日期汇总的口径不同，因此不能保证榜单数值总与该接口的昨日消费相同。今天 `is_partial: true` 表示当天未结束；查询结果实时计算，迟到的账单可能更新历史结果。`as_of` 为请求开始时间，不是不可变结算快照。

HTTP 状态：200 成功（包括空榜）；400 日期错误；401 无效凭据；503 认证或统计暂不可用。响应 `Cache-Control: no-store`。

机器人可将 `@机器人 今日排行` 映射为默认查询，将昨日换算成北京时间日期后传 `date`。群号限制和消息命令识别仍由机器人负责；本次仅提供服务端接口。


## 发布与验证记录（2026-11-17 17:48，北京时间）

- 源码提交：`a1317486b1dcbb4327c4525b9e19fd2d356682af`。已推送版本标签 `v1.0.102` 指向构建清单提交 `de0208bc731279b9f226218cc7dfdcf5cf95e7b4`；后续仅补充发布记录，不移动标签。
- 从干净、已推送的 main 构建 Linux 后端，二进制 SHA256 为 `6b857b4e9f79b8733442473ac2da568fcce38add65b3b60758dfa005eafc9acc`。前端沿用 v1.0.101，保留 CC Switch、固定高度分组等恢复功能，完整追溯见 `deploy/bot-leaderboard-20261117/build.json`。
- 新容器 `midcode-leaderboard-v10102-api-1`，镜像 `fanapi-api:leaderboard-v1.0.102`，端口 8165，健康、重启次数 0。Caddy、8154 兼容入口及 midcode-main 别名已切换。旧容器 `midcode-frontend-v10101-api-1` 经依赖检查、连接排空后删除，无数据卷删除。
- Go 应用测试 `go test ./cmd/... ./internal/... ./pkg/...` 通过。真实 PostgreSQL 临时表测试验证 Top 10、并列、午夜边界、退款、充值/调账排除、零/负消费排除、已删除账号及 QQ 过滤；测试事务回滚，没有写真实消费流水。
- 候选及上线后排行榜与昨日真实账单逐条读取、Python 独立汇总排序结果一致；空日期、非法/未来日期、普通密钥/JWT拒绝、专用密钥撤销验证通过。临时机器人密钥已撤销，结果记录不包含用户名/QQ/密钥。
- EXPLAIN ANALYZE 确认账单日期过滤使用现有 `idx_billing_tx_created_id`，当天约 117332 条匹配账单样本耗时 130.624ms，无需新索引或新表。候选 HTTP 查询 0.133s、上线首次 0.209s、清理后 0.119s；这些是单次样本，不是负载测试保证。
- QQ 确认/改绑/解绑、原余额消费接口、主站统计、验证码、图片/视频/预览工作台会话与视频跨用户隔离通过。旧容器删除后重复排行榜和工作台验证通过。公网无凭据请求返回 401。160 次切换 HTTP 采样均为 200。
- 回退镜像 `fanapi-api:leaderboard-v10102-baseline` 和私有配置保留于 `/root/fanapi-leaderboard-v1.0.102`；回退命令 `python3 /root/fanapi-leaderboard-v1.0.102/deploy.py rollback`，随后验证主站及工作台。
- 未执行真实 QQ 群命令、付费生成、实际用户密码登录或邮箱发信。机器人命令映射需要机器人侧调用本接口。

安全验证结果：`deploy/bot-leaderboard-20261117/results/`。main 与发布分支同步，最终工作区保持干净。
