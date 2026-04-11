"""Test all OMCS login accounts"""
import paramiko

HOST = "102.203.200.71"
USER = "root"
PASS = "Omcs@2025Secure!"

accounts = [
    ("owner@omcs.com.ly", "Owner@2026!", "Owner"),
    ("manager@omcs.com.ly", "Manager@2026!", "Manager"),
    ("cashier1@omcs.com.ly", "Cashier@2026!", "Cashier 1"),
    ("cashier2@omcs.com.ly", "Cashier@2026!", "Cashier 2"),
    ("cashier3@omcs.com.ly", "Cashier@2026!", "Cashier 3"),
    ("cashier4@omcs.com.ly", "Cashier@2026!", "Cashier 4"),
]

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=30)
    print("[OK] Connected!\n")

    for email, password, name in accounts:
        cmd = f"""curl -s -X POST http://localhost:4000/api/auth/login -H 'Content-Type: application/json' -d '{{"email":"{email}","password":"{password}"}}' """
        stdin, stdout, stderr = ssh.exec_command(cmd, timeout=10)
        out = stdout.read().decode('utf-8', errors='replace')
        
        if "accessToken" in out:
            print(f"  [OK] {name:12s} | {email:28s} | {password}")
        else:
            safe = out.encode('ascii', errors='replace').decode('ascii')
            print(f"  [FAIL] {name:12s} | {email:28s} | {safe[:80]}")

    print("\nAll accounts above are ready to use at http://admin.omcs.com.ly")
    ssh.close()

if __name__ == "__main__":
    main()
