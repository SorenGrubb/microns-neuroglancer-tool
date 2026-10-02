# -*- coding: utf-8 -*-
u"""A shared root id is not one cell, and a nucleus id says so.                           2026-10-02

Søren, on ηJump: *"I traced a nucleus and then I traced another nucleus right after. It moved the
first one to traced structures history when I added the second one to the dataset. When I looked at
them, they had exactly the same structureID, even though everything else was different for them
except color and rootID (it is a large weird root ID). I fixed it by deleting the last letter in the
structureID. If the problem is the rootID, can we change it so that more than one cell can share a
rootID?"*

THE ANSWER TO HIS QUESTION IS THAT THEY ALREADY CAN, AND DO. Nothing in the sheet, the backend or
the data model says a root id belongs to one cell. H01's segmentation merges, and "a large weird
root ID" is exactly what a merged blob covering many cells looks like. No model needed changing.

WHAT WENT WRONG WAS THE SHAPE OF THE TEST. sameCell() asked whether ANY ONE identifier agreed:

    nucleus agrees, OR root agrees, OR coordinate agrees  ->  same cell

His two nuclei had DIFFERENT nucleus ids (61360735 and 38762771) and THE SAME root id. The root
agreed, so the answer was yes, and the nucleus ids -- which were right there, and disagreed -- were
never consulted. A test that only looks for agreement cannot see a disagreement, and this is the
second time that exact shape has cost a tracing: src/a_second_cell_does_not_take_the_first_ones_id.py
is the first, where the test was name-only.

THE FIX IS TO LET ONE IDENTIFIER DISAGREE DECISIVELY, and it has to be the right one. The 2026-09-23
note already says which, for a reason that still holds: *"a root id moves when the segmentation is
proofread and a nucleus id does not."*

  - BOTH have a nucleus id        -> that settles it, agreement AND disagreement. A nucleus id is
                                     the cell's own name; two different ones are two cells, whatever
                                     segment they happen to sit inside today.
  - otherwise                      -> the old rule, unchanged: root or coordinate agreement is
                                     enough, because it is the only evidence there is.

So a proofread cell whose root id moved still keeps its id (its nucleus agrees), a cell with no
nucleus id is still matched on its root (the case the root test was added for), and two nuclei in
one merged H01 segment are now two structures.

WHY NOT "NEVER TRUST THE ROOT ID". Because a cell traced from a coordinate inside a process has a
root id and nothing else, and that is a real workflow -- it is why the root test exists. The root id
is not wrong, it is WEAKER, and the fix is to say so rather than to drop it.

AND THE BACKEND NOW REFUSES THE OVERWRITE ANYWAY -- see
backend/src_a_tracing_does_not_change_which_cell_it_is_on.py. Two guards rather than one, because
this is the second time around and the loss is somebody's afternoon.

Check: idcollisioncheck.js.
Run: python3 src/a_shared_root_id_is_not_one_cell.py, then python3 src/build_stamps.py,
then, from inside wjump-build/, python3 build_wjump.py
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


edit("core/tracingcard.js", [

 (u"a nucleus id that disagrees is decisive",
  u'''    const sameCell=function(x){
      const c=cellOf(x);
      return !!((here.nuc&&c.nuc&&c.nuc===here.nuc)
              ||(here.root&&c.root&&c.root===here.root)
              ||(here.at&&c.at&&c.at===here.at));
    };''',
  u'''    const sameCell=function(x){
      const c=cellOf(x);
      /* ── A DISAGREEMENT COUNTS, NOT ONLY AN AGREEMENT ──────────────  2026-10-02
         Søren, on ηJump: "I traced a nucleus and then I traced another nucleus right after... they
         had exactly the same structureID... everything else was different for them except color
         and rootID (it is a large weird root ID)."

         This read "any ONE positive match is enough", so his two nuclei -- different nucleus ids,
         one shared H01 root id -- matched on the root, and the nucleus ids that disagreed were
         never consulted. H01's segmentation merges; a root id there can cover many cells, which
         is what a large weird root id IS. More than one cell sharing a root id was never the
         problem: a test that could only look for agreement was.

         A NUCLEUS ID SETTLES IT BOTH WAYS when both have one. It is the cell's own name, and the
         2026-09-23 note already says why it is the one to trust: a root id moves when the
         segmentation is proofread and a nucleus id does not. So a proofread cell still keeps its
         id (its nucleus agrees), and two nuclei inside one merged segment are two cells.

         The root and the coordinate keep their old meaning for everything else, because a cell
         traced from a point inside a process has a root id and nothing else, and that is the case
         the root test was added for. The root id is not wrong here; it is WEAKER. */
      if(here.nuc&&c.nuc) return c.nuc===here.nuc;
      return !!((here.root&&c.root&&c.root===here.root)
              ||(here.at&&c.at&&c.at===here.at));
    };'''),
])
print("\nNow: node idcollisioncheck.js, then python3 src/build_stamps.py,"
      "\nthen, from inside wjump-build/, python3 build_wjump.py")
