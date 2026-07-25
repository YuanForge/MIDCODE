# FanAPI Theme Startup Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FanAPI load and apply a backend-configured brand theme before revealing the application, using the approved neutral geometric loading state and a recoverable error state.

**Architecture:** Keep `system_settings` as the only persistence layer and expose `theme_color` through the existing public settings API. Replace per-component settings fetches with one React context provider, derive safe light/dark brand CSS variables from a validated hex color, and gate the router until configuration and theme application are ready.

**Tech Stack:** Go/Gin/XORM, React 19, TypeScript, Tailwind CSS v4, Node test runner, Playwright.

---

### Task 1: Expose the theme setting publicly

**Files:**
- Modify: `internal/handler/settings_public_test.go`
- Modify: `internal/handler/settings.go:14-43`

- [ ] **Step 1: Write the failing backend contract test**

Replace the SEO-only assertion with a public branding assertion:

```go
func TestPublicSettingKeysExposeBranding(t *testing.T) {
	for _, key := range []string{"site_name", "logo_url", "seo_title", "seo_description", "theme_color"} {
		if !publicSettingKeys[key] {
			t.Fatalf("public setting key %q is not exposed", key)
		}
	}
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `go test ./internal/handler -run TestPublicSettingKeysExposeBranding -count=1`

Expected: FAIL with `public setting key "theme_color" is not exposed`.

- [ ] **Step 3: Add the setting to the public whitelist**

Add this entry beside the other branding keys:

```go
"theme_color":                  true,
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `go test ./internal/handler -run TestPublicSettingKeysExposeBranding -count=1`

Expected: PASS.

- [ ] **Step 5: Commit the backend contract**

```powershell
git add -- internal/handler/settings.go internal/handler/settings_public_test.go
git commit -m "feat: expose public brand theme setting"
```

### Task 2: Add safe light and dark theme derivation

**Files:**
- Create: `web/app/src/lib/brand-theme.ts`
- Create: `web/app/tests/unit/brand-theme.test.mjs`
- Modify: `web/app/src/index.css:10-48,113-150`

- [ ] **Step 1: Write failing tests for validation, contrast, and cleanup**

Create a Node test that transpiles `brand-theme.ts` with the installed TypeScript package and asserts:

```js
assert.equal(normalizeBrandColor('#2563eb'), '#2563eb')
assert.equal(normalizeBrandColor(' #0af '), '#00aaff')
assert.equal(normalizeBrandColor('#fff; color:red'), null)

for (const color of ['#2563eb', '#facc15', '#111827', '#ffffff']) {
  const vars = buildBrandTheme(color)
  assert.ok(getContrastRatio(vars['--brand-primary'], vars['--brand-primary-foreground']) >= 4.5)
  assert.ok(getContrastRatio(vars['--brand-primary-dark'], vars['--brand-primary-foreground-dark']) >= 4.5)
}

assert.ok(BRAND_THEME_VARIABLES.every((name) => name.startsWith('--brand-')))
assert.ok(BRAND_THEME_VARIABLES.every((name) => !/(success|warning|destructive)/.test(name)))
```

- [ ] **Step 2: Run the test and verify RED**

Run from `web/app`: `node --test tests/unit/brand-theme.test.mjs`

Expected: FAIL because `src/lib/brand-theme.ts` does not exist.

- [ ] **Step 3: Implement the theme module**

Create a focused module with these exports and behavior:

```ts
export const BRAND_THEME_VARIABLES = [
  '--brand-primary', '--brand-primary-foreground', '--brand-accent',
  '--brand-accent-foreground', '--brand-ring', '--brand-chart-1',
  '--brand-sidebar-primary', '--brand-sidebar-primary-foreground',
  '--brand-sidebar-accent', '--brand-sidebar-accent-foreground',
  '--brand-primary-dark', '--brand-primary-foreground-dark', '--brand-accent-dark',
  '--brand-accent-foreground-dark', '--brand-ring-dark', '--brand-chart-1-dark',
  '--brand-sidebar-primary-dark', '--brand-sidebar-primary-foreground-dark',
  '--brand-sidebar-accent-dark', '--brand-sidebar-accent-foreground-dark',
] as const

export function normalizeBrandColor(value: string): string | null
export function getContrastRatio(first: string, second: string): number
export function buildBrandTheme(value: string): Record<string, string> | null
export function clearBrandTheme(root = document.documentElement): void
export function applyBrandTheme({ themeColor }: { themeColor: string }, root = document.documentElement): void
```

Use RGB mixing and WCAG relative luminance. Ensure primary has at least 3:1 contrast against the mode background and primary foreground has at least 4.5:1 contrast against primary. Invalid input must clear dynamic variables and `data-brand-theme`.

- [ ] **Step 4: Wire CSS tokens to dynamic brand variables**

Change only brand-controlled tokens, retaining current values as fallbacks:

