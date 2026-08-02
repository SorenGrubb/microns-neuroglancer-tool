"""
Seed generator for the "Master cell list" Google Sheet tab (2026-08-02, extended 2026-08-02) --
Soren wants a single, always-current list of EVERY cell in the dataset (best-available identity),
kept separate from the raw discrepancy-report event log (the "New identifications" / "Confirmations"
/ "Discrepancies" sheets, which stay exactly as they are -- an append-only history of individual
report events, not a per-cell current-state table).

This script produces the ONE-TIME seed CSV Soren imports as the initial content of that new tab.
After that, Code.gs upserts each main-nucleus row's IDENTITY live whenever a new_identification/
confirmation/discrepancy report comes in for it (see the "Master cell list" section in Code.gs.txt).

EXTENSION (2026-08-02): Soren asked that NONE of the µJump dashboard's charts stay static --
every number should reflect the CURRENT state of reports, not a frozen precomputed snapshot.
Chosen approach (confirmed via AskUserQuestion): a new Apps Script endpoint recomputes every
aggregate chart LIVE from this sheet's CURRENT contents on every dashboard load/refresh. That
only works for the numbers that actually depend on reports (cell type, effectively). Two things
genuinely never change from a report -- WHERE a cell physically is, and therefore which cortical
layer it's in and which cells are its geometric neighbours -- so those stay precomputed here
(there is no scipy/cKDTree available inside Apps Script, and re-deriving a 150k-point spatial
index on every page load would be far too slow even if there were). What DOES stay live is which
TYPE each of those neighbours currently resolves to -- the new Code.gs endpoint looks that up
fresh from this sheet's current_identity column every time, rather than baking neighbour TYPES in
here. Same principle for cilia/centriole/volume: whether a cilium/centriole was ever observed on a
given cell is a fixed observation (not something a report changes), so it's precomputed here;
which CELL TYPE bucket it counts toward is looked up live from current_identity.

New columns this pass (appended LAST, per this project's "header is looked up by name, safe to
extend" convention -- see MASTER_LIST_HEADERS in Code.gs.txt):
  has_cilium, cilium_checked, cilium_length_um, has_centriole, centriole_dist_um,
  nucleus_volume_um3, estimated_layer, neighbor_10_keys (JSON array of cell_key strings, nearest
  first, self excluded -- 10 rather than 5 so the live endpoint can skip any neighbour that's
  CURRENTLY Unclassified and still usually find 5 real ones, exactly reproducing what the
  original precompute_dashboard.py's k=6-query-restricted-to-identified-points did, but live).

cilium_checked mirrors precompute_dashboard.py's existing (slightly quirky, not a bug, documented
there) convention: for merged-nucleus sub-cells, only subs that actually have a CD.MERGED_CIL
patch are counted as part of the "checked" pass at all -- a sub with no patch is invisible to the
percent-with-cilium denominator, not counted as "checked and cilium-free". Preserved as-is here
rather than silently redefining what "checked" means.

Reuses the exact same data-loading logic as precompute_dashboard.py / extract_lists.py (same
2026-08 bug fixes: NT byte convention, vascdata/vascdata8/vascdata9/owncorrections patch order,
canon/mural3 name normalization) -- copied rather than imported so this stays a single,
standalone, re-runnable file like its siblings, matching this project's "self-contained scripts"
convention.

Run: python3 build_master_cell_list.py
Output: /tmp/master_cell_list_seed.csv
"""
import re, json, base64, csv, collections
import numpy as np
from scipy.spatial import cKDTree

F = "/sessions/optimistic-intelligent-carson/mnt/MICrONS cell classifier/microns-neuroglancer-tool/ujump.html"
OUT = "/tmp/master_cell_list_seed.csv"

html = open(F, encoding='utf-8').read()

def get_block(name):
    m = re.search(r'<script type="application/json" id="%s">(.*?)</script>' % re.escape(name), html, re.S)
    return json.loads(m.group(1))

