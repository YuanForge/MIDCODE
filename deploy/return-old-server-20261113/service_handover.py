import subprocess,json,pathlib
b=pathlib.Path('/root/fanapi-return-20261113');names=list(json.loads((b/'cleanup-preflight.json').read_text()))
for name in names:
 subprocess.run(['systemctl','disable','--now','shared-app@'+name+'.service'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
remaining=[]
for name in names:
 r=subprocess.run(['docker','inspect',name],capture_output=True,text=True)
 if r.returncode==0:
  c=json.loads(r.stdout)[0]
  if c['State']['Running']:subprocess.run(['docker','stop','-t','60',name],check=True,stdout=subprocess.DEVNULL)
  remaining.append(name)
if remaining:subprocess.run(['docker','rm']+remaining,check=True,stdout=subprocess.DEVNULL)
new=['midcode-refund-v1087-api-1','midcode-studio-refund-v1087-api-1','midcode-image-s3-v1063','midcode-video-s3-v1063','midcode-return-preview-v1088','octoapi-return-v1088-api-1','octoapi-return-v1088-worker-1','observability-api-1','observability-web-1']
for name in new:
 subprocess.run(['docker','update','--restart=no',name],check=True,stdout=subprocess.DEVNULL)
 subprocess.run(['systemctl','enable','--now','shared-app@'+name+'.service'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
result={'removed':names,'new_boot_dependency_services':new,'volumes_removed':False,'images_removed':False}
(b/'cleanup.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
