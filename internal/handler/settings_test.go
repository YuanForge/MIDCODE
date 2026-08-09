package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestUpdateSettingsRejectsManagedExchangeRateKeysBeforeDatabaseWrites(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, key := range []string{
		"usd_cny_exchange_rate",
		"usd_cny_exchange_rate_source",
		"usd_cny_exchange_rate_last_error",
	} {
		t.Run(key, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = httptest.NewRequest(http.MethodPut, "/admin/settings", strings.NewReader(`{"`+key+`":"manual"}`))
			ctx.Request.Header.Set("Content-Type", "application/json")

			UpdateSettings(ctx)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
			}
		})
	}
}
