"""Read account APIs and exercise studio handoffs without paid generation."""
import argparse,base64,hashlib,hmac,http.client,json,pathlib,time,yaml,socket,ssl
from urllib.parse import parse_qs,urlsplit
p=argparse.ArgumentParser();p.add_argument('--video',action='store_true');p.add_argument('--preview',action='store_true');p.add_argument('--https',action='store_true');a=p.parse_args()
cfg=yaml.safe_load(pathlib.Path('/root/fanapi-return-20261113/midcode-independent-api-1.yaml').read_text())
enc=lambda x:base64.urlsafe_b64encode(json.dumps(x,separators=(',',':')).encode()).decode().rstrip('=')
now=int(time.time());data=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':3,'role':'user','group':'default','iat':now,'exp':now+600})
token=data+'.'+base64.urlsafe_b64encode(hmac.new(cfg['server']['jwt_secret'].encode(),data.encode(),hashlib.sha256).digest()).decode().rstrip('=')
def req(port,method,path,body=None,cookie=None,auth=True,origin='https://image.midcode.cc'):
 c=http.client.HTTPConnection('127.0.0.1',port,timeout=90);headers={'Origin':origin,'Host':'midcode.cc','X-Midcode-Client-IP':'203.0.113.7','Content-Type':'application/json'}
 if a.https:
  domain='image.midcode.cc' if port in [8798,8183] else 'midcode.cc'
  c=http.client.HTTPSConnection(domain,timeout=90);c.sock=ssl.create_default_context().wrap_socket(socket.create_connection(('127.0.0.1',443),90),server_hostname=domain);headers['Host']=domain
 if auth:headers['Authorization']='Bearer '+token
 if cookie:headers['Cookie']=cookie
 c.request(method,path,json.dumps(body) if body is not None else None,headers);r=c.getresponse();result=(r.status,r.read(),dict(r.getheaders()));c.close();return result
checks=[]
for path,field in [('/api/user/channels','channels'),('/api/user/model-preferences','preferences')]:
 s,b,_=req(8154,'GET',path);assert s==200 and isinstance(json.loads(b)[field],list),(path,s)
 assert req(8154,'GET',path,auth=False)[0]==401
 checks.append(path+' auth/read')
assert req(8154,'GET','/api/user/stats')[0]==200;checks.append('billing statistics')
items=[('image',8798,{'all_keys':True},'/midcode/exchange')]
if a.video:items.append(('video',8183,{},'/video/exchange'))
if a.preview:items.append(('video',8198,{},'/studio-preview/midcode/exchange'))
for kind,port,data,path in items:
 s,b,_=req(8154,'POST','/api/user/'+kind+'-studio/handoff',data);assert s==200,(kind,s)
 ticket=parse_qs(urlsplit(json.loads(b)['url']).fragment)['midcode_code'][0]
 origin='https://midcode.cc' if port==8198 else 'https://image.midcode.cc'
 s,b,h= req(port,'POST',path,{'token' if port==8183 else 'code':ticket},origin=origin);assert s==200,(port,s,b[:150])
 cookie=h.get('Set-Cookie','').split(';')[0];assert cookie
 if port==8183:
  assert req(port,'GET',json.loads(b)['url'],cookie=cookie)[0]==200
  assert req(port,'GET','/video/u/6/',cookie=cookie)[0]==403
 if port==8198:
  assert req(port,'GET','/studio-preview/midcode/session',cookie=cookie,origin=origin)[0]==200
  assert req(port,'GET','/studio-preview/zh/',cookie=cookie,origin=origin)[0]==200
 checks.append(str(port)+' handoff/session'+('/tenant isolation' if port==8183 else ''))
print(json.dumps({'passed':True,'checks':checks,'paid_generation':False}))
