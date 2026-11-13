"""Remove only the explicitly audited, drained old-host predecessors; retain volumes/images."""
import json,pathlib,subprocess
b=pathlib.Path('/root/fanapi-return-20261113');audit=json.loads((b/'cleanup-preflight.json').read_text());assert all(not x['refs'] and not x['active_host_ports'] for x in audit.values())
names=list(audit);cs=json.loads(subprocess.check_output(['docker','inspect']+names));f=b/'retired-services-private.json';f.write_text(json.dumps(cs));f.chmod(0o600)
for c in cs:
 ports=[p['HostPort'] for ps in (c['HostConfig'].get('PortBindings') or {}).values() for p in ps]
 if c['HostConfig']['NetworkMode']=='host':ports += [e.split('=',1)[1] for e in c['Config']['Env'] if e.startswith('PORT=')]
 for p in ports:assert not subprocess.check_output(['ss','-Htn','state','established','( sport = :'+p+' or dport = :'+p+' )'],text=True).strip(),'connections not drained'
for name in names:subprocess.run(['systemctl','disable','--now','shared-app@'+name+'.service'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
subprocess.run(['docker','stop','-t','60']+names,check=True,stdout=subprocess.DEVNULL)
subprocess.run(['docker','rm']+names,check=True,stdout=subprocess.DEVNULL)
(b/'cleanup.json').write_text(json.dumps({'removed':names,'volumes_removed':False,'images_removed':False},indent=2))
print(json.dumps({'removed':names,'volumes_removed':False,'images_removed':False}))
