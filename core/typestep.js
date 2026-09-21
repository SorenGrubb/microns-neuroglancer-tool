/* core/typestep.js — Previous / Next of the same type, on the identity card.          2026-09-21

   Søren: "Now do the Next/previous buttons on µJump's identity card. But implement it for all
   tools." The ask it finishes, from µJump: buttons on the identity card that step to the next cell
   of the SAME TYPE. Asked how, he chose:
     - a FIXED LIST with a counter -- "Astrocyte · 3 of 57" -- walked in order and wrapping at the
       ends, so every cell of a type can be visited exactly once;
     - the type is THE NAME ON THE CARD, by the precedence the tool already uses for the card, the
       Browse picker and the Filter (own verified call, then the community's, then the dataset's).

   ONE ROW, OWNED HERE, PUT ON THE CARD FROM OUTSIDE. The cards are rebuilt wholesale on every jump
   (innerHTML, three branches on µJump alone), so rather than teach each render branch to include
   a row, this module watches the card and puts the row back whenever the card is rebuilt without
   it -- and replaces it when the cell on the card is no longer the one the row was drawn for. The
   card code is untouched on every tool; each tool supplies three answers:

     UJ.cfg.typestep = {
       panel:  "nucpanel" | () -> element      where the row goes (first thing in it)
       rows:   () -> [{key, label, pos, ...}] | null
               every cell that HAS a type, in the order to walk them. key groups them (so it must
               already be normalised); label is what the counter prints; pos is the cell's voxel,
               which is how the cell on the card is recognised (window.CUR_POS, which every tool
               sets for the tracing card). null = "not ready yet", asked again shortly.
       go:     (row) -> void                     show that cell on the card
     }

   µJump, δJump and πJump need no config at all: their Filter already builds exactly this list
   (buildAllIdentities: own, then community, then the dataset's prediction, one row per identified
   cell including own-verified cells placed by position and merged-nucleus sub-cells), and
   core/stepthrough.js already walks it with rowPos + jumpToVoxel. The default below uses those.

   ωJump is not a client: its identify card already has "Walk through <a cell type>" with back,
   next and "3 of 12" -- the same feature, built first, and left as it is.

   WHAT THE ROW DOES NOT DO. It never draws on a card whose cell has no type (nothing to step
   through), and it does not reorder or filter anything: the walk is the tool's own list. */
