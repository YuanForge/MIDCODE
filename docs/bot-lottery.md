# QQ 群抽奖接口

机器人用开启抽奖权限的专用密钥调用 POST /api/v1/bot/lotteries，Authorization 使用 Bearer。主管理员登录后可通过 POST /api/admin/bot-keys 提交 {"name":"群抽奖","lottery":true} 创建该密钥。

管理员在群里发送「@机器人 创建抽奖 3 张 2 元卡密，满 20 人开奖」。机器人从可信群消息事件读取群号、发送者 QQ 和消息 ID，提交以下 JSON。主管理员在后台「机器人密钥 → 抽奖管理员 QQ」逐个添加 QQ 号即可授权多人创建活动，名单中的每个号码可单独移除；也支持已验证绑定 QQ 的在用站点管理员。

    {"action":"create","group_id":"767281836","qq":"管理员QQ","event_id":"平台消息ID","target":20,"prizes":3,"yuan_per_card":2}

保存返回的 lottery_id。一个群同时可有一个进行中的活动。重复投递创建消息时复用原 event_id。群友发送「@机器人 参与」时，机器人用该群活动 ID 和实际发送者 QQ 提交：

    {"action":"join","group_id":"767281836","qq":"发送者QQ","lottery_id":123}

每个 QQ 只计一次。未满时显示 participants / target；满员后 drawn 为 true，winners 包含互不重复的中奖 QQ，每人一张卡。机器人按活动 ID 去重群开奖公告。status 使用相同字段，供恢复活动及重新查询结果。

中奖者私聊机器人「领奖 123」。机器人从私聊事件取发送者 QQ，使用活动所属群号，将 action 改为 claim。只将 private_code 私发给该 QQ；可重复领取同一码。卡密可在站内兑换。群消息文本中自行填写的 QQ 不能用作身份。普通群成员无需绑定站点账户即可报名。

## 调用地址与返回约定

线上地址为 `https://midcode.cc/api/v1/bot/lotteries`。请求使用 `Content-Type: application/json`。群号和 QQ 均传字符串，活动 ID 传整数。机器人应持久化群号和活动 ID 的对应关系，重启后可按保存的 ID 查询。

| 字段 | 规则 |
|---|---|
| target | 开奖所需的不同 QQ 人数，1 至 100000 |
| prizes | 中奖人数，1 至 1000，且不能超过 target |
| yuan_per_card | 每张卡的整数元面值，1 至 100000 |
| event_id | 创建指令的平台消息标识，最多 128 字节。同群重试须使用相同参数 |

示例：20 人到齐后，报名和查询接口均返回同一份开奖结果。

    {"lottery_id":123,"participants":20,"target":20,"prizes":3,"yuan_per_card":2,"new_entry":true,"drawn":true,"winners":["100001","100002","100003"]}

new_entry 只在本次新增报名时为 true。重复报名和开奖后的报名都返回当前状态。领奖成功返回 {"lottery_id":123,"private_code":"中奖者的卡密"}。机器人可在开奖时按 winners 逐人取码并私发，也可让中奖者私聊领取。

| HTTP 状态 | 含义与处理 |
|---|---|
| 200 | 操作成功 |
| 400 | 参数或动作无效 |
| 401 | 专用密钥无效、已撤销或未开启抽奖权限 |
| 403 | 发起人的 QQ 未绑定有效站点管理员 |
| 404 | 当前群找不到活动，或该 QQ 没有可领的卡 |
| 409 | 群内已有进行中的活动，或创建消息 ID 的参数冲突 |
| 503 | 临时服务错误，可按原参数重试 |
