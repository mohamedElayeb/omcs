import paramiko
import os
import time
import sys

# Fix encoding crash on Windows Powershell
sys.stdout.reconfigure(encoding='utf-8')

HOST = "102.203.200.71"
USER = "root"
PASS = "Omcs@2025Secure!"

MIGRATION_SRC = r"C:\Users\USER\.gemini\antigravity\scratch\omcs\backend\src\database\run-migrate.ts"

def run_cmd(ssh, cmd):
    print(f"\n>> {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    
    with open("migration_log.txt", "w", encoding="utf-8") as f:
        while not stdout.channel.exit_status_ready():
            if stdout.channel.recv_ready():
                text = stdout.channel.recv(1024).decode('utf-8', errors='replace')
                print(text, end="")
                f.write(text)
            if stderr.channel.recv_stderr_ready():
                text = stderr.channel.recv_stderr(1024).decode('utf-8', errors='replace')
                print(text, end="")
                f.write(text)
            time.sleep(0.1)

        # final read
        while stdout.channel.recv_ready():
            text = stdout.channel.recv(1024).decode('utf-8', errors='replace')
            print(text, end="")
            f.write(text)
        while stderr.channel.recv_stderr_ready():
            text = stderr.channel.recv_stderr(1024).decode('utf-8', errors='replace')
            print(text, end="")
            f.write(text)

    exit_code = stdout.channel.recv_exit_status()
    print(f"\n[Exit Code: {exit_code}]")
    return exit_code

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=30)
    print("[OK] Connected to VPS!")

    print("\nExecuting migration inside backend container (reading from already copied file)...")
    run_cmd(ssh, "docker exec -w /app omcs-backend npx ts-node src/database/run-migrate.ts")

    print("\nMigration Completed!")
    ssh.close()

if __name__ == "__main__":
    main()
