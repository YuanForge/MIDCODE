# Server migration preparation — 2026-11-03

## Latest verified state after data-host upgrade

This section supersedes the historical checkpoints below. Migration is **not
complete** and DNS must not be switched on the strength of this release.

- Data host `151.243.229.212`: 4 CPUs, 5,925 MiB RAM, approximately 4,217 MiB
  available at inspection. `/data` has 82 GiB free. PostgreSQL remains active.
- `shared-redis` is now the authoritative primary on this host, with persistent
  data and AOF under `/data/shared-services/redis`. `shared-nats` runs here too;
  its monitoring health endpoint returns `ok`. Redis/NATS bind to loopback and
  both business hosts access them through their own persistent SSH tunnels.
- Both business hosts run their own MIDCODE API (8141), studio API (8105),
  OctoAPI (8091), image service (8797), and MIDCODE/OctoAPI workers. They share
  PostgreSQL, Redis, NATS, and NFS upload directories on the third host.
  Application systemd units depend on the shared mount and tunnel to prevent
  startup against an empty local upload directory.
- Authenticated MIDCODE, studio and OctoAPI profile requests returned 200 on
  **both** hosts. Image landing pages returned 200. All five inspected API/worker
  containers on each host were running with restart count zero. Redis ROLE
  through each host's tunnel reported master.
- Old Nginx now targets the **old host's own** shared-data applications. Twenty-
  four main/OctoAPI probes across its graceful reload all returned 200. It does
  not forward business requests to the new application host.
- New public Caddy **still forwards to the old host**. The fully independent
  new public ingress has not been activated. DNS remains unchanged per user.
- Five video tenant volumes have an initial copy on the third host. The patched
  shared-video candidate passed handoff 200, workspace 200 and cross-tenant 403
  checks. Production video still runs on the old host. Source inspection found
  no established video connections and no active-task markers among 11 JSON
  files; this is a point-in-time observation, not a write lock.
- Automatic approval rejected preparation of a final video-handover script
  containing source-video quiescing and final synchronization (`blocked by
  policy`, no more specific reason supplied). That script did not execute.
  The shared-video entry remains closed and has no production route. No source
  video container was stopped by that rejected action.
- Shop remains excluded and runs on the old host. Homepage Ping restoration,
  certificate renewal handover, independent new Caddy activation, final video
  consistency and dependency-aware retirement of old containers remain pending.

### Data migration evidence and rollback boundaries

Redis relocation used native coordinated failover, first through the new host
and then to the third host. During the first transition the shop's retained
Redis connections briefly produced READONLY logs; its route was corrected.
Do not describe this as proof that every background operation was uninterrupted.
Final authenticated API checks passed. Legacy Redis endpoints are compatibility
routes to the third host; former primaries are replicas. The old-to-new reverse
data tunnel has been disabled. Old and new application tunnels reach the third
host directly.

Do not restore an old Redis snapshot as primary or restart copied video projects
as a second writable source. Rollback must retain the current authoritative
data. Old ingress backups are in
`/root/fanapi-migration/old-ingress-before-shared/`; video authentication ingress
backups are `main-before-video-handoff-old.conf` and
`main-before-video-handoff-new.conf` in the same migration directory.

This release publishes the deployed shared-video candidate source and current
infrastructure evidence. It reuses the existing main/OctoAPI images, rather than
claiming their binaries were rebuilt from this commit. Candidate image identity
and verification are in `deploy/migration-20261103/shared-video/README.md`.
No replaced production containers were deleted in this checkpoint: video and
remaining legacy dependencies require a fresh traffic/dependency audit first.

## Historical checkpoints (not current-state instructions)

## Current handover decision — 2026-11-03

The user requires both application hosts to keep serving their own applications, with no old-to-new HTTP forwarding. The shop is explicitly excluded from the next migration phase. The user requested Redis and NATS on the existing PostgreSQL host `151.243.229.212`, then instructed that migration wait for a resource upgrade if capacity is insufficient.

Read-only checks on that host found Debian 12, 2 CPUs, approximately 3.9 GiB RAM with 2.2 GiB available, and 45 GiB free on its root filesystem. The separately mentioned data disk was not assessed. Load averages were approximately 6–7; three one-second CPU samples showed 99–100% busy CPU, predominantly PostgreSQL work. No Docker, Redis or NATS was installed there, and no PostgreSQL configuration was changed. Redis/NATS relocation and independent new-host cutover are deferred pending the user's capacity upgrade.

Two isolated Redis 7.4.9 failover rehearsals used the application's Go Redis client, 16 concurrent writers and 9,600 increments each. Both returned zero client failures and an exact final counter; the second also opened fresh connections throughout the handover. Promotion took approximately 670 ms and 549 ms. This is rehearsal evidence, not proof of a production failover. An isolated NATS 2.14.3 reload test rejected adding a cluster listener to a running standalone server; production NATS was not altered.

A temporary persistent Redis replica (`redis-live`, new-host port 6381) and encrypted reverse data tunnel were prepared but never used by production. Before removing that replica, its replica role and absence of application clients were verified. Its container and all rehearsal containers were removed without deleting data directories; the tunnel was disabled and its scoped SSH forwarding exceptions were reverted. The original `redis-final` staging replica remains synchronized with the old production primary. No production API, worker, Redis or NATS container was stopped or restarted during this phase.

Final checks confirmed old Redis remains primary and the existing replica is connected with matching replication offsets. Old NATS application streams had zero queued and unacknowledged messages at inspection. Main-site, OctoAPI and shop landing pages returned 200 through both ingress addresses. This does not validate paid-generation workflows. Caddy still forwards to old production; old-host shutdown is not yet safe. This documentation release records preparation and cleanup only; it does not relabel application images or claim deployment of an independent application stack.

## Incident repair — 19:51 Asia/Shanghai

The old main ingress had been changed to port 8089 (`midcode-api-1`). Its static frontend responded, but its internal backend on 127.0.0.1:8080 refused connections, returning 502 for API requests. Restored only that ingress target to the still-healthy port 8138 (`midcode-allow-datacenter20261102-api-1`). The exact resulting location configuration is tracked in `deploy/migration-20261103/old-main-proxy.conf`. Nginx validation and graceful reload succeeded; no container was stopped, restarted, created or deleted.

Both old and new HTTPS ingress paths now return 200 for `/api/health` and `/api/public/settings`, and application JSON 401 for unauthenticated `/api/user/profile` and `/v1/models`. These checks establish backend reachability, not paid-generation or authenticated-session verification. New ingress still forwards to old production; independent new-host cutover is unfinished.

The prior 503 maintenance experiment was reverted. The user requires uninterrupted old-host service and a DNS-only traffic handover once new-host services and data are ready. Do not execute the maintenance/stop-writer cutover scripts or treat the older handover proposal below as authorization.

Pre-repair configuration is retained on the old host at `/root/fanapi-migration/proxy-repair-20261103-195127/`. Restoring it and gracefully reloading would restore the previous routing, but port 8089 must first have a working backend. This configuration-only release does not change or relabel application binaries.

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