def b64u8(s):  return np.frombuffer(base64.b64decode(s), dtype=np.uint8)
def b64u32(s): return np.frombuffer(base64.b64decode(s), dtype='<u4')
def b64u16(s): return np.frombuffer(base64.b64decode(s), dtype='<u2')
def b64f32(s): return np.frombuffer(base64.b64decode(s), dtype='<f4')

def mural3(name):
    l = name.lower()
    if "mural" not in l and "pericyte" not in l and "smooth muscle" not in l:
        return name
    if "venular" in l:
        return "Venular smooth muscle cell"
    if "smooth muscle" in l:
        return "Smooth muscle cell"
    return "Pericyte"

LONG_NAMES = {
    "23P": "L2/3 pyramidal neuron (23P)", "4P": "Layer 4 pyramidal / spiny-stellate neuron (4P)",
    "5P-ET": "Layer 5 ET thick-tufted pyramidal neuron (5P-ET)", "5P-IT": "Layer 5 IT pyramidal neuron (5P-IT)",
    "5P-NP": "Layer 5 near-projecting neuron (5P-NP)", "6P-CT": "Layer 6 CT pyramidal neuron (6P-CT)",
    "6P-IT": "Layer 6 IT pyramidal neuron (6P-IT)", "BC": "Basket cell — PV / perisomatic-targeting (BC)",
    "MC": "Martinotti cell — SST / distal-targeting (MC)", "BPC": "Bipolar cell — VIP / inhibitory-targeting (BPC)",
    "NGC": "Neurogliaform cell — sparsely-targeting (NGC)",
    "astrocyte": "Astrocyte", "oligo": "Oligodendrocyte", "OPC": "OPC",
    "microglia": "Microglia", "pericyte": "Pericyte",
}
def canon(name): return LONG_NAMES.get(name, name)

# ---- nucdata (main nuclei) ----
D = get_block("nucdata")
N = D["N"]
NX = b64u32(D["XB"]); NY = b64u32(D["YB"]); NZ = b64u16(D["ZB"])
NT = b64u8(D["TB"])
NID = b64u32(D["NB"])
NV = b64f32(D["VB"])  # nucleus volume um3, 0 = not available
CT_NAMES = [canon(mural3(n)) for n in D["CT_NAMES"]]

# ---- layerdata (pia / WM) -- for the static, never-changes-from-a-report layer estimate ----
LD = get_block("layerdata")
PIA_X = b64f32(LD["PIA"]["X"]); PIA_Y = b64f32(LD["PIA"]["Y"]); PIA_Z = b64f32(LD["PIA"]["Z"])
WM_X  = b64f32(LD["WM"]["X"]);  WM_Y  = b64f32(LD["WM"]["Y"]);  WM_Z  = b64f32(LD["WM"]["Z"])
SURFACE_Y_OFFSET_NM = 0

LEDDEROSE_REF_THICK_UM = 900.0
LEDDEROSE_ABS_BOUNDS = [
    ("Layer 1", 0, 100), ("Layer 2/3", 100, 250), ("Layer 4", 250, 350),
    ("Layer 5a", 350, 450), ("Layer 5b", 450, 600),
    ("Layer 6a", 600, 800), ("Layer 6b", 800, 900),
]
def layer_bounds_for_thickness(thick_um):
    return [(name, lo / LEDDEROSE_REF_THICK_UM * thick_um, hi / LEDDEROSE_REF_THICK_UM * thick_um)
            for name, lo, hi in LEDDEROSE_ABS_BOUNDS]

pia_xz = np.stack([PIA_X, PIA_Z], axis=1)
wm_xz  = np.stack([WM_X, WM_Z], axis=1)
pia_tree = cKDTree(pia_xz)
wm_tree  = cKDTree(wm_xz)

