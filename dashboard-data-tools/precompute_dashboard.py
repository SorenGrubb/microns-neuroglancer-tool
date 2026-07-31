"""
Precompute a compact aggregate JSON from ujump.html's embedded static data, for the
µJump dashboard (Plotly). This is a ONE-TIME offline step (not something the browser
recomputes) since some of it (144k-point layer estimation, 150k-point nearest-neighbor
composition) is too slow to redo live in a browser tab.

Run: python3 precompute_dashboard.py
Output: dashboard_data.json

2026-08-xx correction pass (fixes 3 data-accuracy bugs found by Søren comparing dashboard
counts against µJump's own bulk export -- see comments marked "FIX" below):
  1. NT (broad-classifier index) off-by-one: raw byte 0 means Unclassified and raw bytes
     1..16 map to CT_NAMES[byte-1] in the live tool -- this script previously assumed the
     opposite convention (0..15 direct index, 16=sentinel), which silently relabelled every
     true-unclassified nucleus as "23P" and every true pericyte (raw byte 16) as Unclassified,
     while making raw byte 15 (real: oligodendrocyte) masquerade as "Pericyte".
  2. Own-verified "Mural cell" rows were never split into Pericyte / Smooth muscle cell /
     Venular smooth muscle cell -- that split is NOT static in `owndata`, it's applied at
     runtime by three later patch blocks (`vascdata`, `vascdata8`, `vascdata9`) that overwrite
     OWN_TYPE/ST_TYPE/MERGED_PATCH entries based on an offline vessel-distance pass. This
     script now applies those same three patches, in the same order ujump.html's own <script>
     tags execute them in, before computing any per-type counts.
  3. Primary-cilium / nucleus-to-centriole stats were gated on `identity_source=="own_verified"`
     for main nuclei -- which silently dropped every organelle annotation Søren added to a
     nucleus whose TYPE came from MICrONS and never needed overriding (e.g. a neuron he added
     a centriole/cilium to without needing to "correct" its already-correct MICrONS type).
     Length/distance measurements are now collected from ANY main nucleus with the relevant
     flag set, regardless of identity source; only the cilium-presence PERCENTAGE (which needs
     a fair "checked and not found" denominator) stays restricted to the dedicated own-verified
     checking pass, with the extra true-positive finds outside that pass reported separately
     for transparency rather than silently folded in or dropped.
"""
import re, json, base64
import numpy as np
from scipy.spatial import cKDTree

F = "/sessions/optimistic-intelligent-carson/mnt/MICrONS cell classifier/microns-neuroglancer-tool/ujump.html"
OUT = "/tmp/dash/dashboard_data.json"

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

# MICrONS's broad-classifier CT_NAMES uses lowercase abbreviations for astrocyte/microglia/oligo/
# pericyte, while Søren's own-verified dataset uses capitalized full names (Astrocyte/Microglia) --
# without reconciling these, the same biological category fragments into two separate bars in
# every chart below (e.g. "astrocyte": 1672 MICrONS-only + "Astrocyte": 1497 own-verified, when
# it should be one "Astrocyte" bar). Canonicalize to long-form names (reusing the same LONG_NAMES
# mapping used for on-screen labels in ujump.html's own LABELS dict) so MICrONS and own-verified
# entries of the same category merge into one bar everywhere.
LONG_NAMES = {
    "23P": "L2/3 pyramidal neuron", "4P": "L4 pyramidal neuron", "5P-IT": "L5 IT pyramidal neuron",
    "5P-ET": "L5 ET pyramidal neuron", "5P-NP": "L5 NP pyramidal neuron", "6P-CT": "L6 CT pyramidal neuron",
    "6P-IT": "L6 IT pyramidal neuron", "BC": "Basket cell", "MC": "Martinotti cell", "BPC": "Bipolar cell",
    "NGC": "Neurogliaform cell", "astrocyte": "Astrocyte", "oligo": "Oligodendrocyte", "OPC": "OPC",
    "microglia": "Microglia", "pericyte": "Pericyte",
}

def canon(name):
    return LONG_NAMES.get(name, name)

# ---------------------------------------------------------------- nucdata (main nuclei) ----
D = get_block("nucdata")
N = D["N"]
NX = b64u32(D["XB"]); NY = b64u32(D["YB"]); NZ = b64u16(D["ZB"])
NT = b64u8(D["TB"])                       # FIX: 0 = unclassified; 1..16 -> CT_NAMES[value-1]
NV = b64f32(D["VB"])                      # nucleus volume um3, 0 = not available
CT_NAMES = [canon(mural3(n)) for n in D["CT_NAMES"]]   # 16 broad MICrONS categories
CT_CLASS = D["CT_CLASS"]                  # excitatory_neuron / inhibitory_neuron / nonneuron

