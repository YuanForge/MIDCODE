"""Clone OctoAPI and monitor with current runtime configuration on isolated ports."""
exec(open('/root/fanapi-return-20261113/prepare.py').read().split('specs=json.loads')[0])
specs=json.loads((BASE/'additional-private.json').read_text());images=json.loads((BASE/'additional-images-private.json').read_text())
ids=subprocess.check_output(['docker','image','ls','-aq','--no-trunc'],text=True).split();local=json.loads(subprocess.check_output(['docker','image','inspect']+list(dict.fromkeys(ids))))
for old,image in zip(specs,images):
 name=old['Name'].lstrip('/').replace('octoapi-independent','octoapi-return-v1088')
 if subprocess.run(['docker','container','inspect',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:continue
 matches=[x for x in local if x['RootFS']==image['RootFS']];assert matches,'image missing '+name
 cfg=copy.deepcopy(old['Config']);hc=copy.deepcopy(old['HostConfig']);cfg.pop('Hostname',None);cfg['Image']=matches[0]['Id']
 cfg['Env']=[e.replace('OBS_TRUSTED_PROXIES=172.30.90.0/24','OBS_TRUSTED_PROXIES=10.201.90.0/24') for e in cfg['Env']]
 cfg['Labels']={**(cfg.get('Labels') or {}),'fanapi.migration':'return-old-server-20261113'}
 hc['Binds']=[(str(BASE/pathlib.Path(m['Source']).name) if m['Destination']=='/app/config.yaml' else m['Source'])+':'+m['Destination']+('' if m['RW'] else ':ro') for m in old['Mounts'] if m['Type']=='bind']
 if name=='observability-web-1':hc['Binds'].append(str(BASE/'monitor-nginx.conf')+':/etc/nginx/conf.d/default.conf:ro')
 if 'octoapi' in name and 'api-1' in name:hc['PortBindings']={'8080/tcp':[{'HostIp':'127.0.0.1','HostPort':'8092'}]}
 nets={}
 for net,val in old['NetworkSettings']['Networks'].items():
  if subprocess.run(['docker','network','inspect',net],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
   cmd=['docker','network','create']
   if net=='observability_default':cmd+=['--subnet','10.201.90.0/24','--gateway','10.201.90.1']
   subprocess.run(cmd+[net],check=True,stdout=subprocess.DEVNULL)
  nets[net]={'Aliases':val.get('Aliases')}
 api('POST','/containers/create?name='+name,{**cfg,'HostConfig':hc,'NetworkingConfig':{'EndpointsConfig':nets}});api('POST','/containers/'+name+'/start');print('started',name)
