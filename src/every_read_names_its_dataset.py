# -*- coding: utf-8 -*-
u"""The tracing card reads and writes its OWN dataset's tracings.                  2026-09-21

Found while building the Filter-and-show outline layer for the other tools, which reads the same
`?tracings=1` index the card does.

── WHAT WAS WRONG ─────────────────────────────────────────────────────────────────

The backend routes every request by `ds` (Datasets.gs's setDsFromRequest) and falls back to µJump's
spreadsheet when a request carries none. δJump and πJump wrap window.fetch so that every backend
call gets its ds; λJump, βJump and ηJump do NOT — they add ds inside their own postReport and in
each of their own GET call sites instead. core/tracingcard.js, moved out of µJump, made six reads
with no ds at all:

    ?tracings=1                        the "in the dataset" list, and the numbering index  (x3)
    ?tracings=1&structureId=...        opening one tracing to extend or correct it          (x2)
    ?drafts=<credential>               the drafts kept on the account                       (x2)

So on λJump, βJump and ηJump, since stages D, F and G: a tracing SAVED there went to that
dataset's sheet (postReport adds ds), but the card's list, its "Mitochondrion 3" numbering and its
account drafts were read from µJUMP'S. A βJump tracer would be offered minnie65 cells to extend,
and a minnie65 draft to resume on Alzheimer's tissue.

And three card writes go through postAndRead, which λJump, βJump and ηJump do not define: the
account-draft save and delete (in a try, so they silently did nothing — drafts never reached the
account there) and the organelle annotation a segmented tracing registers (which returned false).

── WHAT THIS DOES ──────────────────────────────────────────────────────────────────

  tracingDsQS()       "&ds=<this page's dataset>", built exactly as core/panel.js's panelDsQS and
                      core/gamify.js build it, appended to all six reads. On δJump and πJump the
                      fetch wrapper sees a ds already there and adds nothing; on µJump it is
                      "&ds=ujump", which is what the backend assumed anyway.
  tracingPost(p)      the page's postAndRead where it has one (µJump, δJump, πJump — unchanged);
                      otherwise the same text/plain POST, with ds in the body, answering in the same
                      {ok, error} shape.

Run: python3 src/every_read_names_its_dataset.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs, marker=None):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    if marker and marker in s:
        for name, _o, _n in pairs:
            print("  already there: " + name)
        return
    before = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name)
            continue
        n = s.count(old)
        assert n == 1, "%s / %s: anchor found %d times" % (rel, name, n)
        s = s.replace(old, new, 1)
        print("  ok: " + name)
    if s != before:
        io.open(p, "w", encoding="utf-8").write(s)


HELPERS_OLD = u'''var DRAFT_PUSH_AT = 0, DRAFT_PUSH_EVERY = 120000, DRAFT_SERVER = [], DRAFT_SERVER_AT = 0;'''
HELPERS_NEW = u'''/* ── WHICH DATASET'S SHEET ───────────────────────────────────────────────────────  2026-09-21
   The backend reads µJump's spreadsheet for any request that does not name a dataset. δJump and
   πJump wrap window.fetch to add one; λJump, βJump and ηJump add it in their own call sites — so a
   read made from THIS file carried none there, and their tracing lists, numbering and account
   drafts were µJump's. Built exactly as core/panel.js's panelDsQS builds it. */
function tracingDsQS(){
  try { if (UJ && UJ.cfg && UJ.cfg.backend && UJ.cfg.backend.ds)
          return "&ds=" + encodeURIComponent(UJ.cfg.backend.ds); } catch (_e){}
  return "";
}
/* The page's postAndRead where it has one; otherwise the same POST, with the dataset in the body,
   answering {ok, error} the way postAndRead does. λJump, βJump and ηJump have no postAndRead, so
   the account-draft save and delete below did nothing there at all. */
function tracingPost(payload){
  if (typeof postAndRead === "function") return postAndRead(payload);
  var p = {};
  for (var k in payload) p[k] = payload[k];
  try { if (!p.ds && UJ.cfg.backend.ds) p.ds = UJ.cfg.backend.ds; } catch (_e){}
  return fetch(REPORT_ENDPOINT, { method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(p) })
    .then(function(r){ return r.text(); })
    .then(function(t){
      var d = null; try { d = JSON.parse(t); } catch (_pe){}
      return (d && (d.ok === true || d.status === "ok")) ? { ok: true }
           : { ok: false, error: (d && d.error) || String(t || "").slice(0, 200) };
    }, function(e){ return { ok: false, offline: true, error: String(e && e.message || e) }; });
}
var DRAFT_PUSH_AT = 0, DRAFT_PUSH_EVERY = 120000, DRAFT_SERVER = [], DRAFT_SERVER_AT = 0;'''

PAIRS = [
    (u"the helpers", HELPERS_OLD, HELPERS_NEW),
    (u"a segmented tracing's annotation goes out on every page",
     u'''    else if (typeof postAndRead === "function") postAndRead(payload);
    else return false;''',
     u'''    else tracingPost(payload);'''),
    (u"the account-draft save",
     u'''    postAndRead({ type: "tracing_draft", action: "save", credential: GOOGLE_CREDENTIAL,''',
     u'''    tracingPost({ type: "tracing_draft", action: "save", credential: GOOGLE_CREDENTIAL,'''),
    (u"...and delete",
     u'''    postAndRead({ type: "tracing_draft", action: "delete",''',
     u'''    tracingPost({ type: "tracing_draft", action: "delete",'''),
    (u"the account drafts are this dataset's (read 1)",
     u'''  fetch(REPORT_ENDPOINT + "?drafts=" + encodeURIComponent(GOOGLE_CREDENTIAL))''',
     u'''  fetch(REPORT_ENDPOINT + "?drafts=" + encodeURIComponent(GOOGLE_CREDENTIAL) + tracingDsQS())'''),
    (u"...(read 2)",
     u'''    fetch(REPORT_ENDPOINT + "?drafts=" + encodeURIComponent(GOOGLE_CREDENTIAL)''',
     u'''    fetch(REPORT_ENDPOINT + "?drafts=" + encodeURIComponent(GOOGLE_CREDENTIAL) + tracingDsQS()'''),
    (u"the numbering index is this dataset's",
     u'''    fetch(REPORT_ENDPOINT + "?tracings=1")''',
     u'''    fetch(REPORT_ENDPOINT + "?tracings=1" + tracingDsQS())'''),
    (u"the 'in the dataset' list is this dataset's",
     u'''    const r = await fetch(REPORT_ENDPOINT + "?tracings=1");''',
     u'''    const r = await fetch(REPORT_ENDPOINT + "?tracings=1" + tracingDsQS());'''),
]

p = os.path.join(HERE, "core", "tracingcard.js")
s = io.open(p, encoding="utf-8").read()
OPEN_OLD = u'''    const r = await fetch(REPORT_ENDPOINT + "?tracings=1&structureId=" + encodeURIComponent(sid));'''
OPEN_NEW = u'''    const r = await fetch(REPORT_ENDPOINT + "?tracings=1&structureId=" + encodeURIComponent(sid)
                          + tracingDsQS());'''
print("core/tracingcard.js")
edit("core/tracingcard.js", PAIRS, marker=u"WHICH DATASET'S SHEET")
s = io.open(p, encoding="utf-8").read()
n = s.count(OPEN_OLD)
if n:
    assert n == 2, n
    s = s.replace(OPEN_OLD, OPEN_NEW)
    io.open(p, "w", encoding="utf-8").write(s)
    print("  ok: opening one tracing reads this dataset's (x2)")
else:
    print("  already there: opening one tracing reads this dataset's (x2)")

import re
left = [m.group(0)[:80] for m in re.finditer(r'REPORT_ENDPOINT \+ "\?[^;]*', s) if u"tracingDsQS" not in m.group(0)]
assert not left, left
print("  every backend read in the file names its dataset")
