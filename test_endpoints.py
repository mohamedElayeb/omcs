import requests
import json

token = "Bearer eyJhbGciOiJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzA0L3htbGRzaWctbW9yZSNobWFjLXNoYTI1NiIsInR5cCI6IkpXVCJ9.eyJVc2VySWQiOiIxIiwiVXNlclJvbGVJZCI6IjMwMDEiLCJVc2VyU3RvcmFnZUlkIjoiMTAwMSIsImV4cCI6MTgwMjk2NTA1NiwiaXNzIjoiaHR0cHM6Ly9zdG9yZS50ZXBvY2xvdGhpbmcubHkiLCJhdWQiOiJodHRwczovL3N0b3JlLnRlcG9jbG90aGluZy5seSJ9.AND40ronM0Jv7SGBWPtaVMiWtMQdg_L3uC6_fDTmz6Q"
headers = {
    "accept": "application/json, text/plain, */*",
    "authorization": token,
}

endpoints_to_test = [
    "https://api.outletmaster.ly/api/stock?pageSize=20&pageNumber=1",
    "https://api.outletmaster.ly/api/inventory?pageSize=20&pageNumber=1",
    "https://api.outletmaster.ly/api/branches/1001/stock",
    "https://api.outletmaster.ly/api/product-stock",
]

for url in endpoints_to_test:
    res = requests.get(url, headers=headers)
    print(f"Testing {url} -> {res.status_code}")
    if res.status_code == 200:
        data = res.json()
        print("KEYS:", data.keys() if isinstance(data, dict) else type(data))
        with open("test_stock_res.json", "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        break
