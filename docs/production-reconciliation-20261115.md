# Production source reconciliation and disabled groups — 2026-11-15

Target release: v1.0.94 (v1.0.93 was pushed but never deployed).

The running v1.0.92 backend hash matches the v1.0.90 manifest. All 275 recorded production source files were verified against the retained build tree before reconciliation. Production Go source and module files are now present in the release branch, including CAPTCHA, video studio routes, Claude counting/completion, context pricing, billing lookup optimizations, pool behavior and security middleware. Existing frontend is inherited byte-for-byte from the verified v1.0.92 image.

The disabled-group fix is retained. Startup removes historical disabled bindings even with FANAPI_SKIP_MIGRATIONS=1. Both group-edit and toggle operations delete bindings atomically. Stale editor submissions drop inactive IDs; re-enabling never restores bindings. Ordered PostgreSQL row locks serialize selection against group disabling. Provider-disable behavior is unchanged.

Validation: full Go package suite; isolated PostgreSQL regression covers both disable paths, stale selection, empty selection and re-enable. Deployment evidence and final state are appended after verification. No paid generation or actual email delivery is required by the verification scripts.

Deployment scripts use a parallel container at 8158, preserve the old image/config, back up historical bindings privately, then switch Caddy, the 8154 compatibility rule and studio network alias. Cleanup verifies dependencies and connection drain before deleting only the replaced container without volumes.

Rollback: deploy.py rollback restores the predecessor and proxy/alias configuration. Deleted bindings do not return automatically: review and selectively restore the private disabled-bindings snapshot if required. Never commit that snapshot or credentials.

## Completed release

- Backend source commit: 133d69c (full hash in deploy/disabled-groups-20261115/build.json). Release tag v1.0.94 includes this commit and final verification records; v1.0.93 remains unchanged and was never deployed.
- Running container: midcode-groups-v1094-api-1, image fanapi-api:groups-v1.0.94, healthy with zero restarts. Backend built directly from the reconciled repository; frontend hash unchanged from v1.0.92.
- Caddy switched 8157 to 8158; stable compatibility port 8154 now redirects to 8158; midcode-main studio alias moved to the new container.
- Backed up 114 historical disabled-group bindings privately before startup cleanup. Verified remaining disabled bindings = 0 and API-key group/needs-binding flags consistent.
- All Go package tests passed. Isolated real PostgreSQL regression passed both disable paths, stale save, all-disabled rejection and non-restoration on re-enable. It uses a dedicated temporary schema, removed afterward.
- Candidate, live and post-cleanup verification passed: real CAPTCHA issuance and required-proof rejection; account/admin reads; zero adjustment rejection without balance mutation; seven-day usage/model totals and SQL agreement; API authorization checks.
- Image, video and unified workbench handoffs/sessions passed; video cross-user denial passed and its test session was revoked. No paid generation, real email delivery or real account login tested.
- Removed only midcode-captcha-v1092-api-1 after proxy/container dependency checks and drain. No volumes deleted. Older unrelated containers were outside this replacement scope.
- Rollback image fanapi-api:groups-v1094-baseline and private configuration/binding snapshots retained under /root/fanapi-groups-v1.0.94. Use deploy.py rollback and repeat verification; binding restoration is a separate reviewed data operation.
- The bounded HTTP sample ran before cutover due to launcher waiting behavior; it does not establish continuous observation across the switch. Live and post-cleanup functional checks establish the verified post-switch state.
