# Studio switch latency — v1.0.70

Repeated image-to-video switching can resume the last video workspace for five
minutes, after a HEAD request passes the existing session, IP and owner checks.
The navigation hint contains only a validated workspace path, never credentials.
Use a short-lived Secure SameSite cookie because video storage is deliberately
namespaced per user. A fresh image handoff clears the hint. Missing/expired
hints, failed authorization or a five-second validation timeout use the original
main-site handoff. New-tab/modifier clicks retain the original handoff behavior.
No changes to tenant configuration, accounts, billing, project storage or model
requests. First entry and cold tenant startup retain the existing workflow.

Before: server handoff 1.56 s plus exchange/config sync 4.62 s, existing workspace
HTML 0.04 s. Candidate Chrome tests: three warm switches 1.275/1.118/1.185 s;
expired-session fallback and actual cross-user 403 verified, mobile no overflow.
Browser plugin not available; regular Playwright used. Disable service workers
for candidate script interception; publish a new script URL to avoid stale cache.

Static-only release on the new business host. activate.py backs up the old shared
script and image/video proxy configuration, replaces script bytes atomically,
adds /studio-switch-20261104.js and reloads the proxy after nginx -t. Both old and
new script URLs serve the new content. No business containers need replacement.
Verify actual live switching and the deployed file hash against this commit.
Rollback: restore both files under /root/fanapi-migration/studio-switch-v1070-before,
validate nginx configuration and gracefully reload migration-router.
