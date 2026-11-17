"""Create a temporary verification key, exercise real auth, revoke in finally. Never print secrets."""
import argparse,base64,hashlib,hmac,http.client,json,time,datetime as dt
from pathlib import Path
import yaml,psycopg2
p=argparse.ArgumentParser();p.add_argument('--live',action='store_true');a=p.parse_args()
root=Path('/root/fanapi-qq-v1.0.99');cfg=yaml.safe_load(Path('/root/fanapi-return-20261113/midcode-independent-api-1.yaml').read_text())
enc=lambda x:base64.urlsafe_b64encode(json.dumps(x,separators=(',',':')).encode()).decode().rstrip('=')
def jwt(uid):
 now=int(time.time());s=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':uid,'role':'admin','iat':now,'exp':now+600});return s+'.'+base64.urlsafe_b64encode(hmac.new(cfg['server']['jwt_secret'].encode(),s.encode(),hashlib.sha256).digest()).decode().rstrip('=')
def req(method,path,key='',body=None):
 c=http.client.HTTPConnection('127.0.0.1',8154 if a.live else 8163,timeout=30)
 headers={'Host':'midcode.cc','Content-Type':'application/json','X-Midcode-Client-IP':'203.0.113.7'}
 if key:headers['Authorization']='Bearer '+key
 c.request(method,path,json.dumps(body) if body is not None else None,headers);r=c.getresponse();raw=r.read();status=r.status;c.close();return status,json.loads(raw) if raw else None
admin=jwt(1);kid=None
try:
 assert req('GET','/api/v1/bot/users/3/financial-summary')[0]==401
 assert req('GET','/api/v1/bot/users/3/financial-summary','sk-ordinary')[0]==401
 assert req('GET','/api/v1/bot/users/3/financial-summary',admin)[0]==401
 assert req('POST','/api/admin/bot-keys',jwt(3),{'name':'must-not-create'})[0]==403
 status,key=req('POST','/api/admin/bot-keys',admin,{'name':'release-verification-revoke-after-test'});assert status==201,status;kid=key['id'];secret=key['key'];assert secret.startswith('bot_')
 assert req('GET','/api/user/balance',secret)[0]==401
 status,meta=req('GET','/api/admin/bot-keys',admin);assert status==200;assert 'key_hash' not in json.dumps(meta) and secret not in json.dumps(meta)
 assert req('GET','/api/v1/bot/users/0/financial-summary',secret)[0]==400
 assert req('GET','/api/v1/bot/users/9223372036854775807/financial-summary',secret)[0]==404
 t=time.monotonic();status,result=req('GET','/api/v1/bot/users/3/financial-summary',secret);assert status==200,status
 elapsed=time.monotonic()-t;loc=dt.timezone(dt.timedelta(hours=8));end=dt.datetime.now(loc).replace(hour=0,minute=0,second=0,microsecond=0)
 assert result['last_7_days']['start_at']==(end-dt.timedelta(days=7)).isoformat()
 assert result['last_7_days']['end_at']==end.isoformat()
 assert result['yesterday']['start_at']==(end-dt.timedelta(days=1)).isoformat()
 from decimal import Decimal
 for value in [result['balance_cny'],result['yesterday']['consumed_cny'],result['last_7_days']['consumed_cny']]:assert isinstance(value,str);Decimal(value)
 db=cfg['db'];c=psycopg2.connect(host=db['host'],port=db['port'],user=db['user'],password=db['password'],dbname=db['dbname']);c.set_session(readonly=True);cur=c.cursor();cur.execute("SET LOCAL statement_timeout='15s'")
 cur.execute("SELECT type,credits,created_at,corr_id,id FROM billing_transactions WHERE user_id=3");groups={}
 for kind,credits,at,corr,i in cur:
  g=groups.setdefault(corr if corr is not None else 'tx:'+str(i),[[],[],0]);g[0].append(at)
  if kind in ('hold','charge','settle'):g[1].append(at);g[2]+=credits
  elif kind=='refund':g[2]-=credits
 c.rollback();c.close()
 day=week=0;e=end.replace(tzinfo=None)
 for all_dates,charged,net in groups.values():
  at=min(charged or all_dates)
  if e-dt.timedelta(days=7)<=at<e:week+=net
  if e-dt.timedelta(days=1)<=at<e:day+=net
 assert Decimal(result['yesterday']['consumed_cny'])==Decimal(day)/1000000
 assert Decimal(result['last_7_days']['consumed_cny'])==Decimal(week)/1000000
 checks={'key_lifecycle':True,'ordinary_keys_and_jwt_rejected':True,'nonroot_management_denied':True,'scope_isolation':True,'date_ranges':True,'ledger_python_crosscheck':True,'query_seconds':round(elapsed,3),'live':a.live}
finally:
 if kid is not None:
  assert req('DELETE','/api/admin/bot-keys/'+str(kid),admin)[0]==204
  assert req('GET','/api/v1/bot/users/3/financial-summary',secret)[0]==401
print(json.dumps(checks));(root/('bot-live.json' if a.live else 'bot-candidate.json')).write_text(json.dumps(checks,indent=2))
