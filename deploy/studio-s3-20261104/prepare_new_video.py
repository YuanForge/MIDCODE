import subprocess,json,os
from pathlib import Path
SSH=['ssh','-i','/root/fanapi-migration/transfer_key','-o','UserKnownHostsFile=/root/fanapi-migration/known_hosts','-o','BatchMode=yes']
def remote(host,cmd):return subprocess.check_output(SSH+['root@'+host,cmd],text=True)
old='140.150.236.134'
row=json.loads(remote(old,'docker inspect midcode-video-gateway-allow20261102'))[0]
state=next(m['Source'] for m in row['Mounts'] if m['Destination']=='/state')
root=Path('/root/fanapi-migration/video-s3-state');root.mkdir(mode=0o700,exist_ok=True)
accounts=remote(old,'cat '+state+'/accounts.json');(root/'accounts.json').write_text(accounts);(root/'accounts.json').chmod(0o600)
private=Path('/root/fanapi-migration/studio-s3-private.json')
cred=json.loads(remote('151.243.229.212',"python3 -c 'import json; print(json.dumps(json.load(open(\"/data/shared-services/seaweedfs/credentials.json\"))[\"studio\"]))'"))
private.write_text(json.dumps({'credentials':cred,'video_config':row['Config']}));private.chmod(0o600)
volumes=json.loads(remote(old,'docker volume inspect midcode-video-user-3 midcode-video-user-6 midcode-video-user-79 midcode-video-user-94 midcode-video-user-306'))
for v in volumes:
 uid=v['Name'].split('-')[-1];dest=Path('/mnt/fanapi-shared/MIDCODE/video')/uid
 dest.mkdir(mode=0o700,parents=True,exist_ok=True)
 subprocess.run(['rsync','-a','--checksum','-e',' '.join(SSH),'root@'+old+':'+v['Mountpoint']+'/',str(dest)+'/'],check=True)
 os.chown(dest,1000,1000)
 print('COPIED_VIDEO_USER',uid)
print('NEW_VIDEO_SNAPSHOT_READY_OLD_UNCHANGED')
