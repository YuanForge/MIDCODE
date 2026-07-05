package model

import "time"

// SchemaMigration records runtime schema steps that were applied by startup.
type SchemaMigration struct {
	Version     string    `xorm:"pk 'version'" json:"version"`
	Description string    `xorm:"text 'description'" json:"description"`
	AppliedAt   time.Time `xorm:"created 'applied_at'" json:"applied_at"`
}

func (*SchemaMigration) TableName() string { return "schema_migrations" }
