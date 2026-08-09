# FanAPI Official Price Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Let models and billing dimensions not covered by LiteLLM use administrator-supplied official prices, with USD/CNY fetched automatically and all runtime values stored as integer credits.

**Architecture:** LiteLLM remains the preferred token-price source. model_official_prices stores only supplemental source quotes and normalized credits; a Frankfurter v2 job updates the exchange-rate state and every USD normalized price in one transaction. Model-group discount enrichment batch-loads all required data and resolves each dimension independently.

**Tech Stack:** Go, Gin, XORM, PostgreSQL JSONB, math/big, React, TypeScript, shadcn/Radix, Node test runner, Playwright.

---

## File Map

- Create internal/model/model_official_price.go for the XORM model.
- Create internal/model/model_official_price_test.go for model and migration contracts.
- Create internal/service/model_official_price.go for quote validation, exact conversion, CRUD and batch loading.
- Create internal/service/model_official_price_test.go for conversion and dimension tests.
- Create internal/service/usd_cny_exchange_rate.go for Frankfurter fetch, persistence and scheduling.
- Create internal/service/usd_cny_exchange_rate_test.go for parser, failure retention and scheduler tests.
- Create internal/service/model_official_price_integration_test.go for PostgreSQL constraints and transaction tests.
- Create internal/handler/admin_model_official_price.go for CRUD, status and audit endpoints.
- Create scripts/migrate_20260809_model_official_prices.sql for existing databases.
- Create web/app/src/pages/admin/AdminOfficialPricesTab.tsx for the management UI.
- Create web/app/tests/unit/admin-official-prices.test.mjs and web/app/tests/e2e/admin-official-prices.spec.ts.
- Modify internal/db/db.go, internal/app/jobs.go, internal/service/model_group_discount.go, internal/handler/settings.go and internal/router/admin.go.
- Modify web/app/src/lib/api/admin.ts and web/app/src/pages/admin/AdminSettingsPage.tsx.
- Modify web/app/tests/unit/admin-exchange-rate-setting.test.mjs and README.md.

### Task 1: Add the official-price table and migration

**Files:**
- Create: internal/model/model_official_price.go
- Create: internal/model/model_official_price_test.go
- Create: scripts/migrate_20260809_model_official_prices.sql
- Modify: internal/db/db.go
- Modify: README.md

- [ ] **Step 1: Write the failing schema contract**

~~~go
func TestModelOfficialPriceSchemaContract(t *testing.T) {
    typ := reflect.TypeOf(ModelOfficialPrice{})
    for _, name := range []string{
        "ModelProviderID", "ModelName", "BillingType", "Currency",
        "SourcePriceConfig", "NormalizedPriceConfig", "ExchangeRateUsed", "IsActive",
    } {
        if _, ok := typ.FieldByName(name); !ok {
            t.Fatalf("missing field %s", name)
        }
    }
    migration, err := os.ReadFile("../../scripts/migrate_20260809_model_official_prices.sql")
    if err != nil || !bytes.Contains(migration, []byte("model_official_prices")) {
        t.Fatalf("migration contract missing: %v", err)
    }
}
~~~

- [ ] **Step 2: Run it and prove red**

Run: go test ./internal/model -run TestModelOfficialPriceSchemaContract -count=1

Expected: FAIL because the model and migration do not exist.

- [ ] **Step 3: Implement the model and migration**

Model fields: int64 ID/provider ID; trimmed model name; billing type; currency; model.JSON source and normalized configs; string exchange rate/date metadata; active flag and timestamps. Register it in Engine.Sync2 after ModelProvider.

The SQL migration must be idempotent and create: token/image/video/audio/count and USD/CNY checks; model_providers FK with ON DELETE RESTRICT; UNIQUE(model_provider_id, model_name, billing_type); and a lookup index including is_active.

- [ ] **Step 4: Document the production migration**

Add this exact command to README without modifying the user-owned upgrade document:

