package service

import "testing"

func TestUserFacingErrorMessageHidesUpstreamNetworkDetails(t *testing.T) {
	msg := `upstream error: Post "https://cpa.fanapi.cc/v1/images/generations": dial tcp 64.83.32.155:443: i/o timeout`
	if got := UserFacingErrorMessage(msg); got != genericUpstreamErrorMessage {
		t.Fatalf("expected generic upstream message, got %q", got)
	}
}

func TestUserFacingErrorMessageKeepsBusinessMessage(t *testing.T) {
	msg := "余额不足"
	if got := UserFacingErrorMessage(msg); got != msg {
		t.Fatalf("expected business message to pass through, got %q", got)
	}
}
