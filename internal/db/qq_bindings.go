package db

const qqBindingSchema = `CREATE TABLE IF NOT EXISTS user_qq_bindings (
 user_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 qq varchar(20) NOT NULL UNIQUE CHECK (qq ~ '^[1-9][0-9]{4,19}$'),
 updated_at timestamptz NOT NULL DEFAULT now()
)`

func EnsureQQBindingTable() error {
	if _, err := Engine.Exec(qqBindingSchema); err != nil {
		return err
	}
	_, err := Engine.Exec(`ALTER TABLE user_qq_bindings ADD COLUMN IF NOT EXISTS verified_at timestamptz, ADD COLUMN IF NOT EXISTS verified_group_id varchar(20)`)
	return err
}
