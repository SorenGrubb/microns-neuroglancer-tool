# -*- coding: utf-8 -*-
u"""A draft is never only in a place that can refuse.                                     2026-10-04

Søren, after a two-hour whole-cell tracing was gone: *"It had complained some times that it did not
have enough space in the browser to save my draft. I just lost 2 hours of work. What the hell. Can
we make sure that this does not happen again and fix the problems associated with saving
structures?"*

HE WAS TOLD, AND IT STILL WENT. That is the part worth sitting with. The card knew the browser was
refusing, said so, and then carried on behaving exactly as if nothing were wrong — one sentence in a
status row that the next thing to happen overwrote. Four faults, any one of which alone would have
been survivable:

  1. THE ACCOUNT COPY WAS GATED BEHIND THE BROWSER COPY. `if (wrote) draftPush(d, false)`, under a
     comment reading "the browser first, always: it is the copy that cannot fail". It can fail. And
     because it failed, the one copy that survives a closed tab was never even attempted. A fallback
     that runs only when the primary succeeded is not a fallback. This is the line that cost the two
     hours.
  2. ONE KEY FOR EVERY DRAFT. Each autosave re-serialised all fifty into a single value, so a
     tracing too big for the quota took every other draft down with it and nothing could be saved at
     all. Now one key each plus a small index: a draft that will not fit fails alone.
  3. NO DESTINATION THAT CANNOT BE FULL. localStorage has a quota. The account needs a sign-in and a
     network. A file on his own disk needs neither and has no quota this code can exhaust — and it
     was never offered. It is now written without being asked, the moment anything else refuses, and
     again every twenty-five contours or five minutes, so the rescue file does not go stale while he
     keeps drawing.
  4. NOTHING STOPPED THE TAB CLOSING. A banner that stays up until a save works, and a beforeunload
     while the pad holds contours that are kept nowhere.

AND THE FILE CAN BE OPENED AGAIN, which is the half that makes the other half worth anything. A
rescue file nobody can reload is a souvenir. `draftResumeFrom()` already took a draft OBJECT — the
fetch-from-account path needed that — so reading a file into it is a dozen lines.

THE MIGRATION FREES SPACE RATHER THAN USING MORE. Splitting the v2 blob writes each draft to its own
key and then replaces the blob with the small index, so a browser that was full before has room
afterwards. The index is written LAST and only when every draft landed, because an index naming a
draft that is not there is worse than an old blob.

AND "THE ONE STORE" EXISTED TWICE. The block declaring TRACING_MEM, TRACING_MEM_STORE,
tracingKeepsLocal and tracingStore appears verbatim twice, fifteen lines apart, under a comment
calling itself THE ONE STORE. Harmless by luck — the declarations hoist and the two copies are
identical — and exactly the shape of fault this file keeps paying for. One of them goes.

Check: draftsafecheck.js, which fills the store until it refuses and then asserts that the account
was still asked, the file was still written, the other drafts still saved, and the banner is up.
Run: python3 src/a_draft_is_never_only_in_one_place.py
     python3 src/build_stamps.py
     node draftsafecheck.js
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


STORE_HEAD = u"""/* THE ONE STORE, 2026-09-21. localStorage, unless the host says keepLocal: false -- then an object
   in memory for the life of the page. See src/the_card_can_keep_nothing_in_the_browser.py. */
