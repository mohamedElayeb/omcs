import requests
import json
import time

# 1. Login to new system
print("Logging into new system...")
login_res = requests.post("http://admin.omcs.com.ly/api/auth/login", json={
    "email": "owner@omcs.com.ly",
    "password": "Owner@2026!"
})
if login_res.status_code != 201 and login_res.status_code != 200:
    print("Failed to login to new system:", login_res.text)
    exit(1)

new_token = login_res.json().get("access_token")
new_headers = {"Authorization": f"Bearer {new_token}", "Content-Type": "application/json"}
print("Logged in successfully.")

# Get branches from new system
branches_res = requests.get("http://admin.omcs.com.ly/api/settings/branches", headers=new_headers)
branches = branches_res.json()
siyahiya = next((b for b in branches if "Siyahiya" in b['nameEn'] or "السياحية" in b['name']), None)
nawfaliyeen = next((b for b in branches if "Nawfaliyeen" in b['nameEn'] or "النوفليين" in b['name']), None)
if not siyahiya or not nawfaliyeen:
    print("Error: Could not find mapping for branches.")
    exit(1)

print(f"Branch mapping: Siyahiya={siyahiya['id']}, Nawfaliyeen={nawfaliyeen['id']}")

# Get categories
categories_res = requests.get("http://admin.omcs.com.ly/api/categories", headers=new_headers)
current_cats = categories_res.json()

# Set up old API
old_token = "Bearer eyJhbGciOiJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzA0L3htbGRzaWctbW9yZSNobWFjLXNoYTI1NiIsInR5cCI6IkpXVCJ9.eyJVc2VySWQiOiIxIiwiVXNlclJvbGVJZCI6IjMwMDEiLCJVc2VyU3RvcmFnZUlkIjoiMTAwMSIsImV4cCI6MTgwMjk2NTA1NiwiaXNzIjoiaHR0cHM6Ly9zdG9yZS50ZXBvY2xvdGhpbmcubHkiLCJhdWQiOiJodHRwczovL3N0b3JlLnRlcG9jbG90aGluZy5seSJ9.AND40ronM0Jv7SGBWPtaVMiWtMQdg_L3uC6_fDTmz6Q"
old_headers = {"accept": "application/json", "authorization": old_token, "Referer": "https://dash.outletmaster.ly/"}

print("Fetching old lookups (Categories)...")
lk_res = requests.get("https://api.outletmaster.ly/api/lookups", headers=old_headers)
old_lookups = lk_res.json().get('lookups', [])
old_cats = [c for c in old_lookups if c.get('type') == 7]

cat_map = {}
for oc in old_cats:
    label = oc['label']
    existing = next((c for c in current_cats if c['name'] == label), None)
    if not existing:
        res = requests.post("http://admin.omcs.com.ly/api/categories", json={"name": label, "description": label}, headers=new_headers)
        if res.status_code in [200, 201]:
            existing = res.json()
            current_cats.append(existing)
            print(f"Created category: {label}")
        else:
            existing = current_cats[0] # fallback
    cat_map[oc['value']] = existing['id']

print("Fetching old products (Page 1)...")
# We will do only PAGE 1 as a test (20 items)
stock_res = requests.get("https://api.outletmaster.ly/api/products/stock?pageSize=20&pageNumber=1", headers=old_headers)
items = stock_res.json().get('products', [])
print(f"Got {len(items)} items to migrate from Page 1.")

migrated = 0
for op in items:
    cat_id = cat_map.get(op['category_id'], cat_map[list(cat_map.keys())[0]])
    
    # Process variants
    merged = {}
    if 'variants' in op and op['variants']:
        for ov in op['variants']:
            key = f"{ov['variant_name']}_{ov['price']}_{ov['cost']}"
            if key not in merged:
                merged[key] = {
                    "vData": {
                        "size": ov['variant_name'],
                        "color": "",
                        "sku": str(ov['sku'] or ''),
                        "costPrice": float(ov['cost'] or 0),
                        "salePrice": float(ov['price'] or 0),
                        "barcode": str(ov['barcode'] or '').strip()
                    },
                    "branches": {}
                }
            br_id = siyahiya['id'] if ov['store_id'] == 1001 else nawfaliyeen['id'] if ov['store_id'] == 1002 else siyahiya['id']
            merged[key]["branches"][br_id] = (merged[key]["branches"].get(br_id) or 0) + (ov['stock'] or 0)
    
    # New backend API allows initialStock { branchId, quantities } for ONLY ONE branch.
    # What if we have multiple branches?
    # Better to create variant by variant?
    # Our API: POST /api/products
    # Does backend allow multiple branches? No, only one. But we can just use 1 branch as `initialStock` and then update the rest. Or let the API just create the variants, and we update stock later via POS? No, we need inventory.
    
    # Wait, our products Service creates inventory batch for the specified branch.
    # I can just call POST /api/products without initialStock, then call a stock update endpoint?
    # We do not have a public stock-update endpoint except transfers or POS!
    # Ah! The backend POST /api/products ONLY does `initialStock?.branchId`.
    pass
