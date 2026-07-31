"""
Companion export for the synaptic-connectivity Colab script: two small JSON lookups derived
from ujump.html's already-decoded root-ID/cell-type data, so the Colab script doesn't need to
re-implement the base64/BigInt root-ID reconstruction itself.

Run: python3 export_type_lookups.py
Outputs (into /tmp/dash/):
  root_ids_by_type_sample.json  -- up to SAMPLE_PER_TYPE segmented root IDs per cell type,
                                     to seed which cells the Colab script queries synapses for.
  root_id_to_type.json          -- EVERY segmented, identified cell's root ID -> its cell type,
                                     so a synaptic partner's root ID can be classified locally
                                     without a second CAVE query per partner.
"""
import re, json, base64
import numpy as np

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

print("root_ids_by_type_sample.json:", {t: len(v) for t, v in sample.items()})
print("root_id_to_type.json entries:", len(root_to_type))
print("sizes:", os.path.getsize("/tmp/dash/root_ids_by_type_sample.json"),
      os.path.getsize("/tmp/dash/root_id_to_type.json"))
