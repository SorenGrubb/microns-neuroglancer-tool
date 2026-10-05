# -*- coding: utf-8 -*-
u"""A save must continue what it is writing over.                                        2026-10-05

Søren, on two tracings that ended up holding one set of contours: *"There is some problem with the
nuclei segmentations here."* There was, and it destroyed more than the quota did.

WHAT THE RECOVERED DATA SHOWS. Draft dmuub74uqjeq1kw belongs to nucleus 61360735 and said so
correctly throughout. Its sheet row records 39 contours and 2041 vertices. At 21:05:22 on 4 October
it was written with 47 contours and 1927 vertices — byte-identical to the OTHER nucleus's tracing,
which the pad was still carrying. The same thing had already reached the Drive file at 20:54:30.
The label was right and the rings were somebody else's, and every layer below accepted it.

MY FIRST PROPOSED FIX WAS WRONG, AND THE DATA IS WHAT SAID SO. I offered an identity guard — a
draft may only be written by a pad carrying the same nucleus id — and it would have waved this
straight through, because the nucleus id was never wrong. Worth recording: "the obvious guard" and
"the guard that catches it" were different guards, and only the recovered file told them apart.

THE RULE IS ABOUT THE CONTOURS. Drawing adds and edits rings one at a time; between two autosaves
1.2 seconds apart almost every ring is still the ring it was. Swapping 39 for a disjoint 47 is not
something a hand does. Each ring gets a cheap signature — section, structure, point count, first
point — and a save that keeps fewer than half of the stored draft's rings is a REPLACEMENT rather
than a continuation of it.

AND IT FORKS. Søren, asked what it should do: *"Fork to a new draft and tell you."* A refusal
mid-tracing is its own way to lose work, because it stops the drawing and waits to be noticed. A
fork never blocks and never overwrites: the new rings are kept under a new id, the old draft is
left exactly as it was, and the list shows both.

Check: draftforkcheck.js, which replays the real event — a draft holding one tracing, then a save
carrying another's rings under its id.
Run: python3 src/a_save_must_continue_what_it_overwrites.py
     python3 src/build_stamps.py
     node draftforkcheck.js
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
        n = s.count(old); assert n == 1, "@NM@ (@F@): @N@" .replace("@NM@", name).replace("@F@", os.path.basename(P)).replace("@N@", str(n))
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


GUARD = r"""/* ── A SAVE MUST CONTINUE WHAT IT IS WRITING OVER ──────────────────────────────  2026-10-05
   Søren, on two tracings that ended up holding one set of contours: *"There is some problem with
   the nuclei segmentations here."*

   WHAT THE RECOVERED DATA SHOWS. Draft dmuub74uqjeq1kw belongs to nucleus 61360735 and said so
   correctly, all the way through. Its sheet row records 39 contours and 2041 vertices. At
   21:05:22 on 4 October it was written with 47 contours and 1927 vertices — byte-identical to the
   OTHER nucleus's tracing, which the pad was still carrying. The label was right and the rings
   were somebody else's, and every layer below accepted it: the draft, the Drive file, the row.

   SO THE RULE CANNOT BE ABOUT IDENTITY. A guard comparing nucleus ids would have waved this
   straight through, because the id was never wrong. The thing that was wrong is that a save
   REPLACED work instead of continuing it, and that is a question about the contours themselves.

   CONTINUITY, MEASURED. Drawing adds contours and edits them one at a time; between two autosaves
   1.2 s apart, almost every ring is still the ring it was. Swapping 39 for a disjoint 47 is not
   something a hand does. So each ring gets a cheap signature -- its section, its structure, how
   many points it has and where it starts -- and a save that keeps fewer than half of the stored
   draft's rings is not a continuation of it.

   HALF IS DELIBERATELY GENEROUS. Deleting a structure, or thinning a tracing in z, can legitimately
   drop a lot at once; the cost of a false fork is one extra draft in the list, and the cost of a
   false pass is what this is being written about. It triggers on a replacement, not on an edit.

   AND IT FORKS RATHER THAN REFUSING. Søren, asked: *"Fork to a new draft and tell you."* A refusal
   mid-tracing is its own way to lose work -- it stops the drawing and waits to be noticed. A fork
   never blocks and never overwrites: the new contours are kept under a new id, the old draft is
   left exactly as it was, and the list below shows both. Reconciling two drafts is a cheap problem.
   2026-10-05. */
