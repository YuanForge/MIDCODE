from pathlib import Path
import psycopg2,yaml
cfg=yaml.safe_load(Path('/root/fanapi-return-20261113/midcode-independent-api-1.yaml').read_text())['db']
c=psycopg2.connect(host=cfg['host'],port=cfg['port'],user=cfg['user'],password=cfg['password'],dbname=cfg['dbname'],connect_timeout=10);c.autocommit=True
k=c.cursor();k.execute("SET lock_timeout='3s'");k.execute("SET statement_timeout='120s'")
k.execute(Path('/root/fanapi-perf-v1.0.95/index.sql').read_text(encoding='utf-8-sig'))
k.execute("SELECT indisvalid FROM pg_index WHERE indexrelid='idx_billing_tx_unattributed_refund'::regclass");assert k.fetchone()[0];print('partial index valid');c.close()
