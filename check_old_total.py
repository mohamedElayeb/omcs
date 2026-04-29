import requests

# Check total products on old app
old_token = "Bearer eyJhbGciOiJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzA0L3htbGRzaWctbW9yZSNobWFjLXNoYTI1NiIsInR5cCI6IkpXVCJ9.eyJVc2VySWQiOiIxIiwiVXNlclJvbGVJZCI6IjMwMDEiLCJVc2VyU3RvcmFnZUlkIjoiMTAwMSIsImV4cCI6MTgwMjk2NTA1NiwiaXNzIjoiaHR0cHM6Ly9zdG9yZS50ZXBvY2xvdGhpbmcubHkiLCJhdWQiOiJodHRwczovL3N0b3JlLnRlcG9jbG90aGluZy5seSJ9.AND40ronM0Jv7SGBWPtaVMiWtMQdg_L3uC6_fDTmz6Q"
old_headers = {"accept": "application/json", "authorization": old_token, "Referer": "https://dash.outletmaster.ly/"}

res = requests.get("https://api.outletmaster.ly/api/products?pageSize=1&pageNumber=1", headers=old_headers)
if res.status_code == 200:
    print("Old App Products Total:", res.json().get('totalItems'))

res2 = requests.get("https://api.outletmaster.ly/api/products/stock?pageSize=1&pageNumber=1", headers=old_headers)
if res2.status_code == 200:
    print("Old App Stock Total:", res2.json().get('totals', {}).get('totalItems'))
