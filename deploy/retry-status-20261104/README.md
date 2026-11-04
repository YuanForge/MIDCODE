# Retry log finalization — v1.0.69

Five channel retry paths previously finalized the previous attempt only inside
`totalHold > 0`. Free requests could remain pending forever after a retry. Call
the existing refund helper (already a no-op for zero hold) and finalize the
previous attempt independently of the hold amount. Preserve the refund failure
guard and paid billing behavior. Cover transport, HTTP, synchronous business
errors and both SSE initial-error paths with a regression test.

Apply only the five enclosing-guard removals to the preserved v1.0.67 production
`internal/handler/llm.go`, retaining its other stream/cancellation fixes. Add the
new regression test, run handler retry/refund/stream/usage/log tests and build the
Linux amd64 server. Include main's v1.0.68 transfer-copy change by removing the
equivalent conversion-ratio phrase from the production CreditTransferCard, then
build TypeScript/Vite. Do not replace production-only source with the repository
baseline. No billing schema or price changes.

New host only: `midcode-retry-v1069-api-1`, localhost 8149, image
`fanapi-api:retry-v1.0.69`. Validate authenticated logs, then gracefully reload
migration-router. Move the video alias after existing backend connections drain,
verify studio handoff/isolation, and remove the drained unreferenced predecessor
`midcode-cache-v1067-api-1` without volumes. Keep the old image and configuration.
Rollback: recreate predecessor, restore video alias and proxy files from
`/root/fanapi-migration/retry-v1069-ingress-before`.

Historical repair is limited to the separately audited 47 pending rows for
UIDs 81 and 90. Back up rows first; exclude recent requests. Mark the old incomplete
attempt records closed with an explicit missing-terminal-state explanation.
Preserve original timestamps, usage and all billing transactions/balances.
UID 90's historical paid holds require separate reconciliation; missing log state
alone is not evidence sufficient to refund or invent a successful result.
Runtime record: `/root/fanapi-migration/retry-v1069-verification.json`.
