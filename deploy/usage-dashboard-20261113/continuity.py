"""Bounded origin HTTPS sampling across the main-app cutover."""
import hashlib,http.client,json,socket,ssl,time
from pathlib import Path
rows=[]
for _ in range(80):
    try:
        c=http.client.HTTPSConnection('midcode.cc',timeout=8)
        c.sock=ssl.create_default_context().wrap_socket(socket.create_connection(('127.0.0.1',443),8),server_hostname='midcode.cc')
        c.request('GET','/stats',headers={'Host':'midcode.cc'})
        r=c.getresponse();body=r.read();rows.append({'status':r.status,'sha256':hashlib.sha256(body).hexdigest()});c.close()
    except Exception as e:rows.append({'error':type(e).__name__})
    time.sleep(0.5)
Path('/root/fanapi-usage-v1.0.90/continuity.json').write_text(json.dumps(rows,indent=2))
