# DNS return checkpoint — 2026-11-13

DNS checkpoint release: v1.0.89. Migration artifacts remain v1.0.88 / f0a35447bc2a265cefce0a3dfe6e115b28312e84; application baseline remains v1.0.87. This is a DNS operation and documentation update, not a new application build or container deployment.

The user explicitly authorized editing the open Cloudflare dashboard. Updated the following five existing A records from 103.145.190.198 to 140.150.236.134 through the dashboard and verified them after navigating back and reloading the DNS list:

| Record | Proxy state retained | TTL retained |
| --- | --- | --- |
| midcode.cc | Proxied | Auto |
| ai.midcode.cc | Proxied | Auto |
| www.midcode.cc | Proxied | Auto |
| image.midcode.cc | DNS only | Auto |
| origin-hk.midcode.cc | DNS only | Auto |

The full zone displayed 19 records and no AAAA records. Other records, including gpttool, api-hk (EdgeOne CNAME), email, tunnels, MX and TXT records were preserved.

Public HTTPS checks of https://midcode.cc/ and https://image.midcode.cc/video/ both returned 200. The local DNS query path returned synthetic 198.18.0.0/15 addresses even when selecting a public resolver; those results are not evidence of authoritative DNS propagation. Dashboard confirmation proves the five changes were saved, not that all resolver caches have expired. No new paid-generation test was submitted in this DNS-only step.

## Remaining scope

The current login exposes two Cloudflare accounts. One lists only midcode.cc; the other lists no domains. The other 16 names from docs/dns-return-20261113.md therefore remain unmodified by this task: ai.midaccs.com, www.midaccs.com, the 13 OctoAPI-related names, and monitor.fanapi.cc. The user was asked to open the account/platform managing them. Do not mark the entire DNS migration complete.

New-server services remain for DNS transition and the unmodified domains. No additional containers, images, volumes or data were removed in this checkpoint. Existing rollback images, private deployment snapshots and shared data remain intact.

Rollback for this batch: restore only these five A-record contents to 103.145.190.198, retaining each record's proxy state and TTL. The new-server workbench route continues forwarding to the old host, so DNS rollback alone does not move the workbench writer or reverse the state handover.
