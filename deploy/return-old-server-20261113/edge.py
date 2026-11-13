"""Install a loopback-only Caddy candidate, preserving existing public ingress."""
import pathlib,subprocess
base=pathlib.Path('/root/fanapi-return-20261113')
unit='''[Unit]
Description=FanAPI return migration local edge
After=network-online.target docker.service
[Service]
ExecStart=/root/fanapi-return-20261113/caddy run --config /root/fanapi-return-20261113/Caddyfile
Restart=always
RestartSec=3
LimitNOFILE=1048576
[Install]
WantedBy=multi-user.target
'''
subprocess.run([str(base/'caddy'),'validate','--config',str(base/'Caddyfile')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
pathlib.Path('/etc/systemd/system/fanapi-return-edge.service').write_text(unit)
subprocess.run(['systemctl','daemon-reload'],check=True);subprocess.run(['systemctl','enable','--now','fanapi-return-edge'],check=True)
print('Loopback edge enabled')
