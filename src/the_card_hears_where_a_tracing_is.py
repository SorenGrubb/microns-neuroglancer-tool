# -*- coding: utf-8 -*-
u"""The card says what is true about where a tracing is.                             2026-09-21

Søren, on πJump: "What is the purpose of the 'with cell and nucleus see through' tick down there?
I understand that it is needed with the 3D view above. also, why is only one of the lysosomes
shown in the dataset?"

WHY ONE. His three lysosomes were πJump's first tracings, so πJump's sheet had no "Traced
structures" tab. The three requests ran together, each found no tab, one made it, and the other two
died on insertSheet AFTER writing their Drive file: three files, one row. The backend half is
backend/src_a_new_tab_is_made_once.py. This is the page half, which is why the card said "in the
dataset" beside all three:

  THE ANSWER   µJump, δJump and πJump's postReport returned `true` the moment it had sent, so the
               card's "a promise is not a yes" handling (a refused tracing goes back on the queue)
               never had anything to listen to. It returns the server's answer now -- a promise,
               truthy, so every `if (postReport(...))` reads as before -- and the toast is unchanged.
  THE INDEX    whenever the dataset's list is read, a kept tracing marked "in the dataset" that the
               list does not have goes back on the queue and is sent again. This is what repairs
               the two lysosomes already lost, the next time πJump's card opens signed in. One sent
               in the last minute is left alone, because its row may not be readable yet.

THE TICK. "with the cell and nucleus, see-through" under the kept tracings controls the 3D preview
of a PASTED Neuroglancer link, which draws there. For contours from the pad the preview is the
pad's own, with its own tick, and the lower one did nothing you could see. It is shown only when the
contours in hand came from a pasted link.

Run: python3 src/the_card_hears_where_a_tracing_is.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rd(rel): return io.open(os.path.join(HERE, rel), encoding="utf-8").read()
def wr(rel, s): io.open(os.path.join(HERE, rel), "w", encoding="utf-8").write(s)


def edit(rel, pairs):
    s = rd(rel); b = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s / %s: %d" % (rel, name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: wr(rel, s)


print("core/tracingcard.js")
edit("core/tracingcard.js", [
 (u"the tick belongs to the pasted link's preview",
  u'''function pad3DWantGhosts(){''',
  u'''/* "with the cell and nucleus, see-through" under the kept tracings is the PASTED link's preview
   tick; shown only when that preview is the one drawing (2026-09-21, Søren: "What is the purpose
   of the ... tick down there?"). The pad has its own. */
function tracingPasteGhostsSync(){
  var t = document.getElementById("tracingPasteGhosts");
  if (!t) return;
  var l = (t.closest && t.closest("label")) || t;
  l.style.display = (pad3DTarget() === "paste") ? "flex" : "none";
}
function pad3DWantGhosts(){'''),
 (u"...synced when the contours in hand change",
  u'''function tracingEachRender(force){''',
  u'''function tracingEachRender(force){
  try { tracingPasteGhostsSync(); } catch (_e){}'''),
 (u"...and when the pad's change",
  u'''function padRings(){''',
  u'''function padRings(){
  try { tracingPasteGhostsSync(); } catch (_e){}'''),
 (u"the quiet index read checks the kept list against it",
  u'''      .then(function(d){ if (d && d.tracings) TRACING_SHARED = tracingInScope(d.tracings); })''',
  u'''      .then(function(d){ if (d && d.tracings){ TRACING_SHARED = tracingInScope(d.tracings);
                                               tracingReconcileKept(); } })'''),
 (u"...and so does the list he asks for",
  u'''    TRACING_SHARED = tracingInScope((d && d.tracings) || []);
    tracingRenderShared();''',
  u'''    TRACING_SHARED = tracingInScope((d && d.tracings) || []);
    tracingRenderShared();
    if (d && Array.isArray(d.tracings)) tracingReconcileKept();'''),
 (u"a kept tracing the dataset does not have goes back on the queue",
  u'''async function tracingBrowse(){''',
  u'''/* ── "IN THE DATASET" IS CHECKED AGAINST THE DATASET ───────────────────────  2026-09-21
   Søren's three lysosomes on πJump all said "in the dataset"; the dataset had one (the backend lost
   two rows to a race on a new tab -- backend/src_a_new_tab_is_made_once.py). Whenever the dataset's
   list is read, a kept tracing marked as in it that the list does not have goes back on the queue
   and is sent again. One sent in the last minute is left alone: its row may not be readable yet. */
function tracingReconcileKept(){
  var have = {};
  (TRACING_SHARED || []).forEach(function(t){ if (t && t.structureId) have[String(t.structureId)] = 1; });
  var now = Date.now(), back = [];
  (TRACINGS_KEPT || []).forEach(function(t){
    if (!t || !t.id || t.pending_share || have[String(t.id)]) return;
    var at = Date.parse(t.shared_at || "");
    if (isFinite(at) && now - at < 60000) return;
    t.pending_share = true; t.shared_at = ""; back.push(t);
  });
  if (!back.length) return 0;
  tracingWrite(TRACINGS_KEPT); tracingRenderList();
  tracingSay(back.map(function(t){ return "\\u201c" + (t.name || "a tracing") + "\\u201d"; }).join(", ")
    + (back.length === 1 ? " was" : " were") + " marked as in the dataset, and the dataset does not have "
    + (back.length === 1 ? "it" : "them") + ". Sending " + (back.length === 1 ? "it" : "them")
    + " again \\u2014 signed in, that happens now.", true);
  tracingFlushSoon();
  return back.length;
}

async function tracingBrowse(){'''),
])

# ── µJump, δJump and πJump: postReport hands back the server's answer ─────────────────────────
OLD_SEND = u'''  postAndRead(payload).then(function(res){
    if(res.ok){showSubmitToast(true,okMsg||'''
NEW_SEND = u'''  /* THE ANSWER IS HANDED BACK, 2026-09-21: a promise of {ok,error}, truthy, so every
     `if(postReport(...))` reads as before -- and the tracing card can hear a refusal. It returned
     `true` before the server had answered, which is how three lysosomes said "in the dataset"
     when two had been lost. See src/the_card_hears_where_a_tracing_is.py. */
  const answer=postAndRead(payload);
  answer.then(function(res){
    if(res.ok){showSubmitToast(true,okMsg||'''
OLD_RET = u'''  if(window.invalidateNewCellAndMergedSubCaches)setTimeout(()=>window.invalidateNewCellAndMergedSubCaches(),2500);
  return true;
}'''
NEW_RET = u'''  if(window.invalidateNewCellAndMergedSubCaches)setTimeout(()=>window.invalidateNewCellAndMergedSubCaches(),2500);
  return answer;
}'''
for page in ["ujump.html", "djump.html", "pjump.html"]:
    print("\n" + page)
    s = rd(page)
    i = s.index(u"function postReport(payload,okMsg){")
    j = s.index(u"\n}\n", i) + 3
    body = s[i:j]
    if u"const answer=postAndRead(payload);" in body:
        print("  already there: postReport hands back the answer"); continue
    assert body.count(OLD_SEND) == 1 and body.count(OLD_RET) == 1, page
    body = body.replace(OLD_SEND, NEW_SEND, 1).replace(OLD_RET, NEW_RET, 1)
    wr(page, s[:i] + body + s[j:]); print("  ok: postReport hands back the answer")
