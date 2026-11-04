"""仅清理本次已被替换、已排空的候选实例，保留镜像和绑定目录。"""
from pathlib import Path
import json,sqlite3,subprocess,urllib.request

assert json.load(urllib.request.urlopen('http://127.0.0.1:8198/health'))['status']=='ok'
config=Path('/etc/fanapi-migration/conf.d/api.fanapi.cc.conf').read_text()
assert '127.0.0.1:8198' in config
retired=[('midcode-unified-candidate-v1072',8195,'/opt/midcode-unified-candidate/state'),('midcode-unified-preview-v1072',8196,'/opt/midcode-unified-preview/state'),('midcode-unified-preview-v1072-r2',8197,'/opt/midcode-unified-preview-r2/state')]
names=subprocess.check_output(['docker','ps','-aq'],text=True).split()
containers=json.loads(subprocess.check_output(['docker','inspect',*names],text=True))
for name,port,state in retired:
 if not any(c['Name'].lstrip('/')==name for c in containers):continue
 assert f':{port}' not in config
 for container in containers:
  if container['Name'].lstrip('/')==name:continue
  assert not any(f':{port}' in value for value in container['Config'].get('Env',[])), 'Remaining container dependency'
 for dbfile in Path(state).glob('*/tasks.sqlite'):
  with sqlite3.connect(f'file:{dbfile}?mode=ro',uri=True) as db:
   count=db.execute("SELECT count(*) FROM tasks WHERE status IN ('queued','排队中','processing')").fetchone()[0]
   assert count==0,'Tasks still running'
 connections=subprocess.check_output(['ss','-Htn','state','established',f'( sport = :{port} or dport = :{port} )'],text=True)
 assert not connections.strip(),'Connections not drained'
 subprocess.run(['docker','stop','--time','30',name],check=True)
 subprocess.run(['docker','rm',name],check=True)
 print('REMOVED_UNUSED_TEST_CANDIDATE',name)
