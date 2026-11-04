package handler

import (
	"go/ast"
	"go/parser"
	"go/token"
	"testing"
)

// All transport, HTTP, sync-body and SSE error retries must close the previous
// log even when no money was held. The refund helper itself handles zero holds.
func TestChannelRetryStatusIsIndependentOfHold(t *testing.T) {
	f, err := parser.ParseFile(token.NewFileSet(), "llm.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	ast.Inspect(f, func(n ast.Node) bool {
		block, ok := n.(*ast.BlockStmt)
		if !ok {
			return true
		}
		for i, statement := range block.List {
			expr, ok := statement.(*ast.ExprStmt)
			if !ok {
				continue
			}
			call, ok := expr.X.(*ast.CallExpr)
			if !ok {
				continue
			}
			fn, ok := call.Fun.(*ast.Ident)
			if !ok || fn.Name != "llmProxyWithChannel" {
				continue
			}
			if i == 0 {
				continue
			} // Pre-log channel selection is a different path.
			previous, ok := block.List[i-1].(*ast.ExprStmt)
			if !ok {
				continue
			}
			patch, ok := previous.X.(*ast.CallExpr)
			if !ok {
				continue
			}
			name, ok := patch.Fun.(*ast.Ident)
			if !ok || name.Name != "enqueueLLMLogPatch" {
				continue
			}
			count++
		}
		return true
	})
	if count != 5 {
		t.Fatalf("want all 5 retry branches to close their log unconditionally, got %d", count)
	}
}
