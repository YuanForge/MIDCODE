# Production source reconciliation and disabled groups — 2026-11-15

Target release: v1.0.94 (v1.0.93 was pushed but never deployed).

The running v1.0.92 backend hash matches the v1.0.90 manifest. All 275 recorded production source files were verified against the retained build tree before reconciliation. Production Go source and module files are now present in the release branch, including CAPTCHA, video studio routes, Claude counting/completion, context pricing, billing lookup optimizations, pool behavior and security middleware. Existing frontend is inherited byte-for-byte from the verified v1.0.92 image.

The disabled-group fix is retained. Startup removes historical disabled bindings even with FANAPI_SKIP_MIGRATIONS=1. Both group-edit and toggle operations delete bindings atomically. Stale editor submissions drop inactive IDs; re-enabling never restores bindings. Ordered PostgreSQL row locks serialize selection against group disabling. Provider-disable behavior is unchanged.

Validation: full Go package suite; isolated PostgreSQL regression covers both disable paths, stale selection, empty selection and re-enable. Deployment evidence and final state are appended after verification. No paid generation or actual email delivery is required by the verification scripts.

Deployment scripts use a parallel container at 8158, preserve the old image/config, back up historical bindings privately, then switch Caddy, the 8154 compatibility rule and studio network alias. Cleanup verifies dependencies and connection drain before deleting only the replaced container without volumes.

Rollback: deploy.py rollback restores the predecessor and proxy/alias configuration. Deleted bindings do not return automatically: review and selectively restore the private disabled-bindings snapshot if required. Never commit that snapshot or credentials.
