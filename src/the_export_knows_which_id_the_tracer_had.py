# -*- coding: utf-8 -*-
u"""The export knows which id the tracer had.                                           2026-09-26

The last red assertion in tracedexportcheck.js, and the one that actually explains Søren's cell.

core/blenderexport.js now reads a cell's outlines from the dataset, and it works out which cell to
ask about from `opts.cells` — their `nucleus_id` and `root_id`. ηJump's cells carry

    boxCells.push({type: ..., root_id: rid, nucleus_id: null})

because **H01 publishes no nucleus volume**, and that null is correct for what `nucleus_id` means in
the notebook: section 6 does `int(c['nucleus_id'])` and fetches a nucleus mesh with it. Giving it a
cell_bodies object id would send it looking in a volume that does not exist, in the wrong id space.

BUT A TRACING ON ηJUMP IS FILED AGAINST THAT CELL BODY ID. UJ.panel.cellIds on that page answers
`{nucId: c.body, root: c.seg}`, and the tracing card writes `nucleusId: ID_CTX.body`. So an outline
drawn from the cell panel carries the cell body id and no root id, and the export never asked about
it. Søren's whole cell and nucleus came through only because he happened to have a root id when he
drew them; an organelle outlined from the panel would not have.

TWO NAMES FOR TWO QUESTIONS. `nucleus_id` stays what the notebook means by it — "fetch a nucleus
mesh with this" — and `trace_nucleus_id` is the id tracings are filed under on this page. The export
asks about both and the notebook still fetches nothing it cannot fetch.

AND THE FILTER TAKES THE EXPORT'S WORD, which is what a_fetched_outline_belongs_to_the_export.py
put in: an outline read because of these cells belongs to them, so it is not re-judged against ids
the page does not carry.

Check: tracedexportcheck.js — "...without losing the organelles it already carried", the last one.
Run: python3 src/the_export_knows_which_id_the_tracer_had.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("core/blenderexport.js", [
 (u"the export asks about the id tracings are filed under",
  u"""    var nuc = [], root = [];
    (opts.cells || []).forEach(function(c){
      if (c && c.nucleus_id) nuc.push(String(c.nucleus_id));
      if (c && c.root_id) root.push(String(c.root_id));
    });""",
  u"""    var nuc = [], root = [];
    (opts.cells || []).forEach(function(c){
      if (!c) return;
      if (c.nucleus_id) nuc.push(String(c.nucleus_id));
      /* ── AND THE ID TRACINGS ARE FILED UNDER, WHERE IT IS A DIFFERENT ONE ──────  2026-09-26
         ηJump's cells carry nucleus_id: null, correctly — H01 publishes no nucleus volume, and
         section 6 fetches a nucleus mesh with whatever is in that field. Its TRACINGS, though,
         are filed against the cell_bodies object id (UJ.panel.cellIds answers {nucId: c.body}),
         so an outline drawn from its cell panel has that id and no root id, and asking only about
         nucleus_id and root_id never found it. Two names, two questions.
         See src/the_export_knows_which_id_the_tracer_had.py. */
      if (c.trace_nucleus_id) nuc.push(String(c.trace_nucleus_id));
      if (c.root_id) root.push(String(c.root_id));
    });"""),
])

edit("hjump.html", [
 (u"ηJump says which id its tracings are filed under",
  u"""          if(rid)boxCells.push({type:String(typeName(i)||"unclassified"),
                                root_id:String(rid),nucleus_id:null});""",
  u"""          /* nucleus_id stays null: H01 publishes no nucleus volume and the notebook fetches a
             nucleus mesh with that field. trace_nucleus_id is the OTHER question — the id this
             page's tracings are filed under, which is the cell_bodies object (see
             UJ.panel.cellIds above). The export reads outlines by it; the notebook never does.
             2026-09-26, src/the_export_knows_which_id_the_tracer_had.py. */
          if(rid)boxCells.push({type:String(typeName(i)||"unclassified"),
                                root_id:String(rid),nucleus_id:null,
                                trace_nucleus_id:String(HSB[i])});"""),
])
print("\nNow: python3 src/build_stamps.py")
