# MidCode Frontend Design Contract

## Purpose

This document is the current frontend contract for MidCode. It governs the React, Vite, Tailwind CSS v4, and shadcn/ui application in `web/app` and takes priority over page-level styling decisions.

MidCode uses the OctoAPI design package as a visual and interaction reference only. The OctoAPI name, unsupported capabilities, and example-only data must not appear in the product.

## Product and Backend Boundaries

- The default visible product name is **MidCode**.
- Runtime and backend site settings may replace the visible site name and logo. Components must render the current dynamic brand instead of hardcoding MidCode when settings are available.
- Internal compatibility identifiers remain unchanged, including Go module paths, `FANAPI_*` environment variables, `window.__FANAPI_ENV__`, storage keys, protocol prefixes, database fields, and API contracts.
- The existing Go backend is authoritative for authentication, authorization, routes, billing, settlement, and business rules.
- The current application has public, user, administrator, vendor, and reseller contexts. The approved OctoAPI-derived migration covers public/authentication, user, and administrator surfaces; vendor and reseller behavior remains supported but is outside that migration scope.
- Existing role guards and permission-aware navigation must be preserved. A visual redesign does not authorize new roles, routes, fields, actions, or backend behavior.

## Experience Direction

The interface is controlled, precise, calm, and operational. Hierarchy comes from typography, spacing, surface contrast, and borders rather than decorative effects.

- Public and authentication pages may use generous spacing and narrative composition.
- Authenticated consoles use denser layouts optimized for scanning, filters, tables, forms, and operational actions.
- Both density modes share the same tokens, primitives, states, and responsive rules.
- Public, user, administrator, vendor, and reseller contexts belong to one product system, not separate visual systems.

Avoid gradients, glassmorphism, excessive shadows, improvised card treatments, oversized console typography, competing accent colors, and decorative animation.

## Foundations

### Semantic color tokens

Use semantic utilities such as `bg-background`, `text-foreground`, and `border-border`. Raw brand colors must not be embedded in pages or components.

Light mode:

| Token | Value |
| --- | --- |
| background | `#F5F6F9` |
| foreground | `#1B2130` |
| card, popover, sidebar | `#FFFFFF` |
| primary | `#4A5BE7` |
| primary-foreground | `#FFFFFF` |
| secondary, muted | `#F1F3F7` |
| muted-foreground | `#5C6472` |
| accent | `#ECEEFD` |
| accent-foreground | `#3B49C7` |
| border, input | `#E5E8EC` |
| ring | `#7582F0` |

Dark mode:

| Token | Value |
| --- | --- |
| background | `#0E1013` |
| foreground | `#E7E9EE` |
| card | `#16181D` |
| card-foreground | `#E7E9EE` |
| popover | `#1C1F26` |
| popover-foreground | `#E7E9EE` |
| primary | `#7C86FF` |
| primary-foreground | `#0E1013` |
| secondary | `#1C1F26` |
| secondary-foreground | `#E7E9EE` |
| muted | `#1C1F26` |
| muted-foreground | `#99A0AD` |
| accent | `#262A31` |
| accent-foreground | `#E7E9EE` |
| destructive | `oklch(0.71 0.18 23)` |
| border, input | `#262A31` |
| ring | `#7C86FF` |
| chart-1 | `oklch(0.74 0.05 220)` |
| chart-2 | `oklch(0.69 0.05 190)` |
| chart-3 | `oklch(0.74 0.05 120)` |
| chart-4 | `oklch(0.75 0.08 80)` |
| chart-5 | `oklch(0.71 0.1 30)` |
| sidebar | `#16181D` |
| sidebar-foreground | `#E7E9EE` |
| sidebar-primary | `#7C86FF` |
| sidebar-primary-foreground | `#0E1013` |
| sidebar-accent | `#262A31` |
| sidebar-accent-foreground | `#E7E9EE` |
| sidebar-border | `#262A31` |
| sidebar-ring | `#7C86FF` |

Status colors are reserved for status meaning. Hover, selection, active navigation, focus, warning, success, and destructive states must remain distinguishable in both themes.

### Typography

- Product font stack: `PingFang SC`, `Microsoft YaHei UI`, `Noto Sans SC`, `Geist Variable`, `sans-serif`.
- Application body text is 15 px.
- Headings are compact and confident; labels and helper text support rather than compete with primary content.
- Use tabular numeric styles where values must be scanned or compared.
- Chinese text must not be reduced below the readable baseline to force a layout to fit.

