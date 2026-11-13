"""Start an isolated preview candidate; never copy live SQLite files into final state."""
exec(open('/root/fanapi-return-20261113/prepare.py').read().split('specs=json.loads')[0])
old=next(c for c in json.loads((BASE/'source-private.json').read_text()) if 'unified' in c['Name'])
name='midcode-return-preview-v1088'
cfg=copy.deepcopy(old['Config']);hc=copy.deepcopy(old['HostConfig']);cfg.pop('Hostname',None)
env=dict(x.split('=',1) for x in cfg['Env']);env['MIDCODE_BACKEND']='http://127.0.0.1:8154';cfg['Env']=[k+'='+v for k,v in env.items()]
hc['Binds']=[str(BASE/'preview-state-candidate')+':/state'];cfg['Labels']={**(cfg.get('Labels') or {}),'fanapi.migration':'return-old-server-20261113'}
api('POST','/containers/create?name='+name,{**cfg,'HostConfig':hc});api('POST','/containers/'+name+'/start');print('started',name)