```css
--primary: var(--brand-primary, #4a5be7);
--primary-foreground: var(--brand-primary-foreground, #ffffff);
--accent: var(--brand-accent, #eceefd);
--accent-foreground: var(--brand-accent-foreground, #3b49c7);
--ring: var(--brand-ring, #7582f0);
--chart-1: var(--brand-chart-1, oklch(0.58 0.07 224));
--sidebar-primary: var(--brand-sidebar-primary, #4a5be7);
--sidebar-primary-foreground: var(--brand-sidebar-primary-foreground, #ffffff);
--sidebar-accent: var(--brand-sidebar-accent, #eceefd);
--sidebar-accent-foreground: var(--brand-sidebar-accent-foreground, #3b49c7);
```

Apply the corresponding `*-dark` variables in `.dark`. Do not change success, warning, destructive, background, border, or typography tokens.

- [ ] **Step 5: Run the theme tests and build**

Run from `web/app`:

```powershell
node --test tests/unit/brand-theme.test.mjs
pnpm build
```

Expected: theme tests PASS and production build succeeds.

- [ ] **Step 6: Commit the theme engine**

```powershell
git add -- web/app/src/lib/brand-theme.ts web/app/src/index.css web/app/tests/unit/brand-theme.test.mjs
git commit -m "feat: derive FanAPI brand theme tokens"
```

### Task 3: Centralize site settings and gate application startup

**Files:**
- Modify: `web/app/tests/unit/site-settings-loading.test.mjs`
- Modify: `web/app/src/hooks/use-site-settings.ts`
- Create: `web/app/src/components/shared/SiteLoadingScreen.tsx`
- Create: `web/app/src/components/shared/site-loading-screen.css`
- Modify: `web/app/src/app/App.tsx`

- [ ] **Step 1: Write failing startup-gate contract assertions**

Extend `site-settings-loading.test.mjs` to assert all of these contracts:

```js
assert.match(app, /SiteSettingsProvider/)
assert.match(app, /SiteSettingsGate/)
assert.match(loadingScreen, /neutral-site-loading-screen/)
assert.doesNotMatch(loadingScreen, /GATEWAY|LLM|IMAGE|VIDEO/)
assert.match(hook, /status: 'loading' \| 'ready' \| 'error'/)
assert.match(hook, /themeColor: string/)
assert.match(hook, /getRuntimeString\('theme_color'\)/)
assert.match(hook, /applyBrandTheme\(\{ themeColor: settings\.themeColor \}\)/)
assert.doesNotMatch(hook, /MINIMUM_LOADING_MS/)
```

- [ ] **Step 2: Run the contract test and verify RED**

Run from `web/app`: `node --test tests/unit/site-settings-loading.test.mjs`

Expected: FAIL because the provider, gate, loading screen, and theme fields are absent.

- [ ] **Step 3: Convert the hook to a single provider**

Preserve every existing `SiteSettings` field, add `themeColor`, and expose:

```ts
type SiteSettingsContextValue = {
  settings: SiteSettings
  status: 'loading' | 'ready' | 'error'
  loaded: boolean
  retry: () => void
  updateThemeColor: (themeColor: string) => void
}
```

The provider must request `/public/settings` once, parse backend `theme_color` with `getRuntimeString('theme_color')` only as its fallback, apply theme variables in `useLayoutEffect`, and preserve existing SEO behavior. A failed request sets `error`; retry sets `loading` and performs a fresh request. Do not add an artificial delay.

- [ ] **Step 4: Implement approved neutral loading and error states**

Create `SiteLoadingScreen` with two states:

```tsx
<main className="neutral-site-loading-screen" aria-busy={!error}>
  {error ? (
    <div className="site-loading-error">
      <p>站点配置加载失败</p>
      <Button variant="outline" onClick={onRetry}>重新加载</Button>
    </div>
  ) : (
    <div className="site-loading-geometry" role="status" aria-label="正在连接服务">
      <div className="site-loading-ring" />
      <div className="site-loading-diamond"><NetworkIcon /></div>
      <p>正在连接服务</p>
      <span>配置完成后自动进入</span>
    </div>
  )}
</main>
```

Use neutral gray CSS only. Add a breathing ring animation and disable it under `prefers-reduced-motion: reduce`. The failure branch must not render the animated geometry.

- [ ] **Step 5: Gate the router in App**

Wrap the existing providers as follows:

```tsx
<SiteSettingsProvider>
  <TooltipProvider>
    <SiteSettingsGate>
      <RouterProvider router={router} />
    </SiteSettingsGate>
    <Toaster position="top-right" richColors closeButton />
  </TooltipProvider>
</SiteSettingsProvider>
```

`SiteSettingsGate` renders the loading component for `loading`, its error variant for `error`, and children only for `ready`.

- [ ] **Step 6: Run focused and full frontend checks**

Run from `web/app`:

