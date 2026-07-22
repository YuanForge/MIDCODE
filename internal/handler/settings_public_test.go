package handler

import "testing"

func TestPublicSettingKeysExposeSEO(t *testing.T) {
	for _, key := range []string{"seo_title", "seo_description"} {
		if !publicSettingKeys[key] {
			t.Fatalf("public setting key %q is not exposed", key)
		}
	}
}
