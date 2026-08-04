"""
Applies new_cells_join_plan.json (built by build_new_cells_join.py) as an actual binary patch to
ujump.html's owndata/cildata JSON blocks: adds the 363 new-cell candidates Soren confirmed as
trusted ("The 462 candidates are solid, add them as new verified cells, I trust them"), minus the
99 excluded for red text/fill formatting.

Extends (not just mutates in place) the OVERRIDE arrays (180 new claims onto previously-unclaimed
MICrONS nuclei, all N=144118-length arrays -- mutate existing slots) and the STANDALONE arrays (183
brand-new points -- grow every parallel array by 183 and bump N). Adds new TYPE_NAMES/AUTH_STRINGS
entries where the plan's type/author strings don't already exist verbatim in those lookup tables.
Also extends cildata's sparse OV_IDX/ST_IDX patch arrays for the entries that carry full cilium
data (153 of the 363).

Run against a scratch copy FIRST (see PATCH_TARGET env override below), verify by re-decoding and
checking exact values at the target indices, run node --check on every extracted <script> block,
THEN run again with PATCH_TARGET unset (defaults to the real file).
"""
import re, json, base64, os
import numpy as np

F = os.environ.get("PATCH_TARGET", "/sessions/optimistic-intelligent-carson/mnt/MICrONS cell classifier/microns-neuroglancer-tool/ujump.html")
PLAN = "/tmp/dash/new_cells_join_plan.json"

html = open(F, encoding="utf-8").read()

def get_block(name):
    m = re.search(r'(<script type="application/json" id="%s">)(.*?)(</script>)' % re.escape(name), html, re.S)
    return m, json.loads(m.group(2))

def b64u8(s):  return np.frombuffer(base64.b64decode(s), dtype=np.uint8)
def b64u32(s): return np.frombuffer(base64.b64decode(s), dtype='<u4')
def b64u16(s): return np.frombuffer(base64.b64decode(s), dtype='<u2')
def enc(arr): return base64.b64encode(np.ascontiguousarray(arr).tobytes()).decode("ascii")

plan = json.load(open(PLAN))
add = plan["add"]
print("Plan: %d entries to add" % len(add))

OD_m, OD = get_block("owndata")
CD_m, CD = get_block("cildata")

TYPE_NAMES = OD["TYPE_NAMES"]
AUTH_STRINGS = OD["AUTH_STRINGS"]

# ---- 1) Extend TYPE_NAMES / AUTH_STRINGS lookup tables as needed ----
type_to_idx = {name: i for i, name in enumerate(TYPE_NAMES)}
for e in add:
    if e["type"] not in type_to_idx:
        type_to_idx[e["type"]] = len(TYPE_NAMES)
        TYPE_NAMES.append(e["type"])
        print("Added new TYPE_NAMES entry:", e["type"], "-> index", type_to_idx[e["type"]])

auth_to_idx = {s: i for i, s in enumerate(AUTH_STRINGS)}
for e in add:
    a = e["authors"] or ""
    if a not in auth_to_idx:
        auth_to_idx[a] = len(AUTH_STRINGS)
        AUTH_STRINGS.append(a)
        print("Added new AUTH_STRINGS entry:", repr(a), "-> index", auth_to_idx[a])

OD["TYPE_NAMES"] = TYPE_NAMES
OD["AUTH_STRINGS"] = AUTH_STRINGS

# ---- 2) OVERRIDE: mutate existing N=144118-length arrays at nucdata_index ----
ov = OD["OVERRIDE"]
OV_TYPE = b64u8(ov["TYPE"]).copy()
OV_AUTH = b64u8(ov["AUTH"]).copy()
OV_CENTX = b64u32(ov["CENTX"]).copy(); OV_CENTY = b64u32(ov["CENTY"]).copy(); OV_CENTZ = b64u16(ov["CENTZ"]).copy()
OV_HASCENT = b64u8(ov["HASCENT"]).copy()

