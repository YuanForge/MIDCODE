package handler

import "testing"

func TestPublicSettingKeysExposeBranding(t *testing.T) {
	for _, key := range []string{"site_name", "logo_url", "seo_title", "seo_description", "theme_color"} {
		if !publicSettingKeys[key] {
			t.Fatalf("public setting key %q is not exposed", key)
		}
	}
}
