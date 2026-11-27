package model

type MarketSkill struct {
	ID     int64  `xorm:"pk autoincr" json:"id"`
	UserID int64  `xorm:"index" json:"-"`
	URL    string `xorm:"varchar(1024) notnull" json:"url"`
	Status string `xorm:"index varchar(16) notnull" json:"status"`
}
