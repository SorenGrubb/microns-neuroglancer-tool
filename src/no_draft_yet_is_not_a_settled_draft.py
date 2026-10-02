# -*- coding: utf-8 -*-
u"""The flake in tracingpanelcheck was "null" settling.                                  2026-10-03

tracingpanelcheck.js fails perhaps one run in two, always the same way:

    THREW: TypeError: Cannot read properties of null (reading 'rings')

and takes the hundred-odd assertions after it down with it. I had it filed as "the 8-second poll
sometimes loses the race". It is not that, and the real cause is this project's own recurring bug
wearing a disguise.

THE LOOP:

    let raw = null, prev = null, same = 0;
    for (let i = 0; i < 80; i++){
      await new Promise(r => setTimeout(r, 100));
      raw = JSON.stringify(draftRead());
      if (raw && raw === prev){ if (++same >= 4) break; } else same = 0;
      prev = raw;
    }

draftRead() returns null while the autosave has not fired yet. JSON.stringify(null) is the STRING
"null", which is four characters and therefore TRUTHY. So "there is no draft" reads as a value, two
reads of no-draft read as the same value, and after four of them -- half a second, not eight
seconds -- the loop decides the draft has SETTLED and leaves with raw = "null". JSON.parse gives
back null, and the assertion under it dereferences it.

ONE EXPRESSION DECIDES "IS THERE A DRAFT" AND A SECOND ONE ANSWERS IT. The loop's condition was
written for "has the value stopped changing" and was quietly also answering "is there a value",
which it is not equipped to do once the value has been through a serialiser. The eight-second
budget was never spent; the loop gave up in half a second every time, and only LOOKED like a timing
flake because whether the autosave had fired within that half-second was a race.

THE FIX IS TWO WAITS, because they are two questions. First: has the autosave written anything at
all -- a draft EXISTS. It is coalesced to about a second, so this is waiting for one tick. Then:
has it stopped changing -- the save fires after every contour, so the first thing it writes is a
half-drawn draft and asserting against that would be asserting a state nobody is in.

AND THE ASSERTIONS STOP THROWING. A check that cannot answer should say so on its own line and let
the rest of the file run. One null dereference costing a hundred unrelated assertions is how a
suite becomes something people stop reading -- which is exactly what happened to the two checks
fixed beside this one today, red for six days with nobody noticing.

Run: python3 src/no_draft_yet_is_not_a_settled_draft.py, then node tracingpanelcheck.js
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


edit("tracingpanelcheck.js", [

 (u"two waits, because they are two questions",
  u'''      /* Waits for the autosave to SETTLE, not merely to happen: it fires after every contour, so
         the first value it writes is a half-drawn draft and reading that would assert against a
         state nobody is in. Two identical reads a few hundred ms apart is what "caught up" means,
         and it is not a stopwatch -- a fixed wait is a race that passes until the run ahead of it
         gets slower, which is how this section started failing on 2026-09-18 with nothing wrong
         in it. */
      let raw = null, prev = null, same = 0;
      for (let i = 0; i < 80; i++){
        await new Promise(r => setTimeout(r, 100));
        raw = JSON.stringify(draftRead());
        if (raw && raw === prev){ if (++same >= 4) break; } else same = 0;
        prev = raw;
      }
      return { raw: !!raw, d: raw ? JSON.parse(raw) : null,''',
  u'''      /* ── "NO DRAFT YET" IS NOT A SETTLED DRAFT ────────────────────────  2026-10-03
         This was one loop asking two questions, and it got the first one wrong in a way that only
         showed up as a flake. draftRead() is null until the autosave fires; JSON.stringify(null)
         is the STRING "null", which is truthy -- so four consecutive reads of nothing satisfied
         "the value has stopped changing" and the loop left after half a second with raw = "null".
         JSON.parse handed back null and the assertion under it threw, taking the rest of the file
         with it. The eight-second budget below it was never once spent.

         So: wait for the draft to EXIST, then wait for it to SETTLE. The autosave is coalesced to
         about a second, so the first wait is for one tick; the second is because the save fires
         after every contour and the first thing it writes is a half-drawn draft, which is a state
         nobody is in. Neither is a stopwatch -- a fixed wait is a race that passes until the run
         ahead of it gets slower, which is how this section started failing on 2026-09-18 with
         nothing wrong in it. */
      const read = function(){
        var s = JSON.stringify(draftRead());
        return (s && s !== "null" && s !== "undefined") ? s : null;   // the whole bug, in one line
      };
      const until = async function(ms, f){
        const end = Date.now() + ms;
        for (;;){
          const v = f();
          if (v) return v;
          if (Date.now() > end) return null;
          await new Promise(r => setTimeout(r, 50));
        }
      };
      let raw = await until(20000, read), prev = null, same = 0;
      if (raw) for (let i = 0; i < 200; i++){
        await new Promise(r => setTimeout(r, 150));
        const s = read();
        if (s){ raw = s; if (s === prev){ if (++same >= 4) break; } else same = 0; }
        prev = s;
      }
      return { raw: !!raw, d: raw ? JSON.parse(raw) : null,''' ),

 (u"and the assertions report rather than throw",
  u'''    ok(saved.raw && saved.d.rings.length === 2,
       "the pad saves itself as you draw — no button pressed",
       saved.d && saved.d.rings.length + " contours");
    ok(saved.d.pending.length === 1,
       "...including the contour still being drawn", saved.d.pending.length + " vertex");
    ok(saved.d.editId === "hers_1" && saved.d.nucId === "253863",
       "...and WHICH tracing it is, with what has been filled in",
       saved.d.editId + " / " + saved.d.nucId);''',
  u'''    /* Read through `D` from here on. When no draft ever arrived this section reports three
       failures and the file carries on; dereferencing a null here cost the hundred-odd assertions
       after it, which is a worse answer than the one it was trying to give. */
    const D = saved.d || {};
    ok(saved.raw && (D.rings || []).length === 2,
       "the pad saves itself as you draw — no button pressed",
       saved.raw ? (D.rings || []).length + " contours" : "the autosave never fired in 20 s");
    ok((D.pending || []).length === 1,
       "...including the contour still being drawn", (D.pending || []).length + " vertex");
    ok(D.editId === "hers_1" && D.nucId === "253863",
       "...and WHICH tracing it is, with what has been filled in",
       (D.editId || "—") + " / " + (D.nucId || "—"));'''),
])
print("\nNow: node tracingpanelcheck.js, a few times")
