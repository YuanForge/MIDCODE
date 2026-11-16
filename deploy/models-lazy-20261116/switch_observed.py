import subprocess,time
from pathlib import Path
root=Path('/root/fanapi-lazy-v1.0.96')
with (root/'continuity-launch.txt').open('w') as f:f.write(str(time.time()))
subprocess.Popen(['python3',str(root/'continuity.py')],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
time.sleep(2)
subprocess.run(['python3',str(root/'deploy.py'),'switch'],check=True)
