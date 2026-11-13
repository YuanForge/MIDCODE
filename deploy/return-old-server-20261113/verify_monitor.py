"""Isolated monitor webhook acceptance; no messages, payments, or real account writes."""
import json,pathlib,subprocess,psycopg2,secrets,hashlib,http.client
from psycopg2 import sql
base=pathlib.Path('/root/fanapi-return-20261113');item=next(c for c in json.loads((base/'additional-private.json').read_text()) if c['Name']=='/observability-api-1');env=dict(e.split('=',1) for e in item['Config']['Env']);db=psycopg2.connect(env['DATABASE_URL']);db.autocommit=True
uid=pid=None;token=secrets.token_hex(32);checks=[]
def req(method,path,body=None,auth=True):
 c=http.client.HTTPConnection('127.0.0.1',18090,timeout=30);h={'Host':'monitor.fanapi.cc','Origin':'https://monitor.fanapi.cc','Content-Type':'application/json','X-Project-ID':str(pid)}
 if auth:h['Cookie']='obs_session='+token
 c.request(method,'/v1/'+path,json.dumps(body) if body is not None else None,h);r=c.getresponse();b=r.read();c.close();return r.status,json.loads(b)
try:
 with db.cursor() as q:
  q.execute("INSERT INTO app_users(email,username,password_hash,email_verified) VALUES(%s,%s,%s,true) RETURNING id",('migration-'+token[:12]+'@example.invalid','migration_'+token[:12],'!disabled-migration-fixture'));uid=q.fetchone()[0]
  q.execute("INSERT INTO projects(owner_id,name) VALUES(%s,'migration acceptance fixture') RETURNING id",(uid,));pid=q.fetchone()[0]
  q.execute("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(%s,%s,now()+interval '10 minutes')",(hashlib.sha256(token.encode()).hexdigest(),uid))
 assert req('GET','projects')[0]==200
 assert req('GET','webhook-endpoints',auth=False)[0]==401
 s,ep=req('POST','webhook-endpoints',{'name':'migration acceptance fixture'});assert s==201,(s,ep)
 s,_=req('POST','hooks/'+ep['token'],{'message':'migration-verification','password':'test-secret'},auth=False);assert s==202,s
 s,events=req('GET','webhook-endpoints/'+ep['token']+'/events');assert s==200 and len(events)==1
 s,event=req('GET','webhook-endpoints/'+ep['token']+'/events/'+str(events[0]['id']));assert s==200 and event['body']['password']=='[REDACTED]'
 checks=['session/project access','unauthenticated rejection','webhook ingestion','event retrieval','sensitive-field redaction']
finally:
 if pid:
  with db.cursor() as q:
   q.execute("SELECT DISTINCT c.conrelid::regclass::text,a.attname FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.contype='f' AND c.confrelid='projects'::regclass")
   refs=q.fetchall()
  remaining=refs
  for _ in range(len(refs)+1):
   nextrefs=[]
   for table,col in remaining:
    try:
     with db.cursor() as q:q.execute(sql.SQL('DELETE FROM {} WHERE {}=%s').format(sql.Identifier(*table.split('.')),sql.Identifier(col)),(pid,))
    except psycopg2.IntegrityError:nextrefs.append((table,col))
   remaining=nextrefs
   if not remaining:break
  assert not remaining,'fixture cleanup dependencies remain'
  with db.cursor() as q:q.execute('DELETE FROM projects WHERE id=%s',(pid,))
 if uid:
  with db.cursor() as q:q.execute('DELETE FROM audit_events WHERE user_id=%s',(uid,));q.execute('DELETE FROM app_users WHERE id=%s',(uid,))
 db.close()
print(json.dumps({'passed':True,'checks':checks,'fixture_cleanup':True,'messages_sent':False,'payments_tested':False}))
