# MIDCODE Model Group Official Discount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display each MIDCODE API-key model group's default selling price as a consistent discount from LiteLLM's official USD token prices after applying an administrator-configured USD/CNY exchange rate.

**Architecture:** Add a server-side LiteLLM token-price loader with a six-hour stale-preserving cache, then enrich only user-facing model-group summaries by comparing bound channels' default token selling prices with converted official prices. Reuse the system-settings table for the exchange rate and the shared React `ModelGroupSelector` for both create and edit dialogs.

**Tech Stack:** Go, XORM, Gin, standard-library HTTP/JSON/cache primitives, React, TypeScript, Node test runner, Playwright

---

### Task 1: USD/CNY Exchange-Rate Setting

**Files:**
- Create: `internal/service/model_group_discount.go`
- Create: `internal/service/model_group_discount_test.go`
- Modify: `internal/handler/settings.go`
- Modify: `web/app/src/pages/admin/AdminSettingsPage.tsx`
- Create: `web/app/tests/unit/admin-exchange-rate-setting.test.mjs`

- [ ] **Step 1: Write failing parser tests**

Test `ParseUSDCNYExchangeRate("7.20") == 7.2`, rejection of zero, negative, NaN, infinity, blank, and nonnumeric values, and `USDCNYExchangeRateOrDefault("bad") == 7.2`.

- [ ] **Step 2: Verify red**

Run: `go test ./internal/service -run 'Test(ParseUSDCNYExchangeRate|USDCNYExchangeRateOrDefault)' -count=1`

Expected: build failure because the parser does not exist.

- [ ] **Step 3: Implement the parser and settings validation**

Add these constants and helpers to `model_group_discount.go`:

```go
const (
    USDCNYExchangeRateSettingKey = "usd_cny_exchange_rate"
    DefaultUSDCNYExchangeRate = 7.20
)

func ParseUSDCNYExchangeRate(value string) (float64, error) {
    rate, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
    if err != nil || math.IsNaN(rate) || math.IsInf(rate, 0) || rate <= 0 {
        return 0, fmt.Errorf("USD/CNY 汇率必须是大于 0 的有限数字")
    }
    return rate, nil
}
```

`USDCNYExchangeRateOrDefault` returns `DefaultUSDCNYExchangeRate` on error. In `settings.go`, validate only this setting before any upsert and return HTTP 400 when invalid.

- [ ] **Step 4: Verify green**

Run: `go test ./internal/service ./internal/handler -run 'Test(ParseUSDCNYExchangeRate|USDCNYExchangeRateOrDefault|Setting)' -count=1`

Expected: PASS.

- [ ] **Step 5: Write and run a failing frontend contract test**

Create `admin-exchange-rate-setting.test.mjs` requiring `USD/CNY 汇率`, `usd_cny_exchange_rate`, `type="number"`, and `exchangeRateValid` in `AdminSettingsPage.tsx`.

Run from `web/app`: `node --test tests/unit/admin-exchange-rate-setting.test.mjs`

Expected: FAIL because the field is absent.

- [ ] **Step 6: Add the settings-page field**

Add finite-positive validation to the save guard and this basic-settings field:

```tsx
<FieldRow label="USD/CNY 汇率">
  <Input type="number" min="0.0001" step="0.0001"
    value={form.usd_cny_exchange_rate ?? '7.20'}
    onChange={(event) => set('usd_cny_exchange_rate', event.target.value)} />
  <Tip>用于把 LiteLLM 的 USD 官方价换算为 CNY，再计算模型分组折扣。</Tip>
</FieldRow>
```

- [ ] **Step 7: Verify and commit**

Run `node --test tests/unit/admin-exchange-rate-setting.test.mjs` and `npm run build` from `web/app`, then commit only the five task files as `feat: configure official price exchange rate`.

### Task 2: LiteLLM Token-Price Loader And Cache

**Files:**
- Modify: `internal/service/model_group_discount.go`
- Modify: `internal/service/model_group_discount_test.go`

- [ ] **Step 1: Write failing parser and matching tests**

Use a small LiteLLM JSON fixture to require chat entries with positive finite input/output token prices, exact-key matching, unique final-segment matching, ambiguous-segment rejection, malformed JSON rejection, and oversized-body rejection.

- [ ] **Step 2: Verify red**

Run: `go test ./internal/service -run 'TestLiteLLM(TokenPrices|ModelMatch)' -count=1`

Expected: build failure because the catalog parser is absent.

- [ ] **Step 3: Implement parser and matching**

Decode with `json.Decoder.UseNumber`, validate numbers with `strconv.ParseFloat`, and build exact and final-segment indexes. Exact match wins; final-segment fallback succeeds only for one catalog entry. Do not fuzzy-match.

- [ ] **Step 4: Verify parser green**

Run: `go test ./internal/service -run 'TestLiteLLM(TokenPrices|ModelMatch)' -count=1`

Expected: PASS.

- [ ] **Step 5: Write failing cache tests**

With `httptest.Server` and a controllable clock, require one fetch within six hours, one fetch for concurrent cold loads, stale success after a failed expired refresh, and an error for a first-ever failed fetch.

- [ ] **Step 6: Verify cache red**

Run: `go test ./internal/service -run TestLiteLLMPriceCache -count=1`

Expected: build failure because `liteLLMPriceCache` is absent.

- [ ] **Step 7: Implement cache and verify**

