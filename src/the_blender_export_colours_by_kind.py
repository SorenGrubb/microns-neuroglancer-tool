# -*- coding: utf-8 -*-
u"""One cell one colour, organelles by kind and solid, the cell round them see-through, and
nothing from outside the box.                                                          2026-09-22

Søren, on a µJump Blender export limited to one microglia with its lysosomes:
  "the microglia Root ID meshes had different colors, and not just 1 color to show that they belong
   together. The lysosomes looked great, but they were not visible through the cell mesh, so I think
   we need to make the cell mesh more transparent. When there is only one type of organelles, I
   think it is fine to make the individual organelles different colors, however, when there is more
   than one type of organelles, the same organelles should have the same color. Except nuclei, which
   should always be blue. The organelles should not be transparent. I found that there was another
   nucleus with lysosomes also included, which was way outside the bounding box and disturbed the
   rotation part of the video."

FOUR FIXES, and every tool gets them: the notebook body lives in core/blenderexport.js, which all
eight tools write from.

1. ONE CELL, ONE COLOUR. µJump exports a matched cell's own root id AND every proposed one, as
   separate entries with no nucleus id on them, so colour_policy grouped them apart and painted the
   one microglia three colours. Each entry now carries the cell's `group` (its nucleus, else its
   first root id), which is exactly what χJump's fragments already use.

2. ORGANELLES BY KIND, unless there is only one kind. colour_policy.organelle_colours(): several
   kinds -> one colour per kind (lysosomes all one colour, mitochondria another); one kind -> one
   colour each, which is what tells them apart when nothing else does; a nucleus is always
   NUC_COLOR. The page stops sending a colour per tracing, so there is one rule rather than two.

3. SOLID ORGANELLES INSIDE A THINNER CELL. colour_policy.alphas(): an organelle is opaque, and a
   cell with organelles in it drops from CELL_ALPHA 0.35 to 0.16, because an organelle you cannot
   see through the membrane might as well not be in the file. blend_scene.py asks for the numbers
   rather than holding its own, so the notebook's EM overlay and the scene cannot disagree.

4. NOTHING FROM OUTSIDE THE BOX. The panel sent TRACINGS_KEPT whole -- every outline the page had,
   including another cell's 400 µm away, which stretched the scene and ruined the turntable. A
   tracing now travels only when it belongs to a cell in the export (nucleus or root id) or its
   own centre is inside the box.

Checks: nbexportcheck.js (what the panel writes), nbcolourcheck.py (the rules themselves).
Run: python3 src/the_blender_export_colours_by_kind.py, then python3 src/build_stamps.py
"""
import io, os, re, json
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit_text(P, pairs):
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s: print("  already there: " + name); continue
        assert s.count(old) == 1, "%s: %d" % (name, s.count(old))
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


# ── 1 and 4: the page and the panel ───────────────────────────────────────────────────────────
edit_text(os.path.join(HERE, "ujump.html"), [
 (u"every id of one cell carries the cell's group",
  u'''              boxCells.push({type:String(m.row.type||"Unclassified"),root_id:id,
                             nucleus_id:boxCells.some(c=>c.nucleus_id&&String(c.nucleus_id)===String(nidKey))
                                        ?null:(nidKey||null)});''',
  u'''              boxCells.push({type:String(m.row.type||"Unclassified"),root_id:id,
                             /* ONE CELL, ONE COLOUR (2026-09-22). The proposed root ids are the
                                same cell as the native one, and carried no nucleus id, so
                                colour_policy grouped them apart and painted one microglia three
                                colours. See src/the_blender_export_colours_by_kind.py. */
                             group:String(nidKey||rid||id),
                             nucleus_id:boxCells.some(c=>c.nucleus_id&&String(c.nucleus_id)===String(nidKey))
                                        ?null:(nidKey||null)});'''),
])

