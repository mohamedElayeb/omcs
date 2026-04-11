"""OMCS VPS Redeployment - Pull fixes and rebuild"""
import paramiko
import time
import sys

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
        # Limit output to last 40 lines to avoid spam
        lines = safe.strip().split('\n')
        if len(lines) > 40:
            print(f"  ... ({len(lines) - 40} lines hidden)")
        for line in lines[-40:]:
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
    print("[OK] Connected to VPS!")

    # 1. Pull latest code
    print("\n=== STEP 1: Pull latest code ===")
    run_cmd(ssh, "cd /opt/omcs && git pull origin main")

    # 2. Fix .env - re-create it with DB_SYNC=true (need tables created first)
    print("\n=== STEP 2: Re-create .env ===")
    _, jwt_out, _ = run_cmd(ssh, "openssl rand -hex 32")
    jwt_secret = jwt_out.strip()
    env = f"""POSTGRES_DB=omcs
POSTGRES_USER=omcs_user
POSTGRES_PASSWORD=OmcsSecure2026Pass!
JWT_SECRET={jwt_secret}
NODE_ENV=production
DB_SYNC=true
CORS_ORIGINS=https://admin.omcs.com.ly,https://shop.omcs.com.ly
BACKEND_PUBLIC_URL=https://api.omcs.com.ly
ADMIN_DOMAIN=admin.omcs.com.ly
STOREFRONT_DOMAIN=shop.omcs.com.ly
API_DOMAIN=api.omcs.com.ly"""
    run_cmd(ssh, f"cat > /opt/omcs/.env << 'EOF'\n{env}\nEOF")

    # 3. Stop everything and clean
    print("\n=== STEP 3: Stop containers and prune ===")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml down -v", timeout=60)
    run_cmd(ssh, "docker system prune -f", timeout=60)

    # 4. Build and start DB first
    print("\n=== STEP 4: Start database ===")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml up -d omcs-db", timeout=60)
    print("  Waiting 15s for DB to be healthy...")
    time.sleep(15)
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml ps")

    # 5. Build backend (should be fast - cached)
    print("\n=== STEP 5: Build + start backend ===")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml up -d --build omcs-backend", timeout=600)
    print("  Waiting 30s for backend to start...")
    time.sleep(30)
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml ps")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml logs --tail=15 omcs-backend")
    
    # 5b. Check backend is actually working
    code, out, _ = run_cmd(ssh, "curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/api/docs")
    if "200" in out:
        print("  [SUCCESS] Backend is running!")
    else:
        print("  [WARN] Backend may still be starting...")
        time.sleep(15)
        run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml logs --tail=20 omcs-backend")

    # 6. Build frontend
    print("\n=== STEP 6: Build + start frontend ===")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml up -d --build omcs-frontend", timeout=600)
    print("  Waiting 10s...")
    time.sleep(10)
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml ps")

    # 7. Build storefront
    print("\n=== STEP 7: Build + start storefront ===")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml up -d --build omcs-storefront", timeout=600)
    print("  Waiting 10s...")
    time.sleep(10)
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml ps")

    # 8. Start nginx
    print("\n=== STEP 8: Start nginx ===")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml up -d omcs-nginx", timeout=60)
    print("  Waiting 5s...")
    time.sleep(5)

    # 9. Seed database
    print("\n=== STEP 9: Seed database ===")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml exec -T omcs-backend node dist/database/reset.js")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml exec -T omcs-backend node dist/database/seed-production.js")

    # 10. Set DB_SYNC=false
    print("\n=== STEP 10: Disable DB_SYNC ===")
    run_cmd(ssh, "sed -i 's/DB_SYNC=true/DB_SYNC=false/' /opt/omcs/.env")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml restart omcs-backend", timeout=60)
    time.sleep(10)

    # Final status
    print("\n=== FINAL STATUS ===")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml ps")
    run_cmd(ssh, "curl -s -o /dev/null -w 'API: %{http_code}' http://localhost:4000/api/docs; echo")

    print("\n" + "=" * 60)
    print("  DEPLOYMENT COMPLETE!")
    print("=" * 60)
    print("\nURLs:")
    print("  Admin:  http://admin.omcs.com.ly")
    print("  Shop:   http://shop.omcs.com.ly")
    print("  API:    http://api.omcs.com.ly/api/docs")
    print("\nAccounts:")
    print("  Owner:   owner@omcs.com.ly / Owner@2026!")
    print("  Manager: manager@omcs.com.ly / Manager@2026!")
    print("  Cashier: cashier1-4@omcs.com.ly / Cashier@2026!")
    print("=" * 60)

    ssh.close()

if __name__ == "__main__":
    main()
