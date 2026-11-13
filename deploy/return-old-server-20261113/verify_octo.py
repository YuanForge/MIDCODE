import json,time,yaml,psycopg2,hmac,hashlib,base64,http.client,pathlib
base=pathlib.Path('/root/fanapi-return-20261113');item=json.loads((base/'additional-private.json').read_text())[0];env=dict(e.split('=',1) for e in item['Config']['Env']);cfg=yaml.safe_load((base/'octoapi-independent-api-1.yaml').read_text());db=cfg['db']
c=psycopg2.connect(host=db['host'],port=db['port'],dbname=db['dbname'],user=db['user'],password=env.get('OCTOAPI_DB_PASSWORD',db['password']),connect_timeout=10);c.set_session(readonly=True)
with c.cursor() as q:
 q.execute("SELECT s.id,a.id,a.session_epoch FROM station_domains d JOIN stations s ON s.id=d.station_id JOIN accounts a ON a.station_id=s.id WHERE d.domain=%s AND a.status='active'",('octoapi.xyz',));sid,aid,epoch=q.fetchone()
c.close();now=int(time.time());claims={'account_id':aid,'station_id':sid,'session_epoch':epoch,'auth_time':now,'issued_at':now,'expires_at':now+180,'iat':now,'exp':now+180};enc=lambda d:base64.urlsafe_b64encode(json.dumps(d,separators=(',',':')).encode()).decode().rstrip('=');s=enc({'alg':'HS256','typ':'JWT'})+'.'+enc(claims);token=s+'.'+base64.urlsafe_b64encode(hmac.new(env['OCTOAPI_SERVER_JWT_SECRET'].encode(),s.encode(),hashlib.sha256).digest()).decode().rstrip('=')
for auth in [True,False]:
 c=http.client.HTTPConnection('127.0.0.1',8092,timeout=20);headers={'Host':'octoapi.xyz'}
 if auth:headers['Authorization']='Bearer '+token
 c.request('GET','/api/user/profile',headers=headers);r=c.getresponse();r.read();assert r.status==(200 if auth else 401),r.status;c.close()
print('OctoAPI authenticated profile and unauthenticated isolation passed')
