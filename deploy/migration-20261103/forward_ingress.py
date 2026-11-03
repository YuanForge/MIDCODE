import json,subprocess,shutil,re
from pathlib import Path
p=Path('/root/fanapi-migration');cf=['173.245.48.0/20','103.21.244.0/22','103.22.200.0/22','103.31.4.0/22','141.101.64.0/18','108.162.192.0/18','190.93.240.0/20','188.114.96.0/20','197.234.240.0/22','198.41.128.0/17','162.158.0.0/15','104.16.0.0/13','104.24.0.0/14','172.64.0.0/13','131.0.72.0/22','2400:cb00::/32','2606:4700::/32','2803:f800::/32','2405:b500::/32','2405:8100::/32','2a06:98c0::/29','2c0f:f248::/32']
caddy=Path('/etc/caddy/Caddyfile');backup=p/'Caddyfile.candidate'
if not backup.exists():shutil.copy2(caddy,backup)
text=['{\n auto_https disable_certs\n}\n']
for site in json.loads((p/'sites.json').read_text()):
 tls=site['certificate'];names=site['names'] if tls else ['http://'+n for n in site['names']]
 s=', '.join(names)+' {\n'
 if tls:s+=' tls '+tls+' '+str(Path(tls).with_name('privkey.pem'))+'\n'
 s+=' @notcf not remote_ip '+' '.join(cf)+'\n request_header @notcf CF-Connecting-IP {remote_host}\n'
 s+=' reverse_proxy '+('https://140.150.236.134' if tls else 'http://140.150.236.134')+' {\n  trusted_proxies '+' '.join(cf)+'\n  header_up Host {host}\n  flush_interval -1\n  transport http {\n   dial_timeout 10s\n   response_header_timeout 6000s\n'
 if tls:s+='   tls_server_name {host}\n'
 s+='  }\n }\n}\n';text.append(s)
caddy.write_text('\n'.join(text));subprocess.run(['caddy','fmt','--overwrite',str(caddy)],check=True)
r=subprocess.run(['caddy','validate','--config',str(caddy)],capture_output=True,text=True)
if r.returncode:shutil.copy2(backup,caddy);raise RuntimeError(r.stderr)
subprocess.run(['systemctl','reload','caddy'],check=True)
print('NEW_INGRESS_FORWARDS_TO_OLD_AUTHORITATIVE_SERVICES')
