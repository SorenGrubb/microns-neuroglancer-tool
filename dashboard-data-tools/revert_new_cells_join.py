"""
Reverts apply_new_cells_join.py's patch: Soren looked at the outcome and realized the 363 "new"
cells are actually merged-segment/multi-nucleus blobs, not genuinely new distinct cells -- he does
not want them added to the master data this way and wants to handle them differently. This undoes
the addition precisely, using the exact same plan file so every touched index/value is known:

- OVERRIDE (180 entries, mutated in place at existing nucdata indices): reset TYPE->255, AUTH->255,
  HASCENT->0, CENTX/CENTY/CENTZ->0 -- the verified "unclaimed" sentinel pattern used everywhere else
  in this ~136k-slot array (checked: ALL 136330 currently-unclaimed slots follow exactly this
  pattern, so restoring it is safe and indistinguishable from "never touched").
- STANDALONE (183 entries, pure append at the end): truncate every parallel array back to the
  pre-patch N=6013.
- cildata (152 sparse entries, pure append at the end of OV_IDX/ST_IDX and their coordinate arrays):
  truncate the last 59 OV_* entries and last 93 ST_* entries. The 1 pre-existing cilium entry that
  was already present before this pass (nucdata index 73397) was never appended by the patch, so
  it's untouched either way.
- TYPE_NAMES / AUTH_STRINGS (pure appends at the end, indices 14 and 11-13 respectively, used by
  nothing except the now-reverted entries): truncate back to their original lengths (14 and 11).

Run against a scratch copy FIRST (PATCH_TARGET env override), verify, then run for real.
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
override_entries = [e for e in add if e["kind"] == "override"]
standalone_entries = [e for e in add if e["kind"] == "standalone"]
print("Plan: reverting %d override + %d standalone = %d entries" % (len(override_entries), len(standalone_entries), len(add)))

OD_m, OD = get_block("owndata")
CD_m, CD = get_block("cildata")

ORIG_TYPE_NAMES_LEN = 14  # pre-patch length (verified: 'Fibroblast' was appended as index 14)
ORIG_AUTH_STRINGS_LEN = 11  # pre-patch length (verified: 3 new strings appended as indices 11-13)

assert OD["TYPE_NAMES"][ORIG_TYPE_NAMES_LEN:] == ["Fibroblast"], "unexpected TYPE_NAMES tail: %r" % OD["TYPE_NAMES"][ORIG_TYPE_NAMES_LEN:]
OD["TYPE_NAMES"] = OD["TYPE_NAMES"][:ORIG_TYPE_NAMES_LEN]
print("Truncated TYPE_NAMES back to", len(OD["TYPE_NAMES"]), "entries")

removed_auth = OD["AUTH_STRINGS"][ORIG_AUTH_STRINGS_LEN:]
OD["AUTH_STRINGS"] = OD["AUTH_STRINGS"][:ORIG_AUTH_STRINGS_LEN]
print("Truncated AUTH_STRINGS back to", len(OD["AUTH_STRINGS"]), "entries (removed:", removed_auth, ")")

# ---- OVERRIDE: reset the 180 touched indices back to the unclaimed sentinel ----
ov = OD["OVERRIDE"]
OV_TYPE = b64u8(ov["TYPE"]).copy()
OV_AUTH = b64u8(ov["AUTH"]).copy()
OV_CENTX = b64u32(ov["CENTX"]).copy(); OV_CENTY = b64u32(ov["CENTY"]).copy(); OV_CENTZ = b64u16(ov["CENTZ"]).copy()
OV_HASCENT = b64u8(ov["HASCENT"]).copy()

n_reset = 0
for e in override_entries:
    idx = e["nucdata_index"]
    OV_TYPE[idx] = 255
    OV_AUTH[idx] = 255
    OV_HASCENT[idx] = 0
    OV_CENTX[idx] = 0; OV_CENTY[idx] = 0; OV_CENTZ[idx] = 0
    n_reset += 1

ov["TYPE"] = enc(OV_TYPE); ov["AUTH"] = enc(OV_AUTH)
ov["CENTX"] = enc(OV_CENTX); ov["CENTY"] = enc(OV_CENTY); ov["CENTZ"] = enc(OV_CENTZ); ov["HASCENT"] = enc(OV_HASCENT)
print("Reset", n_reset, "OVERRIDE slots back to unclaimed")

# ---- STANDALONE: truncate the trailing 183 entries ----
st = OD["STANDALONE"]
old_N_now = st["N"]
new_N = old_N_now - len(standalone_entries)
assert new_N == 6013, "expected to land back on N=6013, got %d" % new_N

for key, dtype in [("X", '<u4'), ("Y", '<u4'), ("Z", '<u2'), ("TYPE", np.uint8), ("AUTH", np.uint8),
                    ("CENTX", '<u4'), ("CENTY", '<u4'), ("CENTZ", '<u2'), ("HASCENT", np.uint8)]:
    arr = np.frombuffer(base64.b64decode(st[key]), dtype=dtype)
    assert len(arr) == old_N_now, "STANDALONE.%s length %d != N %d" % (key, len(arr), old_N_now)
    st[key] = enc(arr[:new_N])
st["N"] = new_N
print("Truncated STANDALONE back to N=", new_N)

# ---- cildata: truncate the trailing 59 OV_* and 93 ST_* sparse entries ----
n_ov_cil = sum(1 for e in override_entries if e["cil_start"] and e["cil_end"])
# subtract the 1 that was already-present-before-this-pass (not appended by the patch)
OV_IDX_pre = b64u32(CD["OV_IDX"])
plan_ov_cil_idx = set(e["nucdata_index"] for e in override_entries if e["cil_start"] and e["cil_end"])
# how many of those were newly appended (i.e. the "already present" one, index 73397, is excluded)
already_present_idx = 73397
n_ov_cil_appended = n_ov_cil - (1 if already_present_idx in plan_ov_cil_idx else 0)
n_st_cil_appended = sum(1 for e in standalone_entries if e["cil_start"] and e["cil_end"])
print("Truncating cildata: removing last", n_ov_cil_appended, "OV_* entries and last", n_st_cil_appended, "ST_* entries")

for prefix, n_remove in [("OV", n_ov_cil_appended), ("ST", n_st_cil_appended)]:
    idx_arr = b64u32(CD["%s_IDX" % prefix])
    old_len = len(idx_arr)
    new_len = old_len - n_remove
    assert new_len >= 0
    CD["%s_IDX" % prefix] = enc(idx_arr[:new_len])
    for suffix, dtype in [("CILSX", '<u4'), ("CILSY", '<u4'), ("CILSZ", '<u2'),
                           ("CILEX", '<u4'), ("CILEY", '<u4'), ("CILEZ", '<u2')]:
        key = "%s_%s" % (prefix, suffix)
        arr = np.frombuffer(base64.b64decode(CD[key]), dtype=dtype)
        assert len(arr) == old_len, "%s length %d != idx length %d" % (key, len(arr), old_len)
        CD[key] = enc(arr[:new_len])

# ---- Splice owndata then cildata back into the HTML ----
new_owndata_json = json.dumps(OD)
html2 = html[:OD_m.start(2)] + new_owndata_json + html[OD_m.end(2):]

m2 = re.search(r'(<script type="application/json" id="cildata">)(.*?)(</script>)', html2, re.S)
new_cildata_json = json.dumps(CD)
html3 = html2[:m2.start(2)] + new_cildata_json + html2[m2.end(2):]

with open(F, "w", encoding="utf-8") as fh:
    fh.write(html3)

print("\nDone. File size before:", len(html), "after:", len(html3))
