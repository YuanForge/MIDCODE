#!/bin/sh
set -eu
umask 077
dir=/etc/caddy/midcode
tmp=$(mktemp -d)
trap 'rm -f "$tmp/fullchain.pem" "$tmp/privkey.pem"; rmdir "$tmp"' EXIT
tar xf /mnt/fanapi-shared/.midcode-node-tls/current.tar -C "$tmp" fullchain.pem privkey.pem
openssl x509 -in "$tmp/fullchain.pem" -checkend 0 -checkhost midcode.cc -noout >/dev/null
test "$(openssl x509 -in "$tmp/fullchain.pem" -pubkey -noout)" = "$(openssl pkey -in "$tmp/privkey.pem" -pubout)"
if cmp -s "$tmp/fullchain.pem" "$dir/fullchain.pem" && cmp -s "$tmp/privkey.pem" "$dir/privkey.pem"; then exit 0; fi
install -o root -g caddy -m640 "$tmp/fullchain.pem" "$tmp/privkey.pem" "$dir/"
systemctl reload caddy
