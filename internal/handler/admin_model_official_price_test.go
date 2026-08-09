package handler

import (
	"bytes"
	"os"
	"testing"
)

func TestOfficialPriceRoutesDeclared(t *testing.T) {
	source, err := os.ReadFile("../router/admin.go")
	if err != nil {
		t.Fatal(err)
	}
	for _, route := range []string{
		`admin.GET("/model-official-prices"`,
		`admin.POST("/model-official-prices"`,
		`admin.PUT("/model-official-prices/:id"`,
		`admin.PATCH("/model-official-prices/:id/status"`,
		`admin.DELETE("/model-official-prices/:id"`,
	} {
		if !bytes.Contains(source, []byte(route)) {
			t.Errorf("missing %s", route)
		}
	}
}

func TestOfficialPriceHandlersRequireSettingsWriteAndAudit(t *testing.T) {
	source, err := os.ReadFile("admin_model_official_price.go")
	if err != nil {
		t.Fatal(err)
	}
	permissionCheck := []byte(`requireAdminPermission(c, "settings:write")`)
	if got := bytes.Count(source, permissionCheck); got != 5 {
		t.Fatalf("settings:write checks = %d, want 5", got)
	}
	for _, contract := range [][]byte{
		[]byte(`ResourceType: "model_official_price"`),
		[]byte(`"source_price_config"`),
		[]byte(`"normalized_price_config"`),
		[]byte(`IP:`),
		[]byte(`UA:`),
	} {
		if !bytes.Contains(source, contract) {
			t.Errorf("audit contract missing %s", contract)
		}
	}
}
