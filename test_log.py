"""Trigger a price update then check if activity log records it"""
import paramiko
import json
import time

HOST = "102.203.200.71"
USER = "root"
PASS = "Omcs@2025Secure!"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)
print("[OK] Connected!")

# Login
cmd = '''curl -s -X POST http://localhost:4000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"owner@omcs.com.ly","password":"Owner@2026!"}\''''
stdin, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode()
data = json.loads(out)
token = data.get('accessToken')
print(f"[OK] Logged in")

# Get first product to find a variant
stdin, stdout, stderr = ssh.exec_command(f'curl -s "http://localhost:4000/api/products?limit=1" -H "Authorization: Bearer {token}"')
out = stdout.read().decode()
products = json.loads(out)

if isinstance(products, list) and len(products) > 0:
    product = products[0]
elif isinstance(products, dict) and products.get('products'):
    product = products['products'][0]
else:
    product = products[0] if isinstance(products, list) else None

if product and product.get('variants'):
    variant = product['variants'][0]
    vid = variant['id']
    old_price = float(variant.get('salePrice', 0))
    new_price = old_price + 5  # bump by 5
    
    print(f"Updating variant {vid}: {old_price} -> {new_price}")
    
    # Update the price
    update_cmd = f'''curl -s -X PATCH "http://localhost:4000/api/variants/{vid}" -H "Authorization: Bearer {token}" -H "Content-Type: application/json" -d '{{"salePrice":{new_price},"reason":"Activity log test"}}\''''
    stdin, stdout, stderr = ssh.exec_command(update_cmd)
    out = stdout.read().decode()
    print(f"Update response: {out[:300]}")
    
    time.sleep(2)
    
    # Revert the price back
    revert_cmd = f'''curl -s -X PATCH "http://localhost:4000/api/variants/{vid}" -H "Authorization: Bearer {token}" -H "Content-Type: application/json" -d '{{"salePrice":{old_price}}}\''''
    stdin, stdout, stderr = ssh.exec_command(revert_cmd)
    out = stdout.read().decode()
    print(f"Revert response: {out[:200]}")
    
    time.sleep(2)
    
    # Check activity log
    stdin, stdout, stderr = ssh.exec_command(f'curl -s "http://localhost:4000/api/activity-logs" -H "Authorization: Bearer {token}"')
    out = stdout.read().decode()
    log_data = json.loads(out)
    print(f"\nActivity Log: total={log_data.get('pagination', {}).get('total', 0)}")
    for log in log_data.get('logs', []):
        print(f"  [{log.get('action')}] {log.get('description', '')[:80]} @ {log.get('createdAt')}")
    
    # Check backend logs for errors
    stdin, stdout, stderr = ssh.exec_command('docker logs omcs-backend --tail 20 2>&1 | grep -i "activity\\|Activity\\|failed\\|error"')
    out = stdout.read().decode('utf-8', errors='replace').encode('ascii', errors='replace').decode('ascii')
    print(f"\nBackend error lines:\n{out}")
    
    # Direct DB check
    stdin, stdout, stderr = ssh.exec_command('docker exec omcs-db psql -U omcs_user -d omcs -c "SELECT * FROM activity_logs ORDER BY \\"createdAt\\" DESC LIMIT 5;"')
    out = stdout.read().decode('utf-8', errors='replace').encode('ascii', errors='replace').decode('ascii')
    print(f"\nDB rows:\n{out}")
else:
    print(f"No products found! Response: {str(products)[:300]}")

ssh.close()
