"""Draft companion deployment for the independent image-studio API.

Run from the same private release directory as common.py. Only --execute
enables prepare/switch/cleanup/rollback. `verify` issues reads and a short-lived
studio handoff, with no model generation or user balance writes.
"""
import argparse, base64, copy, hashlib, hmac, http.client, json, re, shutil, subprocess, time
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
import psycopg2, yaml
from common import ROOT, VERSION, api, inspect, run, sha, healthy, binary_hash, frontend_hash, incoming, drained, manifest

STUDIO = ROOT / 'studio'
OLD = 'midcode-studio-independent-api-1'
NEW = 'midcode-studio-refund-v1087-api-1'
IMAGE = 'fanapi-api:studio-refund-v1.0.87'
OLD_PORT, PORT = 8105, 8106
GATEWAY = 'midcode-image-s3-v1063'
CONFIG = Path('/root/fanapi-migration/shared-configs/midcode-studio-independent-api-1.yaml')
SCRIPT = Path('/usr/local/sbin/fanapi-studio-compat')
UNIT = Path('/etc/systemd/system/fanapi-studio-compat.service')
BASELINE_BINARY = '462f02d936633d039999060e63c5bf1db85d789ecde06d69d75e4438b11b8ec8'

def save(name, value, private=False):
    p = STUDIO / name; p.write_text(json.dumps(value, indent=2) + '\n'); p.chmod(0o600 if private else 0o644)

def rule_args(port):
    return ['OUTPUT', '-d', '127.0.0.1/32', '-p', 'tcp', '--dport', str(OLD_PORT), '-m', 'comment',
            '--comment', 'fanapi-studio-compat', '-j', 'REDIRECT', '--to-ports', str(port)]

