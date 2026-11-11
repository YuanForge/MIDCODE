import argparse, copy, json, time
from common import *

p = argparse.ArgumentParser(); p.add_argument('--execute', action='store_true'); args = p.parse_args()
guarded_execute(args)
m = manifest()
assert sha(ROOT / 'fanapi-server') == m['binary_sha256']
assert (BASE_ROOT / 'live-verified.json').exists(), 'wait for v1.0.86 completed live verification'
old = healthy(OLD)
assert old['Config']['Labels'].get('midcode.release') == 'v1.0.86'
assert binary_hash(OLD) == m['baseline_binary_sha256']
assert frontend_hash(OLD) == m['baseline_index_sha256']
assert inspect(OLD)['Image'] == api('GET', '/images/' + old['Config']['Image'] + '/json')['Id']
assert run('ss', '-H', '-ltn', 'sport = :' + str(PORT)).strip() == '', 'candidate port in use'
assert not any('/' + NEW in x['Names'] for x in api('GET', '/containers/json?all=true'))
live = CADDY.read_text()
assert caddy_targets(live, OLD_PORT) == 2 and caddy_targets(caddy_live(), OLD_PORT) == 2
assert '--to-ports ' + str(OLD_PORT) in COMPAT.read_text() and nat_exists(OLD_PORT)
assert ALIAS in old['NetworkSettings']['Networks'][NETWORK]['Aliases']
assert not (ROOT / 'old-private.json').exists(), 'preserve existing rollback snapshot'
save('old-private.json', old, private=True)
for name, source in [('Caddyfile.before', CADDY), ('compat.before', COMPAT)]:
    path = ROOT / name; assert not path.exists(); path.write_bytes(source.read_bytes()); path.chmod(0o600)
base_tag = 'fanapi-api:refund-v1087-baseline-' + old['Image'].split(':')[-1][:12]
run('docker', 'tag', old['Image'], base_tag)
assert api('GET', '/images/' + base_tag + '/json')['Id'] == old['Image']
save('baseline.json', {'image': old['Config']['Image'], 'image_id': old['Image'], 'pinned_build_tag': base_tag,
     'container': OLD, 'binary_sha256': binary_hash(OLD), 'index_sha256': frontend_hash(OLD)})
run('docker', 'cp', OLD + ':/etc/nginx/nginx.conf', str(ROOT / 'nginx.before'))
(ROOT / '.dockerignore').write_text('*\n!Dockerfile\n!fanapi-server\n')
(ROOT / 'Dockerfile').write_text('FROM ' + base_tag + '\n' +
    'COPY --chmod=755 fanapi-server /app/fanapi-server\n' +
    'LABEL midcode.release="' + VERSION + '" midcode.commit="' + m['commit'] + '" ' +
    'org.opencontainers.image.version="' + VERSION + '" org.opencontainers.image.revision="' + m['commit'] + '"\n')
print(run('docker', 'build', '-t', IMAGE, str(ROOT)), flush=True)
cfg = copy.deepcopy(old['Config']); cfg['Image'] = IMAGE; cfg['Hostname'] = NEW
cfg['Labels'] = dict(cfg.get('Labels') or {}, **{'midcode.release': VERSION, 'midcode.commit': m['commit'],
    'org.opencontainers.image.version': VERSION, 'org.opencontainers.image.revision': m['commit']})
host = copy.deepcopy(old['HostConfig']); host['PortBindings'] = {'80/tcp': [{'HostIp': '127.0.0.1', 'HostPort': str(PORT)}]}
cfg['HostConfig'] = host
cfg['NetworkingConfig'] = {'EndpointsConfig': {name: {} for name in old['NetworkSettings']['Networks']}}
api('POST', '/containers/create?name=' + NEW, cfg)
run('systemctl', 'enable', '--now', 'shared-app@' + NEW + '.service')
for _ in range(60):
    state = inspect(NEW)
    if state['State'].get('Health', {}).get('Status') == 'healthy': break
    time.sleep(2)
healthy(NEW)
assert binary_hash(NEW) == m['binary_sha256']
assert frontend_hash(NEW) == m['baseline_index_sha256'], 'v1.0.86 frontend must remain identical'
run('docker', 'exec', NEW, 'nginx', '-t')
save('candidate.json', {'container': NEW, 'port': PORT, 'healthy': True, 'restarts': 0,
     'commit': m['commit'], 'binary_sha256': m['binary_sha256'], 'baseline': OLD})
print('CANDIDATE_READY_NO_TRAFFIC_SWITCH', NEW, PORT)
