"""Create old-host candidates from privately captured production Docker specs."""
import copy,http.client,json,pathlib,socket,subprocess,sys
BASE=pathlib.Path('/root/fanapi-return-20261113')
class Docker(http.client.HTTPConnection):
 def __init__(self):super().__init__('localhost')
 def connect(self):self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.connect('/var/run/docker.sock')
def api(method,path,data=None):
 c=Docker();c.request(method,'/v1.45'+path,json.dumps(data) if data is not None else None,{'Content-Type':'application/json'});r=c.getresponse();b=r.read();c.close()
 if r.status>=300:raise RuntimeError(str(r.status)+' '+b.decode()[:300])
 return json.loads(b) if b else None
specs=json.loads((BASE/'source-private.json').read_text())
for old in specs:
 name=old['Name'].lstrip('/')
 if 'unified' in name:continue
 if subprocess.run(['docker','container','inspect',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:continue
 cfg=copy.deepcopy(old['Config']);hc=copy.deepcopy(old['HostConfig'])
 cfg.pop('Hostname',None);cfg.pop('Domainname',None)
 cfg['Labels']={**(cfg.get('Labels') or {}),'fanapi.migration':'return-old-server-20261113','fanapi.source-release':'v1.0.87'}
 env=dict(x.split('=',1) for x in cfg['Env'])
 if 'MIDCODE_ORIGIN' in env:env['MIDCODE_ORIGIN']='http://127.0.0.1:8106'
 cfg['Env']=[k+'='+v for k,v in env.items()]
 binds=[]
 for m in old['Mounts']:
  src=m['Source']
  if m['Destination']=='/app/config.yaml':src=str(BASE/pathlib.Path(src).name)
  if m['Destination']=='/state':src=str(BASE/'video-state');pathlib.Path(src).mkdir(exist_ok=True)
  if m['Type']=='bind':binds.append(src+':'+m['Destination']+('' if m['RW'] else ':ro'))
 hc['Binds']=binds;hc.pop('ContainerIDFile',None)
 nets={}
 for net,val in old['NetworkSettings']['Networks'].items():
  if net.startswith('midcode-video-user-'):continue
  if net not in ['host','none','bridge']:
   if subprocess.run(['docker','network','inspect',net],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:subprocess.run(['docker','network','create',net],check=True,stdout=subprocess.DEVNULL)
  nets[net]={'Aliases':val.get('Aliases')}
 result=api('POST','/containers/create?name='+name,{**cfg,'HostConfig':hc,'NetworkingConfig':{'EndpointsConfig':nets}})
 api('POST','/containers/'+name+'/start');print('started',name)