BE = os.path.join(HERE, "core/blenderexport.js")
edit_text(BE, [
 (u"only the tracings of this box and these cells",
  u'''    var tracings = Array.isArray(opts.tracings) ? opts.tracings : [];''',
  u'''    var tracings = Array.isArray(opts.tracings) ? opts.tracings : [];
    /* ── AND ONLY THE ONES THAT BELONG HERE ────────────────────────────────────  2026-09-22
       Søren: "there was another nucleus with lysosomes also included, which was way outside the
       bounding box and disturbed the rotation part of the video." Every tracing the page had kept
       was sent. One travels now when it is filed against a cell in this export, or when its own
       centre is inside the box. See src/the_blender_export_colours_by_kind.py. */
    tracings = tracings.filter(function(t){
      var nuc = String((t && t.nucleus_id) || "").replace(/^.*:/, "");
      var root = String((t && t.root_id) || "");
      var mine = cells.some(function(c){
        return (nuc && String(c.nucleus_id || "") === nuc) || (root && String(c.root_id || "") === root);
      });
      if (mine) return true;
      /* Its centre, in nanometres, against the box -- when the page told us the voxel size. */
      var R = opts.resNm;
      if (!Array.isArray(R) || R.length !== 3 || b.xmin == null) return false;
      var n = 0, sx = 0, sy = 0, sz = 0;
      ((t && t.rings) || []).forEach(function(r){
        (r.points || []).forEach(function(p){
          sx += Number(p[0]); sy += Number(p[1]); sz += Number(r.z); n++;
        });
      });
      if (!n) return false;
      var x = sx / n * R[0], y = sy / n * R[1], z = sz / n * R[2];
      return x >= b.xmin && x <= b.xmax && y >= b.ymin && y <= b.ymax && z >= b.zmin && z <= b.zmax;
    });'''),
 (u"...and no colour per tracing: the notebook decides",
  u'''                   + (t.color ? ", 'color': " + pyStr(t.color) : "")
                   + (t.nucleus_id ? ", 'nucleus_id': " + pyStr(String(t.nucleus_id)) : "")''',
  u'''                   /* NO COLOUR, 2026-09-22. It used to send the pad's per-structure colour,
                      which beat colour_policy's rule -- so nine lysosomes came out nine colours
                      even beside a second kind. The kind travels; the notebook colours it. */
                   + (t.nucleus_id ? ", 'nucleus_id': " + pyStr(String(t.nucleus_id)) : "")'''),
])


# ── 2 and 3: the notebook the panel writes, inside core/blenderexport.js ───────────────────────
JS = io.open(BE, encoding="utf-8").read()
M = re.search(r'const NB_SOURCE = ("(?:[^"\\]|\\.)*");', JS, re.S)
assert M, "NB_SOURCE"
nb = json.loads(json.loads(M.group(1)))


def cell_at(pred):
    for i, c in enumerate(nb["cells"]):
        if pred("".join(c["source"])): return i
    raise AssertionError("no such cell")


def patch(i, pairs):
    src = "".join(nb["cells"][i]["source"])
    for name, old, new in pairs:
        if new in src: print("  already there: " + name); continue
        assert src.count(old) == 1, "%s: %d" % (name, src.count(old))
        src = src.replace(old, new, 1); print("  ok: " + name)
    nb["cells"][i]["source"] = src


