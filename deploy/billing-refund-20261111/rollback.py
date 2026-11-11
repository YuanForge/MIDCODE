"""Restore the saved v1.0.86 application; historical corrective refunds are not reversed."""
import argparse, copy, json
from common import *

p = argparse.ArgumentParser(); p.add_argument('--execute', action='store_true'); args = p.parse_args()
guarded_execute(args)
saved = json.loads((ROOT / 'old-private.json').read_text())
assert saved['Name'].lstrip('/') == OLD
assert api('GET', '/images/' + saved['Image'] + '/json')['Id'] == saved['Image'], 'rollback image unavailable'
names = {n for x in api('GET', '/containers/json?all=true') for n in x['Names']}
if '/' + OLD not in names:
    cfg = copy.deepcopy(saved['Config']); cfg['Image'] = saved['Image']; cfg['HostConfig'] = saved['HostConfig']
    cfg['NetworkingConfig'] = {'EndpointsConfig': {name: {} for name in saved['NetworkSettings']['Networks']}}
    api('POST', '/containers/create?name=' + OLD, cfg)
run('systemctl', 'enable', '--now', 'shared-app@' + OLD + '.service')
for _ in range(60):
    if inspect(OLD)['State'].get('Health', {}).get('Status') == 'healthy': break
    time.sleep(2)
info = inspect(OLD); assert info['State'].get('Health', {}).get('Status') == 'healthy'
baseline = json.loads((ROOT / 'baseline.json').read_text())
assert binary_hash(OLD) == baseline['binary_sha256'] and frontend_hash(OLD) == baseline['index_sha256']
assert caddy_targets(caddy_live(), PORT) == 2, 'unexpected active route; inspect before rollback'
restore = ROOT / 'Caddyfile.rollback'
# Preserve unrelated host changes made after this release's snapshot.
restore.write_text(CADDY.read_text().replace('127.0.0.1:' + str(PORT), '127.0.0.1:' + str(OLD_PORT)))
run('caddy', 'validate', '--config', str(restore), '--adapter', 'caddyfile')
CADDY.write_bytes(restore.read_bytes()); run('systemctl', 'reload', 'caddy')
COMPAT.write_text(COMPAT.read_text().replace('--to-ports ' + str(PORT), '--to-ports ' + str(OLD_PORT)))
move_nat(PORT, OLD_PORT)
assert caddy_targets(caddy_live(), OLD_PORT) == 2
assert drained(NEW), 'new requests still active; old main restored but new studio alias retained'
if NETWORK in inspect(OLD)['NetworkSettings']['Networks']:
    api('POST', '/networks/' + NETWORK + '/disconnect', {'Container': OLD})
api('POST', '/networks/' + NETWORK + '/connect', {'Container': OLD, 'EndpointConfig': {'Aliases': [ALIAS]}})
assert drained(NEW), 'new studio connections must drain before network disconnect'
if NETWORK in inspect(NEW)['NetworkSettings']['Networks']:
    api('POST', '/networks/' + NETWORK + '/disconnect', {'Container': NEW})
save('rollback.json', {'restored_container': OLD, 'retained_candidate': NEW,
    'refunds_preserved': True, 'caddy': True, 'compat_8149': True, 'studio_alias': True})
print('APPLICATION_ROLLED_BACK_VERIFY_BUSINESS_BEFORE_ANY_CLEANUP')
