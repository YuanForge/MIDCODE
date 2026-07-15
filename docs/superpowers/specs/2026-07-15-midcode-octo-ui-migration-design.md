# MidCode Octo UI Migration Design

## Goal

Replace the public, authentication, user, and administrator UI in `web/app` with the visual system and page patterns defined by the OctoAPI design package, while preserving MidCode branding and the current FanAPI backend behavior.

The migration must improve the whole frontend system rather than only reskin colors. Shared tokens, shells, page templates, tables, forms, feedback states, and responsive behavior must converge on one coherent implementation.

## Confirmed Scope

Included surfaces:

- public homepage
- user login, registration, and password recovery
- administrator login
- authenticated user routes
- authenticated administrator routes
- shared frontend foundations and components used by those surfaces
- user-visible brand cleanup from FanAPI to MidCode
- per-model user Token statistics
- per-channel administrator Token statistics

Excluded surfaces for this migration:

- vendor routes
- reseller routes
- new OctoAPI product capabilities that the current backend does not support
- database schema changes
- billing or settlement behavior changes
- removal of internal compatibility identifiers

## Product and Compatibility Boundaries

### Backend compatibility

The current Go backend remains authoritative. Existing APIs, authentication, authorization, route behavior, billing, and business rules must continue to work.

The only approved backend addition is a minimal read-only Token aggregation capability implemented through dedicated endpoints. It must not change database structure, billing calculation, existing endpoint semantics, or write behavior.

### Brand behavior

The default user-facing brand is MidCode. Existing runtime and backend site settings remain able to override the displayed site name and Logo.

All user-visible FanAPI references in the included frontend and its user-facing examples must become MidCode. Internal compatibility identifiers remain unchanged when renaming them would affect deployed configuration or stored data, including examples such as:

- Go module and package paths
- `FANAPI_*` environment variables
- `window.__FANAPI_ENV__`
- existing local-storage keys
- existing card or external protocol prefixes

Repository naming and internal compatibility identifiers must never leak into visible product copy.

## Design Direction

Use the OctoAPI design system as the visual and interaction reference, but do not display the OctoAPI brand or introduce unsupported OctoAPI business features.

The interface should feel controlled, precise, calm, and operational:

- primary indigo `#4A5BE7`
- page background `#F5F6F9`
- white surfaces with subtle `#E5E8EC` borders
- foreground `#1B2130`
- restrained semantic status colors
- 8-12 px component radii
- 40 px standard controls
- 15 px application body text
- typography, spacing, borders, and surface contrast provide hierarchy instead of decorative effects

Public pages may use more generous spacing and narrative composition. Authenticated consoles use denser layouts while sharing the same tokens and components.

Dark mode remains supported through the same semantic token system.

## Architecture

The migration uses a design-system-driven incremental approach inside the existing React, Vite, Tailwind v4, and shadcn/ui application.

Implementation layers:

1. Foundations: semantic color, typography, spacing, radius, depth, motion, and responsive tokens.
2. Atoms: button, input, select, badge, tooltip, dialog, tabs, table, and other UI primitives.
3. Shared fragments: page container, page header, page section, filter bar, metric display, form layout, copyable value, and confirmation surfaces.
4. Patterns: data table, chart panel, empty/loading/error state, detail surface, settings form, and authentication panel.
5. Page templates: public page, authentication page, overview, list management, settings, statistics, documentation, and generation workspace.
6. Route pages: compose the approved templates while retaining current API clients and business behavior.

Business pages must not create a second visual language. Repeated structures should be promoted into shared fragments only after their reuse is clear.

## Shells and Navigation

### Public and authentication shell

- display MidCode or the current dynamic site brand
- use the shared design tokens and typography
- preserve current authentication flows and route guards
- keep the homepage, user authentication, and administrator authentication visually consistent with the consoles

### User console

- stable top bar and grouped sidebar navigation
- clear active route and page title
- content rendered inside one shared page container
- responsive sidebar collapse on smaller screens
- existing user routes and permissions remain unchanged

### Administrator console

- reuse the same token system and component families
- support denser tables, filters, batch actions, and permission-aware navigation
- preserve RBAC filtering and all existing administrator workflows
- keep configuration actions separate from read-only operational analysis

## Page Migration Rules

- Existing fields and actions remain unless intentionally removed by an approved product decision.
- Target design elements without backend support are omitted rather than displayed with fake data.
- Loading, empty, zero-result, partial, forbidden, and error states are component states, not separate visual systems.
- Destructive and financial actions retain explicit confirmation and result feedback.
- Tables use stable columns, numeric alignment, responsive overflow, and consistent pagination.
- Mobile layouts must reflow controls instead of shrinking Chinese text below the design baseline.

## User Token Statistics

Route: `/stats`

The user page must not display a combined Token total across different models. Every distinct model is a separate statistics row and chart category.

The page contains only:

1. a stacked horizontal bar chart
2. a detailed table

It does not contain per-model summary cards or cross-model cumulative/today cards.

Each model row exposes:

- model name
- non-cached input Token
- cache-read Token
- cache-write Token when supplied
- output Token
- normalized total Token

The page supports today, last 7 days, last 30 days, and custom time ranges. Model names are never collapsed into an `Other` category. If many models exist, the chart becomes scrollable and the table provides search and pagination.

