"""
Companion export for the synaptic-connectivity Colab script: small JSON lookups derived from
ujump.html's already-decoded root-ID/cell-type/layer data, so the Colab script doesn't need to
re-implement the base64/BigInt root-ID reconstruction (or the layer IDW estimate) itself.

Run: python3 export_type_lookups.py
Outputs (into /tmp/dash/):
  root_ids_by_type_sample.json  -- up to SAMPLE_PER_TYPE segmented root IDs per cell type,
                                     to seed which cells the Colab script queries synapses for.
  root_id_to_type.json          -- EVERY segmented, identified cell's root ID -> its cell type,
                                     so a synaptic partner's root ID can be classified locally
                                     without a second CAVE query per partner.
  root_id_to_layer.json         -- (2026-08) EVERY segmented, identified cell's root ID -> its
                                     estimated cortical layer, for the Colab script's new
                                     per-layer bucketing of the input/output synapses chart
                                     (Søren: "The Input vs. output synapses per cell type should
                                     have a possibility to select the cortical layer"). Same IDW
                                     estimate as build_master_cell_list.py's own
                                     estimate_layers_batch() (copied verbatim, not re-derived),
                                     keyed by root ID instead of nucleus_id/cell_key so the Colab
                                     script -- which only ever sees root IDs -- can use it
                                     directly without a second join.
"""
import re, json, base64
import numpy as np
from scipy.spatial import cKDTree

F = "/sessions/optimistic-intelligent-carson/mnt/MICrONS cell classifier/microns-neuroglancer-tool/ujump.html"
SAMPLE_PER_TYPE = 40
rng = np.random.default_rng(7)

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
    if "venular" in l: return "Venular smooth muscle cell"
    if "smooth muscle" in l: return "Smooth muscle cell"
    return "Pericyte"

LONG_NAMES = {
    "23P": "L2/3 pyramidal neuron", "4P": "L4 pyramidal neuron", "5P-IT": "L5 IT pyramidal neuron",
    "5P-ET": "L5 ET pyramidal neuron", "5P-NP": "L5 NP pyramidal neuron", "6P-CT": "L6 CT pyramidal neuron",
    "6P-IT": "L6 IT pyramidal neuron", "BC": "Basket cell", "MC": "Martinotti cell", "BPC": "Bipolar cell",
    "NGC": "Neurogliaform cell", "astrocyte": "Astrocyte", "oligo": "Oligodendrocyte", "OPC": "OPC",
    "microglia": "Microglia", "pericyte": "Pericyte",
}
def canon(name): return LONG_NAMES.get(name, name)

D = get_block("nucdata")
N = D["N"]
NT = b64u8(D["TB"])
NH = b64u8(D["HB"])
NLO = b64u32(D["LB"])
HI = D["HI"]
CT_NAMES = [canon(mural3(n)) for n in D["CT_NAMES"]]
# Voxel coords, needed only for the layer IDW estimate below -- not used anywhere else in this script.
NX = b64u32(D["XB"]); NY = b64u32(D["YB"]); NZ = b64u16(D["ZB"])

# ---- layerdata (pia / WM) -- copied verbatim from build_master_cell_list.py's own layer estimate,
# so root_id_to_layer.json agrees exactly with the Master cell list's own estimated_layer column
# for the same nucleus (same math, same reference thickness/bounds). See that file for the full
# rationale comment; not repeated here. ----
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

OD = get_block("owndata")
OWN_TYPE_NAMES = [canon(mural3(n)) for n in OD["TYPE_NAMES"]]
OWN_TYPE = b64u8(OD["OVERRIDE"]["TYPE"])

def root_id(i):
    h = NH[i]
    if h == 255:
        return None
    return str(int(HI[h]) * 4294967296 + int(NLO[i]))

by_type = {}
root_to_type = {}
root_to_layer = {}
for i in range(N):
    if OWN_TYPE[i] != 255:
        t = OWN_TYPE_NAMES[OWN_TYPE[i]]
    elif NT[i] != 16:
        t = CT_NAMES[NT[i]]
    else:
        continue  # unclassified -- not useful as a query seed or a partner label
    rid = root_id(i)
    if rid is None:
        continue
    root_to_type[rid] = t
    root_to_layer[rid] = str(main_layers[i])
    by_type.setdefault(t, []).append(rid)

sample = {}
for t, ids in by_type.items():
    arr = np.array(ids)
    if len(arr) > SAMPLE_PER_TYPE:
        arr = rng.choice(arr, size=SAMPLE_PER_TYPE, replace=False)
    sample[t] = arr.tolist()

import os
os.makedirs("/tmp/dash", exist_ok=True)
with open("/tmp/dash/root_ids_by_type_sample.json", "w") as f:
    json.dump(sample, f)
with open("/tmp/dash/root_id_to_type.json", "w") as f:
    json.dump(root_to_type, f)
with open("/tmp/dash/root_id_to_layer.json", "w") as f:
    json.dump(root_to_layer, f)

print("root_ids_by_type_sample.json:", {t: len(v) for t, v in sample.items()})
print("root_id_to_type.json entries:", len(root_to_type))
layer_counts = {}
for lab in root_to_layer.values():
    layer_counts[lab] = layer_counts.get(lab, 0) + 1
print("root_id_to_layer.json entries:", len(root_to_layer), "-- layer counts:", layer_counts)
print("sizes:", os.path.getsize("/tmp/dash/root_ids_by_type_sample.json"),
      os.path.getsize("/tmp/dash/root_id_to_type.json"),
      os.path.getsize("/tmp/dash/root_id_to_layer.json"))
