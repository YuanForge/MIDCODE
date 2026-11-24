package handler

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"fanapi/internal/db"
	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
)

type lotteryCommand struct {
	Action string `json:"action"`
	Group  string `json:"group_id"`
	QQ     string `json:"qq"`
	Event  string `json:"event_id"`
	ID     int64  `json:"lottery_id"`
	Target int    `json:"target"`
	Prizes int    `json:"prizes"`
	Yuan   int    `json:"yuan_per_card"`
}

func BotLottery(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	if !authorizeBotCapability(c, ctx, true) {
		return
	}
	var r lotteryCommand
	if c.ShouldBindJSON(&r) != nil || !validQQ(r.Group) || !validQQ(r.QQ) {
		c.JSON(400, gin.H{"error": "群号或发送者 QQ 无效"})
		return
	}
	switch r.Action {
	case "create":
		if r.Event == "" || len(r.Event) > 128 || r.Prizes < 1 || r.Target < r.Prizes || r.Target > 100000 || r.Prizes > 1000 || r.Yuan < 1 || r.Yuan > 100000 {
			c.JSON(400, gin.H{"error": "请检查消息 ID、开奖人数、奖品数和整数元面值"})
			return
		}
	case "join", "status", "claim":
		if r.ID <= 0 {
			c.JSON(400, gin.H{"error": "需要活动 ID"})
			return
		}
	default:
		c.JSON(400, gin.H{"error": "未知抽奖指令"})
		return
	}
	result, status, err := runLottery(ctx, r)
	if err != nil {
		c.JSON(503, gin.H{"error": "抽奖服务暂不可用，请重试"})
		return
	}
	c.JSON(status, result)
}

func runLottery(ctx context.Context, r lotteryCommand) (gin.H, int, error) {
	tx, err := db.Engine.DB().BeginTx(ctx, nil)
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback()
	if r.Action == "create" {
		var admin int64
		err = tx.QueryRowContext(ctx, `SELECT u.id FROM users u JOIN user_qq_bindings b ON b.user_id=u.id WHERE b.qq=$1 AND b.verified_at IS NOT NULL AND u.role='admin' AND u.is_active`, r.QQ).Scan(&admin)
		if errors.Is(err, sql.ErrNoRows) {
			return gin.H{"error": "仅已绑定 QQ 的站点管理员可创建活动"}, 403, nil
		}
		if err != nil {
			return nil, 0, err
		}
		err = tx.QueryRowContext(ctx, `INSERT INTO bot_lotteries(group_id,event_id,creator,target,prizes,face) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(group_id,event_id) DO UPDATE SET event_id=excluded.event_id WHERE bot_lotteries.creator=excluded.creator AND bot_lotteries.target=excluded.target AND bot_lotteries.prizes=excluded.prizes AND bot_lotteries.face=excluded.face RETURNING id`, r.Group, r.Event, admin, r.Target, r.Prizes, int64(r.Yuan)*1000000).Scan(&r.ID)
		var pe *pq.Error
		if errors.Is(err, sql.ErrNoRows) || (errors.As(err, &pe) && pe.Code == "23505") {
			return gin.H{"error": "该群已有活动或消息 ID 冲突"}, 409, nil
		}
		if err != nil {
			return nil, 0, err
		}
	}
	var drawn bool
	var target, prizes int
	var face, admin int64
	err = tx.QueryRowContext(ctx, `SELECT drawn,target,prizes,face,creator FROM bot_lotteries WHERE group_id=$1 AND id=$2 FOR UPDATE`, r.Group, r.ID).Scan(&drawn, &target, &prizes, &face, &admin)
	if errors.Is(err, sql.ErrNoRows) {
		return gin.H{"error": "活动不存在"}, 404, nil
	}
	if err != nil {
		return nil, 0, err
	}
	if r.Action == "claim" {
		var code string
		err = tx.QueryRowContext(ctx, `SELECT c.code FROM bot_lottery_entries e JOIN cards c ON c.id=e.card_id WHERE e.lottery_id=$1 AND e.qq=$2`, r.ID, r.QQ).Scan(&code)
		if errors.Is(err, sql.ErrNoRows) {
			return gin.H{"error": "当前没有可领取的奖品"}, 404, nil
		}
		if err != nil {
			return nil, 0, err
		}
		return gin.H{"lottery_id": r.ID, "private_code": code}, 200, nil
	}
	joined := false
	if r.Action == "join" && !drawn {
		res, err := tx.ExecContext(ctx, `INSERT INTO bot_lottery_entries(lottery_id,qq,ticket) VALUES($1,$2,gen_random_uuid()) ON CONFLICT DO NOTHING`, r.ID, r.QQ)
		if err != nil {
			return nil, 0, err
		}
		n, err := res.RowsAffected()
		if err != nil {
			return nil, 0, err
		}
		joined = n == 1
	}
	var count int
	err = tx.QueryRowContext(ctx, `SELECT count(*) FROM bot_lottery_entries WHERE lottery_id=$1`, r.ID).Scan(&count)
	if err != nil {
		return nil, 0, err
	}
	if !drawn && count == target {
		// Random tickets were assigned by PostgreSQL when each unique member joined.
		_, err = tx.ExecContext(ctx, `WITH winners AS MATERIALIZED (
   SELECT qq,upper(replace(gen_random_uuid()::text,'-','')) AS code FROM bot_lottery_entries WHERE lottery_id=$1 ORDER BY ticket,qq LIMIT $2
  ), issued AS (INSERT INTO cards(code,credits,status,note,created_by,created_at) SELECT code,$3,'unused','QQ抽奖 #'||$1::bigint::text,$4,now() FROM winners RETURNING id,code)
  UPDATE bot_lottery_entries e SET card_id=i.id FROM winners w JOIN issued i USING(code) WHERE e.lottery_id=$1 AND e.qq=w.qq`, r.ID, prizes, face, admin)
		if err != nil {
			return nil, 0, err
		}
		_, err = tx.ExecContext(ctx, `UPDATE bot_lotteries SET drawn=true WHERE id=$1`, r.ID)
		if err != nil {
			return nil, 0, err
		}
		drawn = true
	}
	winners := []string{}
	if drawn {
		var names pq.StringArray
		err = tx.QueryRowContext(ctx, `SELECT array_agg(qq ORDER BY qq) FROM bot_lottery_entries WHERE lottery_id=$1 AND card_id IS NOT NULL`, r.ID).Scan(&names)
		if err != nil {
			return nil, 0, err
		}
		winners = names
	}
	if err = tx.Commit(); err != nil {
		return nil, 0, err
	}
	return gin.H{"lottery_id": r.ID, "target": target, "participants": count, "prizes": prizes, "yuan_per_card": face / 1000000, "new_entry": joined, "drawn": drawn, "winners": winners}, 200, nil
}
