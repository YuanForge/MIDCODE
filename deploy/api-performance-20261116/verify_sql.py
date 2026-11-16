import json,re,time,statistics
from pathlib import Path
import psycopg2,yaml
ROOT=Path('/root/fanapi-perf-v1.0.95')
cfg=yaml.safe_load(Path('/root/fanapi-return-20261113/midcode-independent-api-1.yaml').read_text())['db']
c=psycopg2.connect(host=cfg['host'],port=cfg['port'],user=cfg['user'],password=cfg['password'],dbname=cfg['dbname'],connect_timeout=10)
k=c.cursor();k.execute("SET LOCAL statement_timeout='60s'")
qs=json.loads((ROOT/'queries.json').read_text())
def run(name,params,i=0):
 q=qs[name][i]
 if isinstance(params,dict):q=re.sub(r'\$(\d+)',lambda m:'%(p'+m[1]+')s',q)
 else:q=q.replace('?','%s')
 t=time.monotonic();k.execute(q,params);rows=k.fetchall();return rows,round(time.monotonic()-t,3)
# Isolated temporary fixtures include legacy/null keys, cross-midnight refunds,
# other tenants, duplicate correlation logs, missing/zero performance metrics.
k.execute('CREATE TEMP TABLE billing_transactions(id bigint,user_id bigint,api_key_id bigint,corr_id text,type text,credits bigint,created_at timestamp) ON COMMIT DROP')
k.execute('CREATE TEMP TABLE llm_logs(id bigint,user_id bigint,channel_id bigint,model text,corr_id text,status text,created_at timestamp,updated_at timestamp,usage jsonb) ON COMMIT DROP')
k.execute('CREATE TEMP TABLE channels(id bigint,protocol text) ON COMMIT DROP')
k.execute("INSERT INTO channels VALUES(1,'openai'),(2,'claude')")
for row in [(1,3,1,'a','hold',100,'2026-11-15 23:59'),(2,3,0,'a','refund',40,'2026-11-17 01:00'),(3,3,2,'b','charge',200,'2026-11-16 08:00'),(4,3,0,'b','refund',50,'2026-11-16 10:00'),(5,3,1,None,'charge',30,'2026-11-16 11:00'),(6,3,1,'','charge',20,'2026-11-01'),(7,3,1,'','refund',10,'2026-11-16'),(8,4,2,'a','hold',999,'2026-11-16'),(9,3,0,'old','hold',700,'2025-01-01'),(10,3,0,'old','refund',700,'2026-11-16')]:
 k.execute('INSERT INTO billing_transactions VALUES('+','.join(['%s']*7)+')',row)
for i,(status,ttft,tps) in enumerate([('ok',0,5),('ok',10,10),('error',20,2),('pending',30,3),('ok',40,20)]):
 usage=json.dumps(dict(prompt_tokens=100,cache_read_tokens=20,completion_tokens=30,performance_ttft_ms=ttft,performance_tps=tps))
 k.execute('INSERT INTO llm_logs VALUES(%s,3,1,%s,%s,%s,%s,%s,%s)',(i+1,'gpt','b' if i<2 else 'x'+str(i),status,'2026-11-16 12:00','2026-11-16 12:00:01',usage))
pday=[3,'2026-11-16','2026-11-17'];pweek=[3,'2026-11-10','2026-11-17']
oldtotal=run('stats_old',[3],0)[0][0][0];oldtoday=run('stats_old',pday,1)[0][0][0];olddaily=run('stats_old',pweek,2)[0]
new=run('stats_new',[3,'2026-11-10','2026-11-17','2026-11-16','2026-11-17','2026-11-10','2026-11-17'])[0]
assert [(x[0],x[1]) for x in new if x[4]==1]==[(oldtotal,oldtoday)]
assert [(x[2],x[0]) for x in new if x[4]==0]==olddaily
assert sorted(run('keys_old',[3,3,*pday[1:]])[0])==sorted(run('keys_new',[3,3,3,*pday[1:]])[0])
p=dict(p1=3,p2='2026-11-03',p3='2026-11-17',p4='2026-11-10',p5='day')
assert run('usage_old',p)[0]==run('usage_new',p)[0]
c.rollback();print('PASS isolated SQL equivalence ',flush=True)
# Real account comparison in one repeatable read snapshot.
c.set_session(readonly=True,isolation_level='REPEATABLE READ');k=c.cursor();k.execute("SET LOCAL statement_timeout='60s'")
report={}
for name,params in [('keys_old',[3,3,*pday[1:]]),('keys_new',[3,3,3,*pday[1:]]),('usage_old',p),('usage_new',p)]:
 rows,elapsed=run(name,params);report[name]=elapsed
 if name.endswith('old'):old=rows
 else:assert rows==old if name.startswith('usage') else sorted(rows)==sorted(old)
new,elapsed=run('stats_new',[3,'2026-11-10','2026-11-17','2026-11-16','2026-11-17','2026-11-10','2026-11-17']);report['stats_new']=elapsed
oldtotal,t=run('stats_old',[3],0);oldtoday,t2=run('stats_old',pday,1);olddaily,t3=run('stats_old',pweek,2);report['stats_old']=round(t+t2+t3,3)
assert [(x[0],x[1]) for x in new if x[4]==1]==[(oldtotal[0][0],oldtoday[0][0])]
assert [(x[2],x[0]) for x in new if x[4]==0]==olddaily
c.rollback();c.close();print(json.dumps(report));(ROOT/'sql-validation.json').write_text(json.dumps(report,indent=2))
