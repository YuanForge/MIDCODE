from pathlib import Path
import subprocess,json,hashlib
root=Path('/root/fanapi-migration');backup=root/'studio-switch-v1070-before';backup.mkdir(exist_ok=False)
script=Path('/opt/1panel/apps/openresty/openresty/root/midcode-studio-switch-20261101.js');conf=Path('/etc/fanapi-migration/conf.d/image.midcode.cc.conf')
(backup/'switch.js').write_bytes(script.read_bytes());(backup/'image.conf').write_bytes(conf.read_bytes())
source=(root/'studio-switch-v1070.js').read_bytes();newconf=conf.read_text();old='location = /studio-switch-20261101.js { alias /usr/share/nginx/html/midcode-studio-switch-20261101.js; default_type application/javascript; add_header Cache-Control "no-cache"; }';assert old in newconf
newconf=newconf.replace(old,old+'\n location = /studio-switch-20261104.js { alias /usr/share/nginx/html/midcode-studio-switch-20261101.js; default_type application/javascript; add_header Cache-Control "no-cache"; }').replace('src="/studio-switch-20261101.js"','src="/studio-switch-20261104.js"')
assert newconf.count('src="/studio-switch-20261104.js"')==2
try:
 tmp=script.with_suffix('.new');tmp.write_bytes(source);tmp.replace(script);conf.write_text(newconf)
 subprocess.run(['docker','exec','migration-router','nginx','-t'],check=True)
 subprocess.run(['docker','exec','migration-router','nginx','-s','reload'],check=True)
except:
 script.write_bytes((backup/'switch.js').read_bytes());conf.write_bytes((backup/'image.conf').read_bytes());raise
print('STUDIO_SWITCH_DEPLOYED',hashlib.sha256(source).hexdigest())
