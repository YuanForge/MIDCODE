# Server migration preparation — 2026-11-03

## Scope and current state

Prepared a separate Debian 12 candidate for all three existing projects: MIDCODE/FanAPI, OctoAPI, and dc-shop, including image/video workspaces, script workers, Redis, NATS and OpenCode bridges. Public DNS and production traffic remain on the original host. The user will update DNS after final validation and handover.

This is an infrastructure preparation revision, not a rebuilt application release. Existing application images are reused; `image-map.json` maps source containerd OCI image-index digests to the imported Docker image configuration digests. All 12 business-image root filesystem layer hashes were verified equal. The MIDCODE executable SHA-256 is `c06746cf57a9f4d65176208792bffc410d791b41a5f1521e31f1c3a022ce3269` on both hosts.

The original dirty checkout was not used as a deployment source or staged for publication. No credentials, environment files, full Docker inspection snapshots, customer data or certificates are included here.

## Candidate configuration

- Docker Engine 29.9.2 with Compose plugin; its supported API includes v1.45 required by the video gateway.
- Caddy 2.6.2 terminates HTTPS using the migrated certificates. A loopback-only OpenResty router retains existing paths, body rewriting for the studio switcher, streaming and WebSocket behavior. The legacy image-backend dependency on port 8104 remains present.
- 15 virtual-host configurations cover 21 domain names: 20 HTTPS names with valid certificates and one existing HTTP-only domain.
- Manual certificates are used during staging. Automatic renewal must be enabled or provisioned after DNS handover; manual Caddy certificate loading alone does not renew them.
- Source data was copied by incremental rsync. Live temporary-file disappearance during the initial pass was followed by a completed incremental pass. This is not a final consistency snapshot.
- MIDCODE and OctoAPI keep their existing external PostgreSQL server. PostgreSQL was not located on the old application host and is not relocated by this migration.
- Candidate MIDCODE/OctoAPI instances currently use the old Redis/NATS endpoints. The candidate shop uses its own copied SQLite database and staging Redis. Candidate script workers remain stopped.
- A separate Redis replica follows the old primary; replication link is up and offsets matched at verification. NATS inspection found zero pending or unacknowledged messages in the application streams.

## Verification

- All 12 imported business images matched the source rootfs layer hashes.
- MIDCODE executable hash matched; API container health checks pass and running candidate containers had zero restarts.
- Fourteen old/new HTTP comparisons matched status codes. Image/video landing responses, studio-switch JavaScript, unauthenticated tenant denial, shop homepage and asset homepage also matched response bodies.
- Separate authenticated, read-only profile checks succeeded against both old and candidate MIDCODE and OctoAPI using short-lived credentials kept in memory.
- A separate Chrome/Playwright session resolved the original hostnames to the candidate without changing public DNS or the workstation hosts file. The four rendered entry pages loaded from the candidate with meaningful content and no page runtime exceptions; the three project login links displayed password fields. Desktop viewport: 1440 x 1000. Browser plugin was not available; bundled Playwright was used.
- Paid generation, payment collection, supplier procurement, email delivery, mobile layout and the authenticated video generation/download flow were not exercised.

## Remaining handover

A brief maintenance window was requested because the repository requires continuous availability, while SQLite, tenant volumes, Redis and NATS need one consistent writer during the final handover. Do not infer approval from this file.

Before promotion: reconfirm the live topology, source writers and active tasks; drain requests; take final SQLite/volume/NATS snapshots; ensure Redis is caught up; promote the new Redis and point candidate applications at the new dependencies; start the migrated workers. Then verify authenticated APIs and all related services before forwarding the old ingress to the new ingress and notifying the user to change DNS.

Do not allow old and new shops/workspaces to accept independent writes. Do not restart an old writable snapshot after new production writes have begun. A rollback after that point requires reverse synchronization of Redis/NATS, SQLite and workspace/upload data, in addition to restoring container and proxy configuration.

No source container was removed in the preparation phase: production still depends on them. After successful handover, recheck proxy traffic, active connections and all name/IP/port dependencies before removing only replaced containers without deleting their volumes. Retain original images, configuration backups and migration records for rollback. Remove the temporary transfer key and its source-host SSH exception after transfer is no longer needed.

## Release identity

The Git commit and immutable version tag for this preparation are recorded by Git. They identify the migration configuration and evidence boundaries above; they do not relabel the existing application binaries as rebuilt from this repository revision. Final cutover, DNS handover and old-container cleanup require a subsequent completion record.

## User-directed DNS preparation and latency check

The user explicitly deferred final migration until they finish updating DNS and notify us. All externally reachable candidate ingress now forwards to the original host, keeping one authoritative set of production writers even when DNS changes gradually. The validated direct-candidate configuration is retained as `Caddyfile.candidate`; the active forwarding configuration is `Caddyfile`. There is no reverse forwarding from the old host, so this does not create a proxy loop.

The old ingress now trusts client-IP headers from the new ingress. New Caddy overwrites spoofable CF-Connecting-IP headers on connections not arriving from a known Cloudflare range. A deliberately spoofed probe through the new ingress was recorded at the old ingress as the actual loopback test source, rather than either supplied forged address. Configuration validation and graceful reload passed. One first validation attempt hit transient DNS resolution failure for an existing upstream; its modifications were restored before a successful retry.

The new web/API/gateway services, both staging Redis and the live Redis replica, and NATS are running. New NATS listens on the Docker host gateway only. Script workers and per-user video containers remain stopped/on-demand until the consistent final handover, avoiding premature task execution against copied files. Old production containers and data remain intact and in use; none were deleted. The candidate shop was briefly stopped after verification and restarted at the user's request.

The four main HTTPS entrypoints through the new forwarding ingress returned 200 after activation. Final data synchronization, Redis promotion, worker handover, public traffic serving directly from the new applications, certificate-renewal handover and old-container cleanup are deferred until the user returns.

### sub.midaccs.com measurements

Five independent HTTPS homepage connections and four ICMP probes were sampled from each server on 2026-11-03 (Asia/Shanghai). All ten HTTPS requests returned 200; neither four-packet ICMP sample lost packets. Cloudflare trace reported HKG and TLS 1.3 from both servers.

| Metric | New host | Old host |
| --- | ---: | ---: |
| ICMP average | 3.071 ms | 1.207 ms |
| TCP handshake median, excluding DNS | 3.777 ms | 1.098 ms |
| HTTPS homepage time-to-first-byte median | 310.283 ms | 238.172 ms |
| HTTPS homepage time-to-first-byte range | 292.426–655.882 ms | 228.746–247.552 ms |

The ICMP/TCP figures measure the Cloudflare edge, not the private origin. Homepage time-to-first-byte includes connection/TLS and server time; these are not authenticated model-generation latency measurements.

Forwarding rollback before final migration: restore the user's original DNS while keeping old services running, or restore the saved old ingress configuration and gracefully reload it. Do not enable direct candidate writes by restoring `Caddyfile.candidate` until the final consistency handover is complete.
