# -*- coding: utf-8 -*-
u"""One tracing that is really two objects, found and reported.                          2026-10-08

Søren, reading box 1's TRACINGS block: *"Or.. is there some mistake also here with the different
tracings belonging to the right cell?"*

There is, and it is not the export this time -- it is in the saved geometry. Two of the Nucleus
structures in that dump carry contours in two places at once:

    Nucleus (cell 61360735)   x~400300 y~231220   and   x~401000 y~230900    ~3.1 um apart
    Nucleus (z 1861-1910)     x~426550 y~220300   and   x~427380 y~220160    ~3.4 um apart

On the first, z 321, 322, 324, 327 and 330 each carry two contours, and from 324 on the second
sits about 700 voxels away in x and stays there. That is not a hole -- a hole is nested INSIDE its
parent, which is the tool's own rule -- and it is too far and too consistent to be one lobed
nucleus. The panel already said as much without anyone reading it that way: `Nucleus · 88.84 um³ ·
52 contours on 34 sections` is 18 sections carrying a second contour.

THE MEASUREMENT HAS NOTHING TO TUNE. Every contour has its own equivalent radius, sqrt(area/pi).
Two contours belong to the same object when they touch -- centre-to-centre distance under the sum
of their two radii. Build a minimum spanning tree over the contours with every distance divided by
that sum, and the largest edge in it IS the answer: under 1 the outline is a chain of contours that
all touch, over 1 it is two pieces separated by more than their own reach, and the number says by
how much. No threshold was chosen, and it scales itself -- a 10 um cell and a 0.2 um vesicle are
each judged against their own size. Cutting that one edge gives exactly the two halves, so the
report can name both.

Deliberately NOT flagged: a long cell whose outline drifts half a micron a section (an endothelial
cell along a vessel is exactly that shape, and flagging it would make the report useless), and a
contour drawn inside another, which is a hole.

REPORT ONLY. Nothing is repaired and nothing is rewritten. Søren, 2026-10-06, on an earlier offer
to repair his tracings: *"Why would I want to do that? That does not help me."* This says which
outlines to look at; what to do about one is his call, at the pad.

WHERE IT SHOWS
  core/tracing.js        splitOf(rings, resNm) -- the measurement, once, where every file can ask.
  core/tracedoutlines.js tracedSplitScan() -- the whole dataset, read in batches, worst first.
  core/tracingcard.js    the button under "In the dataset, by cell", and the list it writes.
  core/panel.js          a warning on the row itself, wherever the contours are already in hand --
                         which since this morning includes the whole cell and the nucleus.

Check: splitcheck.js (new)
Run: python3 src/one_tracing_that_is_really_two.py
     python3 src/build_stamps.py
     node splitcheck.js
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


# ── 1. the measurement ────────────────────────────────────────────────────────────────────────
SPLIT = u'''  /* ── IS THIS ONE OBJECT? ─────────────────────────────  2026-10-08
     Søren, reading his own Blender notebook: *"is there some mistake also here with the
     different tracings belonging to the right cell?"* One of his Nucleus outlines carries contours
     around x 400300 AND around x 401000, on the same sections, 3 um apart. 52 contours on 34
     sections is 18 sections with a second contour in them.

     NO THRESHOLD IS CHOSEN HERE. Each contour gets its own equivalent radius, sqrt(area/pi), so
     "touching" means centre-to-centre distance under the sum of two radii. A minimum spanning tree
     over the contours, with every distance divided by that sum, has a largest edge, and that edge
     is the answer: under 1 the outline is a chain of contours that all touch; over 1 it is two
     pieces further apart than their own reach, and the number says by how much. It scales itself,
     so a 10 um cell and a 0.2 um vesicle are each judged against their own size. Removing that one
     edge from a tree leaves exactly two components, which is why both halves can be named.

     A contour drawn inside another has the same centre, so a hole is distance zero and never
     splits anything. A cell whose outline drifts across sections stays one piece as long as
     consecutive contours overlap, which is what a cell followed section by section does.

     REPORTS. It does not change a tracing, and nothing in this project calls it in a way that
     could. See src/one_tracing_that_is_really_two.py. */
  function ringGeom(r, RX, RY, RZ){
    var p = (r && r.points) || [], n = p.length;
    if (n < 3) return null;
    var a2 = 0, gx = 0, gy = 0;
    for (var i = 0; i < n; i++){
      var q = p[i], w = p[(i + 1) % n];
      var cr = Number(q[0]) * Number(w[1]) - Number(w[0]) * Number(q[1]);
      a2 += cr; gx += (Number(q[0]) + Number(w[0])) * cr; gy += (Number(q[1]) + Number(w[1])) * cr;
    }
    var cx, cy;
    if (a2 !== 0){ cx = gx / (3 * a2); cy = gy / (3 * a2); }
    else {
      cx = 0; cy = 0;
      for (var k = 0; k < n; k++){ cx += Number(p[k][0]); cy += Number(p[k][1]); }
      cx /= n; cy /= n;
    }
    /* The radius of a circle of the same area, in nanometres. x and y are the same size in every
       volume this family reads; the average is written out so a dataset where they differ gets a
       sensible number rather than silently using one of them. */
    return { vx: cx, vy: cy, vz: Number(r.z),
             x: cx * RX, y: cy * RY, z: Number(r.z) * RZ,
             rad: Math.sqrt(Math.abs(a2) / 2 / Math.PI) * ((RX + RY) / 2) };
  }
  function splitOf(rings, resNm){
    var RX = 1, RY = 1, RZ = 1;
    if (Array.isArray(resNm) && resNm.length === 3){
      RX = Number(resNm[0]) || 1; RY = Number(resNm[1]) || 1; RZ = Number(resNm[2]) || 1;
    }
    var g = [];
    (rings || []).forEach(function(r){ var x = ringGeom(r, RX, RY, RZ); if (x) g.push(x); });
    var n = g.length;
    if (n < 2) return { split: false, ratio: 0, gapNm: 0, clusters: [], contours: n };
    var pair = function(a, b){
      var dx = g[a].x - g[b].x, dy = g[a].y - g[b].y, dz = g[a].z - g[b].z;
      var d = Math.sqrt(dx * dx + dy * dy + dz * dz), reach = g[a].rad + g[b].rad;
      return { ratio: reach > 0 ? d / reach : (d > 0 ? Infinity : 0), gap: d - reach };
    };
    /* Prim, because n is a few hundred at most and an O(n²) tree needs no heap. */
    var inT = [], best = [], from = [], i, j;
    for (i = 0; i < n; i++){ inT.push(false); best.push(Infinity); from.push(-1); }
    best[0] = 0;
    var edges = [];
    for (var it = 0; it < n; it++){
      var pick = -1, pb = Infinity;
      for (var k = 0; k < n; k++) if (!inT[k] && best[k] < pb){ pb = best[k]; pick = k; }
      if (pick < 0) break;
      inT[pick] = true;
      if (from[pick] >= 0) edges.push({ a: from[pick], b: pick, ratio: best[pick] });
      for (j = 0; j < n; j++){
        if (inT[j]) continue;
        var v = pair(pick, j).ratio;
        if (v < best[j]){ best[j] = v; from[j] = pick; }
      }
    }
    var worst = null;
    edges.forEach(function(e){ if (!worst || e.ratio > worst.ratio) worst = e; });
    if (!worst) return { split: false, ratio: 0, gapNm: 0, clusters: [], contours: n };
    var gapNm = pair(worst.a, worst.b).gap;
    /* A tree minus one edge is exactly two components. */
    var adj = [];
    for (i = 0; i < n; i++) adj.push([]);
    edges.forEach(function(e){
      if (e === worst) return;
      adj[e.a].push(e.b); adj[e.b].push(e.a);
    });
    var mark = [];
    for (i = 0; i < n; i++) mark.push(-1);
    var label = 0;
    for (i = 0; i < n; i++){
      if (mark[i] >= 0) continue;
      var stack = [i]; mark[i] = label;
      while (stack.length){
        var c = stack.pop();
        adj[c].forEach(function(q){ if (mark[q] < 0){ mark[q] = label; stack.push(q); } });
      }
      label++;
    }
    var parts = [];
    for (var L = 0; L < label; L++){
      var idx = [];
      for (i = 0; i < n; i++) if (mark[i] === L) idx.push(i);
      if (!idx.length) continue;
      var sx = 0, sy = 0, zs = {}, zmin = Infinity, zmax = -Infinity, rmax = 0;
      idx.forEach(function(q){
        sx += g[q].vx; sy += g[q].vy; zs[g[q].vz] = 1;
        if (g[q].vz < zmin) zmin = g[q].vz;
        if (g[q].vz > zmax) zmax = g[q].vz;
        if (g[q].rad > rmax) rmax = g[q].rad;
      });
      parts.push({ contours: idx.length, sections: Object.keys(zs).length,
                   centre: [Math.round(sx / idx.length), Math.round(sy / idx.length),
                            Math.round((zmin + zmax) / 2)],
                   zFrom: zmin, zTo: zmax, radiusNm: Math.round(rmax) });
    }
    parts.sort(function(a, b){ return b.contours - a.contours; });
    return { split: worst.ratio > 1, ratio: worst.ratio, gapNm: gapNm,
             clusters: parts, contours: n };
  }
'''

OLD_EXPORT = u'''  return { coordKey: coordKey, cellOf: cellOf, sameCell: sameCell,
           sameCellWhy: sameCellWhy,
           elsewhereByCoord: elsewhereByCoord,'''
NEW_EXPORT = (SPLIT
              + u'''  return { coordKey: coordKey, cellOf: cellOf, sameCell: sameCell,
           sameCellWhy: sameCellWhy, splitOf: splitOf,
           elsewhereByCoord: elsewhereByCoord,''')

edit("core/tracing.js", [
    (u"splitOf, and it is on the module", OLD_EXPORT, NEW_EXPORT),
])

# ── 2. the whole dataset, read once ───────────────────────────────────────────────────────────
SCAN = u'''
/* ── EVERY OUTLINE, ASKED THE SAME QUESTION ─────────────────  2026-10-08
   Søren: *"is there some mistake also here with the different tracings belonging to the right
   cell?"* — after finding a Nucleus whose contours sit in two places 3 um apart. One is worth
   knowing about; the set is worth knowing about more, because he cannot look at 70 of them by eye.

   The index (?tracings=1) is one sheet scan and carries no contours, so the geometry comes through
   UJ.tracing.fetchMany — 20 to a request, the same path the cell panel and the viewer already
   use, and cached by structureId|groupId for the session. Nothing is written. See
   src/one_tracing_that_is_really_two.py. */
async function tracedSplitScan(say, opts){
  opts = opts || {};
  if (typeof REPORT_ENDPOINT === "undefined" || !REPORT_ENDPOINT)
    return { error: "this page has no backend configured" };
  let index = [];
  try {
    say && say("Listing the dataset\\u2019s outlines\\u2026");
    const r = await fetch(REPORT_ENDPOINT + "?tracings=1" + tracedOutlinesDsQS());
    const d = await r.json();
    if (!d || !Array.isArray(d.tracings))
      return { error: "the backend did not answer with a list of outlines" };
    index = d.tracings;
  } catch (e){
    return { error: "could not list the outlines (" + String(e && e.message || e) + ")" };
  }
  const who = String(opts.only || "").trim().toLowerCase();
  const want = index.filter(function(t){
    if (!t || !t.structureId) return false;
    if (!who) return true;
    return [].concat(t.contributors || [], [t.tracedBy || ""]).join(" ").toLowerCase()
             .indexOf(who) >= 0;
  });
  if (!want.length) return { looked: 0, rows: [], unread: [] };
  const res = (window.UJ && UJ.cfg && UJ.cfg.res) || null;
  let got;
  try {
    got = await UJ.tracing.fetchMany(REPORT_ENDPOINT, want, tracedOutlinesDsQS(),
      function(done, total){ say && say("Reading contours \\u2014 " + done + " of " + total + "\\u2026"); });
  } catch (e){
    return { error: "could not read the contours (" + String(e && e.message || e) + ")" };
  }
  const rows = [], unread = [];
  want.forEach(function(t){
    const x = got[t.structureId];
    if (!x || !x.st || !(x.st.rings || []).length){ unread.push(t.structureId); return; }
    let s;
    try { s = UJ.tracing.splitOf(x.st.rings, res); } catch (_e){ unread.push(t.structureId); return; }
    if (s.split) rows.push({ t: t, st: x.st, split: s });
  });
  /* Worst first: the ratio IS how far apart the two halves are in units of their own size, so the
     top of this list is the one least likely to be a real shape. */
  rows.sort(function(a, b){ return b.split.ratio - a.split.ratio; });
  return { looked: want.length, rows: rows, unread: unread };
}
window.tracedSplitScan = tracedSplitScan;
'''

OLD_ANCHOR = u'''window.tracedMeasureAndSave = tracedMeasureAndSave;'''
edit("core/tracedoutlines.js", [
    (u"tracedSplitScan walks the dataset", OLD_ANCHOR, SCAN + u"\n" + OLD_ANCHOR),
])

# ── 3. one sentence, and the button that writes the list ──────────────────────────────────────
SAY = u'''/* ── WHAT ONE SPLIT OUTLINE READS AS ───────────────────────  2026-10-08
   One sentence, in one place, so the row in the dataset list, the warning on the cell panel and
   anything later all say the same thing about the same number. "" when the outline is one piece.
   See src/one_tracing_that_is_really_two.py. */
function tracingSplitSay(st, resNm){
  var s;
  try {
    s = UJ.tracing.splitOf((st && (st.rings || st)) || [],
                           resNm || (window.UJ && UJ.cfg && UJ.cfg.res) || null);
  } catch (_e){ return ""; }
  if (!s || !s.split) return "";
  var um = function(nm){ return (Math.round(Number(nm) / 100) / 10) + " \\u00b5m"; };
  return "In " + s.clusters.length + " pieces that do not touch: "
    + s.clusters.map(function(c){
        return c.contours + " contour" + (c.contours === 1 ? "" : "s") + " at " + c.centre.join(", ");
      }).join(" and ")
    + " \\u2014 " + um(s.gapNm) + " apart, " + (Math.round(s.ratio * 10) / 10)
    + "\\u00d7 their own reach.";
}
'''

OLD_RS = u'''function tracingRenderShared(){
  const host = document.getElementById("tracingShared");
  if (!host) return;'''
NEW_RS = SAY + u'''function tracingRenderShared(){
  const host = document.getElementById("tracingShared");
  if (!host) return;'''

OLD_HTML = u'''  host.innerHTML = '<label>In the dataset, by cell — open one to add to it or correct it</label>'
    + groups.map(function(g, gi){'''
NEW_HTML = u'''  /* ── AND THE ONE QUESTION THE LIST CANNOT ANSWER BY ITSELF ─────  2026-10-08
     The index carries names, counts and cells, not contours, so "is this outline one object" needs
     the geometry — a read per structure. A button, not an automatic scan: it is dozens of Drive
     reads, and a page that spends them without being asked is a page that is slow for everyone who
     did not want this. REPORTS ONLY; nothing is changed by pressing it. */
  const splitBox = '<div style="border:1px solid var(--line);border-radius:7px;padding:8px 10px;'
    + 'margin:6px 0 10px 0">'
    + '<button class="idbtn" id="tracingSplitGo" ' + TRACING_BTN + ' title="Reads every outline\\u2019s '
    + 'contours and reports any whose contours sit in two places that do not touch \\u2014 one tracing '
    + 'holding two objects. Nothing is changed: this is a list of what to look at.">'
    + 'Check outlines for split structures</button>'
    + ' <label style="font-size:11px;color:var(--mut)"><input type="checkbox" id="tracingSplitMine" '
    + 'checked style="width:auto;vertical-align:-1px"> only ones I have drawn on</label>'
    + '<div class="hint" id="tracingSplitSayEl" style="margin-top:5px"></div>'
    + '<div id="tracingSplitOut"></div></div>';
  host.innerHTML = splitBox
    + '<label>In the dataset, by cell — open one to add to it or correct it</label>'
    + groups.map(function(g, gi){'''

OLD_WIRE = u'''  [].slice.call(host.querySelectorAll(".tracedmeasurecell")).forEach(function(b){'''
NEW_WIRE = u'''  {
    const go = host.querySelector("#tracingSplitGo");
    if (go) go.addEventListener("click", function(){ tracingSplitRun(go); });
  }
  [].slice.call(host.querySelectorAll(".tracedmeasurecell")).forEach(function(b){'''

RUN = u'''
/* The button's half: ask, then write what came back. Each row names the outline, the cell it is
   filed against, and both halves with a coordinate to jump to — because "this one is wrong" is
   only useful if you can get to it. 2026-10-08. */
async function tracingSplitRun(btn){
  const sayEl = document.getElementById("tracingSplitSayEl");
  const out = document.getElementById("tracingSplitOut");
  const say = function(m){ if (sayEl) sayEl.textContent = m; };
  if (typeof window.tracedSplitScan !== "function"){
    say("This page does not have core/tracedoutlines.js loaded, so there is nothing to read.");
    return;
  }
  const mine = document.getElementById("tracingSplitMine");
  /* REPORTER_NAME is what every share writes into the sheet's reporterName, so it is the string
     the index can actually be matched on. Signed out it is empty, and the tick then does nothing
     rather than silently matching everything or nothing \u2014 the label says so. */
  const who = (typeof REPORTER_NAME !== "undefined" && REPORTER_NAME) ? String(REPORTER_NAME) : "";
  const only = (mine && mine.checked && who) ? who : "";
  if (mine) mine.disabled = !who;
  const was = btn ? btn.textContent : "";
  if (btn){ btn.disabled = true; btn.textContent = "Reading\\u2026"; }
  if (out) out.innerHTML = "";
  let r;
  try { r = await window.tracedSplitScan(say, { only: only }); }
  catch (e){ r = { error: String(e && e.message || e) }; }
  if (btn){ btn.disabled = false; btn.textContent = was; }
  if (!r || r.error){ say("Nothing was read \\u2014 " + ((r && r.error) || "unknown error") + "."); return; }
  const n = (r.rows || []).length;
  say(n
    ? n + " of " + r.looked + " outline" + (r.looked === 1 ? "" : "s") + " are in more than one "
      + "piece. Worst first. Nothing has been changed \\u2014 open one in the pad to correct it."
      + (r.unread.length ? " " + r.unread.length + " could not be read." : "")
    : "All " + r.looked + " outline" + (r.looked === 1 ? " is" : "s are") + " one piece."
      + (r.unread.length ? " " + r.unread.length + " could not be read." : ""));
  if (!out || !n) return;
  out.innerHTML = r.rows.map(function(x, i){
    const t = x.t, s = x.split;
    const where = s.clusters.map(function(c){
      return '<button class="idbtn tracingsplitjump" data-at="' + c.centre.join(",") + '" '
        + 'style="padding:1px 7px;font-size:11px" title="Put this piece\\u2019s centre in the '
        + 'coordinate boxes.">' + c.contours + ' at ' + c.centre.join(", ") + '</button>';
    }).join(" ");
    return '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;'
      + 'border-top:1px solid var(--line);padding:5px 0">'
      + '<span style="width:11px;height:11px;border-radius:2px;flex:0 0 auto;background:'
        + escHtml(t.color || "#3a6b5a") + '"></span>'
      + '<b style="flex:0 0 auto">' + escHtml(t.name || t.structureId) + '</b>'
      + '<span style="opacity:.7;flex:0 0 auto">' + escHtml(tracingCellHeadPlain(t)) + '</span>'
      + '<span style="flex:0 0 auto">' + (Math.round(s.ratio * 10) / 10) + '\\u00d7 apart</span>'
      + where
      + '<button class="idbtn tracingsplitopen" data-sid="' + escHtml(t.structureId) + '" '
        + 'style="padding:1px 7px;font-size:11px" title="Open this outline in the pad, as it is, '
        + 'so you can correct it and share the corrected version.">Open in the pad</button>'
      + '</div>';
  }).join("");
  [].slice.call(out.querySelectorAll(".tracingsplitjump")).forEach(function(b){
    b.addEventListener("click", function(){
      const p = String(b.dataset.at || "").split(",");
      ["tracingX", "tracingY", "tracingZ"].forEach(function(id, k){
        const el = document.getElementById(id);
        if (el && p[k] !== undefined) el.value = String(p[k]).trim();
      });
      tracingSay("Coordinate set to " + p.join(", ") + " \\u2014 this piece of that outline.");
    });
  });
  [].slice.call(out.querySelectorAll(".tracingsplitopen")).forEach(function(b){
    b.addEventListener("click", function(){ tracingOpenShared(b.dataset.sid, b); });
  });
}
/* The cell a row is filed against, in one short phrase. tracingCellHead builds the rich version
   for the per-cell headings; this is the same facts without the markup. */
function tracingCellHeadPlain(t){
  const at = (t && (t.cellCoord || t.cell_coord)) || "";
  if (at) return "cell at " + at;
  const nuc = String((t && (t.nucleusId || t.nucleus_id)) || "");
  if (nuc) return "nucleus " + nuc;
  const root = String((t && (t.rootId || t.root_id)) || "");
  return root ? "segment " + root : "no cell";
}
'''

OLD_TAIL = u'''/* window.tracedMeasureAll() has no button on purpose -- see "ONE BUTTON, NOT TWO" above. */'''
edit("core/tracingcard.js", [
    (u"tracingSplitSay, one sentence in one place", OLD_RS, NEW_RS),
    (u"the button above the per-cell list", OLD_HTML, NEW_HTML),
    (u"...wired", OLD_WIRE, NEW_WIRE),
    (u"...and what it writes", OLD_TAIL, RUN + u"\n" + OLD_TAIL),
])

# ── 4. and on the row itself, where the contours are already in hand ──────────────────────────
NOTE = u'''/* ── AND A ROW SAYS SO WHERE THE CONTOURS ARE IN HAND ────────  2026-10-08
   The scan in the tracing card reads the whole dataset on a button; this costs nothing, because
   the Organelles section has already fetched these contours to pair them. Warning only — the
   number is the same one tracingSplitSay prints, from the same function. */
function organSplitNote(t){
  if (!t || !(t.rings || []).length) return "";
  if (!(window.UJ && UJ.tracing && typeof UJ.tracing.splitOf === "function")) return "";
  var s;
  try { s = UJ.tracing.splitOf(t.rings, (UJ.cfg && UJ.cfg.res) || null); } catch (_e){ return ""; }
  if (!s || !s.split) return "";
  var um = (Math.round(Number(s.gapNm) / 100) / 10);
  return '<span style="flex:0 0 auto;color:var(--warn)" title="Its contours sit in '
    + s.clusters.length + ' groups that do not touch — '
    + s.clusters.map(function(c){ return c.contours + ' at ' + c.centre.join(", "); }).join(" and ")
    + ', ' + um + ' µm apart, ' + (Math.round(s.ratio * 10) / 10) + '× their own reach. '
    + 'That is usually two objects saved as one outline. Nothing has been changed; open it in '
    + 'µJump’s tracing card to correct it.">⚠ in ' + s.clusters.length
    + ' pieces, ' + um + ' µm apart</span>';
}
function renderOrganelleSection(nid, root){'''

edit("core/panel.js", [
    (u"organSplitNote", u"function renderOrganelleSection(nid, root){", NOTE),
    (u"...on the cell's own whole cell and nucleus, above",
     u'''            + '</b>' + panelEsc(vol(t.volumeUm3)) + '</span>'
            + '<span style="opacity:.7;flex:0 0 auto">' + (t.contours || 0) + " contour"''',
     u'''            + '</b>' + panelEsc(vol(t.volumeUm3)) + '</span>'
            + organSplitNote(t)
            + '<span style="opacity:.7;flex:0 0 auto">' + (t.contours || 0) + " contour"'''),
    (u"...on a paired organelle row",
     u'''      + (organVol(t.volumeUm3) ? '<span style="flex:0 0 auto">' + organVol(t.volumeUm3)
          + ' \u00b5m\u00b3</span>' : "")
      + '<span style="opacity:.7;flex:0 0 auto">' + (t.contours || 0) + " contour"''',
     u'''      + (organVol(t.volumeUm3) ? '<span style="flex:0 0 auto">' + organVol(t.volumeUm3)
          + ' \u00b5m\u00b3</span>' : "")
      + organSplitNote(t)
      + '<span style="opacity:.7;flex:0 0 auto">' + (t.contours || 0) + " contour"'''),
    (u"...and on an outline nobody has logged",
     u"""      + '<span style="opacity:.7;flex:0 0 auto">outlined, not logged</span>'""",
     u"""      + '<span style="opacity:.7;flex:0 0 auto">outlined, not logged</span>'
      + organSplitNote(t)"""),
    (u"...and the cell's own rows are redrawn when their contours land",
     u'''    PANEL_ORGAN_BUSY = false;
    try { renderOrganelleSection(nid, root); } catch (_e){}''',
     u'''    PANEL_ORGAN_BUSY = false;
    try { renderOrganelleSection(nid, root); } catch (_e){}
    /* The whole cell and the nucleus are fetched with the organelles since this morning, so the
       list above can carry the same warning as the rows below. Its own 60-second cache makes this
       a re-render, not a second read (2026-10-08). */
    try { loadTracedStructures(nid, root); } catch (_e2){}'''),
])
print("done")