"""
STORE_BODY = u"""var TRACING_MEM = {};
var TRACING_MEM_STORE = {
  getItem: function(k){ return Object.prototype.hasOwnProperty.call(TRACING_MEM, k) ? TRACING_MEM[k] : null; },
  setItem: function(k, v){ TRACING_MEM[k] = String(v); },
  removeItem: function(k){ delete TRACING_MEM[k]; }
};
function tracingKeepsLocal(){
  try { var v = tracingCfg().keepLocal; return v === undefined ? true : !!v; } catch (_e){ return true; }
}
function tracingStore(){
  if (!tracingKeepsLocal()) return TRACING_MEM_STORE;
  try { return window.localStorage || TRACING_MEM_STORE; } catch (_e){ return TRACING_MEM_STORE; }
}
"""
STORE_ONCE = u"""/* THE ONE STORE, 2026-09-21. localStorage, unless the host says keepLocal: false -- then an object
   in memory for the life of the page. See src/the_card_can_keep_nothing_in_the_browser.py.

   AND IT EXISTED TWICE, verbatim, fifteen lines apart, under a comment calling itself THE ONE
   STORE. Harmless by luck -- the declarations hoist and the two copies were identical -- and
   exactly the shape of fault this file keeps paying for. 2026-10-04. */
""" + STORE_BODY


OLD_STORE = r"""var draftStore = (function(){
  function readAll(){
    var out = [];
    try {
      var raw = JSON.parse(tracingStore().getItem(tracingScopedKey(TRACING_DRAFTS_KEY)) || "null");
      if (raw && Array.isArray(raw.drafts)) out = raw.drafts.filter(function(d){
        return d && Array.isArray(d.rings);
      });
    } catch (_e){ out = []; }
    if (!out.length){
      /* MIGRATION, ONE WAY. The single-slot draft becomes the first entry in the list; the old key
         keeps its copy, because nothing good has ever come of a migration that also deletes. */
      try {
        var one = JSON.parse(tracingStore().getItem(tracingScopedKey(TRACING_DRAFT_KEY)) || "null");
        if (one && Array.isArray(one.rings) && one.rings.length){
          if (!one.id) one.id = "migrated";
          if (!one.title) one.title = "Unfinished tracing";
          out = [one];
        }
      } catch (_e2){}
    }
    out.sort(function(a, b){ return String(b.at || "").localeCompare(String(a.at || "")); });
    return out;
  }
  function writeAll(list){
    try { tracingStore().setItem(tracingScopedKey(TRACING_DRAFTS_KEY), JSON.stringify({ v: 2, drafts: list })); return true; }
    catch (_e){
      padSay("This browser refused to keep the draft \u2014 it is out of storage. Your contours "
        + "are still on the pad.", true);
      return false;
    }
  }
  return {
    list: readAll,
    get: function(id){
      var m = readAll().filter(function(d){ return d.id === id; });
      return m.length ? m[0] : null;
    },
    put: function(d){
      var list = readAll(), at = -1, i;
      for (i = 0; i < list.length; i++) if (list[i].id === d.id){ at = i; break; }
      /* NOTHING IS DROPPED TO MAKE ROOM. One tracing was lost today to a silent overwrite; the
         answer to a full list is not another one. A NEW draft is refused and said so; the ones
         already in the list go on saving. */
      if (at < 0 && list.length >= TRACING_DRAFTS_MAX){
        padSay("There are already " + TRACING_DRAFTS_MAX + " unfinished tracings kept here, so this "
          + "one was not added. Add or discard one below and it will keep itself from then on.",
          true);
        return false;
      }
      if (at >= 0) list.splice(at, 1, d); else list.unshift(d);
      var wrote = writeAll(list);
      /* The browser first, always: it is the copy that cannot fail and the one the pad reads back.
         The server is a mirror of it, throttled, and its failure costs nothing here. */
      if (wrote) draftPush(d, false);
      return wrote;
    },
    drop: function(id){
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
    }
  };
})();
"""

NEW_STORE = r"""/* ── A DRAFT IS NEVER ONLY IN A PLACE THAT CAN REFUSE ──────────────────────────  2026-10-04
   Søren, after two hours of a whole-cell tracing went: *"It had complained some times that it did
   not have enough space in the browser to save my draft. I just lost 2 hours of work."*

   THE ACCOUNT COPY WAS GATED BEHIND THE BROWSER COPY. The line was `if (wrote) draftPush(d, false)`
   under a comment that said "the browser first, always: it is the copy that cannot fail". It can
   fail; it told him so, repeatedly; and because it failed, the one copy that would have survived
   the tab closing was never even attempted. A fallback that only runs when the primary succeeded is
   not a fallback.

   THREE THINGS CHANGED, and every one of them is about the moment the browser says no.

     the account      pushed on every save and FORCED when the local write failed, instead of
                      being skipped. The two-minute throttle exists so drawing does not become a
                      Drive write per second; a failed local save is not drawing.
     a file           a .json straight to the disk. Not storage this code manages, not a quota,
                      not an account — the one destination that cannot be full and does not need
                      anyone to be signed in. Offered the instant the browser refuses, and left on
                      screen until it is taken.
     one key each     the whole list used to be re-serialised into a single key on every autosave,
                      so one tracing too big for the quota took the other forty-nine down with it
                      and nothing could be saved at all until something was deleted. Each draft now
                      has its own key and the index is small: a draft that cannot fit fails alone.

   SPLITTING THE OLD BLOB FREES SPACE RATHER THAN USING MORE. The v2 key held every draft; the
   migration writes each one to its own key and then replaces that key with the small index, so a
   browser that was full before is less full afterwards. The index is written LAST and only when
   every draft got somewhere, because an index naming a draft that is not there is worse than an
   old blob. */
