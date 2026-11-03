from pathlib import Path
import shutil,subprocess,re
base=Path('/opt/1panel/apps/openresty/openresty/conf/conf.d');backup=Path('/root/fanapi-migration/ingress-before-forwarding');backup.mkdir(mode=0o700,exist_ok=True)
cf=['173.245.48.0/20','103.21.244.0/22','103.22.200.0/22','103.31.4.0/22','141.101.64.0/18','108.162.192.0/18','190.93.240.0/20','188.114.96.0/20','197.234.240.0/22','198.41.128.0/17','162.158.0.0/15','104.16.0.0/13','104.24.0.0/14','172.64.0.0/13','131.0.72.0/22','2400:cb00::/32','2606:4700::/32','2803:f800::/32','2405:b500::/32','2405:8100::/32','2a06:98c0::/29','2c0f:f248::/32']
changed=[]
for f in base.glob('*.conf'):
 if f.name in ['00.default.conf','default.conf']:continue
 s=f.read_text()
 if '# migration-new-ingress-trust' in s:continue
 shutil.copy2(f,backup/f.name)
 add='\n # migration-new-ingress-trust\n real_ip_header X-Forwarded-For;\n real_ip_recursive on;\n'+''.join(' set_real_ip_from '+ip+';\n' for ip in ['103.145.190.198']+cf)
 s=re.sub(r'server\s*\{',lambda m:m.group(0)+add,s)
 s=s.replace('real_ip_header CF-Connecting-IP;','real_ip_header CF-Connecting-IP;\n  set_real_ip_from 103.145.190.198;')
 f.write_text(s);changed.append(f)
r=subprocess.run(['docker','exec','1Panel-openresty-0oWm','nginx','-t'],capture_output=True,text=True)
if r.returncode:
 for f in changed:shutil.copy2(backup/f.name,f)
 raise RuntimeError(r.stderr)
subprocess.run(['docker','exec','1Panel-openresty-0oWm','nginx','-s','reload'],check=True)
print('OLD_INGRESS_TRUST_ADDED',len(changed),'PROXY_TARGETS_UNCHANGED')