override_entries = [e for e in add if e["kind"] == "override"]
standalone_entries = [e for e in add if e["kind"] == "standalone"]
assert len(override_entries) + len(standalone_entries) == len(add)

for e in override_entries:
    idx = e["nucdata_index"]
    assert OV_TYPE[idx] == 255, "expected unclaimed override slot at nucdata index %d, got TYPE=%d" % (idx, OV_TYPE[idx])
    OV_TYPE[idx] = type_to_idx[e["type"]]
    OV_AUTH[idx] = auth_to_idx[e["authors"] or ""]
    if e["centriole"]:
        cx, cy, cz = e["centriole"]
        OV_CENTX[idx] = round(cx); OV_CENTY[idx] = round(cy); OV_CENTZ[idx] = round(cz)
        OV_HASCENT[idx] = 1

ov["TYPE"] = enc(OV_TYPE); ov["AUTH"] = enc(OV_AUTH)
ov["CENTX"] = enc(OV_CENTX); ov["CENTY"] = enc(OV_CENTY); ov["CENTZ"] = enc(OV_CENTZ); ov["HASCENT"] = enc(OV_HASCENT)
print("Patched %d OVERRIDE entries" % len(override_entries))

# ---- 3) STANDALONE: grow every parallel array by len(standalone_entries) ----
st = OD["STANDALONE"]
ST_X = b64u32(st["X"]).copy(); ST_Y = b64u32(st["Y"]).copy(); ST_Z = b64u16(st["Z"]).copy()
ST_TYPE = b64u8(st["TYPE"]).copy(); ST_AUTH = b64u8(st["AUTH"]).copy()
ST_CENTX = b64u32(st["CENTX"]).copy(); ST_CENTY = b64u32(st["CENTY"]).copy(); ST_CENTZ = b64u16(st["CENTZ"]).copy()
ST_HASCENT = b64u8(st["HASCENT"]).copy()

old_N = st["N"]
assert old_N == len(ST_X) == len(ST_Y) == len(ST_Z) == len(ST_TYPE) == len(ST_AUTH) == len(ST_CENTX) == len(ST_HASCENT)

new_X, new_Y, new_Z = [], [], []
new_TYPE, new_AUTH = [], []
new_CENTX, new_CENTY, new_CENTZ, new_HASCENT = [], [], [], []
standalone_new_index = {}  # id(entry) -> new ST index, for the cildata step below

for k, e in enumerate(standalone_entries):
    x, y, z = e["nuc_voxel"]
    new_X.append(round(x)); new_Y.append(round(y)); new_Z.append(round(z))
    new_TYPE.append(type_to_idx[e["type"]])
    new_AUTH.append(auth_to_idx[e["authors"] or ""])
    if e["centriole"]:
        cx, cy, cz = e["centriole"]
        new_CENTX.append(round(cx)); new_CENTY.append(round(cy)); new_CENTZ.append(round(cz)); new_HASCENT.append(1)
    else:
        new_CENTX.append(0); new_CENTY.append(0); new_CENTZ.append(0); new_HASCENT.append(0)
    standalone_new_index[id(e)] = old_N + k

ST_X = np.concatenate([ST_X, np.array(new_X, dtype='<u4')])
ST_Y = np.concatenate([ST_Y, np.array(new_Y, dtype='<u4')])
ST_Z = np.concatenate([ST_Z, np.array(new_Z, dtype='<u2')])
ST_TYPE = np.concatenate([ST_TYPE, np.array(new_TYPE, dtype=np.uint8)])
ST_AUTH = np.concatenate([ST_AUTH, np.array(new_AUTH, dtype=np.uint8)])
ST_CENTX = np.concatenate([ST_CENTX, np.array(new_CENTX, dtype='<u4')])
ST_CENTY = np.concatenate([ST_CENTY, np.array(new_CENTY, dtype='<u4')])
ST_CENTZ = np.concatenate([ST_CENTZ, np.array(new_CENTZ, dtype='<u2')])
ST_HASCENT = np.concatenate([ST_HASCENT, np.array(new_HASCENT, dtype=np.uint8)])

