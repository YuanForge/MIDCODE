package model

import (
	"database/sql/driver"
	"fmt"
	"time"
)

// RawJSON 是一个透传类型，可以存储任意 JSON（对象或数组），
// 数据库中存为 text/jsonb，JSON 序列化时原样透传。
type RawJSON []byte

func (r RawJSON) Value() (driver.Value, error) {
	if len(r) == 0 {
		return "null", nil
	}
	return string(r), nil
}

func (r *RawJSON) Scan(src interface{}) error {
	switch v := src.(type) {
	case []byte:
		*r = append((*r)[:0], v...)
	case string:
		*r = []byte(v)
	case nil:
		*r = nil
	default:
		return fmt.Errorf("RawJSON.Scan: unsupported type %T", src)
	}
	return nil
}

func (r RawJSON) MarshalJSON() ([]byte, error) {
	if len(r) == 0 {
		return []byte("null"), nil
	}
	return r, nil
}

func (r *RawJSON) UnmarshalJSON(data []byte) error {
	*r = append((*r)[:0], data...)
	return nil
}

// ChatConversation 存储用户在 Playground 中的对话历史。
type ChatConversation struct {
	ID        int64     `xorm:"pk autoincr 'id'" json:"id"`
	UserID    int64     `xorm:"notnull index 'user_id'" json:"user_id"`
	Title     string    `xorm:"notnull default('') 'title'" json:"title"`
	Model     string    `xorm:"notnull default('') 'model'" json:"model"`
	Messages  RawJSON   `xorm:"text 'messages'" json:"messages"` // []Message
	CreatedAt time.Time `xorm:"created 'created_at'" json:"created_at"`
	UpdatedAt time.Time `xorm:"updated 'updated_at'" json:"updated_at"`
}

func (*ChatConversation) TableName() string { return "chat_conversations" }
