package handler

import (
	"testing"

	"fanapi/internal/model"
)

func TestOpenAIImageDataFromTaskURL(t *testing.T) {
	data, err := openAIImageData(&model.Task{Result: model.JSON{
		"url": "https://cdn.example.com/image.png",
	}}, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(data) != 1 || data[0].URL != "https://cdn.example.com/image.png" || data[0].B64JSON != "" {
		t.Fatalf("unexpected data: %#v", data)
	}
}

func TestOpenAIImageDataFromTaskBase64(t *testing.T) {
	data, err := openAIImageData(&model.Task{Result: model.JSON{
		"url": "data:image/png;base64,iVBORw0KGgo=",
	}}, "b64_json")
	if err != nil {
		t.Fatal(err)
	}
	if len(data) != 1 || data[0].B64JSON != "iVBORw0KGgo=" || data[0].URL != "" {
		t.Fatalf("unexpected data: %#v", data)
	}
}

func TestOpenAIImageDataFromOriginalDataArray(t *testing.T) {
	data, err := openAIImageData(&model.Task{Result: model.JSON{
		"data": []interface{}{
			map[string]interface{}{"url": "https://cdn.example.com/a.png"},
			map[string]interface{}{"b64_json": "abc123"},
		},
	}}, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(data) != 2 || data[0].URL == "" || data[1].B64JSON != "abc123" {
		t.Fatalf("unexpected data: %#v", data)
	}
}

func TestOpenAIImageDataRejectsEmptyResult(t *testing.T) {
	if _, err := openAIImageData(&model.Task{Result: model.JSON{}}, ""); err == nil {
		t.Fatal("expected empty image result to fail")
	}
}
