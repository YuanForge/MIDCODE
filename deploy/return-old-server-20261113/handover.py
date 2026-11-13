"""New-host coordinator: route workbench traffic to old host and move local state once."""
import pathlib,subprocess,json,shlex,sqlite3,time,urllib.request
base=pathlib.Path('/root/fanapi-return-20261113');old=['ssh','-i','/root/fanapi-migration/transfer_key','root@140.150.236.134']
def run(*args):return subprocess.check_output(args,text=True)
assert not run('ss','-Htn','state','established','( sport = :8198 or sport = :8183 )').strip(),'active workbench connections; retry after drain'
for f in pathlib.Path('/opt/midcode-unified-preview-r3/state').glob('*/tasks.sqlite'):
 c=sqlite3.connect('file:'+str(f)+'?mode=ro',uri=True)
 for table in ['tasks','task_items']:
  assert c.execute('select count(*) from '+table).fetchone()[0]==0,'nonempty task history needs state-aware drain review'
 c.close()
unit='''[Unit]
Description=Forward pending-DNS workbench visitors to old origin
After=network-online.target
[Service]
ExecStart=/usr/bin/ssh -N -T -i /root/fanapi-migration/transfer_key -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=10 -o ServerAliveCountMax=6 -L 127.0.0.1:18198:127.0.0.1:8198 -L 127.0.0.1:18183:127.0.0.1:8183 root@140.150.236.134
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
'''
subprocess.run(old+['python3 /root/fanapi-return-20261113/forward_permission.py'],check=True)
pathlib.Path('/etc/systemd/system/fanapi-return-forward.service').write_text(unit);subprocess.run(['systemctl','daemon-reload'],check=True);subprocess.run(['systemctl','enable','--now','fanapi-return-forward'],check=True)
for endpoint in ['http://127.0.0.1:18183/video/','http://127.0.0.1:18198/studio-preview/entry']:
 for attempt in range(10):
  try:
   with urllib.request.urlopen(endpoint,timeout=5) as response:assert response.status==200
   break
  except Exception:
   if attempt==9:raise
   time.sleep(1)
source=pathlib.Path('/etc/caddy/Caddyfile');before=source.read_text();(base/'source-Caddyfile.before').write_text(before)
after=before.replace('127.0.0.1:8198','127.0.0.1:18198').replace('127.0.0.1:8183','127.0.0.1:18183').replace('(proxy_options) {','(proxy_options) {\n lb_try_duration 60s')
(base/'source-Caddyfile.forward').write_text(after)
subprocess.run(['/usr/bin/caddy','validate','--config',str(base/'source-Caddyfile.forward'),'--adapter','caddyfile'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
# Stop the isolated candidates; real users still use the source and old legacy ingress.
subprocess.run(old+['docker stop -t 15 midcode-return-preview-v1088 midcode-video-s3-v1063'],check=True,stdout=subprocess.DEVNULL)
# Retry only connection failures while the single-writer handover is in progress.
subprocess.run(old+["python3 -c "+shlex.quote("from pathlib import Path;p=Path('/root/fanapi-return-20261113/Caddyfile');p.write_text(p.read_text().replace('(proxy_options) {','(proxy_options) {\\n lb_try_duration 60s'))")],check=True)
subprocess.run(old+['/root/fanapi-return-20261113/caddy reload --config /root/fanapi-return-20261113/Caddyfile >/dev/null 2>&1'],check=True)
subprocess.run(old+['python3 /root/fanapi-return-20261113/ingress.py'],check=True)
source.write_text(after);subprocess.run(['systemctl','reload','caddy'],check=True)
names=['midcode-unified-preview-v1072-r3','midcode-video-s3-v1063']+run('docker','ps','--format','{{.Names}}','--filter','label=midcode.video.tenant=true').split()
cs=json.loads(run('docker','inspect',*names));(base/'source-workbenches-private.json').write_text(json.dumps(cs));(base/'source-workbenches-private.json').chmod(0o600)
for name in names:subprocess.run(['systemctl','disable','--now','shared-app@'+name+'.service'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
subprocess.run(['docker','stop','-t','20']+names,check=True,stdout=subprocess.DEVNULL)
for src,dst in [('/opt/midcode-unified-preview-r3/state/',str(base)+'/preview-state/'),('/root/fanapi-migration/video-s3-state/',str(base)+'/video-state/')]:
 subprocess.run(['rsync','-a','-e','ssh -i /root/fanapi-migration/transfer_key',src,'root@140.150.236.134:'+dst],check=True)
subprocess.run(old+['python3 /root/fanapi-return-20261113/handover_old.py'],check=True)
(base/'handover.json').write_text(json.dumps({'source_stopped':names,'state_synced':True,'source_routes_forwarded':True,'time':time.time()}))
print('Workbench handover completed; source DNS visitors forward to old host')
