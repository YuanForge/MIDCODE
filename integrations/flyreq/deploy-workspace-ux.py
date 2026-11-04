"""Atomically publish static UI without restarting tenant/task processes.

Run on the deployment host: script RELEASE_DIRECTORY COMMIT TAG.
The directory contains out/, entry.html and entry.js from the tagged build.
Rollback uses the saved out-before/ and entry-before.html; rerun only with a new
release directory. Never replace tenant state or copy runtime credentials.
"""
import ctypes
import hashlib
import json
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

release = Path(sys.argv[1]).resolve()
commit, tag = sys.argv[2:4]
container = 'midcode-unified-preview-v1072-r3'
entry = Path('/opt/1panel/apps/openresty/openresty/root/midcode-unified-entry-v1074.html')

def inspect():
    return json.loads(subprocess.check_output(['docker', 'inspect', container]))[0]

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def exchange(a, b):
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.renameat2(-100, str(a).encode(), -100, str(b).encode(), 2):
        raise OSError(ctypes.get_errno(), 'Atomic directory exchange failed')

before = inspect()
assert before['State']['Running'] and before['RestartCount'] == 0
assert before['Image'] == 'sha256:c6387f9ec462fc77e072582a832833e50b210f15907498e020e227d2d158caa6'
assert json.load(urllib.request.urlopen('http://127.0.0.1:8198/health', timeout=10))['status'] == 'ok'
root = Path('/proc') / str(before['State']['Pid']) / 'root/app/frontend'
live, staged = root / 'out', root / ('out-' + tag)
assert not staged.exists() and not (release / 'out-before').exists()
assert (release / 'out/zh/index.html').is_file()
shutil.copytree(live, release / 'out-before')
shutil.copy2(entry, release / 'entry-before.html')
# Keep chunks needed by clients that opened an older document before this swap.
for old in (live / '_next/static').rglob('*'):
    if old.is_file():
        dest = release / 'out' / old.relative_to(live)
        if dest.exists():
            assert digest(dest) == digest(old), 'Immutable asset collision'
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(old, dest)
script = (release / 'entry.js').read_text()
assert '</script' not in script.lower()
html = (release / 'entry.html').read_text().replace('/* ENTRY_SCRIPT */', script)
assert '/* ENTRY_SCRIPT */' not in html
image = 'midcode-unified:workspace-' + tag
(release / 'Dockerfile').write_text(
    'FROM midcode-unified:preview-v1072-r3\nCOPY out/ /app/frontend/out/\n'
    + f'LABEL org.opencontainers.image.revision="{commit}" org.opencontainers.image.version="{tag}"\n')
assert subprocess.check_output(['docker','image','inspect','midcode-unified:preview-v1072-r3','--format','{{.Id}}']).decode().strip() == before['Image']
subprocess.run(['docker', 'build', '-t', image, str(release)], check=True)
shutil.copytree(release / 'out', staged)
temp_entry = entry.with_suffix('.new')
temp_entry.write_text(html)
temp_entry.chmod(0o644)
exchange(live, staged)
try:
    temp_entry.replace(entry)
    after = inspect()
    assert after['State']['Pid'] == before['State']['Pid'] and after['RestartCount'] == before['RestartCount']
    assert json.load(urllib.request.urlopen('http://127.0.0.1:8198/health', timeout=10))['status'] == 'ok'
except Exception:
    exchange(live, staged)
    shutil.copy2(release / 'entry-before.html', entry)
    raise
manifest = {'commit': commit, 'tag': tag, 'container': container,
            'baseImage': before['Image'], 'recoveryImage': image,
            'pidUnchanged': True, 'restarts': after['RestartCount'],
            'entrySha256': digest(entry),
            'files': {str(p.relative_to(live)): digest(p) for p in sorted(live.rglob('*')) if p.is_file()},
            'rollbackDirectory': str(staged), 'removedContainers': []}
(release / 'release.json').write_text(json.dumps(manifest, indent=2))
print(json.dumps({k: v for k,v in manifest.items() if k != 'files'}))
