# -*- coding: utf-8 -*-
u"""The memory of what was last sent survives a re-add.                                   2026-09-23

Søren, with 44 rows of his sheet: "Please make sure that we are not hoarding stale information ...
We just need to reduce the amount of crap in the google sheet."

Measured on those rows: 44 rows, 29 distinct structures, 15 of them superseded -- and SEVEN of the
superseded rows carry nothing new at all. Three rows for lysosome_1790192158786_ay6p__i8, all
12 contours and 137 vertices, at 19:35:58, 19:36:40 and 19:37:17.

THIS IS MY BUG, FROM THIS MORNING. src/an_unchanged_tracing_is_not_sent_again.py added shared_sig --
the fingerprint of the last submission -- and tracingPublish refuses a save whose fingerprint has
not changed. It works. It is simply never consulted, because the button is tracingKeep(), and
tracingKeep REBUILDS the kept entry from the pad on every press:

    const prior = at >= 0 ? TRACINGS_KEPT[at] : null;
    if (prior && prior.shared_at) t.shared_at = prior.shared_at;
    if (prior && prior.centre_registered) t.centre_registered = prior.centre_registered;
    if (prior && prior.centre_at)         t.centre_at = prior.centre_at;

Three things carried across the rebuild, and the fourth -- the one added this morning -- not. So
every press handed tracingPublish an object whose shared_sig was undefined, which never equals
anything, and the post went.

THE COMMENT ABOVE THOSE LINES SAYS EXACTLY THIS, about the last time it happened: "`shared_at` was
carried across a re-add and `centre_registered` was not, so every re-add looked like a tracing that
had never registered its centre and posted a second point." I read that comment while writing the
line beneath it and still added a fourth field without adding it to the list.

AND THE CHECK DID NOT CATCH IT because resharecheck.js drove tracingPublish() directly. Everything
it asserted was true of tracingPublish and none of it was true of the button. It presses the button
now, which is the only version of that assertion worth having.

Run: python3 src/what_was_sent_survives_a_re_add.py, then python3 src/build_stamps.py, then
python3 wjump-build/src/build_wjump.py and python3 xjump-build/src/build_xjump.py
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
 (u"a no-op says so, rather than saying it never arrived",
  u'''  const sig=tracingShareSig(sub);
  if(sig&&t.shared_sig===sig){
    t.pending_share=false;''',
  u'''  const sig=tracingShareSig(sub);
  if(sig&&t.shared_sig===sig){
    /* WHY IT DID NOT GO, for the caller (2026-09-23). tracingKeep writes the card's last word from
       `sent === all.length`, and a tracing that was refused as unchanged is not sent -- so pressing
       Add on something already in the dataset answered "It has NOT reached the dataset yet -- sign
       in with Google", which is alarming and the opposite of true. Two reasons not to send, and
       they need different sentences. */
    t.share_nochange=true;
    t.pending_share=false;'''),
 (u"...and a real send clears it",
  u'''  if(ok===false)return false;
  t.shared_sig=sig;''',
  u'''  if(ok===false)return false;
  t.share_nochange=false;
  t.shared_sig=sig;'''),
 (u"the card counts the unchanged as arrived, because they are",
  u'''  let sent=0;
  all.forEach(function(t){ if(tracingPublish(t))sent++; });''',
  u'''  let sent=0, same=0;
  all.forEach(function(t){
    t.share_nochange=false;
    if(tracingPublish(t))sent++;
    else if(t.share_nochange)same++;   // already up there, unchanged: arrived, not waiting
  });'''),
 (u"...and says so",
  u'''  tracingSay(sent===all.length
    ?what+\' \'+(all.length===1?\'is\':\'are\')+\' in the dataset and in this page\u2019s 3D export. \'''',
  u'''  tracingSay(sent+same===all.length
    ?what+\' \'+(all.length===1?\'is\':\'are\')+\' in the dataset and in this page\u2019s 3D export. \'
     +(same?(same===all.length
        ?(all.length===1?\'Nothing had changed since you last added it, so nothing was sent again. \'
                        :\'Nothing had changed since you last added them, so nothing was sent again. \')
        :same+\' of them had not changed, so only the rest were sent again. \'):\'\')'''),
 (u"shared_sig is carried across the rebuild too",
  u'''    if(prior&&prior.centre_registered)t.centre_registered=prior.centre_registered;
    if(prior&&prior.centre_at)t.centre_at=prior.centre_at;''',
  u'''    if(prior&&prior.centre_registered)t.centre_registered=prior.centre_registered;
    if(prior&&prior.centre_at)t.centre_at=prior.centre_at;
    /* ── AND WHAT IT LAST SENT ──────────────────────────────────────────────────  2026-09-23
       The same omission as the one the paragraph above describes, one field later. shared_sig is
       the fingerprint of the last submission and it is what tracingPublish refuses a re-send on;
       rebuilt without it, every press looked like a tracing that had never been sent. Søren's
       sheet: three rows for one organelle, 12 contours and 137 vertices on each of them.

       ANYTHING REMEMBERED ABOUT A TRACING BELONGS IN THIS LIST. That is now four fields, all with
       the same shape and the same failure -- so if a fifth is ever added, it goes here in the same
       breath. See src/what_was_sent_survives_a_re_add.py. */
    if(prior&&prior.shared_sig)t.shared_sig=prior.shared_sig;'''),
])
