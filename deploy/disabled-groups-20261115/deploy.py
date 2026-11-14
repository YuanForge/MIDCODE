"""Guarded main-app rollout; private snapshots stay on the server.
Run prepare, verify.py, switch, verify.py --live, then cleanup.
"""
import argparse
import copy
import hashlib
import http.client
import json
from pathlib import Path
import socket
import subprocess
import time

ROOT=Path('/root/fanapi-groups-v1.0.94')
OLD='midcode-captcha-v1092-api-1'; NEW='midcode-groups-v1094-api-1'
IMAGE='fanapi-api:groups-v1.0.94'; PORT=8158; OLD_PORT=8157
CADDY=Path('/root/fanapi-return-20261113/Caddyfile')
NETWORK='midcode-studio-backend'; ALIAS='midcode-main'

def run(*args): return subprocess.check_output(args,text=True,stderr=subprocess.PIPE)
class UnixHTTP(http.client.HTTPConnection):
    def connect(self):
        self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.connect('/var/run/docker.sock')
def api(method,path,data=None):
    c=UnixHTTP('localhost',timeout=60);c.request(method,'/v1.45'+path,json.dumps(data).encode() if data is not None else None,{'Content-Type':'application/json'})
    r=c.getresponse();raw=r.read();c.close()
    assert r.status<400, (method,path,r.status)
    return json.loads(raw) if raw else None
def inspect(name): return api('GET','/containers/'+name+'/json')
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def save(name,value):
    p=ROOT/name;p.write_text(json.dumps(value,indent=2));p.chmod(0o600)
def healthy(name):
    i=inspect(name);assert i['State']['Running'] and i['State'].get('Health',{}).get('Status')=='healthy' and i['RestartCount']==0,name
    return i
def incoming(name):
    result=[]
    for proto in ('tcp','tcp6'):
        for line in run('docker','exec',name,'cat','/proc/net/'+proto).splitlines()[1:]:
            f=line.split()
            if f[1].split(':')[1]=='1F90' and f[2].split(':')[0] in ('0100007F','0000000000000000FFFF00000100007F'): continue
            if f[3] in ('01','03','08') and f[1].split(':')[1] in ('0050','1F90'):result.append(f[1:4])
    return result
def drain(name):
    for _ in range(30):
        if not incoming(name):
            time.sleep(1)
            if not incoming(name):return
        time.sleep(1)
    raise RuntimeError('Active ingress still present; leave old container running')
def edge_reload():
    run('/root/fanapi-return-20261113/caddy','validate','--config',str(CADDY))
    run('/root/fanapi-return-20261113/caddy','reload','--config',str(CADDY),'--address','127.0.0.1:12019')

