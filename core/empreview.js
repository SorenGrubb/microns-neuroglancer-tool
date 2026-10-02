/* core/empreview.js — a coordinate becomes a picture.                              2026-10-02

   Søren: *"I would like that when pasting a coordinate, the EM view in a around 20µm wide image
   shows for that coordinate and the EM view is a neuroglancer link and the coordinate is written in
   the top left corner and there is a scalebar. There should also be buttons to add the 3D view of
   the segmentation next to the em view of the nearest cell with a segmentation at that coordinate
   and the nucleus of the cell."*

   A coordinate in a forum post is a promise that something is there. This is the part that keeps
   it: the tissue itself, beside the sentence, before anybody opens a viewer.

   ── NOTHING HERE IS NEW MACHINERY ────────────────────────────────────────────────────────────
   core/emtiles.js reads the EM, core/segread.js says which cell is at a point, core/mesh.js and
   core/nucmesh.js fetch the two surfaces and core/mesh3d.js draws them. µJump's cell card has drawn
   this picture since September. What was missing was a way to ask for it ABOUT A COORDINATE rather
   than about the cell the page happens to be on, so that is all this is.

   ── 19.2 µm, AND WHY THAT IS THE CHEAP WIDTH ─────────────────────────────────────────────────
   300 px at the 64 nm level. Measured when the cell card was built: the same 19.2 µm at 32 nm is a
   594×321 window and 60 chunks for a picture the same size on screen, against 15 chunks here. A
   view's cost is its tissue area over the chunk area, so the only cheap way to show more tissue is
   to read data that is already downsampled.

   ── ON CLICK, NEVER ON SIGHT ─────────────────────────────────────────────────────────────────
   Fifteen chunk fetches is nothing once and a lot thirty times. A forum of thirty posts must open
   instantly, so nothing here runs until somebody clicks the coordinate they are curious about. The
   same reason the Discussion tab does not read the forum until it is opened.

   ── AND THE 3D IS A SECOND CLICK AGAIN ───────────────────────────────────────────────────────
   A cell mesh is megabytes. The buttons say what they will fetch, and the cell is looked up only
   when one is pressed — so a reader who only wanted to see the tissue never pays for a segmentation
   lookup either.

   WHAT A HOST DOES
     define  window.emPreviewHost() -> { res, em, seg, nuc, window:{lo,hi}, viewerUrl(pos) }
     call    UJ.empreview.open(hostEl, [x,y,z]);   // draws, returns a promise
             UJ.empreview.close(hostEl);
   A page that cannot answer leaves the hook undefined and open() says so rather than throwing.

   Check: empreviewcheck.js */