# ---------------------------------------------------------------- layerdata (pia / WM) -----
LD = get_block("layerdata")
PIA_X = b64f32(LD["PIA"]["X"]); PIA_Y = b64f32(LD["PIA"]["Y"]); PIA_Z = b64f32(LD["PIA"]["Z"])
WM_X  = b64f32(LD["WM"]["X"]);  WM_Y  = b64f32(LD["WM"]["Y"]);  WM_Z  = b64f32(LD["WM"]["Z"])
SURFACE_Y_OFFSET_NM = 0  # matches the live constant in ujump.html as of 2026-07-31

LEDDEROSE_REF_THICK_UM = 900.0
LEDDEROSE_ABS_BOUNDS = [
    ("Layer 1", 0, 100), ("Layer 2/3", 100, 250), ("Layer 4", 250, 350),
    ("Layer 5a", 350, 450), ("Layer 5b", 450, 600),
    ("Layer 6a", 600, 800), ("Layer 6b", 800, 900),
]

def layer_bounds_for_thickness(thick_um):
    return [(name, lo / LEDDEROSE_REF_THICK_UM * thick_um, hi / LEDDEROSE_REF_THICK_UM * thick_um)
            for name, lo, hi in LEDDEROSE_ABS_BOUNDS]

# Build k-NN trees over the pia/WM point clouds in the x,z plane (nm), matching idwSurfaceY's
# 2D (x,z) query -- the traced surfaces are functions of (x,z) giving a y height.
pia_xz = np.stack([PIA_X, PIA_Z], axis=1)
wm_xz  = np.stack([WM_X, WM_Z], axis=1)
pia_tree = cKDTree(pia_xz)
wm_tree  = cKDTree(wm_xz)

def idw_surface_y_batch(qxz, tree, py, k=8):
    d, idx = tree.query(qxz, k=k)
    d = np.atleast_2d(d); idx = np.atleast_2d(idx)
    d2 = d ** 2
    # exact-match shortcut (matches the JS idwSurfaceY: if nearest d2<1, use it directly)
    exact_mask = d2[:, 0] < 1
    w = 1.0 / (d2 + 1.0)
    ysum = (w * py[idx]).sum(axis=1)
    wsum = w.sum(axis=1)
    y = ysum / wsum
    y[exact_mask] = py[idx[exact_mask, 0]]
    return y

def estimate_layers_batch(vx, vy, vz):
    """vx,vy,vz in voxel ints (arrays). Returns array of layer label strings."""
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
    labels[~valid] = "Unknown"
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

print("Estimating cortical layer for all", N, "main nuclei ...")
main_layers = estimate_layers_batch(NX, NY, NZ)

# ---------------------------------------------------------------- owndata (ground truth) ---
OD = get_block("owndata")
OWN_TYPE_NAMES = [canon(mural3(n)) for n in OD["TYPE_NAMES"]]   # base 14 categories (0-13)
ov = OD["OVERRIDE"]
OWN_TYPE = b64u8(ov["TYPE"]).copy()   # copy: about to be patched in place, like the live JS does
OWN_CENTX = b64u32(ov["CENTX"]); OWN_CENTY = b64u32(ov["CENTY"]); OWN_CENTZ = b64u16(ov["CENTZ"])
OWN_HASCENT = b64u8(ov["HASCENT"])

sa = OD["STANDALONE"]
ST_N = sa["N"]
ST_X = b64u32(sa["X"]); ST_Y = b64u32(sa["Y"]); ST_Z = b64u16(sa["Z"])
ST_TYPE = b64u8(sa["TYPE"]).copy()
ST_CENTX = b64u32(sa["CENTX"]); ST_CENTY = b64u32(sa["CENTY"]); ST_CENTZ = b64u16(sa["CENTZ"])
ST_HASCENT = b64u8(sa["HASCENT"])

print("Estimating cortical layer for all", ST_N, "standalone points ...")
st_layers = estimate_layers_batch(ST_X, ST_Y, ST_Z)

# ---------------------------------------------------------------- mergeddata ---------------
# (loaded before the vascdata patches below, since those patches also rewrite merged sub-types)
MG = get_block("mergeddata")

