"""
Seed generator for the new "Master cell list" Google Sheet tab (2026-08-02) -- Soren wants a
single, always-current list of EVERY cell in the dataset (best-available identity), kept
separate from the raw discrepancy-report event log (the "New identifications" / "Confirmations"
/ "Discrepancies" sheets, which stay exactly as they are -- an append-only history of individual
report events, not a per-cell current-state table).

This script produces the ONE-TIME seed CSV Soren imports as the initial content of that new tab.
After that, Code.gs upserts each main-nucleus row live whenever a new_identification/confirmation/
discrepancy report comes in for it (see the "Master cell list" section in Code.gs.txt).

Reuses the exact same data-loading logic as precompute_dashboard.py / extract_lists.py (same
2026-08 bug fixes: NT byte convention, vascdata patch order, canon/mural3 name normalization) --
copied rather than imported so this stays a single, standalone, re-runnable file like its two
siblings, matching this project's "self-contained scripts" convention.

Row count: one row per main nucleus (144,118) + standalone point (6,013) + merged-nucleus
sub-cell (386) = 150,517 rows, covering literally every cell in the dataset per Soren's answer
to "which cells should appear in the list" (not just ones with verification activity).

Run: python3 build_master_cell_list.py
Output: /tmp/master_cell_list_seed.csv
"""
import re, json, base64, csv
import numpy as np

F = "/sessions/optimistic-intelligent-carson/mnt/MICrONS cell classifier/microns-neuroglancer-tool/ujump.html"
OUT = "/tmp/master_cell_list_seed.csv"

html = open(F, encoding='utf-8').read()

def get_block(name):
    m = re.search(r'<script type="application/json" id="%s">(.*?)</script>' % re.escape(name), html, re.S)
    return json.loads(m.group(1))

def b64u8(s):  return np.frombuffer(base64.b64decode(s), dtype=np.uint8)
def b64u32(s): return np.frombuffer(base64.b64decode(s), dtype='<u4')
def b64u16(s): return np.frombuffer(base64.b64decode(s), dtype='<u2')

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
CT_NAMES = [canon(mural3(n)) for n in D["CT_NAMES"]]

# ---- owndata (ground truth) ----
OD = get_block("owndata")
OWN_TYPE_NAMES = [canon(mural3(n)) for n in OD["TYPE_NAMES"]]
ov = OD["OVERRIDE"]
OWN_TYPE = b64u8(ov["TYPE"]).copy()

sa = OD["STANDALONE"]
ST_N = sa["N"]
ST_X = b64u32(sa["X"]); ST_Y = b64u32(sa["Y"]); ST_Z = b64u16(sa["Z"])
ST_TYPE = b64u8(sa["TYPE"]).copy()

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

for gid in MG:
    for sub in MG[gid]:
        if sub.get("type"):
            sub["type"] = canon(mural3(sub["type"]))

# ---- best identity (own override beats MICrONS -- same precedence Sonren approved: own-verified
# > community majority [not applicable to this static seed -- no live reports yet] > MICrONS-only
# > Unclassified) ----
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

rows = []

# ---- main nuclei ----
for i in range(N):
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
    })

# ---- standalone points (always own-verified by construction -- Soren found these himself,
# MICrONS's nucleus detector never produced any detection for them at all) ----
for j in range(ST_N):
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
    })

# ---- merged-nucleus sub-cells (one fused MICrONS detection covering >1 real cell -- nucleus_id
# here is the PARENT fused detection's real MICrONS nucleus ID, shared by every sub-cell in the
# group; cell_key's subIndex disambiguates them) ----
for gid, subs in MG.items():
    parent = int(gid)
    if parent >= N:
        continue
    for sub_i, sub in enumerate(subs):
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
        })

print(f"Total rows before dedup: {len(rows)} "
      f"(main nuclei: {N}, standalone: {ST_N}, merged sub-cells: {sum(len(v) for v in MG.values())})")

# Sanity/dedup: Soren's own STANDALONE dataset (owndata.STANDALONE arrays, loaded verbatim from
# ujump.html) turned out to contain 13 exact-duplicate entries -- same voxel position, same
# identity -- which pre-date this script (not something this script's logic could introduce,
# since it only reads sa["X"]/["Y"]/["Z"]/["TYPE"] arrays as-is; nothing here appends to them).
# A master list needs one row per real cell, so exact duplicates are dropped here (keeping the
# first), and flagged below for Soren to optionally clean up at the source later.
seen = {}
deduped_rows = []
exact_dupe_keys = []
for r in rows:
    k = r["cell_key"]
    if k in seen:
        if r == seen[k]:
            exact_dupe_keys.append(k)
            continue
        else:
            # Same key, DIFFERENT content -- a real key collision, not a harmless duplicate.
            # Make it visible instead of silently dropping or overwriting.
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
              "community_top_identity", "community_votes_json", "last_updated"]
with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fieldnames)
    w.writeheader()
    w.writerows(rows)

import os
print(f"Wrote {OUT} ({os.path.getsize(OUT)} bytes)")

# Sanity: cell_key must be unique across the whole list
keys = [r["cell_key"] for r in rows]
dupes = len(keys) - len(set(keys))
print(f"Duplicate cell_key count: {dupes} (should be 0)")

# Identity-source breakdown, for a quick sanity check against the dashboard's own numbers
import collections
print("identity_source breakdown (main nuclei only):", collections.Counter(identity_source.tolist()))
