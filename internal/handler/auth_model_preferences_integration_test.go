package handler

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"fanapi/internal/db"
	"fanapi/internal/model"

	"xorm.io/xorm"
)

// This test creates and removes an isolated schema, never touching application tables.
func TestModelPreferencesPostgres(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("FANAPI_TEST_DATABASE_URL"))
	if dsn == "" {
		t.Skip("FANAPI_TEST_DATABASE_URL is not set")
	}
	admin, err := xorm.NewEngine("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	schema := fmt.Sprintf("model_preferences_test_%d", time.Now().UnixNano())
	if _, err := admin.Exec(`CREATE SCHEMA "` + schema + `"`); err != nil {
		t.Fatal(err)
	}
	defer admin.Exec(`DROP SCHEMA "` + schema + `" CASCADE`)
	if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
		u, err := url.Parse(dsn)
		if err != nil {
			t.Fatal(err)
		}
		q := u.Query()
		q.Set("search_path", schema)
		u.RawQuery = q.Encode()
		dsn = u.String()
	} else {
		dsn += " search_path=" + schema
	}
	engine, err := xorm.NewEngine("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer engine.Close()
	engine.SetSchema(schema)
	previous := db.Engine
	db.Engine = engine
	defer func() { db.Engine = previous }()
	if err := engine.Sync2(new(model.UserModelPreference)); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`CREATE TABLE model_groups (id bigint PRIMARY KEY, is_active boolean)`,
		`CREATE TABLE model_providers (id bigint PRIMARY KEY, is_active boolean)`,
		`CREATE TABLE channels (id bigint PRIMARY KEY, model_provider_id bigint, is_active boolean)`,
		`CREATE TABLE model_group_models (group_id bigint, channel_id bigint, routing_model text)`,
		`INSERT INTO model_groups VALUES (1, true)`,
		`INSERT INTO model_providers VALUES (1, true)`,
		`INSERT INTO channels VALUES (1, 1, true)`,
		`INSERT INTO model_group_models VALUES (1, 1, 'model-a')`,
	} {
		if _, err := engine.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
	h := &AuthHandler{}
	patch := func(userID int64, body string) {
		t.Helper()
		w := preferenceTestRequest(userID, 0, body, h.UpdateModelPreference)
		if w.Code != http.StatusOK {
			t.Errorf("PATCH user %d = %d %s", userID, w.Code, w.Body.String())
		}
	}
	patch(7, `{"routing_model":"model-a","pinned":true}`)
	patch(7, `{"routing_model":"model-a","favorite":true}`)
	patch(7, `{"routing_model":"model-a","favorite":false}`)
	patch(8, `{"routing_model":"model-a","favorite":true}`)
	for _, tc := range []struct {
		userID   int64
		pinned   bool
		favorite bool
	}{{7, true, false}, {8, false, true}} {
		var got model.UserModelPreference
		found, err := engine.Where("user_id = ? AND routing_model = ?", tc.userID, "model-a").Get(&got)
		if err != nil || !found || got.Pinned != tc.pinned || got.Favorite != tc.favorite {
			t.Fatalf("user %d preferences = %+v found=%t error=%v", tc.userID, got, found, err)
		}
	}
	// Distinct fields set concurrently must both survive, including when the row
	// does not exist and both requests race to insert it.
	var wg sync.WaitGroup
	for _, body := range []string{`{"routing_model":"model-a","pinned":true}`, `{"routing_model":"model-a","favorite":true}`} {
		wg.Add(1)
		go func(body string) {
			defer wg.Done()
			patch(9, body)
		}(body)
	}
	wg.Wait()
	var concurrent model.UserModelPreference
	if found, err := engine.Where("user_id = ?", int64(9)).Get(&concurrent); err != nil || !found || !concurrent.Pinned || !concurrent.Favorite {
		t.Fatalf("concurrent update lost a preference: %+v found=%t error=%v", concurrent, found, err)
	}
	count, err := engine.Where("user_id = ?", int64(9)).Count(new(model.UserModelPreference))
	if err != nil || count != 1 {
		t.Fatalf("concurrent upsert created duplicate rows: count=%d error=%v", count, err)
	}
	w := preferenceTestRequest(10, 0, "", h.ListModelPreferences)
	if w.Code != http.StatusOK || w.Body.String() != `{"preferences":[]}` {
		t.Fatalf("new user can see another user's preferences: %d %s", w.Code, w.Body.String())
	}
}
