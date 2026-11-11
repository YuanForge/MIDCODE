package model

import "time"

// UserModelPreference follows the public routing model, independent of its channels.
type UserModelPreference struct {
	ID           int64     `xorm:"pk autoincr 'id'" json:"-"`
	UserID       int64     `xorm:"notnull unique(user_model) 'user_id'" json:"-"`
	RoutingModel string    `xorm:"varchar(512) notnull unique(user_model) 'routing_model'" json:"routing_model"`
	Pinned       bool      `xorm:"notnull default(false) 'pinned'" json:"pinned"`
	Favorite     bool      `xorm:"notnull default(false) 'favorite'" json:"favorite"`
	CreatedAt    time.Time `xorm:"created 'created_at'" json:"-"`
	UpdatedAt    time.Time `xorm:"updated 'updated_at'" json:"-"`
}

func (*UserModelPreference) TableName() string { return "user_model_preferences" }
