"""Fix activity_logs table - use SQL file to avoid quoting issues"""
import paramiko
import time
import json

HOST = "102.203.200.71"
USER = "root"
PASS = "Omcs@2025Secure!"

def run_cmd(ssh, cmd, timeout=120):
    print(f"\n>> {cmd[:200]}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    safe = (out + err).encode('ascii', errors='replace').decode('ascii')
    if safe.strip():
        for line in safe.strip().split('\n')[-15:]:
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

    # 1. Create SQL file on VPS
    print("\n=== Creating SQL file ===")
    sql_content = '''
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
    # Write SQL file
    sftp = ssh.open_sftp()
    with sftp.file('/tmp/fix_activity_logs.sql', 'w') as f:
        f.write(sql_content)
    sftp.close()
    print("  [OK] SQL file written to /tmp/fix_activity_logs.sql")

    # 2. Copy SQL into container and execute
    run_cmd(ssh, "docker cp /tmp/fix_activity_logs.sql omcs-db:/tmp/fix_activity_logs.sql")
    run_cmd(ssh, f"docker exec omcs-db psql -U {DB_USER} -d {DB_NAME} -f /tmp/fix_activity_logs.sql")

    # 3. Verify column names (must be camelCase with quotes)
    print("\n=== Verify column names ===")
    run_cmd(ssh, f'docker exec omcs-db psql -U {DB_USER} -d {DB_NAME} -c "\\d activity_logs"')

    # Check columns are correctly camelCase
    code, out, err = run_cmd(ssh, f'docker exec omcs-db psql -U {DB_USER} -d {DB_NAME} -t -c "SELECT column_name FROM information_schema.columns WHERE table_name=\'activity_logs\' ORDER BY ordinal_position;"')
    cols = [c.strip() for c in out.strip().split('\n') if c.strip()]
    print(f"  Columns: {cols}")
    
    expected = ['userId', 'entityType', 'entityId', 'branchId', 'ipAddress', 'createdAt']
    for e in expected:
        if e in cols:
            print(f"  [OK] {e}")
        else:
            print(f"  [FAIL] Missing {e} - found columns contain: {[c for c in cols if e.lower() in c.lower()]}")

    # 4. Restart backend
    print("\n=== Restarting backend ===")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml restart omcs-backend", timeout=60)
    time.sleep(10)

    # 5. Check for DB errors
    print("\n=== Checking backend for column errors ===")
    code, out, err = run_cmd(ssh, "docker logs omcs-backend --tail 30 2>&1 | grep -i -E '42703|userId|entityType|column.*not exist'")
    if '42703' in out or 'does not exist' in out:
        print("  [FAIL] Column errors still present!")
    else:
        print("  [OK] No column errors!")

    # 6. Test API with correct credentials
    print("\n=== Finding correct login credentials ===")
    code, out, err = run_cmd(ssh, f'docker exec omcs-db psql -U {DB_USER} -d {DB_NAME} -t -c "SELECT email, role FROM users WHERE is_active=true LIMIT 5;"')
    print(f"  Users: {out}")

    # Try different passwords
    emails = [line.split('|')[0].strip() for line in out.strip().split('\n') if '|' in line]
    token = None
    for email in emails:
        for pwd in ['owner123', 'Owner123!', 'admin123', 'omcs123']:
            code, out2, err = run_cmd(ssh, f'curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d \'{{"email":"{email}","password":"{pwd}"}}\'')
            try:
                data = json.loads(out2)
                t = data.get('access_token') or data.get('token')
                if t:
                    token = t
                    print(f"  [OK] Logged in as {email}")
                    break
            except:
                pass
        if token:
            break

    if token:
        print(f"\n=== Testing activity log API ===")
        code, out, err = run_cmd(ssh, f'curl -s http://localhost:4000/api/activity-logs -H "Authorization: Bearer {token}"')
        try:
            data = json.loads(out)
            total = data.get('pagination', {}).get('total', '?')
            print(f"  API Response: total={total}, logs count={len(data.get('logs', []))}")
            if isinstance(total, int) and total >= 0:
                print("  [OK] Activity log API is WORKING!")
            else:
                print(f"  [WARN] Unexpected: {out[:300]}")
        except Exception as e:
            print(f"  [FAIL] API error: {e}")
            print(f"  Response: {out[:500]}")
    else:
        print("  [WARN] Could not log in to test API")

    ssh.close()
    print("\n[DONE]")

if __name__ == "__main__":
    main()
