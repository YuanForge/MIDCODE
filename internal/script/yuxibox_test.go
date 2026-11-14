package script

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"fanapi/internal/billing"
	"fanapi/internal/model"
)

func yuxiboxChannels(t *testing.T) []model.Channel {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "integrations", "yuxibox", "channels.json"))
	if err != nil {
		t.Fatal(err)
	}
	var channels []model.Channel
	if err := json.Unmarshal(data, &channels); err != nil {
		t.Fatal(err)
	}
	return channels
}

func TestYuxiboxDefaultsBillingAndPayload(t *testing.T) {
	for i, ch := range yuxiboxChannels(t) {
		t.Run(ch.Model, func(t *testing.T) {
			req, err := RunNormalizeRequest(ch.RequestScript, map[string]interface{}{"model": ch.Model, "prompt": "test"})
			if err != nil {
				t.Fatal(err)
			}
			wantSeconds := []int{30, 30, 15, 15, 30}[i]
			mapped, err := RunMapRequest(ch.RequestScript, req, "")
			if err != nil {
				t.Fatal(err)
			}
			if toIntVal(mapped["seconds"]) != wantSeconds || mapped["ratio"] != "16:9" {
				t.Fatalf("bad default payload: %#v", mapped)
			}
			for _, key := range []string{"duration", "size", "refer_images", "refer_videos", "aspect_ratio"} {
				if _, ok := mapped[key]; ok {
					t.Fatalf("leaked platform field %s", key)
				}
			}
			if ch.IsActive {
				t.Fatal("templates must remain disabled")
			}
			cost, _, err := billing.Calc(&ch, req)
			baseCost := []int64{9000000, 3500000, 2600000, 3750000, 4000000}[i]
			want := baseCost * 17 / 10
			if err != nil || cost != want {
				t.Fatalf("cost=%d want=%d err=%v", cost, want, err)
			}
			upstreamCost, err := billing.CalcUpstreamCost(&ch, req)
			if err != nil || upstreamCost != baseCost {
				t.Fatalf("upstream cost=%d err=%v", upstreamCost, err)
			}
		})
	}
}

