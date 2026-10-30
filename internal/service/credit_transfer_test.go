package service

import (
	"context"
	"errors"
	"testing"
)

func TestTransferCreditsRejectsInvalidRequests(t *testing.T) {
	for _, tc := range []struct {
		from, to, amount int64
		key              string
	}{
		{1, 1, 1, "valid-request-id-123"}, {1, 2, 0, "valid-request-id-123"},
		{1, 2, -1, "valid-request-id-123"}, {0, 2, 1, "valid-request-id-123"},
		{1, -1, 1, "valid-request-id-123"}, {1, 2, 1, ""},
	} {
		if err := TransferCredits(context.Background(), tc.from, tc.to, tc.amount, tc.key); !errors.Is(err, ErrTransfer) {
			t.Fatalf("expected validation failure for %+v, got %v", tc, err)
		}
	}
}
