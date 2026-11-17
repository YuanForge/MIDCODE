package db

const botKeySchema = `CREATE TABLE IF NOT EXISTS bot_api_keys (
 id bigserial PRIMARY KEY,
 name varchar(64) NOT NULL,
 key_hash char(64) NOT NULL UNIQUE,
 is_active boolean NOT NULL DEFAULT true,
 created_by bigint NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
)`

func EnsureBotKeyTable() error { _, err := Engine.Exec(botKeySchema); return err }
