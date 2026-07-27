package handler

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"fanapi/internal/service"

	"github.com/gin-gonic/gin"
)

func TestWriteModelProviderErrorIncludesReferenceCounts(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

	writeModelProviderError(ctx, &service.ModelProviderReferencedError{GroupCount: 2, ChannelCount: 3})

	if recorder.Code != 409 {
		t.Fatalf("status = %d, want 409", recorder.Code)
	}
	var body struct {
		GroupCount   int64 `json:"group_count"`
		ChannelCount int64 `json:"channel_count"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.GroupCount != 2 || body.ChannelCount != 3 {
		t.Fatalf("counts = %d/%d, want 2/3", body.GroupCount, body.ChannelCount)
	}
}