~~~bash
psql -U <user> -d <db> -f scripts/migrate_20260809_model_official_prices.sql
~~~

- [ ] **Step 5: Verify green**

Run: go test ./internal/model -run TestModelOfficialPriceSchemaContract -count=1

Expected: PASS.

Run: git diff --check

Expected: no whitespace errors.

- [ ] **Step 6: Commit**

~~~bash
git add internal/model/model_official_price.go internal/model/model_official_price_test.go internal/db/db.go scripts/migrate_20260809_model_official_prices.sql README.md
git commit -m "feat: add official price storage"
~~~

### Task 2: Normalize source quotes to exact integer credits

**Files:**
- Create: internal/service/model_official_price.go
- Create: internal/service/model_official_price_test.go

- [ ] **Step 1: Write failing conversion tests**

~~~go
func TestNormalizeOfficialPriceConfig(t *testing.T) {
    got, err := NormalizeOfficialPriceConfig("USD", "token", model.JSON{
        "input_price_per_1m_tokens": "2.5",
        "cache_read_price_per_1m_tokens": "0.25",
    }, "6.7444")
    if err != nil { t.Fatal(err) }
    if got["input_price_per_1m_tokens"] != int64(16861000) ||
       got["cache_read_price_per_1m_tokens"] != int64(1686100) {
        t.Fatalf("normalized = %#v", got)
    }
}
func TestNormalizeOfficialPriceConfigRejectsZero(t *testing.T) {
    _, err := NormalizeOfficialPriceConfig("CNY", "video", model.JSON{"price_per_second": "0"}, "")
    if err == nil { t.Fatal("zero price accepted") }
}
~~~

- [ ] **Step 2: Run and prove red**

Run: go test ./internal/service -run TestNormalizeOfficialPriceConfig -count=1

Expected: FAIL because the function does not exist.

- [ ] **Step 3: Implement the minimum normalizer**

Accept only:
- token: input, output, cache creation and cache read per-million fields;
- image: base, default and size_prices 1k/2k/3k/4k;
- video/audio: price_per_second;
- count: price_per_call.

Require decimal-string source values, at least one positive field, and only fields valid for the billing type. Use math/big.Rat. CNY multiplies by 1,000,000; USD multiplies by rate and 1,000,000. Round halves away from zero to int64 and reject overflow. Preserve nested image maps and raw strings; normalized JSON contains int64 values only.

- [ ] **Step 4: Complete the boundary matrix**

Add CNY count, image tier, USD per-second, rounding tie, invalid currency, wrong billing field, raw JSON number, bad rate and overflow cases.

- [ ] **Step 5: Verify green**

Run: go test ./internal/service -run 'Test(NormalizeOfficialPriceConfig|OfficialPrice)' -count=1

Expected: PASS.

- [ ] **Step 6: Commit**

~~~bash
git add internal/service/model_official_price.go internal/service/model_official_price_test.go
git commit -m "feat: normalize official prices to credits"
~~~

### Task 3: Fetch and persist USD/CNY automatically

**Files:**
- Create: internal/service/usd_cny_exchange_rate.go
- Create: internal/service/usd_cny_exchange_rate_test.go
- Modify: internal/app/jobs.go
- Modify: internal/handler/settings.go
- Modify: internal/service/model_group_discount.go
- Modify: internal/service/model_group_discount_test.go

- [ ] **Step 1: Write failing Frankfurter v2 parser tests**

~~~go
func TestParseFrankfurterUSDCNYRate(t *testing.T) {
    body := "{\"date\":\"2026-08-09\",\"base\":\"USD\",\"quote\":\"CNY\",\"rate\":6.7444}"
    got, err := parseFrankfurterUSDCNYRate(strings.NewReader(body), 64<<10)
    if err != nil || got.Value != "6.7444" || got.Date != "2026-08-09" {
        t.Fatalf("rate=%#v err=%v", got, err)
    }
}
func TestParseFrankfurterUSDCNYRateRejectsWrongQuote(t *testing.T) {
    body := "{\"date\":\"2026-08-09\",\"base\":\"USD\",\"quote\":\"EUR\",\"rate\":1}"
    if _, err := parseFrankfurterUSDCNYRate(strings.NewReader(body), 64<<10); err == nil {
        t.Fatal("wrong quote accepted")
    }
}
~~~

