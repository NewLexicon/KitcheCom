#!/usr/bin/env python3
"""Prove the Kroger OAuth flows before writing any integration code.

Usage:
  export KROGER_CLIENT_ID=...      # from https://developer.kroger.com
  export KROGER_CLIENT_SECRET=...

  python3 kroger_auth.py client        # clientCredentials -> Products API
  python3 kroger_auth.py search milk    # search products (needs `client` to work first)
  python3 kroger_auth.py authorize      # print the cart consent URL to open in a browser
  python3 kroger_auth.py exchange CODE  # swap the ?code= for tokens; REPORTS REFRESH TOKEN TTL
  python3 kroger_auth.py refresh TOKEN  # prove a refresh token actually works

Nothing here writes to a cart. `exchange` and `refresh` are the important ones:
the cart specs declare NO refreshUrl, so whether refresh works at all is the
single biggest unknown in this project.
"""
import base64, json, os, sys, urllib.parse, urllib.request, gzip, io

TOKEN_URL = "https://api.kroger.com/v1/connect/oauth2/token"
AUTH_URL = "https://api.kroger.com/v1/connect/oauth2/authorize"
API = "https://api.kroger.com"
# Must EXACTLY match the redirect URI registered on the Kroger app.
REDIRECT = os.environ.get("KROGER_REDIRECT_URI", "http://localhost:8080/callback")


def _creds():
    cid = os.environ.get("KROGER_CLIENT_ID")
    sec = os.environ.get("KROGER_CLIENT_SECRET")
    if not cid or not sec:
        sys.exit("Set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET first.")
    return cid, sec


def _post(url, data, auth=None):
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("Accept-Encoding", "gzip")
    if auth:
        req.add_header("Authorization", "Basic " + base64.b64encode(
            f"{auth[0]}:{auth[1]}".encode()).decode())
    return _read(req)


def _read(req):
    try:
        r = urllib.request.urlopen(req, timeout=30)
        raw, code = r.read(), r.status
        if r.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
    except urllib.error.HTTPError as e:
        raw, code = e.read(), e.code
        try:
            raw = gzip.decompress(raw)
        except Exception:
            pass
    try:
        return code, json.loads(raw)
    except Exception:
        return code, raw.decode(errors="replace")[:400]


def cmd_client():
    """clientCredentials — Products API. No user login."""
    code, body = _post(TOKEN_URL,
                       {"grant_type": "client_credentials", "scope": "product.compact"},
                       auth=_creds())
    print(f"HTTP {code}")
    if code == 200:
        print(f"  access_token : {body.get('access_token','')[:28]}...")
        print(f"  expires_in   : {body.get('expires_in')} s "
              f"(~{round(body.get('expires_in',0)/60)} min)")
        print(f"  refresh_token: {'YES' if body.get('refresh_token') else 'NO (expected — just re-request)'}")
        open(".kroger_client_token", "w").write(body.get("access_token", ""))
        print("  saved -> .kroger_client_token")
    else:
        print(" ", body)


def cmd_search(term):
    tok = open(".kroger_client_token").read().strip()
    q = urllib.parse.urlencode({"filter.term": term, "filter.limit": 5})
    req = urllib.request.Request(f"{API}/v1/products?{q}")
    req.add_header("Authorization", f"Bearer {tok}")
    req.add_header("Accept-Encoding", "gzip")
    code, body = _read(req)
    print(f"HTTP {code}")
    for p in (body.get("data") or [])[:5]:
        items = (p.get("items") or [{}])[0]
        price = (items.get("price") or {}).get("regular")
        print(f"  {p.get('upc','?'):16} {str(p.get('description'))[:42]:44} "
              f"{str(items.get('size',''))[:10]:12} ${price}")


def cmd_authorize():
    cid, _ = _creds()
    q = urllib.parse.urlencode({
        "client_id": cid, "redirect_uri": REDIRECT,
        "response_type": "code", "scope": "cart.basic:write"})
    print("Open this in a browser, log in, and approve:\n")
    print(f"  {AUTH_URL}?{q}\n")
    print(f"You'll be redirected to {REDIRECT}?code=XXXX (the page may fail to load —")
    print("that's fine, the code is in the URL bar). Then run:\n")
    print("  python3 kroger_auth.py exchange XXXX")


def cmd_exchange(code_):
    code, body = _post(TOKEN_URL,
                       {"grant_type": "authorization_code", "code": code_,
                        "redirect_uri": REDIRECT}, auth=_creds())
    print(f"HTTP {code}")
    if code == 200:
        exp, rt = body.get("expires_in"), body.get("refresh_token")
        print(f"  access_token : {body.get('access_token','')[:28]}...")
        print(f"  expires_in   : {exp} s (~{round(exp/60)} min)")
        print(f"  refresh_token: {'PRESENT' if rt else 'ABSENT'}")
        if rt:
            open(".kroger_refresh_token", "w").write(rt)
            print("  saved -> .kroger_refresh_token")
            print("\n  >>> NOW RUN `refresh` TO PROVE IT WORKS. That is the key unknown. <<<")
        else:
            print("\n  >>> NO REFRESH TOKEN. Re-consent would be needed every "
                  f"~{round(exp/60)} min. That changes the design. <<<")
    else:
        print(" ", body)


def cmd_refresh(tok=None):
    tok = tok or open(".kroger_refresh_token").read().strip()
    code, body = _post(TOKEN_URL,
                       {"grant_type": "refresh_token", "refresh_token": tok}, auth=_creds())
    print(f"HTTP {code}")
    if code == 200:
        print(f"  REFRESH WORKS. new access_token: {body.get('access_token','')[:28]}...")
        print(f"  expires_in   : {body.get('expires_in')} s")
        new = body.get("refresh_token")
        print(f"  new refresh_token: {'yes (rotating)' if new else 'no (reusable)'}")
        if new:
            open(".kroger_refresh_token", "w").write(new)
    else:
        print("  REFRESH FAILED —", body)


if __name__ == "__main__":
    a = sys.argv[1:] or ["--help"]
    cmds = {"client": cmd_client, "search": cmd_search, "authorize": cmd_authorize,
            "exchange": cmd_exchange, "refresh": cmd_refresh}
    if a[0] not in cmds:
        print(__doc__)
    else:
        cmds[a[0]](*a[1:])
