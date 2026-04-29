import paramiko

HOST = "102.203.200.71"
USER = "root"
PASS = "Omcs@2025Secure!"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

# Check table names
stdin, stdout, stderr = ssh.exec_command("docker exec omcs-db psql -U postgres -d omcs -c '\\dt'")
print(stdout.read().decode())