- [ ] **Step 2: Run and prove red**

Run: go test ./internal/service -run TestParseFrankfurterUSDCNYRate -count=1

Expected: FAIL.

- [ ] **Step 3: Implement fixed fetch and transactional persistence**

Use https://api.frankfurter.dev/v2/rate/USD/CNY, a 10-second client, 64 KiB cap and json.Decoder.UseNumber. Validate base USD, quote CNY, date and positive rate.

Persist usd_cny_exchange_rate plus source/date/synced_at/last_attempt_at/last_error settings. Successful refresh begins one XORM session, upserts successful state, re-normalizes every USD row including inactive rows, and commits. Any conversion/write failure rolls back. An unchanged value/date only updates sync state. Request failure records bounded attempt/error state but preserves the previous successful value and normalized prices.

Delete the hard-coded 7.20 behavior. Existing manual rate data is unavailable unless valid automatic source/date/sync metadata exists.

- [ ] **Step 4: Start the six-hour job and block client writes**

Call service.StartUSDCNYExchangeRateSyncer(ctx) from startJobs. It runs immediately, then every six hours, stops on ctx.Done and uses an atomic process-local overlap guard.

UpdateSettings returns 400 before writing if any request key starts with usd_cny_exchange_rate. Only the service worker can write those keys.

- [ ] **Step 5: Test failures and lifecycle**

Use httptest.Server for valid data, HTTP 503, wrong pair, malformed JSON and oversized body. Test cancellation. Assert previous success survives refresh failure and first-ever failure yields no usable rate.

- [ ] **Step 6: Verify green**

Run: go test ./internal/service ./internal/handler -run 'Test(ParseFrankfurterUSDCNYRate|USDCNYExchangeRate|UpdateSettings|ParseUSDCNY)' -count=1

Expected: PASS.

- [ ] **Step 7: Commit**

~~~bash
git add internal/service/usd_cny_exchange_rate.go internal/service/usd_cny_exchange_rate_test.go internal/app/jobs.go internal/handler/settings.go internal/service/model_group_discount.go internal/service/model_group_discount_test.go
git commit -m "feat: sync official price exchange rate"
~~~

### Task 4: Add official-price CRUD, permission checks and audit

**Files:**
- Modify: internal/service/model_official_price.go
- Create: internal/handler/admin_model_official_price.go
- Modify: internal/router/admin.go
- Create: internal/service/model_official_price_integration_test.go

- [ ] **Step 1: Write failing service and route tests**

~~~go
func TestValidateOfficialPriceInputRequiresProvider(t *testing.T) {
    err := validateModelOfficialPriceInput(CreateModelOfficialPriceInput{
        ModelName: "qwen-max", BillingType: "token", Currency: "CNY",
        SourcePriceConfig: model.JSON{"input_price_per_1m_tokens": "2"},
    })
    if !errors.Is(err, ErrModelOfficialPriceProviderNotFound) {
        t.Fatalf("err=%v", err)
    }
}
func TestOfficialPriceRoutesDeclared(t *testing.T) {
    source, err := os.ReadFile("../router/admin.go")
    if err != nil { t.Fatal(err) }
    for _, route := range []string{
        `admin.GET("/model-official-prices"`,
        `admin.POST("/model-official-prices"`,
        `admin.PUT("/model-official-prices/:id"`,
        `admin.PATCH("/model-official-prices/:id/status"`,
        `admin.DELETE("/model-official-prices/:id"`,
    } {
        if !bytes.Contains(source, []byte(route)) { t.Errorf("missing %s", route) }
    }
}
~~~

- [ ] **Step 2: Run and prove red**