# ---------------------------------------------------------------- vascdata / 8 / 9 (FIX #2) -
# Generic "Mural cell" (own-verified) is never the final displayed type in ujump.html -- it's
# always resolved into Pericyte / Smooth muscle cell / Venular smooth muscle cell (folding
# "High order pericyte" back into plain Pericyte via mural3, same as the live tool) by these
# three patch blocks, applied in the exact order their <script> tags run in the live page:
# vascdata (original 10um-capped pass, partial coverage) -> vascdata8 (full, no-cap pass,
# supersedes vascdata) -> vascdata9 (final correction, re-applies the 10um cap to 71 cells).
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
        if not grp:
            continue
        for p in patches:
            if p["i"] < len(grp):
                grp[p["i"]]["type"] = canon(mural3(p["type"]))

apply_vasc_patch("vascdata", extra_names_key="TYPE_NAMES_EXTRA")
apply_vasc_patch("vascdata8")
apply_vasc_patch("vascdata9", single_name_key="TYPE_NAME_NEW")

# Any remaining merged-sub "type" strings not touched by a vascdata* patch still need the
# normal canon(mural3(...)) normalization pass (matches ujump.html's own MG normalization).
for gid in MG:
    for sub in MG[gid]:
        if sub.get("type"):
            sub["type"] = canon(mural3(sub["type"]))

# ---------------------------------------------------------------- cildata (cilia) ----------
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

# ================================================================================
# 1) "Best available identity" per main nucleus + standalone point (own override
#    beats MICrONS prediction; unclassified only if neither exists).
# ================================================================================
best_identity = np.empty(N, dtype=object)
identity_source = np.empty(N, dtype=object)  # own_verified / micronsOnly / unclassified
for i in range(N):
    if OWN_TYPE[i] != 255:
        best_identity[i] = OWN_TYPE_NAMES[OWN_TYPE[i]]
        identity_source[i] = "own_verified"
    elif NT[i] != 0:                              # FIX #1: 0 = unclassified sentinel
        best_identity[i] = CT_NAMES[NT[i] - 1]     # FIX #1: raw 1..16 -> CT_NAMES[value-1]
        identity_source[i] = "micronsOnly"
    else:
        best_identity[i] = "Unclassified"
        identity_source[i] = "unclassified"

st_identity = np.array([OWN_TYPE_NAMES[t] for t in ST_TYPE], dtype=object)

# ---- Graph 1: # of cells per cell type in the whole dataset (main nuclei + standalone) -----
import collections
counts_main = collections.Counter(best_identity.tolist())
counts_standalone = collections.Counter(st_identity.tolist())
combined_counts = collections.Counter()
combined_counts.update(counts_main)
combined_counts.update(counts_standalone)
# also add merged-nucleus sub-identifications as their own extra tally (they represent real,
# distinct cells the main per-nucleus count can't see, since they share one detected nucleus)
merged_counts = collections.Counter()
for gid in MG:
    for sub in MG[gid]:
        merged_counts[sub["type"]] += 1
combined_counts.update(merged_counts)

cells_per_type = {
    "microns_predicted_only": dict(counts_main.most_common()),
    "combined_best_identity": dict(combined_counts.most_common()),
    "merged_nucleus_sub_identifications": dict(merged_counts.most_common()),
    "note": "microns_predicted_only counts every main-nucleus's single best identity "
            "(own-verified override wins over the MICrONS prediction where both exist). "
            "combined_best_identity adds standalone points AND merged-nucleus sub-identifications "
            "(cells MICrONS's nucleus detector fused into one detection, but which are two real, "
            "distinct cells) as additional tallies. merged_nucleus_sub_identifications is that "
            "same tally shown on its own for transparency. Counts are from the static dataset "
            "baked into ujump.html at generation time -- they will run somewhat behind the live "
            "µJump bulk export, which also reflects newer community-submitted identifications."
}

# ---- Graph 2: # of cells per cell type per cortical layer -----
layer_order = ["Leptomeninges", "Layer 1", "Layer 2/3", "Layer 4", "Layer 5a", "Layer 5b",
               "Layer 6a", "Layer 6b", "White matter", "Unknown"]
per_type_per_layer = collections.defaultdict(lambda: collections.Counter())
for i in range(N):
    per_type_per_layer[best_identity[i]][main_layers[i]] += 1
for j in range(ST_N):
    per_type_per_layer[st_identity[j]][st_layers[j]] += 1
cells_per_type_per_layer = {
    "layer_order": layer_order,
    "data": {t: dict(c) for t, c in per_type_per_layer.items()}
}

# ---- Graph 3/4: primary cilia % and length per cell type -----
def cilium_len_um(sx, sy, sz, ex, ey, ez):
    dx = (float(ex) - float(sx)) * 4
    dy = (float(ey) - float(sy)) * 4
    dz = (float(ez) - float(sz)) * 40
    return (dx * dx + dy * dy + dz * dz) ** 0.5 / 1000.0

