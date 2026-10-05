# -*- coding: utf-8 -*-
u"""The store has no ceiling, and it is read the way the card already reads.             2026-10-05

Søren, after a whole-cell tracing was lost: *"It had complained some times that it did not have
enough space in the browser to save my draft."*

WHAT WAS ACTUALLY FULL, measured in his own browser: `ujump_tracings_v1` held **4,141,977
characters**. localStorage counts UTF-16, so that single key was about 8 MB against a per-origin
budget of roughly 5–10 MB for everything all eight tools write between them. Every other key on
that origin put together was under 300 KB.

CAPPING THE CACHE WAS THE OBVIOUS ANSWER AND IT IS THE WRONG ONE. Evicting contours from kept
tracings means every consumer of `t.rings` has to cope with a tracing whose rings are gone — the
Blender export, the 3D preview, the ZIP, the re-share — and the failure mode of getting that wrong
is an export that silently contains nothing. Trading a storage bug for a silent-export bug is not a
trade to make the week after this one.

SO THE CEILING GOES INSTEAD. core/kvstore.js puts the card's keys in IndexedDB, which is granted
against free disk rather than a fixed few megabytes. Nothing then needs capping, evicting or
explaining, and the cache cap that was on the list is not needed at all.

AND IT STAYS SYNCHRONOUS, which is the only reason this is a small change rather than a rewrite.
IndexedDB is async and the card's sixteen call sites are not. But the page ALREADY keeps its
tracings in memory — TRACINGS_KEPT is the working copy and localStorage was only ever where it was
written down — so the store is a mirror in memory, hydrated once, read synchronously, written
through in the background. `tracingStore()` returns it and nothing else changes.

THE ONE REAL DANGER IS READING BEFORE HYDRATION. An empty mirror answering "no tracings" and then
being written back is how this change could destroy more than the bug did. Three things stop it:
setItem THROWS until hydrated, the card's init awaits ready() before its first read, and the
migration deletes a localStorage key only after reading the copy back out of IndexedDB and
comparing it.

Check: kvstorecheck.js — hydrate, migrate, reload, and the refusal before ready.
Run: python3 src/the_store_has_no_ceiling.py
     python3 src/build_stamps.py
     node kvstorecheck.js
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
        n = s.count(old)
        assert n == 1, "@NM@ (@F@): @N@".replace("@NM@", name).replace("@F@", os.path.basename(P)).replace("@N@", str(n))
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("core/tracingcard.js", [

 (u"the card's store is the one with no ceiling",
  u"""function tracingStore(){
  if (!tracingKeepsLocal()) return TRACING_MEM_STORE;
  try { return window.localStorage || TRACING_MEM_STORE; } catch (_e){ return TRACING_MEM_STORE; }
}""",
  u"""function tracingStore(){
  if (!tracingKeepsLocal()) return TRACING_MEM_STORE;
  /* ── INDEXEDDB, THROUGH A SYNCHRONOUS MIRROR ─────────────────────────────────  2026-10-05
     core/kvstore.js. The ceiling that cost Søren two hours was localStorage's few megabytes,
     shared by every tool on the origin; IndexedDB is granted against free disk. It answers
     getItem/setItem/removeItem exactly as localStorage does, so the sixteen call sites below did
     not change -- and it REFUSES to write until it has hydrated, because an empty mirror written
     back over real work would be a worse bug than the one this fixes.

     Until it has hydrated, this still answers localStorage: a page that reads in that window gets
     the old copy rather than nothing, and tracingInit() waits on ready() before its first read so
     that window is normally empty. */
  if (window.UJ && UJ.kv && UJ.kv.hydrated()) return UJ.kv;
  try { return window.localStorage || TRACING_MEM_STORE; } catch (_e){ return TRACING_MEM_STORE; }
}"""),

 (u"...and the card waits for it before its first read",
  u"""  TRACINGS_KEPT=tracingRead();
  tracingRenderList();""",
  u"""  /* ── READ NOTHING BEFORE THE STORE IS READY ──────────────────────────────────  2026-10-05
     This is the line that would destroy the work if the store answered an empty mirror: the list
     is read into memory here and written back from memory later, so reading [] here means writing
     [] over every kept tracing at the next save. The store refuses to be written before it
     hydrates, which stops the damage; waiting here is what stops the wrong answer. */
  function tracingLoadKept(){
    TRACINGS_KEPT=tracingRead();
    tracingRenderList();
    try { draftRender(); } catch (_e){}
  }
  if (window.UJ && UJ.kv && !UJ.kv.hydrated())
    UJ.kv.ready().then(tracingLoadKept, tracingLoadKept);
  else tracingLoadKept();"""),
])

TAG = u'<script src="core/tracingcard.js"></script>'
NEW = (u'<!-- The card\'s store. BEFORE the card, because the card asks for it on load and a store\n'
       u'     that is not there yet means a first read answered from localStorage. 2026-10-05. -->\n'
       u'<script src="core/kvstore.js"></script>\n') + TAG

for page in ("ujump.html", "djump.html", "pjump.html", "ljump.html", "hjump.html", "bjump.html"):
    edit(page, [(u"the store is served before the card", TAG, NEW)])

print("\nNow: python3 src/build_stamps.py, then node kvstorecheck.js")
