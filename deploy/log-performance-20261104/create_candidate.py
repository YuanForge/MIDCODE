import sys,json,copy,subprocess,tarfile
from pathlib import Path
sys.path.insert(0,'/root/fanapi-migration');from redis_migrate import api
root=Path('/root/fanapi-migration/log-performance-v1066');root.mkdir(exist_ok=True)
subprocess.run(['tar','-xzf','/root/fanapi-migration/model-performance-build.tar.gz','-C',str(root)],check=True)
old='midcode-status-v1065-api-1';x=api('GET','/containers/'+old+'/json')
(root/'previous-private.json').write_text(json.dumps(x));(root/'previous-private.json').chmod(0o600)
subprocess.run(['docker','cp',old+':/app/web/dist/env.js',str(root/'dist/env.js')],check=True)
subprocess.run(['docker','tag',x['Image'],'fanapi-api:logs-v1066-base'],check=True)
(root/'Dockerfile').write_text('FROM fanapi-api:logs-v1066-base\nCOPY --chmod=755 fanapi-server /app/fanapi-server\nCOPY dist/ /app/web/dist/\nLABEL midcode.release="v1.0.66"\n')
subprocess.run(['docker','build','-t','fanapi-api:logs-v1.0.66',str(root)],check=True)
name='midcode-logs-v1066-api-1';cfg=copy.deepcopy(x['Config']);cfg['Image']='fanapi-api:logs-v1.0.66';cfg['Hostname']=name;cfg['Labels']=dict(cfg.get('Labels') or {},**{'midcode.release':'v1.0.66'})
h=copy.deepcopy(x['HostConfig']);h['PortBindings']={'80/tcp':[{'HostIp':'127.0.0.1','HostPort':'8146'}]};cfg['HostConfig']=h
# Do not take the video backend alias until the public candidate has passed checks.
cfg['NetworkingConfig']={'EndpointsConfig':{n:{} for n in x['NetworkSettings']['Networks']}}
api('POST','/containers/create?name='+name,cfg)
subprocess.run(['systemctl','enable','--now','shared-app@'+name+'.service'],check=True)
print('PERFORMANCE_CANDIDATE_STARTED',flush=True)
