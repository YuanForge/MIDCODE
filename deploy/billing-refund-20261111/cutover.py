import argparse, json
from common import *

p = argparse.ArgumentParser(); p.add_argument('--execute', action='store_true'); args = p.parse_args()
guarded_execute(args)
m = manifest(); healthy(NEW); assert binary_hash(NEW) == m['binary_sha256']
for filename in ('candidate-business.json', 'candidate-billing.json'):
    evidence = json.loads((ROOT / filename).read_text())
    assert evidence.get('passed') is True and evidence.get('container') == NEW, filename
    assert evidence.get('binary_sha256') == m['binary_sha256'], 'stale candidate evidence'
live = CADDY.read_text(); compat = COMPAT.read_text()
assert caddy_targets(live, OLD_PORT) == 2 and caddy_targets(caddy_live(), OLD_PORT) == 2
assert '--to-ports ' + str(OLD_PORT) in compat and nat_exists(OLD_PORT)
assert live == (ROOT / 'Caddyfile.before').read_text(), 'proxy changed after snapshot; inspect and rebase'
assert compat == (ROOT / 'compat.before').read_text(), 'compatibility mapping changed after snapshot'
candidate = ROOT / 'Caddyfile.candidate'
candidate.write_text(live.replace('127.0.0.1:' + str(OLD_PORT), '127.0.0.1:' + str(PORT)))
run('caddy', 'validate', '--config', str(candidate), '--adapter', 'caddyfile')
try:
    CADDY.write_bytes(candidate.read_bytes())
    run('systemctl', 'reload', 'caddy')
    assert caddy_targets(caddy_live(), PORT) == 2 and caddy_targets(caddy_live(), OLD_PORT) == 0
    COMPAT.write_text(compat.replace('--to-ports ' + str(OLD_PORT), '--to-ports ' + str(PORT)))
    move_nat(OLD_PORT, PORT)
except Exception:
    CADDY.write_text(live); run('systemctl', 'reload', 'caddy'); COMPAT.write_text(compat)
    if nat_exists(PORT): move_nat(PORT, OLD_PORT)
    raise
save('cutover.json', {'container': NEW, 'port': PORT, 'old_retained': OLD,
    'caddy': True, 'compat_8149': True, 'studio_alias': False})
print('CADDY_AND_COMPAT_SWITCHED_OLD_RETAINED', flush=True)
assert drained(OLD), 'old requests still active; main switched, old alias retained; inspect before continuing'
api('POST', '/networks/' + NETWORK + '/disconnect', {'Container': NEW})
try:
    api('POST', '/networks/' + NETWORK + '/connect', {'Container': NEW, 'EndpointConfig': {'Aliases': [ALIAS]}})
except Exception:
    api('POST', '/networks/' + NETWORK + '/connect', {'Container': NEW})
    raise
assert ALIAS in inspect(NEW)['NetworkSettings']['Networks'][NETWORK]['Aliases']
assert drained(OLD), 'old studio requests active; both aliases retained until drain; inspect before disconnect'
api('POST', '/networks/' + NETWORK + '/disconnect', {'Container': OLD})
save('cutover.json', {'container': NEW, 'port': PORT, 'old_retained': OLD,
    'caddy': True, 'compat_8149': True, 'studio_alias': True})
print('STUDIO_ALIAS_MOVED_OLD_CONTAINER_RETAINED', flush=True)
