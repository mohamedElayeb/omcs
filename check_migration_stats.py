import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

HOST = "102.203.200.71"
USER = "root"
PASS = "Omcs@2025Secure!"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

queries = [
    ("Products", "SELECT COUNT(*) FROM products"),
    ("Variants", "SELECT COUNT(*) FROM product_variants"),
    ("Inventory Rows", "SELECT COUNT(*) FROM inventory"),
    ("Total Stock (all branches)", "SELECT SUM(quantity) FROM inventory"),
    ("Stock Siyahiya", "SELECT SUM(quantity) FROM inventory WHERE branch_id = (SELECT id FROM branches WHERE name_en ILIKE '%Siyahiya%' LIMIT 1)"),
    ("Stock Nawfaliyeen", "SELECT SUM(quantity) FROM inventory WHERE branch_id = (SELECT id FROM branches WHERE name_en ILIKE '%Nawfaliyeen%' LIMIT 1)"),
    ("Categories", "SELECT COUNT(*) FROM categories"),
]

for label, q in queries:
    cmd = f"docker exec omcs-db psql -U omcs_user -d omcs -t -c \"{q}\""
    stdin, stdout, stderr = ssh.exec_command(cmd)
    result = stdout.read().decode().strip()
    print(f"{label}: {result}")

ssh.close()
