# -*- coding: utf-8 -*-
u"""A tracing that has not changed is not sent to the dataset again.                     2026-09-23

Søren: "We have an issue that Hesham tried to log an organelle and then was able to log it again and
again where it overwrites the old one. It should only be possible to log an organelle once and then
update the same one if there are changes, but not save it as a new organelle."

ONE CORRECTION TO THE DIAGNOSIS, from his own rows. Hesham was never making a NEW organelle: the
structureId is identical down the whole run. The backend was filing a new VERSION of the same one on
every press, including the presses where nothing had changed. Classified:

    18 rows, 4 distinct organelles, 8 real edits, 10 EXACT repeats (56%)
      lysosome_1789996455594       12/12/214 posted 4 times
                                   17/17/395 posted 3 times
                                   27/27/581 posted twice
      lysosome_1789996455594__i1   2/2/106   posted twice
      lysosome_1789996455594__i2   2/2/42    posted 4 times

(__i1 and __i2 are the second and third drawings on the pad -- genuinely different organelles,
correctly given ids of their own. Nothing to fix there.)

So the fix is NOT to forbid a second save. He asks for the opposite in the same sentence -- "update
the same one if there are changes" -- and an edited outline has to be able to replace its
predecessor. The fix is to refuse a save that carries NOTHING NEW.

THE RULE WAS ALREADY IN THIS FUNCTION, for the centre annotation, in its own words: "the test is
whether the centre has MOVED rather than whether anything was pressed". The tracing itself was the
one thing tracingPublish did not apply it to.

HOW: a fingerprint of the submission as the backend will see it -- the structure id, the name, kind,
cell type, colour, the two cell ids, the instance fields, and every contour's z and encoded points.
Not the timestamp and not the groupId, which differ by construction on every press. Equal to the
last one that went: nothing is sent, the card says so, and -- the part that would otherwise bite --
pending_share is CLEARED, so it does not sit in the queue and go out by itself later.

WHAT STILL GOES: any edit to the outline, and any change to the row -- a renamed organelle, a
corrected type, a different colour. The row is the record, not just the geometry.

Check: resharecheck.js, written first; it reproduced Hesham's run exactly (five presses, five rows)
before this went in.
Run: python3 src/an_unchanged_tracing_is_not_sent_again.py, then python3 src/build_stamps.py
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
 (u"the fingerprint of what was last sent",
  u'''function tracingPublish(t,quiet){''',
  u'''/* ── WHAT WAS LAST SENT ──────────────────────────────────────────────────────  2026-09-23
   Søren, on Hesham's rows: "he was able to log it again and again ... It should only be possible to
   log an organelle once and then update the same one if there are changes."

   His structureId never changed -- it was one organelle gaining a version per press, 10 of his 18
   rows carrying nothing new. So this is the fingerprint of a submission as the BACKEND sees it:
   everything that lands in the row, and every contour. NOT the timestamp and NOT the groupId, which
   differ on every press by construction and would make every save look like a change.
   See src/an_unchanged_tracing_is_not_sent_again.py. */
function tracingShareSig(sub){
  try {
    const c = (sub.contours || []).map(function(r){
      return r.z + ":" + r.ringIndex + ":" + (r.points || "");
    }).join("|");
    return [sub.structureId, sub.name, sub.kind, sub.cellType, sub.color,
            sub.nucleusId, sub.rootId, sub.cellCoord, sub.instanceOf, sub.instanceIndex,
            (sub.contours || []).length, c].join("\\u0001");
  } catch (_e){ return ""; }
}
function tracingPublish(t,quiet){'''),
 (u"...and nothing new is not sent",
  u'''  if(!sub.contours.length)return false;
  const ok=postReport(Object.assign({timestamp:new Date().toISOString(),groupId:gid},sub),
                      "Tracing added to the dataset \\u2014 thank you.");
  if(ok===false)return false;
  t.pending_share=false;''',
  u'''  if(!sub.contours.length)return false;
  /* NOTHING NEW, NOTHING SENT (2026-09-23). The same test tracingPublish already applies to the
     centre annotation below -- whether it MOVED, not whether anything was pressed -- applied to the
     tracing itself. pending_share is cleared as well, or an unchanged tracing sits in the queue and
     goes out by itself on the next sign-in, which is the same row arriving later instead of now. */
  const sig=tracingShareSig(sub);
  if(sig&&t.shared_sig===sig){
    t.pending_share=false;
    tracingWrite(TRACINGS_KEPT);
    if(!quiet)tracingSay("\\u201c"+(t.name||"That tracing")+"\\u201d is already in the dataset and "
      +"nothing has changed since, so nothing was sent. Edit the outline or its details and add it "
      +"again to file a new version of it.");
    return false;
  }
  const ok=postReport(Object.assign({timestamp:new Date().toISOString(),groupId:gid},sub),
                      "Tracing added to the dataset \\u2014 thank you.");
  if(ok===false)return false;
  t.shared_sig=sig;
  t.pending_share=false;'''),
 (u"...and a refusal forgets it, so the retry goes",
  u'''      if(!(d&&d.ok===false))return;
      t.pending_share=true; t.shared_at="";''',
  u'''      if(!(d&&d.ok===false))return;
      /* The signature is what says "this is already up there". A refusal means it is not, so it
         goes with the rest or the retry would be declined as an unchanged re-send. */
      t.pending_share=true; t.shared_at=""; t.shared_sig="";'''),
])