Use a mutex-protected HTTP client, URL, clock, catalog, and fetched time. Limit responses to 8 MiB plus one sentinel byte, require 2xx, use a 10-second default timeout, and preserve stale data after refresh failure.

Run: `go test ./internal/service -run TestLiteLLM -count=1`

Expected: PASS. Commit both files as `feat: cache litellm official token prices`.

### Task 3: Enrich User Model Groups

**Files:**
- Modify: `internal/service/model_group.go`
- Modify: `internal/service/api_key_groups.go`
- Modify: `internal/service/model_group_discount.go`
- Modify: `internal/service/model_group_discount_test.go`
- Modify: `web/app/src/lib/api/user.ts`

- [ ] **Step 1: Write failing discount tests**

Cover `$10/M × 7.2` official CNY versus `CNY 21.6/M` selling price returning `3000` BPS, consistent input/output and multi-model values, differing values returning `inconsistent`, missing/non-token values returning `unavailable`, and one missing model not invalidating matched consistent models.

- [ ] **Step 2: Verify red**

Run: `go test ./internal/service -run TestCalculateModelGroupOfficialDiscount -count=1`

Expected: build failure because the calculation and status fields are absent.

- [ ] **Step 3: Implement calculation fields and helper**

Extend `ModelGroupSummary`:

```go
OfficialDiscountBPS *int64 `json:"official_discount_bps,omitempty"`
OfficialDiscountStatus string `json:"official_discount_status,omitempty"`
```

Calculate official CNY per million as USD per token times `1_000_000` times exchange rate. Convert selling credits with `1_000_000 credits = CNY 1`, calculate ratio BPS, and round to the nearest 10 BPS. Return `available` only if every usable dimension agrees.

- [ ] **Step 4: Verify calculation green**

Run: `go test ./internal/service -run TestCalculateModelGroupOfficialDiscount -count=1`

Expected: PASS.

- [ ] **Step 5: Write failing enrichment/serialization tests**

Require available summaries to serialize both fields, unavailable/inconsistent summaries to omit BPS, and a LiteLLM load failure to leave group listing successful with unavailable status.

- [ ] **Step 6: Implement user-only enrichment**

`enrichModelGroupOfficialDiscounts` loads the exchange-rate setting with fallback/logging, loads cached LiteLLM data, queries all requested `model_group_models` joined to `channels` once, and calculates each group without mutating billing config. Call it from `ListAvailableAPIKeyModelGroups` and `ListAPIKeyModelGroups`; do not enrich the admin group list. External price errors become unavailable while database errors remain endpoint errors.

Add the two optional fields to `ApiKeyModelGroup` in `user.ts`.

- [ ] **Step 7: Verify and commit**

Run:

`go test ./internal/service -run 'Test(CalculateModelGroupOfficialDiscount|ModelGroupOfficialDiscount|LiteLLM|ParseUSDCNY)' -count=1`

Expected: PASS. Commit task files as `feat: expose model group official discounts`.

### Task 4: Shared Discount Badge

**Files:**
- Modify: `web/app/src/components/shared/ModelGroupSelector.tsx`
- Create: `web/app/tests/unit/model-group-official-discount.test.mjs`
- Modify: `web/app/tests/e2e/api-key-model-group-provider.spec.ts`

- [ ] **Step 1: Write failing badge tests**

Require `available + 3000` to show `3折`, `available + 3250` to show `3.25折`, unavailable to show `暂无官方价`, and inconsistent to show `折扣不一致`. Add E2E fixture fields and assert badges in both new-key and group-order dialogs.

- [ ] **Step 2: Verify red**

From `web/app`, run the new Node test and `npx playwright test tests/e2e/api-key-model-group-provider.spec.ts --workers=1`.

Expected: FAIL because the badge is absent.

- [ ] **Step 3: Implement shared badge**

Add a formatter that converts BPS to folds with at most two decimals and strips trailing zeroes. Render a compact secondary badge beside the group name without moving ordering controls or changing the responsive width contract.

- [ ] **Step 4: Verify and commit**

From `web/app`, run:

```powershell
node --test tests/unit/model-group-official-discount.test.mjs tests/unit/admin-exchange-rate-setting.test.mjs
npx playwright test tests/e2e/api-key-model-group-provider.spec.ts --workers=1
npm run build
```

Expected: PASS, including the existing 390px overflow assertion. Commit task files as `feat: show official discount on model groups`.

### Task 5: Full Verification

**Files:**
- Verify all files changed since `222b6d8`; create no additional production files.

- [ ] **Step 1: Format and run Go tests**

```powershell
gofmt -w internal/service/model_group_discount.go internal/service/model_group_discount_test.go internal/service/model_group.go internal/service/api_key_groups.go internal/handler/settings.go
go test ./... -count=1
```

Expected: PASS.

- [ ] **Step 2: Run frontend checks**

From `web/app`:

```powershell
node --test tests/unit/*.test.mjs
npm run build
npm run lint
npx playwright test tests/e2e/api-key-model-group-provider.spec.ts --workers=1
```

Expected: unit tests, build, and E2E PASS. Report any existing repository-wide lint baseline separately; changed files must be clean.

- [ ] **Step 3: Audit scope**

```powershell
git diff --check 222b6d8..HEAD
git status --short
git log -8 --oneline --decorate
```

Expected: only the pre-existing `.superpowers/` remains untracked and no OctoAPI file changes.
