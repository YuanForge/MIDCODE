# Return deployment — 2026-11-13

Migration release: v1.0.88. Application baseline: v1.0.87, commit 87936005a664c0750df05a88d06d0419aaa03fd0. This release moves the verified production artifacts and their current configurations; it does not rebuild the application or claim the UI's application version changed. The tagged tree contains the v1.0.87 source and its production patch/build manifest, plus the migration implementation and record.

Source: 103.145.190.198. Destination: 140.150.236.134. Scope: FanAPI/MIDCODE, image/video/unified workbenches, OctoAPI API/worker, and monitor.fanapi.cc. DNS remains under user control; see dns-return-20261113.md. Existing shop and third-host authoritative data services are preserved.

## Deployment

- Main: midcode-refund-v1087-api-1, loopback 8154.
- Studio API: midcode-studio-refund-v1087-api-1, loopback 8106.
- Image: midcode-image-s3-v1063, host port 8798; backend changed to local 8106.
- Video gateway: midcode-video-s3-v1063, loopback 8183; midcode-main network alias points at the new main container. Tenant data remains on shared storage.
- Unified workbench: midcode-return-preview-v1088, host port 8198; backend changed to local 8154; current local state copied after stopping its sole source writer.
- OctoAPI: octoapi-return-v1088-api-1 (8092) and octoapi-return-v1088-worker-1; current production configuration copied privately.
- Monitor: observability-api-1 and observability-web-1 (18090). Source subnet conflicted with an existing old-host network; changed to 10.201.90.0/24 and updated both application and nginx trusted-proxy settings.
- Existing OpenResty gracefully forwards migrated virtual hosts to a loopback-only Caddy service on 18443/18080. The current source routing, streaming behavior, upload limits, static workbench wrappers and certificates are retained. Public ingress still uses ports 443/80. The historical api.fanapi.cc certificate covered only that legacy name; separate current certificates now cover the six MIDCODE names, while the legacy alias keeps its own certificate.
- Shared PostgreSQL, Redis, NATS, NFS uploads/video data, and S3 remain authoritative. No database restore, volume removal or global cleanup was performed.
- The new host forwards workbench requests through fanapi-return-forward.service to the destination, including visitors with cached DNS. Source main/API and other sites continue serving until DNS drains.

## Verification

Candidate and final-origin checks cover 21 listed domains: 20 valid HTTPS certificates and the existing HTTP-only hostname. Image root intentionally redirects to the unified entry. External client checks also reached the four primary origins; transient initial TLS handshake failures passed on retry.

Authenticated main channel/model-preference reads, unauthenticated rejection, billing statistics, image handoff/exchange, video handoff/tenant isolation, and unified handoff/session/page rendering passed. An isolated local mock upstream verified stale quota invalidation, partial refunds (1202 held, 1188 refunded, 14 net), full refunds (1202), and replay idempotency. Synthetic fixtures were removed. No paid model generation was submitted.

OctoAPI authenticated account profile and unauthenticated rejection passed. Monitor readiness and an isolated fixture verified session/project access, webhook receipt, event retrieval and sensitive-field redaction; fixtures were removed. No payment or email delivery test was performed.

At workbench handover there were no active gateway connections and no unified task rows. FanAPI asynchronous task count and NATS result pending/ack-pending/redelivered counts were zero. The historical refund job 7 was retained. OctoAPI had three historical nonterminal tasks last changed in August; these were not altered or represented as current in-flight work.

## Cleanup and rollback

Private inventories, configurations, source state, certificates and rollback evidence are under /root/fanapi-return-20261113/ on both hosts. These contain credentials and are deliberately excluded from Git. The old OpenResty configuration is additionally saved in old-ingress-backup.tar.gz. Retired container snapshots preserve exact configuration; images and volumes remain.

The final cleanup and health checkpoint is recorded below. Old shared-app systemd units must be disabled before container removal, because they otherwise restart stopped predecessors. New shared-app units retain the shared mount/tunnel boot dependencies.

For application-only rollback, recreate predecessor containers from the private snapshots on their saved networks and ports, validate them, restore the saved proxy configuration, and gracefully reload OpenResty. The preserved images, production binaries and Git tags provide code rollback. Never reverse completed refunds.

For workbench rollback, first drain requests and stop the old-host workbench writer, synchronize its CURRENT state back to the source (do not restore the stale pre-migration copy over newer work), recreate/start the saved source containers, and only then restore source-Caddyfile.before and verify source routing. Shared tenant data volumes must not be removed. Restoring an old application build that cannot process new refund intents requires retaining a compatible refund processor.

Public certificates are loaded from files; a successful TLS check does not prove future automatic renewal. The current certificate copies and existing renewal arrangement must be kept in sync on the active origin.

## Final migration checkpoint

All nine destination services matched the source image root filesystems; the main and studio API binaries both match SHA-256 `772385f88783bac9848799e57a60161c684a2a1fa2bb06b9a4c3e668360ec8d4`. All were running with zero Docker restart counts, and every configured health check was healthy. See deploy/return-old-server-20261113/manifest.json. Both old-origin and cached-DNS new-origin HTTPS authenticated workbench flows passed after final routing repair.

Removed six drained old-host predecessors: midcode-domain-ping-final-v1062-api-1, midcode-studio-independent-api-1, midcode-image-independent, midcode-video-gateway-allow20261102, octoapi-independent-api-1 and octoapi-independent-worker-1. Their active nginx configuration, other running-container configuration/bound-file references, published-port connections and namespace ingress connections were checked before removal. Old shared-app units were disabled; replacement units now wait for the data tunnel and shared mount. Four stopped old-host legacy tenant shells (306, 79, 3, 6) were replaced; their volumes were retained. The temporary preview candidate was recreated using the final state directory.

Removed six replaced source-host workbench containers: midcode-unified-preview-v1072-r3, midcode-video-s3-v1063, and midcode-video-user-79/445/441/3. The video gateway's source shared-app unit was disabled before final removal. Source main/studio APIs, OctoAPI, monitor and other still-needed services are intentionally retained for the DNS transition. No volumes or rollback images were removed.

Two operational issues were corrected during verification. Existing shared-app supervisors restarted stopped predecessors; disabling those owning units resolved cleanup and boot ownership. The source-to-destination SSH tunnel initially accepted connections but rejected forwarding because an earlier sshd Match rule permitted remote forwarding only. Cached-DNS workbench probes therefore returned 502 during the handover window; absence of customer impact is NOT asserted. A source-IP-scoped Match rule now permits only the two required loopback destinations (8183/8198), and the complete HTTPS handoff/session/tenant checks passed through BOTH origins afterward. The checked-in handover procedure now tests the actual tunneled endpoints before changing traffic.

Monitor renewal account/state and the daily timer were moved to the destination; the source renewal timer was disabled. The replacement script retains the pinned certbot image and updates both active TLS layers. CA challenge issuance itself must be validated against the final DNS destination. Other file-loaded certificate renewal behavior is inherited from the existing deployment; current TLS validity was verified.


The destination monitor renewal service completed successfully (ExecMainStatus=0), and its daily timer is enabled. No certificate was due for issuance during this check.