def idw_surface_y_batch(qxz, tree, py, k=8):
    d, idx = tree.query(qxz, k=k)
    d = np.atleast_2d(d); idx = np.atleast_2d(idx)
    d2 = d ** 2
    exact_mask = d2[:, 0] < 1
    w = 1.0 / (d2 + 1.0)
    ysum = (w * py[idx]).sum(axis=1)
    wsum = w.sum(axis=1)
    y = ysum / wsum
    y[exact_mask] = py[idx[exact_mask, 0]]
    return y

def estimate_layers_batch(vx, vy, vz):
    qx = vx.astype(np.float64) * 4
    qy = vy.astype(np.float64) * 4
    qz = vz.astype(np.float64) * 40
    qxz = np.stack([qx, qz], axis=1)
    pia_y = idw_surface_y_batch(qxz, pia_tree, PIA_Y + SURFACE_Y_OFFSET_NM)
    wm_y  = idw_surface_y_batch(qxz, wm_tree,  WM_Y + SURFACE_Y_OFFSET_NM)
    depth = qy - pia_y
    thickness = wm_y - pia_y
    depth_um = depth / 1000.0
    thick_um = thickness / 1000.0
    labels = np.full(len(vx), "Unknown", dtype=object)
    valid = thickness > 0
    idxs = np.where(valid)[0]
    for i in idxs:
        d, t = depth_um[i], thick_um[i]
        if d < 0:
            labels[i] = "Leptomeninges"; continue
        if d > t:
            labels[i] = "White matter"; continue
        bounds = layer_bounds_for_thickness(t)
        lab = "Layer 6b"
        for name, lo, hi in bounds:
            if lo <= d < hi:
                lab = name; break
        labels[i] = lab
    return labels

print("Estimating cortical layer for", N, "main nuclei ...")
main_layers = estimate_layers_batch(NX, NY, NZ)

# ---- owndata (ground truth) ----
OD = get_block("owndata")
OWN_TYPE_NAMES = [canon(mural3(n)) for n in OD["TYPE_NAMES"]]
ov = OD["OVERRIDE"]
OWN_TYPE = b64u8(ov["TYPE"]).copy()
OWN_CENTX = b64u32(ov["CENTX"]); OWN_CENTY = b64u32(ov["CENTY"]); OWN_CENTZ = b64u16(ov["CENTZ"])
OWN_HASCENT = b64u8(ov["HASCENT"])

sa = OD["STANDALONE"]
ST_N = sa["N"]
ST_X = b64u32(sa["X"]); ST_Y = b64u32(sa["Y"]); ST_Z = b64u16(sa["Z"])
ST_TYPE = b64u8(sa["TYPE"]).copy()
ST_CENTX = b64u32(sa["CENTX"]); ST_CENTY = b64u32(sa["CENTY"]); ST_CENTZ = b64u16(sa["CENTZ"])
ST_HASCENT = b64u8(sa["HASCENT"])

print("Estimating cortical layer for", ST_N, "standalone points ...")
st_layers = estimate_layers_batch(ST_X, ST_Y, ST_Z)

# ---- mergeddata (loaded before vascdata patches, same order as precompute_dashboard.py) ----
MG = get_block("mergeddata")

def apply_vasc_patch(block_name, extra_names_key=None, single_name_key=None):
    global OWN_TYPE_NAMES
    VD = get_block(block_name)
    if extra_names_key and extra_names_key in VD:
        OWN_TYPE_NAMES = OWN_TYPE_NAMES + [canon(mural3(n)) for n in VD[extra_names_key]]
    if single_name_key and single_name_key in VD:
        OWN_TYPE_NAMES = OWN_TYPE_NAMES + [canon(mural3(VD[single_name_key]))]
    ov_idx = b64u32(VD["OV_TYPE_IDX"]); ov_val = b64u8(VD["OV_TYPE_VAL"])
    OWN_TYPE[ov_idx] = ov_val
    st_idx = b64u32(VD["ST_TYPE_IDX"]); st_val = b64u8(VD["ST_TYPE_VAL"])
    ST_TYPE[st_idx] = st_val
    for gid, patches in VD.get("MERGED_PATCH", {}).items():
        grp = MG.get(gid)
        if not grp: continue
        for p in patches:
            if p["i"] < len(grp):
                grp[p["i"]]["type"] = canon(mural3(p["type"]))

