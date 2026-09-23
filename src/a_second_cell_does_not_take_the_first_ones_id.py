# -*- coding: utf-8 -*-
u"""A second cell with the same name does not take the first one's id.                    2026-09-23

Søren: "I found that one of the arachnoid barrier cells is missing".

IT WAS NOT MISSING. IT WAS OVERWRITTEN. Two rows in his sheet carry the SAME structureId,
whole-cell_1790144992280:

    nucleus 286849   140 sections, 176 contours, 30,948 vertices, 3,615 µm³   <- gone from the list
    nucleus 286159   105 sections, 114 contours,  9,322 vertices,   985 µm³   <- shown, as "v2"

Two different arachnoid barrier cells, filed as two versions of one structure, so the list shows only
the later one. 30,948 vertices of tracing became the previous version of somebody else's cell.

WHERE IT CAME FROM. tracingCurrentAll settles the id first, and reached for a prior id like this:

    const prior = (TRACINGS_KEPT||[]).filter(function(x){return x&&x.id&&x.name===label;})[0];
    TRACING_PENDING.id = (prior&&prior.id) || UJ.tracing.structureId(label);

On the NAME ALONE. "Whole cell" is the default name of every cell anybody traces, and "Lysosome 1"
of every cell's first lysosome -- so the second arachnoid barrier cell found the first one in the
kept list, by name, and took its id.

THE INTENT WAS RIGHT. Trace a cell, add it, re-read the same cell and add it again: it should file a
version rather than a twin, and only a remembered id can do that. The KEY was far too weak. A
structure is identified by its name AND THE CELL IT IS PART OF; a different nucleus is a different
cell and nothing about it can be a version of the other.

SO THE CELL JOINS THE KEY, the same three ways tracingNextIndex twenty lines above already compares
cells: the nucleus id, the root id, or the cell coordinate, any ONE positive match being enough. A
root id moves when somebody proofreads the segmentation, a nucleus id does not, and a cell with
neither still has the coordinate it was found at.

AND WHEN NOTHING CAN BE COMPARED -- neither side names a cell in any of the three ways -- the answer
is NO, a fresh id, rather than falling back to the name. The two mistakes are not equal: a twin is
two rows to merge, and an overwrite is somebody's afternoon behind a "v2" label. Nothing is deleted
by minting an id, so the doubtful case takes the recoverable error.

Ids already in the sheet are untouched; this only decides ids for tracings added from now on. The
two rows Søren has need fixing in the sheet -- nothing in the page can tell them apart any more.

Check: idcollisioncheck.js, written first; it reproduced the collision (both cells
whole-cell_1790186148031) before this went in.
Run: python3 src/a_second_cell_does_not_take_the_first_ones_id.py, then python3 src/build_stamps.py,
then python3 wjump-build/src/build_wjump.py and python3 xjump-build/src/build_xjump.py
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


edit("core/tracingcard.js", [
 (u"the prior id has to be the same cell as well as the same name",
  u'''  if(!TRACING_PENDING.id){
    const label=groups[0].w.name;
    const prior=(TRACINGS_KEPT||[]).filter(function(x){return x&&x.id&&x.name===label;})[0];
    TRACING_PENDING.id=(prior&&prior.id)||UJ.tracing.structureId(label);
  }''',
  u'''  if(!TRACING_PENDING.id){
    const label=groups[0].w.name;
    /* ── AND THE SAME CELL ────────────────────────────────────────────────────────  2026-09-23
       Søren: "one of the arachnoid barrier cells is missing". It was overwritten. This filter
       matched on the NAME alone, and "Whole cell" is the default name of every cell anybody traces
       -- so his second arachnoid barrier cell (nucleus 286159) found the first (nucleus 286849) in
       the kept list, took its id, and filed 30,948 vertices of somebody's tracing as the previous
       version of a different cell.

       The intent is right and stays: re-reading a cell you have already added must file a version
       rather than a twin. The key was too weak. A structure is its name AND THE CELL IT IS PART OF,
       compared the same three ways tracingNextIndex compares cells above -- nucleus, root, or the
       coordinate -- any one positive match being enough, because a root id moves when the
       segmentation is proofread and a nucleus id does not.

       WITH NOTHING TO COMPARE the answer is no. A twin is two rows to merge; an overwrite is an
       afternoon of tracing behind a "v2" label. Minting an id deletes nothing, so the doubtful case
       takes the recoverable mistake. See src/a_second_cell_does_not_take_the_first_ones_id.py. */
    const bareId=function(v){ var s=String(v||""); var i=s.indexOf(":"); return i<0?s:s.slice(i+1); };
    const cellOf=function(x){
      return {nuc:bareId(x&&(x.nucleus_id||x.nucleusId)),
              root:bareId(x&&(x.root_id||x.rootId)),
              at:String((x&&(x.cell_coord||x.cellCoord))||"")};
    };
    const here=cellOf({nucleus_id:nid,root_id:rid,cell_coord:tracingCellAtVal()});
    const sameCell=function(x){
      const c=cellOf(x);
      return !!((here.nuc&&c.nuc&&c.nuc===here.nuc)
              ||(here.root&&c.root&&c.root===here.root)
              ||(here.at&&c.at&&c.at===here.at));
    };
    const prior=(TRACINGS_KEPT||[]).filter(function(x){
      return x&&x.id&&x.name===label&&sameCell(x);
    })[0];
    TRACING_PENDING.id=(prior&&prior.id)||UJ.tracing.structureId(label);
  }'''),
])
