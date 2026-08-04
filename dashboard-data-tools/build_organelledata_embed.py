"""
Søren, 2026-08-07 (after the Google Sheets/backfill pipeline came back with 0 rows because the CSV
was never pasted): "I am getting tired of this. Can we just get those organelles into µJump so that
we can make graphs of them and we can know that those cell types have those types of organelles?"

Skips the whole Sheets/Apps Script round-trip for this historical bulk data entirely -- builds a
new static JSON block ("organelledata") straight from "All own data.xlsx", keyed by nucdata index
(same key space as cildata's OV_IDX/ST_IDX), to be patched directly into ujump.html the same way
owndata/cildata already are. Once patched, this data is available client-side with ZERO further
action from Søren: no CSV paste, no redeploy, no backfill run.

Reuses the exact matching logic already verified this session (build_hole_reports_import_v2.py):
microglia plugs inherit ownership via row-adjacency to the nearest preceding "Microglia" row;
astrocyte holes (NR type II) match via the astrocyte's own recorded nucleus coordinate. Both then
KDTree-match (5000nm threshold) against nucdata to get a real nucdata index.

Run: python3 build_organelledata_embed.py
Output: /tmp/dash/organelledata.json -- {"PLUGS": {"<nucdata_index>": [[x,y,z], ...]},
"HOLES": {"<nucdata_index>": [[[x1,y1,z1],[x2,y2,z2]], ...]}} -- plain JSON (not base64-packed;
entry counts are small, same style as the existing "mergeddata" block).
"""
import re, json
import numpy as np
from scipy.spatial import cKDTree
import openpyxl

F = "/sessions/optimistic-intelligent-carson/mnt/MICrONS cell classifier/microns-neuroglancer-tool/ujump.html"
XLSX = "/sessions/optimistic-intelligent-carson/mnt/brain_cell_image_library/All own data.xlsx"
THRESH_NM = 5000.0

html = open(F, encoding="utf-8").read()

def get_block(name):
    m = re.search(r'<script type="application/json" id="%s">(.*?)</script>' % re.escape(name), html, re.S)
    return json.loads(m.group(1))

import base64
def b64u32(s): return np.frombuffer(base64.b64decode(s), dtype='<u4')
def b64u16(s): return np.frombuffer(base64.b64decode(s), dtype='<u2')

D = get_block("nucdata")
NX = b64u32(D["XB"]); NY = b64u32(D["YB"]); NZ = b64u16(D["ZB"])
nuc_pos_nm = np.stack([NX * 4.0, NY * 4.0, NZ * 40.0], axis=1)
nuc_tree = cKDTree(nuc_pos_nm)

def parse_vox(s):
    if not s or not isinstance(s, str): return None
    parts = [p.strip() for p in s.split(",")]
    if len(parts) != 3: return None
    try: return [float(p) for p in parts]
    except ValueError: return None

def match_idx(vox_coord):
    if not vox_coord:
        return None
    pos_nm = np.array([vox_coord[0] * 4.0, vox_coord[1] * 4.0, vox_coord[2] * 40.0])
    dist, idx = nuc_tree.query(pos_nm, k=1)
    return int(idx) if dist <= THRESH_NM else None

wb = openpyxl.load_workbook(XLSX, data_only=True, read_only=True)
ws = wb["Sheet1"]
rows = list(enumerate(ws.iter_rows(min_row=2, values_only=True), start=2))

PLUGS = {}
HOLES = {}

# ---- Astrocyte holes (NR type II) ----
n_holes = 0
for row_num, r in rows:
    if r[0] != "MICrONS cubic millimeter" or r[6] != "Astrocyte":
        continue
    c1 = parse_vox(r[23]); c2 = parse_vox(r[24])
    if not c1 or not c2:
        continue
    own_nuc = parse_vox(r[9])
    idx = match_idx(own_nuc)
    if idx is None:
        continue
    key = str(idx)
    HOLES.setdefault(key, []).append([[round(c1[0]), round(c1[1]), round(c1[2])], [round(c2[0]), round(c2[1]), round(c2[2])]])
    n_holes += 1

# ---- Microglia plugs (row-adjacency ownership) ----
n_plugs = 0
last_microglia_idx = None
for row_num, r in rows:
    if r[0] != "MICrONS cubic millimeter":
        continue
    if r[6] == "Microglia":
        own_nuc = parse_vox(r[9])
        last_microglia_idx = match_idx(own_nuc)
        continue
    if r[6] != "Microglia plug":
        continue
    pt = parse_vox(r[8])
    if not pt or last_microglia_idx is None:
        continue
    key = str(last_microglia_idx)
    PLUGS.setdefault(key, []).append([round(pt[0]), round(pt[1]), round(pt[2])])
    n_plugs += 1

out = {"PLUGS": PLUGS, "HOLES": HOLES}
with open("/tmp/dash/organelledata.json", "w") as f:
    json.dump(out, f)

print("Distinct microglia with >=1 plug:", len(PLUGS), "-- total plugs:", n_plugs)
print("Distinct astrocytes with >=1 hole:", len(HOLES), "-- total holes:", n_holes)
print("Saved /tmp/dash/organelledata.json")
