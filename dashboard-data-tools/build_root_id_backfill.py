"""
One-time companion backfill CSV for the "Master cell list" Google Sheet tab (2026-08-02) --
Soren: "there are no rootIDs in the master cell list. There should be! Both the MICrONS predicted
ones and the reported rootIDs."

This script produces ONLY the MICrONS-side root ID (the current default segmentation root ID for
each cell, decoded from ujump.html's own embedded NH/NLO/HI packing -- the exact same decode as
the live tool's own rootId(i) JS function, see ujump.html around line 395). It does NOT touch
community-reported/proposed root IDs -- those live in the "Root ID proposals" Apps Script sheet,
which this Python script has no access to; that side is handled entirely inside Code.gs.txt by
backfillCommunityRootIds() (one-time, for historical proposals) and upsertMasterCellRootIds()
(live, called on every new propose_root_id/remove_root_id report from that point on).

Deliberately a SEPARATE small CSV (cell_key, microns_root_id -- two columns only) rather than
re-running build_master_cell_list.py's full seed and asking Soren to re-import the whole "Master
cell list" tab: the live sheet has already accumulated real report-driven updates (current_identity/
identity_source/community_top_identity/community_votes_json/last_updated, and now hopefully
community_majority values from backfillCommunityIdentities()) since it was first seeded -- a full
re-import would silently REVERT all of that back to seed-time values. Code.gs.txt's
backfillMicronsRootIds() joins this small CSV onto the existing "Master cell list" rows by cell_key
and writes ONLY the microns_root_id column, leaving every other column (and every live update
already recorded there) untouched.

Root ID packing (same for every root ID computed in this project, e.g. rootId() in ujump.html):
  root_id = HI[NH[i]] * 2**32 + NLO[i]   (h == 255 means "no root ID / unsegmented")
NH is a 1-byte-per-nucleus index into the small HI array (only 3 distinct high-32-bit values exist
in this dataset, per prior investigation); NLO is the 4-byte low half. Cross-checked against
ujump.html's own JS decode (BigInt arithmetic there vs. Python's native arbitrary-precision ints
here) for the first 8 nuclei -- identical root ID strings both ways.

Merged-nucleus sub-cells (kind="merged_sub" in the main seed) all share their PARENT nucleus's
root ID here -- MICrONS's automatic detector fused them into ONE segmentation blob in the first
place, so there is no separate per-sub-cell root ID to decode; this mirrors how
build_master_cell_list.py already has merged-sub rows reuse their parent's estimated_layer/
neighbor_10_keys for the same underlying reason. Standalone points (kind="standalone") never have
a MICrONS root ID at all (MICrONS's automatic nucleus detector never found them), so they are
omitted from this CSV entirely -- Code.gs.txt's join only ever fills in a value where one exists,
never overwrites with blank.

Run: python3 build_root_id_backfill.py
Output: /tmp/root_id_backfill.csv
Import that file into the same Google Sheet as a NEW tab named exactly "Root ID backfill"
(Insert new sheet, not "append to current sheet" -- same import mistake Soren hit once before with
the main seed), then run backfillMicronsRootIds() once from the Apps Script editor.
"""
import re, json, base64, csv
import numpy as np

F = "/sessions/optimistic-intelligent-carson/mnt/MICrONS cell classifier/microns-neuroglancer-tool/ujump.html"
OUT = "/tmp/root_id_backfill.csv"

html = open(F, encoding='utf-8').read()

def get_block(name):
    m = re.search(r'<script type="application/json" id="%s">(.*?)</script>' % re.escape(name), html, re.S)
    return json.loads(m.group(1))

def b64u8(s):  return np.frombuffer(base64.b64decode(s), dtype=np.uint8)
def b64u32(s): return np.frombuffer(base64.b64decode(s), dtype='<u4')

# ---- nucdata (main nuclei) ----
D = get_block("nucdata")
N = D["N"]
NID = b64u32(D["NB"])
NH = b64u8(D["HB"])
NLO = b64u32(D["LB"])
HI = D["HI"]

def root_id(i):
    h = int(NH[i])
    if h == 255:
        return ""
    return str(HI[h] * 4294967296 + int(NLO[i]))

main_root = [root_id(i) for i in range(N)]
n_with_root = sum(1 for r in main_root if r)
print(f"Main nuclei: {N}, with a MICrONS root ID: {n_with_root}, unsegmented: {N - n_with_root}")

# ---- mergeddata (sub-cells reuse their parent's root ID) ----
MG = get_block("mergeddata")

rows = []
for i in range(N):
    if main_root[i]:
        rows.append({"cell_key": f"N:{int(NID[i])}", "microns_root_id": main_root[i]})

merged_rows = 0
for gid, subs in MG.items():
    parent = int(gid)
    if parent >= N:
        continue
    parent_root = main_root[parent]
    if not parent_root:
        continue
    for sub_i in range(len(subs)):
        rows.append({"cell_key": f"M:{int(NID[parent])}:{sub_i}", "microns_root_id": parent_root})
        merged_rows += 1

print(f"Merged sub-cell rows (sharing their parent's root ID): {merged_rows}")
print(f"Total rows in backfill CSV: {len(rows)}")

with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=["cell_key", "microns_root_id"])
    w.writeheader()
    w.writerows(rows)

import os
print(f"Wrote {OUT} ({os.path.getsize(OUT)} bytes)")

keys = [r["cell_key"] for r in rows]
dupes = len(keys) - len(set(keys))
print(f"Duplicate cell_key count: {dupes} (should be 0)")
