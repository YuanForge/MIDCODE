"""Exercise the production SQL against transaction-local temporary fixtures only."""
import json
from pathlib import Path
import psycopg2
import yaml

root = Path('/root/fanapi-leaderboard-v1.0.102')
d = yaml.safe_load(Path('/root/fanapi-return-20261113/midcode-independent-api-1.yaml').read_text())['db']
conn = psycopg2.connect(host=d['host'], port=d['port'], user=d['user'], password=d['password'], dbname=d['dbname'])
try:
    cur = conn.cursor()
    cur.execute("SET LOCAL statement_timeout='15s'")
    cur.execute('CREATE TEMP TABLE users(id bigint PRIMARY KEY, username text) ON COMMIT DROP')
    cur.execute('CREATE TEMP TABLE billing_transactions(user_id bigint, type text, credits bigint, created_at timestamp) ON COMMIT DROP')
    cur.execute('CREATE TEMP TABLE user_qq_bindings(user_id bigint PRIMARY KEY, qq text, verified_at timestamp, verified_group_id text) ON COMMIT DROP')
    cur.executemany('INSERT INTO users VALUES(%s,%s)', [(i, 'fixture-'+str(i)) for i in range(1, 16)])
    records = [(i, 'charge', 1000000, '2026-02-01 12:00:00') for i in range(1, 13)]
    records += [
        (1, 'hold', 2000000, '2026-02-01 00:00:00'),
        (1, 'settle', 500000, '2026-02-01 01:00:00'),
        (1, 'refund', 500000, '2026-02-01 23:59:59'),
        (1, 'charge', 999999999, '2026-02-02 00:00:00'),
        (2, 'recharge', 999999999, '2026-02-01 12:00:00'),
        (2, 'adjust', 999999999, '2026-02-01 12:00:00'),
        (13, 'charge', 10, '2026-02-01 12:00:00'),
        (13, 'refund', 10, '2026-02-01 12:00:00'),
        (14, 'refund', 100, '2026-02-01 12:00:00'),
        (15, 'charge', 999999999, '2026-01-31 23:59:59'),
        (999, 'charge', 999999999, '2026-02-01 12:00:00'),
    ]
    cur.executemany('INSERT INTO billing_transactions VALUES(%s,%s,%s,%s)', records)
    cur.executemany('INSERT INTO user_qq_bindings VALUES(%s,%s,%s,%s)', [
        (1, '12345', '2026-01-01', '767281836'),
        (2, '23456', None, '767281836'),
        (3, '34567', '2026-01-01', 'other'),
    ])
    query = (root/'leaderboard.sql').read_text().replace('$1', '%s').replace('$2', '%s')
    cur.execute(query, ('2026-02-01', '2026-02-02'))
    rows = cur.fetchall()
    assert [r[0] for r in rows] == list(range(1, 11)), 'Top ten or tie order mismatch'
    assert rows[0] == (1, 'fixture-1', 3000000, '12345')
    assert all(r[2] == 1000000 and r[3] is None for r in rows[1:])
    cur.execute(query, ('2025-01-01', '2025-01-02'))
    assert cur.fetchall() == []
    result = {'passed': True, 'isolated_temporary_tables': True, 'top10_ties': True,
              'day_boundaries': True, 'net_refunds': True, 'non_consumption_excluded': True,
              'zero_negative_excluded': True, 'deleted_users_excluded': True, 'verified_qq_only': True}
finally:
    conn.rollback()
    conn.close()
(root/'leaderboard-sql.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result))
