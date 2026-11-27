"""Maintain usage rollups with the same aggregation as the API.

Run with a FanAPI config file and the matching usage_stats.go source. One
transaction per user/day, with a session lock across workers. Never removes
raw logs or ledger records. --seed enqueues existing days before normal work.
"""
import argparse
import pathlib
import re
import time

import psycopg2
import yaml

parser = argparse.ArgumentParser()
parser.add_argument("config")
parser.add_argument("source")
parser.add_argument("--seed", action="store_true")
parser.add_argument("--limit", type=int, default=200)
args = parser.parse_args()
config = yaml.safe_load(pathlib.Path(args.config).read_text())["db"]
db = psycopg2.connect(host=config["host"], port=config["port"], user=config["user"],
                      password=config["password"], dbname=config.get("dbname") or config["db_name"],
                      application_name="usage-rollup", connect_timeout=8)
q = db.cursor()
q.execute("SELECT pg_try_advisory_lock(624827014)")
if not q.fetchone()[0]:
    raise SystemExit(0)
q.execute("SET statement_timeout='120s'")
q.execute("SET TIME ZONE 'Asia/Shanghai'")
if args.seed:
    q.execute("""INSERT INTO usage_rollup_state(user_id,day)
                 SELECT DISTINCT user_id,created_at::date FROM llm_logs
                 WHERE user_id IS NOT NULL AND created_at IS NOT NULL ON CONFLICT DO NOTHING""")
db.commit()

raw = pathlib.Path(args.source).read_text().split("const usageStatsQuery = `")[1].split("`")[0]
raw = re.sub(r"\$(\d+)", lambda m: "%(p"+m[1]+")s", raw)
columns = "requests,success,failed,credits,input,cache_read,cache_write,output"
sums = ",".join("sum("+col+")" for col in columns.split(","))

def consume_changes():
    q.execute("""WITH changed AS (
        DELETE FROM usage_rollup_changes WHERE id IN
        (SELECT id FROM usage_rollup_changes ORDER BY id LIMIT 20000) RETURNING *
    ), affected AS (
        SELECT user_id,at_time FROM changed WHERE at_time IS NOT NULL
        UNION ALL SELECT l.user_id,l.created_at FROM
        (SELECT DISTINCT user_id,corr FROM changed WHERE corr<>'') c
        JOIN llm_logs l ON l.user_id=c.user_id AND l.corr_id=c.corr
        UNION ALL SELECT l.user_id,l.created_at FROM
        (SELECT DISTINCT channel FROM changed WHERE channel IS NOT NULL) c
        JOIN llm_logs l ON l.channel_id=c.channel
    )
    INSERT INTO usage_rollup_state(user_id,day)
    SELECT user_id,at_time::date FROM affected WHERE user_id IS NOT NULL
    GROUP BY user_id,at_time::date
    ON CONFLICT(user_id,day) DO UPDATE SET dirty=true
    WHERE usage_rollup_state.covered_until IS NOT NULL AND EXISTS
    (SELECT 1 FROM affected a WHERE a.user_id=excluded.user_id
     AND a.at_time>=excluded.day AND a.at_time<usage_rollup_state.covered_until)
    """)
    db.commit()

def rebuild(uid, start, end):
    params = dict(p1=uid,p2=start,p3=end,p4=start,p5="hour")
    # A corr_id spanning hours cannot be attributed independently at arbitrary
    # report boundaries. Read these days directly through the original query.
    q.execute("""SELECT EXISTS(SELECT 1 FROM llm_logs l WHERE l.user_id=%s AND
      l.created_at >= %s AND l.created_at < %s AND l.corr_id<>'' AND EXISTS
      (SELECT 1 FROM llm_logs o WHERE o.user_id=l.user_id AND o.corr_id=l.corr_id
      AND (o.created_at<date_trunc('hour',l.created_at) OR
           o.created_at>=date_trunc('hour',l.created_at)+interval '1 hour')))""",
              (uid,start,end))
    unsafe = q.fetchone()[0]
    q.execute("DELETE FROM usage_hourly WHERE user_id=%s AND bucket>=%s AND bucket<%s",
              (uid,start,end))
    q.execute("DELETE FROM usage_daily WHERE user_id=%s AND bucket=%s",(uid,start))
    if not unsafe:
        q.execute("INSERT INTO usage_hourly SELECT %(p1)s,b AT TIME ZONE 'Asia/Shanghai',"
                  "coalesce(m,''),"+sums+" FROM ("+raw+") agg(period,b,m,"+columns+") "
                  "GROUP BY b,coalesce(m,'')",params)
        q.execute("INSERT INTO usage_daily SELECT user_id,date_trunc('day',bucket),model,"
                  +sums+" FROM usage_hourly WHERE user_id=%s AND bucket>=%s AND bucket<%s "
                  "GROUP BY user_id,date_trunc('day',bucket),model",(uid,start,end))
    q.execute("""UPDATE usage_rollup_state SET dirty=false,covered_until=%s,unsafe=%s
                 WHERE user_id=%s AND day=%s""",(end,unsafe,uid,start))

for i in range(args.limit):
    if i % 10 == 0:
        consume_changes()
    q.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
    q.execute("""SELECT user_id,day,least(day+interval '1 day',date_trunc('hour',localtimestamp))
                 FROM usage_rollup_state WHERE day < date_trunc('hour',localtimestamp)
                 AND (dirty OR covered_until < least(day+interval '1 day',date_trunc('hour',localtimestamp)))
                 ORDER BY day DESC,user_id LIMIT 1""")
    row = q.fetchone()
    if not row:
        break
    rebuild(*row)
    db.commit()
    time.sleep(.02)