st["N"] = old_N + len(standalone_entries)
st["X"] = enc(ST_X); st["Y"] = enc(ST_Y); st["Z"] = enc(ST_Z)
st["TYPE"] = enc(ST_TYPE); st["AUTH"] = enc(ST_AUTH)
st["CENTX"] = enc(ST_CENTX); st["CENTY"] = enc(ST_CENTY); st["CENTZ"] = enc(ST_CENTZ); st["HASCENT"] = enc(ST_HASCENT)
print("Grew STANDALONE from N=%d to N=%d (+%d)" % (old_N, st["N"], len(standalone_entries)))

# ---- 4) cildata: sparse-append cilium data for entries that have it ----
OV_IDX = b64u32(CD["OV_IDX"]).copy()
OV_CILSX = b64u32(CD["OV_CILSX"]).copy(); OV_CILSY = b64u32(CD["OV_CILSY"]).copy(); OV_CILSZ = b64u16(CD["OV_CILSZ"]).copy()
OV_CILEX = b64u32(CD["OV_CILEX"]).copy(); OV_CILEY = b64u32(CD["OV_CILEY"]).copy(); OV_CILEZ = b64u16(CD["OV_CILEZ"]).copy()
ST_IDX = b64u32(CD["ST_IDX"]).copy()
ST_CILSX = b64u32(CD["ST_CILSX"]).copy(); ST_CILSY = b64u32(CD["ST_CILSY"]).copy(); ST_CILSZ = b64u16(CD["ST_CILSZ"]).copy()
ST_CILEX = b64u32(CD["ST_CILEX"]).copy(); ST_CILEY = b64u32(CD["ST_CILEY"]).copy(); ST_CILEZ = b64u16(CD["ST_CILEZ"]).copy()

ov_idx_set = set(OV_IDX.tolist())
st_idx_set = set(ST_IDX.tolist())

new_ov_idx, new_ov_csx, new_ov_csy, new_ov_csz, new_ov_cex, new_ov_cey, new_ov_cez = [], [], [], [], [], [], []
new_st_idx, new_st_csx, new_st_csy, new_st_csz, new_st_cex, new_st_cey, new_st_cez = [], [], [], [], [], [], []

n_cil_override = 0
n_cil_standalone = 0
n_cil_already_present = 0
OV_IDX_LIST = OV_IDX.tolist()  # pre-append snapshot, for looking up already-present entries below
for e in override_entries:
    if e["cil_start"] and e["cil_end"]:
        idx = e["nucdata_index"]
        sx, sy, sz = e["cil_start"]; ex, ey, ez = e["cil_end"]
        if idx in ov_idx_set:
            # Already has cilium data -- happens when an earlier, separate cilium-matching pass
            # (see ujump.html's own comment: "sourced from a second, richer spreadsheet... matched
            # onto the already-embedded override/.../entries above by nearest nucleus position")
            # independently matched this SAME xlsx row's cilium coords onto this nucdata index
            # before this pass ever claimed an OVERRIDE type for it. Verify the values agree
            # (same source row) and skip re-adding rather than erroring.
            pos = OV_IDX_LIST.index(idx)
            existing = (int(OV_CILSX[pos]), int(OV_CILSY[pos]), int(OV_CILSZ[pos]),
                        int(OV_CILEX[pos]), int(OV_CILEY[pos]), int(OV_CILEZ[pos]))
            new_vals = (round(sx), round(sy), round(sz), round(ex), round(ey), round(ez))
            assert existing == new_vals, "cilium mismatch at nucdata index %d: existing=%s new=%s" % (idx, existing, new_vals)
            n_cil_already_present += 1
            continue
        new_ov_idx.append(idx)
        new_ov_csx.append(round(sx)); new_ov_csy.append(round(sy)); new_ov_csz.append(round(sz))
        new_ov_cex.append(round(ex)); new_ov_cey.append(round(ey)); new_ov_cez.append(round(ez))
        ov_idx_set.add(idx)
        n_cil_override += 1

