import paramiko

HOST = "102.203.200.71"
USER = "root"
PASS = "Omcs@2025Secure!"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

# Check docker logs (last 50 lines)
stdin, stdout, stderr = ssh.exec_command("docker logs --tail 50 omcs-backend")
print(stdout.read().decode())
