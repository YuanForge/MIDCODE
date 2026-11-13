"""Old-host half of workbench handover: preserve volumes and replace stale tenant shells."""
import json,pathlib,subprocess
base=pathlib.Path('/root/fanapi-return-20261113')
def run(*a):return subprocess.check_output(a,text=True)
names=run('docker','ps','-aq','--filter','name=midcode-video-user-').split()
if names:
 cs=json.loads(run('docker','inspect',*names));assert all(not c['State']['Running'] for c in cs),'old tenant still running'
 (base/'retired-tenants-private.json').write_text(json.dumps(cs));(base/'retired-tenants-private.json').chmod(0o600)
 for c in cs:
  for net in c['NetworkSettings']['Networks']:
   for gateway in ['midcode-video-gateway','midcode-video-gateway-allow20261102']:
    subprocess.run(['docker','network','disconnect',net,gateway],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  subprocess.run(['docker','rm',c['Id']],check=True,stdout=subprocess.DEVNULL)
preview='midcode-return-preview-v1088'
state=json.loads(run('docker','inspect',preview))[0];assert not state['State']['Running'];(base/'preview-candidate-private.json').write_text(json.dumps(state));(base/'preview-candidate-private.json').chmod(0o600)
subprocess.run(['docker','rm',preview],check=True,stdout=subprocess.DEVNULL)
code=(base/'preview.py').read_text().replace('preview-state-candidate','preview-state');exec(compile(code,'preview-final.py','exec'))
subprocess.run(['docker','start','midcode-video-s3-v1063'],check=True,stdout=subprocess.DEVNULL)
print('Final workbench state activated; legacy tenant volumes preserved')