POLICY = u'''

# ── HOW SEE-THROUGH, AND WHICH ORGANELLE IS WHICH ─────────────────────────────  2026-09-22
# Søren, on a µJump export of one microglia and its lysosomes: "The lysosomes looked great, but
# they were not visible through the cell mesh ... When there is only one type of organelles, I
# think it is fine to make the individual organelles different colors, however, when there is
# more than one type of organelles, the same organelles should have the same color. Except
# nuclei, which should always be blue. The organelles should not be transparent."
#
# Both rules live here rather than in blend_scene.py for the reason the module exists: the
# notebook's EM fetch paints the same structures on the sections and cannot import bpy.
CELL_ALPHA = 0.35              # a cell, with the EM and its nucleus to be seen through it
CELL_ALPHA_ORGANELLES = 0.16   # ...and with organelles inside it, which is a harder thing to see

NUCLEUS_KINDS = ("nucleus", "nuclei", "cell nucleus", "nucleus_mesh")


def kind_of(c):
    """What a manifest entry IS: an organelle's kind, or "" for a cell fetched from the
    segmentation. Traced structures carry it from the pad; cells never have one."""
    return str((c or {}).get("kind") or "").strip().lower()


def is_nucleus(c):
    return kind_of(c) in NUCLEUS_KINDS


def is_organelle(c):
    """A hand-traced structure that is not itself a cell. A traced CELL (kind "cell", or no kind
    at all) is a cell: it is the thing the segmentation missed, not something inside one."""
    k = kind_of(c)
    return bool(k) and k not in ("cell", "traced", "soma")


def organelle_colours(items):
    """One colour per traced structure, in the order given.

    SEVERAL KINDS -> one colour per kind, so every lysosome is the same colour and the
    mitochondria are another: with two kinds on screen, "which kind is this" is the question the
    colour should answer. ONE KIND -> one colour each, because then the only useful question left
    is which of them is which. A nucleus is always NUC_COLOR, whatever else is in the scene, and
    an explicit `color` on an entry still wins -- a hand-edited notebook asking for a particular
    colour should get it.
    """
    items = list(items or [])
    kinds = [kind_of(i) for i in items]
    distinct = []
    for i, k in zip(items, kinds):
        if is_nucleus(i) or not k or i.get("color"):
            continue
        if k not in distinct:
            distinct.append(k)
    by_kind = {k: CELL_PALETTE[j % len(CELL_PALETTE)] for j, k in enumerate(distinct)}
    out, n = [], 0
    for i in items:
        if i.get("color"):
            out.append(i["color"])
        elif is_nucleus(i):
            out.append(NUC_COLOR)
        elif len(distinct) <= 1:
            out.append(CELL_PALETTE[n % len(CELL_PALETTE)]); n += 1
        else:
            out.append(by_kind.get(kind_of(i), CELL_PALETTE[0]))
    return out


def cell_alpha_for(cells, override=None):
    """How see-through the CELLS are: thinner when there are organelles to be seen through them."""
    if override is not None:
        return float(override)
    return (CELL_ALPHA_ORGANELLES
            if any(is_organelle(c) and not is_nucleus(c) for c in (cells or []))
            else CELL_ALPHA)


def alphas(cells, override=None):
    """One alpha per manifest entry: organelles solid, cells see-through.

    An organelle is drawn opaque on purpose. It is small, it sits inside a translucent cell, and a
    translucent thing inside a translucent thing reads as neither.
    """
    a = cell_alpha_for(cells, override)
    return [1.0 if is_organelle(c) else a for c in (cells or [])]
'''
patch(cell_at(lambda s: s.startswith("%%writefile /content/colour_policy.py")), [
 (u"the rules for organelles",
  u"        else:\n            out.append(by_group[group_of(c)])\n    return out",
  u"        else:\n            out.append(by_group[group_of(c)])\n    return out" + POLICY),
])

patch(cell_at(lambda s: s.startswith("%%writefile /content/blend_scene.py")), [
 (u"blend_scene asks colour_policy how see-through each one is",
  u'''from colour_policy import (CELL_PALETTE, NUC_COLOR, VASC_COLOR,  # noqa: E402,F401
                           cell_colours, group_of)''',
  u'''from colour_policy import (CELL_PALETTE, NUC_COLOR, VASC_COLOR,  # noqa: E402,F401
                           cell_colours, group_of,
                           # 2026-09-22: the alphas live beside the colours, because the
                           # notebook's EM overlay needs the same answers and cannot import bpy.
                           CELL_ALPHA, alphas, cell_alpha_for, is_organelle)'''),
 (u"...rather than holding its own number",
  u'''CELL_ALPHA = 0.35''',
  u'''# CELL_ALPHA lives in colour_policy.py since 2026-09-22 (it is 0.35, and 0.16 for a cell with
# organelles in it -- see cell_alpha_for there). Imported below with the colours.'''),
 (u"each entry gets its own alpha",
  u'''    cell_alpha = float(man.get("cell_alpha", CELL_ALPHA))''',
  u'''    # PER ENTRY (2026-09-22): a cell is see-through, an organelle inside it is solid, and a
    # cell with organelles in it is thinner than one without -- Søren: "The lysosomes ... were not
    # visible through the cell mesh ... The organelles should not be transparent."
    cell_alphas = alphas(man_cells, man.get("cell_alpha"))
    cell_alpha = cell_alpha_for(man_cells, man.get("cell_alpha"))'''),
 (u"...and the material is made with it",
  u'''            mat = make_material("cell_" + group_of(c), colour, cell_alpha, cell_alpha < 1.0)''',
  u'''            _a = cell_alphas[ci]
            mat = make_material("cell_" + group_of(c), colour, _a, _a < 1.0)'''),
 (u"...and the report says what the organelles are",
  u'''                 "translucent (alpha %.2f), so the EM%s can be seen through them"
                 % (cell_alpha, " and the nuclei" if has_nuclei else "")''',
  u'''                 "translucent (alpha %.2f), so the EM%s can be seen through them"
                 % (cell_alpha, " and the nuclei" if has_nuclei else "")
                 + ("; the %d traced organelle(s) in them are solid"
                    % sum(1 for _c in man_cells if is_organelle(_c))
                    if any(is_organelle(_c) for _c in man_cells) else "")'''),
])