def rule_exists():
    return subprocess.run(['iptables', '-t', 'nat', '-C'] + rule_args(PORT),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0

def config_match():
    main = yaml.safe_load(Path('/root/fanapi-migration/shared-configs/midcode-independent-api-1.yaml').read_text())
    studio = yaml.safe_load(CONFIG.read_text())
    assert (studio.get('app') or {}).get('mode', 'master') == 'master'
    for key in ['server', 'db', 'redis', 'nats', 'smtp', 'worker']:
        assert studio.get(key) == main.get(key), 'studio role configuration changed: ' + key
    return studio

def check_gateway():
    g = inspect(GATEWAY); assert g['HostConfig']['NetworkMode'] == 'host'
    env = dict(x.split('=', 1) for x in g['Config'].get('Env', []) if '=' in x)
    assert env.get('MIDCODE_ORIGIN') == 'http://127.0.0.1:8105'
    assert env.get('PORT') == '8798'
    return g

def prepare():
    m = manifest(); config_match(); check_gateway(); old = healthy(OLD)
    assert binary_hash(OLD) == BASELINE_BINARY, 'studio baseline changed; re-audit before updating'
    assert old['NetworkSettings']['Ports']['80/tcp'] == [{'HostIp': '127.0.0.1', 'HostPort': '8105'}]
    assert not any(v.get('Aliases') for v in old['NetworkSettings']['Networks'].values()), 'new studio alias dependency'
    assert run('ss', '-H', '-ltn', 'sport = :8106').strip() == ''
    assert not any('/' + NEW in x['Names'] for x in api('GET', '/containers/json?all=true'))
    assert not SCRIPT.exists() and not UNIT.exists() and not rule_exists(), 'compatibility mapping already exists; review'
    assert not (STUDIO / 'old-private.json').exists()
    save('old-private.json', old, True)
    save('gateway-baseline.json', {'id': check_gateway()['Id'], 'name': GATEWAY, 'origin_port': OLD_PORT})
    baseline = {'image_id': old['Image'], 'binary_sha256': BASELINE_BINARY, 'index_sha256': frontend_hash(OLD),
        'config_sha256': sha(CONFIG), 'private_container_snapshot': 'old-private.json'}
    save('baseline.json', baseline)
    shutil.copyfile(ROOT / 'fanapi-server', STUDIO / 'fanapi-server')
    assert sha(STUDIO / 'fanapi-server') == m['binary_sha256']
    pin = 'fanapi-api:studio-refund-baseline-' + old['Image'].split(':')[-1][:12]
    run('docker', 'tag', old['Image'], pin)
    (STUDIO / '.dockerignore').write_text('*\n!Dockerfile\n!fanapi-server\n')
    (STUDIO / 'Dockerfile').write_text('FROM ' + pin + '\nCOPY --chmod=755 fanapi-server /app/fanapi-server\n' +
        'LABEL midcode.release="' + VERSION + '" midcode.commit="' + m['commit'] + '" midcode.role="studio-api"\n')
    print(run('docker', 'build', '-t', IMAGE, str(STUDIO)), flush=True)
    cfg = copy.deepcopy(old['Config']); cfg['Image'] = IMAGE; cfg['Hostname'] = NEW
    cfg['Labels'] = dict(cfg.get('Labels') or {}, **{'midcode.release': VERSION, 'midcode.commit': m['commit'], 'midcode.role': 'studio-api'})
    host = copy.deepcopy(old['HostConfig']); host['PortBindings'] = {'80/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '8106'}]}
    cfg['HostConfig'] = host; cfg['NetworkingConfig'] = {'EndpointsConfig': {n: {} for n in old['NetworkSettings']['Networks']}}
    api('POST', '/containers/create?name=' + NEW, cfg)
    run('systemctl', 'enable', '--now', 'shared-app@' + NEW + '.service')
    for _ in range(60):
        if inspect(NEW)['State'].get('Health', {}).get('Status') == 'healthy': break
        time.sleep(2)
    healthy(NEW); assert binary_hash(NEW) == m['binary_sha256']
    assert frontend_hash(NEW) == baseline['index_sha256']
    assert sha(CONFIG) == baseline['config_sha256']
    run('docker', 'exec', NEW, 'nginx', '-t')
    save('candidate.json', {'passed': True, 'container': NEW, 'port': PORT, 'binary_sha256': m['binary_sha256'],
         'original_frontend_preserved': True, 'original_config_preserved': True})
    print('STUDIO_CANDIDATE_READY_NO_TRAFFIC_SWITCH', flush=True)

def switch():
    m = manifest(); healthy(NEW); assert binary_hash(NEW) == m['binary_sha256']
    for name in ['candidate-business.json', 'candidate-billing.json']:
        v = json.loads((STUDIO / name).read_text())
        assert v.get('passed') and v.get('container') == NEW and v.get('binary_sha256') == m['binary_sha256'], name
    check_gateway(); assert not SCRIPT.exists() and not UNIT.exists() and not rule_exists()
    script = '''#!/bin/sh
set -eu
rule() { /usr/sbin/iptables -t nat "$1" OUTPUT -d 127.0.0.1/32 -p tcp --dport 8105 -m comment --comment fanapi-studio-compat -j REDIRECT --to-ports 8106; }
case "${1:-start}" in
 start) rule -C 2>/dev/null || rule -I ;;
 stop) rule -C 2>/dev/null && rule -D || true ;;
 *) exit 2 ;;
esac
'''
    unit = '''[Unit]
Description=Stable image-studio API endpoint for FanAPI
After=docker.service shared-app@midcode-studio-refund-v1087-api-1.service
Wants=shared-app@midcode-studio-refund-v1087-api-1.service
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/fanapi-studio-compat start
ExecStop=/usr/local/sbin/fanapi-studio-compat stop
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
'''
    SCRIPT.write_text(script); SCRIPT.chmod(0o755); UNIT.write_text(unit); UNIT.chmod(0o644)
    run('systemctl', 'daemon-reload'); run('systemctl', 'enable', '--now', 'fanapi-studio-compat.service')
    assert rule_exists()
    save('cutover.json', {'container': NEW, 'stable_port': OLD_PORT, 'target_port': PORT,
        'gateway_not_restarted': True, 'old_retained': OLD, 'nat_compatibility': True})
    print('STUDIO_NEW_CONNECTIONS_SWITCHED_OLD_RETAINED', flush=True)
    assert drained(OLD), 'old studio connections still active; keep old container until they finish'

def verify(port, phase, user_id):
    cfg = config_match(); m = manifest()
    enc = lambda x: base64.urlsafe_b64encode(json.dumps(x, separators=(',', ':')).encode()).decode().rstrip('=')
    now = int(time.time()); msg = enc({'alg': 'HS256', 'typ': 'JWT'}) + '.' + enc({'sub': user_id, 'role': 'user', 'group': 'default', 'iat': now, 'exp': now + 600})
    jwt = msg + '.' + base64.urlsafe_b64encode(hmac.new(cfg['server']['jwt_secret'].encode(), msg.encode(), hashlib.sha256).digest()).decode().rstrip('=')
    def req(p, method, path, data=None, bearer=jwt):
        c = http.client.HTTPConnection('127.0.0.1', p, timeout=45)
        headers = {'Content-Type': 'application/json', 'Host': 'midcode.cc'}
        if bearer: headers['Authorization'] = 'Bearer ' + bearer
        c.request(method, path, json.dumps(data) if data is not None else None, headers)
        r = c.getresponse(); raw = r.read(); c.close(); return r.status, raw
    checks = []
    for path, field in [('/api/user/channels', 'channels'), ('/api/user/model-preferences', 'preferences')]:
        status, raw = req(port, 'GET', path)
        assert status == 200 and isinstance(json.loads(raw)[field], list), path
        checks.append('authenticated ' + path)
    assert req(port, 'GET', '/api/user/model-preferences', bearer=None)[0] == 401
    status, raw = req(port, 'POST', '/api/user/image-studio/handoff', {'all_keys': True})
    assert status == 200, 'image handoff'
    code = parse_qs(urlsplit(json.loads(raw)['url']).fragment)['midcode_code'][0]
    # Candidate verification redeems directly on its own API with the gateway's
    # existing secret. Live verification goes through the real gateway ->8105.
    if phase == 'candidate':
        gateway = check_gateway(); env = dict(e.split('=', 1) for e in gateway['Config'].get('Env', []) if '=' in e)
        c = http.client.HTTPConnection('127.0.0.1', port, timeout=30)
        c.request('POST', '/api/public/image-studio/redeem', json.dumps({'code': code}),
            {'Content-Type': 'application/json', 'X-AIPic-Handoff-Secret': env['AIPIC_HANDOFF_SECRET']})
        r = c.getresponse(); status, raw = r.status, r.read(); c.close()
    else:
        assert rule_exists()
        status, raw = req(8798, 'POST', '/midcode/exchange', {'code': code}, bearer=None)
    assert status == 200, 'image redeem/exchange'
    response = json.loads(raw)
    profiles = response.get('profiles', [])
    api_key = response.get('apiKey') or (profiles[0].get('apiKey') if profiles else None)
    assert api_key, 'handoff did not resolve a user API key'
    target, path = (port, '/v1/models') if phase == 'candidate' else (8798, '/midcode-api/v1/models')
    status, raw = req(target, 'GET', path, bearer=api_key)
    assert status == 200 and isinstance(json.loads(raw).get('data'), list), 'image model query through selected API'
    checks += ['image handoff/redeem', 'API-key authenticated model catalog']
    if phase == 'live':
        for _ in range(10):
            assert req(8105, 'GET', '/api/user/model-preferences')[0] == 200
            assert req(8798, 'GET', '/health', bearer=None)[0] == 200
            time.sleep(1)
        checks.append('10 stable-port and actual gateway continuity checks')
    healthy(NEW); assert binary_hash(NEW) == m['binary_sha256']
    save('candidate-business.json' if phase == 'candidate' else 'live-verified.json',
        {'passed': True, 'container': NEW, 'port': port, 'binary_sha256': m['binary_sha256'], 'checks': checks})
    print(json.dumps({'passed': True, 'phase': phase, 'checks': checks}))

def cleanup():
    m = manifest(); healthy(NEW); assert binary_hash(NEW) == m['binary_sha256'] and rule_exists()
    for name in ['live-verified.json', 'live-billing.json']:
        v = json.loads((STUDIO / name).read_text())
        assert v.get('passed') and v.get('container') == NEW and v.get('binary_sha256') == m['binary_sha256'], name
    saved = json.loads((STUDIO / 'old-private.json').read_text()); old = inspect(OLD)
    assert old['Id'] == saved['Id'] and drained(OLD)
    old_ips = [v['IPAddress'] for v in old['NetworkSettings']['Networks'].values() if v.get('IPAddress')]
    def identity_ref(text):
        return OLD in text or any(re.search(r'(?<![0-9.])' + re.escape(ip) + r'(?![0-9.])', text) for ip in old_ips)
    for summary in api('GET', '/containers/json?all=true'):
        if summary['Id'] == old['Id']: continue
        x = inspect(summary['Id']); text = json.dumps({'env': x['Config'].get('Env'), 'cmd': x['Config'].get('Cmd'), 'entrypoint': x['Config'].get('Entrypoint'),
            'links': x['HostConfig'].get('Links'), 'extra_hosts': x['HostConfig'].get('ExtraHosts'), 'volumes_from': x['HostConfig'].get('VolumesFrom')})
        assert not identity_ref(text), 'old studio direct identity dependency: ' + x['Name']
        if ':8105' in text:
            assert x['Name'].lstrip('/') == GATEWAY, 'unreviewed stable-port dependency: ' + x['Name']
            assert check_gateway()['Id'] == json.loads((STUDIO / 'gateway-baseline.json').read_text())['id']
        for mount in x.get('Mounts', []):
            source = Path(mount.get('Source', ''))
            if mount.get('Type') == 'bind' and source.is_file() and source.stat().st_size < 2_000_000:
                if source.suffix.lower() in ['.yaml', '.yml', '.json', '.conf', '.env', '.ini']:
                    assert not identity_ref(source.read_text(errors='replace')), 'mounted old studio dependency'
    caddy = Path('/etc/caddy/Caddyfile').read_text()
    assert not identity_ref(caddy) and ':8105' not in caddy, 'unexpected direct Caddy studio target'
    for directory in (Path('/etc/systemd/system'), Path('/usr/local/sbin')):
        for path in directory.iterdir():
            if path.is_file() and not path.is_symlink() and path.stat().st_size < 1_000_000:
                text = path.read_text(errors='replace')
                assert not identity_ref(text), 'active host studio dependency: ' + str(path)
                if ':8105' in text or '--dport 8105' in text:
                    assert path == SCRIPT, 'unreviewed host stable-port dependency: ' + str(path)
    cfg = config_match(); d = cfg['db']
    db = psycopg2.connect(host=d['host'], port=d['port'], dbname=d['dbname'], user=d['user'], password=d['password'],
        connect_timeout=10, options='-c default_transaction_read_only=on -c statement_timeout=15000')
    with db.cursor() as cur:
        cur.execute('SELECT id,base_url,query_url FROM channels')
        for channel, base, query in cur:
            text = (base or '') + ' ' + (query or '')
            assert not identity_ref(text) and ':8105' not in text, 'unreviewed channel studio dependency: ' + str(channel)
    db.close()
    assert not incoming(OLD)
    save('cleanup-preflight.json', {'old_container': OLD, 'old_id': old['Id'], 'old_ips': old_ips,
        'connections_drained': True, 'direct_identity_dependencies_clear': True, 'gateway_stable_port_preserved': True})
    run('systemctl', 'disable', '--now', 'shared-app@' + OLD + '.service')
    assert not inspect(OLD)['State']['Running']
    run('docker', 'rm', OLD)
    save('cleanup.json', {'removed': OLD, 'retained_image_id': saved['Image'], 'data_volumes_retained': True,
        'stable_8105_redirects_to_8106': True, 'gateway_preserved': GATEWAY})
    print('OLD_STUDIO_REMOVED_WITHOUT_VOLUMES_RUN_LIVE_VERIFY_AGAIN')

def rollback():
    saved = json.loads((STUDIO / 'old-private.json').read_text())
    names = {n for x in api('GET', '/containers/json?all=true') for n in x['Names']}
    if '/' + OLD not in names:
        cfg = copy.deepcopy(saved['Config']); cfg['Image'] = saved['Image']; cfg['HostConfig'] = saved['HostConfig']
        cfg['NetworkingConfig'] = {'EndpointsConfig': {n: {} for n in saved['NetworkSettings']['Networks']}}
        api('POST', '/containers/create?name=' + OLD, cfg)
    run('systemctl', 'enable', '--now', 'shared-app@' + OLD + '.service')
    for _ in range(60):
        if inspect(OLD)['State'].get('Health', {}).get('Status') == 'healthy': break
        time.sleep(2)
    assert inspect(OLD)['State'].get('Health', {}).get('Status') == 'healthy' and binary_hash(OLD) == BASELINE_BINARY
    run('systemctl', 'disable', '--now', 'fanapi-studio-compat.service')
    assert not rule_exists()
    assert drained(NEW), 'restored old endpoint; candidate connections still active, retain candidate'
    save('rollback.json', {'restored': OLD, 'new_retained': NEW, 'historical_refunds_preserved': True})
    print('STUDIO_ROLLED_BACK_VERIFY_GATEWAY_BEFORE_FURTHER_CLEANUP')

if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('action', choices=['prepare', 'switch', 'verify', 'cleanup', 'rollback'])
    p.add_argument('--execute', action='store_true'); p.add_argument('--port', type=int, default=PORT)
    p.add_argument('--phase', choices=['candidate', 'live'], default='candidate'); p.add_argument('--user-id', type=int, default=3)
    args = p.parse_args()
    if args.action != 'verify':
        assert args.execute, 'Draft only: review before passing --execute'
        assert ROOT.is_dir() and ROOT.resolve() == ROOT
        STUDIO.mkdir(exist_ok=True, mode=0o700)
    if args.action == 'verify': verify(args.port, args.phase, args.user_id)
    else: globals()[args.action]()