apply_vasc_patch("vascdata", extra_names_key="TYPE_NAMES_EXTRA")
apply_vasc_patch("vascdata8")
apply_vasc_patch("vascdata9", single_name_key="TYPE_NAME_NEW")
# "owncorrections" (2026-08-02): one-off fixes for individual nuclei Søren caught as data-entry
# errors (e.g. nucleus 73397/id 484140, previously miscoded as a Mural+Endothelial merge -- see
# ujump.html's own comment on this block). Must run after vascdata/8/9 (reuses type-name index 16).
apply_vasc_patch("owncorrections")

for gid in MG:
    for sub in MG[gid]:
        if sub.get("type"):
            sub["type"] = canon(mural3(sub["type"]))

# ---- cildata (cilia) ----
CD = get_block("cildata")
OWN_HASCIL = np.zeros(N, dtype=np.uint8)
OWN_CILSX = np.zeros(N, dtype=np.uint32); OWN_CILSY = np.zeros(N, dtype=np.uint32); OWN_CILSZ = np.zeros(N, dtype=np.uint16)
OWN_CILEX = np.zeros(N, dtype=np.uint32); OWN_CILEY = np.zeros(N, dtype=np.uint32); OWN_CILEZ = np.zeros(N, dtype=np.uint16)
ov_idx = b64u32(CD["OV_IDX"])
ov_sx = b64u32(CD["OV_CILSX"]); ov_sy = b64u32(CD["OV_CILSY"]); ov_sz = b64u16(CD["OV_CILSZ"])
ov_ex = b64u32(CD["OV_CILEX"]); ov_ey = b64u32(CD["OV_CILEY"]); ov_ez = b64u16(CD["OV_CILEZ"])
OWN_CILSX[ov_idx] = ov_sx; OWN_CILSY[ov_idx] = ov_sy; OWN_CILSZ[ov_idx] = ov_sz
OWN_CILEX[ov_idx] = ov_ex; OWN_CILEY[ov_idx] = ov_ey; OWN_CILEZ[ov_idx] = ov_ez
OWN_HASCIL[ov_idx] = 1

ST_HASCIL = np.zeros(ST_N, dtype=np.uint8)
ST_CILSX = np.zeros(ST_N, dtype=np.uint32); ST_CILSY = np.zeros(ST_N, dtype=np.uint32); ST_CILSZ = np.zeros(ST_N, dtype=np.uint16)
ST_CILEX = np.zeros(ST_N, dtype=np.uint32); ST_CILEY = np.zeros(ST_N, dtype=np.uint32); ST_CILEZ = np.zeros(ST_N, dtype=np.uint16)
st_idx = b64u32(CD["ST_IDX"])
st_sx = b64u32(CD["ST_CILSX"]); st_sy = b64u32(CD["ST_CILSY"]); st_sz = b64u16(CD["ST_CILSZ"])
st_ex = b64u32(CD["ST_CILEX"]); st_ey = b64u32(CD["ST_CILEY"]); st_ez = b64u16(CD["ST_CILEZ"])
ST_CILSX[st_idx] = st_sx; ST_CILSY[st_idx] = st_sy; ST_CILSZ[st_idx] = st_sz
ST_CILEX[st_idx] = st_ex; ST_CILEY[st_idx] = st_ey; ST_CILEZ[st_idx] = st_ez
ST_HASCIL[st_idx] = 1

MERGED_CIL = CD.get("MERGED_CIL", {})

