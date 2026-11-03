import sys,json,copy,subprocess
from pathlib import Path
sys.path.insert(0,'/root/fanapi-migration');from redis_migrate import api
p=Path('/root/fanapi-migration');private=json.loads((p/'studio-s3-private.json').read_text());cred=private['credentials']
s3env=['MEDIA_S3_ENDPOINT=https://s3.fanapi.cc','MEDIA_S3_BUCKET=midcode-media','MEDIA_S3_ACCESS_KEY='+cred['accessKey'],'MEDIA_S3_SECRET_KEY='+cred['secretKey']]
# Stable Docker DNS between the new gateway and the local business service.
net='midcode-studio-backend'
try:api('GET','/networks/'+net)
except:api('POST','/networks/create',{'Name':net,'Driver':'bridge'})
main=api('GET','/containers/midcode-domain-ping-final-v1062-api-1/json')
if net not in main['NetworkSettings']['Networks']:api('POST','/networks/'+net+'/connect',{'Container':main['Id'],'EndpointConfig':{'Aliases':['midcode-main']}})
image=api('GET','/containers/midcode-image-independent/json');cfg=copy.deepcopy(image['Config']);h=copy.deepcopy(image['HostConfig']);cfg['Image']='midcode-image:s3-v1063';cfg['WorkingDir']='/app/aipic';cfg['Cmd']=['node','server.mjs'];cfg['Hostname']='midcode-image-s3-v1063';cfg['Env']=[e for e in cfg['Env'] if e.split('=',1)[0] not in ['PORT','AIPIC_DIST']]+['PORT=8798','AIPIC_DIST=/app/aipic/dist']+s3env;h['RestartPolicy']={'Name':'unless-stopped'};h['Memory']=512*1024*1024;cfg['HostConfig']=h
api('POST','/containers/create?name=midcode-image-s3-v1063',cfg);api('POST','/containers/midcode-image-s3-v1063/start')
cfg=copy.deepcopy(private['video_config']);cfg['Image']='midcode-video-gateway:s3-v1063';cfg['Hostname']='midcode-video-s3-v1063';cfg['WorkingDir']='/app';cfg['Cmd']=['node','/app/toonflow/gateway.mjs'];cfg['Env']=[e for e in cfg.get('Env',[]) if e.split('=',1)[0] not in ['MIDCODE_BACKEND','GATEWAY_CONTAINER','TENANT_IMAGE','VIDEO_DATA_ROOT']]+['MIDCODE_BACKEND=http://midcode-main','GATEWAY_CONTAINER=midcode-video-s3-v1063','TENANT_IMAGE=midcode-toonflow:tenant20261101','VIDEO_DATA_ROOT=/mnt/fanapi-shared/MIDCODE/video']+s3env
cfg['HostConfig']={'NetworkMode':net,'Binds':['/root/fanapi-migration/video-s3-state:/state','/var/run/docker.sock:/var/run/docker.sock','/mnt/fanapi-shared/MIDCODE/video:/mnt/fanapi-shared/MIDCODE/video'],'PortBindings':{'8080/tcp':[{'HostIp':'127.0.0.1','HostPort':'8183'}]},'RestartPolicy':{'Name':'no'},'Memory':384*1024*1024,'LogConfig':{'Type':'json-file','Config':{'max-size':'10m','max-file':'3'}}}
cfg['NetworkingConfig']={'EndpointsConfig':{net:{}}}
api('POST','/containers/create?name=midcode-video-s3-v1063',cfg);api('POST','/containers/midcode-video-s3-v1063/start')
subprocess.run(['systemctl','enable','--now','shared-app@midcode-video-s3-v1063.service'],check=True)
print('NEW_ONLY_STUDIO_CANDIDATES_STARTED')
