# Hosting network snapshot

Source: https://github.com/hexydec/ip-ranges (`output/datacentres.txt`).
The upstream project collects published cloud-provider ranges and selected hosting ASNs, supports IPv4/IPv6, and updates daily. This repository contains a pinned offline snapshot, not a live lookup service. See `manifest.json` for its commit, date and SHA-256; upstream MIT license is preserved in `LICENSE`.

Only the datacentre output is used, not crawler or country blocklists. ASN ownership does not prove that every address is used for hosting, and unlisted providers/residential proxies may be missed.

Reviewed supplements are recorded separately in `manifest.json.supplements`; the upstream SHA-256 is retained as `upstream_sha256`. On 2026-11-01 ARIN RDAP confirmed `149.248.20.0/23` belongs to Vultr's registrant `VHL-60`, and this exact allocation was appended. This supplement is registration evidence used for internal network operations, not an upstream MIT-licensed dataset update or a public Whois resale service.

`python3 scripts/verify-hosting-ip.py IP --output report.json` performs a single fixed-host ARIN query and emits a minimal review report. It checks range containment and the top-level registrant handle/name against reviewed hosting identities. Unknown owners remain unclassified; abuse contacts and name substrings do not qualify. The initial identity rule covers Vultr only. The command does not edit the live list or run on user login. Review the output, append only the verified allocation, update the manifest and deploy the snapshot normally. Other registries require separate verified rules. Observe ARIN's service terms: https://www.arin.net/resources/registry/whois/tou/.

Configuration:

- `FANAPI_DATACENTER_GUARD=1`: enable enforcement.
- `FANAPI_DATACENTER_RANGES=/app/data/datacenter/ranges.txt`: validated local CIDR file loaded at startup. Missing, empty or malformed files prevent an enabled candidate from starting.
- `FANAPI_DATACENTER_ALLOW`: comma-separated CIDRs that override the deny list for confirmed false positives. Default empty. Use narrowly scoped exceptions.
- Existing `FANAPI_CAPTCHA_TRUSTED_PROXIES` controls the trusted forwarding chain for both CAPTCHA and this policy. Do not trust arbitrary forwarded headers or whitelist CDN ranges to fix incorrect client-IP resolution.

To update: download `output/datacentres.txt` from a specific upstream commit, preserve its license and update the manifest. Validate CIDRs and review the range-count/change delta. Ship the new snapshot through the same parallel candidate and no-downtime cutover process as the backend. An upstream outage does not affect running requests or erase the previous list. No automatic network downloads or background schedule are configured.

Scope: `/auth/*` (including email codes and password recovery), account-management/upload/payment-creation endpoints and authenticated website JWT use. The shared login endpoint is also used by the administrator login page, so it is subject to the same source-network check. Existing website JWTs are checked on each request, including JWTs that select an API key for the playground.

API Key-authenticated model routes (including native Gemini and task result reads) remain available. API Keys cannot be used to evade restrictions on website account-management routes. Public browsing, public model catalogs, health probes and payment callbacks are unaffected. Vendor/reseller portals with separate authentication are outside this user-console policy.

On denial the server returns HTTP 403 with code `DATACENTER_IP_BLOCKED`, a network-switch explanation, and `Cache-Control: no-store`; it does not redirect to login or revoke the API key. The existing UI error handling displays this response. Security audit metadata records the policy result without request bodies or credentials.
