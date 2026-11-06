# Upload limits configuration release v1.0.82

Scope: main API Nginx 256 MiB body limit, 600s body-read idle timeout and upstream-send timeout. Caddy main API limit increases from 100 to 256 MiB. Response timeouts remain unchanged.

Deployment uses validated graceful reloads of existing Nginx and Caddy: no replacement containers or data changes. Base application image remains fanapi-api:sol61-v1.0.76; this tag identifies a configuration release, not a rebuilt application.

Rollback: restore /root/fanapi-upload-v1.0.82/nginx.before to the API container /etc/nginx/nginx.conf and Caddyfile.before to /etc/caddy/Caddyfile, validate both and gracefully reload. Recreated API containers must use docker/nginx.conf from this release.