function draftKeyFor(id){ return tracingScopedKey(TRACING_DRAFTS_KEY) + "#" + String(id); }

/* How much this origin is holding, in bytes, counting UTF-16 as the browsers do. null when the
   store is the in-memory one, which has no quota to report. */
function draftRoom(){
  var s, i, k, n = 0;
  try {
    s = tracingStore();
    if (typeof s.length !== "number" || typeof s.key !== "function") return null;
    for (i = 0; i < s.length; i++){ k = s.key(i); n += (String(k).length + String(s.getItem(k) || "").length) * 2; }
  } catch (_e){ return null; }
  return n;
}
function draftMB(n){ return (n / 1048576).toFixed(1) + " MB"; }

var draftStore = (function(){
  function keyOf(id){ return draftKeyFor(id); }
  function putOne(d){
    try { tracingStore().setItem(keyOf(d.id), JSON.stringify(d)); return true; }
    catch (_e){ return false; }
  }
  function getOne(id){
    try {
      var d = JSON.parse(tracingStore().getItem(keyOf(id)) || "null");
      return (d && Array.isArray(d.rings)) ? d : null;
    } catch (_e){ return null; }
  }
  function dropOne(id){ try { tracingStore().removeItem(keyOf(id)); } catch (_e){} }
  /* The index carries only what the list on screen shows, so it stays small enough to write even
     when the store is nearly full -- which is exactly when it has to be written. */
  function brief(d){
    return { id: d.id, title: d.title || "", at: d.at || "", n: (d.rings || []).length,
             nucId: d.nucId || "", rootId: d.rootId || "" };
  }
  function writeIndex(list){
    try { tracingStore().setItem(tracingScopedKey(TRACING_DRAFTS_KEY),
                                 JSON.stringify({ v: 3, index: list.map(brief) })); return true; }
    catch (_e){ return false; }
  }
  /* ONE WAY, AND IT FREES SPACE. Returns the list it split out, or null when there was no old
     blob to split.

     ONCE PER PAGE, WHATEVER HAPPENS. On a browser that is ALREADY full -- which is the one this
     was written for -- the per-draft writes fail, the index is not written, and the old blob stays
     exactly where it was. That is the right outcome: readAll still returns the drafts it parsed,
     so nothing is lost. What would be wrong is trying again on every render, several times a
     second, each time serialising every draft afresh. It is attempted once; if it could not be
     done it is left alone until the next load, by which time deleting a draft may have made room. */
  var SPLIT_TRIED = false;
  function splitOldBlob(){
    var raw = null, old = [], wrote = 0;
    try { raw = JSON.parse(tracingStore().getItem(tracingScopedKey(TRACING_DRAFTS_KEY)) || "null"); }
    catch (_e){ return null; }
    if (!raw || !Array.isArray(raw.drafts)) return null;
    old = raw.drafts.filter(function(d){ return d && d.id && Array.isArray(d.rings); });
    if (SPLIT_TRIED) return old;
    SPLIT_TRIED = true;
    old.forEach(function(d){ if (putOne(d)) wrote++; });
    /* Only when every one of them landed. A half-split index would hide the half that did not. */
    if (wrote === old.length) writeIndex(old);
    return old;
  }
  function readAll(){
    var out = [], idx = null, raw;
    try { raw = JSON.parse(tracingStore().getItem(tracingScopedKey(TRACING_DRAFTS_KEY)) || "null"); }
    catch (_e){ raw = null; }
    if (raw && Array.isArray(raw.drafts)){
      out = splitOldBlob() || [];
    } else if (raw && Array.isArray(raw.index)){
      idx = raw.index;
      idx.forEach(function(b){
        var d = getOne(b.id);
        /* A draft named by the index but not on disk is listed from the index alone rather than
           dropped, so somebody can see that it was there and that something ate it. */
        out.push(d || { id: b.id, title: b.title, at: b.at, missing: true,
                        rings: new Array(Math.max(0, b.n | 0)), pending: [] });
      });
    }
    if (!out.length){
      /* MIGRATION, ONE WAY. The single-slot draft becomes the first entry in the list; the old key
         keeps its copy, because nothing good has ever come of a migration that also deletes. */
      try {
        var one = JSON.parse(tracingStore().getItem(tracingScopedKey(TRACING_DRAFT_KEY)) || "null");
        if (one && Array.isArray(one.rings) && one.rings.length){
          if (!one.id) one.id = "migrated";
          if (!one.title) one.title = "Unfinished tracing";
          out = [one];
        }
      } catch (_e2){}
    }
    out.sort(function(a, b){ return String(b.at || "").localeCompare(String(a.at || "")); });
    return out;
  }
  return {
    list: readAll,
    get: function(id){
      var d = getOne(id);
      if (d) return d;
      var m = readAll().filter(function(x){ return x.id === id && !x.missing; });
      return m.length ? m[0] : null;
    },
    put: function(d){
      var list = readAll(), at = -1, i;
      for (i = 0; i < list.length; i++) if (list[i].id === d.id){ at = i; break; }
      /* NOTHING IS DROPPED TO MAKE ROOM. One tracing was lost to a silent overwrite; the answer to
         a full list is not another one. A NEW draft is refused and said so; the ones already in the
         list go on saving. */
      if (at < 0 && list.length >= TRACING_DRAFTS_MAX){
        padSay("There are already " + TRACING_DRAFTS_MAX + " unfinished tracings kept here, so this "
          + "one was not added. Add or discard one below and it will keep itself from then on.",
          true);
        draftRescue(d, "there is no room in the list for another unfinished tracing");
        return false;
      }
      if (at >= 0) list.splice(at, 1, d); else list.unshift(d);
      var wrote = putOne(d);
      if (wrote) writeIndex(list);
      /* ── THE ACCOUNT IS TRIED WHETHER OR NOT THE BROWSER TOOK IT ──────────────────────────
         This is the line that cost two hours. It used to read `if (wrote) draftPush(d, false)`,
         so the copy that survives a closed tab was attempted only when the copy that cannot
         survive one had already worked. Forced when the local write failed, because a throttle
         meant for "somebody is drawing" has no business delaying the one remaining copy. */
      draftPush(d, !wrote);
      if (!wrote) draftRescue(d, "this browser is out of storage"
                              + (draftRoom() ? " (it is holding " + draftMB(draftRoom()) + ")" : ""));
      else draftAlarmClear(d.id);
      return wrote;
    },
    drop: function(id){
      var list = readAll().filter(function(d){ return d.id !== id; });
      draftPushDelete(id);
      dropOne(id);
      draftAlarmClear(id);
      return writeIndex(list);
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
    }
  };
})();"""

RESCUE = r"""/* ── THE DESTINATION THAT CANNOT BE FULL ───────────────────────────────────────  2026-10-04
   Søren: *"I just lost 2 hours of work."*

   Every place this card keeps a draft can say no. localStorage has a quota and said so. The account
   needs somebody to be signed in and a network to reach. A FILE ON HIS OWN DISK needs neither, has
   no quota this code can exhaust, and is the only one of the three that is still there after the
   tab is closed, the browser updated, the site data cleared.

   SO IT IS WRITTEN WITHOUT BEING ASKED, the moment anything else refuses, and the banner goes up as
   well rather than instead — a programmatic download is a thing a browser may decline silently, so
   the button has to be there whether or not the automatic one landed.

   AND AGAIN AS THE WORK GROWS. The first version wrote one file per draft per page, which would
   have handed him a file from the minute it first failed and lost the hour he drew afterwards.
   Another twenty-five contours or another five minutes and it writes a fresh one. That is a handful
   of files in a long session, which is the right trade against a handful of hours. */