def cilium_len_um(sx, sy, sz, ex, ey, ez):
    dx = (float(ex) - float(sx)) * 4
    dy = (float(ey) - float(sy)) * 4
    dz = (float(ez) - float(sz)) * 40
    return round((dx * dx + dy * dy + dz * dz) ** 0.5 / 1000.0, 2)

def dist_um(x1, y1, z1, x2, y2, z2):
    dx = (float(x1) - float(x2)) * 4
    dy = (float(y1) - float(y2)) * 4
    dz = (float(z1) - float(z2)) * 40
    return round((dx * dx + dy * dy + dz * dz) ** 0.5 / 1000.0, 2)

# ---- best identity (own override beats MICrONS -- same precedence as everywhere else) ----
best_identity = np.empty(N, dtype=object)
identity_source = np.empty(N, dtype=object)
microns_predicted = np.empty(N, dtype=object)
own_verified_identity = np.empty(N, dtype=object)
for i in range(N):
    microns_predicted[i] = CT_NAMES[NT[i] - 1] if NT[i] != 0 else ""
    if OWN_TYPE[i] != 255:
        own_verified_identity[i] = OWN_TYPE_NAMES[OWN_TYPE[i]]
        best_identity[i] = OWN_TYPE_NAMES[OWN_TYPE[i]]
        identity_source[i] = "own_verified"
    else:
        own_verified_identity[i] = ""
        if NT[i] != 0:
            best_identity[i] = microns_predicted[i]
            identity_source[i] = "microns_only"
        else:
            best_identity[i] = "Unclassified"
            identity_source[i] = "unclassified"

st_identity = np.array([OWN_TYPE_NAMES[t] for t in ST_TYPE], dtype=object)

# ---- 5(->10)-nearest-neighbor keys, purely geometric, computed once (2026-08-02 extension) -----
# Built over EVERY main nucleus + standalone point (not just "identified" ones, unlike the old
# static dashboard precompute) -- which of these neighbours currently counts as identified is a
# LIVE question the new Code.gs endpoint answers at read time, not something baked in here. k=11
# (self+10, not self+5) so the live endpoint can skip any neighbour that's currently Unclassified
# and still usually surface 5 real ones. Merged-nucleus sub-cells reuse their PARENT's neighbour
# list (same physical position, no separate point in the tree).
print("Building spatial index over", N + ST_N, "points for neighbour lookups ...")
all_x = np.concatenate([NX.astype(np.float64) * 4, ST_X.astype(np.float64) * 4])
all_y = np.concatenate([NY.astype(np.float64) * 4, ST_Y.astype(np.float64) * 4])
all_z = np.concatenate([NZ.astype(np.float64) * 40, ST_Z.astype(np.float64) * 40])
all_keys = [f"N:{int(NID[i])}" for i in range(N)] + [f"S:{int(ST_X[j])}_{int(ST_Y[j])}_{int(ST_Z[j])}" for j in range(ST_N)]
pts = np.stack([all_x, all_y, all_z], axis=1)
tree_all = cKDTree(pts)
K = 11
print(" querying k=%d nearest for all %d points ..." % (K, len(all_keys)))
_, nbr_idx = tree_all.query(pts, k=K)
neighbor_10_keys_json = []
for row_i in range(len(all_keys)):
    keys = [all_keys[c] for c in nbr_idx[row_i, 1:K]]  # skip col 0 = self
    neighbor_10_keys_json.append(json.dumps(keys, separators=(',', ':')))
main_neighbor_json = neighbor_10_keys_json[:N]
st_neighbor_json = neighbor_10_keys_json[N:]

rows = []

