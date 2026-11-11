import argparse, json, re
import psycopg2, yaml
from common import *

p = argparse.ArgumentParser(); p.add_argument('--execute', action='store_true'); args = p.parse_args()
guarded_execute(args)
m = manifest(); healthy(NEW); assert binary_hash(NEW) == m['binary_sha256']
for filename in ('live-verified.json', 'live-billing.json'):
    result = json.loads((ROOT / filename).read_text())
    assert result.get('passed') is True and result.get('container') == NEW, filename
    assert result.get('binary_sha256') == m['binary_sha256'], 'stale live verification'
assert json.loads((ROOT / 'cutover.json').read_text())['studio_alias'] is True
old = inspect(OLD); before = json.loads((ROOT / 'old-private.json').read_text())
assert old['Id'] == before['Id'] and old['Image'] == before['Image'], 'old container identity changed'
assert drained(OLD), 'old connections have not drained'
ips = sorted({v['IPAddress'] for x in (old, before) for v in x['NetworkSettings']['Networks'].values() if v.get('IPAddress')})
def mentions_old(text):
    return OLD in text or re.search(r':' + str(OLD_PORT) + r'(?![0-9])', text) or any(
        re.search(r'(?<![0-9.])' + re.escape(ip) + r'(?![0-9.])', text) for ip in ips)

assert caddy_targets(caddy_live(), OLD_PORT) == 0 and caddy_targets(caddy_live(), PORT) == 2
assert not mentions_old(CADDY.read_text()) and not mentions_old(COMPAT.read_text())
assert not nat_exists(OLD_PORT) and nat_exists(PORT)
assert '--to-ports ' + str(OLD_PORT) not in run('iptables', '-t', 'nat', '-S')
assert NETWORK not in old['NetworkSettings']['Networks']
assert ALIAS in inspect(NEW)['NetworkSettings']['Networks'][NETWORK]['Aliases']
checked_mounts = set(); checked_containers = []
for summary in api('GET', '/containers/json?all=true'):
    if summary['Id'] == old['Id']: continue
    x = inspect(summary['Id']); checked_containers.append(x['Name'])
    text = json.dumps({'env': x['Config'].get('Env'), 'links': x['HostConfig'].get('Links'),
        'extra_hosts': x['HostConfig'].get('ExtraHosts'), 'volumes_from': x['HostConfig'].get('VolumesFrom'),
        'cmd': x['Config'].get('Cmd'), 'entrypoint': x['Config'].get('Entrypoint')})
    assert not mentions_old(text), 'container dependency: ' + x['Name']
    for mount in x.get('Mounts', []):
        source = Path(mount.get('Source', ''))
        if mount.get('Type') == 'bind' and source.is_file() and source.stat().st_size < 2_000_000:
            if source.suffix.lower() in ('.yaml', '.yml', '.json', '.conf', '.env', '.ini'):
                checked_mounts.add(str(source))
                assert not mentions_old(source.read_text(errors='replace')), 'mounted config dependency: ' + str(source)
for directory in (Path('/etc/systemd/system'), Path('/usr/local/sbin')):
    for path in directory.iterdir():
        if path.is_file() and not path.is_symlink() and path.stat().st_size < 1_000_000:
            assert not mentions_old(path.read_text(errors='replace')), 'active host configuration dependency: ' + str(path)
cfg = yaml.safe_load(Path('/root/fanapi-migration/shared-configs/midcode-independent-api-1.yaml').read_text()); d = cfg['db']
db = psycopg2.connect(host=d['host'], port=d['port'], dbname=d['dbname'], user=d['user'], password=d['password'],
    connect_timeout=10, options='-c default_transaction_read_only=on -c statement_timeout=15000')
with db.cursor() as cur:
    cur.execute('SELECT id,base_url,query_url FROM channels')
    for channel_id, base_url, query_url in cur:
        assert not mentions_old((base_url or '') + ' ' + (query_url or '')), 'channel dependency: ' + str(channel_id)
db.close()
assert not incoming(OLD), 'new connection appeared during dependency audit'
save('cleanup-preflight.json', {'container': OLD, 'id': old['Id'], 'ips': ips,
    'checked_containers': checked_containers, 'checked_mounted_configs': sorted(checked_mounts),
    'proxy_and_nat_clear': True, 'connections_drained': True, 'channels_clear': True})
run('systemctl', 'disable', '--now', 'shared-app@' + OLD + '.service')
assert inspect(OLD)['State']['Running'] is False
run('docker', 'rm', OLD)
save('cleanup.json', {'removed_container': OLD, 'id': old['Id'], 'retained_image': old['Config']['Image'],
    'retained_image_id': old['Image'], 'data_volumes_retained': True,
    'rollback_config': str(ROOT / 'old-private.json'), 'version': VERSION})
print('OLD_CONTAINER_REMOVED_WITHOUT_VOLUMES', OLD)
