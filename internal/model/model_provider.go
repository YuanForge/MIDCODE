package model

import "time"

// ModelProvider owns model groups and channels for routing and administration.
type ModelProvider struct {
	ID        int64     `xorm:"pk autoincr 'id'" json:"id"`
	Code      string    `xorm:"notnull 'code'" json:"code"`
	Name      string    `xorm:"notnull 'name'" json:"name"`
	IsActive  bool      `xorm:"notnull default(true) 'is_active'" json:"is_active"`
	SortOrder int       `xorm:"notnull default(0) 'sort_order'" json:"sort_order"`
	CreatedAt time.Time `xorm:"created 'created_at'" json:"created_at"`
	UpdatedAt time.Time `xorm:"updated 'updated_at'" json:"updated_at"`
}

func (*ModelProvider) TableName() string { return "model_providers" }
