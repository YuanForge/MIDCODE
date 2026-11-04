import sys,json,copy,subprocess,tarfile
from pathlib import Path
sys.path.insert(0,'/root/fanapi-migration');from redis_migrate import api
root=Path('/root/fanapi-migration/cache-hit-v1067');root.mkdir(exist_ok=True)
subprocess.run(['tar','-xzf','/root/fanapi-migration/model-performance-build.tar.gz','-C',str(root)],check=True)
old='midcode-logs-v1066-api-1';x=api('GET','/containers/'+old+'/json')
(root/'previous-private.json').write_text(json.dumps(x));(root/'previous-private.json').chmod(0o600)
subprocess.run(['docker','cp',old+':/app/web/dist/env.js',str(root/'dist/env.js')],check=True)
subprocess.run(['docker','tag',x['Image'],'fanapi-api:cache-v1067-base'],check=True)
(root/'Dockerfile').write_text('FROM fanapi-api:cache-v1067-base\nCOPY --chmod=755 fanapi-server /app/fanapi-server\nCOPY dist/ /app/web/dist/\nLABEL midcode.release="v1.0.67"\n')
subprocess.run(['docker','build','-t','fanapi-api:cache-v1.0.67',str(root)],check=True)
name='midcode-cache-v1067-api-1';cfg=copy.deepcopy(x['Config']);cfg['Image']='fanapi-api:cache-v1.0.67';cfg['Hostname']=name;cfg['Labels']=dict(cfg.get('Labels') or {},**{'midcode.release':'v1.0.67'})
h=copy.deepcopy(x['HostConfig']);h['PortBindings']={'80/tcp':[{'HostIp':'127.0.0.1','HostPort':'8147'}]};cfg['HostConfig']=h
# Do not take the video backend alias until the public candidate has passed checks.
cfg['NetworkingConfig']={'EndpointsConfig':{n:{} for n in x['NetworkSettings']['Networks']}}
api('POST','/containers/create?name='+name,cfg)
subprocess.run(['systemctl','enable','--now','shared-app@'+name+'.service'],check=True)
print('PERFORMANCE_CANDIDATE_STARTED',flush=True)

