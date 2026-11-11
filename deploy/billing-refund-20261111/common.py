import hashlib, http.client, json, os, re, socket, subprocess, time
from pathlib import Path

ROOT = Path('/root/fanapi-billing-refund-v1.0.87')
BASE_ROOT = Path('/root/fanapi-model-preferences-v1.0.86')
OLD = 'midcode-preferences-v1086-api-1'
NEW = 'midcode-refund-v1087-api-1'
IMAGE = 'fanapi-api:refund-v1.0.87'
VERSION = 'v1.0.87'
OLD_PORT, PORT = 8153, 8154
NETWORK, ALIAS = 'midcode-studio-backend', 'midcode-main'
CADDY = Path('/etc/caddy/Caddyfile')
COMPAT = Path('/usr/local/sbin/fanapi-main-compat')

class UnixHTTP(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect('/var/run/docker.sock')

def api(method, path, data=None):
    c = UnixHTTP('localhost', timeout=60)
    c.request(method, '/v1.45' + path, json.dumps(data).encode() if data is not None else None,
              {'Content-Type': 'application/json'})
    r = c.getresponse(); raw = r.read(); c.close()
    if r.status >= 400:
        raise RuntimeError('Docker API status ' + str(r.status) + ' for ' + path)
    return json.loads(raw) if raw else None

def run(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.PIPE)

def inspect(name):
    return api('GET', '/containers/' + name + '/json')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def save(name, value, private=False):
    path = ROOT / name
    path.write_text(json.dumps(value, indent=2) + '\n')
    path.chmod(0o600 if private else 0o644)

def healthy(name):
    info = inspect(name)
    assert info['State'].get('Health', {}).get('Status') == 'healthy', name + ' not healthy'
    assert info['RestartCount'] == 0, name + ' restarted'
    return info

def binary_hash(name):
    return run('docker', 'exec', name, 'sha256sum', '/app/fanapi-server').split()[0]

def frontend_hash(name):
    return run('docker', 'exec', name, 'sha256sum', '/app/web/dist/index.html').split()[0]

def manifest():
    m = json.loads((ROOT / 'build.json').read_text())
    assert m['release'] == VERSION
    assert re.fullmatch(r'[0-9a-f]{40}', m['commit'])
    for field in ('binary_sha256', 'baseline_binary_sha256', 'baseline_index_sha256'):
        assert re.fullmatch(r'[0-9a-f]{64}', m[field]), field
    return m

def caddy_live():
    c = http.client.HTTPConnection('127.0.0.1', 2019, timeout=15)
    c.request('GET', '/config/'); r = c.getresponse(); raw = r.read(); c.close()
    assert r.status == 200, 'cannot read running Caddy config'
    return raw.decode()

def caddy_targets(text, port):
    return len(re.findall(r'127\.0\.0\.1:' + str(port) + r'(?![0-9])', text))

def incoming(name):
    result = []
    for proto in ('tcp', 'tcp6'):
        for line in run('docker', 'exec', name, 'cat', '/proc/net/' + proto).splitlines()[1:]:
            fields = line.split()
            if fields[3] in ('01', '03', '08') and fields[1].split(':')[1] in ('0050', '1F90'):
                result.append(fields[1:4])
    return result

def drained(name, timeout=50):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        if not incoming(name):
            time.sleep(1)
            if not incoming(name):
                return True
        time.sleep(1)
    return False

def nat_args(port):
    return ['OUTPUT', '-d', '127.0.0.1/32', '-p', 'tcp', '--dport', '8149',
            '-m', 'comment', '--comment', 'fanapi-main-compat', '-j', 'REDIRECT',
            '--to-ports', str(port)]

def nat_exists(port):
    return subprocess.run(['iptables', '-t', 'nat', '-C'] + nat_args(port),
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0

def move_nat(source, target):
    assert nat_exists(source), 'expected original compatibility rule absent'
    if not nat_exists(target):
        run('iptables', '-t', 'nat', '-I', *nat_args(target))
    while nat_exists(source):
        run('iptables', '-t', 'nat', '-D', *nat_args(source))
    assert nat_exists(target) and not nat_exists(source)

def guarded_execute(args):
    assert args.execute, 'Draft only: review this script and pass --execute explicitly'
    assert ROOT.is_dir() and ROOT.resolve() == ROOT
