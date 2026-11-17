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