# ---- main nuclei ----
for i in range(N):
    has_cil = bool(OWN_HASCIL[i])
    has_cent = bool(OWN_HASCENT[i])
    rows.append({
        "cell_key": f"N:{int(NID[i])}",
        "kind": "main_nucleus",
        "nucleus_id": int(NID[i]),
        "voxel_x": int(NX[i]), "voxel_y": int(NY[i]), "voxel_z": int(NZ[i]),
        "voxel_paste": f"{int(NX[i])}, {int(NY[i])}, {int(NZ[i])}",
        "microns_predicted": microns_predicted[i],
        "own_verified_identity": own_verified_identity[i],
        "current_identity": best_identity[i],
        "identity_source": identity_source[i],
        "community_top_identity": "",
        "community_votes_json": "",
        "last_updated": "",
        "has_cilium": 1 if has_cil else "",
        "cilium_checked": 1 if identity_source[i] == "own_verified" else "",
        "cilium_length_um": cilium_len_um(OWN_CILSX[i], OWN_CILSY[i], OWN_CILSZ[i],
                                           OWN_CILEX[i], OWN_CILEY[i], OWN_CILEZ[i]) if has_cil else "",
        "has_centriole": 1 if has_cent else "",
        "centriole_dist_um": dist_um(NX[i], NY[i], NZ[i], OWN_CENTX[i], OWN_CENTY[i], OWN_CENTZ[i]) if has_cent else "",
        "nucleus_volume_um3": round(float(NV[i]), 2) if NV[i] and NV[i] > 0 else "",
        "estimated_layer": main_layers[i],
        "neighbor_10_keys": main_neighbor_json[i],
    })

# ---- standalone points (always own-verified; part of the checking pass by construction) ----
for j in range(ST_N):
    has_cil = bool(ST_HASCIL[j])
    has_cent = bool(ST_HASCENT[j])
    rows.append({
        "cell_key": f"S:{int(ST_X[j])}_{int(ST_Y[j])}_{int(ST_Z[j])}",
        "kind": "standalone",
        "nucleus_id": "",
        "voxel_x": int(ST_X[j]), "voxel_y": int(ST_Y[j]), "voxel_z": int(ST_Z[j]),
        "voxel_paste": f"{int(ST_X[j])}, {int(ST_Y[j])}, {int(ST_Z[j])}",
        "microns_predicted": "",
        "own_verified_identity": st_identity[j],
        "current_identity": st_identity[j],
        "identity_source": "own_verified",
        "community_top_identity": "",
        "community_votes_json": "",
        "last_updated": "",
        "has_cilium": 1 if has_cil else "",
        "cilium_checked": 1,
        "cilium_length_um": cilium_len_um(ST_CILSX[j], ST_CILSY[j], ST_CILSZ[j],
                                           ST_CILEX[j], ST_CILEY[j], ST_CILEZ[j]) if has_cil else "",
        "has_centriole": 1 if has_cent else "",
        "centriole_dist_um": dist_um(ST_X[j], ST_Y[j], ST_Z[j], ST_CENTX[j], ST_CENTY[j], ST_CENTZ[j]) if has_cent else "",
        "nucleus_volume_um3": "",
        "estimated_layer": st_layers[j],
        "neighbor_10_keys": st_neighbor_json[j],
    })

# ---- merged-nucleus sub-cells ----
for gid, subs in MG.items():
    parent = int(gid)
    if parent >= N:
        continue
    cil_patches = {p["i"]: p["cilium"] for p in MERGED_CIL.get(gid, [])}
    for sub_i, sub in enumerate(subs):
        cil = cil_patches.get(sub_i)
        cent = sub.get("centriole")
        rows.append({
            "cell_key": f"M:{int(NID[parent])}:{sub_i}",
            "kind": "merged_sub",
            "nucleus_id": int(NID[parent]),
            "voxel_x": int(NX[parent]), "voxel_y": int(NY[parent]), "voxel_z": int(NZ[parent]),
            "voxel_paste": f"{int(NX[parent])}, {int(NY[parent])}, {int(NZ[parent])}",
            "microns_predicted": "",
            "own_verified_identity": sub.get("type", ""),
            "current_identity": sub.get("type", ""),
            "identity_source": "own_verified",
            "community_top_identity": "",
            "community_votes_json": "",
            "last_updated": "",
            # Mirrors precompute_dashboard.py's existing convention: a merged sub with NO
            # MERGED_CIL patch is invisible to the checking pass entirely (not "checked, none
            # found") -- preserved as-is rather than silently redefined here.
            "has_cilium": 1 if cil else "",
            "cilium_checked": 1 if cil else "",
            "cilium_length_um": cilium_len_um(cil[0][0], cil[0][1], cil[0][2], cil[1][0], cil[1][1], cil[1][2]) if cil else "",
            "has_centriole": 1 if cent else "",
            "centriole_dist_um": dist_um(NX[parent], NY[parent], NZ[parent], cent[0], cent[1], cent[2]) if cent else "",
            "nucleus_volume_um3": "",
            "estimated_layer": main_layers[parent],
            "neighbor_10_keys": main_neighbor_json[parent],
        })

