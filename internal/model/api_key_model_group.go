package model

import "time"

// APIKeyModelGroup stores the ordered model groups available to an API key.
type APIKeyModelGroup struct {
	ID        int64     `xorm:"pk autoincr 'id'" json:"id"`
	APIKeyID  int64     `xorm:"notnull index 'api_key_id'" json:"api_key_id"`
	GroupID   int64     `xorm:"notnull index 'group_id'" json:"group_id"`
	Priority  int       `xorm:"notnull 'priority'" json:"priority"`
	CreatedAt time.Time `xorm:"created 'created_at'" json:"created_at"`
	UpdatedAt time.Time `xorm:"updated 'updated_at'" json:"updated_at"`
}

func (*APIKeyModelGroup) TableName() string { return "api_key_model_groups" }
