"""Gracefully route the complete migrated domain set to the local candidate edge."""
import pathlib,re,subprocess,shutil,json
base=pathlib.Path('/root/fanapi-return-20261113');root=pathlib.Path('/opt/1panel/apps/openresty/openresty');conf=root/'conf/conf.d'
names=['api.fanapi.cc','image.midcode.cc','octoapi-main','octoapi-platform','octoapi-assets','maxkim.octoapi.xyz','qianyuan.octoapi.xyz','pipe-code.xyz','testjeff.octoapi.xyz','model.lcgxlm.com','max.octoapi.xyz','8880.hair','o1.octoapi.xyz','model.compute-origin.com','monitor.fanapi.cc']
changed=[]
try:
 for name in names:
  target=conf/(name+'.conf');backup=base/(name+'.conf.before');original=backup.read_bytes() if backup.exists() else (target.read_bytes() if target.exists() else None)
  if original is not None and not backup.exists():backup.write_bytes(original)
  text=original.decode(errors='replace') if original else ''
  domains=list(dict.fromkeys(' '.join(re.findall(r'(?m)^\s*server_name\s+([^;]+);',text)).split())) or ['monitor.fanapi.cc']
  if name=='api.fanapi.cc':domains=[d for d in domains if d!='api.fanapi.cc']
  domain='midcode.cc' if name=='api.fanapi.cc' else domains[0]
  certs=re.findall(r'ssl_certificate\s+([^;]+);',text);keys=re.findall(r'ssl_certificate_key\s+([^;]+);',text)
  original_certs=list(certs);original_keys=list(keys)
  if (base/'certs'/name/'fullchain.pem').exists():
   dst=root/'www/sites'/name/'ssl-return';dst.mkdir(parents=True,exist_ok=True)
   for f in ['fullchain.pem','privkey.pem']:shutil.copy2(base/'certs'/name/f,dst/f)
   certs=['/www/sites/'+name+'/ssl-return/fullchain.pem'];keys=['/www/sites/'+name+'/ssl-return/privkey.pem']
  if name=='monitor.fanapi.cc':
   dst=root/'www/sites/monitor.fanapi.cc/ssl';dst.mkdir(parents=True,exist_ok=True)
   for f in ['fullchain.pem','privkey.pem']:shutil.copy2(base/'certs/monitor.fanapi.cc'/f,dst/f)
   certs=['/www/sites/monitor.fanapi.cc/ssl/fullchain.pem'];keys=['/www/sites/monitor.fanapi.cc/ssl/privkey.pem']
  trust='\n'.join(dict.fromkeys(re.findall(r'set_real_ip_from\s+[^;]+;',text)))
  if not trust:
   trust='\n'.join('set_real_ip_from '+ip+';' for ip in ['103.145.190.198','173.245.48.0/20','103.21.244.0/22','103.22.200.0/22','103.31.4.0/22','141.101.64.0/18','108.162.192.0/18','190.93.240.0/20','188.114.96.0/20','197.234.240.0/22','198.41.128.0/17','162.158.0.0/15','104.16.0.0/13','104.24.0.0/14','172.64.0.0/13','131.0.72.0/22','2400:cb00::/32','2606:4700::/32','2803:f800::/32','2405:b500::/32','2405:8100::/32','2a06:98c0::/29','2c0f:f248::/32'])
  tls=bool(certs);upstream='https://127.0.0.1:18443' if tls else 'http://127.0.0.1:18080'
  new=''
  if name=='api.fanapi.cc':new='map $remote_addr:$http_x_midcode_client_ip $fanapi_return_client_ip { default $remote_addr; ~^151\\.243\\.229\\.212:(.+)$ $1; }\n'
  if tls:new+=f'''server {{ listen 80; server_name {' '.join(domains)}; location ^~ /.well-known/acme-challenge/ {{ root /usr/share/nginx/html; }} location / {{ return 301 https://$host$request_uri; }} }}\n'''
  new+=f'''server {{
 listen {'443 ssl http2' if tls else '80'};
 server_name {' '.join(domains)};
'''
  if tls:new+=f' ssl_certificate {certs[0].strip()};\n ssl_certificate_key {keys[0].strip()};\n ssl_protocols TLSv1.2 TLSv1.3;\n'
  new+=f''' {trust}
 real_ip_header X-Forwarded-For;
 real_ip_recursive on;
 client_max_body_size 256m;
 location / {{
  proxy_pass {upstream};
  proxy_ssl_server_name on;
  proxy_ssl_name {domain};
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $fanapi_return_client_ip;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header X-Midcode-Client-IP $http_x_midcode_client_ip;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection $http_connection;
  proxy_buffering off;
  proxy_request_buffering off;
  proxy_read_timeout 6000s;
  proxy_send_timeout 6000s;
 }}
}}
'''
  if name=='api.fanapi.cc':
   legacy=new[new.index('server {'):].replace('server_name '+' '.join(domains)+';','server_name api.fanapi.cc;').replace(certs[0].strip(),original_certs[0].strip()).replace(keys[0].strip(),original_keys[0].strip()).replace('proxy_set_header Host $host;','proxy_set_header Host midcode.cc;')
   new+=legacy
  changed.append((target,target.read_bytes() if target.exists() else None));target.write_text(new)
 r=subprocess.run(['docker','exec','1Panel-openresty-0oWm','nginx','-t'],capture_output=True,text=True)
 if r.returncode:raise RuntimeError(r.stderr)
 subprocess.run(['docker','exec','1Panel-openresty-0oWm','nginx','-s','reload'],check=True)
except Exception:
 for target,original in changed:
  if original is None:target.unlink(missing_ok=True)
  else:target.write_bytes(original)
 raise
(base/'ingress-switch.json').write_text(json.dumps({'files':names,'graceful_reload':True}))
print('All migrated virtual hosts switched through graceful nginx reload; shop unchanged')
