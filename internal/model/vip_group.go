package model

import "time"

// VIPGroup defines an automatic pricing group granted by cumulative recharge.
// Code is written into users.group when a user reaches the threshold.
type VIPGroup struct {
	ID                int64     `xorm:"pk autoincr 'id'" json:"id"`
	Code              string    `xorm:"notnull unique 'code'" json:"code"`
	Name              string    `xorm:"notnull default('') 'name'" json:"name"`
	RechargeThreshold int64     `xorm:"notnull default(0) 'recharge_threshold'" json:"recharge_threshold"`
	DiscountBps       int64     `xorm:"notnull default(10000) 'discount_bps'" json:"discount_bps"`
	SortOrder         int       `xorm:"notnull default(0) 'sort_order'" json:"sort_order"`
	Description       string    `xorm:"text default('') 'description'" json:"description"`
	IsActive          bool      `xorm:"notnull default(true) 'is_active'" json:"is_active"`
	CreatedAt         time.Time `xorm:"created 'created_at'" json:"created_at"`
	UpdatedAt         time.Time `xorm:"updated 'updated_at'" json:"updated_at"`
}

func (*VIPGroup) TableName() string { return "vip_groups" }
