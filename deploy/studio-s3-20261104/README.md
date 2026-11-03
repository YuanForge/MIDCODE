# Studio media URL release v1.0.63

## Behavior

- Deploy to new business host `103.145.190.198` only. Image gateway: `midcode-image-s3-v1063` (8798). Video gateway: `midcode-video-s3-v1063` (8183), dynamically isolated per-user tenant containers on the same business host.
- Private SeaweedFS 4.52 S3 endpoint `https://s3.fanapi.cc`, data host `151.243.229.212`, data directory `/data/shared-services/seaweedfs/store` on the expanded disk. Caddy manages this endpoint's HTTPS certificate automatically.
- New image originals are uploaded under a handoff-authenticated, per-key namespace. Browser history stores stable, signed read-capability URLs; the gateway renews 15-minute S3 download signatures on access. Do not share a read URL unless the recipient should access that file.
- Existing browser-local image history remains readable. Image task metadata/thumbnails still live in IndexedDB; this release does not claim cross-device history synchronization. Failed cloud uploads preserve the original locally and display a visible warning.
- Video media responses from authenticated workspace routes are archived to private S3, then redirected to signed HTTPS URLs. Range reads use S3. Existing workspace routes remain stable and revalidate the user before renewing URLs. JSON/project editing and FFmpeg retain filesystem semantics.
- Video project directories reside on third-host NFS at `/mnt/fanapi-shared/MIDCODE/video/<uid>`; Docker volumes bind those directories. The gateway's systemd unit requires the shared mount. Old video was copied read-only; no old service was paused, changed or redirected. Subsequent edits sent to the old server's cached address are not synchronized by this release.

## Build and validation

Build contexts are `integrations/`; use `aipic/Dockerfile` and `toonflow/Dockerfile`. AIPic upstream is pinned in its Dockerfile. SDK dependencies use the committed lockfile. The video gateway layers on the preserved production image; exact base and output digests are in `manifest.json`.

Focused checks: Node media capability/origin/isolation and prompt optimizer tests; AIPic TypeScript + Vite production build; live private S3 PUT/GET/hash/range/CORS/anonymous-denial; real image/video handoff, cross-tenant denial, image object roundtrip and video file redirect/range without paid generation.

Credentials are generated/read only on the servers. Never commit their files, container inspect snapshots or authenticated browser sessions.

## Operations and rollback

`provision_storage.py` configures the data host after verified binary installation. `verify_storage.py` checks the private bucket. `prepare_new_video.py` is a **one-time pre-activation snapshot** and must not run again after new video accepts writes. `create_candidates.py` creates new-only candidates; `activate_ingress.py` validates and gracefully reloads ingress.

Main/API containers are unchanged at v1.0.62. Old business host is not updated. Ingress backup is `/root/fanapi-migration/studio-s3-ingress-before`. For image rollback, recreate the recorded previous image gateway and point only the image route back to 8797. Retain the S3 credentials/objects so already saved image links remain readable (roll back frontend separately if needed). For video rollback, use a compatible gateway against the **current shared project directories**; never replace them with the pre-cutover snapshot. No volumes or project data are deleted by cleanup.
