"""
v2 of build_hole_reports_import.py -- Soren's follow-up correction (2026-08-07): "I forgot to
mention that the plugs coming below a microglia identification belongs to that microglia."

Verified empirically (see detect_red_flags.py-adjacent scratch checks this pass, e.g. 10 consecutive
"Microglia plug" rows at Excel rows 23-32 all belonging to the "Microglia" row at 22): microglia-plug
rows inherit ownership from the NEAREST PRECEDING "Microglia" row in worksheet order, within the same
"MICrONS cubic millimeter" section. This script re-derives the microglia-plug nucleusId using that
row-adjacency rule (resolving the owning microglia's own nucleus coordinate -> real MICrONS nucleus_id
via the same KDTree/5000nm join used everywhere else), and otherwise reproduces
build_hole_reports_import.py's astrocyte-hole logic unchanged (confirmed correct: 190/294 resolved,
104 genuinely unresolvable -- 102 outside the minnie65 bbox, 2 inside but with no nearby MICrONS
nucleus -- not a methodology gap).

Run: python3 build_hole_reports_import_v2.py
Output: organelle_locations_bulk_import_v2.csv (in this same folder) -- SUPERSEDES the v1 CSV
Soren already has; only the microglia-plug rows' nucleusId column differs from v1.
"""
import re, json, base64, csv, os
import numpy as np
from scipy.spatial import cKDTree
import openpyxl

F = "/sessions/optimistic-intelligent-carson/mnt/MICrONS cell classifier/microns-neuroglancer-tool/ujump.html"
XLSX = "/sessions/optimistic-intelligent-carson/mnt/brain_cell_image_library/All own data.xlsx"
OUT = "/tmp/dash/organelle_locations_bulk_import_v2.csv"
THRESH_NM = 5000.0
REPORTER_NAME = "Søren Grubb (bulk import from All own data.xlsx)"

html = open(F, encoding="utf-8").read()

def get_block(name):
    m = re.search(r'<script type="application/json" id="%s">(.*?)</script>' % re.escape(name), html, re.S)
    return json.loads(m.group(1)) if m else None

def b64u32(s): return np.frombuffer(base64.b64decode(s), dtype='<u4')
def b64u16(s): return np.frombuffer(base64.b64decode(s), dtype='<u2')

D = get_block("nucdata")
NX = b64u32(D["XB"]); NY = b64u32(D["YB"]); NZ = b64u16(D["ZB"])
NID = b64u32(D["NB"])
nuc_pos_nm = np.stack([NX * 4.0, NY * 4.0, NZ * 40.0], axis=1)
nuc_tree = cKDTree(nuc_pos_nm)

def parse_vox(s):
    if not s or not isinstance(s, str): return None
    parts = [p.strip() for p in s.split(",")]
    if len(parts) != 3: return None
    try: return [float(p) for p in parts]
    except ValueError: return None

def vox_str(p):
    return "%d, %d, %d" % (round(p[0]), round(p[1]), round(p[2]))

def match_nucleus_id(vox_coord):
    """Returns (nucleus_id_str, matched_bool)."""
    if not vox_coord:
        return "", False
    pos_nm = np.array([vox_coord[0] * 4.0, vox_coord[1] * 4.0, vox_coord[2] * 40.0])
    dist, idx = nuc_tree.query(pos_nm, k=1)
    if dist <= THRESH_NM:
        return str(int(NID[idx])), True
    return "", False

wb = openpyxl.load_workbook(XLSX, data_only=True, read_only=True)
ws = wb["Sheet1"]
rows = list(enumerate(ws.iter_rows(min_row=2, values_only=True), start=2))  # 1-indexed real row numbers

HEADER = ["timestamp", "nucleusId", "rootId", "coord", "groupId", "subIndex", "subCount", "kind",
          "pointA", "pointB", "identified", "path", "reporterName", "reporterEmail", "comment",
          "holeLengthUm", "holeWidthUm", "holeDirection", "throughHole"]

out_rows = []
timestamp = "2026-08-07T00:00:00.000Z"

def notes_comment(r):
    parts = [str(r[i]).strip() for i in (17, 18, 19) if r[i] not in (None, "")]
    return " / ".join(parts)

# ---- 1) Astrocyte holes (NR type II) -- unchanged from v1 ----
n_astro = 0
n_astro_no_nucleus_match = 0
for row_num, r in rows:
    if r[0] != "MICrONS cubic millimeter" or r[6] != "Astrocyte":
        continue
    c1 = parse_vox(r[23]); c2 = parse_vox(r[24])
    if not c1 or not c2:
        continue
    own_nuc = parse_vox(r[9])
    nucleus_id, matched = match_nucleus_id(own_nuc) if own_nuc else ("", False)
    if own_nuc and not matched:
        n_astro_no_nucleus_match += 1
    thru = []
    if r[30]: thru.append("GFAP")
    if r[31]: thru.append("Mitochondria")
    if r[32]: thru.append("ER")
    if r[33]: thru.append("Microtubule")
    if r[34]: thru.append("Golgi")
    out_rows.append([
        timestamp, nucleus_id, "", (vox_str(own_nuc) if own_nuc else ""),
        "bulkimport_astrohole_%d" % row_num, 1, 1, "nucleoplasmic_reticulum_2",
        vox_str(c1), vox_str(c2), "Astrocyte", "Bulk import from All own data.xlsx",
        REPORTER_NAME, "", notes_comment(r),
        "", "", "", ",".join(thru)
    ])
    n_astro += 1

# ---- 2) Microglia plugs -- NEW: row-adjacency ownership ----
n_plug = 0
n_plug_owned = 0
n_plug_unowned = 0
n_microglia_seen = 0
n_microglia_matched = 0
last_microglia_nucleus_id = ""
last_microglia_row = None
for row_num, r in rows:
    if r[0] != "MICrONS cubic millimeter":
        continue
    if r[6] == "Microglia":
        own_nuc = parse_vox(r[9])
        nucleus_id, matched = match_nucleus_id(own_nuc) if own_nuc else ("", False)
        last_microglia_nucleus_id = nucleus_id
        last_microglia_row = row_num
        n_microglia_seen += 1
        if matched:
            n_microglia_matched += 1
        continue
    if r[6] != "Microglia plug":
        continue
    pt = parse_vox(r[8])  # the one coordinate, currently mis-stored under "Centriole coordinates"
    if not pt:
        continue
    owning_nucleus_id = last_microglia_nucleus_id if last_microglia_row is not None else ""
    if owning_nucleus_id:
        n_plug_owned += 1
    else:
        n_plug_unowned += 1
    out_rows.append([
        timestamp, owning_nucleus_id, "", vox_str(pt),
        "bulkimport_microgliaplug_%d" % row_num, 1, 1, "microglia_plug",
        vox_str(pt), "", "Microglia plug", "Bulk import from All own data.xlsx",
        REPORTER_NAME, "", notes_comment(r),
        "", "", "", ""
    ])
    n_plug += 1

os.makedirs("/tmp/dash", exist_ok=True)
with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(HEADER)
    w.writerows(out_rows)

print("Astrocyte holes (NR type II) with real coordinates:", n_astro,
      "-- of which no nucleus match within %dnm:" % THRESH_NM, n_astro_no_nucleus_match)
print("Microglia rows seen:", n_microglia_seen, "-- of which matched a MICrONS nucleus:", n_microglia_matched)
print("Microglia plugs with a real coordinate:", n_plug,
      "-- owned (nucleusId resolved):", n_plug_owned, "-- unowned (no preceding Microglia row / no match):", n_plug_unowned)
print("Total rows written:", len(out_rows), "->", OUT)
