import paramiko

HOST = "102.203.200.71"
USER = "root"
PASS = "Omcs@2025Secure!"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

cmd = "docker exec omcs-db psql -U omcs_user -d omcs -c 'SELECT COUNT(*) FROM \"products\"'"
stdin, stdout, stderr = ssh.exec_command(cmd)
print("Migrated Products so far:")
print(stdout.read().decode())
