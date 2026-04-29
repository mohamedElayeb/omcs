"""OMCS VPS - Deploy barcode + scanner features"""
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

    print("\n=== Rebuilding frontend + backend... ===")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml up -d --build omcs-frontend omcs-backend", timeout=600)
    
    print("\n  Waiting 15s...")
    time.sleep(15)
    
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml restart omcs-nginx", timeout=60)
    time.sleep(5)
    
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml ps")
    run_cmd(ssh, "curl -s -o /dev/null -w 'Admin: %{http_code}' http://admin.omcs.com.ly; echo")
    
    print("\n  Barcode + Scanner features deployed!")
    print("  Visit: http://admin.omcs.com.ly/barcodes")
    ssh.close()

if __name__ == "__main__":
    main()
