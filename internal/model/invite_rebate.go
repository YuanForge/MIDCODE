package model

import "time"

// InviteRebate keeps the source of consumed funds and the net reward per request.
// Pending holds never become withdrawable rewards.
type InviteRebate struct {
	ID              int64     `xorm:"pk autoincr 'id'"`
	UserID          int64     `xorm:"notnull unique(request) 'user_id'"`
	CorrID          string    `xorm:"notnull unique(request) 'corr_id'"`
	InviterID       int64     `xorm:"notnull default(0) 'inviter_id'"`
	Ratio           float64   `xorm:"notnull default(0) 'ratio'"`
	GeneralCredits  int64     `xorm:"notnull default(0) 'general_credits'"`
	RewardCredits   int64     `xorm:"notnull default(0) 'reward_credits'"`
	EligibleCredits int64     `xorm:"notnull default(0) 'eligible_credits'"`
	PaidCredits     int64     `xorm:"notnull default(0) 'paid_credits'"`
	Pending         bool      `xorm:"notnull default(true) index 'pending'"`
	CreatedAt       time.Time `xorm:"created 'created_at'"`
	UpdatedAt       time.Time `xorm:"updated 'updated_at'"`
}

func (*InviteRebate) TableName() string { return "invite_rebates" }
