"""Build on the verified v1.0.87 production tree, preserving production-only routes.
Usage: python apply_source.py BASELINE NEW_DIRECTORY
"""
import hashlib
import json
from pathlib import Path
import shutil
import sys

repo = Path(__file__).resolve().parents[2]
baseline, target = map(lambda s: Path(s).resolve(), sys.argv[1:])
assert not target.exists(), 'Choose a new build directory'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = json.loads((repo/'deploy/billing-refund-20261111/build.json').read_text())
for name, expected in manifest['production_files'].items():
    assert sha(baseline/name) == expected, 'Unexpected production baseline: '+name
for folder in ['cmd','internal','pkg','docs']:
    shutil.copytree(baseline/folder,target/folder)
for name in ['go.mod','go.sum']:
    shutil.copy2(baseline/name,target/name)
for name in ['usage_stats.go','usage_stats_test.go']:
    shutil.copy2(repo/'internal/handler'/name,target/'internal/handler'/name)
router = target/'internal/router/user.go'
text = router.read_text()
needle = '\t\tuser.GET("/stats/tokens", handler.GetUserTokenStats)'
assert text.count(needle)==1
router.write_text(text.replace(needle,needle+'\n\t\tuser.GET("/stats/usage", handler.GetUserUsageStats)'),newline='\n')
print('Prepared production source with existing routes and billing fixes preserved')
