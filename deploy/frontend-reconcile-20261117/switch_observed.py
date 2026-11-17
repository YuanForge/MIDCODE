import subprocess
from pathlib import Path
root=Path('/root/fanapi-frontend-v1.0.101')
with (root/'continuity.log').open('w') as log:
    sampler=subprocess.Popen(['python3',str(root/'continuity.py')],stdout=log,stderr=log)
    try:
        subprocess.run(['python3',str(root/'deploy.py'),'switch'],check=True)
    finally:
        sampler.wait(timeout=240)
        if sampler.returncode:
            raise RuntimeError('Continuity sampling failed; inspect continuity.log')
