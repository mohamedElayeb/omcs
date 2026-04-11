"""OMCS VPS - Rebuild frontend with translations update"""
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

    run_cmd(ssh, "cd /opt/omcs && git pull origin main")
    
    # Prune builder cache
    run_cmd(ssh, "docker builder prune -af", timeout=60)
    
    print("\n=== Rebuilding frontend (Admin Panel update)... ===")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml up -d --build omcs-frontend", timeout=600)
    
    print("\n  Waiting 15s...")
    time.sleep(15)
    
    # Restart nginx to make sure new NextJS requests route OK
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml restart omcs-nginx", timeout=60)
    
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml ps")
    run_cmd(ssh, "curl -s -o /dev/null -w 'Admin: %{http_code}' http://admin.omcs.com.ly; echo")
    
    print("\n  Frontend rebuilt with full Arabic UI!")
    print("  Visit: http://admin.omcs.com.ly")
    ssh.close()

if __name__ == "__main__":
    main()
