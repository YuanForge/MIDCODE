#!/bin/sh
# Stable loopback endpoint for the existing studio, without restarting its tasks.
# Conntrack preserves already-established requests to the retired API.
set -eu
rule() { /usr/sbin/iptables -t nat "$1" OUTPUT -d 127.0.0.1/32 -p tcp --dport 8149 -m comment --comment fanapi-main-compat -j REDIRECT --to-ports 8151; }
case "${1:-start}" in
 start) rule -C 2>/dev/null || rule -I ;;
 stop) rule -C 2>/dev/null && rule -D || true ;;
 *) exit 2 ;;
esac
