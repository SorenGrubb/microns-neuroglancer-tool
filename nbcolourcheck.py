# -*- coding: utf-8 -*-
"""The Blender export's colour and transparency rules, from the notebook the tools write.  2026-09-22

Søren, on a µJump export of one microglia with its lysosomes: "the microglia Root ID meshes had
different colors, and not just 1 color to show that they belong together. The lysosomes looked
great, but they were not visible through the cell mesh, so I think we need to make the cell mesh
more transparent. When there is only one type of organelles, I think it is fine to make the
individual organelles different colors, however, when there is more than one type of organelles,
the same organelles should have the same color. Except nuclei, which should always be blue. The
organelles should not be transparent."

colour_policy.py is the one module both readers share (blend_scene.py for the 3D models, the
notebook's EM fetch for the overlay painted on the sections), and it needs no Blender -- so this
extracts it from core/blenderexport.js's notebook and drives the real thing.

Run from the tool folder:  python3 nbcolourcheck.py
"""
import io, json, re, sys, os, tempfile, importlib.util

fails = 0
def ok(cond, what, detail=None):
    global fails
    print(("  ok   " if cond else "  FAIL ") + what + ("  <- " + str(detail) if detail is not None else ""))
    if not cond: fails += 1

HERE = os.path.dirname(os.path.abspath(__file__))
js = io.open(os.path.join(HERE, "core/blenderexport.js"), encoding="utf-8").read()
m = re.search(r'const NB_SOURCE = ("(?:[^"\\]|\\.)*");', js, re.S)
nb = json.loads(json.loads(m.group(1)))
SRC = {}
for c in nb["cells"]:
    s = "".join(c["source"])
    if s.startswith("%%writefile"):
        SRC[s.split("\n")[0].split("/")[-1]] = s.split("\n", 1)[1]
    elif "TRACED_STATS" in s: SRC["_traced_cell"] = s
    elif s.startswith("man = {"): SRC["_manifest_cell"] = s

tmp = tempfile.mkdtemp()
io.open(os.path.join(tmp, "colour_policy.py"), "w", encoding="utf-8").write(SRC["colour_policy.py"])
sys.path.insert(0, tmp)
import colour_policy as CP

print("one colour per cell, however many ids it has")
cells = [{"type": "Microglia", "root_id": "1", "nucleus_id": "292554", "group": "292554"},
         {"type": "Microglia", "root_id": "2", "nucleus_id": None, "group": "292554"},
         {"type": "Microglia", "root_id": "3", "nucleus_id": None, "group": "292554"}]
cols = CP.cell_colours(cells, {"accent": "#27e0b3"})
ok(len(set(cols)) == 1, "three root ids of one cell are one colour", ", ".join(cols))
ok(cols[0] == "#27e0b3", "...the tool's accent, because it is the only cell", cols[0])

print("\norganelles: by kind when there are several kinds")
many = [{"kind": "lysosome"}, {"kind": "lysosome"}, {"kind": "mitochondria"}, {"kind": "nucleus"}]
c2 = CP.organelle_colours(many)
ok(c2[0] == c2[1], "two lysosomes share a colour", c2[0] + " / " + c2[1])
ok(c2[2] != c2[0], "...and a mitochondrion is a different one", c2[2])
ok(c2[3] == CP.NUC_COLOR, "...and a nucleus is always blue", c2[3])

print("\n...and one each when there is only one kind")
one = [{"kind": "lysosome"} for _ in range(4)]
c3 = CP.organelle_colours(one)
ok(len(set(c3)) == 4, "four lysosomes, four colours", ", ".join(c3))
ok(CP.NUC_COLOR not in c3 and CP.VASC_COLOR not in c3,
   "...none of them blue or red, which mean nucleus and vessel", ", ".join(c3))

print("\nthe organelles are solid and the cells let them through")
mix = [{"root_id": "1", "type": "Microglia"}, {"kind": "lysosome"}, {"kind": "lysosome"}]
al = CP.alphas(mix)
ok(al[1] == 1.0 and al[2] == 1.0, "an organelle is opaque", al[1])
ok(al[0] < CP.CELL_ALPHA, "...and the cell round it is more see-through than usual",
   str(al[0]) + " against " + str(CP.CELL_ALPHA))
plain = CP.alphas([{"root_id": "1"}, {"root_id": "2"}])
ok(plain[0] == CP.CELL_ALPHA, "a scene with no organelles is unchanged", plain[0])

print("\na cell and the organelles in it are told apart")
scene = [{"type": "Microglia", "root_id": "1", "nucleus_id": "292554", "group": "292554"},
         {"type": "Microglia", "root_id": "2", "nucleus_id": None, "group": "292554"}]
org = [{"kind": "lysosome"} for _ in range(3)]
ocols = CP.organelle_colours(org)
scene += [dict(o, cell_name="Lysosome_%d" % i, group="Lysosome %d" % i, color=c)
          for i, (o, c) in enumerate(zip(org, ocols))]
cc = CP.cell_colours(scene, {"accent": "#27e0b3"})
ok(cc[0] == "#27e0b3" and cc[1] == "#27e0b3",
   "the one cell still wears the tool's accent, whatever is traced inside it", cc[0])
ok(len(set(cc[2:])) == 3 and "#27e0b3" not in cc[2:],
   "...and its three lysosomes are three other colours", ", ".join(cc[2:]))
two = [{"type": "A", "root_id": "1"}, {"type": "B", "root_id": "2"}]
two += [dict(o, color=c) for o, c in zip(org, CP.organelle_colours(org))]
tc = CP.cell_colours(two, {"accent": "#27e0b3"})
ok(len(set(tc)) == 5, "two cells and three lysosomes are five colours", ", ".join(tc))

print("\nthe notebook uses them")
ok("organelle_colours" in SRC["_traced_cell"], "section 4b colours the traced structures with the rule")
ok("'kind'" in SRC["_traced_cell"], "...and files each one's kind on the cell it appends")
ok("'kind'" in SRC["_manifest_cell"], "the manifest carries the kind through to Blender")
ok("alphas" in SRC["blend_scene.py"], "blend_scene asks colour_policy how see-through each one is")

print("\nand every module in the notebook still compiles")
for name, src in sorted(SRC.items()):
    try:
        compile(src, name, "exec"); ok(True, name + " compiles")
    except SyntaxError as e:
        ok(False, name + " compiles", str(e))

print(("\n%d FAILED" % fails) if fails else "\nall good")
sys.exit(1 if fails else 0)
