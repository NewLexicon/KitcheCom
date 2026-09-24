#!/usr/bin/env python3
"""Fake Grocy API served from the local library export, for testing
week-shopping-list.py when the Pi is unreachable.

Serves the same JSON shapes the real API returns on the five endpoints the
generator reads, with a 2-meal plan whose recipes SHARE garlic and olive oil --
the exact case Grocy's own endpoint under-orders.

    python3 deploy/grocy/tools/fixture-server.py &      # MUST run from repo root
    GROCY_URL=http://127.0.0.1:9285 GROCY_KEY=fake \
      python3 deploy/grocy/tools/week-shopping-list.py --days 7
    # expect: Garlic 5.00 Clove, Olive oil 3.00 Tablespoon
    pkill -f fixture-server

This proves the MATH, not the live API. It cannot substitute for one real run.
"""
import json, collections, datetime as dt, http.server, threading, urllib.parse
D=json.load(open('deploy/grocy/seed/grocy-library-export.json'))
def pick(name): return D[name]
# Plan: two recipes that SHARE garlic, on consecutive days.
by_name={r['name'].strip():r for r in D['recipes']}
pos=collections.defaultdict(list)
for row in D['recipes_pos']: pos[row['recipe_id']].append(row)
prod={p['id']:p['name'].strip() for p in D['products']}
garlic=[pid for pid,n in prod.items() if n=='Garlic'][0]
users=[r for r in D['recipes'] if any(x.get('product_id')==garlic for x in pos[r['id']])]
r1,r2=users[0],users[1]
def amt(r):
    return sum(float(x.get('amount') or 0) for x in pos[r['id']] if x.get('product_id')==garlic)
print("CHOSEN:",r1['name'].strip(),amt(r1),"|",r2['name'].strip(),amt(r2),"=> expected total",amt(r1)+amt(r2))
today=dt.date.today()
PLAN=[{"id":1,"type":"recipe","recipe_id":r1['id'],"day":str(today),"recipe_servings":None},
      {"id":2,"type":"recipe","recipe_id":r2['id'],"day":str(today+dt.timedelta(days=1)),"recipe_servings":None}]
ROUTES={"/api/objects/products":D['products'],"/api/objects/quantity_units":D['quantity_units'],
        "/api/objects/recipes":D['recipes'],"/api/objects/recipes_pos":D['recipes_pos'],
        "/api/objects/meal_plan":PLAN}
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def do_GET(self):
        p=urllib.parse.urlparse(self.path).path
        if p in ROUTES:
            b=json.dumps(ROUTES[p]).encode(); self.send_response(200)
            self.send_header("Content-Type","application/json"); self.send_header("Content-Length",str(len(b)))
            self.end_headers(); self.wfile.write(b)
        else: self.send_response(404); self.end_headers()
srv=http.server.HTTPServer(("127.0.0.1",9285),H)
threading.Thread(target=srv.serve_forever,daemon=True).start()
import time; time.sleep(600)
