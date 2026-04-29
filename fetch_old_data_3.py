import requests
import json

token = "Bearer eyJhbGciOiJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzA0L3htbGRzaWctbW9yZSNobWFjLXNoYTI1NiIsInR5cCI6IkpXVCJ9.eyJVc2VySWQiOiIxIiwiVXNlclJvbGVJZCI6IjMwMDEiLCJVc2VyU3RvcmFnZUlkIjoiMTAwMSIsImV4cCI6MTgwMjk2NTA1NiwiaXNzIjoiaHR0cHM6Ly9zdG9yZS50ZXBvY2xvdGhpbmcubHkiLCJhdWQiOiJodHRwczovL3N0b3JlLnRlcG9jbG90aGluZy5seSJ9.AND40ronM0Jv7SGBWPtaVMiWtMQdg_L3uC6_fDTmz6Q"
headers = {
    "accept": "application/json, text/plain, */*",
    "authorization": token,
    "Referer": "https://dash.outletmaster.ly/"
}

url = "https://api.outletmaster.ly/api/products/stock?pageSize=20&pageNumber=1"
print(f"Testing {url}...")
res = requests.get(url, headers=headers)
if res.status_code == 200:
    data = res.json()
    with open("old_stock_p1.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("KEYS:", data.keys() if isinstance(data, dict) else type(data))
    if isinstance(data, dict):
        if "stock" in data:
            print("First stock item keys:", data["stock"][0].keys() if len(data["stock"]) > 0 else "Empty")
        elif "products" in data:
            print("First stock item keys:", data["products"][0].keys() if len(data["products"]) > 0 else "Empty")
        if "totalItems" in data:
             print("Total Stock Items:", data["totalItems"])
else:
    print(f"Failed: {res.status_code}")
