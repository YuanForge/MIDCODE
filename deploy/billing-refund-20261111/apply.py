"""Apply the reviewed refund changes to the verified v1.0.86 production source."""
import hashlib,json,sys
from pathlib import Path

root=Path(sys.argv[1]).resolve()
package=Path(__file__).resolve().parent
patch=json.loads((package/'production-patch.json').read_text(encoding='utf-8'))
def sha(b):return hashlib.sha256(b).hexdigest()
pending=[]
for item in patch['files']:
    path=(root/item['path']).resolve()
    assert path.is_relative_to(root)
    current=path.read_bytes() if path.exists() else b''
    assert sha(current)==item['before_sha256'], 'unexpected baseline: '+item['path']
    lines=current.decode('utf-8').splitlines(keepends=True)
    for edit in reversed(item['edits']):
        lines[edit['start']:edit['end']]=edit['lines']
    result=''.join(lines).encode('utf-8')
    assert sha(result)==item['after_sha256']
    pending.append((path,result))
for path,result in pending:
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(result)
print('Applied verified production patch:',len(pending),'files')
