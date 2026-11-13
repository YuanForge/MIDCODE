"""Exercise the real SQL using transaction-local temporary tables; roll back all fixtures.
Usage: python3 verify_sql.py CONFIG_YAML HANDLER_GO
"""
import datetime as dt
import json
import pathlib
import re
import sys
import psycopg2
import yaml

cfg = yaml.safe_load(pathlib.Path(sys.argv[1]).read_text())['db']
query = pathlib.Path(sys.argv[2]).read_text().split('const usageStatsQuery = `', 1)[1].split('`', 1)[0]
query = re.sub(r'\$(\d+)', lambda m: '%(p' + m[1] + ')s', query)
conn = psycopg2.connect(host=cfg['host'], port=cfg['port'], user=cfg['user'], password=cfg['password'], dbname=cfg.get('dbname', cfg.get('db_name')), connect_timeout=10)
try:
    cur = conn.cursor()
    cur.execute("SET LOCAL statement_timeout = '15s'")
    cur.execute("CREATE TEMP TABLE channels(id bigint, protocol text) ON COMMIT DROP")
    cur.execute("CREATE TEMP TABLE llm_logs(id bigint,user_id bigint,channel_id bigint,model text,corr_id text,status text,created_at timestamp,usage jsonb) ON COMMIT DROP")
    cur.execute("CREATE TEMP TABLE billing_transactions(user_id bigint,corr_id text,type text,credits bigint,created_at timestamp) ON COMMIT DROP")
    cur.execute("INSERT INTO channels VALUES(1,'openai'),(2,'claude')")
    values = [
        (1,1,1,'gpt','a','ok','2026-11-07 00:00:00',100,40,0,20),
        (2,1,2,'claude','b','ok','2026-11-07 23:59:59',100,50,30,20),
        (3,1,1,'gpt','c','error','2026-11-08 00:00:00',999,0,0,999),
        (4,1,1,'gpt','d','pending','2026-11-08 12:00:00',0,0,0,0),
        (5,2,1,'gpt','a','ok','2026-11-08 12:00:00',999,0,0,999),
        (6,1,999,'deleted-channel','e','ok','2026-11-08 23:59:59',100,40,0,20),
        (7,1,1,'gpt','f','ok','2026-11-09 00:00:00',999,0,0,999),
        (8,1,1,'gpt','p','ok','2026-11-06 12:00:00',100,40,0,20),
    ]
    for row in values:
        cur.execute('INSERT INTO llm_logs VALUES(%s,%s,%s,%s,%s,%s,%s,%s)', row[:7] + (json.dumps(dict(zip(['prompt_tokens','cache_read_tokens','cache_creation_tokens','completion_tokens'],row[7:]))),))
    for uid,corr,kind,amount,date in [(1,'a','hold',1000,'2026-11-07'),(1,'a','refund',800,'2026-11-10'),(1,'b','charge',300,'2026-11-07'),(1,'c','hold',500,'2026-11-08'),(1,'c','refund',500,'2026-11-08'),(1,'d','hold',800,'2026-11-08'),(2,'a','charge',90000,'2026-11-08'),(1,'e','settle',70,'2026-11-08'),(1,'p','charge',50,'2026-11-06')]:
        cur.execute('INSERT INTO billing_transactions VALUES(%s,%s,%s,%s,%s)',(uid,corr,kind,amount,date))
    params=dict(p1=1,p2='2026-11-05 00:00:00',p3='2026-11-09 00:00:00',p4='2026-11-07 00:00:00',p5='day')
    for timezone in ['UTC','Asia/Shanghai']:
        cur.execute('SET LOCAL TIME ZONE %s',(timezone,))
        cur.execute(query,params)
        rows=cur.fetchall(); current=[r for r in rows if r[0]==1]
        assert sum(r[3] for r in current)==5
        assert sum(r[4] for r in current)==3 and sum(r[5] for r in current)==1
        assert sum(r[6] for r in current)==570, 'refund, tenant isolation or pending hold error'
        assert sum(sum(r[7:11]) for r in current)==440, 'cache normalization error'
        assert min(r[1].timestamp() for r in current)==dt.datetime(2026,11,6,16,tzinfo=dt.timezone.utc).timestamp(), 'Beijing boundary error'
        assert sum(r[6] for r in rows if r[0]==0)==50
    print('PASS: SQL tenant isolation, later/full refunds, pending holds, cache normalization, deleted channels, exclusive end, previous period, UTC/Beijing session invariance')
finally:
    conn.rollback()
    conn.close()
