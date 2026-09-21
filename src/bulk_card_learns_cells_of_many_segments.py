# -*- coding: utf-8 -*-
u"""core/bulkorgan.js, for a dataset whose cell is many segments.                      2026-09-21

χJump step 3. On cb2 the segment under a marker is a FRAGMENT, and a cell is 100-300 of them; the
bulk card grouped markers by the segment id it read, so three mitochondria in one Purkinje cell,
each on a different fragment, came out as "3 cells" -- three submissions, three groupIds, and the
cell's own panel reading three visits instead of one.

Two optional host settings, both off everywhere else:

  groupByRow   markers are grouped by the CELL the host's indexOfRoot names, not by the segment.
               (On µJump one segment is one row, so the grouping would be the same either way --
               but it is not switched on there, so nothing moves.)
  needsCell    a sentence. A marker on a segment that belongs to no cell is shown with it and
               cannot be ticked: on χJump such a fragment has no cell key to file under, and a row
               with none is one no cell will ever read back. Build the cell, then paste again.

And each row posts ITS OWN segment as rootId (the first row's did, for the whole group). On µJump the
rows of a cell share one root, so every row posts exactly what it did.

Run: python3 src/bulk_card_learns_cells_of_many_segments.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def edit(rel, pairs):
    p = os.path.join(HERE, rel); s = io.open(p, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s / %s: %d" % (rel, name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(p, "w", encoding="utf-8").write(s)

print("core/bulkorgan.js")
edit("core/bulkorgan.js", [
 (u"the contract names the two settings",
  u'''       name:           (row) -> the cell's type, for that label      (own / community / MICrONS)
     }''',
  u'''       name:           (row) -> the cell's type, for that label      (own / community / MICrONS)
       groupByRow:     true -> markers group by CELL (row), not by segment  (off)   2026-09-21
       needsCell:      "why" -> a segment in no cell cannot be ticked       (off)   2026-09-21
     }'''),
 (u"a cell of many segments is one cell",
  u'''    out.i=i; out.cellKey=hit.r.rootId;''',
  u'''    out.i=i; out.cellKey=hit.r.rootId;
    /* A CELL OF MANY SEGMENTS IS ONE CELL, 2026-09-21 -- χJump, where the segment is a fragment. */
    if(i>=0&&bulkCfg().groupByRow)out.cellKey="row:"+i;
    if(i<0&&bulkCfg().needsCell){ out.cellKey=""; out.warn=String(bulkCfg().needsCell); return out; }'''),
 (u"each row posts its own segment",
  u'''        nucleusId:nucId,rootId:rootId,coord:coord,''',
  u'''        nucleusId:nucId,rootId:(r.rootId&&r.rootId!=="0")?r.rootId:rootId,coord:coord,'''),
])
