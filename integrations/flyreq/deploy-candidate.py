"""在新业务机启动隔离候选容器；不改现有代理或停止现有业务。"""
import json, os, subprocess
from pathlib import Path

def run(*args):
    """运行部署命令，输入参数列表，返回输出；凭据只保存在私有文件。"""
    return subprocess.check_output(args, text=True)

def env_of(name):
    """读取已运行容器环境，输入名称，返回内部配置映射。"""
    obj=json.loads(run('docker','inspect',name))[0]
    return dict(v.split('=',1) for v in obj['Config']['Env'] if '=' in v)

root=Path('/root/fanapi-migration/unified-candidate')
main=env_of('midcode-retry-v1069-api-1')
image=env_of('midcode-image-s3-v1063')
env={k:v for k,v in image.items() if k.startswith('MEDIA_S3_')}
env.update(TOONFLOW_HANDOFF_SECRET=main['TOONFLOW_HANDOFF_SECRET'],MIDCODE_BACKEND='http://127.0.0.1:8149',MIDCODE_PUBLIC_ORIGIN='https://midcode.cc',MIDCODE_STATE='/state',MIDCODE_TRUST_PROXY='1',MIDCODE_MAX_TENANTS='8',MIDCODE_TENANT_PORT_BASE='22000',PORT='8198',APP_VERSION='v1.0.72')
assert env.get('MEDIA_S3_ENDPOINT') and len(env['TOONFLOW_HANDOFF_SECRET'])>=32
state=Path('/opt/midcode-unified-preview-r3/state');state.mkdir(parents=True,exist_ok=True,mode=0o700)
cfg=root/'candidate.env';cfg.write_text('\n'.join(f'{k}={v}' for k,v in env.items())+'\n');cfg.chmod(0o600)
subprocess.run(['docker','build','-f',str(root/'integrations/flyreq/Dockerfile'),'-t','midcode-unified:preview-v1072-r3',str(root)],check=True)
print(run('docker','run','-d','--name','midcode-unified-preview-v1072-r3','--network','host','--restart','unless-stopped','--memory','1536m','--pids-limit','256','--cap-drop','ALL','--security-opt','no-new-privileges','--env-file',str(cfg),'-v',str(state)+':/state','--log-opt','max-size=5m','--log-opt','max-file=2','midcode-unified:preview-v1072-r3').strip())