patch(cell_at(lambda s: "TRACED_STATS" in s and s.startswith("import sys")), [
 (u"section 4b colours the traced structures by the rule",
  u'''from trace_mesh import trace_mesh

TRACED_STATS = []''',
  u'''from trace_mesh import trace_mesh
# THE COLOURS ARE DECIDED HERE, 2026-09-22, not sent by the page: several kinds of organelle ->
# one colour per kind; one kind -> one colour each; a nucleus is always blue. See
# colour_policy.organelle_colours, and src/the_blender_export_colours_by_kind.py.
from colour_policy import organelle_colours

TRACED_COLOURS = organelle_colours(TRACINGS or [])
TRACED_STATS = []'''),
 (u"...and each one keeps its kind, which is what the scene draws it from",
  u'''for _t in (TRACINGS or []):
    _name = _t.get('name') or 'traced' ''' .rstrip() + u'''
''',
  u'''for _ti, _t in enumerate(TRACINGS or []):
    _name = _t.get('name') or 'traced'
'''),
 (u"...into the cell it appends",
  u'''    CELLS.append({'type': _t.get('type') or 'traced',
                  'cell_name': _name.replace(' ', '_'),
                  'group': _t.get('group') or _name,
                  'traced_by': _t.get('traced_by') or '',
                  'nucleus_id': _t.get('nucleus_id') or '',
                  'cell_npz': _rel,
                  **({'color': _t['color']} if _t.get('color') else {})})''',
  u'''    CELLS.append({'type': _t.get('type') or 'traced',
                  'cell_name': _name.replace(' ', '_'),
                  'group': _t.get('group') or _name,
                  'traced_by': _t.get('traced_by') or '',
                  'nucleus_id': _t.get('nucleus_id') or '',
                  'cell_npz': _rel,
                  # WHAT IT IS, and what its colour and its solidity are decided from.
                  'kind': _t.get('kind') or '',
                  'color': TRACED_COLOURS[_ti]})'''),
])

patch(cell_at(lambda s: s.startswith("man = {")), [
 (u"the manifest carries the kind through to Blender",
  u'''                    ('type','root_id','nucleus_id','cell_npz','nucleus_npz','position_um',
                     'group','cell_name','color','traced_by')''',
  u'''                    ('type','root_id','nucleus_id','cell_npz','nucleus_npz','position_um',
                     # 'kind' since 2026-09-22: blend_scene draws an organelle solid and the
                     # cell round it thinner, and it cannot tell them apart without this.
                     'group','cell_name','color','traced_by','kind')'''),
])

text = json.dumps(nb, ensure_ascii=False, separators=(", ", ": "))
JS2 = JS[:M.start(1)] + json.dumps(text, ensure_ascii=False) + JS[M.end(1):]
if JS2 != JS:
    io.open(BE, "w", encoding="utf-8").write(JS2); print("  ok: notebook re-embedded")
else:
    print("  already there: notebook re-embedded")


# ── EVERY TOOL, not just µJump ────────────────────────────────────────────────────────────────
# Søren: "Make sure that it is fixed for all tools." The notebook body is shared, so 2 and 3 land
# everywhere by themselves. These two do not: only µJump was sending its hand-traced structures at
# all, and only ωJump was sending the voxel size the box test needs.
TRACINGS_LINE = u'''
          /* WHAT THE PAGE HAS TRACED, filtered to this box and these cells by
             core/blenderexport.js (2026-09-22, src/the_blender_export_colours_by_kind.py). */
          tracings:(typeof TRACINGS_KEPT!=="undefined")?TRACINGS_KEPT:[],
          /* Nanometres per voxel, so a tracing's own centre can be tested against the box. */
          resNm:(UJ.cfg&&UJ.cfg.res)||null,'''