def prepare():
    assert not (ROOT/'old-private.json').exists(),'Preserve rollback snapshot'
    old=healthy(OLD);m=json.loads((ROOT/'build.json').read_text())
    assert run('docker','exec',OLD,'sha256sum','/app/fanapi-server').split()[0]==m['baseline_binary_sha256']
    assert run('docker','exec',OLD,'sha256sum','/app/web/dist/index.html').split()[0]==m['baseline_index_sha256']
    assert not run('ss','-H','-ltn','sport = :'+str(PORT)).strip(),'Candidate port occupied'
    assert CADDY.read_text().count('127.0.0.1:8157')==2
    save('old-private.json',old);(ROOT/'Caddyfile.before').write_bytes(CADDY.read_bytes())
    (ROOT/'Caddyfile.before').chmod(0o600)
    (ROOT/'compat.before').write_bytes(Path('/usr/local/sbin/fanapi-usage-compat').read_bytes())
    tag='fanapi-api:groups-v1094-baseline';run('docker','tag',old['Image'],tag)
    (ROOT/'Dockerfile').write_text('FROM '+tag+'\nCOPY --chmod=755 fanapi-server /app/fanapi-server\nLABEL midcode.release="v1.0.94" midcode.commit="'+m['commit']+'"\n')
    (ROOT/'.dockerignore').write_text('*\n!Dockerfile\n!fanapi-server\n')
    run('docker','build','-t',IMAGE,str(ROOT))
    cfg=copy.deepcopy(old['Config']);cfg['Image']=IMAGE;cfg['Hostname']=NEW
    cfg['Labels']=dict(cfg.get('Labels') or {},**{'midcode.release':'v1.0.94','midcode.commit':m['commit']})
    host=copy.deepcopy(old['HostConfig']);host['PortBindings']={'80/tcp':[{'HostIp':'127.0.0.1','HostPort':str(PORT)}]}
    cfg['HostConfig']=host
    cfg['NetworkingConfig']={'EndpointsConfig':{name:{} for name in old['NetworkSettings']['Networks']}}
    api('POST','/containers/create?name='+NEW,cfg)
    run('systemctl','enable','--now','shared-app@'+NEW+'.service')
    for _ in range(30):
        if inspect(NEW)['State'].get('Health',{}).get('Status')=='healthy':break
        time.sleep(2)
    healthy(NEW)
    assert run('docker','exec',NEW,'sha256sum','/app/fanapi-server').split()[0]==m['binary_sha256']
    assert run('docker','exec',NEW,'sha256sum','/app/web/dist/index.html').split()[0]==m['index_sha256']
    run('docker','exec',NEW,'nginx','-t');save('candidate.json',{'container':NEW,'port':PORT,'healthy':True})
    print('CANDIDATE_READY',flush=True)

def switch():
    healthy(NEW);assert (ROOT/'candidate-verified.json').exists()
    before=CADDY.read_text();assert before.count('127.0.0.1:8157')==2
    # Host-network unified workbench uses this stable local port. Redirect new
    # connections, preserving established streams until the old app drains.
    compat=Path('/usr/local/sbin/fanapi-usage-compat')
    new_rule=['OUTPUT','-d','127.0.0.1/32','-p','tcp','--dport','8154','-m','comment','--comment','fanapi-groups-v1094','-j','REDIRECT','--to-ports','8158']
    run('iptables','-t','nat','-I',*new_rule)
    rule=' '.join(new_rule)
    compat.write_text('#!/bin/sh\nset -eu\niptables -t nat -C '+rule+' 2>/dev/null || iptables -t nat -I '+rule+'\n');compat.chmod(0o755)
    CADDY.write_text(before.replace('127.0.0.1:8157','127.0.0.1:8158'))
    try:edge_reload()
    except Exception:
        CADDY.write_text(before);edge_reload()
        compat.write_bytes((ROOT/'compat.before').read_bytes())
        run('iptables','-t','nat','-D',*new_rule)
        raise
    drain(OLD)
    # Only move the studio network after active streams have drained. Both APIs
    # retain their other network for host ingress and shared-service access.
    run('docker','network','disconnect',NETWORK,OLD)
    run('docker','network','connect',NETWORK,OLD)
    run('docker','network','disconnect',NETWORK,NEW)
    run('docker','network','connect','--alias',ALIAS,NETWORK,NEW)
    assert ALIAS not in (inspect(OLD)['NetworkSettings']['Networks'][NETWORK].get('Aliases') or [])
    assert ALIAS in inspect(NEW)['NetworkSettings']['Networks'][NETWORK]['Aliases']
    save('switched.json',{'main':NEW,'compatibility':'8154 -> 8158','alias':ALIAS})
    print('TRAFFIC_SWITCHED',flush=True)

