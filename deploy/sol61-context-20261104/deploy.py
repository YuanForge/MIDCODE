"""Run on the current production host; secrets remain in private host files."""
import copy, hashlib, json, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, '/root/fanapi-migration')
from redis_migrate import api

ROOT = Path('/root/fanapi-migration/sol61-context-v1076')
OLD = 'midcode-retry-v1069-api-1'
NEW = 'midcode-sol61-v1076-api-1'
IMAGE = 'fanapi-api:sol61-v1.0.76'
PROXIES = [Path('/etc/fanapi-migration/conf.d/api.fanapi.cc.conf'), Path('/opt/1panel/apps/openresty/openresty/www/sites/api.fanapi.cc/proxy/root.conf')]
def run(*args): return subprocess.check_output(args, text=True)
def inspect(name): return api('GET', '/containers/'+name+'/json')
def save(name, value):
    p=ROOT/name; p.write_text(json.dumps(value, indent=2)); p.chmod(0o600)
def incoming(name):
    rows=[]
    for proto in ['tcp','tcp6']:
        for line in run('docker','exec',name,'cat','/proc/net/'+proto).splitlines()[1:]:
            f=line.split()
            if f[3]=='01' and f[1].split(':')[1]=='0050': rows.append(f[1:4])
    return rows
def verify():
    x=inspect(NEW)
    assert x['State']['Health']['Status']=='healthy' and x['RestartCount']==0
    assert run('docker','exec',NEW,'sha256sum','/app/fanapi-server').split()[0] == hashlib.sha256((ROOT/'fanapi-server').read_bytes()).hexdigest()
    subprocess.run(['python3','/root/fanapi-migration/verify_real_log.py','8151'],check=True)
    raw=run('curl','-fsS','http://127.0.0.1:8151/api/public/channels')
    assert 'gpt-6.1-sol' in raw
    matches=list((ROOT/'dist/assets').glob('UserModelsPage-*.js'))
    assert len(matches)==1
    body=run('curl','-fsS','http://127.0.0.1:8151/assets/'+matches[0].name)
    assert '500,000' in body and '272,000' in body
    return {'healthy':True,'restarts':0,'authenticated_log':True,'model_catalog':True,'sol500k_and_other272k_asset':True}

mode=sys.argv[1]
if mode=='prepare':
    assert not run('ss','-Hln','sport = :8151').strip()
    old=inspect(OLD)
    assert old['State']['Health']['Status']=='healthy'
    assert run('docker','exec',OLD,'sha256sum','/app/fanapi-server').split()[0]=='c5b281f55681fbecce0b9835ecc99f83ddf7f5feb77793acd0259c23d193d710'
    save('old-private.json',old)
    for i,p in enumerate(PROXIES):
        assert '127.0.0.1:8149;' in p.read_text()
        (ROOT/f'proxy-{i}.before').write_bytes(p.read_bytes())
    run('docker','cp',OLD+':/app/web/dist/env.js',str(ROOT/'dist/env.js'))
    run('docker','tag',old['Image'],'fanapi-api:sol61-base')
    (ROOT/'Dockerfile').write_text('FROM fanapi-api:sol61-base'+'\nCOPY --chmod=755 fanapi-server /app/fanapi-server\nCOPY dist/ /app/web/dist/\nLABEL midcode.release="v1.0.76" midcode.commit="'+sys.argv[2]+'"\n')
    run('docker','build','-t',IMAGE,str(ROOT))
    cfg=copy.deepcopy(old['Config']);cfg['Image']=IMAGE;cfg['Hostname']=NEW
    cfg['Labels']=dict(cfg.get('Labels') or {},**{'midcode.release':'v1.0.76','midcode.commit':sys.argv[2]})
    host=copy.deepcopy(old['HostConfig']);host['PortBindings']={'80/tcp':[{'HostIp':'127.0.0.1','HostPort':'8151'}]};cfg['HostConfig']=host
    cfg['NetworkingConfig']={'EndpointsConfig':{n:{} for n in old['NetworkSettings']['Networks']}}
    api('POST','/containers/create?name='+NEW,cfg)
    run('systemctl','enable','--now','shared-app@'+NEW+'.service')
    for _ in range(25):
        if inspect(NEW)['State'].get('Health',{}).get('Status')=='healthy':break
        time.sleep(2)
    save('candidate.json',verify());print('CANDIDATE_VERIFIED')
elif mode=='cutover':
    verify()
    for p in PROXIES:
        assert '127.0.0.1:8149;' in p.read_text()
        p.write_text(p.read_text().replace('127.0.0.1:8149;','127.0.0.1:8151;'))
    try:
        run('docker','exec','migration-router','nginx','-t')
        run('docker','exec','migration-router','nginx','-s','reload')
    except Exception:
        for i,p in enumerate(PROXIES):p.write_bytes((ROOT/f'proxy-{i}.before').read_bytes())
        run('docker','exec','migration-router','nginx','-s','reload');raise
    save('cutover.json',{'version':'v1.0.76','time':time.time(),'old':OLD,'new':NEW});print('CUTOVER_COMPLETE')
elif mode=='drain':
    rows=incoming(OLD);print('OLD_INCOMING',len(rows))
    if rows:sys.exit(2)
    net='midcode-studio-backend';x=inspect(NEW)
    if 'midcode-main' not in (x['NetworkSettings']['Networks'][net].get('Aliases') or []):
        api('POST','/networks/'+net+'/disconnect',{'Container':NEW})
        api('POST','/networks/'+net+'/connect',{'Container':NEW,'EndpointConfig':{'Aliases':['midcode-main']}})
    if net in inspect(OLD)['NetworkSettings']['Networks']:
        assert not incoming(OLD)
        api('POST','/networks/'+net+'/disconnect',{'Container':OLD})
    print('ALIAS_MOVED')
elif mode=='cleanup':
    checks=verify();old=inspect(OLD)
    assert not incoming(OLD)
    assert 'midcode-studio-backend' not in old['NetworkSettings']['Networks']
    ips=[v['IPAddress'] for v in old['NetworkSettings']['Networks'].values() if v['IPAddress']]
    for base in ['/etc/fanapi-migration/conf.d','/opt/1panel/apps/openresty/openresty/www/sites']:
        for p in Path(base).rglob('*.conf'):
            s=p.read_text(errors='replace');assert ':8149;' not in s
            assert not any(ip+':' in s for ip in ips)
    for item in api('GET','/containers/json'):
        if item['Id']==old['Id']:continue
        x=inspect(item['Id']);refs=json.dumps([x['Config'].get('Env'),x['Config'].get('Cmd'),x['HostConfig'].get('Links')])
        assert OLD not in refs and not any(ip+':' in refs for ip in ips)
        if ':8149' in refs:
            assert x['Name']=='/midcode-unified-preview-v1072-r3'
            assert run('systemctl','is-active','fanapi-main-compat.service').strip()=='active'
            run('/usr/local/sbin/fanapi-main-compat','start')
    run('systemctl','disable','--now','shared-app@'+OLD+'.service')
    api('DELETE','/containers/'+OLD)
    save('final.json',{'verification':checks,'removed':OLD,'new':NEW,'version':'v1.0.76','time':time.time(),'rollback':'old-private.json and proxy-*.before; retain old image and volumes'})
    print('CLEANUP_COMPLETE_NO_VOLUMES_REMOVED')
else:raise ValueError(mode)
