#!/bin/sh
set -eu
umask 077
mountpoint -q /mnt/fanapi-shared
dir=/mnt/fanapi-shared/.midcode-node-tls
install -d -m700 "$dir"
tmp=$(mktemp "$dir/cert.XXXXXX")
trap 'rm -f "$tmp"' EXIT
docker exec 1Panel-openresty-0oWm tar -C /www/sites/api.fanapi.cc/ssl-return -cf - fullchain.pem privkey.pem > "$tmp"
if ! cmp -s "$tmp" "$dir/current.tar"; then mv "$tmp" "$dir/current.tar"; fi
