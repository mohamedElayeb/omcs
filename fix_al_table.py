"""Fix activity_logs table with correct camelCase columns (via SQL file)"""
import paramiko
import time

HOST = "102.203.200.71"
USER = "root"
PASS = "Omcs@2025Secure!"

def run_cmd(ssh, cmd, timeout=300):
    print(f"\n>> {cmd[:160]}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    safe = (out + err).encode('ascii', errors='replace').decode('ascii')
    if safe.strip():
        lines = safe.strip().split('\n')
        if len(lines) > 15:
            print(f"  ... ({len(lines) - 15} lines hidden)")
        for line in lines[-15:]:
            print(f"  {line}")
    exit_code = stdout.channel.recv_exit_status()
    print(f"  [{'OK' if exit_code == 0 else 'WARN: ' + str(exit_code)}]")
    return exit_code, out, err

SQL_CONTENT = '''
DROP TABLE IF EXISTS activity_logs;
CREATE TABLE activity_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    action VARCHAR(50) NOT NULL,
    "entityType" VARCHAR(50),
    "entityId" VARCHAR(255),
    description TEXT,
    details TEXT,
    "userId" UUID,
    "branchId" UUID,
    "ipAddress" VARCHAR(50),
    "createdAt" TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_al_action ON activity_logs(action);
CREATE INDEX idx_al_created ON activity_logs("createdAt");
CREATE INDEX idx_al_user ON activity_logs("userId");
'''

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=30)
    print("[OK] Connected!")

    # Write SQL file
    sftp = ssh.open_sftp()
    with sftp.file('/tmp/fix_al.sql', 'w') as f:
        f.write(SQL_CONTENT)
    sftp.close()

    # Copy into container and execute
    run_cmd(ssh, "docker cp /tmp/fix_al.sql omcs-db:/tmp/fix_al.sql")
    run_cmd(ssh, "docker exec omcs-db psql -U omcs_user -d omcs -f /tmp/fix_al.sql")

    # Verify columns
    run_cmd(ssh, 'docker exec omcs-db psql -U omcs_user -d omcs -t -c "SELECT column_name FROM information_schema.columns WHERE table_name=\'activity_logs\' ORDER BY ordinal_position;"')

    # Restart backend
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml restart omcs-backend", timeout=60)
    time.sleep(10)

    # Check for errors
    run_cmd(ssh, "docker logs omcs-backend --tail 5 2>&1")

    ssh.close()
    print("\n[DONE] activity_logs table recreated with camelCase columns!")

if __name__ == "__main__":
    main()
