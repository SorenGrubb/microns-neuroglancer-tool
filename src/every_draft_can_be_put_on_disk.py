# -*- coding: utf-8 -*-
u"""Every draft can be put on disk.                                                      2026-10-05

Søren, on the evening a whole cell existed in exactly one browser tab and nowhere else, typing
`draftStore.list().forEach(d => draftToFile(d))` into a console because there was no other way:
*"Make the Save to file button on every draft row, so you never type a console command for this
again."*

`draftToFile` has existed since 4 October and could only be reached by the RESCUE path -- the
browser refusing storage. So the one destination with no quota, no sign-in and no deploy behind it
was reachable only by the failure it was written for. The card could open a draft file and could not
write one.

Now every row has it, including a row for a draft that is only on the account: that one has no
contours in the index -- which is what makes listing cheap -- so it is fetched first, through the
same helper "Resume it" uses. ONE fetch, not two: a second copy of that request is exactly the shape
of fault this file has spent the week on.

Check: draftlistcheck.js.
Run: python3 src/every_draft_can_be_put_on_disk.py
     python3 src/build_stamps.py
     node draftlistcheck.js
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


HELPERS = u'''/* ── A DRAFT WITH ITS CONTOURS IN HAND ─────────────────────────  2026-10-05
   The list is an index: a draft that lives on the account carries its counts and not one
   coordinate, which is what makes listing it cheap. Anything that wants the rings has to ask first.

   "Resume it" has always done that, inline. "Save to file" needs exactly the same thing, and a
   second copy of one request is the shape of fault this file has spent the week on -- two
   expressions that agree until one of them is changed. So it is one helper, and both go through it.

   `then` is called with a draft that definitely has rings. It is not called at all when there is
   nothing to call it with, which is the honest answer to "there is no copy of this anywhere I can
   reach". */
function draftWithRings(id, d, then){
  const stale = d && d.staler;
  if ((!d || d.remote || stale) && id && draftSignedIn()){
    padSay("Fetching that tracing from your account\\u2026");
    fetch(REPORT_ENDPOINT + "?drafts=" + encodeURIComponent(GOOGLE_CREDENTIAL) + tracingDsQS()
          + "&draftId=" + encodeURIComponent(id))
      .then(function(r){ return r.json(); })
      .then(function(j){
        if (!j || !j.ok || !j.draft){
          padSay("That tracing could not be read from your account"
            + (j && j.error ? ": " + j.error : "") + ".", true);
          return;
        }
        var got = j.draft;
        got.id = id;
        /* Written to this browser as it arrives, so the pad is reading the same copy everything
           else does and a reload does not have to fetch it again. */
        draftStore.put(got);
        then(got);
      })
      .catch(function(e){
        padSay("Could not reach your account to fetch that tracing: "
          + String(e && e.message || e), true);
      });
    return;
  }
  if (!d) return;
  then(d);
}
/* ── AND THE BUTTON THAT PUTS IT THERE ──────────────────────────  2026-10-05
   A file is the one destination with no quota, no sign-in, no deploy and no backend behind it. It
   was written automatically when the browser refused storage and by nothing else, so on the evening
   a whole cell existed in one tab and nowhere else the way to save it was a console command. */
function draftSaveToFile(id){
  const d = id ? draftStore.get(id) : draftRead();
  if (!d && !id){ padSay("There is no unfinished tracing to save.", true); return; }
  draftWithRings(id, d, function(got){
    if (draftToFile(got))
      padSay("Saved to \\u201c" + draftFileName(got) + "\\u201d \\u2014 "
        + ((got.rings || []).length) + " contour"
        + (((got.rings || []).length) === 1 ? "" : "s")
        + ". That file goes back on the pad through \\u201cOpen a draft file\\u201d below, on any "
        + "machine and with nobody signed in.");
    else
      padSay("That tracing could not be written to a file.", true);
  });
}
'''

edit("core/tracingcard.js", [

 (u"one fetch for both of them",
  u"""function draftRender(){""",
  HELPERS + u"""function draftRender(){"""),

 (u"resume goes through it too",
  u"""  const stale = d && d.staler;
  if ((!d || d.remote || stale) && id && draftSignedIn()){
    padSay("Fetching that tracing from your account\\u2026");
    fetch(REPORT_ENDPOINT + "?drafts=" + encodeURIComponent(GOOGLE_CREDENTIAL) + tracingDsQS()
          + "&draftId=" + encodeURIComponent(id))
      .then(function(r){ return r.json(); })
      .then(function(j){
        if (!j || !j.ok || !j.draft){
          padSay("That tracing could not be read from your account"
            + (j && j.error ? ": " + j.error : "") + ".", true);
          return;
        }
        var got = j.draft;
        got.id = id;
        /* Written to this browser as it arrives, so the pad is reading the same copy everything
           else does and a reload does not have to fetch it again. */
        draftStore.put(got);
        TRACING_DRAFT_ID = id;
        draftResumeFrom(got);
      })
      .catch(function(e){
        padSay("Could not reach your account to fetch that tracing: "
          + String(e && e.message || e), true);
      });
    return;
  }
  if (!d) return;
  draftResumeFrom(d);
}""",
  u"""  draftWithRings(id, d, function(got){
    /* ADOPTED HERE AND NOT IN THE HELPER: saving a draft to a file must not make it the one the pad
       is about to write over. The fetch is shared; what each button does with what comes back is
       not. */
    TRACING_DRAFT_ID = got.id || id || TRACING_DRAFT_ID;
    draftResumeFrom(got);
  });
}"""),

 (u"a button on every row",
  u"""          + '<button type="button" class="hist-chip draftdrop" data-id="' + escHtml(d.id) + '">'
            + 'Discard</button>'""",
  u"""          /* BEFORE Discard, and on every row including one that is only on the account —
             that one has no contours in the index and is fetched first. 2026-10-05. */
          + '<button type="button" class="hist-chip draftfile" data-id="' + escHtml(d.id) + '" '
            + 'title="Write this unfinished tracing to a .json file. No quota, no sign-in — and '
            + 'it comes back through “Open a draft file” below.">Save to file</button>'
          + '<button type="button" class="hist-chip draftdrop" data-id="' + escHtml(d.id) + '">'
            + 'Discard</button>'"""),

 (u"and it is wired",
  u"""  [].slice.call(bar.querySelectorAll(".draftdrop")).forEach(function(b){""",
  u"""  [].slice.call(bar.querySelectorAll(".draftfile")).forEach(function(b){
    b.addEventListener("click", function(){ draftSaveToFile(b.dataset.id); });
  });
  [].slice.call(bar.querySelectorAll(".draftdrop")).forEach(function(b){"""),
])
print("\\nNow: python3 src/build_stamps.py, then node draftlistcheck.js")
