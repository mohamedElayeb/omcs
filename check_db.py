import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('102.203.200.71', username='root', password='Omcs@2025Secure!', timeout=30)
stdin, stdout, stderr = ssh.exec_command('''docker exec omcs-db psql -U omcs_user -d omcs -c "SELECT action, LEFT(description, 60), \\"createdAt\\" FROM activity_logs ORDER BY \\"createdAt\\" DESC LIMIT 10;"''')
out = stdout.read().decode('utf-8', errors='replace').encode('ascii', errors='replace').decode('ascii')
print(out)
ssh.close()
