# -*- coding: utf-8 -*-
u"""The nucleus shows through the soma, in the viewer too.                               2026-10-03

Søren, with a screenshot of a neuron opened from a Discussion post — the soma solid cyan, the
nucleus a flat blue shape sitting beside it on the EM plane rather than inside it: *"The nucleus
should be visible through the soma in the neuroglancer view also. Use same settings as for the cell
identity cell name neuroglancer link"*.

The preview panel had just been fixed for exactly this (core/empreview.js: the nucleus is the solid
subject and the cell is what you look through). The VIEWER state core/jumplink.js builds had not
been, so the same post gave two different pictures depending on which of its two links you took.

WHAT THE CELL-IDENTITY LINK DOES, which he asked for by name: buildState() sets the cell
segmentation's `objectAlpha` to 0.35 whenever a nuclei layer is in the state, and the nuclei layer's
to 0.4. A solid soma hides the nucleus inside it; at 0.35 the nucleus reads through it, which is the
whole reason that line exists.

AND NOW THEY ARE ONE DEFINITION, not two. Those two numbers were literals inside buildState, and
copying them into core/jumplink.js would have been this project's recurring bug in its purest form:
a value decided in one place and matched in a second that drifts from it. Named here as
NG_CELL_ALPHA and NG_NUC_ALPHA, used by buildState, and handed to core/jumplink.js through the hook
it already takes its sources from. Retune them once and every link this tool writes moves together.

THE NUCLEI LAYER IS ALREADY CONDITIONAL on there being nuclei to show — see core/jumplink.js's note
on why minnie35 gets none — so the cell only turns see-through where there is something inside it to
see. A lone cell stays solid, which is the right picture for a lone cell.

Check: jumplinkcheck.js.
Run: python3 src/the_nucleus_shows_through_the_soma.py, then python3 src/build_stamps.py
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


edit("ujump.html", [

 (u"two named alphas, where the other viewer constants live",
  u"const EM_SEG_ALPHA=0.32;",
  u'''const EM_SEG_ALPHA=0.32;
/* ── AND THE TWO THE VIEWER USES ────────────────────────────────  2026-10-03
   A solid soma hides the nucleus inside it, so buildState() has always turned the cell
   semi-transparent whenever a nuclei layer is in the state. Søren, on a link from a Discussion
   post: "The nucleus should be visible through the soma in the neuroglancer view also. Use same
   settings as for the cell identity cell name neuroglancer link."

   They were two literals inside buildState, and core/jumplink.js builds its own state for the
   Discussion links -- so copying them would have been one value decided in two places, which is
   the bug this project keeps paying for. Named here, used there, handed to core/jumplink.js
   through jumpLinkHost. Retune once and every link this tool writes moves together. */
const NG_CELL_ALPHA=0.35,NG_NUC_ALPHA=0.4;'''),

 (u"buildState reads them rather than repeating them",
  u"    if(wantNuc||CUR_NUC_ROOT)s.objectAlpha=0.35;",
  u"    if(wantNuc||CUR_NUC_ROOT)s.objectAlpha=NG_CELL_ALPHA;"),

 (u"...and so does its nuclei layer",
  u'if(wantNuc){const nl={type:"segmentation",source:SRC.nuc,tab:"source",name:"nuclei",notSelectedAlpha:0.05,objectAlpha:0.4};',
  u'if(wantNuc){const nl={type:"segmentation",source:SRC.nuc,tab:"source",name:"nuclei",notSelectedAlpha:0.05,objectAlpha:NG_NUC_ALPHA};'),

 (u"the Discussion links are told the same two numbers",
  u"      dim:DIM, emShader:EM_SHADER_CONTROLS, bg:ngBgColor(),",
  u'''      dim:DIM, emShader:EM_SHADER_CONTROLS, bg:ngBgColor(),
      /* The cell see-through, the nucleus inside it — the same two the cell-identity link uses,
         read rather than copied. */
      alpha:{cell:NG_CELL_ALPHA,nuc:NG_NUC_ALPHA},'''),
])


edit("core/jumplink.js", [

 (u"a cell with a nucleus in it is see-through",
  u'''  host.volumes.forEach(function(v){
    if (!v.seg) return;
    var s = { type: "segmentation", source: v.seg, tab: "source",
              name: "segmentation (" + (v.label || v.key) + ")", notSelectedAlpha: 0.05 };
    if (roots.length) s.segments = roots.slice();
    layers.push(s);
  });''',
  u'''  /* ── SEE-THROUGH ONLY WHERE THERE IS SOMETHING INSIDE ──────────────  2026-10-03
     Søren: "The nucleus should be visible through the soma in the neuroglancer view also. Use same
     settings as for the cell identity cell name neuroglancer link." A solid soma hides the nucleus
     in it, and the cell-identity link has turned the cell down to 0.35 for that reason since it was
     written. The two numbers come from the host rather than being repeated here, so retuning them
     moves every link this tool writes.

     Conditional on the nuclei layer actually being in the state: a cell with nothing inside it
     should stay solid, because solid is the right picture for a lone cell. */
  var wantNuc = host.volumes.some(function(v){
    return v.nuc && (v.key === here || nucs.length); });
  var alpha = host.alpha || {};
  host.volumes.forEach(function(v){
    if (!v.seg) return;
    var s = { type: "segmentation", source: v.seg, tab: "source",
              name: "segmentation (" + (v.label || v.key) + ")", notSelectedAlpha: 0.05 };
    if (roots.length) s.segments = roots.slice();
    if (wantNuc) s.objectAlpha = (alpha.cell === undefined ? 0.35 : alpha.cell);
    layers.push(s);
  });'''),

 (u"...and the nuclei layer takes its own",
  u'''    var nl = { type: "segmentation", source: v.nuc, tab: "source", name: "nuclei",
               notSelectedAlpha: 0.05, objectAlpha: 0.4 };''',
  u'''    var nl = { type: "segmentation", source: v.nuc, tab: "source", name: "nuclei",
               notSelectedAlpha: 0.05,
               objectAlpha: (alpha.nuc === undefined ? 0.4 : alpha.nuc) };'''),
])
print("\nNow: node jumplinkcheck.js, then python3 src/build_stamps.py")
