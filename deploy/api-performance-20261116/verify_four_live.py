"""Authenticated read-only endpoint timings; never log API keys or credentials."""
import socket,ssl
import base64,hashlib,hmac,http.client,json,time
from pathlib import Path
import yaml
ROOT=Path('/root/fanapi-perf-v1.0.95')
cfg=yaml.safe_load(Path('/root/fanapi-return-20261113/midcode-independent-api-1.yaml').read_text())
enc=lambda x:base64.urlsafe_b64encode(json.dumps(x,separators=(',',':')).encode()).decode().rstrip('=')
now=int(time.time());data=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':3,'role':'user','group':'default','iat':now,'exp':now+600})
token=data+'.'+base64.urlsafe_b64encode(hmac.new(cfg['server']['jwt_secret'].encode(),data.encode(),hashlib.sha256).digest()).decode().rstrip('=')
paths=['/api/user/stats','/api/user/model-availability','/api/user/stats/usage?start_at=2026-11-09T16:00:00.000Z&end_at=2026-11-16T06:07:11.037Z&bucket=day','/api/user/apikeys']
report=[]
for path in paths:
 for port in [443]:
  c=http.client.HTTPSConnection('midcode.cc',timeout=90);c.sock=ssl.create_default_context().wrap_socket(socket.create_connection(('127.0.0.1',443),90),server_hostname='midcode.cc');t=time.monotonic()
  c.request('GET',path,headers={'Host':'midcode.cc','Authorization':'Bearer '+token,'X-Midcode-Client-IP':'203.0.113.7'});res=c.getresponse();body=res.read();elapsed=round(time.monotonic()-t,3);c.close()
  assert res.status==200,(path,port,res.status)
  obj=json.loads(body)
  if 'model-availability' in path:
   assert all(len(m['recent'])<=60 and 0<=m['success']<=m['total'] for m in obj['models'])
  report.append(dict(path=path.split('?')[0],port=port,seconds=elapsed,bytes=len(body)))
print(json.dumps(report));(ROOT/'live-four-apis.json').write_text(json.dumps(report,indent=2))
