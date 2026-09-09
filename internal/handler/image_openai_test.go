package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"reflect"
	"strings"
	"testing"

	"fanapi/internal/billing"
	"fanapi/internal/model"
	"github.com/gin-gonic/gin"
)

func TestImageSynchronousUpstream(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, edits := range []bool{false, true} {
		for _, passthrough := range []bool{false, true} {
			t.Run(fmtImageCase(edits, passthrough), func(t *testing.T) {
				route := "/v1/images/generations"
				body := []byte(`{"model":"public-image","prompt":"draw a cat","n":2,"quality":"high"}`)
				contentType := "application/json"
				if edits {
					route = "/v1/images/edits"
					var buf bytes.Buffer
					w := multipart.NewWriter(&buf)
					for key, value := range map[string]string{"model": "public-image", "prompt": "draw a cat", "n": "2", "quality": "high"} {
						if err := w.WriteField(key, value); err != nil {
							t.Fatal(err)
						}
					}
					for _, name := range []string{"one.png", "two.png", "mask.png"} {
						field := "image[]"
						if name == "mask.png" {
							field = "mask"
						}
						header := textproto.MIMEHeader{"Content-Disposition": {`form-data; name="` + field + `"; filename="` + name + `"`}, "Content-Type": {"image/png"}}
						part, err := w.CreatePart(header)
						if err != nil {
							t.Fatal(err)
						}
						_, _ = part.Write([]byte("image-bytes-" + name))
					}
					if err := w.Close(); err != nil {
						t.Fatal(err)
					}
					body, contentType = buf.Bytes(), w.FormDataContentType()
				}
				c, _ := gin.CreateTestContext(httptest.NewRecorder())
				c.Request = httptest.NewRequest(http.MethodPost, route, bytes.NewReader(body))
				c.Request.Header.Set("Content-Type", contentType)
				c.Set(llmRouteContextKey, route)
				c.Set("raw_body", body)
				source, err := decodeLLMRequest(c, body)
				if err != nil {
					t.Fatal(err)
				}
				if c.Request.MultipartForm != nil {
					defer c.Request.MultipartForm.RemoveAll()
				}
				response := `{"created":123,"data":[{"b64_json":"YWJj","revised_prompt":"cat"}],"usage":{"input_tokens":100,"output_tokens":200}}`
				calls := 0
				up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					calls++
					if r.URL.Path != route || r.Header.Get("Accept") != "application/json" {
						t.Errorf("bad target/accept: %s %v", r.URL, r.Header)
					}
					key := "first"
					if calls == 2 {
						key = "second"
					}
					if r.Header.Get("Authorization") != "Bearer "+key {
						t.Errorf("bad auth %v", r.Header)
					}
					var fields map[string]interface{}
					if edits {
						if err := r.ParseMultipartForm(1 << 20); err != nil {
							t.Error(err)
							return
						}
						defer r.MultipartForm.RemoveAll()
						if len(r.MultipartForm.File["image[]"]) != 2 || len(r.MultipartForm.File["mask"]) != 1 {
							t.Error("lost files")
						}
						for _, files := range r.MultipartForm.File {
							for _, f := range files {
								src, err := f.Open()
								if err != nil {
									t.Error(err)
									return
								}
								data, _ := io.ReadAll(src)
								src.Close()
								if string(data) != "image-bytes-"+f.Filename || f.Header.Get("Content-Type") != "image/png" {
									t.Error("file changed")
								}
							}
						}
						fields = map[string]interface{}{}
						for key, values := range r.MultipartForm.Value {
							fields[key] = values[0]
						}
					} else {
						if err := json.NewDecoder(r.Body).Decode(&fields); err != nil {
							t.Error(err)
							return
						}
					}
					wantModel := "gpt-image-upstream"
					if passthrough {
						wantModel = "public-image"
					}
					if fields["model"] != wantModel || fields["quality"] != "high" || fields["prompt"] != "draw a cat" {
						t.Errorf("changed fields: %#v", fields)
					}
					if !passthrough && fields["key_marker"] != key {
						t.Error("stale request script")
					}
					if calls == 1 {
						w.WriteHeader(503)
						return
					}
					_, _ = io.WriteString(w, response)
				}))
				defer up.Close()
				ch := &model.Channel{BaseURL: "https://unused.invalid/v1", Protocol: protocolResponses, PassthroughBody: passthrough, PassthroughHeaders: true,
					Headers: model.JSON{"Content-Type": "application/json"}, RequestScript: `function mapRequest(input) { input.key_marker = poolKey; return input; }`}
				for _, key := range []string{"first", "second"} {
					pk := &model.PoolKey{Value: key, BaseURLOverride: up.URL + "/v1/chat/completions"}
					attempt, err := prepareLLMUpstreamAttempt(c, ch, pk, source, protocolOpenAI, "gpt-image-upstream", false, "")
					if err != nil {
						t.Fatal(err)
					}
					_, resp, err := sendLLMRequest(c, ch, attempt.Request, pk, attempt.Protocol, "gpt-image-upstream", false)
					if err != nil {
						t.Fatal(err)
					}
					data, _ := io.ReadAll(resp.Body)
					resp.Body.Close()
					if key == "second" && string(data) != response {
						t.Fatalf("response changed: %s", data)
					}
				}
				if source["model"] != "public-image" {
					t.Error("source mutated")
				}
			})
		}
	}
}

