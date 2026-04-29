"""Check and fix activity log on VPS"""
import paramiko
import time

HOST = "102.203.200.71"
USER = "root"
PASS = "Omcs@2025Secure!"

def run_cmd(ssh, cmd, timeout=120):
    print(f"\n>> {cmd[:150]}")
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

    # 1. Check if activity_logs table exists
    print("\n=== Checking database tables ===")
    run_cmd(ssh, """docker exec omcs-db psql -U omcs -d omcs -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" """)
    
    # 2. Check if activity_logs table exists specifically
    print("\n=== Check activity_logs table ===")
    run_cmd(ssh, """docker exec omcs-db psql -U omcs -d omcs -c "SELECT count(*) FROM information_schema.tables WHERE table_name='activity_logs';" """)
    
    # 3. Check TypeORM synchronize setting
    print("\n=== Check TypeORM config ===")
    run_cmd(ssh, "cd /opt/omcs && grep -n synchronize backend/src/app.module.ts")
    
    # 4. Check backend logs for errors
    print("\n=== Backend logs (last 30 lines) ===")
    run_cmd(ssh, "docker logs omcs-backend --tail 30 2>&1")
    
    # 5. Check if ActivityLog entity is in entities index
    print("\n=== Check entity exports ===")
    run_cmd(ssh, "cd /opt/omcs && grep -i activ backend/src/entities/index.ts")
    
    # 6. Check if ActivityLogModule is in app.module
    print("\n=== Check app.module ===")
    run_cmd(ssh, "cd /opt/omcs && grep -i activ backend/src/app.module.ts")
    
    ssh.close()

if __name__ == "__main__":
    main()
