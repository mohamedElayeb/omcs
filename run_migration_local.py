import requests
import json
import time
import sys

sys.stdout.reconfigure(encoding='utf-8')

print("Logging into new system...")
login_res = requests.post("http://admin.omcs.com.ly/api/auth/login", json={
    "email": "owner@omcs.com.ly",
    "password": "Owner@2026!"
})
if login_res.status_code not in [200, 201]:
    exit(1)

new_token = login_res.json().get("accessToken")
new_headers = {"Authorization": f"Bearer {new_token}", "Content-Type": "application/json"}

branches_res = requests.get("http://admin.omcs.com.ly/api/branches", headers=new_headers)
branches = branches_res.json()

if isinstance(branches, dict) and 'data' in branches:
    branches = branches['data']

siyahiya = next((b for b in branches if "Siyahiya" in str(b.get('nameEn', '')) or "السياحية" in str(b.get('name', ''))), None)
nawfaliyeen = next((b for b in branches if "Nawfaliyeen" in str(b.get('nameEn', '')) or "النوفليين" in str(b.get('name', ''))), None)

if not siyahiya or not nawfaliyeen:
    print("Error mapping branches. Branches:", branches)
    exit(1)

print(f"Branch Siyahiya -> {siyahiya['id']}")
print(f"Branch Nawfaliyeen -> {nawfaliyeen['id']}")

# Get and create Categories
categories_res = requests.get("http://admin.omcs.com.ly/api/categories", headers=new_headers)
current_cats = categories_res.json()
if isinstance(current_cats, dict) and 'data' in current_cats:
    current_cats = current_cats['data']

old_token = "Bearer eyJhbGciOiJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzA0L3htbGRzaWctbW9yZSNobWFjLXNoYTI1NiIsInR5cCI6IkpXVCJ9.eyJVc2VySWQiOiIxIiwiVXNlclJvbGVJZCI6IjMwMDEiLCJVc2VyU3RvcmFnZUlkIjoiMTAwMSIsImV4cCI6MTgwMjk2NTA1NiwiaXNzIjoiaHR0cHM6Ly9zdG9yZS50ZXBvY2xvdGhpbmcubHkiLCJhdWQiOiJodHRwczovL3N0b3JlLnRlcG9jbG90aGluZy5seSJ9.AND40ronM0Jv7SGBWPtaVMiWtMQdg_L3uC6_fDTmz6Q"
old_headers = {"accept": "application/json", "authorization": old_token, "Referer": "https://dash.outletmaster.ly/"}

print("\nFetching Categories (Lookups)...")
lk_res = requests.get("https://api.outletmaster.ly/api/lookups", headers=old_headers)
old_cats = [c for c in lk_res.json().get('lookups', []) if c.get('type') == 7]

cat_map = {}
for oc in old_cats:
    label = oc['label']
    existing = next((c for c in current_cats if c.get('name') == label), None)
    if not existing:
        res = requests.post("http://admin.omcs.com.ly/api/categories", json={"name": label, "description": label}, headers=new_headers)
        if res.status_code in [200, 201]:
            existing = res.json()
            current_cats.append(existing)
            print(f"  [+] Created category: {label}")
        else:
            existing = {"id": current_cats[0]['id']} if current_cats else {"id": "1"}
    cat_map[oc['value']] = existing.get('id', existing.get('categoryId'))

# Fetch and Migrate Products
print("\nStarting Product Migration...")

all_old_products = []
print(f"Fetching all stock from old API...")
res = requests.get("https://api.outletmaster.ly/api/products/stock?pageSize=5000&pageNumber=1", headers=old_headers)
if res.status_code == 200:
    data = res.json()
    items = data.get('products', [])
    all_old_products.extend(items)
else:
    print("Failed to fetch.")
    exit(1)

print(f"\nTotal Old Products found: {len(all_old_products)}")

seen_skus = set()
migrated_count = 0
for i, op in enumerate(all_old_products):
    try:
        new_cat_id = cat_map.get(op['category_id'], next(iter(cat_map.values())))
        
        merged = {}
        for ov in op.get('variants', []):
            key = f"{ov['variant_name']}_{ov['price']}_{ov['cost']}"
            if key not in merged:
                merged[key] = {
                    "vData": {
                        "size": ov['variant_name'] or 'Standard',
                        "sku": str(ov['sku'] or f"SKU-{op['product_id']}-{ov['variant_id']}"),
                        "costPrice": float(ov['cost'] or 0),
                        "salePrice": float(ov['price'] or 0),
                        "barcode": str(ov['barcode'] or '').strip()
                    },
                    "branches": { siyahiya['id']: 0, nawfaliyeen['id']: 0 }
                }
            
            b_id = siyahiya['id'] if ov['store_id'] == 1001 else nawfaliyeen['id'] if ov['store_id'] == 1002 else siyahiya['id']
            merged[key]["branches"][b_id] += int(ov['stock'] or 0)
        
        variants_payload = [m['vData'] for m in merged.values()]
        
        # Check SKUs and ensure uniqueness locally
        for idx, v in enumerate(variants_payload):
            base_sku = v['sku']
            if not base_sku: 
                base_sku = f"SKU-U-{op['product_id']}-{idx}"
                
            final_sku = base_sku
            counter = 1
            while final_sku in seen_skus:
                final_sku = f"{base_sku}-{counter}"
                counter += 1
            
            seen_skus.add(final_sku)
            v['sku'] = final_sku
            
            if v['barcode'] == '': del v['barcode']

        initial_stock = {
            "branchId": siyahiya['id'],
            "quantities": {}
        }
        
        for m in merged.values():
             initial_stock["quantities"][m['vData']['sku']] = m['branches'][siyahiya['id']]

        payload = {
            "name": op['product_name'] or 'Untitled',
            "nameAr": op['product_name'] or 'بدون اسم',
            "categoryId": new_cat_id,
            "imageUrl": op.get('image_url') or '',
            "variants": variants_payload,
            "initialStock": initial_stock
        }
        
        res = requests.post("http://admin.omcs.com.ly/api/products", json=payload, headers=new_headers)
        if res.status_code not in [200, 201]:
            print(f"  [X] Failed creating '{op['product_name']}': Status {res.status_code} {res.text}")
            continue

        created_product = res.json()
        
        # Now restock for Nawfaliyeen
        for idx, m in enumerate(merged.values()):
            qty_nawf = m['branches'][nawfaliyeen['id']]
            if qty_nawf > 0:
                try:
                    variant_id = created_product['variants'][idx]['id']
                    requests.post("http://admin.omcs.com.ly/api/inventory/restock", json={
                        "variantId": variant_id,
                        "branchId": nawfaliyeen['id'],
                        "quantity": qty_nawf,
                        "costLydAtPurchase": m['vData']['costPrice']
                    }, headers=new_headers)
                except Exception as e:
                    print(f"  [X] Failed to restock branch for '{op['product_name']}': {e}")

        migrated_count += 1
        if migrated_count % 10 == 0:
            print(f"Migrated {migrated_count} / {len(all_old_products)} : {op['product_name']}")

    except Exception as e:
        print(f"Exception on product: {e}")

print(f"\n🎉 DONE! Migrated {migrated_count} products.")
