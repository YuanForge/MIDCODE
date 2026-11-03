import re,shutil,subprocess,json
from pathlib import Path
base=Path('/opt/1panel/apps/openresty/openresty')
out=Path('/etc/fanapi-migration');(out/'conf.d').mkdir(parents=True,exist_ok=True)
cf=['173.245.48.0/20','103.21.244.0/22','103.22.200.0/22','103.31.4.0/22','141.101.64.0/18','108.162.192.0/18','190.93.240.0/20','188.114.96.0/20','197.234.240.0/22','198.41.128.0/17','162.158.0.0/15','104.16.0.0/13','104.24.0.0/14','172.64.0.0/13','131.0.72.0/22','2400:cb00::/32','2606:4700::/32','2803:f800::/32','2405:b500::/32','2405:8100::/32','2a06:98c0::/29','2c0f:f248::/32']
trusted=['127.0.0.1','140.150.236.134']+cf
sites=[];caddy=['{\n auto_https disable_certs\n}\n']
for f in sorted((base/'conf/conf.d').glob('*.conf')):
 raw=f.read_text()
 if f.name in ['00.default.conf','default.conf']: continue
 if f.name=='model.compute-origin.com.conf':
  raw=raw.replace('listen 80','listen 127.0.0.1:8080'); (out/'conf.d'/f.name).write_text(raw); (base/'www/sites/model.compute-origin.com/log').mkdir(parents=True,exist_ok=True)
  caddy.append('http://model.compute-origin.com { reverse_proxy 127.0.0.1:8080 }'); sites.append({'names':['model.compute-origin.com'],'config':f.name,'certificate':None}); continue
 if f.name=='image.midcode.cc.conf': raw=raw[raw.index('server {',raw.index('server {')+1):]
 names=re.search(r'server_name\s+([^;]+);',raw).group(1).split()
 cert=re.search(r'ssl_certificate\s+([^;]+);',raw).group(1).strip();key=re.search(r'ssl_certificate_key\s+([^;]+);',raw).group(1).strip()
 dest=Path('/etc/caddy/certs')/f.stem;dest.mkdir(parents=True,exist_ok=True)
 for source,fn in [(cert,'fullchain.pem'),(key,'privkey.pem')]:
  shutil.copy2(base/source.removeprefix('/'),dest/fn)
  subprocess.run(['chown','root:caddy',str(dest/fn)],check=True);(dest/fn).chmod(0o640)
 raw=re.sub(r'if\s*\(\$scheme\s*=\s*http\)\s*\{[^}]*\}','',raw)
 raw=re.sub(r'^\s*listen\s+[^;]+;','',raw,flags=re.M)
 raw=re.sub(r'^\s*(?:ssl_\w+|error_page\s+497|real_ip_header|set_real_ip_from|real_ip_recursive)\s+[^;]+;','',raw,flags=re.M)
 raw=raw.replace('server {','server {\n listen 127.0.0.1:8080;\n real_ip_header X-Forwarded-For;\n real_ip_recursive on;\n'+''.join(' set_real_ip_from '+a+';\n' for a in trusted),1)
 raw=raw.replace('http://140.150.236.134:8140','http://127.0.0.1:8140').replace('X-Forwarded-Proto $scheme','X-Forwarded-Proto https')
 # Video previously scoped real-IP handling in its location. Use the sanitized server-level XFF chain.
 raw=raw.replace('X-Forwarded-Port $server_port','X-Forwarded-Port 443')
 (out/'conf.d'/f.name).write_text(raw)
 for log in re.findall(r'(?:access_log|error_log)\s+(/www/[^;\s]+)',raw): (base/Path(log).relative_to('/')).parent.mkdir(parents=True,exist_ok=True)
 caddy.append(', '.join(names)+' {\n tls '+str(dest/'fullchain.pem')+' '+str(dest/'privkey.pem')+'\n reverse_proxy 127.0.0.1:8080 {\n  trusted_proxies '+' '.join(trusted)+'\n  flush_interval -1\n  lb_try_duration 60s\n  transport http {\n   dial_timeout 3s\n   response_header_timeout 6000s\n  }\n }\n}\n')
 sites.append({'names':names,'config':f.name,'certificate':str(dest/'fullchain.pem')})
# Included application proxy fragments need the external HTTPS scheme as well.
for f in (base/'www/sites').glob('*/proxy/*.conf'):
 s=f.read_text();f.write_text(s.replace('X-Forwarded-Proto $scheme','X-Forwarded-Proto https').replace('X-Forwarded-Port $server_port','X-Forwarded-Port 443'))
(out/'nginx.conf').write_text('worker_processes auto;\npid /tmp/nginx.pid;\nevents { worker_connections 8192; }\nhttp {\n include /usr/local/openresty/nginx/conf/mime.types;\n default_type application/octet-stream;\n log_format main \'$remote_addr - $host [$time_local] "$request" $status $body_bytes_sent\';\n sendfile on;\n keepalive_timeout 65;\n client_max_body_size 100m;\n include /etc/migration-conf/*.conf;\n}\n')
Path('/etc/caddy/Caddyfile').write_text('\n'.join(caddy))
Path('/root/fanapi-migration/sites.json').write_text(json.dumps(sites,indent=2))
subprocess.run(['caddy','fmt','--overwrite','/etc/caddy/Caddyfile'],check=True)
subprocess.run(['caddy','validate','--config','/etc/caddy/Caddyfile'],check=True)
print('PROXY_CONFIG_READY',len(sites),sum(len(x['names']) for x in sites))
