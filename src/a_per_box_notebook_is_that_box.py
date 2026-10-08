# -*- coding: utf-8 -*-
u"""A per-box notebook is that box.                                                      2026-10-07

Søren, with two boxes side by side in ηJump's Filter-and-show: *"When I download the Blender file
for each of the boxes, they seem to contain more than their own data, but also data from the other
boxes."* His dump of box 1's TRACINGS block proves it in his own coordinates -- box 1 is
x 398472-408844, y 227782-232124, z 181-972, and the cell it carries from box 2 is at

    Nucleus                 x ~426400  y ~220700  z 1941-2099
    Centriole / centrosome 1  x ~426800  y ~220400  z 2064-2084
    Centriole / centrosome 2  x ~427680  y ~220010  z 2000-2009
    Primary cilium 1        x ~427650  y ~220110  z 2017-2030
    Whole cell              x ~426150  y ~220336  z 1802 onwards

about 125 um away, none of it inside the box the notebook says it is for.

WHERE IT GOT IN. core/blenderexport.js asks the dataset for every outline filed against the
export's cells (datasetTracingsFor, 2026-09-26) and marks each one `for_export = 1`. The filter
under it opened with

    if (t && t.for_export) return true;

on the reasoning written into the file: "BY CONSTRUCTION THEIRS: tracedStructuresForCells was
handed these cells' ids and returned only what matched one of them." That construction is the
`nucleus or root` test this week has been spent removing from eight other places. His vascular
cells all share root 6198781614 -- which is the whole reason he traces them by hand -- so the
fetch for box 1's cells returns box 2's outlines too, each one flagged, each one waved past both
the id test AND the box test beneath it.

AND THE FLAG WAS NOT EVEN THE ONLY WAY IN. The id test below it asked UJ.tracing.sameCell against
opts.cells, and those cells arrive with nucleus_id null (H01 publishes no nucleus volume) and no
coordinate at all -- so the only thing left to compare was the shared root id, which matches every
one of them. Removing the flag alone would have changed nothing.

SO:

  1. core/tracing.js gains sameCellWhy(a, b) -> "at" | "nuc" | "root" | "". Still ONE rule --
     sameCell is now `!!sameCellWhy(...)`, byte for byte the same answers -- but a caller can see
     WHICH evidence carried the match. A root id shared by a hundred vascular cells is evidence a
     per-box export must not act on by itself, and that is a judgement about this export, not a
     change to what "the same cell" means.

  2. core/blenderexport.js builds its cell keys with the coordinate and with trace_nucleus_id (the
     id ηJump's tracings are actually filed under), then:
       - a coordinate or nucleus match travels, box or no box -- a tight box is not a claim about
         where a cell ends, and an organelle of a cell in this box belongs to this box;
       - anything else -- a root-only match, a fetched outline, one filed against nothing -- is
         judged by whether its own centre is inside the box;
       - one with no contours and no box to judge by is still kept, because dropping outlines in
         silence is the failure this whole week has been about.

  3. The notebook SAYS how many it left behind, in the cell the panel writes. A filter without a
     remainder is an invisible change.

  4. ηJump's boxCells carry cell_coord, so the coordinate evidence exists at all on the page where
     the root ids are worthless.

WHAT THIS DOES NOT FIX: the cells themselves. MESH_ROOT_IDS for his vasculature is one shared
segment that genuinely spans both boxes, and no filter here can cut a published mesh in half.
That is the segmentation he is tracing around, not a bug in this panel.

Checks: boxonlycheck.js (new), panelcellcheck.js, cellidentitycheck.js
Run: python3 src/a_per_box_notebook_is_that_box.py
     python3 src/build_stamps.py
     node boxonlycheck.js
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
        n = s.count(old)
        assert n == 1, "@NM@ (@F@): @N@".replace("@NM@", name).replace("@F@", os.path.basename(P)).replace("@N@", str(n))
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


# ── 1. one rule, with its reason visible ──────────────────────────────────────────────────────
OLD_SAME = u'''  function sameCell(a, b){
    if (!a || !b) return false;
    var aa = coordKey(a.at), bb = coordKey(b.at);
    if (aa && bb) return aa === bb;
    if (a.nuc && b.nuc) return String(a.nuc) === String(b.nuc);
    return !!(a.root && b.root && String(a.root) === String(b.root));
  }'''

NEW_SAME = u'''  /* WHICH EVIDENCE SAID SO.  2026-10-07
     "at" (the reported centre), "nuc" (the nucleus or cell-body id), "root" (the segment), or ""
     for not the same cell. sameCell is `!!sameCellWhy(...)` -- the same answers, from the same
     lines -- because a second function that decides the same thing is how this test came to have
     eight homes in the first place.

     The reason it is worth naming: a root id is the weakest of the three and in vasculature it is
     worthless. Søren's cells share 6198781614, so "matched by root" means "might be any of a
     hundred cells", and a caller sending one cell's outlines to a Blender notebook has to be able
     to tell that apart from a match on the coordinate. Weighing the evidence is the caller's
     business; deciding what the evidence IS stays here. */
  function sameCellWhy(a, b){
    if (!a || !b) return "";
    var aa = coordKey(a.at), bb = coordKey(b.at);
    if (aa && bb) return aa === bb ? "at" : "";
    if (a.nuc && b.nuc) return String(a.nuc) === String(b.nuc) ? "nuc" : "";
    return (a.root && b.root && String(a.root) === String(b.root)) ? "root" : "";
  }
  function sameCell(a, b){ return !!sameCellWhy(a, b); }'''

OLD_EXPORT = u'''  return { coordKey: coordKey, cellOf: cellOf, sameCell: sameCell,
           elsewhereByCoord: elsewhereByCoord,'''
NEW_EXPORT = u'''  return { coordKey: coordKey, cellOf: cellOf, sameCell: sameCell,
           sameCellWhy: sameCellWhy,
           elsewhereByCoord: elsewhereByCoord,'''

edit("core/tracing.js", [
    (u"sameCellWhy names the evidence, sameCell delegates", OLD_SAME, NEW_SAME),
    (u"...and it is on the module with the rest", OLD_EXPORT, NEW_EXPORT),
])

# ── 2. the filter ─────────────────────────────────────────────────────────────────────────────
OLD_FILT = u'''    tracings = tracings.filter(function(t){
      /* Read from the dataset for the cells in this export, so the question is already settled
         (2026-09-26). Without this, a tracing filed against a cell body id on a page whose cells
         carry no nucleus id matched nothing, was not judged by position either, and vanished. */
      if (t && t.for_export) return true;
      var nuc = String((t && t.nucleus_id) || "").replace(/^.*:/, "");
      var root = String((t && t.root_id) || "");
      /* ── THROUGH THE ONE DEFINITION ──────────────  2026-10-07
         This was `nuc || root`, with no coordinate — and Søren's vascular cells share one
         root id, so an export of any one of them would have carried every tracing made on all of
         them. core/tracing.js answers it now, coordinate first, for this file and the card and the
         panel alike. */
      var here = UJ.tracing.cellOf(t);
      var mine = cells.some(function(c){ return UJ.tracing.sameCell(here, UJ.tracing.cellOf(c)); });
      if (mine) return true;
      /* A tracing filed against a DIFFERENT cell is not this export's, wherever it is: that is the
         one Søren found, 430 µm outside the box. One filed against no cell at all is judged by
         where it is, and kept when there is no voxel size to judge it with -- a page cached from
         before this change sends none, and dropping every outline in silence would be worse than
         the extra one this filter exists to remove. */
      if (nuc || root) return false;
      /* Its centre, in nanometres, against the box. */
      var R = opts.resNm;
      if (!Array.isArray(R) || R.length !== 3 || b.xmin == null) return true;
      var n = 0, sx = 0, sy = 0, sz = 0;
      ((t && t.rings) || []).forEach(function(r){
        (r.points || []).forEach(function(p){
          sx += Number(p[0]); sy += Number(p[1]); sz += Number(r.z); n++;
        });
      });
      if (!n) return false;
      var x = sx / n * R[0], y = sy / n * R[1], z = sz / n * R[2];
      return x >= b.xmin && x <= b.xmax && y >= b.ymin && y <= b.ymax && z >= b.zmin && z <= b.zmax;
    });'''

NEW_FILT = u'''    /* ── THE CELLS, WITH EVERY ID THEY ACTUALLY CARRY ────────  2026-10-07
       `cells` above is the mapped, notebook-shaped copy: type, root_id, nucleus_id, and nothing
       else. The question "is this outline one of these cells'" needs the two fields that copy
       drops -- the coordinate, and trace_nucleus_id, which is the id ηJump's outlines are
       filed under because H01 publishes no nucleus volume. Asked of opts.cells, not of the copy. */
    /* A page without core/tracing.js has no shared definition to ask, and nbexportcheck.js
       evaluates this file on its own. There the box is the only authority there is, which for a
       per-box notebook is the right one to fall back to. */
    var UT = (window.UJ && UJ.tracing && UJ.tracing.sameCellWhy) ? UJ.tracing : null;
    var cellKeys = !UT ? [] : (opts.cells || []).map(function(c){
      return UT.cellOf({
        nucleus_id: (c && (c.trace_nucleus_id || c.nucleus_id)) || "",
        root_id: (c && c.root_id) || "",
        cell_coord: (c && (c.cell_coord || c.cellCoord)) || ""
      });
    });
    /* Its own centre, in nanometres, against the box: true, false, or null for "nothing to judge
       it with" -- no box, no voxel size, or no contours. */
    var centreInBox = function(t){
      var R = opts.resNm;
      if (!Array.isArray(R) || R.length !== 3 || b.xmin == null) return null;
      var n = 0, sx = 0, sy = 0, sz = 0;
      ((t && t.rings) || []).forEach(function(r){
        (r.points || []).forEach(function(p){
          sx += Number(p[0]); sy += Number(p[1]); sz += Number(r.z); n++;
        });
      });
      if (!n) return null;
      var x = sx / n * R[0], y = sy / n * R[1], z = sz / n * R[2];
      return x >= b.xmin && x <= b.xmax && y >= b.ymin && y <= b.ymax
          && z >= b.zmin && z <= b.zmax;
    };
    var leftOut = 0;
    tracings = tracings.filter(function(t){
      /* ── WHAT CARRIED THE MATCH, NOT ONLY WHETHER THERE WAS ONE ──  2026-10-07
         Søren: *"they seem to contain more than their own data, but also data from the other
         boxes."* A coordinate or a nucleus id names ONE cell, so an outline that matches on either
         is this export's wherever its centre happens to fall -- a box drawn tight round a soma is
         not a claim about where the cell ends. A ROOT id in vasculature names a hundred cells at
         once, and `for_export` -- set by the fetch that asked the dataset for these cells' ids --
         is only as strong as the ids it asked with, so it is the same weak evidence wearing a
         flag. Both go to the box. */
      var here = UT ? UT.cellOf(t) : null;
      var why = "";
      if (here) cellKeys.forEach(function(k){
        var w = UT.sameCellWhy(here, k);
        if (w === "at" || (w === "nuc" && why !== "at")) why = w;
        else if (w && !why) why = w;
      });
      if (why === "at" || why === "nuc") return true;
      var inBox = centreInBox(t);
      /* Nothing to judge it by: a page cached from before resNm was sent gives no voxel size, and
         an outline whose geometry has not been read has no centre. Kept, because dropping every
         outline in silence would be worse than the extra one this filter exists to remove. */
      if (inBox === null) return true;
      if (!inBox) leftOut++;
      return inBox;
    });
    /* AND IT SAYS SO. A filter without a remainder is an invisible change — the lesson of
       2026-10-07, applied in the file that is written rather than only on screen. */
    if (leftOut)
      lines.push("# " + leftOut + " hand-traced outline(s) left out of this box: filed against "
                 + "another cell, or their own centre is outside it.");'''

edit("core/blenderexport.js", [
    (u"the box decides, and the evidence is weighed", OLD_FILT, NEW_FILT),
])

# ── 3. ηJump's export cells carry their coordinate ────────────────────────────────────────────
OLD_CELLS = u'''          if(rid)boxCells.push({type:String(typeName(i)||"unclassified"),
                                root_id:String(rid),nucleus_id:null,
                                trace_nucleus_id:String(HSB[i])});'''
NEW_CELLS = u'''          /* AND WHERE IT IS. 2026-10-07: the Blender export asks "is this outline one of
             these cells'", and on this page a root id answers "it is one of a hundred" — these
             are the vascular cells sharing 6198781614. The coordinate is the only id that names
             one cell, it is three array reads away, and without it the export had nothing to
             judge with. Same frame as the tracings': voxels. */
          if(rid)boxCells.push({type:String(typeName(i)||"unclassified"),
                                root_id:String(rid),nucleus_id:null,
                                cell_coord:HX[i]+","+HY[i]+","+HZ[i],
                                trace_nucleus_id:String(HSB[i])});'''

edit("hjump.html", [
    (u"the export's cells say where they are", OLD_CELLS, NEW_CELLS),
])
print("done")
