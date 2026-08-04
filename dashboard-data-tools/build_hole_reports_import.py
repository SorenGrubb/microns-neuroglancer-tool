"""
One-off bulk-import builder: turns "All own data.xlsx"'s microglia-plug and astrocyte-hole
(NR type II) rows into historical "Organelle locations" report rows Soren can paste into the live
Google Sheet, so they show up through the exact same Filter-and-show / point-viewer / dashboard
machinery every other organelle report already uses -- no new Master List columns needed (per
Soren's own choice, confirmed via AskUserQuestion 2026-08-07: "Bulk-import as Organelle location
reports").

WHAT THIS DOES
1. Astrocyte rows with a REAL hole coordinate pair (Hole length coordinate 1 & 2 both present --
   294 of 2523 astrocyte rows; the other 2229 only have a hole length(um)/width(um)/direction
   VALUE with no coordinates to anchor a report to, and can't be included here -- see the note
   below about those columns anyway). Matched onto its OWN owning nucleus by nearest-neighbour
   (5000nm threshold, same convention as the original own-coordinates integration) against
   ujump.html's own embedded nucdata, so the report carries a real nucleusId.
2. Microglia plug rows (211) -- only ever have ONE coordinate in the source file (see
   compare_all_own_data.py's findings), so these become single-point microglia_plug reports, not
   anchored to any nucleus (a plug is a separate structure near a cell, not the cell itself --
   Soren's own choice).

IMPORTANT DATA-QUALITY FINDING (not previously known): "Hole length (um)", "Hole width (um)" and
"Hole direction" are NOT real per-hole measurements anywhere in this file -- every one of the 2515
astrocyte rows that has them filled at all has EXACTLY the same values (length=0, width=0,
direction="horizontal"), i.e. an unfilled placeholder/default that was apparently never actually
measured. holeLengthUm/holeWidthUm/holeDirection are therefore left BLANK in this import rather
than writing in the misleading placeholder numbers -- only the "through-hole" organelle flags
(GFAP/Mitochondria/ER/Microtubule/Golgi, which DO vary row-to-row and are real signal) are carried
over, packed into one throughHole string like "GFAP,ER,Microtubule".

Run: python3 build_hole_reports_import.py
Output: organelle_locations_bulk_import.csv (in this same folder) -- columns match the "Organelle
locations" sheet's header EXACTLY, including the 4 new optional columns from Code.gs.txt
(holeLengthUm, holeWidthUm, holeDirection, throughHole). Soren pastes these rows onto the BOTTOM of
the existing "Organelle locations" sheet (below its current last row) -- a plain append, no Apps
Script function needed, since this sheet has never used upsert-by-key semantics (see
"# reportsOverTime" comment in Code.gs.txt: it's a pure append-only event log like every other
report sheet).
"""
import re, json, base64, csv
import numpy as np
from scipy.spatial import cKDTree
import openpyxl

F = "/sessions/optimistic-intelligent-carson/mnt/MICrONS cell classifier/microns-neuroglancer-tool/ujump.html"
XLSX = "/sessions/optimistic-intelligent-carson/mnt/brain_cell_image_library/All own data.xlsx"
OUT = "/tmp/dash/organelle_locations_bulk_import.csv"
THRESH_NM = 5000.0
REPORTER_NAME = "Søren Grubb (bulk import from All own data.xlsx)"

html = open(F, encoding="utf-8").read()

def get_block(name):
    m = re.search(r'<script type="application/json" id="%s">(.*?)</script>' % re.escape(name), html, re.S)
    return json.loads(m.group(1)) if m else None

def b64u8(s):  return np.frombuffer(base64.b64decode(s), dtype=np.uint8)
def b64u32(s): return np.frombuffer(base64.b64decode(s), dtype='<u4')
def b64u16(s): return np.frombuffer(base64.b64decode(s), dtype='<u2')

D = get_block("nucdata")
N = D["N"]
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

wb = openpyxl.load_workbook(XLSX, data_only=True, read_only=True)
ws = wb["Sheet1"]
rows = list(ws.iter_rows(values_only=True))

HEADER = ["timestamp", "nucleusId", "rootId", "coord", "groupId", "subIndex", "subCount", "kind",
          "pointA", "pointB", "identified", "path", "reporterName", "reporterEmail", "comment",
          "holeLengthUm", "holeWidthUm", "holeDirection", "throughHole"]

out_rows = []
timestamp = "2026-08-07T00:00:00.000Z"  # historical bulk import -- fixed, not "now", so it's
                                          # visually identifiable as a batch in the sheet/timeline

def notes_comment(r):
    parts = [str(r[i]).strip() for i in (17, 18, 19) if r[i] not in (None, "")]
    return " / ".join(parts)

# ---- 1) Astrocyte holes (NR type II) ----
n_astro = 0
n_astro_no_nucleus_match = 0
for i, r in enumerate(rows[1:]):
    if r[0] != "MICrONS cubic millimeter" or r[6] != "Astrocyte":
        continue
    c1 = parse_vox(r[23]); c2 = parse_vox(r[24])  # Hole length coordinate 1 / 2
    if not c1 or not c2:
        continue
    own_nuc = parse_vox(r[9])  # Cell nucleus coordinates
    nucleus_id = ""
    if own_nuc:
        pos_nm = np.array([own_nuc[0] * 4.0, own_nuc[1] * 4.0, own_nuc[2] * 40.0])
        dist, idx = nuc_tree.query(pos_nm, k=1)
        if dist <= THRESH_NM:
            nucleus_id = str(int(NID[idx]))
        else:
            n_astro_no_nucleus_match += 1
    thru = []
    if r[30]: thru.append("GFAP")
    if r[31]: thru.append("Mitochondria")
    if r[32]: thru.append("ER")
    if r[33]: thru.append("Microtubule")
    if r[34]: thru.append("Golgi")
    out_rows.append([
        timestamp, nucleus_id, "", (vox_str(own_nuc) if own_nuc else ""),
        "bulkimport_astrohole_%d" % i, 1, 1, "nucleoplasmic_reticulum_2",
        vox_str(c1), vox_str(c2), "Astrocyte", "Bulk import from All own data.xlsx",
        REPORTER_NAME, "", notes_comment(r),
        "", "", "", ",".join(thru)
    ])
    n_astro += 1

# ---- 2) Microglia plugs ----
n_plug = 0
for i, r in enumerate(rows[1:]):
    if r[0] != "MICrONS cubic millimeter" or r[6] != "Microglia plug":
        continue
    pt = parse_vox(r[8])  # the one coordinate, currently mis-stored under "Centriole coordinates"
    if not pt:
        continue
    out_rows.append([
        timestamp, "", "", vox_str(pt),
        "bulkimport_microgliaplug_%d" % i, 1, 1, "microglia_plug",
        vox_str(pt), "", "Microglia plug", "Bulk import from All own data.xlsx",
        REPORTER_NAME, "", notes_comment(r),
        "", "", "", ""
    ])
    n_plug += 1

import os
os.makedirs("/tmp/dash", exist_ok=True)
with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(HEADER)
    w.writerows(out_rows)

print("Astrocyte holes (NR type II) with real coordinates:", n_astro,
      "-- of which no nucleus match within %dnm:" % THRESH_NM, n_astro_no_nucleus_match)
print("Microglia plugs with a real coordinate:", n_plug)
print("Total rows written:", len(out_rows), "->", OUT)
