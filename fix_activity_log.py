"""Fix activity_logs table + split payment columns on VPS - correct DB credentials"""
import paramiko
import time

HOST = "102.203.200.71"
USER = "root"
PASS = "Omcs@2025Secure!"

def run_cmd(ssh, cmd, timeout=120):
    print(f"\n>> {cmd[:180]}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    safe = (out + err).encode('ascii', errors='replace').decode('ascii')
    if safe.strip():
        lines = safe.strip().split('\n')
        if len(lines) > 20:
            print(f"  ... ({len(lines) - 20} lines hidden)")
        for line in lines[-20:]:
            print(f"  {line}")
    exit_code = stdout.channel.recv_exit_status()
    print(f"  [{'OK' if exit_code == 0 else 'WARN: ' + str(exit_code)}]")
    return exit_code, out, err

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=30)
    print("[OK] Connected!")

    DB_USER = "omcs_user"
    DB_NAME = "omcs"

    # 1. Create activity_logs table
    print("\n=== Creating activity_logs table ===")
    sql = (
        "CREATE TABLE IF NOT EXISTS activity_logs ("
        "id UUID DEFAULT gen_random_uuid() PRIMARY KEY, "
        "action VARCHAR(50) NOT NULL, "
        "entity_type VARCHAR(50), "
        "entity_id VARCHAR(255), "
        "description TEXT, "
        "details JSONB, "
        "user_id UUID, "
        "branch_id UUID, "
        "created_at TIMESTAMP DEFAULT NOW()"
        "); "
        "CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action); "
        "CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at); "
        "CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);"
    )
    run_cmd(ssh, f'docker exec omcs-db psql -U {DB_USER} -d {DB_NAME} -c "{sql}"')

    # 2. Add split payment columns
    print("\n=== Adding split payment columns ===")
    sql2 = (
        "ALTER TABLE sales ADD COLUMN IF NOT EXISTS split_payment_method VARCHAR(20); "
        "ALTER TABLE sales ADD COLUMN IF NOT EXISTS split_payment_amount DECIMAL(12,3);"
    )
    run_cmd(ssh, f'docker exec omcs-db psql -U {DB_USER} -d {DB_NAME} -c "{sql2}"')

    # 3. Verify
    print("\n=== Verify activity_logs ===")
    run_cmd(ssh, f'docker exec omcs-db psql -U {DB_USER} -d {DB_NAME} -c "SELECT count(*) as rows FROM activity_logs;"')
    
    print("\n=== Verify split columns ===")
    run_cmd(ssh, f"""docker exec omcs-db psql -U {DB_USER} -d {DB_NAME} -c "SELECT column_name FROM information_schema.columns WHERE table_name='sales' AND column_name LIKE 'split%';" """)

    # 4. Restart backend
    print("\n=== Restarting backend ===")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml restart omcs-backend", timeout=60)
    time.sleep(10)

    # 5. Test activity log API
    print("\n=== Testing activity log API ===")
    run_cmd(ssh, 'curl -s http://admin.omcs.com.ly/api/activity-logs 2>&1 | head -c 200')

    # 6. Check backend logs
    print("\n=== Backend logs ===")
    run_cmd(ssh, "docker logs omcs-backend --tail 5 2>&1")

    ssh.close()
    print("\nDone!")

if __name__ == "__main__":
    main()