var UJ = UJ || {};
(function(){
"use strict";

/* 300 × 162 at MIP 3 (64 nm) = 19.2 × 10.4 µm. See the header for why this is the cheap width. */
var W = 300, H = 162, MIP = 3;

function hostCfg(){
  if (typeof window.emPreviewHost !== "function") return null;
  try { return window.emPreviewHost() || null; } catch (_e){ return null; }
}
function esc(s){
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function say(box, msg, bad){
  var el = box && box.querySelector(".emp-say");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = bad ? "var(--bad)" : "var(--mut)";
}

/* ── THE SCALE BAR ────────────────────────────────────────────────────────────────────────────
   On the picture, not in a caption beside it: a caption is lost the moment somebody screenshots
   the panel into a slide, and this is a picture people will screenshot. A round number of µm, the
   largest that fits in a third of the view, drawn white-on-black-outline so it reads over both
   pale cytoplasm and dark membrane. Lifted from µJump's cell card, which has drawn it since
   2026-09-18; kept identical on purpose, so two pictures of the same tissue agree. */
function scaleBar(cv, view){
  if (!cv || !view) return;
  var nmPerPx = view.effNmPerPx || view.nmPerPx;
  if (!(nmPerPx > 0)) return;
  var NICE = [0.5, 1, 2, 5, 10, 20, 50, 100], want = (view.umAcross || 0) / 3, um = NICE[0], i;
  for (i = 0; i < NICE.length; i++) if (NICE[i] <= want) um = NICE[i];
  var px = um * 1000 / nmPerPx;
  if (!(px > 8) || px > cv.width) return;
  var ctx = cv.getContext("2d");
  var x = 12, y = cv.height - 14, h = 4;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.lineWidth = 3;
  ctx.strokeRect(x, y, px, h);
  ctx.fillStyle = "#fff"; ctx.fillRect(x, y, px, h);
  var label = (um < 1 ? um : Math.round(um)) + " µm";
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.lineWidth = 3;
  ctx.strokeText(label, x + px / 2, y - 5);
  ctx.fillStyle = "#fff"; ctx.fillText(label, x + px / 2, y - 5);
  ctx.restore();
  try { cv.dataset.scaleUm = String(um); } catch (_e){}
}

/* THE COORDINATE, TOP LEFT, ON THE PICTURE for the same reason as the bar: a screenshot of this
   panel should still say where it is. Same outline treatment, so it survives any tissue under it. */
function stampCoord(cv, pos){
  if (!cv || !pos) return;
  var ctx = cv.getContext("2d");
  var label = pos[0] + ", " + pos[1] + ", " + pos[2];
  ctx.save();
  ctx.font = "600 12px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.lineWidth = 3;
  ctx.strokeText(label, 10, 8);
  ctx.fillStyle = "#fff"; ctx.fillText(label, 10, 8);
  ctx.restore();
  try { cv.dataset.coord = label; } catch (_e){}
}

function boxHtml(pos, cfg){
  var label = pos[0] + ", " + pos[1] + ", " + pos[2];
  var url = "";
  try { url = (cfg && typeof cfg.viewerUrl === "function") ? (cfg.viewerUrl(pos) || "") : ""; }
  catch (_e){ url = ""; }
  /* THE PICTURE IS THE LINK. Søren: "the EM view is a neuroglancer link". An anchor around the
     canvas rather than a button beside it -- the thing you want to open is the thing you click,
     and the cursor says so before you commit to a new tab. */
  return '<div class="emp" style="border:1px solid var(--line);border-radius:7px;padding:7px;'
       + 'margin:6px 0;max-width:620px">'
       + '<div style="display:flex;gap:9px;flex-wrap:wrap;align-items:flex-start">'
       + '<div style="flex:0 0 auto">'
       + (url ? '<a class="emp-link" href="' + esc(url) + '" target="_blank" rel="noopener" '
                + 'title="Open this place in Neuroglancer, with both volumes’ imagery and '
                + 'segmentation." style="display:block;line-height:0">' : "")
       + '<canvas class="emp-cv" width="' + W + '" height="' + H + '" '
         + 'style="width:300px;max-width:100%;border-radius:5px;background:#000;cursor:'
         + (url ? "pointer" : "default") + '" title="' + esc(label) + '"></canvas>'
       + (url ? "</a>" : "")
       + "</div>"
       + '<div class="emp-3d" style="flex:1 1 240px;min-width:0"></div>'
       + "</div>"
       + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">'
       + '<button type="button" class="hist-chip emp-cell" title="Looks up the cell whose '
         + 'segmentation covers this exact point, fetches its mesh and draws it beside the EM. The '
         + 'mesh is megabytes, so it is only fetched when you press this.">The cell here in 3D</button>'
       + '<button type="button" class="hist-chip emp-nuc" title="The nucleus of that same cell, '
         + 'from the nuclei volume, drawn in blue inside it.">and its nucleus</button>'
       + '<span class="hint emp-say" style="flex:1 1 140px;min-width:0"></span>'
       + "</div></div>";
}

/* ── WHICH CELL IS AT THIS POINT ──────────────────────────────────────────────────────────────
   Søren asked for "the nearest cell with a segmentation at that coordinate". core/segread.js reads
   the segmentation volume at the voxel itself, which is the strongest possible answer to that: not
   the nearest cell to the point, the cell the point is INSIDE. Where the point is in extracellular
   space the segmentation says 0, and this says so rather than reaching for something nearby --
   a cell named for being close by is a guess presented as a measurement. */
/* How far from the point a nucleus may be and still be called this cell's. A nucleus is about
   10 µm across, so from anywhere in a soma its edge is within a couple of micrometres; 4 µm finds
   it from the cytoplasm without turning the search into a volume read. Out in a distal process
   there is genuinely no nucleus nearby, and this says so rather than naming one 40 µm away. */
var NUC_NEAR_NM = 4000;
var AT = {};
async function cellAt(pos, cfg, note){
  var key = pos.join(",");
  if (AT[key]) return AT[key];
  if (!UJ.segread) return { error: "the segmentation reader did not load" };
  if (!UJ.segread.configured || !UJ.segread.configured()){
    try { UJ.segread.configure({ seg: cfg.seg, nuc: cfg.nuc, res: cfg.res }); }
    catch (e){ return { error: "the segmentation could not be configured" }; }
  }
  note && note("looking up the cell here…");
  var r = null;
  try { r = await UJ.segread.resolveAt(pos); }
  catch (e){ return { error: "the segmentation could not be read (" + String(e && e.message || e) + ")" }; }
  var out = { root: String((r && r.rootId) || ""),
              /* resolveAt's nucleusId is a NUMBER and 0 means none, so it cannot be ||'d with a
                 string default without turning "no nucleus" into "nucleus 0". */
              nuc: (r && r.nucleusId) ? String(r.nucleusId) : "",
              nucFrom: (r && r.nucleusId) ? "the point is inside it" : "" };
  if (!out.root || out.root === "0")
    out.error = (r && r.why)
      || "there is no segment at this exact point — it is outside a cell, or outside the "
       + "segmented volume";

  /* ── THE CELL'S NUCLEUS, NOT THE NUCLEUS AT THE POINT ───────────────────────────────────────
     Søren asked for "the nucleus of the cell". resolveAt answers about the VOXEL, so a coordinate
     in the cytoplasm -- which is most coordinates anybody pastes -- reports no nucleus at all even
     though the cell plainly has one. So when the point is not inside a nucleus, the nuclei volume
     is read around it, and the row says WHICH of the two answers it is. This page has no root ->
     nucleus table to ask instead; µJump's nucleus list is keyed the other way. */
  if (!out.error && !out.nuc && UJ.segread.nearestNucleus){
    try {
      var n = await UJ.segread.nearestNucleus(pos, NUC_NEAR_NM);
      var nid = n && (n.nucleusId || n.id || n.nucleus);
      if (nid){ out.nuc = String(nid);
                out.nucFrom = "nearest within " + (NUC_NEAR_NM / 1000) + " µm"; }
    } catch (_e){}
  }
  AT[key] = out;
  return out;
}

function m3d(){
  return (window.UJ && UJ.mesh3dCore && UJ.mesh3dCore.prepare) ? UJ.mesh3dCore : UJ.mesh3d;
}

/* Both surfaces share ONE frame, or the nucleus is drawn centred on itself and appears to be the
   size of the cell -- a picture, and a lie about scale. The same rule the tracing pad follows. */
function drawMeshes(host, parts){
  var M = m3d();
  if (!M || !parts.length) return;
  var raw = parts.map(function(p){
    return M.prepare(p.mesh.positions, p.mesh.indices, { unitNm: p.unitNm });
  });
  var lo = raw[0].lo.slice(), hi = raw[0].hi.slice();
  raw.forEach(function(q){
    for (var i = 0; i < 3; i++){
      if (q.lo[i] < lo[i]) lo[i] = q.lo[i];
      if (q.hi[i] > hi[i]) hi[i] = q.hi[i];
    }
  });
  var frame = { mid: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2],
                span: Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1 };
  var geos = parts.map(function(p){
    return M.prepare(p.mesh.positions, p.mesh.indices, { unitNm: p.unitNm, frame: frame });
  });
  /* The CELL is the subject and the nucleus sits inside it, so the cell is the see-through one --
     and the nucleus is BLUE, which is what it is in the Blender export, the cell panel and the pad.
     blender/colour_policy.py reserves hues 200-250 for nuclei, so the cell is a neutral grey rather
     than the blue-grey it would otherwise want to be. */
  var lead = geos[0], ghosts = [];
  for (var i = 1; i < geos.length; i++)
    ghosts.push({ geo: geos[i], alpha: 0.95,
                  tint: (M.NUC_TINT || [0.23, 0.45, 0.85]) });
  M.show(host, lead, { ghosts: ghosts, tint: [0.72, 0.72, 0.74],
                       emptyMessage: "That cell has no mesh to draw." });
}

async function open(hostEl, pos, opts){
  if (!hostEl) return;
  var cfg = hostCfg();
  if (!cfg){
    hostEl.innerHTML = '<p class="hint">This tool cannot draw EM here.</p>';
    return;
  }
  if (!UJ.emtiles){
    hostEl.innerHTML = '<p class="hint">The EM reader did not load — check that '
                     + "core/emtiles.js is being served, then reload with Ctrl-Shift-R.</p>";
    return;
  }
  hostEl.innerHTML = boxHtml(pos, cfg);
  var box = hostEl.querySelector(".emp");
  var cv = hostEl.querySelector(".emp-cv");
  var note = function(m, bad){ say(box, m, bad); };

  note("reading the EM…");
  var painted = false, segNote = "";
  try {
    if (!UJ.emtiles.configured()) UJ.emtiles.configure({ em: cfg.em, res: cfg.res });
    var view = await UJ.emtiles.drawSection(cv, {
      centre: pos, w: W, h: H, mip: MIP, zoom: 1, slabOk: true,
      lo: (cfg.window || {}).lo, hi: (cfg.window || {}).hi, tighten: true,
      onProgress: function(d, n){ note("reading the EM… " + d + "/" + n); }
    });
    /* ── AND THE SEGMENTATION, WHEN THE POST NAMED A CELL ──────────  2026-10-02
       Søren: "if a nucleus or root ID is written, then the EM should also show segmentation."

       The ids come from the SAME post as the coordinate, which is the whole point: a sentence
       that says both "look at this place" and "this cell" is asking for one picture of the two
       together, and until now it drew the place and left the reader to find the cell by eye.

       Magenta for the cell and blue for the nucleus, from core/segpaint.js — the same two
       colours the cell card, the tracing pad and the Blender export use, because a reader learns
       that pair once. */
    var ids = (opts && opts.ids) || {};
    var root = String(ids.root || "").trim(), nuc = String(ids.nuc || "").trim();
    if ((root || nuc) && UJ.segpaint){
      note("reading the segmentation…");
      try {
        if (!UJ.segpaint.configured())
          UJ.segpaint.configure({ seg: cfg.seg, nuc: cfg.nuc, res: cfg.res });
        var got = await UJ.segpaint.paint(cv, view,
          { root: root, nuc: nuc, alpha: (cfg.segAlpha || 0.32) });
        /* "Nothing appeared" has two causes that deserve different answers, the same two the
           cell card spells out: the cell is not on this plane, or it is not in the
           segmentation. */
        painted = !!(got && got.ok && got.painted);
        if (got && got.ok && !got.painted) segNote = "that cell is not on this plane";
      } catch (e){
        segNote = "the segmentation could not be read: " + String(e && e.message || e);
      }
    }
    /* THE MARKS GO ON LAST. drawSection owns the canvas while it draws, and segpaint reads the
       whole canvas back and rewrites it — so anything stamped before either would be painted
       over. The cell card learned this the same way. */
    scaleBar(cv, view);
    stampCoord(cv, pos);
    var across = (view && view.umAcross)
      ? (Math.round((view.umAcross || 0) * 10) / 10) + " µm across" : "";
    if (segNote) note(across ? across + " — " + segNote : segNote, true);
    else note(across + (painted ? " — cell in magenta"
                                 + (nuc ? ", nucleus in blue" : "") : ""));
  } catch (e){
    note("the EM could not be read here: " + String(e && e.message || e), true);
  }

  var parts = [], got = null;
  var need = async function(){
    if (got) return got;
    got = await cellAt(pos, cfg, note);
    return got;
  };
  var cellBtn = hostEl.querySelector(".emp-cell"), nucBtn = hostEl.querySelector(".emp-nuc");
  var host3d = hostEl.querySelector(".emp-3d");

  if (cellBtn) cellBtn.addEventListener("click", async function(){
    cellBtn.disabled = true;
    var at = await need();
    if (at.error){ note(at.error, true); cellBtn.disabled = false; return; }
    if (parts.some(function(p){ return p.what === "cell"; })){ cellBtn.disabled = false; return; }
    note("fetching the cell’s mesh… (" + at.root + ")");
    try {
      var m = await UJ.mesh.fetchCombinedMesh(at.root, function(f, msg){
        note("fetching the cell’s mesh… " + (msg || Math.round((f || 0) * 100) + "%"));
      });
      if (!m || !m.positions || !m.positions.length){ note("that cell has no mesh to draw", true);
                                                      cellBtn.disabled = false; return; }
      /* core/mesh.js hands back MICROMETRES; core/nucmesh.js hands back nanometres. Saying so at
         each call is what keeps the two in one frame -- see core/mesh3d.js's note on unitNm. */
      parts.unshift({ what: "cell", mesh: m, unitNm: 1000 });
      drawMeshes(host3d, parts);
      note("cell " + at.root + (at.nuc ? ", nucleus " + at.nuc : ""));
    } catch (e){ note("the cell’s mesh could not be read: " + String(e && e.message || e), true); }
    cellBtn.disabled = false;
  });

  if (nucBtn) nucBtn.addEventListener("click", async function(){
    nucBtn.disabled = true;
    var at = await need();
    if (at.error){ note(at.error, true); nucBtn.disabled = false; return; }
    if (!at.nuc){ note("no nucleus within " + (NUC_NEAR_NM / 1000) + " \u00b5m of this point \u2014 "
                     + "out in a process there may be none to find", true);
                  nucBtn.disabled = false; return; }
    if (parts.some(function(p){ return p.what === "nucleus"; })){ nucBtn.disabled = false; return; }
    note("fetching the nucleus’ mesh… (" + at.nuc + ")");
    try {
      if (!UJ.nucmesh.configured()) UJ.nucmesh.configure({ nuc: cfg.nuc });
      var n = await UJ.nucmesh.fetchNucleus(at.nuc);
      if (!n || !n.positions.length){ note("nucleus " + at.nuc + " has no mesh in the nuclei volume",
                                           true); nucBtn.disabled = false; return; }
      parts.push({ what: "nucleus", mesh: n, unitNm: 1 });
      drawMeshes(host3d, parts);
      note("cell " + at.root + ", nucleus " + at.nuc
           + (at.nucFrom ? " (" + at.nucFrom + ")" : ""));
    } catch (e){ note("the nucleus mesh could not be read: " + String(e && e.message || e), true); }
    nucBtn.disabled = false;
  });
}

function close(hostEl){ if (hostEl) hostEl.innerHTML = ""; }
function isOpen(hostEl){ return !!(hostEl && hostEl.querySelector(".emp")); }

UJ.empreview = { open: open, close: close, isOpen: isOpen,
                 _scaleBar: scaleBar, _stampCoord: stampCoord, _cellAt: cellAt, W: W, H: H };
})();
