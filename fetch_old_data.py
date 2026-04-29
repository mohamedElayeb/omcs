import requests
import json
import os

token = "Bearer eyJhbGciOiJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzA0L3htbGRzaWctbW9yZSNobWFjLXNoYTI1NiIsInR5cCI6IkpXVCJ9.eyJVc2VySWQiOiIxIiwiVXNlclJvbGVJZCI6IjMwMDEiLCJVc2VyU3RvcmFnZUlkIjoiMTAwMSIsImV4cCI6MTgwMjk2NTA1NiwiaXNzIjoiaHR0cHM6Ly9zdG9yZS50ZXBvY2xvdGhpbmcubHkiLCJhdWQiOiJodHRwczovL3N0b3JlLnRlcG9jbG90aGluZy5seSJ9.AND40ronM0Jv7SGBWPtaVMiWtMQdg_L3uC6_fDTmz6Q"
headers = {
    "accept": "application/json, text/plain, */*",
    "authorization": token,
    "Referer": "https://dash.outletmaster.ly/"
}

# Fetch Lookups
print("Fetching lookups...")
res_lookups = requests.get("https://api.outletmaster.ly/api/lookups", headers=headers)
lookups = res_lookups.json()
with open("old_lookups.json", "w", encoding="utf-8") as f:
    json.dump(lookups, f, indent=2, ensure_ascii=False)

# Fetch Products Page 1
print("Fetching products page 1...")
res_products = requests.get("https://api.outletmaster.ly/api/products?pageSize=24&pageNumber=1", headers=headers)
products = res_products.json()
with open("old_products_p1.json", "w", encoding="utf-8") as f:
    json.dump(products, f, indent=2, ensure_ascii=False)

print("Lookups keys:", lookups.keys() if isinstance(lookups, dict) else type(lookups))
if isinstance(products, dict):
    print("Products keys:", products.keys())
    if "data" in products:
        print("First product keys:", products["data"][0].keys() if len(products["data"]) > 0 else "Empty")
        print("Total count check:", products.get("totalCount") or products.get("count"))
    elif "items" in products:
        print("First product keys:", products["items"][0].keys() if len(products["items"]) > 0 else "Empty")
elif isinstance(products, list):
    print("Products is a list. First item keys:", products[0].keys() if len(products) > 0 else "Empty")

print("Done printing basic info.")
