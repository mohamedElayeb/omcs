import requests
import json
import os

token = "Bearer eyJhbGciOiJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzA0L3htbGRzaWctbW9yZSNobWFjLXNoYTI1NiIsInR5cCI6IkpXVCJ9.eyJVc2VySWQiOiIxIiwiVXNlclJvbGVJZCI6IjMwMDEiLCJVc2VyU3RvcmFnZUlkIjoiMTAwMSIsImV4cCI6MTgwMjk2NTA1NiwiaXNzIjoiaHR0cHM6Ly9zdG9yZS50ZXBvY2xvdGhpbmcubHkiLCJhdWQiOiJodHRwczovL3N0b3JlLnRlcG9jbG90aGluZy5seSJ9.AND40ronM0Jv7SGBWPtaVMiWtMQdg_L3uC6_fDTmz6Q"
headers = {
    "accept": "application/json, text/plain, */*",
    "authorization": token,
    "Referer": "https://dash.outletmaster.ly/"
}

print("Fetching product 1245 details...")
res_details = requests.get("https://api.outletmaster.ly/api/products/1245", headers=headers)
if res_details.status_code == 200:
    details = res_details.json()
    with open("old_product_1245.json", "w", encoding="utf-8") as f:
        json.dump(details, f, indent=2, ensure_ascii=False)
    print("Success fetching details.")
else:
    print(f"Failed fetching details: {res_details.status_code}")

print("Checking old_lookups.json...")
with open("old_lookups.json", "r", encoding="utf-8") as f:
    lookups = json.load(f)
if "lookups" in lookups:
    print("Lookup keys:", lookups["lookups"].keys())
