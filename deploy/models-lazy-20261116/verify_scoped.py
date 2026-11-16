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
    else:c=http.client.HTTPConnection('127.0.0.1',8160,timeout=30)
    headers={'Host':'midcode.cc','X-Midcode-Client-IP':'203.0.113.7'}
    if auth:headers['Authorization']='Bearer '+token
    c.request('GET',path,headers=headers);r=c.getresponse();raw=r.read();status=r.status;c.close();return status,raw
healthy(NEW)
status,raw=req('/api/user/channels');assert status==200
models=json.loads(raw)['channels'];name=next(x['routing_model'] for x in models if x.get('routing_model'))
from urllib.parse import quote
started=time.monotonic();status,raw=req('/api/user/model-availability?model='+quote(name,safe=''));assert status==200
result=json.loads(raw);assert all(x['routing_model']==name for x in result['models'])
assert req('/api/user/model-availability?model=__not_visible__')[0]==404
assert req('/api/user/model-availability?model='+quote(name,safe=''),auth=False)[0]==401
print(json.dumps({'scoped_statistics':True,'invisible_model_denied':True,'auth_required':True,'seconds':round(time.monotonic()-started,3)}))
