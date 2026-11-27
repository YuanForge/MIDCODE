package model

type MarketSkill struct {
	ID     int64  `xorm:"'id' pk autoincr" json:"id"`
	UserID int64  `xorm:"'user_id' index" json:"-"`
	URL    string `xorm:"'url' varchar(1024) notnull" json:"url"`
	Status string `xorm:"index varchar(16) notnull" json:"status"`
}
