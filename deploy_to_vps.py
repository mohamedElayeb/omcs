"""OMCS VPS - Set up SSL with Let's Encrypt (Certbot)"""
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

    # 1. Pull latest code (with new nginx config)
    print("\n=== STEP 1: Pull latest code ===")
    run_cmd(ssh, "cd /opt/omcs && git pull origin main")

    # 2. Stop nginx to free port 80 for Certbot
    print("\n=== STEP 2: Stop nginx ===")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml stop omcs-nginx")

    # 3. Install Certbot
    print("\n=== STEP 3: Install Certbot ===")
    run_cmd(ssh, "apt install certbot -y", timeout=120)

    # 4. Get SSL certificates for all 3 subdomains
    print("\n=== STEP 4: Get SSL certificates (Let's Encrypt) ===")
    certbot_cmd = (
        "certbot certonly --standalone --non-interactive --agree-tos "
        "--email admin@omcs.com.ly "
        "-d api.omcs.com.ly "
        "-d admin.omcs.com.ly "
        "-d shop.omcs.com.ly"
    )
    code, out, err = run_cmd(ssh, certbot_cmd, timeout=120)
    
    if code != 0:
        # Maybe port 80 is still in use, try again after killing
        print("  [*] Trying to free port 80...")
        run_cmd(ssh, "fuser -k 80/tcp 2>/dev/null; sleep 2")
        run_cmd(ssh, certbot_cmd, timeout=120)

    # 5. Check certificate files exist
    print("\n=== STEP 5: Check certificates ===")
    run_cmd(ssh, "ls -la /etc/letsencrypt/live/api.omcs.com.ly/")

    # 6. Copy certs to nginx directory
    print("\n=== STEP 6: Copy certs to nginx/certs ===")
    run_cmd(ssh, "mkdir -p /opt/omcs/nginx/certs")
    run_cmd(ssh, "cp /etc/letsencrypt/live/api.omcs.com.ly/fullchain.pem /opt/omcs/nginx/certs/fullchain.pem")
    run_cmd(ssh, "cp /etc/letsencrypt/live/api.omcs.com.ly/privkey.pem /opt/omcs/nginx/certs/privkey.pem")
    run_cmd(ssh, "ls -la /opt/omcs/nginx/certs/")

    # 7. Restart nginx with new config + certs
    print("\n=== STEP 7: Restart nginx with SSL ===")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml up -d omcs-nginx", timeout=60)
    time.sleep(5)

    # 8. Set up auto-renewal cron job
    print("\n=== STEP 8: Set up auto-renewal ===")
    renewal_script = """#!/bin/bash
# Renew Let's Encrypt certs and copy to nginx
certbot renew --quiet
cp /etc/letsencrypt/live/api.omcs.com.ly/fullchain.pem /opt/omcs/nginx/certs/fullchain.pem
cp /etc/letsencrypt/live/api.omcs.com.ly/privkey.pem /opt/omcs/nginx/certs/privkey.pem
cd /opt/omcs && docker compose -f docker-compose.prod.yml restart omcs-nginx
"""
    run_cmd(ssh, f"cat > /opt/omcs/renew-certs.sh << 'EOF'\n{renewal_script}\nEOF")
    run_cmd(ssh, "chmod +x /opt/omcs/renew-certs.sh")
    
    # Add cron job - renew every day at 3am
    run_cmd(ssh, "(crontab -l 2>/dev/null | grep -v renew-certs; echo '0 3 * * * /opt/omcs/renew-certs.sh >> /var/log/certbot-renew.log 2>&1') | crontab -")
    run_cmd(ssh, "crontab -l")

    # 9. Final status check
    print("\n=== FINAL STATUS ===")
    run_cmd(ssh, "cd /opt/omcs && docker compose -f docker-compose.prod.yml ps")
    run_cmd(ssh, "curl -s -o /dev/null -w 'HTTPS API: %{http_code}' https://api.omcs.com.ly/api/docs; echo")
    run_cmd(ssh, "curl -s -o /dev/null -w 'HTTPS Admin: %{http_code}' https://admin.omcs.com.ly; echo")
    run_cmd(ssh, "curl -s -o /dev/null -w 'HTTPS Shop: %{http_code}' https://shop.omcs.com.ly; echo")

    print("\n" + "=" * 60)
    print("  SSL SETUP COMPLETE!")
    print("=" * 60)
    print("\nSecure URLs:")
    print("  Admin:  https://admin.omcs.com.ly")
    print("  Shop:   https://shop.omcs.com.ly")
    print("  API:    https://api.omcs.com.ly/api/docs")
    print("\nCertificates auto-renew every day at 3am")
    print("=" * 60)

    ssh.close()

if __name__ == "__main__":
    main()
