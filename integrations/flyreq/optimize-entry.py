"""Deploy a resumable entry and cache hashed assets without replacing any task process."""
import json
import shutil
import subprocess
import urllib.request
from pathlib import Path

CONFIG = Path('/etc/fanapi-migration/conf.d/api.fanapi.cc.conf')
BACKUP = Path('/root/fanapi-migration/unified-entry-before-v1074.conf')
HTML = Path('/opt/1panel/apps/openresty/openresty/root/midcode-unified-entry-v1074.html')
MAP = '''map $upstream_status $unified_asset_cache {
 default "no-store";
 200 "private, max-age=31536000, immutable";
}
'''
BLOCK = '''
 location = /studio-preview/entry {
  alias /usr/share/nginx/html/midcode-unified-entry-v1074.html;
  default_type text/html;
  charset utf-8;
  add_header Cache-Control "no-store" always;
  add_header Referrer-Policy "no-referrer" always;
  add_header X-Content-Type-Options "nosniff" always;
 }
 location ^~ /studio-preview/_next/static/ {
  proxy_pass http://127.0.0.1:8198;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Midcode-Client-IP $remote_addr;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header Accept-Encoding "";
  proxy_hide_header Cache-Control;
  add_header Cache-Control $unified_asset_cache always;
  gzip on;
  gzip_vary on;
  gzip_proxied any;
  gzip_comp_level 5;
  gzip_min_length 1024;
  gzip_types application/javascript text/javascript text/css application/json application/wasm;
  proxy_read_timeout 30s;
 }
'''

def main():
    """Validate the existing backend, install public entry HTML, and reload only ingress."""
    assert json.load(urllib.request.urlopen('http://127.0.0.1:8198/health', timeout=10))['status'] == 'ok'
    text = CONFIG.read_text()
    assert '127.0.0.1:8198' in text and 'location = /studio-preview/entry' not in text
    assert not BACKUP.exists(), 'Do not overwrite rollback snapshot'
    script = Path(__file__).with_name('entry.js').read_text(encoding='utf-8-sig')
    assert '</script' not in script.lower()
    html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MIDCODE Studio</title><body><p id="status">正在连接 MIDCODE / Connecting to MIDCODE…</p><a id="retry" hidden href="/studio-preview/entry">重试 / Retry</a> <a href="/login">MIDCODE 登录 / Sign in</a><script>' + script + '</script></body></html>'
    HTML.write_text(html)
    HTML.chmod(0o644)
    shutil.copy2(CONFIG, BACKUP)
    BACKUP.chmod(0o600)
    CONFIG.write_text(MAP + text.replace('server {', 'server {' + BLOCK, 1))
    try:
        subprocess.run(['docker','exec','migration-router','nginx','-t'],check=True)
        subprocess.run(['docker','exec','migration-router','nginx','-s','reload'],check=True)
    except Exception:
        shutil.copy2(BACKUP, CONFIG)
        raise
    print('RESUMABLE_ENTRY_ACTIVE; task processes unchanged')

if __name__ == '__main__':
    main()
