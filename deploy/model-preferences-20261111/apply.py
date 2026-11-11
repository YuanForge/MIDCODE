"""Apply only this release to the verified v1.0.83 production source tree."""
import hashlib
import json
from pathlib import Path
import shutil
import sys

repo = Path(__file__).resolve().parents[2]
target = Path(sys.argv[1]).resolve()
patches = json.loads(Path(__file__).with_name('patches.json').read_text(encoding='utf-8'))
outputs = {}
for patch in patches:
    path = target / patch['path']
    assert hashlib.sha256(path.read_bytes()).hexdigest() == patch['sha256'], f"Unexpected baseline: {path}"
    lines = path.read_text(encoding='utf-8').splitlines()
    for hunk in patch['hunks']:
        positions = [i for i, line in enumerate(lines) if line.strip()]
        compact = [lines[i] for i in positions]
        before = hunk['before']
        hits = [i for i in range(len(compact) - len(before) + 1) if compact[i:i + len(before)] == before]
        assert len(hits) == 1, f"Ambiguous patch: {path}: {before[0]} ({len(hits)})"
        start = hits[0]
        lines[positions[start]:positions[start + len(before) - 1] + 1] = hunk['after']
    outputs[path] = '\n'.join(lines) + '\n'

for path, text in outputs.items():
    path.write_text(text, encoding='utf-8', newline='\n')
for name in [
    'internal/model/user_model_preference.go',
    'internal/handler/auth_model_preferences.go',
    'internal/handler/auth_model_preferences_test.go',
    'internal/handler/auth_model_preferences_integration_test.go',
    'web/app/src/hooks/use-model-preferences.ts',
    'web/app/src/lib/api/model-preferences.ts',
]:
    destination = target / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(repo / name, destination)
print('Applied model preferences to verified production source')
