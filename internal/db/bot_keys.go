package db

const botKeySchema = `CREATE TABLE IF NOT EXISTS bot_api_keys (
 id bigserial PRIMARY KEY,
 name varchar(64) NOT NULL,
 key_hash char(64) NOT NULL UNIQUE,
 is_active boolean NOT NULL DEFAULT true,
 created_by bigint NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
)`

func EnsureBotKeyTable() error {
	_, err := Engine.Exec(botKeySchema + `;
 ALTER TABLE bot_api_keys ADD COLUMN IF NOT EXISTS lottery boolean NOT NULL DEFAULT false;
 CREATE TABLE IF NOT EXISTS bot_lottery_admins (user_id bigint PRIMARY KEY REFERENCES users(id), qq text NOT NULL UNIQUE);
 CREATE TABLE IF NOT EXISTS bot_lottery_admin_members (user_id bigint NOT NULL REFERENCES users(id), qq text NOT NULL, PRIMARY KEY(user_id,qq));
 CREATE TABLE IF NOT EXISTS bot_lotteries (
 id bigserial PRIMARY KEY, group_id text NOT NULL, event_id text NOT NULL, creator bigint NOT NULL REFERENCES users(id),
 target integer NOT NULL CHECK(target>0), prizes integer NOT NULL CHECK(prizes BETWEEN 1 AND target),
 face bigint NOT NULL CHECK(face>0), drawn boolean NOT NULL DEFAULT false, UNIQUE(group_id,event_id));
 CREATE UNIQUE INDEX IF NOT EXISTS bot_one_open_lottery ON bot_lotteries(group_id) WHERE NOT drawn;
 CREATE TABLE IF NOT EXISTS bot_lottery_entries (
 lottery_id bigint REFERENCES bot_lotteries(id), qq text NOT NULL, ticket uuid NOT NULL,
 card_id bigint UNIQUE REFERENCES cards(id), PRIMARY KEY(lottery_id,qq));`)
	return err
}