Run: go test ./internal/service ./internal/handler -run 'Test(ValidateOfficialPriceInput|OfficialPriceRoutesDeclared)' -count=1

Expected: FAIL.

- [ ] **Step 3: Implement service CRUD**

Add typed create/update input and list filter. Trim model name, validate provider existence, read the current valid automatic rate inside USD create/update transactions, normalize raw values, and map duplicate-key failures to a sentinel conflict. List joins model_providers and supports page, size, provider, model substring, billing type and active state.

- [ ] **Step 4: Implement handlers and audit**

Register GET/POST /admin/model-official-prices and PUT/PATCH status/DELETE routes under /admin/model-official-prices/:id. Every handler first calls requireAdminPermission(c, "settings:write").

Return 400 validation, 404 missing provider/record, 409 duplicate and 500 storage failure. Successful create/update/status/delete inserts AdminAuditLog with ResourceType model_official_price, admin identity, action, IP, UA and source/normalized details.

- [ ] **Step 5: Add isolated PostgreSQL integration tests**

Run only when FANAPI_TEST_DATABASE_URL is set; otherwise call t.Skip with that exact reason. Connect using a separate XORM engine, create a unique official_price_test_<unix_nano> schema, set search_path, create only model_providers, system_settings and admin_audit_logs, then run the migration to create model_official_prices. Drop exactly that schema in t.Cleanup.

Prove: database uniqueness rejects duplicates; successful rate refresh changes two USD rows but not one CNY row; one overflowing USD source rolls back both rate settings and all normalized records.

- [ ] **Step 6: Verify green**

Run: go test ./internal/service ./internal/handler -run 'Test(ValidateOfficialPriceInput|OfficialPriceRoutesDeclared|ModelOfficialPricePostgres)' -count=1

Expected: unit/API PASS; PostgreSQL test SKIP without its environment variable.

- [ ] **Step 7: Commit**

~~~bash
git add internal/service/model_official_price.go internal/handler/admin_model_official_price.go internal/router/admin.go internal/service/model_official_price_integration_test.go
git commit -m "feat: manage supplemental official prices"
~~~

### Task 5: Merge LiteLLM and supplemental dimensions

**Files:**
- Modify: internal/service/model_group_discount.go
- Modify: internal/service/model_group_discount_test.go
- Modify: internal/service/model_official_price.go

- [ ] **Step 1: Write the failing precedence test**

~~~go
func TestCalculateModelGroupOfficialDiscountUsesLiteLLMThenSupplement(t *testing.T) {
    row := modelGroupDiscountRow{ModelProviderID: 1, Model: "model-a", BillingType: "token",
        BillingConfig: model.JSON{"input_price_per_1m_tokens": int64(13500000),
            "output_price_per_1m_tokens": int64(27000000),
            "cache_read_price_per_1m_tokens": int64(1350000)}}
    catalog := catalogWith("model-a", liteLLMTokenPrice{InputUSDPerToken: 0.000002, OutputUSDPerToken: 0.000004})
    extra := supplementalWith(1, "model-a", "token", model.JSON{"cache_read_price_per_1m_tokens": int64(1350000)})
    bps, status := calculateModelGroupOfficialDiscount([]modelGroupDiscountRow{row}, catalog, extra, validRate("6.75"))
    if status != officialDiscountAvailable || *bps != 10000 { t.Fatalf("bps=%v status=%s", bps, status) }
}
~~~

- [ ] **Step 2: Run and prove red**

Run: go test ./internal/service -run TestCalculateModelGroupOfficialDiscountUsesLiteLLMThenSupplement -count=1

Expected: FAIL.

- [ ] **Step 3: Implement dimension-level merge without N+1 queries**

Parse optional positive LiteLLM cache-creation and cache-read fields. Add model provider ID to the discount row and SELECT. Batch-load all active supplemental tuples, matching the trimmed channel model to supplemental model_name exactly; do not add fuzzy or path-segment matching for supplemental rows.

