package handler

import (
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"fanapi/internal/db"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"xorm.io/xorm"
	"xorm.io/xorm/core"
)

func TestChangePasswordReportsDatabaseOutcome(t *testing.T) {
	for _, tc := range []struct {
		name   string
		rows   int64
		err    error
		status int
	}{
		{"success", 1, nil, 200}, {"missing user", 0, nil, 500}, {"write failure", 0, errors.New("unavailable"), 500},
	} {
		t.Run(tc.name, func(t *testing.T) {
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
			t.Cleanup(func() { db.Engine = previous; engine.Close() })
			expect := mock.ExpectExec(`UPDATE "users" SET .*password_hash.* WHERE .*id.*`)
			if tc.err != nil {
				expect.WillReturnError(tc.err)
			} else {
				expect.WillReturnResult(sqlmock.NewResult(0, tc.rows))
			}
			r := gin.New()
			r.PUT("/user/password", func(c *gin.Context) { c.Set("user_id", int64(1)); (&AuthHandler{}).ChangePassword(c) })
			req := httptest.NewRequest("PUT", "/user/password", strings.NewReader(`{"new_password":"test-only-password"}`))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != tc.status {
				t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}