cilium_by_type = collections.defaultdict(list)
haspresent_by_type = collections.defaultdict(lambda: [0, 0])  # [with_cilium, total_checked]
extra_positive_outside_checked_pass = collections.defaultdict(int)  # FIX #3

for i in range(N):
    t = best_identity[i]
    if identity_source[i] == "own_verified":
        # Part of Søren's dedicated checking pass -- a fair "checked and not found" denominator.
        haspresent_by_type[t][1] += 1
        if OWN_HASCIL[i]:
            haspresent_by_type[t][0] += 1
            cilium_by_type[t].append(cilium_len_um(OWN_CILSX[i], OWN_CILSY[i], OWN_CILSZ[i],
                                                     OWN_CILEX[i], OWN_CILEY[i], OWN_CILEZ[i]))
    elif OWN_HASCIL[i]:
        # FIX #3: a cilium was annotated on a nucleus whose TYPE came straight from MICrONS
        # (never needed overriding) -- a genuine positive finding, but not part of a systematic
        # checking pass, so it's counted for length/scatter but kept out of the percent-checked
        # denominator (folding it in would silently imply every OTHER MICrONS-typed cell of that
        # type was "checked and cilium-free", which nobody verified).
        cilium_by_type[t].append(cilium_len_um(OWN_CILSX[i], OWN_CILSY[i], OWN_CILSZ[i],
                                                 OWN_CILEX[i], OWN_CILEY[i], OWN_CILEZ[i]))
        extra_positive_outside_checked_pass[t] += 1

for j in range(ST_N):
    t = st_identity[j]
    haspresent_by_type[t][1] += 1
    if ST_HASCIL[j]:
        haspresent_by_type[t][0] += 1
        cilium_by_type[t].append(cilium_len_um(ST_CILSX[j], ST_CILSY[j], ST_CILSZ[j],
                                                 ST_CILEX[j], ST_CILEY[j], ST_CILEZ[j]))

# merged-nucleus sub-cilia (from CD.MERGED_CIL patches)
for gid, patches in MERGED_CIL.items():
    grp = MG.get(gid)
    if not grp:
        continue
    for patch in patches:
        sub_i = patch["i"]
        if sub_i >= len(grp):
            continue
        t = grp[sub_i]["type"]
        (sx, sy, sz), (ex, ey, ez) = patch["cilium"]
        haspresent_by_type[t][1] += 1
        haspresent_by_type[t][0] += 1
        cilium_by_type[t].append(cilium_len_um(sx, sy, sz, ex, ey, ez))

primary_cilia = {
    "percent_with_cilium_by_type": {
        t: {"with_cilium": v[0], "checked": v[1],
            "percent": round(100.0 * v[0] / v[1], 1) if v[1] else None}
        for t, v in haspresent_by_type.items() if v[1] >= 5  # skip near-empty types
    },
    "length_um_by_type": {t: [round(x, 2) for x in v] for t, v in cilium_by_type.items() if len(v) >= 3},
    "extra_positive_findings_outside_checked_pass": dict(extra_positive_outside_checked_pass),
    "note": "percent_with_cilium_by_type is restricted to Søren's dedicated own-verified/"
            "standalone/merged-sub checking pass (where 'checked' is a real denominator, "
            "including checked-and-not-found cases) -- MICrONS publishes no organelle-level "
            "annotation, so this can never cover the whole dataset. length_um_by_type includes "
            "EVERY annotated cilium regardless of whether its nucleus's type was own-verified "
            "or came straight from MICrONS (e.g. a neuron whose MICrONS type didn't need "
            "correcting). extra_positive_findings_outside_checked_pass shows, per type, how many "
            "of those length measurements came from outside the checked-pass denominator, for "
            "transparency about the percent figures' true coverage."
}

# ---- Graph 5: nucleus-to-centriole distance per cell type -----
def dist_um(x1, y1, z1, x2, y2, z2):
    dx = (float(x1) - float(x2)) * 4
    dy = (float(y1) - float(y2)) * 4
    dz = (float(z1) - float(z2)) * 40
    return (dx * dx + dy * dy + dz * dz) ** 0.5 / 1000.0

nuc_cent_by_type = collections.defaultdict(list)
for i in range(N):
    # FIX #3: no longer gated on identity_source -- any main nucleus with a centriole
    # annotation counts, bucketed by its best available identity (own-verified or MICrONS).
    if not OWN_HASCENT[i]:
        continue
    t = best_identity[i]
    nuc_cent_by_type[t].append(dist_um(NX[i], NY[i], NZ[i], OWN_CENTX[i], OWN_CENTY[i], OWN_CENTZ[i]))
