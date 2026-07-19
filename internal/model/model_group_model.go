package model

import "time"

// ModelGroupModel binds one public routing model to one channel in a group.
type ModelGroupModel struct {
	ID           int64     `xorm:"pk autoincr 'id'" json:"id"`
	GroupID      int64     `xorm:"notnull index 'group_id'" json:"group_id"`
	RoutingModel string    `xorm:"notnull 'routing_model'" json:"routing_model"`
	ChannelID    int64     `xorm:"notnull index 'channel_id'" json:"channel_id"`
	CreatedAt    time.Time `xorm:"created 'created_at'" json:"created_at"`
	UpdatedAt    time.Time `xorm:"updated 'updated_at'" json:"updated_at"`
}

func (*ModelGroupModel) TableName() string { return "model_group_models" }
