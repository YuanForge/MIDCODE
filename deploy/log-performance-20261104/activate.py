from pathlib import Path
import subprocess,json
p=Path('/root/fanapi-migration');name='midcode-logs-v1066-api-1'
x=json.loads(subprocess.check_output(['docker','inspect',name]))[0];assert x['State']['Health']['Status']=='healthy'
files=[Path('/etc/fanapi-migration/conf.d/api.fanapi.cc.conf'),Path('/opt/1panel/apps/openresty/openresty/www/sites/api.fanapi.cc/proxy/root.conf')]
backup=p/'logs-v1066-ingress-before';backup.mkdir(exist_ok=False)
for i,f in enumerate(files):
 text=f.read_text();assert '127.0.0.1:8145;' in text;(backup/(str(i)+'.conf')).write_text(text)
 f.write_text(text.replace('127.0.0.1:8145;','127.0.0.1:8146;'))
(backup/'paths.json').write_text(json.dumps([str(f) for f in files]))
try:subprocess.run(['docker','exec','migration-router','nginx','-t'],check=True)
except:
 for i,f in enumerate(files):f.write_bytes((backup/(str(i)+'.conf')).read_bytes())
 raise
subprocess.run(['docker','exec','migration-router','nginx','-s','reload'],check=True)
print('PERFORMANCE_MAIN_INGRESS_SWITCHED')
