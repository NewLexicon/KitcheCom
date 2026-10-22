#!/usr/bin/env python3
"""Print an access token for the dev-HA rig (http://localhost:8124, user dev/devdev123).

Dev rig ONLY — these credentials exist nowhere else. Uses HA's login flow, so no
long-lived token has to be clicked together in the UI. If the rig was never
onboarded (fresh .storage), onboard it first: POST /api/onboarding/users with
{client_id, name, username, password, language} — see the cold-open §2.

  TOKEN=$(python3 deploy/homeassistant/dev-token.py)
"""
import json
import os
import urllib.parse
import urllib.request

BASE = os.environ.get("HA_URL", "http://localhost:8124")
CLIENT = BASE + "/"


def post(path, data, form=False):
    body = urllib.parse.urlencode(data).encode() if form else json.dumps(data).encode()
    ctype = "application/x-www-form-urlencoded" if form else "application/json"
    req = urllib.request.Request(BASE + path, body, {"Content-Type": ctype})
    return json.load(urllib.request.urlopen(req))


flow = post("/auth/login_flow", {"client_id": CLIENT, "handler": ["homeassistant", None], "redirect_uri": CLIENT})
step = post("/auth/login_flow/" + flow["flow_id"], {"client_id": CLIENT, "username": "dev", "password": "devdev123"})
if "result" not in step:
    raise SystemExit(f"login failed: {step.get('errors')} — is the rig onboarded with dev/devdev123?")
token = post("/auth/token", {"grant_type": "authorization_code", "code": step["result"], "client_id": CLIENT}, form=True)
print(token["access_token"])
