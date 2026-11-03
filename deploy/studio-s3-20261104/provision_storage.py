import json,secrets,subprocess,os
from pathlib import Path
root=Path('/data/shared-services/seaweedfs');root.mkdir(exist_ok=True)
private=root/'credentials.json'
if not private.exists():
 values={name:{'accessKey':secrets.token_hex(12),'secretKey':secrets.token_urlsafe(36)} for name in ['admin','studio']}
 private.write_text(json.dumps(values));private.chmod(0o600)
values=json.loads(private.read_text())
auth={'identities':[{'name':'administrator','credentials':[values['admin']],'actions':['Admin','Read','Write','List','Tagging']},{'name':'studio-media','credentials':[values['studio']],'actions':['Read:midcode-media','Write:midcode-media','List:midcode-media']}]}
(root/'s3.json').write_text(json.dumps(auth));(root/'s3.json').chmod(0o600)
(root/'store').mkdir(exist_ok=True)
unit='''[Unit]
Description=MIDCODE private SeaweedFS S3
After=network-online.target
Wants=network-online.target
RequiresMountsFor=/data
[Service]
WorkingDirectory=/data/shared-services/seaweedfs
ExecStart=/data/shared-services/seaweedfs/weed mini -dir=/data/shared-services/seaweedfs/store -ip=127.0.0.1 -ip.bind=127.0.0.1 -s3.config=/data/shared-services/seaweedfs/s3.json -s3.externalUrl=https://s3.fanapi.cc -s3.port.iceberg=0 -s3.port.lance=0 -s3.iam=false -admin.ui=false -webdav=false -master.volumeSizeLimitMB=1024 -volume.max=70 -s3.concurrentFileUploadLimit=4 -s3.concurrentUploadLimitMB=128 -s3.readerCacheSizeMB=32 -filer.concurrentFileUploadLimit=4 -filer.concurrentUploadLimitMB=128 -filer.disableDirListing
Restart=on-failure
RestartSec=5
MemoryHigh=768M
MemoryMax=1200M
Environment=GOMEMLIMIT=700MiB
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/data/shared-services/seaweedfs
[Install]
WantedBy=multi-user.target
'''
Path('/etc/systemd/system/seaweedfs.service').write_text(unit)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','seaweedfs'],check=True)
caddy=Path('/etc/caddy/Caddyfile')
backup=root/'Caddyfile.before';
if not backup.exists():backup.write_bytes(caddy.read_bytes())
candidate=root/'Caddyfile'
candidate.write_text('''s3.fanapi.cc {
    header X-Content-Type-Options nosniff
    header Referrer-Policy no-referrer
    reverse_proxy 127.0.0.1:8333 {
        transport http {
            response_header_timeout 300s
        }
    }
}
''')
subprocess.run(['caddy','validate','--config',str(candidate),'--adapter','caddyfile'],check=True)
caddy.write_bytes(candidate.read_bytes())
subprocess.run(['systemctl','reload','caddy'],check=True)
print('SEAWEED_CONFIGURED_PRIVATE')