var DRAFT_ALARM_FOR = "", DRAFT_RESCUED = {};
function draftFileName(d){
  return tracingSafeName((d && d.title) || "tracing") + "_draft_"
       + String((d && d.at) || new Date().toISOString()).replace(/[:.]/g, "-") + ".json";
}
function draftToFile(d){
  try {
    tracingSaveBlob(new Blob([JSON.stringify(d)], { type: "application/json" }), draftFileName(d));
    return true;
  } catch (_e){ return false; }
}
function draftRescue(d, why){
  if (!d || !d.id) return;
  var now = Date.now(), n = (d.rings || []).length, was = DRAFT_RESCUED[d.id];
  if (!was || n - was.n >= 25 || now - was.at >= 300000){
    DRAFT_RESCUED[d.id] = { n: n, at: now };
    draftToFile(d);
  }
  draftAlarmShow(d, why);
}
/* IT STAYS UP UNTIL A SAVE WORKS. padSay's line is one sentence in a status row that the next
   thing to happen overwrites — which is what he saw: it "complained some times", and then the pad
   went on looking normal. This does not go away on its own. */
function draftAlarmShow(d, why){
  var el = document.getElementById("tracingDraftAlarm");
  DRAFT_ALARM_FOR = d.id;
  if (!el) return;
  var n = (d.rings || []).length;
  el.style.display = "";
  el.innerHTML =
    "<b>This tracing is not saved.</b> " + escHtml(String(why || "the browser refused it")) + ", so "
    + "the " + n + " contour" + (n === 1 ? "" : "s") + " on the pad "
    + (draftSignedIn() ? "went to your account, but there is no copy in this browser."
                       : "are only on this pad — and you are not signed in, so there is no "
                         + "copy on your account either.")
    + " <b>A file has been downloaded to this machine.</b> Take another whenever you like; the pad "
    + "reopens from it with <i>Open a draft file</i> below."
    + " <button type=\"button\" id=\"tracingDraftFile\" style=\"margin-left:6px\">"
    + "Save this tracing to a file</button>";
  var b = document.getElementById("tracingDraftFile");
  if (b) b.addEventListener("click", function(){
    var now = draftNow() || d;
    DRAFT_RESCUED[d.id] = { n: (now.rings || []).length, at: Date.now() };
    var okFile = draftToFile(now);
    padSay(okFile ? "Written to your downloads folder."
                  : "The browser would not write the file \u2014 use its own Save page as, or sign in.",
           !okFile);
  });
}
function draftAlarmClear(id){
  if (id && DRAFT_ALARM_FOR && String(id) !== String(DRAFT_ALARM_FOR)) return;
  DRAFT_ALARM_FOR = "";
  var el = document.getElementById("tracingDraftAlarm");
  if (el){ el.style.display = "none"; el.innerHTML = ""; }
}
/* ── AND THE TAB DOES NOT CLOSE QUIETLY ────────────────────────────────────────  2026-10-04
   Only while the alarm is up, so this never nags somebody whose work is kept. Browsers show their
   own wording; what matters is that there is a stop between two hours of contours and a reflex
   Ctrl-W. */
