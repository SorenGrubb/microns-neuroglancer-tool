"""
2026-08-07 follow-up pass: Soren confirmed the 462 new-cell candidates from compare_all_own_data*.py
are trusted and should be added as new verified cells -- EXCEPT any row marked red (text or fill)
in "All own data.xlsx", which he does not trust. This script:

1. Re-derives the 462 candidates, this time keeping each row's real worksheet row number so it can
   be cross-checked against detect_red_flags.py's red-flag map.
2. Splits them into ADD (not red) and EXCLUDE (red) sets.
3. For the ADD set, re-runs the SAME join logic as the original 2026-07-07 own-coordinates
   integration (KDTree nearest-neighbour at 5000nm against nucdata): a candidate becomes an
   OVERRIDE if it lands on a MICrONS-detected nucleus that isn't already claimed by an existing
   override, otherwise STANDALONE (matches "Missing EM imagery outside minnie65" handling already
   built into ujump.html for standalone points).
4. Writes a plan file (new_cells_join_plan.json) for the next script (apply_new_cells_join.py) to
   actually patch owndata/cildata with -- kept as a separate step so the plan can be inspected/
   sanity-checked before any binary patching happens.

Run: python3 build_new_cells_join.py
Output: /tmp/dash/new_cells_join_plan.json, plus a printed summary.
"""
import re, json, base64, pickle
import numpy as np
from scipy.spatial import cKDTree
import openpyxl

F = "/sessions/optimistic-intelligent-carson/mnt/MICrONS cell classifier/microns-neuroglancer-tool/ujump.html"
XLSX = "/sessions/optimistic-intelligent-carson/mnt/brain_cell_image_library/All own data.xlsx"

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

OD = get_block("owndata")
TYPE_NAMES = OD["TYPE_NAMES"]
ov = OD["OVERRIDE"]
OV_TYPE = b64u8(ov["TYPE"])
already_claimed = set(np.where(OV_TYPE != 255)[0].tolist())

with open("/tmp/dash/row_red_flags.pkl", "rb") as f:
    row_red = pickle.load(f)

def parse_vox(s):
    if not s or not isinstance(s, str): return None
    p = [x.strip() for x in s.split(",")]
    if len(p) != 3: return None
    try: return [float(x) for x in p]
    except ValueError: return None

def mural3(name):
    l = (name or "").lower()
    if "mural" not in l and "pericyte" not in l and "smooth muscle" not in l:
        return name
    if "venular" in l: return "Venular smooth muscle cell"
    if "smooth muscle" in l: return "Smooth muscle cell"
    return "Mural cell"

# Re-load the ALREADY-embedded own-verified points for the "unmatched" (new-candidate) determination,
# same as compare_all_own_data*.py -- rebuild rather than re-load pickles, since those were session-
# scratch files this pass can't reliably reach any more (outputs folder access issue this session).
st = OD["STANDALONE"]
ST_X = b64u32(st["X"]); ST_Y = b64u32(st["Y"]); ST_Z = b64u16(st["Z"])
ST_TYPE = b64u8(st["TYPE"])
ov_idx_all = np.where(OV_TYPE != 255)[0]
ov_pos_nm = np.stack([NX[ov_idx_all] * 4.0, NY[ov_idx_all] * 4.0, NZ[ov_idx_all] * 40.0], axis=1)
ov_type_names = [TYPE_NAMES[OV_TYPE[i]] for i in ov_idx_all]
st_pos_nm = np.stack([ST_X * 4.0, ST_Y * 4.0, ST_Z * 40.0], axis=1)
st_type_names = [TYPE_NAMES[t] for t in ST_TYPE]
ALL_POS = np.concatenate([ov_pos_nm, st_pos_nm], axis=0)
ALL_TYPE = ov_type_names + st_type_names
own_tree = cKDTree(ALL_POS)

THRESH_NM = 5000.0

wb = openpyxl.load_workbook(XLSX, data_only=True, read_only=True)
ws = wb["Sheet1"]
rows_iter = list(enumerate(ws.iter_rows(min_row=2, values_only=True), start=2))

def parse_pt(s):
    return parse_vox(s)

candidates = []
for row_num, r in rows_iter:
    if r[0] != "MICrONS cubic millimeter" or r[6] == "Microglia plug":
        continue
    ct = r[6]
    nuc = parse_pt(r[9])
    if not nuc:
        continue
    pos_nm = np.array([nuc[0] * 4.0, nuc[1] * 4.0, nuc[2] * 40.0])
    dist, idx = own_tree.query(pos_nm, k=1)
    if dist <= THRESH_NM:
        continue  # already embedded -- not a "new cell" candidate
    candidates.append({
        "row": row_num, "type": ct, "nuc_voxel": nuc,
        "centriole": parse_pt(r[8]), "cil_start": parse_pt(r[13]), "cil_end": parse_pt(r[14]),
        "authors": r[22] or "",
    })

print("Re-derived new-cell candidates:", len(candidates))
red = [c for c in candidates if row_red.get(c["row"], False)]
keep = [c for c in candidates if not row_red.get(c["row"], False)]
print("Excluded (red-flagged):", len(red))
print("To add (trusted):", len(keep))

plan = {"add": [], "excluded_red": [{"row": c["row"], "type": c["type"], "nuc_voxel": c["nuc_voxel"]} for c in red]}

n_override = 0
n_standalone = 0
for c in keep:
    pos_nm = np.array([c["nuc_voxel"][0] * 4.0, c["nuc_voxel"][1] * 4.0, c["nuc_voxel"][2] * 40.0])
    dist, idx = nuc_tree.query(pos_nm, k=1)
    entry = {
        "row": c["row"], "type": mural3(c["type"]), "nuc_voxel": c["nuc_voxel"],
        "centriole": c["centriole"], "cil_start": c["cil_start"], "cil_end": c["cil_end"],
        "authors": c["authors"],
    }
    idx = int(idx)
    if dist <= THRESH_NM and idx not in already_claimed:
        entry["kind"] = "override"
        entry["nucdata_index"] = idx
        entry["nucleus_id"] = int(NID[idx])
        already_claimed.add(idx)  # so two candidates can't both claim the same nucleus
        n_override += 1
    else:
        entry["kind"] = "standalone"
        n_standalone += 1
    plan["add"].append(entry)

print("Of the", len(keep), "to add:", n_override, "become overrides (land on a free MICrONS nucleus),", n_standalone, "become standalone points")

# Type breakdown of what's being added
from collections import Counter
type_counts = Counter(e["type"] for e in plan["add"])
print("Type breakdown of additions:", dict(type_counts))
cent_count = sum(1 for e in plan["add"] if e["centriole"])
cil_count = sum(1 for e in plan["add"] if e["cil_start"] and e["cil_end"])
print("Of the additions:", cent_count, "have a centriole coord,", cil_count, "have full cilium data")

with open("/tmp/dash/new_cells_join_plan.json", "w") as f:
    json.dump(plan, f, indent=1)
print("\nSaved plan to /tmp/dash/new_cells_join_plan.json")