def cleanup():
    healthy(NEW);assert (ROOT/'live-verified.json').exists()
    assert '127.0.0.1:8157' not in CADDY.read_text()
    old=inspect(OLD);ips=[v['IPAddress'] for v in old['NetworkSettings']['Networks'].values() if v.get('IPAddress')]
    references=[]
    nginx=run('docker','exec','1Panel-openresty-0oWm','nginx','-T')
    assert not any(n in nginx for n in [OLD,'127.0.0.1:8157','host.docker.internal:8157']+ips),'Active ingress still references predecessor'
    for item in api('GET','/containers/json'):
        if OLD in [n.lstrip('/') for n in item['Names']]:continue
        obj=inspect(item['Id'])
        check=json.dumps({'env':obj['Config'].get('Env'),'cmd':obj['Config'].get('Cmd'),'extra':obj['HostConfig'].get('ExtraHosts'),'links':obj['HostConfig'].get('Links')})
        if any(term in check for term in [OLD,'127.0.0.1:8157','host.docker.internal:8157']+ips):references.append(item['Names'])
        for mount in obj['Mounts']:
            path=Path(mount['Source'])
            if path.is_file() and path.stat().st_size<2000000:
                content=path.read_text(errors='ignore')
                if any(n in content for n in [OLD,'127.0.0.1:8157','host.docker.internal:8157']+ips):references.append([obj['Name'],path.name])
    assert not references, 'Container dependencies require migration: '+str(references)
    assert 'midcode-main' not in (old['NetworkSettings']['Networks'][NETWORK].get('Aliases') or [])
    rule=['iptables','-t','nat','-C','OUTPUT','-d','127.0.0.1/32','-p','tcp','--dport','8154','-m','comment','--comment','fanapi-groups-v1094','-j','REDIRECT','--to-ports','8158']
    run(*rule)
    run('iptables','-t','nat','-D','OUTPUT','-d','127.0.0.1/32','-p','tcp','--dport','8154','-m','comment','--comment','fanapi-captcha-v1092','-j','REDIRECT','--to-ports','8157')
    drain(OLD)
    run('systemctl','disable','--now','shared-app@'+OLD+'.service')
    assert not inspect(OLD)['State']['Running']
    api('DELETE','/containers/'+OLD) # Deliberately no volume deletion.
    healthy(NEW);save('cleanup.json',{'removed':[OLD],'volumes_deleted':False,'rollback_image':'fanapi-api:groups-v1094-baseline'})
    print('OLD_CONTAINER_REMOVED',flush=True)

def rollback():
    old=json.loads((ROOT/'old-private.json').read_text())
    names=[n.lstrip('/') for obj in api('GET','/containers/json?all=true') for n in obj['Names']]
    if OLD not in names:
        cfg=copy.deepcopy(old['Config']);cfg['HostConfig']=old['HostConfig'];cfg['Image']=old['Image']
        cfg['NetworkingConfig']={'EndpointsConfig':{n:{} for n in old['NetworkSettings']['Networks']}}
        api('POST','/containers/create?name='+OLD,cfg)
    run('systemctl','enable','--now','shared-app@'+OLD+'.service')
    for _ in range(30):
        if inspect(OLD)['State'].get('Health',{}).get('Status')=='healthy':break
        time.sleep(2)
    healthy(OLD)
    Path('/usr/local/sbin/fanapi-usage-compat').write_bytes((ROOT/'compat.before').read_bytes())
    run('/usr/local/sbin/fanapi-usage-compat')
    args=['iptables','-t','nat','-D','OUTPUT','-d','127.0.0.1/32','-p','tcp','--dport','8154','-m','comment','--comment','fanapi-groups-v1094','-j','REDIRECT','--to-ports','8158']
    subprocess.run(args,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    CADDY.write_bytes((ROOT/'Caddyfile.before').read_bytes());edge_reload();drain(NEW)
    run('docker','network','disconnect',NETWORK,NEW);run('docker','network','connect',NETWORK,NEW)
    run('docker','network','disconnect',NETWORK,OLD);run('docker','network','connect','--alias',ALIAS,NETWORK,OLD)
    print('ROLLED_BACK; verify services before retiring candidate')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['prepare','switch','cleanup','rollback']);a=p.parse_args()
    globals()[a.action]()
