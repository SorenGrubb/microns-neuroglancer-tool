"""
Patches the new "organelledata" static JSON block (built by build_organelledata_embed.py) into
ujump.html, inserted right after the existing "cildata" block closes and before "vascdata" --
same static-embed pattern as nucdata/owndata/mergeddata/cildata (plain-JSON dict style, matching
mergeddata since entry counts are small: 69 microglia, 190 astrocytes).

Run against a scratch copy FIRST (PATCH_TARGET env override), verify, then run for real.
"""
import re, json, os

F = os.environ.get("PATCH_TARGET", "/sessions/optimistic-intelligent-carson/mnt/MICrONS cell classifier/microns-neuroglancer-tool/ujump.html")
DATA = "/tmp/dash/organelledata.json"

html = open(F, encoding="utf-8").read()
data = json.load(open(DATA))

m = re.search(r'(<script type="application/json" id="cildata">.*?</script>\n?)', html, re.S)
if not m:
    raise SystemExit("could not find cildata block to anchor insertion")

new_block = '<script type="application/json" id="organelledata">' + json.dumps(data) + '</script>\n'
insert_at = m.end()
html2 = html[:insert_at] + new_block + html[insert_at:]

with open(F, "w", encoding="utf-8") as f:
    f.write(html2)

print("Inserted organelledata block (%d bytes) after cildata." % len(new_block))
print("File size before:", len(html), "after:", len(html2))
