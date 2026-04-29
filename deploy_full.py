"""OMCS VPS - Full deploy with DB fix for activity_logs"""
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

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=30)
    print("[OK] Connected!")

    # 1. Force pull latest
    run_cmd(ssh, "cd /opt/omcs && git fetch origin main && git reset --hard origin/main")
    run_cmd(ssh, "cd /opt/omcs && git log --oneline -3")

    # 2. No DB fixes needed — activity_logs table already has correct camelCase columns

    # 3. Rebuild both frontend + backend
    print("\n=== Rebuilding ===")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml up -d --build omcs-frontend omcs-backend", timeout=600)
    
    print("\n  Waiting 15s...")
    time.sleep(15)
    
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml restart omcs-nginx", timeout=60)
    time.sleep(5)
    
    # 4. Verify
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml ps")
    run_cmd(ssh, "docker logs omcs-backend --tail 5 2>&1")
    run_cmd(ssh, "curl -s -o /dev/null -w 'Admin: %{http_code}' http://admin.omcs.com.ly; echo")
    
    # 5. Test activity log count
    run_cmd(ssh, 'docker exec omcs-db psql -U omcs_user -d omcs -c "SELECT count(*) FROM activity_logs;"')
    
    print("\n  Activity log + Orders logging deployed!")
    ssh.close()

if __name__ == "__main__":
    main()
