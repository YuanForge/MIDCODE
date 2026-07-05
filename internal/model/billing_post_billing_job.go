package model

import "time"

// BillingPostBillingJob is a durable retry record for post-transaction money
// movements such as inviter rebates and vendor earnings.
type BillingPostBillingJob struct {
	ID         int64     `xorm:"pk autoincr 'id'" json:"id"`
	UserID     int64     `xorm:"notnull index 'user_id'" json:"user_id"`
	PoolKeyID  int64     `xorm:"notnull default(0) 'pool_key_id'" json:"pool_key_id"`
	Credits    int64     `xorm:"notnull default(0) 'credits'" json:"credits"`
	Cost       int64     `xorm:"notnull default(0) 'cost'" json:"cost"`
	RebateDone bool      `xorm:"notnull default(false) 'rebate_done'" json:"rebate_done"`
	VendorDone bool      `xorm:"notnull default(false) 'vendor_done'" json:"vendor_done"`
	Status     string    `xorm:"notnull default('pending') index 'status'" json:"status"`
	Attempts   int64     `xorm:"notnull default(0) 'attempts'" json:"attempts"`
	NextRunAt  time.Time `xorm:"notnull index 'next_run_at'" json:"next_run_at"`
	LastError  string    `xorm:"text 'last_error'" json:"last_error"`
	CreatedAt  time.Time `xorm:"created 'created_at'" json:"created_at"`
	UpdatedAt  time.Time `xorm:"updated 'updated_at'" json:"updated_at"`
}

func (*BillingPostBillingJob) TableName() string { return "billing_post_billing_jobs" }
