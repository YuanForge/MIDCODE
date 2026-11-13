"""Read-only authenticated statistics verification, no paid generation."""
import argparse
import base64
import datetime as dt
import hashlib
import hmac
import http.client
import json
from pathlib import Path
import socket
import ssl
import time
from urllib.parse import urlencode
import psycopg2
import yaml
from deploy import ROOT, NEW, healthy, save

p=argparse.ArgumentParser();p.add_argument('--live',action='store_true');a=p.parse_args()
cfg=yaml.safe_load(Path('/root/fanapi-return-20261113/midcode-independent-api-1.yaml').read_text())
enc=lambda x:base64.urlsafe_b64encode(json.dumps(x,separators=(',',':')).encode()).decode().rstrip('=')
now=int(time.time());data=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':3,'role':'user','group':'default','iat':now,'exp':now+600})
token=data+'.'+base64.urlsafe_b64encode(hmac.new(cfg['server']['jwt_secret'].encode(),data.encode(),hashlib.sha256).digest()).decode().rstrip('=')
def req(path,auth=True):
    if a.live:
        c=http.client.HTTPSConnection('midcode.cc',timeout=30)
        c.sock=ssl.create_default_context().wrap_socket(socket.create_connection(('127.0.0.1',443),30),server_hostname='midcode.cc')
    else:c=http.client.HTTPConnection('127.0.0.1',8155,timeout=30)
    headers={'Host':'midcode.cc','X-Midcode-Client-IP':'203.0.113.7'}
    if auth:headers['Authorization']='Bearer '+token
    c.request('GET',path,headers=headers);r=c.getresponse();raw=r.read();status=r.status;c.close();return status,raw
healthy(NEW)
loc=dt.timezone(dt.timedelta(hours=8));end=dt.datetime.now(loc).replace(microsecond=0)
start=(end-dt.timedelta(days=6)).replace(hour=0,minute=0,second=0)
params={'start_at':start.isoformat(),'end_at':end.isoformat(),'bucket':'day'}
path='/api/user/stats/usage?'+urlencode(params)
t=time.monotonic();status,raw=req(path);elapsed=round(time.monotonic()-t,3)
assert status==200,('statistics HTTP',status)
result=json.loads(raw)
assert len(result['points'])==7
for key in result['summary']:
    assert sum(m[key] for m in result['models'])==result['summary'][key],('model total mismatch',key)
    assert sum(m[key] for m in result['points'])==result['summary'][key],('trend total mismatch',key)
assert req(path,auth=False)[0]==401
assert req('/api/user/stats/usage?bucket=minute')[0]==400
assert req('/api/user/stats/usage?start_at=2026-01-01&end_at=2026-12-01')[0]==400
if result['models']:
    params['model']=result['models'][0]['model'];s,b=req('/api/user/stats/usage?'+urlencode(params));assert s==200
    filtered=json.loads(b);assert len(filtered['models'])==1
    assert filtered['summary']=={k:v for k,v in result['models'][0].items() if k!='model'}
db=cfg['db'];conn=psycopg2.connect(host=db['host'],port=db['port'],user=db['user'],password=db['password'],dbname=db['dbname'],connect_timeout=10)
try:
    conn.set_session(readonly=True);cur=conn.cursor();cur.execute("SET statement_timeout='15s'")
    cur.execute("SELECT count(*),count(*) FILTER(WHERE status='ok'),count(*) FILTER(WHERE status='error') FROM llm_logs WHERE user_id=3 AND created_at >= %s AND created_at < %s",(start.replace(tzinfo=None),end.replace(tzinfo=None)))
    counts=cur.fetchone();assert tuple(result['summary'][k] for k in ['requests','success','failed'])==counts
finally:conn.rollback();conn.close()
for endpoint in ['/api/user/channels','/api/user/model-preferences','/api/user/stats','/api/user/balance','/stats']:
    assert req(endpoint)[0]==200,endpoint
status,html=req('/stats');assert status==200 and b'/assets/' in html
checks={'healthy':True,'stats_seconds':elapsed,'seven_days':True,'model_and_trend_totals_match':True,'sql_counts_match':True,'exact_filter':True,'auth_isolation':True,'input_limits':True,'account_reads':True,'public_origin':a.live}
save('live-verified.json' if a.live else 'candidate-verified.json',checks)
print(json.dumps(checks))
