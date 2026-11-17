"""Create a temporary verification key, exercise real auth, revoke in finally. Never print secrets."""
import argparse,base64,hashlib,hmac,http.client,json,time,datetime as dt
from pathlib import Path
import yaml,psycopg2
p=argparse.ArgumentParser();p.add_argument('--live',action='store_true');a=p.parse_args()
root=Path('/root/fanapi-qq-v1.0.100');cfg=yaml.safe_load(Path('/root/fanapi-return-20261113/midcode-independent-api-1.yaml').read_text())
enc=lambda x:base64.urlsafe_b64encode(json.dumps(x,separators=(',',':')).encode()).decode().rstrip('=')
def jwt(uid):
 now=int(time.time());s=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':uid,'role':'admin','iat':now,'exp':now+600});return s+'.'+base64.urlsafe_b64encode(hmac.new(cfg['server']['jwt_secret'].encode(),s.encode(),hashlib.sha256).digest()).decode().rstrip('=')
def req(method,path,key='',body=None):
 c=http.client.HTTPConnection('127.0.0.1',8154 if a.live else 8163,timeout=30)
 headers={'Host':'midcode.cc','Content-Type':'application/json','X-Midcode-Client-IP':'203.0.113.7'}
 if key:headers['Authorization']='Bearer '+key
 c.request(method,path,json.dumps(body) if body is not None else None,headers);r=c.getresponse();raw=r.read();status=r.status;c.close();return status,json.loads(raw) if raw else None

import uuid
admin=jwt(1);kid=None;ids=[]
db=cfg['db'];conn=psycopg2.connect(host=db['host'],port=db['port'],user=db['user'],password=db['password'],dbname=db['dbname']);conn.autocommit=True;cur=conn.cursor()
try:
 for _ in range(2):
  cur.execute("INSERT INTO users(username,password_hash,role,is_active,balance) VALUES(%s,'disabled-test-password','user',true,0) RETURNING id",('qq-test-'+uuid.uuid4().hex,));ids.append(cur.fetchone()[0])
 uid,other=ids;qq='9'+str(time.time_ns())[-17:];qq2='8'+qq[1:]
 status,key=req('POST','/api/admin/bot-keys',admin,{'name':'qq-verification-revoke'});assert status==201;kid=key['id'];secret=key['key']
 assert req('PUT','/api/user/qq-binding',secret,{'qq':qq})[0]==401
 assert req('PUT','/api/user/qq-binding',jwt(uid),{'qq':'01234'})[0]==400
 assert req('PUT','/api/user/qq-binding',jwt(uid),{'qq':qq})[0]==200
 assert req('GET','/api/user/qq-binding',jwt(uid))[1]['qq']==qq
 assert req('GET','/api/v1/bot/qq/'+qq+'/financial-summary',secret)[0]==404
 assert req('POST','/api/v1/bot/qq/confirm-binding',secret,{'qq':qq})[0]==200
 assert req('GET','/api/user/qq-binding',jwt(uid))[1]['verified']==True
 assert req('PUT','/api/user/qq-binding',jwt(other),{'qq':qq})[0]==409
 assert req('GET','/api/user/qq-binding',jwt(other))[1]['qq']==''
 assert req('GET','/api/v1/bot/qq/'+qq+'/financial-summary')[0]==401
 status,result=req('GET','/api/v1/bot/qq/'+qq+'/financial-summary',secret);assert status==200 and result['user_id']==uid
 assert result['last_7_days']['consumed_cny']=='0.000000'
 assert req('PUT','/api/user/qq-binding',jwt(uid),{'qq':qq2})[0]==200
 assert req('GET','/api/v1/bot/qq/'+qq2+'/financial-summary',secret)[0]==404
 assert req('POST','/api/v1/bot/qq/confirm-binding',secret,{'qq':qq2})[0]==200
 assert req('GET','/api/v1/bot/qq/'+qq+'/financial-summary',secret)[0]==404
 assert req('GET','/api/v1/bot/qq/'+qq2+'/financial-summary',secret)[1]['user_id']==uid
 assert req('DELETE','/api/user/qq-binding',jwt(uid))[0]==204
 assert req('GET','/api/v1/bot/qq/'+qq2+'/financial-summary',secret)[0]==404
 assert req('PUT','/api/user/qq-binding',jwt(other),{'qq':qq2})[0]==200
 checks={'bind_modify_unbind':True,'unique_conflict_preserves_binding':True,'bot_lookup_and_auth':True,'reuse_after_unbind':True,'live':a.live}
finally:
 if kid is not None: assert req('DELETE','/api/admin/bot-keys/'+str(kid),admin)[0]==204
 for uid in ids:
  cur.execute('DELETE FROM user_qq_bindings WHERE user_id=%s',(uid,));cur.execute('DELETE FROM users WHERE id=%s',(uid,))
 conn.close()
print(json.dumps(checks));(root/('qq-live.json' if a.live else 'qq-candidate.json')).write_text(json.dumps(checks,indent=2))
