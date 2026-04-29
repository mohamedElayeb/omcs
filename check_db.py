import requests
import json

res = requests.get("http://api.omcs.com.ly/api/products?pageSize=1")
print(res.status_code)
if res.status_code == 200:
    data = res.json()
    print("KEYS:", data.keys() if isinstance(data, dict) else type(data))
    if isinstance(data, dict):
        if "total" in data: print("Total:", data["total"])
        elif "count" in data: print("Count:", data["count"])
        elif "items" in data: print("Items:", len(data["items"]))
        print(data)
    elif isinstance(data, list):
        print("List length:", len(data))
