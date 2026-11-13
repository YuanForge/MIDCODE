import pathlib,subprocess
p=pathlib.Path('/etc/ssh/sshd_config.d/00-00-fanapi-return-forward.conf')
p.write_text('Match User root Address 103.145.190.198\n    AllowTcpForwarding yes\n    PermitOpen 127.0.0.1:8183 127.0.0.1:8198\nMatch all\n')
subprocess.run(['sshd','-t'],check=True)
s=subprocess.check_output(['sshd','-T','-C','user=root,addr=103.145.190.198,host=103.145.190.198'],text=True)
assert 'allowtcpforwarding yes' in s and 'permitopen 127.0.0.1:8183 127.0.0.1:8198' in s
subprocess.run(['systemctl','reload','ssh'],check=True)
print('Enabled destination forwards only from the source root connection and only to the two workbench loopback ports')
