"""Move the monitor certificate renewal timer to the destination origin."""
import pathlib,subprocess
b=pathlib.Path('/root/fanapi-return-20261113')
script='''#!/bin/sh
set -eu
docker run --rm -v /root/fanapi-return-20261113/monitor-letsencrypt:/etc/letsencrypt -v /opt/1panel/apps/openresty/openresty/root:/var/www/acme certbot/certbot@sha256:bc93cb710b413e6b456d622f9b0133b3e109c0a78c2ed9976af43d209b0a1805 renew --quiet
for dir in /root/fanapi-return-20261113/certs/monitor.fanapi.cc /opt/1panel/apps/openresty/openresty/www/sites/monitor.fanapi.cc/ssl; do
 install -m 644 /root/fanapi-return-20261113/monitor-letsencrypt/live/monitor.fanapi.cc/fullchain.pem "$dir/fullchain.pem"
 install -m 600 /root/fanapi-return-20261113/monitor-letsencrypt/live/monitor.fanapi.cc/privkey.pem "$dir/privkey.pem"
done
/root/fanapi-return-20261113/caddy reload --config /root/fanapi-return-20261113/Caddyfile >/dev/null 2>&1
docker exec 1Panel-openresty-0oWm nginx -t
docker exec 1Panel-openresty-0oWm nginx -s reload
'''
p=b/'renew-monitor.sh';p.write_text(script);p.chmod(0o700)
pathlib.Path('/etc/systemd/system/fanapi-return-monitor-renew.service').write_text('[Unit]\nDescription=Renew migrated monitor certificate\nAfter=docker.service network-online.target\n[Service]\nType=oneshot\nExecStart=/root/fanapi-return-20261113/renew-monitor.sh\n')
pathlib.Path('/etc/systemd/system/fanapi-return-monitor-renew.timer').write_text('[Unit]\nDescription=Daily migrated monitor certificate renewal\n[Timer]\nOnCalendar=daily\nRandomizedDelaySec=3600\nPersistent=true\n[Install]\nWantedBy=timers.target\n')
subprocess.run(['sh','-n',str(p)],check=True);subprocess.run(['systemctl','daemon-reload'],check=True);subprocess.run(['systemctl','enable','--now','fanapi-return-monitor-renew.timer'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
print('Monitor renewal timer enabled on destination; CA challenge follows DNS')
