"""Create a temporary verification key, exercise real auth, revoke in finally. Never print secrets."""
import argparse,base64,hashlib,hmac,http.client,json,time,datetime as dt
from pathlib import Path
import yaml,psycopg2
p=argparse.ArgumentParser();p.add_argument('--live',action='store_true');a=p.parse_args()
root=Path('/root/fanapi-leaderboard-v1.0.102');cfg=yaml.safe_load(Path('/root/fanapi-return-20261113/midcode-independent-api-1.yaml').read_text())
enc=lambda x:base64.urlsafe_b64encode(json.dumps(x,separators=(',',':')).encode()).decode().rstrip('=')
def jwt(uid):
 now=int(time.time());s=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':uid,'role':'admin','iat':now,'exp':now+600});return s+'.'+base64.urlsafe_b64encode(hmac.new(cfg['server']['jwt_secret'].encode(),s.encode(),hashlib.sha256).digest()).decode().rstrip('=')
def req(method,path,key='',body=None):
 c=http.client.HTTPConnection('127.0.0.1',8154 if a.live else 8165,timeout=30)
 headers={'Host':'midcode.cc','Content-Type':'application/json','X-Midcode-Client-IP':'203.0.113.7'}
 if key:headers['Authorization']='Bearer '+key
 c.request(method,path,json.dumps(body) if body is not None else None,headers);r=c.getresponse();raw=r.read();status=r.status;c.close();return status,json.loads(raw) if raw else None
from decimal import Decimal
from collections import defaultdict
admin=jwt(1);kid=None
path='/api/v1/bot/leaderboard/daily'
try:
 for key in ['', 'sk-ordinary',admin]:assert req('GET',path,key)[0]==401
 status,key=req('POST','/api/admin/bot-keys',admin,{'name':'leaderboard-verification-revoke'});assert status==201;kid=key['id'];secret=key['key']
 for value in ['2026-02-29','2026-1-01','9999-12-31','bad']:assert req('GET',path+'?date='+value,secret)[0]==400
 status,empty=req('GET',path+'?date=1900-01-01',secret);assert status==200 and empty['items']==[] and empty['count']==0 and not empty['is_partial']
 t=time.monotonic();status,today=req('GET',path,secret);elapsed=time.monotonic()-t;assert status==200
 loc=dt.timezone(dt.timedelta(hours=8));day=dt.datetime.now(loc).date();assert today['date']==str(day) and today['is_partial']
 yesterday=day-dt.timedelta(days=1);status,result=req('GET',path+'?date='+str(yesterday),secret);assert status==200 and not result['is_partial']
 assert result['start_at']==str(yesterday)+'T00:00:00+08:00' and result['end_at']==str(day)+'T00:00:00+08:00'
 assert result['timezone']=='Asia/Shanghai' and result['currency']=='CNY' and result['limit']==10 and result['count']==len(result['items'])
 d=cfg['db'];conn=psycopg2.connect(host=d['host'],port=d['port'],user=d['user'],password=d['password'],dbname=d['dbname']);conn.set_session(readonly=True);cur=conn.cursor();cur.execute("SET LOCAL statement_timeout='15s'")
 cur.execute("SELECT id,COALESCE(username,'') FROM users");users=dict(cur.fetchall())
 cur.execute("SELECT user_id,qq FROM user_qq_bindings WHERE verified_at IS NOT NULL AND verified_group_id='767281836'");qqs=dict(cur.fetchall())
 cur.execute("SELECT user_id,type,credits FROM billing_transactions WHERE created_at >= %s AND created_at < %s",(str(yesterday),str(day)));net=defaultdict(int)
 for uid,kind,credits in cur:
  if kind in ('charge','hold','settle'):net[uid]+=credits
  elif kind=='refund':net[uid]-=credits
 expected=sorted(((uid,amount) for uid,amount in net.items() if uid in users and amount>0),key=lambda x:(-x[1],x[0]))[:10]
 assert len(result['items'])==len(expected)
 for i,(entry,(uid,amount)) in enumerate(zip(result['items'],expected),1):
  assert entry=={'rank':i,'user_id':uid,'username':users[uid],'qq':qqs.get(uid),'consumed_cny':format(Decimal(amount)/1000000,'.6f')}
 conn.rollback();conn.close()
 checks={'auth_rejected':True,'date_validation':True,'empty_day':True,'top10_python_ledger_crosscheck':True,'verified_qq_only':True,'today_query_seconds':round(elapsed,3),'live':a.live}
finally:
 if kid is not None:
  assert req('DELETE','/api/admin/bot-keys/'+str(kid),admin)[0]==204
  assert req('GET',path,secret)[0]==401
print(json.dumps(checks));(root/('leaderboard-live.json' if a.live else 'leaderboard-candidate.json')).write_text(json.dumps(checks,indent=2))
