"""OMCS VPS - Rebuild frontend only"""
import paramiko
import time

HOST = "102.203.200.71"
USER = "root"
PASS = "Omcs@2025Secure!"

def run_cmd(ssh, cmd, timeout=300):
    print(f"\n>> {cmd[:120]}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    safe = (out + err).encode('ascii', errors='replace').decode('ascii')
    if safe.strip():
        lines = safe.strip().split('\n')
        if len(lines) > 30:
            print(f"  ... ({len(lines) - 30} lines hidden)")
        for line in lines[-30:]:
            print(f"  {line}")
    exit_code = stdout.channel.recv_exit_status()
    if exit_code != 0:
        print(f"  [WARN] Exit code: {exit_code}")
    else:
        print(f"  [OK]")
    return exit_code, out, err

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=30)
    print("[OK] Connected!")

    # Pull latest
    run_cmd(ssh, "cd /opt/omcs && git pull origin main")
    
    # Prune docker build cache to force clean build of frontend
    run_cmd(ssh, "docker builder prune -f", timeout=60)
    
    # Build frontend
    print("\n=== Building frontend (this may take a few minutes)... ===")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml up -d --build omcs-frontend", timeout=600)
    
    print("  Waiting 15s...")
    time.sleep(15)
    
    # Start nginx
    print("\n=== Starting nginx... ===")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml up -d omcs-nginx", timeout=60)
    
    time.sleep(5)
    
    # Final check
    print("\n=== FINAL STATUS ===")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml ps")
    run_cmd(ssh, "curl -s -o /dev/null -w 'API: %{http_code}' http://localhost:4000/api/docs; echo")
    run_cmd(ssh, "curl -s -o /dev/null -w 'Admin: %{http_code}' http://localhost:4001; echo")
    run_cmd(ssh, "curl -s -o /dev/null -w 'Shop: %{http_code}' http://localhost:4002; echo")
    run_cmd(ssh, "curl -s -o /dev/null -w 'Nginx: %{http_code}' http://localhost:80; echo")
    
    print("\n" + "=" * 60)
    print("  STATUS CHECK COMPLETE")
    print("=" * 60)
    
    ssh.close()

if __name__ == "__main__":
    main()
