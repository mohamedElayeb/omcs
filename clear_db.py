import paramiko

HOST = "102.203.200.71"
USER = "root"
PASS = "Omcs@2025Secure!"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

cmd = """
docker exec omcs-db psql -U omcs_user -d omcs -c "
DELETE FROM inventory;
DELETE FROM price_history;
DELETE FROM product_images;
DELETE FROM stock_movements;
DELETE FROM stock_reservations;
DELETE FROM stock_transfers;
DELETE FROM order_items;
DELETE FROM return_items;
DELETE FROM sale_items;
DELETE FROM stock_ledger;
DELETE FROM product_variants;
DELETE FROM products;
DELETE FROM categories;
"
"""
stdin, stdout, stderr = ssh.exec_command(cmd)
print("DB Clear Result:")
print("STDOUT:", stdout.read().decode())
print("STDERR:", stderr.read().decode())
