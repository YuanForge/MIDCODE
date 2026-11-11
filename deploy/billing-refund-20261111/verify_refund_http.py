#!/usr/bin/env python3
"""Isolated HTTP acceptance of the refund candidate, run ON the application host.

Default is a no-op plan. Example after root review:
  python3 verify_refund_http.py --execute --base-url http://127.0.0.1:8154
Never uses a real account/key/channel or an external generation endpoint.
The explicit fixture funding is 100000 synthetic credits and is removed finally.
No Redis fault injection, global scans, global configuration, or shared triggers.
The pending_db replay simulates a lost completion acknowledgement AFTER commit;
the separate Go integration suite covers a database failure BEFORE commit.
"""
import argparse
import hashlib
import http.server
import json
import secrets
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

FIXTURE_CREDITS = 100000
ACTUAL_COST = 14  # prompt=10 at 1/token + completion=2 at 2/token


class CheckFailure(RuntimeError):
    pass


def require(ok, message):
    if not ok:
        raise CheckFailure(message)


class RedisWire:
    """No automatic retries: even fixture mutations must not retry ambiguously."""
    def __init__(self, cfg):
        host, port = cfg['addr'].rsplit(':', 1)
        if host == 'host-gateway':
            host = '172.17.0.1'
        self.sock = socket.create_connection((host, int(port)), timeout=5)
        self.f = self.sock.makefile('rb')
        if cfg.get('password'):
            self.call('AUTH', cfg['password'])
        self.call('SELECT', cfg.get('db', 0))

    def call(self, *args):
        a = [str(x).encode() for x in args]
        self.sock.sendall(b'*' + str(len(a)).encode() + b'\r\n' + b''.join(
            b'$' + str(len(x)).encode() + b'\r\n' + x + b'\r\n' for x in a))
        return self.read()

    def read(self):
        line = self.f.readline()
        require(bool(line), 'Redis connection closed')
        kind, value = line[:1], line[1:-2]
        if kind == b'-':
            raise CheckFailure('Redis rejected fixture operation')
        if kind == b':':
            return int(value)
        if kind == b'$':
            return None if int(value) < 0 else self.f.read(int(value) + 2)[:-2].decode()
        if kind == b'*':
            return [self.read() for _ in range(int(value))]
        return value.decode()

    def close(self):
        self.f.close()
        self.sock.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--base-url', default='http://127.0.0.1:8154')
    parser.add_argument('--config', default='/root/fanapi-migration/shared-configs/midcode-independent-api-1.yaml')
    parser.add_argument('--output', help='Optional result JSON path; contains no credentials')
    args = parser.parse_args()
    target = urllib.parse.urlsplit(args.base_url)
    require(target.scheme == 'http' and target.hostname in ('127.0.0.1', 'localhost')
            and target.port is not None and not target.username and not target.password
            and target.path in ('', '/') and not target.query and not target.fragment,
            'Target must be an explicit loopback HTTP port')
    if not args.execute:
        print(json.dumps({'mode': 'plan_only', 'base_url': args.base_url,
                          'fixture_credits': FIXTURE_CREDITS,
                          'checks': ['stale_quota_first_request_rejected_then_recovers',
                                     'partial_refund_matches_usage', 'upstream_error_full_refund',
                                     'pending_db_replay_done_without_double_refund'],
                          'mutations': 'Only new temporary fixture rows and exact fixture Redis keys'}))
        return 0

    import psycopg2
    from psycopg2 import sql
    from psycopg2.extras import Json
    import yaml

    cfg = yaml.safe_load(Path(args.config).read_text())
    d = cfg['db']
    conn = psycopg2.connect(host=d['host'], port=d['port'], user=d['user'], password=d['password'],
                            dbname=d['dbname'], connect_timeout=10,
                            options='-c statement_timeout=15000 -c lock_timeout=5000')
    conn.autocommit = True
    redis = RedisWire(cfg['redis'])
    run = 'refund-http-' + uuid.uuid4().hex
    raw_key = 'sk-' + secrets.token_hex(32)
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    marker = secrets.token_hex(24)
    started_epoch = int(time.time())
    owned = {}
    corrs = []
    mock_state = {'phase': 'success', 'requests': 0, 'active': 0, 'paths': []}
    mock_lock = threading.Lock()
    result = {'run': run, 'target': args.base_url, 'checks': {}, 'cleanup_complete': False}
    server = None

    def query(statement, params=()):
        with conn.cursor() as cur:
            cur.execute(statement, params)
            return cur.fetchall() if cur.description else []

    columns = {}
    for table, column, nullable, default in query(
            "SELECT table_name,column_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public'"):
        columns.setdefault(table, {})[column] = (nullable == 'YES', default)
    needed = {
        'users': {'id', 'username', 'password_hash', 'balance', 'is_active'},
        'api_keys': {'id', 'user_id', 'key_hash', 'name', 'is_active'},
        'model_providers': {'id', 'code', 'name', 'is_active'},
        'model_groups': {'id', 'code', 'model_provider_id', 'is_active'},
        'model_group_models': {'group_id', 'routing_model', 'channel_id'},
        'api_key_model_groups': {'api_key_id', 'group_id', 'priority'},
        'channels': {'id', 'name', 'model', 'base_url', 'billing_type', 'billing_config', 'model_provider_id'},
        'billing_transactions': {'user_id', 'corr_id', 'type', 'credits', 'model_credit_charged', 'metrics'},
        'billing_refund_jobs': {'id', 'user_id', 'corr_id', 'status', 'metrics', 'next_run_at'},
        'billing_quota_leases': {'user_id', 'status', 'remaining_credits'},
        'llm_logs': {'user_id', 'corr_id', 'status'},
    }
    for table, required in needed.items():
        require(required <= set(columns.get(table, {})), 'Schema preflight failed for ' + table)

    def insert(table, values):
        # Reject unknown mandatory fields before the insert; never guess credentials or copy real rows.
        values = {k: v for k, v in values.items() if k in columns[table]}
        now = query('SELECT LOCALTIME::time, CURRENT_TIMESTAMP')[0][1].replace(tzinfo=None)
        for col in ('created_at', 'updated_at'):
            if col in columns[table]:
                values.setdefault(col, now)
        missing = [col for col, (nullable, default) in columns[table].items()
                   if col not in values and not nullable and default is None and col != 'id']
        require(not missing, 'Unsupported required fixture columns in ' + table + ': ' + ','.join(missing))
        q = sql.SQL('INSERT INTO {} ({}) VALUES ({}) RETURNING id').format(
            sql.Identifier(table), sql.SQL(',').join(map(sql.Identifier, values)),
            sql.SQL(',').join(sql.Placeholder() for _ in values))
        return query(q, tuple(values.values()))[0][0]

    class Mock(http.server.BaseHTTPRequestHandler):
        def log_message(self, *unused):
            pass

        def do_POST(self):
            if self.headers.get('X-Refund-Test') != marker:
                self.send_error(403)
                return
            with mock_lock:
                mock_state['active'] += 1
                mock_state['requests'] += 1
                phase = mock_state['phase']
                mock_state['paths'].append(self.path)
            try:
                length = int(self.headers.get('Content-Length', '0'))
                require(0 < length < 100000, 'Unexpected mock request size')
                body = json.loads(self.rfile.read(length))
                require(body.get('model') == run, 'Mock received an unexpected model')
                if phase == 'error':
                    status, payload = 400, {'error': {'message': 'fixture upstream error', 'type': 'fixture_error'}}
                else:
                    status, payload = 200, {
                        'id': 'chatcmpl-' + run, 'object': 'chat.completion', 'created': int(time.time()), 'model': run,
                        'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': 'ok'}, 'finish_reason': 'stop'}],
                        'usage': {'prompt_tokens': 10, 'completion_tokens': 2, 'total_tokens': 12}}
                data = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            finally:
                with mock_lock:
                    mock_state['active'] -= 1

    def call():
        payload = json.dumps({'model': run, 'messages': [{'role': 'user', 'content': 'x' * 4000}],
                              'stream': False, 'max_tokens': 16}).encode()
        req = urllib.request.Request(args.base_url.rstrip('/') + '/v1/chat/completions', data=payload,
                                     headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + raw_key})
        try:
            resp = urllib.request.urlopen(req, timeout=90)
        except urllib.error.HTTPError as error:
            resp = error
        with resp:
            status = resp.status
            corr = resp.headers.get('X-Corr-Id')
            body = json.loads(resp.read(1024 * 1024))
        require(bool(corr), 'Candidate did not return X-Corr-Id')
        corrs.append(corr)
        return status, corr, body

    def wait_for(test, label, timeout=40):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            value = test()
            if value:
                return value
            time.sleep(0.25)
        raise CheckFailure('Timed out: ' + label)

    def totals(corr):
        return query("""SELECT
            COALESCE(SUM(credits) FILTER(WHERE type='hold'),0),
            COALESCE(SUM(credits) FILTER(WHERE type='refund'),0),
            COALESCE(SUM(CASE WHEN type IN ('hold','settle','charge') THEN credits WHEN type='refund' THEN -credits ELSE 0 END),0),
            COUNT(*) FILTER(WHERE type='refund')
            FROM billing_transactions WHERE user_id=%s AND corr_id=%s""", (owned['user'], corr))[0]

    def balance():
        return query("SELECT u.balance+COALESCE((SELECT SUM(remaining_credits) FROM billing_quota_leases WHERE user_id=u.id AND status='active'),0) FROM users u WHERE id=%s", (owned['user'],))[0][0]

    def finished(corr):
        rows = query("SELECT id,status,metrics->>'refund_mode' FROM billing_refund_jobs WHERE user_id=%s AND corr_id=%s", (owned['user'], corr))
        return rows if rows and all(x[1] == 'done' and x[2] == 'db_refund_v1' for x in rows) else None

    def check_request(corr, expected):
        jobs = wait_for(lambda: finished(corr), 'durable refund completed')
        hold, refund, net, count = totals(corr)
        require(hold > expected and refund == hold - expected and net == expected and count == 1,
                'Ledger refund does not equal the expected amount exactly once')
        return {'hold': int(hold), 'refund': int(refund), 'net': int(net), 'refund_rows': count,
                'job_id': jobs[0][0], 'job_status': 'done'}

    def replay(corr):
        # This mutates ONLY this fixture's completed durable job, simulating lost acknowledgement.
        before, prior_balance = totals(corr), balance()
        rows = query("UPDATE billing_refund_jobs SET status='pending_db',next_run_at=NOW(),updated_at=NOW() WHERE user_id=%s AND corr_id=%s AND status='done' AND metrics->>'refund_mode'='db_refund_v1' RETURNING id,status", (owned['user'], corr))
        require(len(rows) == 1 and rows[0][1] == 'pending_db', 'Could not stage fixture acknowledgement replay')
        wait_for(lambda: finished(corr), 'pending_db replay completed', timeout=40)
        require(totals(corr) == before and balance() == prior_balance, 'Replayed refund changed money twice')
        return {'observed_transition': ['pending_db', 'done'], 'money_unchanged': True, 'refund_rows': 1}

    def cleanup():
        """Disable own identities, drain workers, then delete only exact owned references."""
        if not owned:
            return
        if 'user' in owned:
            query('UPDATE users SET is_active=false WHERE id=%s AND username=%s', (owned['user'], run))
        if 'key' in owned:
            query('UPDATE api_keys SET is_active=false WHERE id=%s AND key_hash=%s', (owned['key'], key_hash))
        for table, identity, field in [('channels', 'channel', 'name'), ('model_groups', 'group', 'code'), ('model_providers', 'provider', 'code')]:
            if identity in owned:
                query(sql.SQL('UPDATE {} SET is_active=false WHERE id=%s AND {}=%s').format(sql.Identifier(table), sql.Identifier(field)), (owned[identity], run))
        wait_for(lambda: mock_state['active'] == 0, 'mock requests drained', timeout=20)
        if 'user' in owned:
            wait_for(lambda: not query("SELECT 1 FROM billing_refund_jobs WHERE user_id=%s AND status IN ('running','running_db') LIMIT 1", (owned['user'],)), 'refund worker drained', timeout=40)
            # Async request-log writes finish before deleting the fixture records.
            wait_for(lambda: not query("SELECT 1 FROM llm_logs WHERE user_id=%s AND status='pending' LIMIT 1", (owned['user'],)), 'request log writes drained', timeout=40)
        if 'group' in owned and 'key' in owned:
            require(not query('SELECT 1 FROM api_key_model_groups WHERE group_id=%s AND api_key_id<>%s LIMIT 1', (owned['group'], owned['key'])), 'External key references fixture group; cleanup refused')
        sync_jobs = query('SELECT id FROM balance_sync_jobs WHERE user_id=%s', (owned['user'],)) if 'user' in owned and 'balance_sync_jobs' in columns else []
        # Build exact predicates for fixture records. A table with user_id is always
        # restricted to that user, never widened to channel_id or another identity.
        predicates = {}
        for table, cols in columns.items():
            if table in ('users', 'channels', 'model_groups', 'model_providers'):
                continue
            if 'user_id' in cols and 'user' in owned:
                predicates[table] = ('user_id=%s', (owned['user'],))
            elif 'api_key_id' in cols and 'key' in owned:
                predicates[table] = ('api_key_id=%s', (owned['key'],))
            elif table == 'model_group_models' and 'group' in owned:
                predicates[table] = ('group_id=%s', (owned['group'],))
            elif 'corr_id' in cols and corrs:
                predicates[table] = ('corr_id=ANY(%s)', (corrs,))
        # Obtain child-before-parent order from existing FK metadata; no schema changes.
        edges = query("SELECT child.relname,parent.relname FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_class parent ON parent.oid=c.confrelid WHERE c.contype='f' AND child.relnamespace='public'::regnamespace")
        order = []
        remaining = set(predicates)
        while remaining:
            leaves = sorted(t for t in remaining if not any(p == t and ch in remaining and ch != t for ch, p in edges))
            require(bool(leaves), 'Fixture cleanup FK cycle requires review')
            order.extend(leaves)
            remaining.difference_update(leaves)
        conn.autocommit = False
        try:
            if 'user' in owned:
                query('SELECT pg_advisory_xact_lock(%s,%s)', (20260618, owned['user']))
                query('SELECT id FROM users WHERE id=%s AND username=%s FOR UPDATE', (owned['user'], run))
            for table in order:
                pred, vals = predicates[table]
                query(sql.SQL('DELETE FROM {} WHERE ').format(sql.Identifier(table)) + sql.SQL(pred), vals)
            for table, identity in [('channels', 'channel'), ('model_groups', 'group'), ('model_providers', 'provider'), ('users', 'user')]:
                if identity in owned:
                    field = 'username' if table == 'users' else ('name' if table == 'channels' else 'code')
                    query(sql.SQL('DELETE FROM {} WHERE id=%s AND {}=%s').format(sql.Identifier(table), sql.Identifier(field)), (owned[identity], run))
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.autocommit = True
        # Exact keys only. No KEYS/SCAN/FLUSHDB or wildcard deletion.
        keys = ['apikey2:' + key_hash]
        if 'user' in owned:
            u = owned['user']
            keys += [f'billing:quota:{u}', f'billing:quota_version:{u}', f'user:balance:{u}', f'user:model_credit:{u}:{run}']
        if 'channel' in owned:
            keys += [f"channel:{owned['channel']}", f'channel:name:{run}', f'channel:model:{run}', f'channel:model:v2:{run}']
            for window in range(started_epoch // 300 * 300, int(time.time()) // 300 * 300 + 301, 300):
                keys += [f"ch_stat:{owned['channel']}:{window}:ok", f"ch_stat:{owned['channel']}:{window}:err"]
        redis.call('DEL', *keys)
        if 'user' in owned:
            redis.call('SREM', 'billing:dirty_balances', owned['user'])
        if sync_jobs:
            redis.call('SREM', 'billing:balance_sync_jobs:applied', *[row[0] for row in sync_jobs])
        if 'user' in owned:
            require(not query('SELECT 1 FROM users WHERE id=%s', (owned['user'],)), 'Fixture user still exists')
            for table, (pred, vals) in predicates.items():
                require(not query(sql.SQL('SELECT 1 FROM {} WHERE ').format(sql.Identifier(table)) + sql.SQL(pred) + sql.SQL(' LIMIT 1'), vals), 'Fixture rows remain in ' + table)

    try:
        server = http.server.ThreadingHTTPServer(('172.17.0.1', 0), Mock)
        server.daemon_threads = True
        threading.Thread(target=server.serve_forever, daemon=True).start()
        port = server.server_address[1]
        owned['user'] = insert('users', {'username': run, 'password_hash': '!fixture-disabled', 'role': 'user', 'group': run,
                                         'is_active': True, 'balance': FIXTURE_CREDITS, 'reward_balance': 0,
                                         'frozen_balance': 0, 'rebate_debt': 0, 'rebate_ratio': 0, 'inviter_id': None})
        owned['provider'] = insert('model_providers', {'code': run, 'name': run, 'is_active': True, 'sort_order': 999999})
        owned['group'] = insert('model_groups', {'code': run, 'name': run, 'model_provider_id': owned['provider'], 'model_provider': run, 'is_active': True})
        prices = {'input_from_response': True, 'gpt_context_pricing': False,
                  'input_price_per_1m_tokens': 1000000, 'output_price_per_1m_tokens': 2000000,
                  'cache_read_price_per_1m_tokens': 100000, 'input_cost_per_1m_tokens': 0, 'output_cost_per_1m_tokens': 0}
        owned['channel'] = insert('channels', {'name': run, 'display_name': run, 'model': run, 'type': 'llm',
                                               'base_url': f'http://172.17.0.1:{port}/v1/chat/completions',
                                               'method': 'POST', 'headers': Json({'X-Refund-Test': marker}),
                                               'billing_type': 'token', 'billing_config': Json(prices), 'protocol': 'openai',
                                               'timeout_ms': 15000, 'request_script': '', 'response_script': '', 'error_script': '',
                                               'is_active': True, 'key_pool_id': 0, 'weight': 1, 'priority': 0,
                                               'groups': Json([]), 'model_provider_id': owned['provider'], 'model_provider': run})
        owned['key'] = insert('api_keys', {'user_id': owned['user'], 'key_hash': key_hash, 'raw_key_enc': '', 'name': run, 'key_type': 'stable', 'is_active': True})
        insert('model_group_models', {'group_id': owned['group'], 'routing_model': run, 'channel_id': owned['channel']})
        insert('api_key_model_groups', {'api_key_id': owned['key'], 'group_id': owned['group'], 'priority': 0})
        seed_corr = 'fixture-' + uuid.uuid4().hex
        corrs.append(seed_corr)
        insert('billing_transactions', {'user_id': owned['user'], 'channel_id': 0, 'api_key_id': 0, 'pool_key_id': 0,
                                         'corr_id': seed_corr, 'type': 'recharge', 'credits': FIXTURE_CREDITS,
                                         'model_credit_charged': 0, 'cost': 0, 'balance_after': FIXTURE_CREDITS,
                                         'metrics': Json({'reason': 'temporary_acceptance_fixture', 'fixture': run}), 'llm_log_id': 0, 'task_id': 0})
        u = owned['user']
        redis.call('SET', f'billing:quota:{u}', 49062, 'EX', 120)
        redis.call('SET', f'billing:quota_version:{u}', '2', 'EX', 120)
        status, bad_corr, _ = call()
        require(status == 500 and mock_state['requests'] == 0, 'Injected bad quota must fail before upstream')
        require(totals(bad_corr) == (0, 0, 0, 0), 'Rejected bad quota created a financial transaction')
        quota = redis.call('GET', f'billing:quota:{u}')
        require(quota in (None, '0'), 'Bad quota was not invalidated')
        result['checks']['bad_quota'] = {'status': status, 'upstream_calls': 0, 'ledger_rows': 0, 'cache_invalidated': True}
        status, ok_corr, response = call()
        require(status == 200 and response.get('choices'), 'Recovered request did not complete successfully')
        result['checks']['partial_refund'] = check_request(ok_corr, ACTUAL_COST)
        require(balance() == FIXTURE_CREDITS - ACTUAL_COST, 'Partial refund did not restore spendable balance')
        result['checks']['partial_refund_replay'] = replay(ok_corr)
        with mock_lock:
            mock_state['phase'] = 'error'
        status, fail_corr, response = call()
        require(status >= 400 and response.get('error'), 'Controlled upstream failure was not returned')
        result['checks']['full_refund'] = check_request(fail_corr, 0)
        require(balance() == FIXTURE_CREDITS - ACTUAL_COST, 'Failed request retained a charge')
        result['checks']['full_refund_replay'] = replay(fail_corr)
        require(mock_state['requests'] == 2, 'Unexpected additional upstream request')
        require(not query("SELECT 1 FROM billing_refund_jobs WHERE user_id=%s AND status<>'done' LIMIT 1", (u,)), 'Fixture refund jobs not fully completed')
        ledger_balance = query("SELECT SUM(CASE WHEN type IN ('recharge','refund') THEN credits WHEN type IN ('hold','charge','settle') THEN -credits ELSE 0 END) FROM billing_transactions WHERE user_id=%s", (u,))[0][0]
        require(ledger_balance == balance(), 'Fixture ledger does not reconcile with spendable balance')
        result['checks']['final'] = {'spendable': int(balance()), 'expected_spendable': FIXTURE_CREDITS - ACTUAL_COST,
                                     'ledger_balance': int(ledger_balance), 'mock_requests': mock_state['requests'], 'all_refund_jobs_done': True}
        result['passed'] = True
    except Exception as exc:
        result['passed'] = False
        # Do not print SQL parameters/config/headers/raw key or exception strings from drivers.
        result['failure'] = str(exc) if isinstance(exc, CheckFailure) else type(exc).__name__
    finally:
        try:
            cleanup()
            result['cleanup_complete'] = True
        except Exception as exc:
            result['cleanup_complete'] = False
            result['cleanup_failure'] = str(exc) if isinstance(exc, CheckFailure) else type(exc).__name__
            result['fixture_ids_for_manual_cleanup'] = owned
            result['passed'] = False
        if server:
            server.shutdown()
            server.server_close()
        redis.close()
        conn.close()
    output = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(output, encoding='utf-8')
    print(output)
    return 0 if result.get('passed') and result['cleanup_complete'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
