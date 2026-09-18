# -*- coding: utf-8 -*-
"""A section beside the model.                                                  2026-09-18

Søren: *"For the cell identity window, I would like that there is a single plane of the EM data with
the segmentation loaded when you view the cell next to the cortical layers model, under the top
view, but it may slow things down, so it should be possible to turn it off. Try to make it look nice
without too much wasted space."*

THE LAYOUT IS THE POINT, so it is worth writing down what the space already looked like. The
cortical-layer model is a 260x320 SVG; the top view is 260x140 and sits beside it as an equal flex
sibling. That leaves roughly 150 px of nothing under the top view and next to the model -- and 150 px
is almost exactly what a third 260x140 panel needs. So the two diagrams stop being two siblings and
become a MODEL COLUMN and a STACK, and the panel grows by almost nothing: two stacked 260x140 panels
against one 260x320. Where he asked for it and the space that was going spare are the same place,
which is why "under the top view" was the right instruction and not just a preference.

The drawing itself is core/emtiles.js and core/segpaint.js, unchanged -- the same two modules the
tracing pad uses, with the same caches. Nothing new fetches anything.

Everything else this needed is in the spliced block's own header: why 32 nm rather than the pad's
16, why the token, why minnie65 only, and why the ids are passed in rather than read off
CUR_ROOT/CUR_NUCID.

THE IDS ARE THE ONE THING A REVIEWER SHOULD LOOK AT TWICE, and my first reason for passing them
explicitly was wrong: I assumed CUR_ROOT/CUR_NUCID would be stale on the three panels that are not
showNucleus. They are not -- all four set them before building their markup. The real reason is
quieter and survives that correction. CUR_NUCID means "the MICrONS nucleus DETECTION this panel is
about", and the two community panels set it to null deliberately, because they are not about one: a
user-reported cell's nucleus id lives in CUR_NUC_ROOT, and a merged sub-cell has none of its own at
all. Reading CUR_NUCID there would paint no nucleus and report no problem. So each call site passes
what it actually knows about the cell in front of the reader:

    showNucleus            {root, nuc}      the MICrONS root id and nucleus id for this detection
    user-reported cell     {root, nuc}      whatever the reporter typed, which may be neither
    merged sub-cell        {root}           its own root id; the nucleus id is the FUSED blob's
    verified own point     nothing          there is no MICrONS detection here at all

Run: python3 src/a_section_beside_the_model.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# THE BLOCK IS SPLICED BETWEEN SENTINELS, and that is not decoration. An embedded block breaks the
# usual `if new in s` idempotence rule the moment its own text is edited: the OLD anchor is gone
# (already replaced) and the NEW one no longer matches (the block changed), so the generator asserts
# NOT FOUND on a page it has already edited correctly. It happened on this one's first revision. The
# sentinels give the region an identity independent of its contents, so re-running after an edit to
# _emplane_block.js REPLACES the block rather than failing -- which is what "idempotent" has to mean
# for a generator that owns a region rather than a line.
START = "/* @emplane:start */"
END = "/* @emplane:end */"
BLOCK = (START + "\n"
         + io.open(os.path.join(HERE, "src", "_emplane_block.js"), encoding="utf-8").read().rstrip("\n")
         + "\n" + END)


def resplice(s):
    """Replace an already-spliced block, whatever it currently says. Returns (text, did)."""
    i = s.find(START)
    if i < 0:
        return s, False
    j = s.find(END, i)
    assert j > 0, "the block has a start sentinel and no end -- refusing to guess where it ends"
    cur = s[i:j + len(END)]
    if cur == BLOCK:
        return s, "same"
    return s[:i] + BLOCK + s[j + len(END):], True

OLD_FN = '''function renderLocationDiagram(pos){
  const[vx,vy,vz]=pos;
  const layerSvg=renderLayerDiagram(estimateLayer(vx,vy,vz));
  const topSvg=renderTopViewDiagram(vx,vy,vz);
  if(!layerSvg&&!topSvg)return "";
  return '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;margin-top:10px">'
    +(layerSvg?'<div style="flex:1 1 200px;min-width:180px">'+layerSvg+'</div>':'')
    +(topSvg?'<div style="flex:1 1 200px;min-width:180px">'+topSvg+'</div>':'')
    +'</div>';
}'''

NEW_FN = BLOCK + '''
/* TWO COLUMNS, NOT THREE. The model is one column; the top view and the section share the other,
   stacked. Three equal siblings would wrap to a second row on a narrow panel and leave the model's
   own 150 px of dead space exactly where it was -- the stack is what fills it. `ids` is optional
   and carries what the CALLING panel knows (see this file's generator header); a panel that knows
   nothing draws the plane and says it has nothing to overlay, which is the honest answer. */
function renderLocationDiagram(pos,ids){
  const[vx,vy,vz]=pos;
  const layerSvg=renderLayerDiagram(estimateLayer(vx,vy,vz));
  const topSvg=renderTopViewDiagram(vx,vy,vz);
  const emBox=emPlaneBox(pos,ids);
  if(!layerSvg&&!topSvg&&!emBox)return "";
  return '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;margin-top:10px">'
    +(layerSvg?'<div style="flex:1 1 200px;min-width:180px">'+layerSvg+'</div>':'')
    +((topSvg||emBox)?'<div style="flex:1 1 200px;min-width:180px">'+topSvg+emBox+'</div>':'')
    +'</div>';
}'''

PAIRS = [
    (OLD_FN, NEW_FN, "the section is drawn beside the model, under the top view"),

    ('''  h+=renderLocationDiagram(pos);
  h+='<div class="meta">nearest nucleus at voxel ''',
     '''  h+=renderLocationDiagram(pos,{root:root,nuc:nid});
  h+='<div class="meta">nearest nucleus at voxel ''',
     "a MICrONS detection paints its own root and nucleus"),

    ('''  oh+=renderLocationDiagram(ur.pos);''',
     '''  oh+=renderLocationDiagram(ur.pos,{root:ur.rootId,nuc:ur.nucRootId});''',
     "a user-reported cell paints whatever the reporter typed"),

    ('''  h+=renderLocationDiagram(sub.pos);''',
     '''  /* Root id only: this sub-cell's nucleus id is the FUSED detection's, and painting that
     would outline the whole merged blob as if it were this one cell. */
  h+=renderLocationDiagram(sub.pos,{root:sub.subRootId});''',
     "a merged sub-cell paints its own root, never the fused nucleus"),
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


page = os.path.join(HERE, "ujump.html")
text = io.open(page, encoding="utf-8").read()
text, did = resplice(text)
if did is True:
    io.open(page, "w", encoding="utf-8").write(text)
    print("ujump.html\n  ok: the spliced block was refreshed from src/_emplane_block.js")
elif did == "same":
    print("ujump.html\n  already there: the spliced block matches src/_emplane_block.js")

edit("ujump.html", PAIRS)
print("\nnow: node emplanecheck.js && python3 src/build_stamps.py")