/* ── WHERE A CONTOUR IS, NOT HOW MANY POINTS IT HAS ──────────────────────────────  2026-10-05
   The first version signed a ring by section, structure, POINT COUNT and first point, and
   tracingpanelcheck.js caught it within the hour: "drop the redundant points" rewrites every ring
   on the pad at once, so every signature changed, the overlap fell to nothing and a perfectly
   ordinary simplification forked the draft. A guard that fires on correct work is a guard somebody
   learns to ignore.

   SO A RING IS WHERE IT IS. Its section, its structure, and the centre of its points. Simplifying
   a contour barely moves its centre; dragging a vertex moves it a little; and the thing this is
   built to catch -- another cell's tracing arriving under this draft's id -- is somewhere else
   entirely. Søren's two nuclei sat 26,000 voxels apart in x, which is a hundred micrometres.

   FOUR MICROMETRES OF TOLERANCE, in the voxel units the pad draws in. Wide enough that no edit of
   one contour is mistaken for a replacement, narrow enough that two different cells never look
   like the same one. */
var RING_NEAR = 1000;
function ringAt(r){
  var p = (r && r.points) || [], i, x = 0, y = 0;
  if (!p.length) return null;
  for (i = 0; i < p.length; i++){ x += p[i][0]; y += p[i][1]; }
  return { k: (r.z) + "/" + (r.inst || 0), x: x / p.length, y: y / p.length };
}
function draftKeeps(stored, d){
  var had = [], have = {}, n = 0, kept = 0, i, a, list, j, near;
  ((stored && stored.rings) || []).forEach(function(r){ var q = ringAt(r); if (q){ had.push(q); n++; } });
  if (!n) return { n: 0, kept: 0, ok: true };
  ((d && d.rings) || []).forEach(function(r){
    var q = ringAt(r); if (!q) return;
    (have[q.k] = have[q.k] || []).push(q);
  });
  for (i = 0; i < had.length; i++){
    a = had[i]; list = have[a.k] || []; near = false;
    for (j = 0; j < list.length; j++){
      if (Math.abs(list[j].x - a.x) <= RING_NEAR && Math.abs(list[j].y - a.y) <= RING_NEAR){
        near = true; break;
      }
    }
    if (near) kept++;
  }
  return { n: n, kept: kept, ok: kept * 2 >= n };
}
function draftFork(d, keeps){
  var was = d.id;
  TRACING_DRAFT_ID = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  d.id = TRACING_DRAFT_ID;
  padSay("These contours are not a continuation of the tracing this draft held — "
    + keeps.kept + " of its " + keeps.n + " contour" + (keeps.n === 1 ? "" : "s")
    + " are still here — so they have been kept as a NEW unfinished tracing instead of written "
    + "over it. Nothing was lost: both are in the list below.", true);
  try { console.warn("[tracing] forked " + was + " -> " + d.id
                    + " (kept " + keeps.kept + "/" + keeps.n + ")"); } catch (_e){}
  return d;
}"""

ANCHOR = u"/* ── A DRAFT IS NEVER ONLY IN A PLACE THAT CAN REFUSE"

OLD_PUT = u"""      if (at >= 0) list.splice(at, 1, d); else list.unshift(d);"""
NEW_PUT = u"""      /* A SAVE MUST CONTINUE WHAT IT WRITES OVER. See the block above draftKeeps(): the pad can
         be carrying another tracing's rings while naming this draft correctly, and that is what
         cost the second nucleus its 39 contours. Forked, never refused. 2026-10-05. */
      if (at >= 0){
        var keeps = draftKeeps(list[at], d);
        if (!keeps.ok){ draftFork(d, keeps); at = -1; }
        else list.splice(at, 1, d);
      }
      if (at < 0) list.unshift(d);"""


edit("core/tracingcard.js", [

 (u"a save must continue what it overwrites", ANCHOR, GUARD + u"\n\n" + ANCHOR),

 (u"...and forks instead of replacing it", OLD_PUT, NEW_PUT),
])
print("\nNow: python3 src/build_stamps.py, then node draftforkcheck.js")
