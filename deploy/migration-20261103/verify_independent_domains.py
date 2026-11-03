import ssl,socket,http.client,json,re
from pathlib import Path
s=Path('/etc/caddy/Caddyfile').read_text();hosts=[];out=[]
for l in s.splitlines():
 if l and not l[0].isspace() and l.endswith(' {'):
  hosts.extend(x.strip() for x in l[:-2].split(','))
for host in hosts:
 plain=host.startswith('http://');host=host.removeprefix('http://');port=80 if plain else 443
 c=http.client.HTTPConnection(host,port,timeout=20)
 if not plain:c.sock=ssl.create_default_context().wrap_socket(socket.create_connection(('127.0.0.1',443),20),server_hostname=host)
 else:c.sock=socket.create_connection(('127.0.0.1',80),20)
 c.request('GET','/');r=c.getresponse();body=r.read();out.append({'host':host,'tls_valid':not plain,'status':r.status,'bytes':len(body)});c.close()
assert all(x['status']==200 for x in out),out
Path('/root/fanapi-migration/independent-domain-verification.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
