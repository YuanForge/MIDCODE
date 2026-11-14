"""Isolated regression and private rollback snapshot, no credential output."""
import os,subprocess,json
from pathlib import Path
import yaml,psycopg2
from psycopg2.extensions import make_dsn
ROOT=Path('/root/fanapi-groups-v1.0.94')
cfg=yaml.safe_load(Path('/root/fanapi-return-20261113/midcode-independent-api-1.yaml').read_text())['db']
dsn=make_dsn(host=cfg['host'],port=cfg['port'],user=cfg['user'],password=cfg['password'],dbname=cfg['dbname'],connect_timeout=10)
env=dict(os.environ,FANAPI_TEST_DATABASE_URL=dsn)
subprocess.run([str(ROOT/'group-tests'),'-test.run','^TestDisabledGroupsPostgres$','-test.v'],env=env,check=True)
conn=psycopg2.connect(dsn)
try:
 conn.set_session(readonly=True);cur=conn.cursor()
 cur.execute('SELECT b.* FROM api_key_model_groups b JOIN model_groups g ON g.id=b.group_id WHERE g.is_active=false ORDER BY b.id')
 rows=cur.fetchall();columns=[d.name for d in cur.description]
 p=ROOT/'disabled-bindings-private.json';assert not p.exists();p.write_text(json.dumps({'columns':columns,'rows':rows},default=str));p.chmod(0o600)
 print(json.dumps({'historical_disabled_bindings':len(rows),'backup_saved':True}))
finally:conn.rollback();conn.close()
