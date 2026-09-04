package service

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"fanapi/internal/db"

	"xorm.io/xorm"
)

func TestDeleteVIPGroupPostgres(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("FANAPI_TEST_DATABASE_URL"))
	if dsn == "" {
		t.Skip("FANAPI_TEST_DATABASE_URL is not set")
	}

	adminEngine, err := xorm.NewEngine("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer adminEngine.Close()
	schema := fmt.Sprintf("vip_delete_test_%d", time.Now().UnixNano())
	if _, err := adminEngine.Exec(`CREATE SCHEMA "` + schema + `"`); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = adminEngine.Exec(`DROP SCHEMA IF EXISTS "` + schema + `" CASCADE`) })

	testDSN, err := postgresDSNWithSearchPath(dsn, schema)
	if err != nil {
		t.Fatal(err)
	}
	testEngine, err := xorm.NewEngine("postgres", testDSN)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = testEngine.Close() })
	if _, err := testEngine.Exec(`
CREATE TABLE vip_groups (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  recharge_threshold BIGINT NOT NULL DEFAULT 0,
  discount_bps BIGINT NOT NULL DEFAULT 10000,
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  "group" TEXT NOT NULL DEFAULT '',
  vip_recharge_baseline BIGINT NOT NULL DEFAULT 0
);`); err != nil {
		t.Fatal(err)
	}

	previousEngine := db.Engine
	db.Engine = testEngine
	t.Cleanup(func() { db.Engine = previousEngine })
	if _, err := testEngine.Exec(`INSERT INTO vip_groups (code, name) VALUES ('obsolete', 'Obsolete')`); err != nil {
		t.Fatal(err)
	}
	var group struct {
		ID   int64  `xorm:"id"`
		Code string `xorm:"code"`
	}
	if found, err := testEngine.SQL(`SELECT id, code FROM vip_groups WHERE code = 'obsolete'`).Get(&group); err != nil || !found {
		t.Fatalf("load group: found=%v err=%v", found, err)
	}
	if _, err := testEngine.Exec(`
INSERT INTO users (username, "group", vip_recharge_baseline) VALUES
  ('obsolete-user-1', 'obsolete', 123),
  ('obsolete-user-2', 'obsolete', 456),
  ('other-user', 'other', 789)`); err != nil {
		t.Fatal(err)
	}

	err = DeleteVIPGroup(context.Background(), group.ID, false)
	var referenced *VIPGroupUsersReferencedError
	if !errors.As(err, &referenced) || referenced.UserCount != 2 {
		t.Fatalf("unconfirmed delete error = %v, want two referenced users", err)
	}
	var countRow struct {
		Count int64 `xorm:"count"`
	}
	if _, err := testEngine.SQL(`SELECT COUNT(*) AS count FROM vip_groups WHERE id = ?`, group.ID).Get(&countRow); err != nil || countRow.Count != 1 {
		t.Fatalf("group count after rejected delete = %d, err=%v", countRow.Count, err)
	}

	if err := DeleteVIPGroup(context.Background(), group.ID, true); err != nil {
		t.Fatalf("confirmed delete: %v", err)
	}
	if _, err := testEngine.SQL(`SELECT COUNT(*) AS count FROM vip_groups WHERE id = ?`, group.ID).Get(&countRow); err != nil || countRow.Count != 0 {
		t.Fatalf("group count after confirmed delete = %d, err=%v", countRow.Count, err)
	}
	var cleared struct {
		Group    string `xorm:"group"`
		Baseline int64  `xorm:"vip_recharge_baseline"`
	}
	if found, err := testEngine.SQL(`SELECT "group", vip_recharge_baseline FROM users WHERE username = 'obsolete-user-1'`).Get(&cleared); err != nil || !found {
		t.Fatalf("load cleared user: found=%v err=%v", found, err)
	}
	if cleared.Group != "" || cleared.Baseline != 0 {
		t.Fatalf("cleared user = %+v, want empty group and zero baseline", cleared)
	}
	if _, err := testEngine.SQL(`SELECT COUNT(*) AS count FROM users WHERE "group" = 'other'`).Get(&countRow); err != nil || countRow.Count != 1 {
		t.Fatalf("unrelated user count = %d, err=%v", countRow.Count, err)
	}
}
