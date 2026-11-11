"""Authenticated existing-account checks and expiring studio handoff; no generation or balance writes."""
import argparse, base64, hashlib, hmac, http.client, json, time
from urllib.parse import parse_qs, urlsplit
import yaml
from common import *

p = argparse.ArgumentParser()
p.add_argument('--port', type=int, required=True)
p.add_argument('--user-id', type=int, default=3)
p.add_argument('--phase', choices=['candidate', 'live'], required=True)
args = p.parse_args()
cfg = yaml.safe_load(Path('/root/fanapi-migration/shared-configs/midcode-independent-api-1.yaml').read_text())
enc = lambda x: base64.urlsafe_b64encode(json.dumps(x, separators=(',', ':')).encode()).decode().rstrip('=')
now = int(time.time()); signed = enc({'alg': 'HS256', 'typ': 'JWT'}) + '.' + enc(
    {'sub': args.user_id, 'role': 'user', 'group': 'default', 'iat': now, 'exp': now + 600})
token = signed + '.' + base64.urlsafe_b64encode(hmac.new(cfg['server']['jwt_secret'].encode(), signed.encode(), hashlib.sha256).digest()).decode().rstrip('=')

def request(port, method, path, data=None, cookie=None, auth=True):
    c = http.client.HTTPConnection('127.0.0.1', port, timeout=60)
    headers = {'Origin': 'https://image.midcode.cc', 'X-Midcode-Client-IP': '203.0.113.7',
               'Content-Type': 'application/json', 'Host': 'midcode.cc'}
    if auth: headers['Authorization'] = 'Bearer ' + token
    if cookie: headers['Cookie'] = cookie
    c.request(method, path, json.dumps(data).encode() if data is not None else None, headers)
    r = c.getresponse(); body = r.read(); response_headers = dict(r.getheaders()); c.close()
    return r.status, body, response_headers

checks = []
for path, field in [('/api/user/channels', 'channels'), ('/api/user/model-preferences', 'preferences')]:
    status, body, _ = request(args.port, 'GET', path)
    assert status == 200 and isinstance(json.loads(body)[field], list), path + ' failed'
    assert request(args.port, 'GET', path, auth=False)[0] == 401, path + ' auth gate failed'
    checks.append('authenticated and unauthenticated ' + path)
status, body, _ = request(args.port, 'GET', '/api/user/stats')
assert status == 200 and isinstance(json.loads(body), dict), 'user billing stats failed'
checks.append('authenticated billing statistics')
for kind, port, data in [('image', 8798, {'all_keys': True}), ('video', 8183, {})]:
    status, body, _ = request(args.port, 'POST', '/api/user/' + kind + '-studio/handoff', data)
    assert status == 200, kind + ' handoff status ' + str(status)
    ticket = parse_qs(urlsplit(json.loads(body)['url']).fragment)['midcode_code'][0]
    status, body, headers = request(port, 'POST', '/midcode/exchange' if kind == 'image' else '/video/exchange',
        {'code' if kind == 'image' else 'token': ticket})
    assert status == 200, kind + ' exchange status ' + str(status)
    cookie = headers.get('Set-Cookie', '').split(';')[0]; assert cookie
    if kind == 'video':
        path = json.loads(body)['url']
        status, body, _ = request(port, 'GET', path, cookie=cookie)
        assert status == 200 and b'<html' in body.lower(), 'video page failed'
        other = 6 if args.user_id != 6 else 3
        assert request(port, 'GET', '/video/u/' + str(other) + '/', cookie=cookie)[0] == 403, 'video tenant isolation failed'
    checks.append(kind + ' handoff/exchange' + ('/tenant isolation' if kind == 'video' else ''))
continuity = []
if args.phase == 'live':
    for index in range(20):
        for url in ['https://midcode.cc/', 'https://midcode.cc/studio-preview/entry', 'https://image.midcode.cc/']:
            status = run('curl', '-sS', '-L', '--max-time', '20', '--resolve', 'midcode.cc:443:127.0.0.1',
                '--resolve', 'image.midcode.cc:443:127.0.0.1', '-o', '/dev/null', '-w', '%{http_code}', url).strip()
            assert status == '200', 'public continuity failed: ' + url + ' status ' + status
            continuity.append({'url': url, 'status': status})
        time.sleep(1)
m = manifest(); healthy(NEW)
assert binary_hash(NEW) == m['binary_sha256'] and frontend_hash(NEW) == m['baseline_index_sha256']
name = 'candidate-business.json' if args.phase == 'candidate' else 'live-verified.json'
save(name, {'passed': True, 'container': NEW, 'port': args.port, 'binary_sha256': m['binary_sha256'],
    'checks': checks, 'continuity_checks': len(continuity), 'user_id': args.user_id,
    'limitations': ['Preference reads only; mutation/isolation regression must also run verify_preferences.py',
                    'No real model generation submitted by this script; billing regression is separate']})
print(json.dumps({'passed': True, 'checks': checks, 'continuity_checks': len(continuity), 'artifact': name}))
