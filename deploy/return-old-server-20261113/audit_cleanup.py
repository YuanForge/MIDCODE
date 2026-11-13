import subprocess,json,pathlib,re
base=pathlib.Path('/root/fanapi-return-20261113');targets=['midcode-domain-ping-final-v1062-api-1','midcode-studio-independent-api-1','midcode-image-independent','midcode-video-gateway-allow20261102','octoapi-independent-api-1','octoapi-independent-worker-1']
cs=json.loads(subprocess.check_output(['docker','inspect']+subprocess.check_output(['docker','ps','-q'],text=True).split()));by={c['Name'].lstrip('/'):c for c in cs};out={}
ng=subprocess.run(['docker','exec','1Panel-openresty-0oWm','nginx','-T'],capture_output=True,text=True).stdout
for name in targets:
 c=by[name];ports=[p['HostPort'] for ps in (c['HostConfig']['PortBindings'] or {}).values() for p in ps];ips=[v['IPAddress'] for v in c['NetworkSettings']['Networks'].values() if v.get('IPAddress')];needles=[name]+ips+[':'+p for p in ports];refs=[]
 if any(n in ng for n in needles):refs.append('active nginx configuration')
 for other in cs:
  oname=other['Name'].lstrip('/')
  if oname in targets:continue
  data=json.dumps(other['Config'])
  if any(n in data for n in needles):refs.append(oname+':runtime config')
  for m in other['Mounts']:
   p=pathlib.Path(m['Source'])
   if p.is_file() and p.stat().st_size<2000000:
    data=p.read_text(errors='ignore')
    if any(n in data for n in needles):refs.append(oname+':bound '+p.name)
 connections=[]
 for port in ports:
  lines=subprocess.check_output(['ss','-Htn','state','established','( sport = :'+port+' or dport = :'+port+' )'],text=True)
  if lines.strip():connections.append(port)
 out[name]={'refs':refs,'active_host_ports':connections,'ports':ports}
(base/'cleanup-preflight.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
