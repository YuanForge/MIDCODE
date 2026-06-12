package model

import "time"

type BillingTransaction struct {
	ID                 int64     `xorm:"pk autoincr 'id'" json:"id"`
	UserID             int64     `xorm:"notnull index 'user_id'" json:"user_id"`
	ChannelID          int64     `xorm:"'channel_id'" json:"channel_id"`
	APIKeyID           int64     `xorm:"'api_key_id'" json:"api_key_id"`
	PoolKeyID          int64     `xorm:"notnull default(0) 'pool_key_id'" json:"pool_key_id"`                   // 号池 Key ID（0 表示未使用号池）
	CorrID             string    `xorm:"'corr_id'" json:"corr_id"`                                              // 关联 hold+settle 流水对
	Type               string    `xorm:"notnull 'type'" json:"type"`                                            // 类型：charge/hold/settle/refund/recharge
	Credits            int64     `xorm:"notnull 'credits'" json:"credits"`                                      // 向用户收取的售价 credits（含通用余额+模型积分）
	ModelCreditCharged int64     `xorm:"notnull default(0) 'model_credit_charged'" json:"model_credit_charged"` // 本次消耗的专属模型积分，Credits-ModelCreditCharged 为通用余额部分
	Cost               int64     `xorm:"notnull default(0) 'cost'" json:"cost"`                                 // 支付给上游的进价 credits（成本），profit = credits - cost
	BalanceAfter       int64     `xorm:"notnull default(0) 'balance_after'" json:"balance_after"`               // 操作后用户通用余额快照
	Metrics            JSON      `xorm:"jsonb 'metrics'" json:"metrics"`
	LLMLogID           int64     `xorm:"notnull default(0) 'llm_log_id'" json:"llm_log_id"`
	TaskID             int64     `xorm:"notnull default(0) 'task_id'" json:"task_id"`
	CreatedAt          time.Time `xorm:"created 'created_at'" json:"created_at"`
}

func (*BillingTransaction) TableName() string { return "billing_transactions" }
