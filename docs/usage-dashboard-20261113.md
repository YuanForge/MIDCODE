# Usage dashboard — v1.0.90

The user approved a light blue/white statistics dashboard with five KPI cards,
time-series analysis, model ranking and a detailed table. `/stats` now implements
that layout with real API data, Beijing calendar presets, exact model selection,
hour/day buckets, equal-duration previous-period comparisons, sorting and CSV
export. Summary/trend/ranking cover the full range independently of table paging.

## Accounting and scope

The new authenticated `/user/stats/usage` endpoint aggregates the current user's
LLM call logs only. Independent async image/video tasks remain in task records
and billing. Net consumption includes model credits and subtracts all recorded
refunds for the correlation ID, including refunds after the selected range. It
is attributed to request start time, unlike transaction-date billing. Pending
calls' holds are excluded. Charges shared by duplicate correlation IDs are
counted once. Success rate uses success/(success+error); unresolved calls are
shown in request count but excluded from that denominator. Tokens cover
successful calls and preserve the existing protocol-specific cache normalization.
Cache ratio is weighted by input tokens, never averaged across models.

Production timestamps are Beijing wall times stored as PostgreSQL timestamps
without time zone. Bounds are explicitly converted to Beijing wall-time strings;
bucket instants use an explicit Asia/Shanghai conversion. Missing buckets are
zero-filled. Queries are limited to 90 days (7 days hourly) and have a 15-second
request-context deadline. No schema or billing mutation is added.

## Verification before rollout

- Repository `go test ./cmd/... ./internal/... ./pkg/...` passed.
- Preserved production source handler/router tests and Linux build passed.
- SQL integration used transaction-local temporary tables and rolled back:
  tenant isolation, partial/later/full refunds, pending holds, cache accounting,
  deleted channels, exclusive end boundary, previous period, and session timezone
  invariance passed. No production rows were inserted or changed.
- Frontend TypeScript/Vite build and focused ESLint passed.
- Playwright checked paging independence, model filtering, calendar presets,
  invalid dates, CSV including all pages, sorting, error/retry, empty results,
  desktop 1600x1120 and mobile 390x844, page identity and runtime errors.
- Browser plugin skill was unavailable. The repository Playwright workflow used
  installed Edge via `PLAYWRIGHT_CHANNEL=msedge`; no browser installation needed.
- Existing administrator channel-isolation regression passed.

## Design fidelity ledger

| Element | Approved concept | Implementation / decision |
| --- | --- | --- |
| Hierarchy | Filters → five KPIs → trend/rank → table | Preserved |
| Palette and cards | Blue accent, white cards, thin borders | Page-scoped blue tokens; existing theme supports dark mode |
| Chart composition | Wide trend, narrow absolute-value ranking | Preserved; responsive SVG fixes unreadable mobile axis labels |
| Typography and numbers | Large KPI values, compact table numbers | Compact values with exact-number tooltips and CSV |
| Controls | Refresh, date/model filters, metric tabs, export | Functional, with loading/error/empty states |
| Application shell | Illustrative simplified menu | Existing real navigation, branding, account and theme controls retained |
| Data | Illustrative model names and totals | Real authenticated data; no demo badge, invented gains or placeholder metrics |
| Detail | Cache read/write/input/output columns | Retained; total Token also kept, smaller screens show key columns; export contains all |

Screenshots are outside the repository in the task visualization directory.
The approved concept and the rendered desktop/mobile screenshots were inspected.

## Deployment procedure and rollback

Application baseline remains the verified v1.0.87 production tree (not a blind
rebuild of historical repository backend files). `apply_source.py` validates the
prior billing-fix hashes, preserves production-only routes, and adds only the new
handler/tests and route. Build hashes and source hashes accompany the release.

The candidate is `midcode-usage-v1090-api-1` at loopback 8155. Its image inherits
the live main image, overlays the verified binary and frontend assets, and retains
the runtime env.js, nginx settings, uploads and previous hashed frontend assets.
Only the main application is replaced; studio API/worker builds remain unchanged.

`deploy.py prepare` snapshots the predecessor privately and starts the candidate.
`verify.py` checks authenticated totals against an independent database count,
model/point aggregate agreement, input validation, authentication and account
reads. `switch` gracefully reloads Caddy, maintains port 8154 compatibility for
the host-network workbench, drains ingress and moves the video backend alias.
`verify.py --live` and workbench verification precede `cleanup`, which checks
dependencies and drains before deleting the predecessor without deleting volumes.

Private snapshots and rollback image stay under `/root/fanapi-usage-v1.0.90/`.
`deploy.py rollback` recreates the saved predecessor if needed, restores Caddy,
removes the 8154 compatibility redirect and returns the studio alias after drain.
No balances or completed refunds are reversed. Verify services before removing
any rolled-back candidate.

Deployment completion, commits, remote tag verification and actual cleanup results
will be recorded after rollout.