print(f"Total rows before dedup: {len(rows)} "
      f"(main nuclei: {N}, standalone: {ST_N}, merged sub-cells: {sum(len(v) for v in MG.values())})")

# Sanity/dedup: Soren's own STANDALONE dataset had 13 exact-duplicate entries pre-existing --
# same voxel position, same identity -- not something this script's logic could introduce.
# "neighbor_10_keys" is deliberately EXCLUDED from the equality check below: two rows sitting at
# the exact same physical coordinate are, by construction, indistinguishable to the KDTree, but
# cKDTree's tie-break for "which of the two coincident points is self vs. a distance-0 neighbour"
# is arbitrary -- so a truly-duplicate pair can end up with cosmetically different neighbour
# lists (each pointing at the other) even though every other field is identical. Comparing without
# that one field restores the original "same position + same identity = exact duplicate" test.
def _dedup_key(r):
    return {k: v for k, v in r.items() if k != "neighbor_10_keys"}

seen = {}
deduped_rows = []
exact_dupe_keys = []
for r in rows:
    k = r["cell_key"]
    if k in seen:
        if _dedup_key(r) == _dedup_key(seen[k]):
            exact_dupe_keys.append(k)
            continue
        else:
            print("WARNING: cell_key collision with different data, keeping both:", k)
    seen[k] = r
    deduped_rows.append(r)
rows = deduped_rows
if exact_dupe_keys:
    print(f"Dropped {len(exact_dupe_keys)} exact-duplicate standalone rows (same coord + identity, "
          f"pre-existing in Soren's own STANDALONE dataset): {sorted(set(exact_dupe_keys))}")

print(f"Total rows after dedup: {len(rows)}")

fieldnames = ["cell_key", "kind", "nucleus_id", "voxel_x", "voxel_y", "voxel_z", "voxel_paste",
              "microns_predicted", "own_verified_identity", "current_identity", "identity_source",
              "community_top_identity", "community_votes_json", "last_updated",
              "has_cilium", "cilium_checked", "cilium_length_um", "has_centriole",
              "centriole_dist_um", "nucleus_volume_um3", "estimated_layer", "neighbor_10_keys"]
with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fieldnames)
    w.writeheader()
    w.writerows(rows)

import os
print(f"Wrote {OUT} ({os.path.getsize(OUT)} bytes)")

keys = [r["cell_key"] for r in rows]
dupes = len(keys) - len(set(keys))
print(f"Duplicate cell_key count: {dupes} (should be 0)")

print("identity_source breakdown (main nuclei only):", collections.Counter(identity_source.tolist()))
print("has_cilium=1 rows:", sum(1 for r in rows if r["has_cilium"] == 1))
print("has_centriole=1 rows:", sum(1 for r in rows if r["has_centriole"] == 1))
print("rows with a nucleus_volume_um3:", sum(1 for r in rows if r["nucleus_volume_um3"] != ""))
print("estimated_layer breakdown (main nuclei):", collections.Counter(main_layers.tolist()))
