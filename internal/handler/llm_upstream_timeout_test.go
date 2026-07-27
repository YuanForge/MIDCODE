package handler

import (
	"testing"
	"time"
)

func TestNewLLMHTTPClientUsesConfiguredTimeoutForNonStream(t *testing.T) {
	client := newLLMHTTPClient(60*time.Second, false)
	if client.Timeout != 60*time.Second {
		t.Fatalf("timeout = %s, want 1m0s", client.Timeout)
	}
}

func TestNewLLMHTTPClientHasNoTotalTimeoutForStream(t *testing.T) {
	client := newLLMHTTPClient(60*time.Second, true)
	if client.Timeout != 0 {
		t.Fatalf("timeout = %s, want 0", client.Timeout)
	}
}