for page in ("djump.html", "pjump.html", "hjump.html"):
    P = os.path.join(HERE, page)
    s = io.open(P, encoding="utf-8").read()
    anchor = u"boxNM:boxNM,boxLabel:boxLabel,cells:boxCells,"
    if u"tracings:(typeof TRACINGS_KEPT" in s:
        print("  already there: " + page + " sends its tracings"); continue
    n = s.count(anchor); assert n == 1, "%s: %d" % (page, n)
    io.open(P, "w", encoding="utf-8").write(s.replace(anchor, anchor + TRACINGS_LINE, 1))
    print("  ok: " + page + " sends its tracings and its voxel size")

edit_text(os.path.join(HERE, "ujump.html"), [
 (u"µJump sends the voxel size too",
  u'''          tracings:(typeof TRACINGS_KEPT!=="undefined")?TRACINGS_KEPT:[]''',
  u'''          tracings:(typeof TRACINGS_KEPT!=="undefined")?TRACINGS_KEPT:[],
          /* Nanometres per voxel, so a tracing's own centre can be tested against the box
             (2026-09-22, src/the_blender_export_colours_by_kind.py). */
          resNm:(UJ.cfg&&UJ.cfg.res)||null'''),
])


# ── THE CELLS AND THE ORGANELLES DRAW FROM DIFFERENT ENDS OF THE PALETTE ──────────────────────
# Both lists started at CELL_PALETTE[0], so the one cell and its first lysosome came out the same
# green. The organelles read the palette backwards, and an organelle no longer counts as a cell
# when the "a lone cell wears the tool's accent" rule is applied -- it has its own colour already.
JS = io.open(BE, encoding="utf-8").read()
M = re.search(r'const NB_SOURCE = ("(?:[^"\\]|\\.)*");', JS, re.S)
nb = json.loads(json.loads(M.group(1)))
patch(cell_at(lambda s: s.startswith("%%writefile /content/colour_policy.py")), [
 (u"the organelles read the palette backwards",
  u'''    out, n = [], 0
    for i in items:''',
  u'''    palette = ORGANELLE_PALETTE
    out, n = [], 0
    for i in items:'''),
 (u"...from its own name",
  u'''    by_kind = {k: CELL_PALETTE[j % len(CELL_PALETTE)] for j, k in enumerate(distinct)}''',
  u'''    by_kind = {k: ORGANELLE_PALETTE[j % len(ORGANELLE_PALETTE)] for j, k in enumerate(distinct)}'''),
 (u"...one kind, one colour each, also from it",
  u'''        elif len(distinct) <= 1:
            out.append(CELL_PALETTE[n % len(CELL_PALETTE)]); n += 1''',
  u'''        elif len(distinct) <= 1:
            out.append(palette[n % len(palette)]); n += 1'''),
 (u"...and it is the cell palette reversed",
  u'''NUCLEUS_KINDS = ("nucleus", "nuclei", "cell nucleus", "nucleus_mesh")''',
  u'''# The same fifteen colours from the other end, so a cell and the first organelle inside it are
# not the same green. Reserved hues (335-25 vessels, 200-250 nuclei) are excluded there already.
ORGANELLE_PALETTE = list(reversed(CELL_PALETTE))

NUCLEUS_KINDS = ("nucleus", "nuclei", "cell nucleus", "nucleus_mesh")'''),
 (u"a cell list counts cells, not the organelles in them",
  u'''    order = []                       # groups, first-seen order -- stable and readable
    for c in cells:
        g = group_of(c)
        if g not in order:
            order.append(g)''',
  u'''    order = []                       # groups, first-seen order -- stable and readable
    for c in cells:
        # An organelle is not a cell (2026-09-22): it arrives with its own colour from
        # organelle_colours, and counting it here would cost a lone cell its accent and shift
        # every palette index by however many structures were traced inside it.
        if is_organelle(c):
            continue
        g = group_of(c)
        if g not in order:
            order.append(g)'''),
])
text = json.dumps(nb, ensure_ascii=False, separators=(", ", ": "))
JS2 = JS[:M.start(1)] + json.dumps(text, ensure_ascii=False) + JS[M.end(1):]
if JS2 != JS:
    io.open(BE, "w", encoding="utf-8").write(JS2); print("  ok: notebook re-embedded (palettes)")
else:
    print("  already there: notebook re-embedded (palettes)")
