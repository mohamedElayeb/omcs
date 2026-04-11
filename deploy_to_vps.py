"""Debug VPS Docker issues"""
import paramiko
import sys

HOST = "102.203.200.71"
USER = "root"
PASS = "Omcs@2025Secure!"

def run_cmd(ssh, cmd, timeout=300):
    print(f"\n>> {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    safe = (out + err).encode('ascii', errors='replace').decode('ascii')
    if safe.strip():
        print(safe)
    return stdout.channel.recv_exit_status(), out, err

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=30)
    print("[OK] Connected!")

    # Check what docker images exist
    run_cmd(ssh, "docker images")
    
    # Check container logs for failures
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml ps -a")
    
    # Check if Dockerfiles exist
    run_cmd(ssh, "ls -la /opt/omcs/backend/Dockerfile /opt/omcs/frontend/Dockerfile /opt/omcs/storefront/Dockerfile 2>&1")
    
    # Try to bring up just DB first
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml up -d omcs-db 2>&1 | tail -10", timeout=120)
    
    import time
    print("\n[*] Waiting 10s for DB...")
    time.sleep(10)
    
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml ps")
    
    # Try building backend
    print("\n[*] Building backend...")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml build omcs-backend 2>&1 | tail -30", timeout=600)
    
    # Start backend
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml up -d omcs-backend 2>&1 | tail -10", timeout=60)
    
    print("\n[*] Waiting 10s...")
    time.sleep(10)
    
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml ps")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml logs --tail=50 omcs-backend 2>&1 | tail -50")
    
    # Build frontend
    print("\n[*] Building frontend...")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml build omcs-frontend 2>&1 | tail -30", timeout=600)
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml up -d omcs-frontend 2>&1 | tail -10", timeout=60)
    
    # Build storefront
    print("\n[*] Building storefront...")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml build omcs-storefront 2>&1 | tail -30", timeout=600)
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml up -d omcs-storefront 2>&1 | tail -10", timeout=60)
    
    # Start nginx
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml up -d omcs-nginx 2>&1 | tail -10", timeout=60)
    
    print("\n[*] Waiting 15s for everything to start...")
    time.sleep(15)
    
    # Final check
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml ps")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml logs --tail=10 2>&1 | tail -40")
    
    ssh.close()

if __name__ == "__main__":
    main()
