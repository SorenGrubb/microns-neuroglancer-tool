# -*- coding: utf-8 -*-
u"""The three panels tell the renderer what they are drawing.                            2026-10-04

src/the_panel_says_what_it_is_drawing.py gave every surface a `label` and the panel a legend(); this
is the three callers filling it in, so the corner block and the caption say something real instead
of nothing.

  the cell card        "Cell <root>" and "Nucleus <nucleus id>" -- both ids are already in hand at
                       that point, one from the button's data-root and one from its data-nucid.
  the Discussion       the same two, from the coordinate's own lookup. It already writes exactly
                       this sentence under the panel ("cell 864…, nucleus 485387"); now the picture
                       carries it too.
  the tracing pad      THE ORGANELLE, which is what Søren was actually asking about: "if there are
                       organelles, then also which organelles." Every traced structure on the pad
                       belongs to an annotation layer, and the layer is what it IS -- mitochondrion,
                       lysosome. The group carries that name and the panel has never had anywhere
                       to put it.

AND THE FILE IS NAMED AFTER THE CELL. `saveName` was read by the save button from the day it was
written and nothing ever set it, so every export was called "cell_20261004_...". The cell card and
the pad both know better.

Check: shotcheck.js, and the pad through pad3dcheck.js.
Run: python3 src/every_surface_says_its_name.py
     python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    print(rel)
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("core/mesh3d.js", [

 (u"the cell card names its cell",
  u'''            var opts2 = { what: "cell", lead: lead,
                          emptyMessage: "This cell has no mesh geometry to draw." };''',
  u'''            var opts2 = { what: "cell", lead: lead,
                          /* For the exported picture's corner and for the file's name. Both ids
                             are in hand here and neither was being passed on. 2026-10-04. */
                          label: "Cell " + root,
                          saveName: "cell_" + root,
                          emptyMessage: "This cell has no mesh geometry to draw." };'''),

 (u"...and the nucleus in it",
  u'''                opts2.ghosts = [{ geo: ng, what: "nucleus", tint: NUC_TINT, alpha: 1 }];''',
  u'''                opts2.ghosts = [{ geo: ng, what: "nucleus", label: "Nucleus " + nucId,
                                  tint: NUC_TINT, alpha: 1 }];'''),
])


edit("core/empreview.js", [

 (u"the preview's ghosts say their names",
  u'''    ghosts.push({ geo: g,
                  /* PASSED ON, not re-derived from the colour. core/mesh3d.js's "look at the
                     nucleus" and "show one of them" buttons need to know which surface is which,
                     and this function has known since it was written. 2026-10-03. */
                  what: parts[i].what,''',
  u'''    ghosts.push({ geo: g,
                  /* PASSED ON, not re-derived from the colour. core/mesh3d.js's "look at the
                     nucleus" and "show one of them" buttons need to know which surface is which,
                     and this function has known since it was written. 2026-10-03. */
                  what: parts[i].what,
                  /* And the name, for the exported picture's corner. 2026-10-04. */
                  label: parts[i].label || "",'''),

 (u"...and so does the subject",
  u'''  M.show(host, geos[leadAt], { ghosts: ghosts, view: host.__empView,
                               what: parts[leadAt].what,''',
  u'''  M.show(host, geos[leadAt], { ghosts: ghosts, view: host.__empView,
                               what: parts[leadAt].what,
                               label: parts[leadAt].label || "",
                               saveName: parts[leadAt].saveName || "cell",'''),

 (u"the cell it drew",
  u'''      parts.unshift({ what: "cell", mesh: m, unitNm: 1000 });''',
  u'''      parts.unshift({ what: "cell", mesh: m, unitNm: 1000,
                      label: "Cell " + at.root, saveName: "cell_" + at.root });'''),

 (u"...and the nucleus it drew",
  u'''      parts.push({ what: "nucleus", mesh: n, unitNm: 1000 });''',
  u'''      parts.push({ what: "nucleus", mesh: n, unitNm: 1000, label: "Nucleus " + at.nuc });'''),
])


edit("core/tracingcard.js", [

 (u"the pad names the organelle it is tracing",
  u'''      siblings.push({ geo: q, tint: pad3DTint(lofts[i].inst), alpha: 1 });''',
  u'''      siblings.push({ geo: q, tint: pad3DTint(lofts[i].inst), alpha: 1,
                      label: padLoftName(lofts[i]) });'''),

 (u"...and the one it is drawing",
  u'''    const drawn = siblings.concat(ghosts.map(function(x){''',
  u'''    /* ── WHAT A TRACED STRUCTURE IS CALLED ───────────────────────────────────────  2026-10-04
       Its annotation layer, which on the pad is the organelle: "mitochondrion", "lysosome". Søren,
       on what a shared picture should say: "if there are organelles, then also which organelles."
       The group has carried the name since the layers panel was written; nothing had ever asked it
       for the panel's sake. A layer with no name is left unlabelled rather than called
       "(unnamed layer)" on a picture somebody is about to post. */
    function padLoftName(L){
      var g = (tracingGroups() || []).filter(function(x){ return x.inst === L.inst; })[0];
      var nm = (g && g.layer ? String(g.layer) : "").trim();
      return nm ? (nm.charAt(0).toUpperCase() + nm.slice(1)) : "";
    }
    const drawn = siblings.concat(ghosts.map(function(x){'''),

 (u"...and the ghosts around it",
  u'''               /* "cell" or "nucleus", for the panel's own buttons. It was already in hand here and
                  dropped on the way in. 2026-10-03. */
               what: x.what,''',
  u'''               /* "cell" or "nucleus", for the panel's own buttons. It was already in hand here and
                  dropped on the way in. 2026-10-03. */
               what: x.what,
               label: x.label || "",'''),
])
print("\nNow: python3 src/build_stamps.py")
