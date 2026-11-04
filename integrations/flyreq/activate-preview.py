"""只增加候选入口并平滑重载；保留主站、图片、视频原代理目标。"""
from pathlib import Path
import subprocess,shutil
p=Path('/etc/fanapi-migration/conf.d/api.fanapi.cc.conf')
backup=Path('/root/fanapi-migration/unified-preview-ingress-before.conf')
text=p.read_text()
assert '127.0.0.1:8149' in text
assert '/studio-preview/' not in text
shutil.copy2(p,backup);backup.chmod(0o600)
block='''
 location = /studio-preview { return 302 /studio-preview/; }
 location ^~ /studio-preview/ {
  proxy_pass http://127.0.0.1:8198;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Midcode-Client-IP $remote_addr;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection $http_connection;
  proxy_read_timeout 1800s;
  proxy_send_timeout 1800s;
  proxy_buffering off;
  client_max_body_size 256M;
 }
'''
p.write_text(text.replace('server {','server {'+block,1))
try:
 subprocess.run(['docker','exec','migration-router','nginx','-t'],check=True)
 subprocess.run(['docker','exec','migration-router','nginx','-s','reload'],check=True)
except Exception:
 shutil.copy2(backup,p)
 raise
print('PREVIEW_ROUTE_ADDED; existing proxy targets retained')
