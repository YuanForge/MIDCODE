package model

import "time"

// ModelGroup is a user-selectable ordered catalog of channel-backed models.
type ModelGroup struct {
	ID            int64     `xorm:"pk autoincr 'id'" json:"id"`
	Code          string    `xorm:"notnull unique 'code'" json:"code"`
	Name          string    `xorm:"notnull default('') 'name'" json:"name"`
	ModelProvider string    `xorm:"notnull default('') 'model_provider'" json:"model_provider"`
	Description   string    `xorm:"text default('') 'description'" json:"description"`
	IsActive      bool      `xorm:"notnull default(true) 'is_active'" json:"is_active"`
	CreatedAt     time.Time `xorm:"created 'created_at'" json:"created_at"`
	UpdatedAt     time.Time `xorm:"updated 'updated_at'" json:"updated_at"`
}

func (*ModelGroup) TableName() string { return "model_groups" }