func TestYuxiboxAliasesAndValidation(t *testing.T) {
	channels := yuxiboxChannels(t)
	for _, tc := range []struct {
		name    string
		channel int
		input   map[string]interface{}
		invalid bool
	}{
		{"native aliases", 0, map[string]interface{}{"seconds": 10, "ratio": "9:16", "reference_images": []string{"https://example.com/a.png"}, "videos": []string{"https://example.com/a.mp4"}, "audios": []string{"https://example.com/a.mp3"}}, false},
		{"platform fields", 0, map[string]interface{}{"duration": "10", "size": "720p", "aspect_ratio": "21:9", "refer_images": []string{"data:image/png;base64,AA=="}}, false},
		{"dimension inference", 0, map[string]interface{}{"size": "720x1280"}, false},
		{"minimum documented seconds", 0, map[string]interface{}{"seconds": 4}, false},
		{"fractional", 0, map[string]interface{}{"seconds": 5.5}, true},
		{"conflicting duration", 0, map[string]interface{}{"duration": "5", "seconds": 30}, true},
		{"negative", 0, map[string]interface{}{"duration": "-5"}, true},
		{"fixed 30 seconds", 1, map[string]interface{}{"seconds": 15}, true},
		{"YX 2 discrete", 3, map[string]interface{}{"seconds": 6}, true},
		{"official 4 seconds", 2, map[string]interface{}{"seconds": 4}, false},
		{"official video forbidden", 2, map[string]interface{}{"videos": []string{"https://example.com/a.mp4"}}, true},
		{"official base64 forbidden", 2, map[string]interface{}{"reference_images": []string{"data:image/png;base64,AA=="}}, true},
		{"official ratio", 2, map[string]interface{}{"ratio": "1:1"}, true},
		{"size conflict", 0, map[string]interface{}{"size": "720x1280", "ratio": "16:9"}, true},
		{"unsupported resolution", 0, map[string]interface{}{"size": "1080p"}, true},
		{"bad array", 0, map[string]interface{}{"audios": "https://example.com/a.mp3"}, true},
		{"too many audios", 3, map[string]interface{}{"audios": []string{"https://a", "https://b", "https://c", "https://d"}}, true},
		{"empty prompt", 0, map[string]interface{}{"prompt": " "}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ch := channels[tc.channel]
			input := map[string]interface{}{"model": ch.Model, "prompt": "test"}
			for k, v := range tc.input {
				input[k] = v
			}
			normalized, err := RunNormalizeRequest(ch.RequestScript, input)
			if tc.invalid {
				if err == nil {
					t.Fatalf("accepted invalid input: %#v", input)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			mapped, err := RunMapRequest(ch.RequestScript, normalized, "")
			if err != nil {
				t.Fatal(err)
			}
			if tc.name == "native aliases" {
				if toIntVal(mapped["seconds"]) != 10 || mapped["ratio"] != "9:16" || mapped["reference_images"] == nil || mapped["videos"] == nil || mapped["audios"] == nil {
					t.Fatalf("bad aliases: %#v", mapped)
				}
				cost, _, err := billing.Calc(&ch, normalized)
				if err != nil || cost != 5100000 {
					t.Fatalf("seconds alias billing=%d err=%v", cost, err)
				}
			}
			if tc.name == "dimension inference" && mapped["ratio"] != "9:16" {
				t.Fatalf("bad ratio: %#v", mapped)
			}
		})
	}
}

func TestYuxiboxQueryStates(t *testing.T) {
	ch := yuxiboxChannels(t)[0]
	for _, tc := range []struct {
		body   string
		status int
		url    string
	}{
		{`{"status":"queued"}`, 1, ""},
		{`{"status":"in_progress","progress":42}`, 1, ""},
		{`{"status":"completed","video_url":"https://example.com/v.mp4"}`, 2, "https://example.com/v.mp4"},
		{`{"status":"completed","download_url":"https://example.com/d.mp4"}`, 2, "https://example.com/d.mp4"},
		{`{"status":"completed"}`, 1, ""},
		{`{"status":"failed","error":{"message":"rejected"}}`, 3, ""},
	} {
		var input map[string]interface{}
		if err := json.Unmarshal([]byte(tc.body), &input); err != nil {
			t.Fatal(err)
		}
		got, err := RunMapResponse(ch.QueryScript, input)
		if err != nil || toIntVal(got["status"]) != tc.status {
			t.Fatalf("query=%#v err=%v", got, err)
		}
		if tc.url != "" && got["url"] != tc.url {
			t.Fatalf("url=%v", got["url"])
		}
	}
}

func TestYuxiboxWorkerSubmission(t *testing.T) {
	ch := yuxiboxChannels(t)[0]
	for _, mode := range []string{"accepted", "disconnect", "gateway_timeout", "missing_id"} {
		t.Run(mode, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				if r.Header.Get("Authorization") != "Bearer test-key" {
					t.Error("missing pool key")
				}
				var body map[string]interface{}
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Error(err)
				}
				if _, ok := body["_disable_submit_retry"]; ok {
					t.Error("control field leaked upstream")
				}
				if body["seconds"] != float64(30) || body["model"] != ch.Model {
					t.Errorf("wrong request: %#v", body)
				}
				switch mode {
				case "disconnect":
					conn, _, err := w.(http.Hijacker).Hijack()
					if err != nil {
						t.Error(err)
						return
					}
					conn.Close()
				case "gateway_timeout":
					w.WriteHeader(504)
				case "missing_id":
					w.Write([]byte(`{"status":"queued"}`))
				default:
					w.Write([]byte(`{"id":"video-test","status":"queued"}`))
				}
			}))
			defer server.Close()
			result := execJob(context.Background(), &model.TaskJob{
				TaskType: "video", BaseURL: server.URL, Method: "POST", Headers: ch.Headers,
				TimeoutMs: 1000, RequestScript: ch.RequestScript, ResponseScript: ch.ResponseScript,
				QueryURL: server.URL + "/{id}", PoolKeyID: 1, PoolKeyValue: "test-key",
				Payload: map[string]interface{}{"model": ch.Model, "prompt": "test"}, RetryChannelIDs: []int64{123},
			})
			if calls.Load() != 1 {
				t.Fatalf("submission repeated %d times", calls.Load())
			}
			if mode == "accepted" {
				if result.Outcome != model.OutcomeAsync || result.UpstreamTaskID != "video-test" {
					t.Fatalf("wrong accepted result: %#v", result)
				}
			} else if result.Outcome != model.OutcomeFailed || len(result.RetryChannelIDs) != 0 {
				t.Fatalf("ambiguous submission must not retry: %#v", result)
			}
		})
	}
}

func TestYuxiboxGeneratedScriptsMatchSources(t *testing.T) {
	for _, ch := range yuxiboxChannels(t) {
		for file, script := range map[string]string{"request.js": ch.RequestScript, "response.js": ch.ResponseScript, "query.js": ch.QueryScript} {
			data, err := os.ReadFile(filepath.Join("..", "..", "integrations", "yuxibox", file))
			if err != nil {
				t.Fatal(err)
			}
			if strings.ReplaceAll(string(data), "\r\n", "\n") != strings.ReplaceAll(script, "\r\n", "\n") {
				t.Fatalf("stale generated %s; run build-channels.mjs", file)
			}
		}
	}
}
