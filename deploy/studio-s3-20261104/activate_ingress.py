import subprocess,json,time
from pathlib import Path
p=Path('/root/fanapi-migration');backup=p/'studio-s3-ingress-before';backup.mkdir(mode=0o700,exist_ok=True)
router=Path('/etc/fanapi-migration/conf.d/image.midcode.cc.conf');caddy=Path('/etc/caddy/Caddyfile')
if (backup/'Caddyfile').exists():raise SystemExit('Already activated; inspect state instead of overwriting rollback')
(backup/'Caddyfile').write_bytes(caddy.read_bytes())
if router.exists():(backup/'image.midcode.cc.conf').write_bytes(router.read_bytes())
source=(p/'new-local-ingress-20261103214426/image.midcode.cc.conf').read_text()
source=source.replace('127.0.0.1:8796','127.0.0.1:8798').replace('127.0.0.1:8181','127.0.0.1:8183').replace(' set_real_ip_from 140.150.236.134;','')
router.write_text(source)
subprocess.run(['docker','exec','migration-router','nginx','-t'],check=True)
subprocess.run(['docker','exec','migration-router','nginx','-s','reload'],check=True)
site='''
image.midcode.cc {
    tls /etc/caddy/certs/image.midcode.cc/fullchain.pem /etc/caddy/certs/image.midcode.cc/privkey.pem
    reverse_proxy 127.0.0.1:8080 {
        flush_interval -1
        transport http {
            dial_timeout 3s
            response_header_timeout 6000s
        }
    }
}
'''
text=caddy.read_text();assert 'image.midcode.cc {' not in text
candidate=p/'Caddyfile.studio-s3';candidate.write_text(text+site)
subprocess.run(['caddy','validate','--config',str(candidate),'--adapter','caddyfile'],check=True)
caddy.write_bytes(candidate.read_bytes())
subprocess.run(['systemctl','reload','caddy'],check=True)
subprocess.run(['docker','update','--restart=no','midcode-video-s3-v1063'],check=True,stdout=subprocess.DEVNULL)
subprocess.run(['systemctl','enable','--now','shared-app@midcode-video-s3-v1063.service'],check=True)
print('NEW_STUDIOS_INGRESS_ACTIVATED_GRACEFULLY')