for j in range(ST_N):
    if not ST_HASCENT[j]:
        continue
    t = st_identity[j]
    nuc_cent_by_type[t].append(dist_um(ST_X[j], ST_Y[j], ST_Z[j], ST_CENTX[j], ST_CENTY[j], ST_CENTZ[j]))
for gid in MG:
    parent = int(gid)
    for sub in MG[gid]:
        c = sub.get("centriole")
        if not c:
            continue
        t = sub["type"]
        nuc_cent_by_type[t].append(dist_um(NX[parent], NY[parent], NZ[parent], c[0], c[1], c[2]))

nucleus_to_centriole = {t: [round(x, 2) for x in v] for t, v in nuc_cent_by_type.items() if len(v) >= 3}

# ---- Graph 6: identified vs unclassified (main nuclei population) -----
identified_vs_unclassified = {
    "identified": int((identity_source != "unclassified").sum()),
    "unclassified": int((identity_source == "unclassified").sum()),
    "note": "Main-nucleus population only (N=%d); standalone points are all identified by definition." % N
}

# ---- Graph 7 static baseline: MICrONS-predicted vs verified-by-us counts -----
# (live "user-identified" / community count is added client-side from the Apps Script endpoint)
predicted_vs_verified_static = {
    "microns_predicted_no_override": int(((identity_source == "micronsOnly")).sum()),
    "verified_by_us": int((identity_source == "own_verified").sum()) + ST_N + sum(merged_counts.values()),
    "unclassified": int((identity_source == "unclassified").sum()),
}

# ---- Graph 8: nucleus volume per cell type (sampled) -----
rng = np.random.default_rng(42)
vol_by_type = collections.defaultdict(list)
for i in range(N):
    v = NV[i]
    if v and v > 0:
        vol_by_type[best_identity[i]].append(float(v))
MAX_SAMPLE = 800
nucleus_volume_um3 = {}
for t, vals in vol_by_type.items():
    arr = np.array(vals)
    if len(arr) > MAX_SAMPLE:
        arr = rng.choice(arr, size=MAX_SAMPLE, replace=False)
    nucleus_volume_um3[t] = [round(float(x), 2) for x in arr]

# ---- Graph 9: 3-nearest-neighbor type composition per cell type -----
print("Building spatial index over", N + ST_N, "identified points for neighbor composition ...")
all_x = np.concatenate([NX.astype(np.float64) * 4, ST_X.astype(np.float64) * 4])
all_y = np.concatenate([NY.astype(np.float64) * 4, ST_Y.astype(np.float64) * 4])
all_z = np.concatenate([NZ.astype(np.float64) * 40, ST_Z.astype(np.float64) * 40])
all_identity = np.concatenate([best_identity, st_identity])
all_is_id = (all_identity != "Unclassified")

pts = np.stack([all_x, all_y, all_z], axis=1)
tree_all = cKDTree(pts)
# query k=4 (self + 3 neighbours), only for identified points, restricted to identified targets
id_pts_idx = np.where(all_is_id)[0]
print(" ", len(id_pts_idx), "identified points; querying k=4 nearest ...")
dists, nbr_idx = tree_all.query(pts[id_pts_idx], k=4)
neighbor_composition = collections.defaultdict(lambda: collections.Counter())
for row_i, src_idx in enumerate(id_pts_idx):
    src_type = all_identity[src_idx]
    for col in range(1, 4):  # skip col 0 = self
        nb = nbr_idx[row_i, col]
        nb_type = all_identity[nb]
        if nb_type == "Unclassified":
            continue
        neighbor_composition[src_type][nb_type] += 1

neighbor_composition_out = {t: dict(c.most_common(10)) for t, c in neighbor_composition.items()}

# ================================================================================
out = {
    "meta": {
        "generated_from": "ujump.html (static embedded data only)",
        "generated": "2026-07-31",
        "n_main_nuclei": N, "n_standalone": ST_N, "n_merged_groups": len(MG),
        "n_merged_sub_identifications": sum(len(v) for v in MG.values()),
    },
    "cells_per_type": cells_per_type,
    "cells_per_type_per_layer": cells_per_type_per_layer,
    "primary_cilia": primary_cilia,
    "nucleus_to_centriole_um": nucleus_to_centriole,
    "identified_vs_unclassified": identified_vs_unclassified,
    "predicted_vs_verified_static": predicted_vs_verified_static,
    "nucleus_volume_um3": nucleus_volume_um3,
    "neighbor_composition": neighbor_composition_out,
}

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f)

import os
print("\nWrote", OUT, "(", os.path.getsize(OUT), "bytes )")
for k in out:
    print(" -", k)
