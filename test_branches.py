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

# Fetch user to find branches or use /api/settings/branches?
# Our branches API is handled by user service or branch service? 
# In seed, we have Siyahiya and Nawfaliyeen. Let's just fetch all branches by querying the frontend API if exists.
# Wait, /api/branches usually exists. Let's fetch the token decoded.
# Let's see if /api/branches works. 
branches_res = requests.get("http://admin.omcs.com.ly/api/branches", headers=new_headers)
if branches_res.status_code == 404:
    # try /api/users/branches?
    pass

# To be completely safe and skip API lookup for branches, I will just do a tiny PSQL grab via paramiko 
# OR just hit /api/branches and see.
print("Token:", new_token)
