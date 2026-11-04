"""Switch the existing image homepage to the verified unified studio without interrupting tasks."""
import json
import shutil
import subprocess
import urllib.request
from pathlib import Path

CONFIG = Path('/etc/fanapi-migration/conf.d/image.midcode.cc.conf')
BACKUP = Path('/root/fanapi-migration/image-entry-before-v1073.conf')
BLOCK = '''
 # v1.0.73: unified studio entry; explicit empty fragment discards old image tickets.
 location = / {
  add_header Cache-Control "no-store" always;
  return 302 "https://midcode.cc/studio-preview/entry#";
 }
 location = /index.html {
  add_header Cache-Control "no-store" always;
  return 302 "https://midcode.cc/studio-preview/entry#";
 }
'''

def main():
    """Validate the active candidate, save rollback configuration, then gracefully reload."""
    assert json.load(urllib.request.urlopen('http://127.0.0.1:8198/health', timeout=10))['status'] == 'ok'
    text = CONFIG.read_text()
    assert 'server_name image.midcode.cc;' in text
    assert '127.0.0.1:8798' in text and '127.0.0.1:8183' in text
    assert 'location = / {' not in text and 'location = /index.html' not in text
    assert not BACKUP.exists(), 'Do not overwrite the rollback snapshot'
    shutil.copy2(CONFIG, BACKUP)
    BACKUP.chmod(0o600)
    CONFIG.write_text(text.replace('server_name image.midcode.cc;', 'server_name image.midcode.cc;\n'+BLOCK, 1))
    try:
        subprocess.run(['docker','exec','migration-router','nginx','-t'],check=True)
        subprocess.run(['docker','exec','migration-router','nginx','-s','reload'],check=True)
    except Exception:
        shutil.copy2(BACKUP, CONFIG)
        raise
    print('IMAGE_HOME_SWITCHED; existing task/media/video paths preserved')

if __name__ == '__main__':
    main()