var UJ = UJ || {};
(function(){
  if (typeof window === "undefined" || typeof document === "undefined") return;

  function cfg(){ return (UJ.cfg && UJ.cfg.typestep) || {}; }

  /* ── the default: µJump, δJump, πJump ─────────────────────────────────────────────────────── */
  function defaultRows(){
    if (typeof window.buildAllIdentities !== "function" || typeof window.rowPos !== "function") return null;
    var all = window.buildAllIdentities();
    if (!all) return null;
    var ln = (typeof longName === "function") ? longName : function(s){ return s; };
    var out = [];
    for (var k = 0; k < all.length; k++){
      var r = all[k];
      if (!r || !r.type) continue;
      var label = String(ln(r.type) || r.type).trim();
      if (!label || /^unclassified$/i.test(label)) continue;
      out.push({ key: label.toLowerCase(), label: label, pos: window.rowPos(r), ref: r });
    }
    return out;
  }
  function defaultGo(row){
    if (typeof jumpToVoxel === "function") jumpToVoxel(row.pos[0], row.pos[1], row.pos[2]);
  }
  function rowsNow(){ var f = cfg().rows || defaultRows; try { return f(); } catch (e){ return null; } }
  function goNow(row){ (cfg().go || defaultGo)(row); }
  function panelEl(){
    var p = cfg().panel || (UJ.cfg && UJ.cfg.stepthrough && UJ.cfg.stepthrough.nucPanelId) || "nucpanel";
    return typeof p === "function" ? p() : document.getElementById(p);
  }

  /* Grouped once per list. A tool that rebuilds its list returns a NEW array, which is what makes
     the cache miss -- µJump's buildAllIdentities() returns the same array until the community's
     identifications arrive and it is thrown away. */
  var CACHE = { rows: null, groups: null, at: null };
  function index(rows){
    if (CACHE.rows === rows) return CACHE;
    var groups = {}, at = {};
    rows.forEach(function(r, i){
      (groups[r.key] = groups[r.key] || []).push(i);
      if (r.pos){
        var pk = r.pos.map(Math.round).join(",");
        if (!(pk in at)) at[pk] = i;
      }
    });
    CACHE = { rows: rows, groups: groups, at: at };
    return CACHE;
  }

  /* The last step taken: two rows can share a position (merged-nucleus sub-cells sit on their
     parent's voxel), and position alone would put the counter back on the first of them and make
     Next go round in a circle. */
  var LAST = null;

  function currentOf(rows){
    var cp = window.CUR_POS;
    if (!cp || cp.length !== 3) return -1;
    var ix = index(rows);
    if (LAST && rows[LAST.i] && rows[LAST.i].key === LAST.key && rows[LAST.i].pos
        && near(rows[LAST.i].pos, cp)) return LAST.i;
    var pk = cp.map(Math.round).join(",");
    if (pk in ix.at) return ix.at[pk];
    /* Within a voxel on every axis, for a tool whose CUR_POS is a rounded copy. */
    for (var i = 0; i < rows.length; i++) if (rows[i].pos && near(rows[i].pos, cp)) return i;
    return -1;
  }
  function near(a, b){
    return Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1 && Math.abs(a[2] - b[2]) <= 1;
  }

  function esc(s){ return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                                                     .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

  /* What the row is drawn for, so a rebuilt card with the same cell keeps its row and a card that
     now shows another cell gets a new one. */
  function stamp(rows, i){ return i < 0 ? "" : rows[i].key + "|" + i + "|" + index(rows).groups[rows[i].key].length; }

  function render(){
    var host = panelEl();
    if (!host || !host.firstChild) return;              // an empty card has no cell on it
    var rows = rowsNow();
    if (!rows) return;                                   // not ready: the poll asks again
    /* Anywhere in the card, not only at its top: µJump's card fold moves everything above the
       type into a <summary> after the card is drawn, row included. */
    var olds = host.querySelectorAll(".typestep");
    var i = currentOf(rows), want = stamp(rows, i);
    if (olds.length === 1 && olds[0].getAttribute("data-stamp") === want) return;
    for (var k = 0; k < olds.length; k++) olds[k].parentNode.removeChild(olds[k]);
    if (i < 0) return;
    var g = index(rows).groups[rows[i].key], at = g.indexOf(i), n = g.length;
    var label = rows[i].label;
    var div = document.createElement("div");
    div.className = "typestep";
    div.setAttribute("data-stamp", want);
    div.setAttribute("role", "navigation");
    div.setAttribute("aria-label", "Other cells of this type");
    div.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px;"
      + "padding:0 0 8px;border-bottom:1px solid var(--line);font-size:13px";
    var one = n < 2;
    div.innerHTML =
        "<button type='button' class='idbtn tsprev' style='width:auto;padding:4px 10px;font-size:12px'"
      + (one ? " disabled" : "") + " title='The previous " + esc(label) + " in this dataset"
      + " (goes round to the last from the first)'>&larr; Previous</button>"
      + "<span class='tscount' style='flex:1 1 auto;text-align:center'><b>" + esc(label) + "</b> &middot; "
      + (at + 1).toLocaleString() + " of " + n.toLocaleString()
      + (one ? " <span class='hint'>&mdash; the only one identified here</span>" : "") + "</span>"
      + "<button type='button' class='idbtn tsnext' style='width:auto;padding:4px 10px;font-size:12px'"
      + (one ? " disabled" : "") + " title='The next " + esc(label) + " in this dataset"
      + " (goes round to the first from the last)'>Next &rarr;</button>";
    host.insertBefore(div, host.firstChild);
    div.querySelector(".tsprev").addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); stepBy(-1); });
    div.querySelector(".tsnext").addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); stepBy(1); });
  }

  /* Wraps at both ends: a fixed list you can walk round, as chosen. */
  function stepBy(d){
    var rows = rowsNow(); if (!rows) return;
    var i = currentOf(rows); if (i < 0) return;
    var g = index(rows).groups[rows[i].key], at = g.indexOf(i);
    if (g.length < 2) return;
    var j = g[(at + d + g.length) % g.length];
    LAST = { i: j, key: rows[j].key };
    goNow(rows[j]);
    render();
  }

  /* The card is rebuilt on every jump, and parts of it again when slow reads come back. One
     observer on the card's parent -- the card itself can be replaced or moved (core/stepthrough.js
     moves it under the step-through list) -- and a short debounce, so a burst of rebuilds is one
     render. Plus a slow poll, for a list that changes without the card changing: µJump's community
     identifications arrive seconds after the card is drawn. */
  var T = null, OBS = null, WATCHED = null;
  function schedule(){ if (T) return; T = setTimeout(function(){ T = null; render(); }, 60); }
  function watch(){
    var host = panelEl();
    if (!host || host === WATCHED) return;
    if (OBS) OBS.disconnect();
    OBS = new MutationObserver(function(ms){
      /* Our own row going in is not a reason to draw it again. */
      for (var k = 0; k < ms.length; k++){
        var added = ms[k].addedNodes, own = added.length === 1 && added[0].className === "typestep";
        if (!own){ schedule(); return; }
      }
    });
    OBS.observe(host, { childList: true, subtree: true });
    WATCHED = host;
  }
  function start(){
    watch(); schedule();
    setInterval(function(){ watch(); schedule(); }, 2500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  UJ.typestep = { refresh: schedule, step: stepBy, _rows: rowsNow, _current: function(){
    var r = rowsNow(); return r ? currentOf(r) : -1; } };
})();
