# -*- coding: utf-8 -*-
u"""A draft follows the account.                                                 2026-09-19

Søren, asked where drafts should live: **in the dataset** — following the account between machines
rather than sitting in one browser.

The browser half is src/a_draft_is_one_of_several.py; the backend half is
backend/src_a_draft_is_kept_for_you.py (one Drive file and one index row each, private to the
author, proved by backend/gs_harness_drafts.js). This is the wire between them.

THE BROWSER STAYS THE FAST COPY, and that is not a compromise. The pad autosaves about every 1.2
seconds while somebody is drawing; mirroring that would be a POST and a Drive write per second, per
tracer, which is a quota mail waiting to happen. So localStorage takes every autosave and the
server is pushed at MEANINGFUL MOMENTS: an explicit Save draft, closing the pad, and at most once
every two minutes otherwise. The same sentence is in the backend generator, because a throttle
enforced at one end and assumed at the other is a thing that can be changed in ignorance.

IT ALSO MEANS DRAFTS STILL WORK SIGNED OUT, which they must: the card already promises a tracing is
kept whether or not you have signed in, and somebody drawing for an hour before signing in should
not lose it. Signed out, draftPush does nothing at all — no alert, no prompt, no queue. postReport
cannot be used for this: it fires Google One Tap and shows an alert when signed out, which is the
right thing for submitting a report and entirely wrong for an autosave.

THE LIST IS THE UNION. A draft on the server that is not in this browser appears in the bar marked
"on your account", and Resume fetches its geometry before opening it. One kept in both is shown
once, preferring whichever was updated later — so a draft edited on the laptop and then opened on
the desktop resumes the laptop's version rather than a stale local copy.

Run: python3 src/a_draft_follows_the_account.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

WIRE = [
    (u'''/* Which draft the pad is writing to.''',
     u'''/* ── THE SERVER COPY ───────────────────────────────────────────────────────────  2026-09-19
   Søren chose drafts kept in the dataset, so they follow the account between machines.

   NOT postReport: that fires Google One Tap and shows an alert when signed out, which is right for
   submitting a report and wrong for an autosave. Signed out this does nothing at all, and that is
   the intended behaviour rather than a degraded one — the card already promises a tracing is kept
   whether or not anybody has signed in.

   THROTTLED, and the number is not arbitrary: the pad autosaves about every 1.2 s while somebody
   draws, and a Drive write per second per tracer is a quota mail. Two minutes, plus every explicit
   save. The backend generator says the same thing at its end, because a throttle enforced in one
   place and assumed in the other is a thing that gets changed in ignorance. */
var DRAFT_PUSH_AT = 0, DRAFT_PUSH_EVERY = 120000, DRAFT_SERVER = [], DRAFT_SERVER_AT = 0;
function draftSignedIn(){
  return !!(typeof GOOGLE_VERIFIED !== "undefined" && GOOGLE_VERIFIED
            && typeof GOOGLE_CREDENTIAL !== "undefined" && GOOGLE_CREDENTIAL && REPORT_ENDPOINT);
}
function draftPush(d, force){
  if (!draftSignedIn() || !d || !d.id) return false;
  if (!force && Date.now() - DRAFT_PUSH_AT < DRAFT_PUSH_EVERY) return false;
  DRAFT_PUSH_AT = Date.now();
  const zs = {}, insts = {};
  (d.rings || []).forEach(function(r){ zs[r.z] = 1; insts[r.inst || 0] = 1; });
  try {
    postAndRead({ type: "tracing_draft", action: "save", credential: GOOGLE_CREDENTIAL,
      draftId: d.id, title: d.title || "", updated: d.at || new Date().toISOString(),
      contours: (d.rings || []).length, sections: Object.keys(zs).length,
      structures: Object.keys(insts).length,
      x: (d.centre && d.centre[0]) || 0, y: (d.centre && d.centre[1]) || 0, z: d.z || 0,
      nucleusId: d.nucId || "", rootId: d.rootId || "", editId: d.editId || "",
      draft: JSON.stringify(d) }).then(function(){ draftServerSoon(true); }, function(){});
  } catch (_e){ return false; }
  return true;
}
function draftPushDelete(id){
  if (!draftSignedIn() || !id) return;
  try {
    postAndRead({ type: "tracing_draft", action: "delete",
                  credential: GOOGLE_CREDENTIAL, draftId: id }).then(function(){
      DRAFT_SERVER = DRAFT_SERVER.filter(function(x){ return x.draftId !== id; });
      draftRender();
    }, function(){});
  } catch (_e){}
}
/* The index, which opens no Drive file at the other end. Cheap enough to ask for on sign-in and
   after a push, and not cheap enough to ask for on every render. */
function draftServerSoon(force){
  if (!draftSignedIn()) return;
  if (!force && Date.now() - DRAFT_SERVER_AT < 30000) return;
  DRAFT_SERVER_AT = Date.now();
  fetch(REPORT_ENDPOINT + "?drafts=" + encodeURIComponent(GOOGLE_CREDENTIAL))
    .then(function(r){ return r.json(); })
    .then(function(j){
      if (j && j.ok && j.drafts){ DRAFT_SERVER = j.drafts; draftRender(); }
    })
    .catch(function(){});
}

/* Which draft the pad is writing to.''',
     "the draft is pushed to the account, throttled, and never when signed out"),

    (u'''      if (at >= 0) list.splice(at, 1, d); else list.unshift(d);
      return writeAll(list);''',
     u'''      if (at >= 0) list.splice(at, 1, d); else list.unshift(d);
      var wrote = writeAll(list);
      /* The browser first, always: it is the copy that cannot fail and the one the pad reads back.
         The server is a mirror of it, throttled, and its failure costs nothing here. */
      if (wrote) draftPush(d, false);
      return wrote;''',
     "...whenever the browser copy is written"),

    (u'''    drop: function(id){
      var list = readAll().filter(function(d){ return d.id !== id; });
      return writeAll(list);
    }''',
     u'''    drop: function(id){
      var list = readAll().filter(function(d){ return d.id !== id; });
      draftPushDelete(id);
      return writeAll(list);
    },
    /* EVERY DRAFT THIS ACCOUNT HAS, from both copies. One kept in both is shown once, preferring
       whichever was updated later — so a draft carried on from the laptop resumes the laptop's
       version rather than a stale copy of it sitting in this browser. */
    all: function(){
      var here = readAll(), seen = {}, out = [];
      here.forEach(function(d){ seen[d.id] = 1; out.push(d); });
      DRAFT_SERVER.forEach(function(s){
        var mine = null, i;
        for (i = 0; i < out.length; i++) if (out[i].id === s.draftId){ mine = out[i]; break; }
        if (!mine){
          out.push({ id: s.draftId, title: s.title, at: s.updated, remote: true,
                     rings: new Array(Math.max(0, s.contours | 0)), pending: [],
                     sections: s.sections, editId: s.editId });
          return;
        }
        mine.alsoRemote = true;
        if (String(s.updated || "") > String(mine.at || "")) mine.staler = s;
      });
      out.sort(function(a, b){ return String(b.at || "").localeCompare(String(a.at || "")); });
      return out;
    }''',
     "...and discarding one discards it there too"),
]

RENDER = [
    (u'''  const list = draftStore.list();
  if (!list.length){ bar.style.display = "none"; bar.innerHTML = ""; return; }''',
     u'''  const list = draftStore.all();
  if (!list.length){ bar.style.display = "none"; bar.innerHTML = ""; return; }''',
     "the bar lists both copies"),

    (u'''          + '<span class="hint" style="flex:0 0 auto">' + (d.rings || []).length + ' contour'
            + ((d.rings || []).length === 1 ? '' : 's') + ' on ' + nz + ' section'
            + (nz === 1 ? '' : 's') + ', ' + escHtml(draftWhen(d.at)) + '</span>' ''' .rstrip(),
     u'''          + '<span class="hint" style="flex:0 0 auto">' + (d.rings || []).length + ' contour'
            + ((d.rings || []).length === 1 ? '' : 's')
            + (d.remote ? ' on ' + (d.sections || 0) + ' section' + ((d.sections || 0) === 1 ? '' : 's')
                        : ' on ' + nz + ' section' + (nz === 1 ? '' : 's'))
            + ', ' + escHtml(draftWhen(d.at))
            /* SAID, NOT ASSUMED: a draft that is only on the account has to be fetched before it
               can be drawn, and one that is newer there than here would otherwise resume as a
               stale copy without a word. */
            + (d.remote ? ' \\u00b7 on your account' : (d.staler ? ' \\u00b7 a newer one is on your account'
                                                              : '')) + '</span>' ''' .rstrip(),
     "...saying which are on the account and which are newer there"),

    (u'''    b.addEventListener("click", function(){ draftResume(b.dataset.id); });''',
     u'''    b.addEventListener("click", function(){ draftResume(b.dataset.id); });''',
     "(resume wiring unchanged)"),
]

HEADING = [
    # The bar said "kept in this browser" while listing drafts that are on the account — true when
    # there was nowhere else for one to be, and not true since. The per-row "on your account" does
    # the distinguishing now, so the heading only has to count.
    (u"""      + 'color:var(--mut);margin-bottom:6px">Unfinished tracings kept in this browser'
      + (list.length > 1 ? " (" + list.length + ")" : "") + '</div>'""",
     u"""      + 'color:var(--mut);margin-bottom:6px">Unfinished tracings'
      + (list.length > 1 ? " (" + list.length + ")" : "") + '</div>'""",
     "the heading stops claiming they are all in this browser"),
]

RESUME = [
    (u'''function draftResume(id){
  /* THE ID IS ADOPTED, not replaced: saving from here on updates the draft that was resumed rather
     than growing a second copy of the same work on the next autosave. */
  const d = id ? draftStore.get(id) : draftRead();
  if (!d) return;''',
     u'''function draftResume(id){
  /* THE ID IS ADOPTED, not replaced: saving from here on updates the draft that was resumed rather
     than growing a second copy of the same work on the next autosave. */
  const d = id ? draftStore.get(id) : draftRead();
  /* ── FETCHED FIRST, WHEN IT IS NOT IN THIS BROWSER ─────────────────────────────  2026-09-19
     The index carries the counts but not a single coordinate, which is what makes listing cheap;
     a draft started on another machine therefore has to be asked for before it can be drawn. The
     same route brings back a NEWER server copy of one that is also here, so carrying on from the
     laptop on the desktop resumes the laptop's version. */
  const stale = d && d.staler;
  if ((!d || d.remote || stale) && id && draftSignedIn()){
    padSay("Fetching that tracing from your account\\u2026");
    fetch(REPORT_ENDPOINT + "?drafts=" + encodeURIComponent(GOOGLE_CREDENTIAL)
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
}
/* The half that puts a draft on the pad, split out so it can be reached both by the local path
   above and by the one that had to fetch first. */
function draftResumeFrom(d){
  if (!d) return;''',
     "a draft kept only on the account is fetched before it is resumed"),
]

SIGNIN = [
    # gamifyOnSignIn lives in core/gamify.js, which µJump loads rather than defines, so the hook is
    # taken where the page ALREADY calls it -- one line, at the moment the credential exists.
    (u'''if(typeof gamifyOnSignIn==="function")gamifyOnSignIn();}''',
     u'''if(typeof gamifyOnSignIn==="function")gamifyOnSignIn();
      /* Signing in is the moment the account's drafts become knowable, so it is when they are
         asked for. 2026-09-19. */
      try{ draftServerSoon(true); }catch(_dse){}}''',
     "signing in fetches the drafts kept on the account"),
]

EXPLICIT = [
    (u'''  draftWrite(d); draftRender();
  if (explicit) padSay("Draft saved in this browser. Close the page if you like \\u2014 the pad "
    + "reopens where you left it, on the same section.");
  return d;''',
     u'''  draftWrite(d);
  /* AN EXPLICIT PRESS BEATS THE THROTTLE. Somebody pressing Save draft is saying "make sure", and
     making sure is precisely what the two-minute timer does not do. */
  if (explicit) draftPush(d, true);
  draftRender();
  if (explicit) padSay(draftSignedIn()
    ? "Draft saved \\u2014 in this browser and on your account, so you can carry on from another "
      + "machine. The pad reopens where you left it, on the same section."
    : "Draft saved in this browser. Close the page if you like \\u2014 the pad reopens where you "
      + "left it, on the same section. Sign in and it is kept on your account too.");
  return d;''',
     "an explicit save reaches the account at once, and says where it went"),
]


def edit(rel, pairs):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    print(rel)
    for old, new, why in pairs:
        if old == new:
            print("  skipped: " + why)
            continue
        if new in s and (old not in s or old in new):
            print("  already there: " + why)
            continue
        assert not (new in s and old in s), "AMBIGUOUS: " + why
        assert old in s, "NOT FOUND: " + why
        assert s.count(old) == 1, "ambiguous (%d): %s" % (s.count(old), why)
        s = s.replace(old, new, 1)
        print("  ok: " + why)
    io.open(p, "w", encoding="utf-8").write(s)


edit("ujump.html", WIRE + RENDER + HEADING + RESUME + SIGNIN + EXPLICIT)
print("\nnow: node draftlistcheck.js && node draftsynccheck.js && python3 src/build_stamps.py")
