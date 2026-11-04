# Model status labels v1.0.65

Use success rate >90% for 正常, 80% through 90% inclusive for 波动, and <80% for 异常. Apply the same thresholds to small nonempty samples; retain missing-data and unavailable states. TTFT/TPS and other model card features are unchanged.

Frontend-only change, built against the preserved production source from v1.0.64. Apply the exact availabilityState function from the repository to the production UserModelsPage.tsx, preserving its other production-only features. Backend binary is unchanged (SHA256 e051aadfc94b28347dcfd136f027fa19ebbd8b3d05ae762328f5bbe31439ec50).

New host only: parallel container midcode-status-v1065-api-1 on localhost:8145; image fanapi-api:status-v1.0.65. Validate TypeScript/Vite build, 79.99/80/90/90.01 boundaries and browser labels before graceful migration-router reload. Move the video backend alias only with zero existing connections, then drain and remove midcode-performance-v1064-api-1. Keep its image/config and all volumes. Ingress rollback files: /root/fanapi-migration/status-v1065-ingress-before; recreate previous container and restore video alias before reverting proxy ports. Runtime validation records remain on the new host.
