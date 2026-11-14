# Disabled model group unbinding — 2026-11-15

Release: v1.0.93. Source commit: the commit containing this record (resolve with git rev-list -n 1 v1.0.93).

Both group update and toggle remove API-key bindings in the same transaction when the group is disabled. Startup schema initialization removes historical disabled-group bindings. Bound-group listings omit disabled groups. Stale editor submissions discard disabled IDs; an all-disabled selection gets a reselect message. Re-enabling does not restore deleted bindings. Provider disabling behavior is unchanged.

Validation: go test ./internal/service ./internal/db and git diff --check passed. Database integration tests requiring FANAPI_TEST_DATABASE_URL were not exercised. No production business verification performed.

Deployment: NOT performed. SSH authentication to the previously documented server was rejected; current proxy targets, containers and deployed version could not be verified. No production bindings or containers changed or removed. No new container created.

Rollback: revert this source commit before deployment. Once deployed, removed bindings require a pre-deployment database backup to restore; reverting code alone does not recreate bindings. Capture a private binding backup before deployment. Keep existing release images/configuration. Complete candidate verification, smooth cutover, business checks and old-container dependency/drain checks before cleanup.
