import base64,hashlib,hmac,http.client,json,secrets,sys,time
from pathlib import Path
import psycopg2,yaml
ROOT=Path('/root/fanapi-billing-refund-v1.0.87')
cfg=yaml.safe_load(Path('/root/fanapi-migration/shared-configs/midcode-independent-api-1.yaml').read_text());d=cfg['db']
db=psycopg2.connect(host=d['host'],port=d['port'],dbname=d['dbname'],user=d['user'],password=d['password'],connect_timeout=10)
db.autocommit=True
state_file=ROOT/'verification-users.private.json'
def clean(users):
 with db.cursor() as cur:
  ids=[x['id'] for x in users]
  cur.execute('DELETE FROM user_model_preferences WHERE user_id = ANY(%s)',(ids,))
  cur.execute('DELETE FROM users WHERE id = ANY(%s) AND username LIKE %s',(ids,'codex_refund_pref_1087_%'))
  cur.execute('SELECT count(*) FROM users WHERE id = ANY(%s)',(ids,));assert cur.fetchone()[0]==0
 if state_file.exists():state_file.unlink()
def token(uid):
 enc=lambda x:base64.urlsafe_b64encode(json.dumps(x,separators=(',',':')).encode()).decode().rstrip('=')
 now=int(time.time());s=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':uid,'role':'user','group':'','iat':now,'exp':now+3600})
 return s+'.'+base64.urlsafe_b64encode(hmac.new(cfg['server']['jwt_secret'].encode(),s.encode(),hashlib.sha256).digest()).decode().rstrip('=')
if sys.argv[1]=='cleanup':
 users=json.loads(state_file.read_text());clean(users);print('TEMPORARY_USERS_AND_PREFERENCES_REMOVED');sys.exit(0)
port=int(sys.argv[1]);keep='--keep-users' in sys.argv
users=[];checks=[]
def req(method,path,body=None,user=0,auth=True):
 c=http.client.HTTPConnection('127.0.0.1',port,timeout=30)
 headers={'Content-Type':'application/json'}
 if auth:headers['Authorization']='Bearer '+users[user]['token']
 c.request(method,path,json.dumps(body) if body is not None else None,headers);r=c.getresponse();raw=r.read();c.close()
 try:res=json.loads(raw)
 except:res={'invalid_json':True}
 return r.status,res
def ok(method,path,body=None,user=0):
 status,res=req(method,path,body,user);assert status==200,(method,path,status,res);return res
path='/api/user/model-preferences'
try:
 if state_file.exists():
  users=json.loads(state_file.read_text())
  for u in users:u['token']=token(u['id'])
 else:
  with db.cursor() as cur:
   for i in range(2):
    name='codex_refund_pref_1087_'+secrets.token_hex(6)
    cur.execute('INSERT INTO users (username,password_hash,role,"group",is_active,balance,created_at,updated_at) VALUES (%s,%s,%s,%s,true,0,now(),now()) RETURNING id',(name,'!disabled-'+secrets.token_hex(32),'user',''));uid=cur.fetchone()[0]
    users.append({'id':uid,'username':name,'token':token(uid)})
 state_file.write_text(json.dumps(users));state_file.chmod(0o600)
 assert req('GET',path,auth=False)[0]==401
 assert req('PATCH',path,{'routing_model':'x','favorite':True},auth=False)[0]==401;checks.append('unauthenticated GET/PATCH rejected')
 channels=ok('GET','/api/user/channels')['channels'];model=next(x['routing_model'] for x in channels if x.get('routing_model'));checks.append('model selected from live catalog')
 for user in range(2):
  for pref in ok('GET',path,user=user)['preferences']:
   ok('PATCH',path,{'routing_model':pref['routing_model'],'pinned':False,'favorite':False},user=user)
 assert all(not p['favorite'] and not p['pinned'] for p in ok('GET',path)['preferences'])
 res=ok('PATCH',path,{'routing_model':model,'favorite':True});assert res['favorite'] is True and res['pinned'] is False
 assert ok('GET',path)['preferences'][0]['favorite'] is True;checks.append('favorite persists on GET')
 assert ok('GET',path,user=1)['preferences']==[];checks.append('user isolation')
 res=ok('PATCH',path,{'routing_model':model,'pinned':True});assert res['favorite'] is True and res['pinned'] is True
 res=ok('PATCH',path,{'routing_model':model,'favorite':False});assert res['favorite'] is False and res['pinned'] is True;checks.append('pin and favorite independent')
 res=ok('PATCH',path,{'routing_model':model,'pinned':False});assert res['favorite'] is False and res['pinned'] is False
 assert all(not p['favorite'] and not p['pinned'] for p in ok('GET',path)['preferences']);checks.append('cleared preferences remain false')
 a=ok('PATCH',path,{'routing_model':model,'favorite':True});b=ok('PATCH',path,{'routing_model':model,'favorite':True});assert a==b
 assert len(ok('GET',path)['preferences'])==1;checks.append('idempotent update')
 status,_=req('PATCH',path,{'routing_model':model,'favorite':'yes'});assert status==400;checks.append('invalid boolean rejected')
 status,_=req('PATCH',path,{'routing_model':'codex-missing-model-'+secrets.token_hex(5),'favorite':True});assert status in (400,404);checks.append('unknown model rejected')
 assert ok('GET',path,user=1)['preferences']==[]
 result={'port':port,'passed':checks,'temporary_user_ids':[x['id'] for x in users],'model':model,'kept_for_browser':keep}
 (ROOT/('verify-'+str(port)+'.json')).write_text(json.dumps(result,indent=2));print(json.dumps(result))
finally:
 if users and not keep:clean(users)
 db.close()
