package handler

import (
	"mime/multipart"
	"net/url"
	"testing"

	"fanapi/internal/model"
)

func TestParseOpenAIImageEditValuesRequiresModelAndPrompt(t *testing.T) {
	if _, err := parseOpenAIImageEditValues(url.Values{"model": {"gpt-image-1"}}); err == nil {
		t.Fatal("expected prompt validation error")
	}
	if _, err := parseOpenAIImageEditValues(url.Values{"prompt": {"remove background"}}); err == nil {
		t.Fatal("expected model validation error")
	}
}

func TestBuildOpenAIImageEditPayloadUsesMultipartFiles(t *testing.T) {
	req := &model.ImageRequest{
		Model:  "gpt-image-1",
		Prompt: "remove background",
		Extra: map[string]interface{}{
			"quality":         "high",
			"response_format": "b64_json",
		},
	}
	payload := buildOpenAIImageEditPayload(req, []string{"https://example.com/source.png"}, "https://example.com/mask.png")
	if payload["_body_type"] != "multipart/form-data" {
		t.Fatalf("body type = %#v", payload["_body_type"])
	}
	files, ok := payload["_files"].(map[string]interface{})
	if !ok {
		t.Fatalf("files = %#v", payload["_files"])
	}
	if files["image"] == nil || files["mask"] == nil {
		t.Fatalf("expected image and mask files, got %#v", files)
	}
	if payload["prompt"] != "remove background" || payload["quality"] != "high" {
		t.Fatalf("payload fields = %#v", payload)
	}
}

func TestOpenAIImageEditFormSupportsRepeatedImageFields(t *testing.T) {
	form := &multipart.Form{Value: url.Values{"prompt": {"edit"}}, File: map[string][]*multipart.FileHeader{
		"image[]": {{Filename: "a.png"}, {Filename: "b.png"}},
	}}
	images, mask, err := collectOpenAIImageEditFiles(form)
	if err != nil {
		t.Fatal(err)
	}
	if len(images) != 2 || images[0].Filename != "a.png" || images[1].Filename != "b.png" || mask != nil {
		t.Fatalf("images=%#v mask=%#v", images, mask)
	}
}
