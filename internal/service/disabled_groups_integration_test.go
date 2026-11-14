package service

import (
	"context"
	"fanapi/internal/db"
	"fanapi/internal/model"
	"fmt"
	"os"
	"testing"
	"time"
	"xorm.io/xorm"
)

func TestDisabledGroupsPostgres(t *testing.T) {
	dsn := os.Getenv("FANAPI_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("FANAPI_TEST_DATABASE_URL is not set")
	}
	admin, err := xorm.NewEngine("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	schema := fmt.Sprintf("group_unbind_test_%d", time.Now().UnixNano())
	if _, err = admin.Exec(`CREATE SCHEMA "` + schema + `"`); err != nil {
		t.Fatal(err)
	}
	defer admin.Exec(`DROP SCHEMA "` + schema + `" CASCADE`)
	testDSN, err := postgresDSNWithSearchPath(dsn, schema)
	if err != nil {
		t.Fatal(err)
	}
	engine, err := xorm.NewEngine("postgres", testDSN)
	if err != nil {
		t.Fatal(err)
	}
	defer engine.Close()
	engine.SetSchema(schema)
	old := db.Engine
	db.Engine = engine
	defer func() { db.Engine = old }()
	if err = engine.Sync2(new(model.ModelProvider), new(model.ModelGroup), new(model.ModelGroupModel), new(model.Channel), new(model.APIKey), new(model.APIKeyModelGroup)); err != nil {
		t.Fatal(err)
	}
	provider := model.ModelProvider{Code: "test", Name: "test", IsActive: true}
	if _, err = engine.Insert(&provider); err != nil {
		t.Fatal(err)
	}
	groups := []model.ModelGroup{{Code: "first", Name: "first", ModelProviderID: provider.ID, IsActive: true}, {Code: "second", Name: "second", ModelProviderID: provider.ID, IsActive: true}}
	for i := range groups {
		if _, err = engine.Insert(&groups[i]); err != nil {
			t.Fatal(err)
		}
	}
	key := model.APIKey{UserID: 1, KeyHash: "isolated-test", Name: "test", IsActive: true}
	if _, err = engine.Insert(&key); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	ids := []int64{groups[0].ID, groups[1].ID}
	if err = ReplaceAPIKeyModelGroups(ctx, 1, key.ID, ids); err != nil {
		t.Fatal(err)
	}
	if err = ToggleModelGroup(ctx, groups[0].ID, false); err != nil {
		t.Fatal(err)
	}
	check := func(want int64) {
		t.Helper()
		n, e := engine.Where("api_key_id = ?", key.ID).Count(new(model.APIKeyModelGroup))
		if e != nil || n != want {
			t.Fatalf("bindings=%d want=%d err=%v", n, want, e)
		}
	}
	check(1)
	// Stale editor retains disabled ID; the valid selection must still save.
	if err = ReplaceAPIKeyModelGroups(ctx, 1, key.ID, ids); err != nil {
		t.Fatal(err)
	}
	check(1)
	if err = ToggleModelGroup(ctx, groups[0].ID, true); err != nil {
		t.Fatal(err)
	}
	check(1)
	groups[1].IsActive = false
	if err = UpdateModelGroup(ctx, &groups[1]); err != nil {
		t.Fatal(err)
	}
	check(0)
	if err = ReplaceAPIKeyModelGroups(ctx, 1, key.ID, []int64{groups[1].ID}); err == nil {
		t.Fatal("all-disabled selection accepted")
	}
	check(0)
	if err = ToggleModelGroup(ctx, groups[1].ID, true); err != nil {
		t.Fatal(err)
	}
	check(0)
}
