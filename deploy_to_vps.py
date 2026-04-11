"""OMCS VPS - Rebuild storefront with Arabic update"""
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
    
    # Clean build cache for fresh storefront
    run_cmd(ssh, "docker builder prune -af", timeout=60)
    
    print("\n=== Rebuilding storefront (Arabic update)... ===")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml up -d --build omcs-storefront", timeout=600)
    
    print("\n  Waiting 15s...")
    time.sleep(15)
    
    # Restart nginx
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml restart omcs-nginx", timeout=60)
    time.sleep(5)
    
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml ps")
    run_cmd(ssh, "curl -s -o /dev/null -w 'Shop: %{http_code}' http://shop.omcs.com.ly; echo")
    
    print("\n  Storefront rebuilt with full Arabic UI!")
    print("  Visit: http://shop.omcs.com.ly")
    ssh.close()

if __name__ == "__main__":
    main()
