package db

import (
	"os"
	"strings"
	"testing"
)

func TestBillingTransactionSyncSkipsExistingExpressionIndexes(t *testing.T) {
	sourceBytes, err := os.ReadFile("db.go")
	if err != nil {
		t.Fatal(err)
	}
	source := string(sourceBytes)

	guardCall := strings.Index(source, "if err := ensureBillingTransactionTable(); err != nil")
	mainSync := strings.Index(source, "if err := Engine.Sync2(")
	if guardCall < 0 || mainSync < 0 || guardCall > mainSync {
		t.Fatal("billing transaction table guard must run before the main Sync2 call")
	}
	mainSyncEnd := strings.Index(source[mainSync:], "); err != nil")
	if mainSyncEnd < 0 {
		t.Fatal("main Sync2 call terminator not found")
	}
	if strings.Contains(source[mainSync:mainSync+mainSyncEnd], "new(model.BillingTransaction)") {
		t.Fatal("existing billing_transactions must not be introspected by the main Sync2 call")
	}
	if !strings.Contains(source, "Engine.IsTableExist(new(model.BillingTransaction))") ||
		!strings.Contains(source, "return Engine.Sync2(new(model.BillingTransaction))") {
		t.Fatal("billing_transactions should use Sync2 only when the table does not exist")
	}
}

func TestModelProviderSyncSkipsExistingExpressionIndexes(t *testing.T) {
	sourceBytes, err := os.ReadFile("db.go")
	if err != nil {
		t.Fatal(err)
	}
	source := string(sourceBytes)

	guardCall := strings.Index(source, "if err := ensureModelProviderTable(); err != nil")
	mainSync := strings.Index(source, "if err := Engine.Sync2(")
	if guardCall < 0 || mainSync < 0 || guardCall > mainSync {
		t.Fatal("model provider table guard must run before the main Sync2 call")
	}
	mainSyncEnd := strings.Index(source[mainSync:], "); err != nil")
	if mainSyncEnd < 0 {
		t.Fatal("main Sync2 call terminator not found")
	}
	if strings.Contains(source[mainSync:mainSync+mainSyncEnd], "new(model.ModelProvider)") {
		t.Fatal("existing model_providers must not be introspected by the main Sync2 call")
	}
	if !strings.Contains(source, "Engine.IsTableExist(new(model.ModelProvider))") ||
		!strings.Contains(source, "return Engine.Sync2(new(model.ModelProvider))") {
		t.Fatal("model_providers should use Sync2 only when the table does not exist")
	}
}
