#!/usr/bin/env python3
"""
Replay the KitchenCOM Grocy library (recipes, products, units, conversions)
onto a target Grocy 4.6.0 instance from grocy-library-export.json.

Usage:
  GROCY_URL=http://localhost:9284 GROCY_KEY=xxxx python3 import-grocy-library.py [--dry-run]

The Pi's real Grocy is http://192.168.1.234:9283 (key = `grocy_api_key` in
homeassistant/secrets.yaml). IDs from the export are remapped by NAME on the
target, so existing products/units are reused, not duplicated.
DOES NOT import meal_plan or shopping_list — those are live household data.
"""
import json,os,sys,urllib.request
URL=os.environ.get("GROCY_URL","http://localhost:9284").rstrip("/")
KEY=os.environ["GROCY_KEY"]
DRY="--dry-run" in sys.argv
HERE=os.path.dirname(os.path.abspath(__file__))
EXP=json.load(open(os.path.join(HERE,"grocy-library-export.json")))

def call(m,path,d=None):
    r=urllib.request.Request(URL+"/api"+path,method=m,
        headers={"GROCY-API-KEY":KEY,"Content-Type":"application/json"},
        data=json.dumps(d).encode() if d else None)
    try:
        with urllib.request.urlopen(r,timeout=25) as x:
            b=x.read().decode(); return x.status,(json.loads(b) if b.strip() else None)
    except urllib.error.HTTPError as e: return e.code,e.read().decode()[:250]
def get(path): return json.load(urllib.request.urlopen(
    urllib.request.Request(URL+"/api"+path,headers={"GROCY-API-KEY":KEY}),timeout=25))

def ensure(collection, name_key, obj, extra_match=None):
    """Return target id for obj, creating if absent (matched by name_key)."""
    existing={str(e[name_key]).strip().lower():int(e['id']) for e in get(f"/objects/{collection}")}
    key=str(obj[name_key]).strip().lower()
    if key in existing: return existing[key], False
    if DRY: return -1, True
    payload={k:v for k,v in obj.items() if k not in ("id","row_created_timestamp")}
    s,r=call("POST",f"/objects/{collection}",payload)
    if s!=200: print(f"  ! create {collection} {obj[name_key]}: {s} {r}"); return None,False
    return int(r['created_object_id']), True

print(f"Target: {URL}  {'(DRY RUN)' if DRY else ''}")
sysinfo=get("/system/info"); print("Grocy",sysinfo['grocy_version']['Version'])

# 1) units, groups, locations, products -> build id maps (old->new)
umap={}; created=0
for u in EXP["quantity_units"]:
    nid,new=ensure("quantity_units","name",u); umap[int(u['id'])]=nid; created+=new
gmap={}
for g in EXP["product_groups"]:
    nid,new=ensure("product_groups","name",g); gmap[int(g['id'])]=nid; created+=new
lmap={}
for l in EXP["locations"]:
    nid,new=ensure("locations","name",l); lmap[int(l['id'])]=nid; created+=new

pmap={}
for p in EXP["products"]:
    po=dict(p)
    for f in ("qu_id_purchase","qu_id_stock","qu_id_consume","qu_id_price"):
        if po.get(f): po[f]=umap.get(int(po[f]),po[f])
    if po.get("product_group_id"): po["product_group_id"]=gmap.get(int(po["product_group_id"]),po["product_group_id"])
    if po.get("location_id"): po["location_id"]=lmap.get(int(po["location_id"]),po["location_id"])
    nid,new=ensure("products","name",po); pmap[int(p['id'])]=nid; created+=new

# 2) unit conversions (per product)
if not DRY:
    for c in EXP["quantity_unit_conversions"]:
        pid=pmap.get(int(c['product_id'])); 
        if not pid: continue
        call("POST","/objects/quantity_unit_conversions",{"product_id":pid,
            "from_qu_id":umap.get(int(c['from_qu_id'])),"to_qu_id":umap.get(int(c['to_qu_id'])),
            "factor":c['factor']})

# 3) recipes + ingredients (skip recipes already present by name)
existing_recipes={r['name'].strip().lower() for r in get("/objects/recipes")}
pos_by_recipe={}
for row in EXP["recipes_pos"]:
    pos_by_recipe.setdefault(int(row['recipe_id']),[]).append(row)
made=0; skipped=0
for r in EXP["recipes"]:
    if r['name'].strip().lower() in existing_recipes:
        skipped+=1; continue
    if DRY: made+=1; continue
    s,rr=call("POST","/objects/recipes",{"name":r['name'],"description":r['description'],
        "base_servings":r['base_servings'],"desired_servings":r['desired_servings']})
    if s!=200: print(f"  ! recipe {r['name']}: {s} {rr}"); continue
    nid=rr['created_object_id']
    for row in pos_by_recipe.get(int(r['id']),[]):
        call("POST","/objects/recipes_pos",{"recipe_id":nid,
            "product_id":pmap.get(int(row['product_id'])),"amount":row['amount'],
            "qu_id":umap.get(int(row['qu_id'])),"note":row.get('note',''),
            "ingredient_group":row.get('ingredient_group','')})
    made+=1
print(f"\nDone. products/units/groups created: {created}")
print(f"recipes created: {made}, skipped (already present): {skipped}")
if DRY: print("DRY RUN — nothing was written.")
