# QQ binding — v1.0.99 — 2026-11-17

User profile /profile gains QQ binding, modification, conflict errors and confirmed unbinding. User explicitly selected self-declared binding without ownership verification. UI says unverified; this is not proof of QQ ownership and must not be used as login or account recovery authentication. Each QQ can belong to only one account; each account has at most one QQ.

GET/PUT/DELETE /api/user/qq-binding require a real user login JWT (ordinary API keys and JWT-with-key are rejected). PUT accepts {"qq":"123456789"}; trim whitespace, require 5–20 ASCII digits with no leading zero. GET returns {qq,verified:false}. Unbound returns empty qq. Duplicate binding returns 409 and retains original binding. DELETE is idempotent. Unique/primary constraints enforce concurrent writes.

GET /api/v1/bot/qq/{qq}/financial-summary uses the same dedicated robot key as UID lookup. Returns identical user_id/balance/yesterday/last_7_days contract; missing binding 404, invalid QQ 400, unauthorized 401. QQ is a routing identifier, not an authentication credential. After modifying/unbinding, future lookups use the current mapping; already-in-progress requests may finish against their resolved user. No mapping cache.

Additive table user_qq_bindings(user_id primary key, qq unique, updated_at), foreign key cascade on account deletion. Startup ensures table even with migrations skipped. Existing account table/credentials unchanged. Rollback retains this table/data and returns to previous image.

Validation: Go application suite and QQ validation/API-key denial tests pass; frontend TypeScript/Vite build passes. Playwright on installed Edge (Browser plugin unavailable) tests bind, modify, duplicate conflict, cancel/confirm unbind and mobile screenshot without page runtime errors. Real candidate/live script uses two synthetic accounts, verifies database uniqueness and robot mapping, deletes only those accounts/bindings in finally and revokes verification key. No real user's binding changed.

Deployment tooling: /root/fanapi-qq-v1.0.99/deploy.py, candidate 8163, predecessor 8162. Build hashes and final evidence under deploy/qq-binding-20261117. Rollback retains baseline image/config without deleting volumes.

## Release status

Source commit 0fe06fa; build manifest records exact backend/frontend hashes. Local tests/build/browser verification completed. Code and v1.0.99 tag are published with this record.

Deployment NOT performed: preflight SSH and subsequent retries failed before authentication (Error reading SSH protocol banner). No successful remote upload/candidate creation/switch/schema migration/production QQ test or old-container cleanup in this task. Last verified running version from preceding task is v1.0.98; current running state not re-established. Real database uniqueness and bot lookup verification remains pending and must pass before switch. No real QQ binding or customer data changed. Rollback script is prepared but was not needed.