### Shape, controls, and depth

- Base radius is 12 px (`0.75rem`); standard cards use `rounded-xl` with semantic borders.
- Standard buttons and inputs are 40 px high.
- Table headers are 44 px high; standard body rows and cells are 48 px high.
- Borders provide the primary surface separation. Shadows stay subtle and functional.
- Motion is fast and restrained: focus, hover, selection, loading, dialog, and sheet feedback only.

## Component Hierarchy

Frontend work follows this hierarchy:

1. **Foundations** — semantic color, typography, spacing, radius, depth, motion, and responsive tokens.
2. **Atoms** — button, input, select, badge, tooltip, dialog, tabs, table, and other shadcn/ui primitives.
3. **Fragments** — page container, page header, page section, filter bar, metric display, form layout, copyable value, and confirmation surfaces.
4. **Patterns** — data table, chart panel, empty/loading/error state, detail surface, settings form, and authentication panel.
5. **Page Templates** — public page, authentication page, overview, list management, settings, statistics, documentation, and generation workspace.
6. **Route Pages** — compose approved templates while retaining existing API clients, permissions, and business behavior.

Use existing components and variants first. Promote repeated structures only when reuse is real. Pages must not create bespoke button, card, table, form, dialog, or dark-mode systems.

## Layout and Density

- Public pages use a readable content width, generous section rhythm, and a clear path into authentication or the console.
- Console pages use a shared shell, stable navigation, predictable page headers, and fluid content bands.
- Forms use constrained readable widths unless the workflow requires a grid.
- Tables and logs preserve responsive horizontal overflow rather than compressing content into illegibility.
- Mobile layouts reflow navigation, actions, filters, and forms deliberately; desktop shells must not merely collapse by accident.

## Forms and Data Views

- Forms share field spacing, labels, validation messages, disabled/loading states, and destructive-action treatment.
- Tables share header density, row actions, numeric alignment, pagination, and loading/empty/error rows.
- Filters and primary actions appear in consistent relationships to the page title and data surface.
- Financial and destructive actions require explicit confirmation and result feedback.
- Loading, empty, zero-result, partial, forbidden, and error states are states of shared patterns, not separate visual systems.

## No-Fake-Feature Rule

Every visible metric, control, navigation item, field, and state must map to current backend behavior or an explicitly approved addition.

- Omit target-design features that the backend does not support.
- Never display fabricated values, placeholder analytics presented as real data, dead actions, or inaccessible routes to imitate a reference design.
- Preserve existing fields and actions unless an approved product decision removes them.
- Missing or partial data must be represented honestly as unavailable, empty, loading, forbidden, or failed; do not silently replace it with zero.

## Dynamic Brand Behavior

- Use MidCode as the fallback visible name.
- Prefer the runtime/backend-provided site name and logo wherever the shared brand components expose them.
- Repository names and compatibility identifiers must not leak into user-visible copy.
- Brand substitution must not alter API fields, storage keys, environment variables, route guards, or persisted data.

## Dark Mode

Dark mode is first-class and uses the same semantic tokens and component APIs as light mode.

- Do not patch colors per page with `dark:` overrides when a semantic token can express the state.
- Avoid pure black and preserve surface, border, text, focus, hover, and selection hierarchy.
- New shared components must be verified in both themes before route-level adoption.

## Accessibility and Responsive Quality

- All interactive controls require visible keyboard focus, correct disabled states, and accessible names.
- Text and state indicators must meet practical contrast requirements in both themes.
- Do not communicate status by color alone.
- Dialogs and sheets require accessible titles; forms require associated labels and error descriptions.
- Touch targets, table overflow, zoom, reduced-motion preferences, and mobile reflow are part of acceptance, not later polish.

## Engineering and Delivery Guardrails

- Keep one React frontend application and the installed shadcn/ui source components.
- Use Tailwind v4 semantic mappings and shared wrappers; do not add a second design system or page-local raw brand colors.
- Preserve existing component variants, exports, role guards, API clients, and backend contracts during visual migrations.
- Do not introduce dependencies or backend features solely to reproduce a reference screenshot.
- Work is complete only after the relevant build and checks pass, responsive and dark-mode behavior is reviewed, and real backend states remain connected.
