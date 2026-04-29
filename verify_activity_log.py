"""Comprehensive Activity Log System Verification"""
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
    exit_code = stdout.channel.recv_exit_status()
    return exit_code, out, err

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=30)
    print("[OK] Connected!\n")

    DB_USER = "omcs_user"
    DB_NAME = "omcs"
    issues = []

    # ═══ 1. Check DB table structure ═══
    print("=" * 60)
    print("1. DATABASE TABLE STRUCTURE")
    print("=" * 60)
    
    code, out, err = run_cmd(ssh, f'''docker exec omcs-db psql -U {DB_USER} -d {DB_NAME} -c "\\d activity_logs"''')
    if 'Did not find' in (out + err) or code != 0:
        issues.append("CRITICAL: activity_logs table does NOT exist!")
        print(f"  [FAIL] Table missing! {err}")
    else:
        print(f"  [OK] Table exists")
        print(out[:1000])
    
    # Check required columns
    code, out, err = run_cmd(ssh, f'''docker exec omcs-db psql -U {DB_USER} -d {DB_NAME} -t -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='activity_logs' ORDER BY ordinal_position;"''')
    columns = [line.strip().split('|')[0].strip() for line in out.strip().split('\n') if '|' in line]
    print(f"  Columns found: {columns}")
    
    required_cols = ['id', 'action', 'description', 'created_at']
    for col in required_cols:
        found = any(col in c for c in columns)
        if not found:
            issues.append(f"CRITICAL: Missing column '{col}' in activity_logs")
            print(f"  [FAIL] Missing column: {col}")
        else:
            print(f"  [OK] Column: {col}")

    # ═══ 2. Check entity matches table ═══
    print("\n" + "=" * 60)
    print("2. ENTITY vs TABLE MATCH")
    print("=" * 60)
    
    # Check entity columns from code
    code, out, err = run_cmd(ssh, "cd /opt/omcs && grep -E '@Column|@PrimaryGenerated|@CreateDate' backend/src/entities/activity-log.entity.ts")
    print(f"  Entity decorators:\n{out}")

    # ═══ 3. Check TypeORM column mapping ═══
    print("=" * 60)
    print("3. TypeORM COLUMN NAME MAPPING")
    print("=" * 60)
    
    # TypeORM auto-converts camelCase to snake_case. Check if table has the right column names
    code, out, err = run_cmd(ssh, f'''docker exec omcs-db psql -U {DB_USER} -d {DB_NAME} -t -c "SELECT column_name FROM information_schema.columns WHERE table_name='activity_logs';"''')
    db_columns = [c.strip() for c in out.strip().split('\n') if c.strip()]
    print(f"  DB columns: {db_columns}")
    
    # TypeORM expects: userId -> userId (since entity doesn't specify name mapping)
    # But our SQL created user_id. Check if this is an issue.
    entity_needs = ['id', 'action', 'entityType', 'entityId', 'description', 'details', 'userId', 'branchId', 'ipAddress', 'createdAt']
    # TypeORM with default naming: camelCase -> camelCase in column unless @Column({ name: '...' })
    # Check the entity for column name mappings
    code, out, err = run_cmd(ssh, "cd /opt/omcs && cat backend/src/entities/activity-log.entity.ts")
    print(f"\n  Entity source:\n{out}")

    # ═══ 4. Check backend errors ═══
    print("=" * 60)
    print("4. BACKEND ERROR CHECK")
    print("=" * 60)
    
    code, out, err = run_cmd(ssh, "docker logs omcs-backend --tail 50 2>&1 | grep -i -E 'error|activity|fail|42P01|42703'")
    if out.strip():
        print(f"  Backend errors found:\n{out}")
        if '42P01' in out:
            issues.append("CRITICAL: Table not found error in backend")
        if '42703' in out:
            issues.append("CRITICAL: Column not found error in backend - likely column name mismatch")
    else:
        print("  [OK] No activity_log errors in recent backend logs")

    # Full backend log tail for context
    code, out, err = run_cmd(ssh, "docker logs omcs-backend --tail 20 2>&1")
    print(f"\n  Recent backend logs:\n{out[:2000]}")

    # ═══ 5. Test activity log write ═══
    print("=" * 60)
    print("5. TEST WRITE TO ACTIVITY LOG")
    print("=" * 60)
    
    # First get a token by logging in
    code, out, err = run_cmd(ssh, '''curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"email":"owner@omcs.com","password":"owner123"}\'''')
    print(f"  Login response: {out[:300]}")
    
    try:
        login_data = json.loads(out)
        token = login_data.get('access_token') or login_data.get('token')
        if token:
            print(f"  [OK] Got token: {token[:30]}...")
            
            # Try to fetch activity logs
            code, out, err = run_cmd(ssh, f'curl -s http://localhost:4000/api/activity-logs -H "Authorization: Bearer {token}"')
            print(f"  Activity log API response: {out[:500]}")
            
            try:
                data = json.loads(out)
                log_count = data.get('pagination', {}).get('total', 0)
                print(f"\n  [INFO] Total logs in DB: {log_count}")
                if data.get('logs') and len(data['logs']) > 0:
                    print(f"  [OK] Logs are being written! Latest entry:")
                    latest = data['logs'][0]
                    print(f"    Action: {latest.get('action')}")
                    print(f"    Description: {latest.get('description')}")
                    print(f"    Created: {latest.get('createdAt')}")
                else:
                    print(f"  [WARN] No logs found yet. Let's check if writing works...")
            except:
                print(f"  [FAIL] Could not parse activity log response")
                issues.append("Activity log API returned invalid JSON")
        else:
            print(f"  [FAIL] No token in login response")
            issues.append("Could not log in to test activity log")
    except:
        print(f"  [FAIL] Login response not valid JSON")
        issues.append("Login failed")

    # ═══ 6. Direct DB check ═══
    print("\n" + "=" * 60)
    print("6. DIRECT DATABASE CHECK")
    print("=" * 60)
    
    code, out, err = run_cmd(ssh, f'docker exec omcs-db psql -U {DB_USER} -d {DB_NAME} -c "SELECT count(*) as total, action, max(created_at) as latest FROM activity_logs GROUP BY action ORDER BY latest DESC;"')
    print(f"  Activity log summary:\n{out}")
    
    # Try inserting a test row directly
    print("  Testing direct INSERT...")
    test_sql = "INSERT INTO activity_logs (action, description, created_at) VALUES ('TEST', 'System verification test', NOW()) RETURNING id, action;"
    code, out, err = run_cmd(ssh, f'docker exec omcs-db psql -U {DB_USER} -d {DB_NAME} -c "{test_sql}"')
    if code == 0 and 'TEST' in out:
        print(f"  [OK] Direct insert works!\n{out}")
        # Clean up test row
        run_cmd(ssh, f'''docker exec omcs-db psql -U {DB_USER} -d {DB_NAME} -c "DELETE FROM activity_logs WHERE action='TEST';"''')
    else:
        print(f"  [FAIL] Direct insert failed: {err}")
        issues.append("Cannot insert into activity_logs table directly")

    # ═══ 7. Check TypeORM column name issue ═══
    print("\n" + "=" * 60)
    print("7. TypeORM NAMING STRATEGY CHECK")
    print("=" * 60)
    
    # The entity uses camelCase (entityType, entityId, userId, branchId, ipAddress, createdAt)
    # But our manual SQL created snake_case (entity_type, entity_id, user_id, branch_id, ip_address, created_at)
    # TypeORM by default does NOT convert camelCase to snake_case unless a naming strategy is configured
    
    code, out, err = run_cmd(ssh, "cd /opt/omcs && grep -rn 'namingStrategy\\|SnakeNaming\\|snake' backend/src/config/database.config.ts")
    if 'naming' in out.lower() or 'snake' in out.lower():
        print(f"  [OK] Custom naming strategy found: {out.strip()}")
    else:
        print(f"  [WARN] No naming strategy configured!")
        print(f"  TypeORM will use camelCase column names by default.")
        print(f"  But our SQL table uses snake_case column names.")
        print(f"  THIS IS LIKELY THE PROBLEM!")
        issues.append("CRITICAL: Column name mismatch - entity uses camelCase but table uses snake_case")
    
    # ═══ SUMMARY ═══
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    if issues:
        print(f"  Found {len(issues)} issue(s):")
        for i, issue in enumerate(issues, 1):
            print(f"    {i}. {issue}")
    else:
        print("  [OK] All checks passed!")
    
    ssh.close()

if __name__ == "__main__":
    main()
