package db

const qqBindingSchema = `CREATE TABLE IF NOT EXISTS user_qq_bindings (
 user_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 qq varchar(20) NOT NULL UNIQUE CHECK (qq ~ '^[1-9][0-9]{4,19}$'),
 updated_at timestamptz NOT NULL DEFAULT now()
)`

func EnsureQQBindingTable() error { _, err := Engine.Exec(qqBindingSchema); return err }
