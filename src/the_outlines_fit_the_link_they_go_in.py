# -*- coding: utf-8 -*-
u"""The outlines fit the link they are going into.                                        2026-09-23

Søren, asking for whole cells in Filter and show: "We also have to keep in mind that they may be too
big for showing in Neuroglancer if we collect all of them."

He is right, and nothing was looking. Every caller of buildTracedOrganelleLayers -- µJump, δJump,
πJump and ηJump each in their own closure, βJump/λJump/χJump through core/openall.js -- pushes the
layers onto a state and builds `base + "#!" + encodeURIComponent(JSON.stringify(state))`. Past
2,097,152 characters the browser refuses and the tab becomes about:blank#blocked; measured in
Søren's own browser on 2026-09-22, and the evening he lost to it.

THE CAP THAT EXISTED WAS IN THE WRONG UNIT. FILTER_TRACE_CAP stops at 150 OUTLINES, and its comment
says what it is for: "one Drive read per outline is right for a cell and wrong for a filter that
matched three hundred". That is a cap on READS. It has no relationship to the length of the link:
150 lysosomes is a small view, and THREE of Søren's arachnoid barrier cells is 393 contours and
44,000 vertices. Measured here: six cells of 200 contours produced a 22,397k link -- ten times the
cap -- and the outline cap never fired, because six is less than a hundred and fifty.

SO THERE IS A SECOND CAP, IN CHARACTERS, because characters are what the browser counts. Each
outline's annotations are measured as they will be encoded, and outlines are taken until the budget
is spent. The reads cap stays exactly as it was, doing its own job.

WHAT THE BUDGET IS. 1,200,000 encoded characters by default, of 2,097,152 -- so about 900k is left
for everything else the state carries, which on these pages is segmentation layers, region boxes,
organelle points and the EM. A caller that knows better can say so: `{budget: n}`, and Infinity
turns it off, which is what the check uses to measure what an untrimmed selection would have been.

MEASURED THE WAY THE BROWSER WILL. encodeURIComponent inflates JSON by roughly two thirds -- every
quote, brace, comma and colon becomes three characters -- so measuring the raw JSON would let
through a link half again too long. The cost of each outline is the encoded length of its own
annotations, which is a slight over-estimate per outline (each is measured as though it were alone)
and therefore errs the safe way.

AND IT SAYS WHAT IT LEFT OUT, in the same sentence the reads cap already uses, because a view that
quietly drew some of the outlines is a lie about what the dataset holds -- and the person reading it
is deciding what to trace next.

Check: tracedlinksizecheck.js, written first; four of its assertions failed before this went in.
Run: python3 src/the_outlines_fit_the_link_they_go_in.py, then python3 src/build_stamps.py, then
python3 wjump-build/build_wjump.py and python3 xjump-build/build_xjump.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s: %d" % (name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("core/tracedoutlines.js", [
 (u"the budget, and what it is measured in",
  u'''const FILTER_TRACE_CAP=150;
async function buildTracedOrganelleLayers(ids,want,say){''',
  u'''/* ── TWO CAPS, FOR TWO DIFFERENT COSTS ────────────────────────────────────────  2026-09-23
   Søren, on picking whole cells: "We also have to keep in mind that they may be too big for showing
   in Neuroglancer if we collect all of them."

   FILTER_TRACE_CAP is a cap on READS -- one Drive file per outline -- and says so in its own note.
   It is not a cap on the LINK, and cannot be: 150 lysosomes is a small view and three whole cells
   is not. Measured 2026-09-23: six traced cells of 200 contours built a 22,397k link, ten times
   what a tab can be opened with, without the outline cap firing once.

   So the link has a cap of its own, in the unit the browser actually counts. 2,097,152 is where
   Chromium stops (measured in Søren's browser, 2026-09-22); 1,200,000 of it is offered to the
   outlines and the remaining ~900k left for what else the state carries -- segmentation layers,
   region boxes, organelle points, the EM. A caller that knows its own state can pass {budget: n}.
   See src/the_outlines_fit_the_link_they_go_in.py. */
const FILTER_TRACE_CAP=150;
const FILTER_TRACE_BUDGET=1200000;
/* What this costs in a URL, not in memory: encodeURIComponent turns every quote, brace, comma and
   colon into three characters, so JSON.stringify alone under-counts by about two thirds. */
function tracedOutlinesCost(anns){
  try { return encodeURIComponent(JSON.stringify(anns)).length; }
  catch (_e){ return Infinity; }
}
async function buildTracedOrganelleLayers(ids,want,say,opts){'''),

 (u"each outline is measured, and taken while it fits",
  u'''  const layers=[];
  Object.keys(byKind).sort().forEach(function(k){
    const anns=[];
    byKind[k].forEach(function(g,gi){
      /* The same annotations tracingViewerOpen writes for one cell: one closed POLYLINE per
         contour (2026-09-22, src/the_viewer_link_is_polylines.py). */
      [].push.apply(anns,UJ.tracing.ringAnnotations(g.rings||[],"to"+gi));
    });
    if(!anns.length)return;''',
  u'''  /* ── AS MANY AS THE LINK WILL TAKE ────────────────────────────────────────────  2026-09-23
     The annotations are made first and measured as they go, and an outline that does not fit the
     remaining budget is left out whole -- never half an outline, which would be a shape nobody
     traced. Order is the index's, so what you get is the first N rather than an arbitrary N. */
  const budget=(opts&&opts.budget!==undefined)?opts.budget:FILTER_TRACE_BUDGET;
  const madeFor={}; let spent=0, tooBig=0;
  Object.keys(byKind).sort().forEach(function(k){
    madeFor[k]=[];
    byKind[k].forEach(function(g,gi){
      /* The same annotations tracingViewerOpen writes for one cell: one closed POLYLINE per
         contour (2026-09-22, src/the_viewer_link_is_polylines.py). */
      const a=UJ.tracing.ringAnnotations(g.rings||[],"to"+gi);
      if(!a||!a.length)return;
      const cost=tracedOutlinesCost(a);
      if(spent+cost>budget){ tooBig++; return; }
      spent+=cost;
      [].push.apply(madeFor[k],a);
    });
  });
  const layers=[];
  Object.keys(byKind).sort().forEach(function(k){
    const anns=madeFor[k]||[];
    if(!anns.length)return;'''),

 (u"...and the count on the layer is what it drew",
  u'''    layers.push({type:"annotation",source:"local://annotations",tab:"annotations",
                 name:"traced "+label+" ("+byKind[k].length+")",
                 annotationColor:byKind[k][0].t.color||"#40e28c",
                 annotations:anns});
  });''',
  u'''    layers.push({type:"annotation",source:"local://annotations",tab:"annotations",
                 name:"traced "+label+" ("+byKind[k].length+")",
                 annotationColor:byKind[k][0].t.color||"#40e28c",
                 annotations:anns});
  });
  /* SAID, NOT SILENT -- the same rule the reads cap follows six lines down, for the same reason:
     somebody reading this view is deciding what to trace next. */
  if(tooBig&&typeof showSubmitToast==="function"){
    /* WHY, WHEN THE ANSWER IS THE VIEWER. On one that cannot read polylines every EDGE of every
       contour is its own annotation, so a single whole cell is already over the budget and the
       honest view is empty -- measured here: three traced cells are 180 contours and 712k as
       polylines, and nothing at all as lines. An empty view with no reason is the worst of the
       three outcomes, so the reason somebody can act on is named. */
    var shapeWhy="";
    try {
      if(UJ.tracing&&UJ.tracing.viewerTakesPolylines&&!UJ.tracing.viewerTakesPolylines())
        shapeWhy=" This viewer cannot read polyline annotations, so every edge of every contour is "
               +"its own line and these outlines cost about four times what they need to \\u2014 "
               +"Spelunker and neuroglancer-demo read polylines, and the same cells fit there.";
    } catch (_sw){}
    showSubmitToast(false,(got.length===tooBig
        ?"Not one of these "+tooBig+" outlines fits a viewer link on its own"
        :"Left "+tooBig+" outline"+(tooBig===1?"":"s")+" out")
      +" \\u2014 a viewer link cannot be opened past 2,097,152 characters"
      +(got.length===tooBig?"":", and the ones drawn already fill it")+". Pick one kind rather "
      +"than all, or narrow the filter. A whole cell is a hundred times the contours of a "
      +"lysosome."+shapeWhy);
  }'''),
])
