import subprocess,json
names=['midcode.cc','www.midcode.cc','ai.midcode.cc','origin-hk.midcode.cc','ai.midaccs.com','www.midaccs.com','octoapi.xyz','www.octoapi.xyz','platform.octoapi.xyz','assets.octoapi.xyz','max.octoapi.xyz','maxkim.octoapi.xyz','o1.octoapi.xyz','qianyuan.octoapi.xyz','testjeff.octoapi.xyz','8880.hair','pipe-code.xyz','model.lcgxlm.com','image.midcode.cc','monitor.fanapi.cc']
for n in names:
 r=subprocess.run(['curl','-sS','--max-time','20','--connect-to',n+':443:127.0.0.1:18443','-o','/dev/null','-w','%{http_code}','https://'+n+'/'],capture_output=True,text=True)
 print(n,r.stdout,'TLS_OK' if r.returncode==0 else 'TLS_FAIL');assert r.returncode==0 and r.stdout in ['200','302'],n
r=subprocess.run(['curl','-sS','--max-time','20','-H','Host: model.compute-origin.com','-o','/dev/null','-w','%{http_code}','http://127.0.0.1:18080/'],capture_output=True,text=True);assert r.stdout=='200';print('model.compute-origin.com 200')