try {
  window.addEventListener("beforeunload", function(e){
    if (!DRAFT_ALARM_FOR) return;
    if (!(typeof PAD !== "undefined" && PAD && PAD.rings && PAD.rings.length)) return;
    e.preventDefault(); e.returnValue = ""; return "";
  });
} catch (_e){}
"""

RENDER_OLD = r"""function draftRender(){
  const bar = document.getElementById("tracingDraftBar");
  if (!bar) return;"""

RENDER_NEW = r"""/* -- A RESCUE FILE THAT CANNOT BE REOPENED IS A SOUVENIR -----------------------  2026-10-04
   draftResumeFrom() has always taken a draft OBJECT rather than an id -- the path that fetches one
   from the account needed that -- so a file is a dozen lines on top of it. The draft keeps its own
   id, so carrying on writes back to the same draft rather than growing a second copy of it. */
function draftOpenFile(f){
  var r = new FileReader();
  r.onload = function(){
    var d = null;
    try { d = JSON.parse(String(r.result)); } catch (_e){}
    if (!d || !Array.isArray(d.rings)){
      padSay("That file is not a tracing draft — it should be the .json this card wrote.", true);
      return;
    }
    if (!d.id) d.id = draftCurrentId();
    draftResumeFrom(d);
    padSay(d.rings.length + " contour" + (d.rings.length === 1 ? "" : "s")
      + " back on the pad, from the file.");
  };
  r.onerror = function(){ padSay("That file could not be read.", true); };
  r.readAsText(f);
}
function draftRender(){
  /* Wired here rather than where the card is built, because this runs on load whether or not there
     is a draft to list -- and the one moment somebody needs to open a rescue file is when there is
     nothing in the list to show them. Before the early return, for the same reason. */
  var fin = document.getElementById("tracingDraftFileIn");
  if (fin && !fin.getAttribute("data-wired")){
    fin.setAttribute("data-wired", "1");
    fin.addEventListener("change", function(){
      if (fin.files && fin.files[0]) draftOpenFile(fin.files[0]);
    });
  }
  const bar = document.getElementById("tracingDraftBar");
  if (!bar) return;"""

MARKUP_OLD = r"""    "<div id=\"tracingDraftBar\" style=\"display:none;margin-top:8px;font-size:12px\"></div>","""

MARKUP_NEW = r"""    "<div id=\"tracingDraftAlarm\" style=\"display:none;margin-top:8px;padding:8px;font-size:12px;border:1px solid var(--bad);border-radius:6px\"></div>",
    "<div id=\"tracingDraftBar\" style=\"display:none;margin-top:8px;font-size:12px\"></div>",
    "<!-- The way back in from a rescue file. It sits beside the list rather than inside it because",
    "     the moment somebody needs it is the moment the list has nothing in it. -->",
    "<div style=\"margin-top:6px;font-size:12px\"><label for=\"tracingDraftFileIn\" style=\"display:inline;margin:0 6px 0 0\">Open a draft file</label>",
    "<input type=\"file\" id=\"tracingDraftFileIn\" accept=\".json,application/json\" style=\"font-size:11px\"></div>","""


edit("core/tracingcard.js", [

 (u"THE ONE STORE is one store",
  STORE_HEAD + STORE_BODY + STORE_HEAD + STORE_BODY,
  STORE_ONCE),

 (u"a draft reaches somewhere that cannot refuse",
  OLD_STORE, RESCUE + u"\n" + NEW_STORE),

 (u"the pad can be given a draft file",
  RENDER_OLD, RENDER_NEW),

 (u"...and the card has somewhere to say it and somewhere to take one",
  MARKUP_OLD, MARKUP_NEW),
])
print("\nNow: python3 src/build_stamps.py, then node draftsafecheck.js")