For token dimensions use LiteLLM only when the field and automatic rate are valid; otherwise use the same supplemental field. For image/video/audio/count treat LiteLLM as unsupported in this release and use matching supplemental fields. Never let supplemental data override a successfully converted LiteLLM field. Preserve 10-BPS rounding and available/inconsistent/unavailable semantics. Do not mutate billing_config.

- [ ] **Step 4: Complete the regression matrix**

Cover LiteLLM input/output plus supplemental cache; LiteLLM cache winning over supplemental; CNY supplemental without rate; disabled/wrong-provider/wrong-model/wrong-type rows ignored; exact supplemental name matching; image tier; video second; count call; inconsistent multi-row group; LiteLLM cold-start failure with usable supplemental data; and unchanged official_discount_bps/official_discount_status JSON serialization.

- [ ] **Step 5: Verify green**

Run: go test ./internal/service -run 'Test(LiteLLM|CalculateModelGroupOfficialDiscount|ModelGroupOfficialDiscount)' -count=1

Expected: PASS.

- [ ] **Step 6: Commit**

~~~bash
git add internal/service/model_group_discount.go internal/service/model_group_discount_test.go internal/service/model_official_price.go
git commit -m "feat: fallback to supplemental official prices"
~~~

### Task 6: Build the official-price settings tab

**Files:**
- Modify: web/app/src/lib/api/admin.ts
- Create: web/app/src/pages/admin/AdminOfficialPricesTab.tsx
- Modify: web/app/src/pages/admin/AdminSettingsPage.tsx
- Modify: web/app/tests/unit/admin-exchange-rate-setting.test.mjs
- Create: web/app/tests/unit/admin-official-prices.test.mjs
- Create: web/app/tests/e2e/admin-official-prices.spec.ts

- [ ] **Step 1: Write a failing UI contract**

~~~js
test('official prices use an automatic isolated settings tab', async () => {
  const settings = await readFile(new URL('../../src/pages/admin/AdminSettingsPage.tsx', import.meta.url), 'utf8')
  const tab = await readFile(new URL('../../src/pages/admin/AdminOfficialPricesTab.tsx', import.meta.url), 'utf8')
  assert.match(settings, /official-prices/)
  assert.doesNotMatch(settings, /type="number"[\s\S]{0,240}usd_cny_exchange_rate/)
  assert.match(tab, /listModelOfficialPrices/)
  assert.match(tab, /Frankfurter/)
  assert.match(tab, /AlertDialog/)
})
~~~

Create the Playwright test during the same red phase. It installs an admin token, calls an in-file installOfficialPriceRouteMocks helper for public settings, admin identity, providers, system settings and official-price CRUD, opens the tab at 1280x720, and proves the create-dialog footer is inside the viewport:

~~~ts
test('official-price dialog keeps save visible at 1280x720', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('admin_token', 'mock-admin-token'))
  await installOfficialPriceRouteMocks(page)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/admin/settings')
  await page.getByRole('tab', { name: '官方价' }).click()
  await page.getByRole('button', { name: '新增官方价' }).click()
  const save = page.getByRole('button', { name: '保存', exact: true })
  await expect(save).toBeVisible()
  const box = await save.boundingBox()
  expect((box?.y ?? 9999) + (box?.height ?? 0)).toBeLessThanOrEqual(720)
})
~~~

The helper fulfills each named endpoint with fixed JSON and records POST, PUT, PATCH and DELETE payloads. The test uses those records to assert create, edit, `{ is_active: false }`, delete and filter behavior without a live backend.

- [ ] **Step 2: Run and prove red**

Run from web/app: node --test tests/unit/admin-exchange-rate-setting.test.mjs tests/unit/admin-official-prices.test.mjs

Run from web/app: PLAYWRIGHT_PREVIEW_PORT=4311 npx playwright test tests/e2e/admin-official-prices.spec.ts --workers=1

Expected: FAIL.

- [ ] **Step 3: Add typed API methods**