The aggregation key is the logged model identity used for the user-facing request. Different model names must never be combined into one number.

## Administrator Channel Token Statistics

Route entry: `/admin/channels`

The administrator channel table receives a dedicated `Token 统计` action for each channel row. Token data is not shown as ordinary table columns and is not embedded in the channel edit dialog.

The action navigates to a dedicated read-only page at `/admin/channels/:id/token-stats`. The page does not share editable channel form state and provides a clear return path to the filtered channel list.

Every query is scoped by the selected `channel_id`. Channels with the same model name remain completely independent. For example, channels `94`, `97`, `105`, and `111` using `gpt-5.6-sol` each have separate results.

The analysis surface supports:

- today
- last 7 days
- last 30 days
- custom time range
- non-cached input Token
- cache-read Token
- cache-write Token
- output Token
- normalized total Token
- time trend for the selected channel

The primary aggregation key is `channel_id`, not model name.

## Cache and Total Token Normalization

The UI must avoid double-counting cached Token while preserving protocol differences.

Normalized columns are:

- `non_cached_input_tokens`
- `cache_read_tokens`
- `cache_creation_tokens`
- `output_tokens`
- `total_tokens`

For OpenAI, Responses, and Gemini-style usage, the reported input count already includes cache-read Token:

```text
non_cached_input = max(input_tokens - cache_read_tokens, 0)
total_tokens = input_tokens + output_tokens
```

For Claude-style usage, ordinary input excludes cache creation and cache reads:

```text
non_cached_input = input_tokens
total_tokens = input_tokens + cache_read_tokens + cache_creation_tokens + output_tokens
```

The normalized equivalent used for display is therefore:

```text
total_tokens = non_cached_input + cache_read_tokens + cache_creation_tokens + output_tokens
```

Cache fields that are not supplied by a protocol display as unavailable rather than fabricated zero unless the backend can distinguish a true zero from missing data.

## Read-Only Statistics API Design

The backend adds dedicated aggregation endpoints so existing response contracts remain stable.

Contracts:

```text
GET /user/stats/tokens?start_at=&end_at=&page=&page_size=&model=
GET /admin/channels/:id/token-stats?start_at=&end_at=&bucket=
```

User response groups by exact logged model name. Administrator response filters by exact channel ID before aggregation.

Queries use the `llm_logs` table and its `usage` JSON. They should:

- include only records with usable Token data
- use Asia/Shanghai boundaries for today presets
- return explicit normalized fields
- preserve zero and missing-field distinctions where possible
- avoid loading and aggregating all logs in the browser
- enforce existing user/admin authorization
- paginate model detail responses where applicable

No schema migration is required.

## Error and Empty States

- Loading: chart and table skeletons preserve final geometry.
- No usage: show a neutral empty state naming the selected model, channel, or time range.
- Partial usage: display available fields and mark missing protocol data as unavailable.
- Aggregation failure: retain the selected filters, show a retry action, and do not replace data with zero.
- Forbidden: reuse existing route and permission handling.
- Large model lists: use search, pagination, and scroll rather than combining models.

## Migration Sequence

1. Encode the approved semantic tokens and typography.
2. Rebuild shared primitives, fragments, feedback states, and page templates.
3. Migrate the public homepage and authentication pages.
4. Migrate user shell and user routes.
5. Add the read-only user Token endpoint and migrate `/stats` to the approved chart/table design.
6. Migrate administrator shell and administrator routes.
7. Add per-channel read-only Token statistics and the channel-row action.
8. Remove user-visible FanAPI branding from included surfaces.
9. Verify responsive behavior, dark mode, permissions, API compatibility, and critical interactions.

Existing uncommitted work in the repository must be preserved. Files already modified by the user require conflict-aware editing.

## Testing and Acceptance

### Frontend verification

- TypeScript build succeeds.
- Existing relevant end-to-end tests continue to pass.
- New tests cover the public/auth shells, user shell, administrator shell, `/stats`, and the channel Token action.
- Desktop and mobile browser checks cover overflow, navigation, dialogs/sheets, charts, tables, and dark mode.
- No framework overlay or relevant console error is present.

### Token statistics verification

- two channels with the same model name produce separate administrator results
- two different model names produce separate user rows and bars
- no `Other` aggregation is introduced
- OpenAI-style cache reads are not counted twice
- Claude cache reads and cache creation are included in normalized totals
- missing cache fields remain distinguishable from real zero where supported
- today boundaries use Asia/Shanghai
- unauthorized users cannot access administrator statistics
- large result sets are aggregated in the database, not the browser

### Visual acceptance

- the implementation matches the approved MidCode concepts and OctoAPI design tokens
- public, authentication, user, and administrator surfaces form one coherent system
- business functionality remains connected to the existing backend
- unsupported target-design features do not appear as fake or dead UI

## Decision

Proceed with the design-system-driven migration for the public, authentication, user, and administrator surfaces. Preserve the current backend except for minimal read-only Token aggregation endpoints. Use MidCode as the default visible brand, retain internal compatibility identifiers, show user Token usage strictly per model, and show administrator Token usage strictly per channel through a dedicated action.
