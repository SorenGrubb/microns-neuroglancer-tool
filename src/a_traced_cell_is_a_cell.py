"""A traced cell is a cell.                                                          2026-09-16

Søren: *"begin with the colab meshing cell"* — the first half of getting a user-segmented cell out
of µJump and into the Blender file.

The segmentation stops before the volume does. At the top of minnie65 the nuclei are segmented and
the cells are not, which is why his two glia-limitans astrocytes (nucleus 253863 and 445951) have a
nucleus, a name he gave them, and no root ID at all. Nothing in the export can reach a cell like
that, because everything in the export starts from a root ID.

So: hand-traced contours become a mesh, and a traced structure enters `CELLS` as an ordinary cell.
From that point the scene, the collections, the colours, the translucency rule, the scale bar, the
turntable and the .glb all work on it with no further change — which is the whole reason to make it
a cell rather than a new kind of thing.

WHAT THIS ADDS

  * `trace_mesh.py`, embedded verbatim beside the six modules already there, the same way
    blend_scene.py and glb_write.py are — so the tested copy is the shipped copy. Its own check,
    `tracemeshcheck.py`, measures it against a cylinder, a sphere and an annulus whose volumes are
    arithmetic.
  * `TRACINGS` in the params cell, empty by default. The page fills it the way it fills CELLS.
  * Section 4b, which meshes each tracing and appends it to CELLS. Placed AFTER the root-ID mesh
    fetch on purpose: a traced structure has no root ID, so it must not be in CELLS while that
    loop runs.

AND THREE PLACES THAT ASSUMED A ROOT ID

`c['root_id']`, not `c.get('root_id')`, in three cells: the segmentation overlay's label colours,
the .glb object names, and the manifest's own name. A traced cell has no root ID and every one of
them would have raised KeyError. The honest fix is for those three to cope — not to mint a fake
root ID, which would put a number that means nothing into the sheet, the manifest and the scene,
and would eventually be read as if it meant something.

NO CONSENSUS, BY DECISION. Søren, asked directly: *"I don't think the traced structures should have
consensus handling, but it should be marked who traced the structures."* So a tracing carries
`traced_by` and that is all — no votes, no most-popular-wins. It travels into the manifest as a
field of the cell, so the scene can say whose it is.

Run: python3 src/a_traced_cell_is_a_cell.py
     python3 blender/make_colab_notebook.py      <- re-embeds and rewrites the notebook
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

READ = [
    ('''WORDMARKFONT_PY = io.open(os.path.join(HERE, "wordmark_font.py"), encoding="utf-8").read()''',
     '''WORDMARKFONT_PY = io.open(os.path.join(HERE, "wordmark_font.py"), encoding="utf-8").read()
# The seventh, and the only one that makes geometry out of something a PERSON drew rather than out
# of something a machine segmented: a stack of hand-traced contours in, a closed surface out. Its
# own check (tracemeshcheck.py) measures it against a cylinder, a sphere and an annulus.
TRACEMESH_PY = io.open(os.path.join(HERE, "trace_mesh.py"), encoding="utf-8").read()''',
     "the assembler reads trace_mesh.py"),
]

WRITEFILE = [
    ('''code("%%writefile /content/wordmark_font.py",
     WORDMARKFONT_PY.rstrip()),''',
     '''code("%%writefile /content/wordmark_font.py",
     WORDMARKFONT_PY.rstrip()),

code("%%writefile /content/trace_mesh.py",
     TRACEMESH_PY.rstrip()),''',
     "...and writes it into Colab beside the others"),
]

PARAMS = [
    ('''VASC_IDS   = None''',
     '''     "# \\u2500\\u2500 HAND-TRACED STRUCTURES \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500  2026-09-16",
     "# Cells the segmentation does not have, outlined section by section by a person. The top of",
     "# minnie65 is the case that forced this: nuclei are segmented up there and cells are not, so",
     "# a glia-limitans astrocyte has a nucleus, a name, and no root ID for anything to fetch.",
     "#",
     "# Each entry is one structure. `rings` are closed contours in THIS TOOL'S voxel coordinates,",
     "# each on one section; several rings may share a z (separate contours are separate blobs, a",
     "# contour drawn inside another is a hole). `traced_by` is who drew it -- there is no",
     "# consensus on a tracing, so the name is the provenance.",
     "#",
     "#   {'name': 'astrocyte at the glia limitans', 'type': 'astrocyte',",
     "#    'traced_by': 'S. Grubb', 'nucleus_id': '253863', 'color': '#3a6b5a',",
     "#    'rings': [{'z': 26170, 'points': [[171900, 81990], [171950, 82010], ...]}, ...]}",
     "TRACINGS = []",
     "# None means 'any non-zero label is vessel', which is right for a dedicated vessel",
     "# segmentation. Set [1] to take only the segment uJump's viewer selects.",
     "VASC_IDS   = None",''',
     "the params cell carries hand-traced structures"),
]

SECTION = [
    ('''md("## 5. Fetch the nuclei",''',
     '''md("## 4b. Mesh the hand-traced structures",
   "",
   "A structure somebody outlined by hand, section by section, becomes a surface here and then an",
   "ordinary entry in `CELLS`. Everything after this point treats it exactly like a cell fetched",
   "from the segmentation: its own colour, its own collection, the scale bar, the turntable, the",
   "`.glb`.",
   "",
   "**Why it runs here and not earlier.** A traced structure has no root ID, and section 4 above",
   "fetches meshes BY root ID. Appending to `CELLS` before that loop would send it looking for a",
   "cell that does not exist.",
   "",
   "**What it does with the sections nobody drew.** A tracer draws every fifth section. The two",
   "contours either side of a gap are turned into signed distances and blended, which moves the",
   "boundary smoothly across the gap instead of leaving a staircase — measured on a 2 µm sphere,",
   "that is 49.9 µm² of surface against the stepped fill's 54.6, where the true sphere is 50.3.",
   "",
   "**The volume it prints is the unsmoothed one.** Laplacian smoothing pulls a closed surface",
   "inward, so the pretty mesh reads slightly small; both numbers are printed so the difference",
   "is visible rather than argued about."),

code(tag="traced", *["import sys",
     "sys.path.insert(0, '/content')",
     "from trace_mesh import trace_mesh",
     "",
     "TRACED_STATS = []",
     "if not TRACINGS:",
     "    print('no hand-traced structures in this export')",
     "for _t in (TRACINGS or []):",
     "    _name = _t.get('name') or 'traced'",
     "    print(f\\"  {_name}\\")",
     "    _st = {}",
     "    _v, _f = trace_mesh(_t.get('rings') or [], res_nm=RES_NM or (4.0, 4.0, 40.0),",
     "                        step_nm=_t.get('step_nm'), stats=_st)",
     "    if _v is None:",
     "        continue",
     "    _rel = 'meshes/traced_%d.npz' % len(TRACED_STATS)",
     "    np.savez_compressed('/content/out/' + _rel, verts=_v, faces=_f)",
     "    _st['name'] = _name",
     "    TRACED_STATS.append(_st)",
     "    # AN ORDINARY CELL FROM HERE ON. No root_id -- there is no segment behind it -- so the",
     "    # three cells that used to index c['root_id'] directly now cope with its absence.",
     "    # `group` and `cell_name` are set so colour_policy.group_of() has something to key on:",
     "    # without them it falls back to the root id, and a chi-Jump export once came out a",
     "    # rainbow for exactly that reason.",
     "    CELLS.append({'type': _t.get('type') or 'traced',",
     "                  'cell_name': _name.replace(' ', '_'),",
     "                  'group': _t.get('group') or _name,",
     "                  'traced_by': _t.get('traced_by') or '',",
     "                  'nucleus_id': _t.get('nucleus_id') or '',",
     "                  'cell_npz': _rel,",
     "                  **({'color': _t['color']} if _t.get('color') else {})})",
     "if TRACED_STATS:",
     "    print()",
     "    for _s in TRACED_STATS:",
     "        print(f\\"  {_s['name']:<28} {_s['sections']:>3} sections  {_s['rings']:>4} rings  \\"",
     "              f\\"{_s['vertices']:>8,} verts  {_s['volume_um3_surface']:8.2f} um3\\")"]),

md("## 5. Fetch the nuclei",''',
     "section 4b meshes each tracing and appends it as a cell"),
]

ROOTLESS = [
    ('''     "    label_colors = dict(zip([int(c['root_id']) for c in CELLS],",
     "                            cell_colours(CELLS, BRAND, COLORS)))",''',
     '''     "    # ONLY THE CELLS THAT HAVE A ROOT ID. The overlay paints segmentation labels, and a",
     "    # hand-traced structure has no label in the segmentation to paint -- it exists because",
     "    # the segmentation does not have it. Before 2026-09-16 this was int(c['root_id']) over",
     "    # every cell, which is a KeyError the moment a tracing is in the export.",
     "    _lab = [(c, col) for c, col in zip(CELLS, cell_colours(CELLS, BRAND, COLORS))",
     "            if c.get('root_id')]",
     "    label_colors = dict(zip([int(c['root_id']) for c, _ in _lab], [col for _, col in _lab]))",''',
     "the segmentation overlay skips cells with no segment"),

    ('''     "    name = f\\"{c.get('cell_name') or c['type'].replace(' ', '_')}_{c['root_id']}\\"",''',
     '''     "    # A traced structure has no root id to name itself after, so its own name stands alone.",
     "    name = (f\\"{c.get('cell_name') or c['type'].replace(' ', '_')}_{c['root_id']}\\"",
     "            if c.get('root_id') else (c.get('cell_name') or c['type'].replace(' ', '_')))",''',
     "the .glb object name survives a cell with no root id"),

    ('''     "                    ('type','root_id','nucleus_id','cell_npz','nucleus_npz','position_um',",
     "                     'group','cell_name','color')",
     "                    if k in c},",
     "                   name=f\\"{c['type'].replace(' ','_')}_{c['root_id']}\\")",''',
     '''     "                    ('type','root_id','nucleus_id','cell_npz','nucleus_npz','position_um',",
     "                     'group','cell_name','color','traced_by')",
     "                    if k in c},",
     "                   name=(f\\"{c['type'].replace(' ','_')}_{c['root_id']}\\" if c.get('root_id')",
     "                         else (c.get('cell_name') or c['type'].replace(' ','_'))))",''',
     "the manifest names a traced cell, and carries who traced it"),
]


def edit(rel, pairs):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    print(rel)
    for old, new, why in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + why)
            continue
        assert not (new in s and old in s), "AMBIGUOUS: " + why
        assert old in s, "NOT FOUND: " + why
        assert s.count(old) == 1, "ambiguous (%d): %s" % (s.count(old), why)
        s = s.replace(old, new, 1)
        print("  ok: " + why)
    io.open(p, "w", encoding="utf-8").write(s)


edit("blender/make_colab_notebook.py", READ + WRITEFILE + PARAMS + SECTION + ROOTLESS)
print("\nnow: python3 blender/make_colab_notebook.py   and   python3 blender/tracemeshcheck.py")
