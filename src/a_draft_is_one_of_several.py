# -*- coding: utf-8 -*-
u"""A draft is one of several.                                                   2026-09-19

Søren: *"Perhaps we could also keep saved segmentation drafts here somewhere, so they can be easily
found and continued."*

THERE WAS EXACTLY ONE. `ujump_tracing_draft_v1` is a single localStorage key, so "save a draft"
has always meant "replace the draft" -- start tracing a second organelle and the first one is gone,
with nothing on screen ever having said there was only room for one. That is the same shape of
fault as this morning's: the tool quietly having less state than the person assumes.

ASKED WHERE THEY SHOULD LIVE, he chose **in the dataset** -- following the account between
machines rather than sitting in one browser. That is two halves, and this is the first:

  · the LIST, in this browser, behind one storage function (`draftStore`), so every draft is kept
    and can be found and resumed. Works signed out, works with no deploy, works today.
  · the BACKEND copy, next: one Drive file and one index row per draft, exactly as a shared tracing
    already works, mirrored from the same one function.

The browser half is not a lesser version of what he asked for; it is the offline half of it. The
page posts no-cors and cannot read a reply, so a draft that existed only on the server could not be
confirmed saved -- and he traces signed out, which the card already promises works.

NOTHING IS EVER DROPPED TO MAKE ROOM. The list is capped at fifty, and the fiftieth-first save is
REFUSED with a message rather than quietly evicting the oldest. One tracing was lost today to a
silent overwrite; the answer to a full list is not another one. Fifty drafts of forty-eight contours
is about half a megabyte, well inside what a browser keeps.

THE OLD KEY IS READ AND NEVER WRITTEN. A draft saved before today is adopted into the list on first
read, and `ujump_tracing_draft_v1` is left exactly where it is -- belt and braces, on the day a
draft was destroyed by a migration-shaped mistake.

TITLES ARE COMPUTED, NOT ASKED FOR. "3 × Lysosome · Microglia 521491" comes from the boxes already
filled in, at the moment of saving. A list of things called "Untitled" would be a list you still
have to open one by one, which is the thing he is asking not to have to do.

Run: python3 src/a_draft_is_one_of_several.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

STORE = [
    (u'''const TRACING_DRAFT_KEY = "ujump_tracing_draft_v1";
var TRACING_DRAFT_SOON = null;

function draftRead(){
  try {
    const d = JSON.parse(localStorage.getItem(TRACING_DRAFT_KEY) || "null");
    return (d && Array.isArray(d.rings)) ? d : null;
  } catch (_e){ return null; }
}
function draftWrite(d){
  try { localStorage.setItem(TRACING_DRAFT_KEY, JSON.stringify(d)); }
  catch (_e){ padSay("This browser refused to keep the draft \\u2014 it is out of storage. Your "
    + "contours are still on the pad.", true); }
}
function draftClear(){
  try { localStorage.removeItem(TRACING_DRAFT_KEY); } catch (_e){}
  draftRender();
}''',
     u'''/* ── A DRAFT IS ONE OF SEVERAL ─────────────────────────────────────────────────  2026-09-19
   Søren: *"Perhaps we could also keep saved segmentation drafts here somewhere, so they can be
   easily found and continued."*

   There was exactly one. `ujump_tracing_draft_v1` is a single key, so "save a draft" has always
   meant "replace the draft": start on a second organelle and the first was gone, with nothing on
   screen ever having said there was only room for one.

   EVERYTHING GOES THROUGH draftStore. Asked where drafts should live, he chose the dataset --
   following the account between machines -- and that is the next half of this: one Drive file and
   one index row each, mirrored from here. Keeping the reads and writes behind one object is what
   makes that an addition rather than a rewrite, and is why the list is built this way now.

   THE OLD KEY IS READ AND NEVER WRITTEN. A draft saved before today is adopted on first read and
   left exactly where it is -- belt and braces, on the day a tracing was destroyed by a save that
   thought it knew better. */
const TRACING_DRAFTS_KEY = "ujump_tracing_drafts_v2";
const TRACING_DRAFT_KEY = "ujump_tracing_draft_v1";     // the old single slot: read, never written
const TRACING_DRAFTS_MAX = 50;
var TRACING_DRAFT_SOON = null, TRACING_DRAFT_ID = "";

var draftStore = (function(){
  function readAll(){
    var out = [];
    try {
      var raw = JSON.parse(localStorage.getItem(TRACING_DRAFTS_KEY) || "null");
      if (raw && Array.isArray(raw.drafts)) out = raw.drafts.filter(function(d){
        return d && Array.isArray(d.rings);
      });
    } catch (_e){ out = []; }
    if (!out.length){
      /* MIGRATION, ONE WAY. The single-slot draft becomes the first entry in the list; the old key
         keeps its copy, because nothing good has ever come of a migration that also deletes. */
      try {
        var one = JSON.parse(localStorage.getItem(TRACING_DRAFT_KEY) || "null");
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
    try { localStorage.setItem(TRACING_DRAFTS_KEY, JSON.stringify({ v: 2, drafts: list })); return true; }
    catch (_e){
      padSay("This browser refused to keep the draft \\u2014 it is out of storage. Your contours "
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
      return writeAll(list);
    },
    drop: function(id){
      var list = readAll().filter(function(d){ return d.id !== id; });
      return writeAll(list);
    }
  };
})();

/* Which draft the pad is writing to. One per drafting session: a fresh pad starts a new one, and
   resuming adopts the id of the one resumed, so saving updates it rather than growing a second
   copy of the same work every time the autosave fires. */
function draftCurrentId(){
  if (!TRACING_DRAFT_ID)
    TRACING_DRAFT_ID = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return TRACING_DRAFT_ID;
}
/* What the list calls it, from the boxes already filled in. Asked-for names would be a field
   between somebody and their work, and a list of "Untitled" is a list you still have to open one
   by one -- which is the thing this is for. */
function draftTitleNow(){
  const val = function(id){ const e = document.getElementById(id); return e ? String(e.value || "") : ""; };
  let what = "";
  try {
    const sel = document.getElementById("tracingWhat");
    if (sel && sel.selectedIndex >= 0) what = sel.options[sel.selectedIndex].textContent || "";
  } catch (_e){}
  if (val("tracingWhat") === "__other" && val("tracingName")) what = val("tracingName");
  let n = 0;
  try { n = UJ.tracepad.instances(PAD).filter(function(i){ return i.contours; }).length; } catch (_e2){}
  const bits = [];
  if (n > 1) bits.push(n + " \\u00d7 " + (what || "structure"));
  else if (what) bits.push(what);
  const cell = [val("tracingType"), val("tracingNucId")].filter(function(s){ return s; }).join(" ");
  if (cell) bits.push(cell);
  return bits.join(" \\u00b7 ") || "Unfinished tracing";
}

/* The one the pad is on, which is what every guard in draftSave is about. */
function draftRead(){ return draftStore.get(draftCurrentId()); }
function draftWrite(d){ draftStore.put(d); }
function draftClear(id){
  draftStore.drop(id || draftCurrentId());
  if (!id || id === TRACING_DRAFT_ID) TRACING_DRAFT_ID = "";
  draftRender();
}''',
     "the draft becomes one of a list, behind one store"),
]

NOW = [
    (u'''  return { v: 1, at: new Date().toISOString(),''',
     u'''  return { v: 2, id: draftCurrentId(), title: draftTitleNow(), at: new Date().toISOString(),''',
     "...and every draft carries its own id and what to call it"),
]

RENDER = [
    (u'''function draftRender(){
  const bar = document.getElementById("tracingDraftBar");
  if (!bar) return;
  const d = draftRead();
  if (!d){ bar.style.display = "none"; bar.innerHTML = ""; return; }
  const zs = {};
  (d.rings || []).forEach(function(r){ zs[r.z] = 1; });
  const wrap = document.getElementById("tracePadWrap");
  const padOpen = wrap && wrap.style.display !== "none";
  bar.style.display = "";
  bar.innerHTML = '<b>Unfinished tracing kept in this browser</b> \\u2014 ' + d.rings.length
    + ' contour' + (d.rings.length === 1 ? '' : 's') + ' on ' + Object.keys(zs).length + ' section'
    + (Object.keys(zs).length === 1 ? '' : 's') + ', saved ' + draftWhen(d.at)
    + (d.editId ? ' (a version of a tracing already in the dataset)' : '') + '. '
    + (padOpen ? '' : '<button type="button" class="hist-chip" id="draftResume">Resume it</button> ')
    + '<button type="button" class="hist-chip" id="draftDrop">Discard</button>';
  const r = document.getElementById("draftResume");
  if (r) r.addEventListener("click", function(){ draftResume(); });
  const x = document.getElementById("draftDrop");
  if (x) x.addEventListener("click", function(){
    /* Asked, because this is the one button here that destroys work and there is no undo for it. */
    if (window.confirm("Discard the unfinished tracing kept in this browser? It has not been added "
      + "to the dataset, and this cannot be undone.")) draftClear();
  });
}''',
     u'''/* ── THE LIST, WHICH IS THE POINT OF THE WHOLE CHANGE ──────────────────────────  2026-09-19
   Søren: *"so they can be easily found and continued."* Found means seeing all of them with enough
   on each row to tell them apart -- what it is, how much of it there is, and when it was left --
   and continued means a Resume on every one rather than only on the last.

   The row for the draft the pad is CURRENTLY writing to says so instead of offering to resume
   itself, which would be a button that appears to do something and does nothing. */
function draftRender(){
  const bar = document.getElementById("tracingDraftBar");
  if (!bar) return;
  const list = draftStore.list();
  if (!list.length){ bar.style.display = "none"; bar.innerHTML = ""; return; }
  const wrap = document.getElementById("tracePadWrap");
  const open = wrap && wrap.style.display !== "none";
  const here = TRACING_DRAFT_ID;
  bar.style.display = "";
  bar.innerHTML = '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;'
      + 'color:var(--mut);margin-bottom:6px">Unfinished tracings kept in this browser'
      + (list.length > 1 ? " (" + list.length + ")" : "") + '</div>'
    + list.map(function(d){
        const zs = {};
        (d.rings || []).forEach(function(r){ zs[r.z] = 1; });
        const nz = Object.keys(zs).length;
        const mine = d.id === here && open;
        return '<div class="row" style="gap:8px;align-items:baseline;flex-wrap:wrap;'
            + 'margin-bottom:4px">'
          + '<span style="flex:1 1 200px;min-width:0;font-size:13px'
            + (mine ? ';color:var(--accent)' : '') + '">' + escHtml(d.title || "Unfinished tracing")
            + (d.editId ? ' <span class="hint">(a version of one already in the dataset)</span>' : '')
            + '</span>'
          + '<span class="hint" style="flex:0 0 auto">' + (d.rings || []).length + ' contour'
            + ((d.rings || []).length === 1 ? '' : 's') + ' on ' + nz + ' section'
            + (nz === 1 ? '' : 's') + ', ' + escHtml(draftWhen(d.at)) + '</span>'
          + (mine
              ? '<span class="hint" style="flex:0 0 auto">on the pad now</span>'
              : '<button type="button" class="hist-chip draftres" data-id="' + escHtml(d.id) + '">'
                + 'Resume it</button>')
          + '<button type="button" class="hist-chip draftdrop" data-id="' + escHtml(d.id) + '">'
            + 'Discard</button>'
          + '</div>';
      }).join("");
  [].slice.call(bar.querySelectorAll(".draftres")).forEach(function(b){
    b.addEventListener("click", function(){ draftResume(b.dataset.id); });
  });
  [].slice.call(bar.querySelectorAll(".draftdrop")).forEach(function(b){
    b.addEventListener("click", function(){
      const d = draftStore.get(b.dataset.id);
      /* Asked, because this is the one button here that destroys work and there is no undo for it
         -- and it names the one being discarded, now that there is more than one to confuse. */
      if (window.confirm("Discard \\u201c" + ((d && d.title) || "this unfinished tracing")
        + "\\u201d? It has not been added to the dataset, and this cannot be undone."))
        draftClear(b.dataset.id);
    });
  });
}''',
     "the bar becomes a list with a Resume on every row"),

    (u'''function draftResume(){
  const d = draftRead();
  if (!d) return;''',
     u'''function draftResume(id){
  /* THE ID IS ADOPTED, not replaced: saving from here on updates the draft that was resumed rather
     than growing a second copy of the same work on the next autosave. */
  const d = id ? draftStore.get(id) : draftRead();
  if (!d) return;
  TRACING_DRAFT_ID = d.id || draftCurrentId();''',
     "...and resuming one adopts its id instead of starting another"),
]

FRESH = [
    (u'''  PAD_EDIT_ID = ""; tracingPendingClear(); PAD3D_MESHES = null; PAD3D_KEY = "";''',
     u'''  /* A FRESH PAD IS A FRESH DRAFT, 2026-09-19. Without this the next tracing would save itself
     over the last one's draft entry -- which is the single-slot behaviour this change exists to
     end, reintroduced one level down. */
  TRACING_DRAFT_ID = "";
  PAD_EDIT_ID = ""; tracingPendingClear(); PAD3D_MESHES = null; PAD3D_KEY = "";''',
     "a fresh pad starts a fresh draft rather than reusing the last one's"),
]


def edit(rel, pairs):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    print(rel)
    for old, new, why in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + why)
            continue
        assert not (new in s and old in s), "AMBIGUOUS: " + why
        assert old in s, "NOT FOUND: " + why
        assert s.count(old) == 1, "ambiguous (%d): %s" % (s.count(old), why)
        s = s.replace(old, new, 1)
        print("  ok: " + why)
    io.open(p, "w", encoding="utf-8").write(s)


edit("ujump.html", STORE + NOW + RENDER + FRESH)
print("\nnow: node draftlistcheck.js && node tracingpanelcheck.js && node tracingcarrycheck.js "
      "&& python3 src/build_stamps.py")