Declare official-price and exchange-rate status types. Add list/create/update/status/delete methods matching Task 4. List returns items, total and exchange_rate.

- [ ] **Step 4: Implement the standalone tab**

Show read-only Frankfurter value/date/sync/error state, provider/type/status filters, model search, a horizontal table and add command. Use Dialog for create/edit and AlertDialog for status/delete. The dialog is a max-h 86vh flex column; only fields scroll and footer is shrink-0.

Use select controls for provider/type/currency. Render only selected billing dimensions; image has base/default and explicit 1k-4k fields. Send decimal strings. Use lucide edit/power/trash icons with tooltips/titles and aria-labels.

- [ ] **Step 5: Integrate settings safely**

Remove the editable USD/CNY input. Before updateSettings, delete every payload key beginning usd_cny_exchange_rate. Make TabsList horizontally scrollable and triggers shrink-0. The page Save Settings action depends on theme validation only, never exchange availability.

- [ ] **Step 6: Verify unit tests and build**

Run from web/app: node --test tests/unit/admin-exchange-rate-setting.test.mjs tests/unit/admin-official-prices.test.mjs

Expected: PASS.

Run: npm run build

Expected: PASS.

Run: PLAYWRIGHT_PREVIEW_PORT=4311 npx playwright test tests/e2e/admin-official-prices.spec.ts --workers=1

Expected: PASS. The test also checks 1920x1080, then switches to 390x844, verifies no document-width overflow, exercises create/edit/status/delete/filter flows, and writes desktop/mobile screenshots.

- [ ] **Step 7: Commit**

~~~bash
git add web/app/src/lib/api/admin.ts web/app/src/pages/admin/AdminOfficialPricesTab.tsx web/app/src/pages/admin/AdminSettingsPage.tsx web/app/tests/unit/admin-exchange-rate-setting.test.mjs web/app/tests/unit/admin-official-prices.test.mjs web/app/tests/e2e/admin-official-prices.spec.ts
git commit -m "feat: add official price settings tab"
~~~

### Task 7: Browser regression and final verification

**Files:**
- Modify: no production files unless a regression assertion exposes a defect.

- [ ] **Step 1: Re-run browser regression from a clean preview**

Run from web/app: PLAYWRIGHT_PREVIEW_PORT=4311 npx playwright test tests/e2e/admin-official-prices.spec.ts --workers=1

Expected: PASS for read-only rate, create, edit, status, delete, filters and both viewports.

- [ ] **Step 2: Run final verification**

Run: go test ./... -count=1

Expected: PASS.

Run from web/app:

~~~bash
node --test tests/unit/model-group-official-discount.test.mjs tests/unit/admin-exchange-rate-setting.test.mjs tests/unit/admin-official-prices.test.mjs
npm run build
PLAYWRIGHT_PREVIEW_PORT=4311 npx playwright test tests/e2e/admin-official-prices.spec.ts --workers=1
~~~

Expected: PASS.

When FANAPI_TEST_DATABASE_URL is set, run go test ./internal/service -run TestModelOfficialPricePostgres -count=1 and require PASS. Otherwise report SKIP and do not claim PostgreSQL transaction verification.

- [ ] **Step 3: Scope check**

Run: git diff --check && git status --short

Expected: no whitespace errors and no user files staged.

If no defect is found, do not create an empty commit. If a regression fails, tighten the failing assertion first, make the smallest production fix, re-run all Task 7 commands, and commit only reviewed fix files as `fix: harden official price management`.

## Execution Constraints

- Preserve web/app/src/pages/user/UserModelsPage.tsx, web/app/tests/unit/user-model-details.test.mjs, .superpowers/ and docs/upgrade-v1.0.39-to-v1.0.43.md.
- Do not add a manual rate, fixed 7.20 fallback, configurable rate URL or third-party dependency.
- Do not modify actual billing, channel selling prices or channel billing_config.
- Run each task's targeted test before its commit and all Task 7 checks before declaring completion.
