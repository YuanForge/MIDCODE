package handler

import (
	"encoding/json"
	"fanapi/internal/model"
	"strings"
	"testing"
)

func TestReceivedGiftHidesSender(t *testing.T) {
	original := model.JSON{"sender_id": 12345, "peer_user_id": 12345, "recipient_id": 99, "future_private_field": "private"}
	rows := []model.BillingTransaction{{Type: "transfer_in", CorrID: "gift:shared-secret", Metrics: original}, {Type: "transfer_out", CorrID: "gift:shared-secret", Metrics: original}}
	hideGiftSender(rows)
	b, _ := json.Marshal(rows[0])
	for _, s := range []string{"12345", "sender_id", "peer_user_id", "shared-secret", "private"} {
		if strings.Contains(string(b), s) {
			t.Fatalf("recipient response leaked %s: %s", s, b)
		}
	}
	if rows[1].Metrics["sender_id"] != 12345 || rows[1].CorrID == "" || original["sender_id"] != 12345 {
		t.Fatal("sender/audit metadata mutated")
	}
}