```powershell
node --test tests/unit/site-settings-loading.test.mjs tests/unit/brand-theme.test.mjs
node --test tests/unit/*.test.mjs
pnpm build
```

Expected: all unit tests PASS and build succeeds.

- [ ] **Step 7: Commit the startup gate**

```powershell
git add -- web/app/src/hooks/use-site-settings.ts web/app/src/app/App.tsx web/app/src/components/shared/SiteLoadingScreen.tsx web/app/src/components/shared/site-loading-screen.css web/app/tests/unit/site-settings-loading.test.mjs
git commit -m "feat: gate FanAPI startup on site settings"
```

### Task 4: Add administrator theme controls and immediate application

**Files:**
- Create: `web/app/src/components/shared/ThemeColorField.tsx`
- Create: `web/app/tests/unit/admin-theme-settings.test.mjs`
- Modify: `web/app/src/pages/admin/AdminSettingsPage.tsx`

- [ ] **Step 1: Write a failing administrator UI contract test**

Assert that the settings page imports `ThemeColorField` and `useSiteSettings`, binds `form.theme_color`, validates it, disables save on invalid input, and calls `updateThemeColor(form.theme_color ?? '')` only after `adminApi.updateSettings(payload)` succeeds.

- [ ] **Step 2: Run the test and verify RED**

Run from `web/app`: `node --test tests/unit/admin-theme-settings.test.mjs`

Expected: FAIL because the field and immediate update behavior do not exist.

- [ ] **Step 3: Create a dependency-free theme color field**

Use existing `Button`, `Input`, and `Label` components. Provide a native color input, normalized hex input, five preset buttons (`#4a5be7`, `#2563eb`, `#0f766e`, `#7c3aed`, `#b45309`), validation text, and a restore-default button. Export `isThemeColorValueValid` using `normalizeBrandColor`.

- [ ] **Step 4: Integrate the field and immediate update**

Place the control after site name in the basic settings tab:

```tsx
<FieldRow label="主题颜色">
  <ThemeColorField value={form.theme_color ?? ''} onChange={(value) => set('theme_color', value)} />
</FieldRow>
```

Compute `themeColorValid`, disable the page save button when false, and after the existing update request succeeds call `updateThemeColor(form.theme_color ?? '')` before the success toast.

- [ ] **Step 5: Run focused checks**

Run from `web/app`:

```powershell
node --test tests/unit/admin-theme-settings.test.mjs tests/unit/site-settings-loading.test.mjs tests/unit/brand-theme.test.mjs
pnpm build
```

Expected: all tests PASS and build succeeds.

- [ ] **Step 6: Commit the administrator controls**

```powershell
git add -- web/app/src/components/shared/ThemeColorField.tsx web/app/src/pages/admin/AdminSettingsPage.tsx web/app/tests/unit/admin-theme-settings.test.mjs
git commit -m "feat: configure FanAPI theme color"
```

### Task 5: Verify delayed loading, retry, theme persistence, and responsive rendering

**Files:**
- Create: `web/app/tests/e2e/brand-theme-startup.spec.ts`

- [ ] **Step 1: Write browser tests for the target flow**

Cover these flows with Playwright route interception:

1. Hold `/api/public/settings`; assert the neutral loader is visible and the login form is absent; fulfill with `theme_color: '#0f766e'`; assert the loader disappears, login renders, and `<html data-brand-theme="#0f766e">` exists.
2. Fail the first request; assert error and retry; click retry; fulfill successfully; assert the application renders.
3. Toggle dark mode and verify the custom dark primary variable is present.
4. Repeat the initial load at 390x844 and assert no horizontal overflow.

- [ ] **Step 2: Run the new E2E test and fix only observed failures**

Run from `web/app`: `pnpm test:e2e -- brand-theme-startup.spec.ts`

Expected: all new tests PASS.

- [ ] **Step 3: Run repository-level verification**

Run:

```powershell
go test ./internal/handler -count=1
go test ./... -count=1
Set-Location web/app
node --test tests/unit/*.test.mjs
pnpm lint
pnpm build
pnpm test:e2e
Set-Location ../..
git -c core.whitespace=cr-at-eol diff --check
git status --short
```

Expected: Go tests, frontend unit tests, lint, build, and E2E pass; diff check is clean; only the visual companion directory may remain untracked.

- [ ] **Step 4: Commit the E2E coverage**

```powershell
git add -- web/app/tests/e2e/brand-theme-startup.spec.ts
git commit -m "test: verify FanAPI themed startup flow"
```

- [ ] **Step 5: Perform rendered browser QA**

The flow under test is: `/login` -> delayed public settings -> neutral geometric loader -> backend theme applied -> login rendered; then failed public settings -> retry -> successful render.

Verify desktop 1440x900 and mobile 390x844 for page identity, nonblank content, no framework overlay, console health, screenshot evidence, and retry interaction. Record production/backend runtime as unverified unless a safe isolated backend is available.