func fmtImageCase(edits, passthrough bool) string {
	name := "generation"
	if edits {
		name = "edits"
	}
	if passthrough {
		name += "-passthrough"
	}
	return name
}

func TestImageUsageAndPrice(t *testing.T) {
	var response map[string]interface{}
	_ = json.Unmarshal([]byte(`{"data":[{"b64_json":"x"},{"url":"https://example/image"}],"usage":{"input_tokens":100,"output_tokens":200}}`), &response)
	usage := openAIImageUsage(response)
	if !reflect.DeepEqual(usage, map[string]interface{}{"prompt_tokens": int64(100), "completion_tokens": int64(200), "total_tokens": int64(300), "image_count": int64(2)}) {
		t.Fatal(usage)
	}
	ch := &model.Channel{BillingType: "token", BillingConfig: model.JSON{"input_price_per_1m_tokens": int64(1000000), "output_price_per_1m_tokens": int64(2000000)}}
	cost, err := billing.CalcActualCostForUserWithTier(ch, map[string]interface{}{"prompt": "cat"}, map[string]interface{}{"usage": usage}, "", billing.TierStandard)
	if err != nil || cost != 500 {
		t.Fatalf("cost=%d err=%v", cost, err)
	}
}

func TestImageRequestValidation(t *testing.T) {
	for _, body := range []string{`null`, `{"model":"x"}`, `{"model":"x","prompt":"p","n":1.5}`, `{"model":"x","prompt":"p","stream":true}`} {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
		c.Set(llmRouteContextKey, "/v1/images/generations")
		if _, err := decodeLLMRequest(c, []byte(body)); err == nil {
			t.Errorf("accepted %s", body)
		}
	}
}

func TestImageHandlersRejectStreamingBeforeRouting(t *testing.T) {
	for _, edits := range []bool{false, true} {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Set("user_id", int64(1))
		body := []byte(`{"model":"x","prompt":"p","stream":true}`)
		contentType := "application/json"
		if edits {
			var buf bytes.Buffer
			form := multipart.NewWriter(&buf)
			_ = form.WriteField("model", "x")
			_ = form.WriteField("prompt", "p")
			_ = form.WriteField("stream", "true")
			part, _ := form.CreateFormFile("image", "image.png")
			_, _ = part.Write([]byte("image"))
			_ = form.Close()
			body, contentType = buf.Bytes(), form.FormDataContentType()
		}
		c.Request = httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
		c.Request.Header.Set("Content-Type", contentType)
		if edits {
			CreateOpenAIImageEdits(c)
		} else {
			CreateOpenAIImageGenerations(c)
		}
		if w.Code != 400 || !strings.Contains(w.Body.String(), "synchronous") {
			t.Fatalf("edits=%v: %d %s", edits, w.Code, w.Body)
		}
	}
}

func TestImageUpstreamRoutes(t *testing.T) {
	for _, route := range []string{"/v1/images/generations", "/v1/images/edits"} {
		for _, base := range []string{"https://example", "https://example/v1/", "https://example/v1/chat/completions", "https://example/v1/responses", "https://example/v1/images/generations", "https://example/v1/images/edits"} {
			target := resolveLLMUpstreamTarget(base+"?key=keep", route, protocolResponses, "gpt-image", false, "")
			if target.URL != "https://example"+route+"?key=keep" || target.Protocol != protocolOpenAI {
				t.Fatalf("%s: %+v", base, target)
			}
		}
	}
}
