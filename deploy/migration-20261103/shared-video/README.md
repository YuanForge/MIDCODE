# Shared video candidate

This is the exact gateway source running in the isolated candidate on the data
host, not a completed production-video migration. Runtime credentials and
accounts.json are deliberately excluded.

The imported base image supplies browserBridge.js and mediaProvider.ts. Its
immutable OCI index digest is
`sha256:62cda7799d4d71cd8f598f745b94440a412992315690eb8940280105a5b7f7ef`.
The locally imported `migration/video-gateway:20261103` tag must resolve to that
digest before building. It is not a public registry image.

Candidate image: `midcode-video-gateway:shared-data20261103`.
Deployed OCI index:
`sha256:753c477a0507b92b44eec23802eda5f1ff0c9832e8dccca2a3149a2f28e29f78`.

The change from the imported gateway adds X-Midcode-Client-IP to mainAuth.
MIDCODE_BACKEND uses https://midcode.cc. Business ingress trusts this header
only when the verified source address is 151.243.229.212, and the application
also validates the existing handoff secret. This preserves the original user
address through the public domain without hardcoding either business server.

Read-only/ephemeral verification: handoff exchange 200, authenticated workspace
200, access to another tenant 403. No paid generation was submitted. Temporary
handoff/session Redis keys were deleted after the probe.

Five source tenant volumes and account metadata have been initially copied.
The production video route still uses the old server. The third-host entry on
127.0.0.1:8181 is closed to traffic pending final consistency handover; only
the isolated candidate on 127.0.0.1:8182 was tested. Do not route public traffic
to either as a completed migration, and do not synchronize over live target
projects after accepting writes there.
