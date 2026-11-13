import json,pathlib,subprocess
b=pathlib.Path('/root/fanapi-return-20261113');saved=json.loads((b/'source-workbenches-private.json').read_text());names=[c['Name'].lstrip('/') for c in saved]
current=json.loads(subprocess.check_output(['docker','inspect']+names));assert all(not c['State']['Running'] for c in current),'source writer unexpectedly running'
config=pathlib.Path('/etc/caddy/Caddyfile').read_text();assert '127.0.0.1:8198' not in config and '127.0.0.1:8183' not in config
active=json.loads(subprocess.check_output(['docker','inspect']+subprocess.check_output(['docker','ps','-q'],text=True).split()))
for other in active:
 text=json.dumps(other['Config'])
 assert not any(name in text for name in names),'active container references source workbench'
for name in names:subprocess.run(['docker','rm',name],check=True,stdout=subprocess.DEVNULL)
result={'removed':names,'volumes_removed':False,'images_removed':False,'source_api_retained_for_dns':True};(b/'source-cleanup.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
