package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"fanapi/internal/db"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"xorm.io/xorm"
	"xorm.io/xorm/core"
)

func preferenceTestRequest(userID, apiKeyID int64, body string, handler gin.HandlerFunc) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPatch, "/user/model-preferences", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", userID)
	c.Set("api_key_id", apiKeyID)
	handler(c)
	return w
}

func preferenceTestDB(t *testing.T) sqlmock.Sqlmock {
	t.Helper()
	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	engine, err := xorm.NewEngineWithDB("postgres", "host=localhost dbname=unit_test sslmode=disable", core.FromDB(sqlDB))
	if err != nil {
		t.Fatal(err)
	}
	previous := db.Engine
	db.Engine = engine
	t.Cleanup(func() {
		db.Engine = previous
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Error(err)
		}
		engine.Close()
	})
	return mock
}

func TestModelPreferencesRequireAuthentication(t *testing.T) {
	h := &AuthHandler{}
	for _, handler := range []gin.HandlerFunc{h.ListModelPreferences, h.UpdateModelPreference} {
		if w := preferenceTestRequest(0, 0, `{"routing_model":"model-a","favorite":true}`, handler); w.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", w.Code)
		}
	}
}

func TestModelPreferencesRejectInvalidRequests(t *testing.T) {
	h := &AuthHandler{}
	for _, body := range []string{
		`{}`, `null`, `{"routing_model":"model-a"}`,
		`{"routing_model":"model-a","favorite":null}`,
		`{"routing_model":"model-a","favorite":"true"}`,
		`{"routing_model":"model-a","favorite":true,"user_id":99}`,
		`{"routing_model":"model-a","favorite":true} {}`,
		`{"routing_model":"  ","pinned":true}`,
		`{"routing_model":"model\na","pinned":true}`,
		`{"routing_model":"` + strings.Repeat("x", 513) + `","pinned":true}`,
		`{"routing_model":"` + strings.Repeat("x", 5000) + `","pinned":true}`,
	} {
		if w := preferenceTestRequest(7, 0, body, h.UpdateModelPreference); w.Code != http.StatusBadRequest {
			t.Fatalf("request %q: status = %d, want 400", body, w.Code)
		}
	}
}

func TestModelPreferencesListScopesAuthenticatedUser(t *testing.T) {
	mock := preferenceTestDB(t)
	h := &AuthHandler{}
	for _, userID := range []int64{7, 8} {
		rows := sqlmock.NewRows([]string{"user_id", "routing_model", "pinned", "favorite"})
		if userID == 7 {
			rows.AddRow(7, "model-a", true, false)
		}
		mock.ExpectQuery(`SELECT .* FROM "user_model_preferences" WHERE .*user_id.* ORDER BY routing_model ASC`).
			WithArgs(userID).WillReturnRows(rows)
		w := preferenceTestRequest(userID, 0, "", h.ListModelPreferences)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d: %s", w.Code, w.Body.String())
		}
		if strings.Contains(w.Body.String(), "user_id") {
			t.Fatal("response exposed internal owner ID")
		}
		if userID == 8 && w.Body.String() != `{"preferences":[]}` {
			t.Fatalf("second user's empty preferences = %s", w.Body.String())
		}
	}
}

func TestModelPreferencesPartialUpdateAndExplicitFalse(t *testing.T) {
	mock := preferenceTestDB(t)
	h := &AuthHandler{}
	mock.ExpectQuery(`SELECT EXISTS .*trim\(mgm.routing_model\) = \$1`).
		WithArgs("model-a").WillReturnRows(sqlmock.NewRows([]string{"available"}).AddRow(true))
	mock.ExpectQuery(`INSERT INTO user_model_preferences .*ON CONFLICT \(user_id, routing_model\) DO UPDATE SET pinned = COALESCE\(\$5, user_model_preferences.pinned\), favorite = COALESCE\(\$6, user_model_preferences.favorite\)`).
		WithArgs(int64(7), "model-a", nil, false, nil, false).
		WillReturnRows(sqlmock.NewRows([]string{"routing_model", "pinned", "favorite"}).AddRow("model-a", true, false))
	w := preferenceTestRequest(7, 0, `{"routing_model":" model-a ","favorite":false}`, h.UpdateModelPreference)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", w.Code, w.Body.String())
	}
	var got map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || got["pinned"] != true || got["favorite"] != false {
		t.Fatalf("partial update response = %s, err = %v", w.Body.String(), err)
	}
}

func TestModelPreferencesRejectUnavailableModelAndRespectKeyGroups(t *testing.T) {
	mock := preferenceTestDB(t)
	mock.ExpectQuery(`SELECT EXISTS .*api_key_model_groups.*api_key_id = \$2`).
		WithArgs("model-a", int64(15)).WillReturnRows(sqlmock.NewRows([]string{"available"}).AddRow(false))
	w := preferenceTestRequest(7, 15, `{"routing_model":"model-a","pinned":true}`, (&AuthHandler{}).UpdateModelPreference)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d: %s", w.Code, w.Body.String())
	}
}

func TestModelPreferencesDoNotExposeDatabaseErrors(t *testing.T) {
	mock := preferenceTestDB(t)
	mock.ExpectQuery(`SELECT .* FROM "user_model_preferences" WHERE .*`).WithArgs(int64(7)).
		WillReturnError(errors.New("private database detail"))
	w := preferenceTestRequest(7, 0, "", (&AuthHandler{}).ListModelPreferences)
	if w.Code != http.StatusInternalServerError || strings.Contains(w.Body.String(), "private") {
		t.Fatalf("unexpected database error response: %d %s", w.Code, w.Body.String())
	}
}
