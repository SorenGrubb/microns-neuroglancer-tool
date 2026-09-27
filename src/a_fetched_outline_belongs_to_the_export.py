# -*- coding: utf-8 -*-
u"""An outline the export fetched for these cells belongs to them.                      2026-09-26

Found by tracedexportcheck.js while everything_outlined_and_the_dataset_travels.py was going in:
the whole cell and the nucleus arrived in the notebook and the cilium and the centrioles did not,
even though all four had just been read from the dataset FOR THIS CELL.

core/blenderexport.js decides which tracings belong to an export by comparing each one's ids
against the cells in it:

    var mine = cells.some(function(c){
      return (nuc && String(c.nucleus_id || "") === nuc) || (root && String(c.root_id || "") === root);
    });
    if (mine) return true;
    if (nuc || root) return false;        // filed against a DIFFERENT cell

That test is right for the case it was written for — Søren's lysosomes 430 µm outside the box,
2026-09-22 — and it fails on a page whose cells carry no nucleus id. ηJump's are exactly that:
`boxCells.push({type, root_id, nucleus_id: null})`, because H01 publishes no nucleus volume. A
tracing filed by CELL BODY id there matches nothing, is not judged by position either, and is
dropped in silence. The whole cell and the nucleus survived only because the tracer happened to
have a root id when he drew them.

THE FIX IS NOT TO GIVE ηJUMP'S CELLS A NUCLEUS ID. The notebook's own nucleus-mesh section reads
`int(c['nucleus_id'])` and would then go looking for a nucleus volume that does not exist in H01.
The id it would be given is a cell_bodies object, which is a different id space.

WHAT IS TRUE INSTEAD: an outline the export fetched BECAUSE OF these cells belongs to them, by
construction — tracedStructuresForCells was handed their ids and returned only what matched. So
that answer travels with the tracing (`for_export`) instead of being recomputed from ids the page
may not have. Everything else keeps the old test, including every tracing kept in the pad.

Check: tracedexportcheck.js — "...without losing the organelles it already carried" was the one
assertion still red.
Run: python3 src/a_fetched_outline_belongs_to_the_export.py, then python3 src/build_stamps.py
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
 (u"what was fetched for these cells is marked as theirs",
  u"""      var r = await tracedStructuresForCells({ nuc: nuc, root: root }, opts.say || null);""",
  u"""      var r = await tracedStructuresForCells({ nuc: nuc, root: root }, opts.say || null);
      /* BY CONSTRUCTION THEIRS: tracedStructuresForCells was handed these cells' ids and returned
         only what matched one of them. Saying so here is more reliable than having the filter
         below work it out again from ids the page may not carry — ηJump's cells have no nucleus
         id at all. See src/a_fetched_outline_belongs_to_the_export.py. */
      ((r && r.tracings) || []).forEach(function(t){ if (t) t.for_export = 1; });"""),

 (u"...and the filter takes that as the answer",
  u"""    tracings = tracings.filter(function(t){
      var nuc = String((t && t.nucleus_id) || "").replace(/^.*:/, "");""",
  u"""    tracings = tracings.filter(function(t){
      /* Read from the dataset for the cells in this export, so the question is already settled
         (2026-09-26). Without this, a tracing filed against a cell body id on a page whose cells
         carry no nucleus id matched nothing, was not judged by position either, and vanished. */
      if (t && t.for_export) return true;
      var nuc = String((t && t.nucleus_id) || "").replace(/^.*:/, "");"""),
])
print("\nNow: python3 src/build_stamps.py")