for e in standalone_entries:
    if e["cil_start"] and e["cil_end"]:
        st_i = standalone_new_index[id(e)]
        assert st_i not in st_idx_set, "unexpected existing cilium at standalone index %d" % st_i
        sx, sy, sz = e["cil_start"]; ex, ey, ez = e["cil_end"]
        new_st_idx.append(st_i)
        new_st_csx.append(round(sx)); new_st_csy.append(round(sy)); new_st_csz.append(round(sz))
        new_st_cex.append(round(ex)); new_st_cey.append(round(ey)); new_st_cez.append(round(ez))
        st_idx_set.add(st_i)
        n_cil_standalone += 1

OV_IDX = np.concatenate([OV_IDX, np.array(new_ov_idx, dtype='<u4')])
OV_CILSX = np.concatenate([OV_CILSX, np.array(new_ov_csx, dtype='<u4')])
OV_CILSY = np.concatenate([OV_CILSY, np.array(new_ov_csy, dtype='<u4')])
OV_CILSZ = np.concatenate([OV_CILSZ, np.array(new_ov_csz, dtype='<u2')])
OV_CILEX = np.concatenate([OV_CILEX, np.array(new_ov_cex, dtype='<u4')])
OV_CILEY = np.concatenate([OV_CILEY, np.array(new_ov_cey, dtype='<u4')])
OV_CILEZ = np.concatenate([OV_CILEZ, np.array(new_ov_cez, dtype='<u2')])

ST_IDX = np.concatenate([ST_IDX, np.array(new_st_idx, dtype='<u4')])
ST_CILSX = np.concatenate([ST_CILSX, np.array(new_st_csx, dtype='<u4')])
ST_CILSY = np.concatenate([ST_CILSY, np.array(new_st_csy, dtype='<u4')])
ST_CILSZ = np.concatenate([ST_CILSZ, np.array(new_st_csz, dtype='<u2')])
ST_CILEX = np.concatenate([ST_CILEX, np.array(new_st_cex, dtype='<u4')])
ST_CILEY = np.concatenate([ST_CILEY, np.array(new_st_cey, dtype='<u4')])
ST_CILEZ = np.concatenate([ST_CILEZ, np.array(new_st_cez, dtype='<u2')])

CD["OV_IDX"] = enc(OV_IDX)
CD["OV_CILSX"] = enc(OV_CILSX); CD["OV_CILSY"] = enc(OV_CILSY); CD["OV_CILSZ"] = enc(OV_CILSZ)
CD["OV_CILEX"] = enc(OV_CILEX); CD["OV_CILEY"] = enc(OV_CILEY); CD["OV_CILEZ"] = enc(OV_CILEZ)
CD["ST_IDX"] = enc(ST_IDX)
CD["ST_CILSX"] = enc(ST_CILSX); CD["ST_CILSY"] = enc(ST_CILSY); CD["ST_CILSZ"] = enc(ST_CILSZ)
CD["ST_CILEX"] = enc(ST_CILEX); CD["ST_CILEY"] = enc(ST_CILEY); CD["ST_CILEZ"] = enc(ST_CILEZ)

print("Added cilium data: %d override, %d standalone (%d total); %d already present from an earlier matching pass (verified identical, skipped)" % (n_cil_override, n_cil_standalone, n_cil_override + n_cil_standalone, n_cil_already_present))

# ---- 5) Splice owndata then cildata back into the HTML (re-locate cildata's match AFTER the
# owndata replacement, since string offsets shift) ----
new_owndata_json = json.dumps(OD)
html2 = html[:OD_m.start(2)] + new_owndata_json + html[OD_m.end(2):]

m2 = re.search(r'(<script type="application/json" id="cildata">)(.*?)(</script>)', html2, re.S)
new_cildata_json = json.dumps(CD)
html3 = html2[:m2.start(2)] + new_cildata_json + html2[m2.end(2):]

with open(F, "w", encoding="utf-8") as fh:
    fh.write(html3)

print("\nDone. File size before:", len(html), "after:", len(html3))
