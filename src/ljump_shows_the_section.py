# -*- coding: utf-8 -*-
u"""λJump shows one plane of the EM beside the cell.                             2026-09-20

Second slice of the tracing card's port. Slice 1 gave λJump the eight modules and proved it can
draw its own section (src/ljump_gets_the_em_in_the_page.py, emljumpcheck.js). This puts a section
on the cell card, which is the first thing a reader sees out of any of it.

Søren, when µJump got this: *"I would like that there is a single plane of the EM data ... when you
view the cell next to the cortical layers model ... but it may slow things down, so it should be
possible to turn it off."*

WHY THIS AND NOT THE PAD. The pad was the plan, and measuring it changed the plan: the pad's code
is scattered across NINETEEN regions of ujump.html between lines 830 and 11960, about 1,450 lines
interleaved with unrelated µJump code. It is not one block and cannot be lifted as one. The EM
plane is already marked for extraction in that file -- /* @emplane:start */ ... /* @emplane:end */,
272 contiguous lines -- because a previous port needed exactly this and left the marker behind.
So this is the piece that is ready, and the pad needs its own markers added first.

── THREE THINGS LEE16 DOES DIFFERENTLY, EACH MEASURED ───────────────────────────

1. NO SEGMENTATION, SO NO OVERLAY. Half of µJump's version paints the cell's own segmentation over
   the section in magenta and its nucleus in blue, with a second remembered tick. Lee16's public
   release is image only -- this page says so itself, in the Colab card: *"there is no segmentation
   volume to cut out."* So that half is not ported. Not hidden, not disabled: absent. A tick that
   can never do anything is worse than no tick, and a "segmentation off" status line on a dataset
   with no segmentation is a sentence about nothing.

2. MIP 4, NOT MIP 3, AND NO slabOk. µJump reaches 64 nm through emtiles' slabOk escape hatch,
   because minnie65's 64 nm level averages TWO 40 nm sections together and a plain mip walk refuses
   it. Lee16 downsamples only in x and y: all ten of its scales keep 40 nm sections (read live,
   4_4_40 through 2048_2048_40). So emtiles' section-scale list is all ten, 64 nm is simply mip 4,
   and it is a TRUE SINGLE SECTION rather than a slab. The escape hatch is not needed and the
   caveat µJump has to print -- "averages 2 of the 40 nm sections" -- is not true here.

   300 px at 64 nm is 19.2 µm, which is the same width Søren asked for on µJump.

3. ITS OWN EXTENTS. µJump guards against drawing outside the imagery with window.MINNIE65_EM_BB, a
   constant it carries. λJump has no such constant and does not need one: the volume's own info
   already says where it is, so the box is computed from it once and cached. Same message when a
   coordinate falls outside, with no second copy of a number to keep in step.

The contrast window is EM_WINDOW, measured on this tissue in slice 1: 44-238, against µJump's
86-172. Its median alone is 189.

Run: python3 src/ljump_shows_the_section.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
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


# ── the block ─────────────────────────────────────────────────────────────────────────────────
PLANE_ANCHOR = u'''function emConfigure(){'''

PLANE = u'''/* @emplane:start */
/* ── ONE PLANE OF THE EM, BESIDE THE CELL ───────────────────────  2026-09-20
   Ported from µJump's own @emplane block. Søren, when that was built: *"I would like that there is
   a single plane of the EM data ... when you view the cell ... but it may slow things down, so it
   should be possible to turn it off."*

   WHAT IT COSTS, SAID PLAINLY. One 300x162 window at 64 nm is about fifteen chunks. Lee16's chunks
   are 512x512x16 at every level, so a section costs the same wherever you look -- unlike minnie65,
   whose coarse levels have narrower chunks and get MORE expensive as they show more. Cold, that is
   a few seconds; afterwards it is free, because core/segread.js caches by URL and range. Which is
   why this has a switch, and why the switch is REMEMBERED: somebody who turns it off on a slow
   connection should not meet it again on the next cell.

   NO SEGMENTATION HALF. µJump paints the cell's own segmentation over the section. Lee16's public
   release is image only -- see the Colab card's own note -- so there is nothing to paint and no
   tick offering to. A control that can never do anything is worse than no control.

   MIP 4 IS 64 nm HERE, AND IT IS A REAL SECTION. µJump needs emtiles' slabOk to reach 64 nm,
   because minnie65's 64 nm level averages two 40 nm sections and a tracing is section by section.
   Lee16 downsamples in x and y only -- all ten of its scales keep 40 nm z -- so 64 nm is just
   mip 4, it is one plane, and the caveat µJump has to print does not apply.

   A SLOW DRAW MUST NOT PAINT THE PREVIOUS CELL. Every render takes a token and re-checks it at
   each await, dropping out if a newer cell has been shown since. Without that, stepping through
   cells paints whichever fetch lands last, and the panel shows the wrong cell -- which it would
   be. */
var EM_PLANE_KEY = "ljump_panel_emplane", EM_PLANE_TOKEN = 0,
    EM_PLANE_WIRED = false, EM_PLANE_LAST = null;
/* 300x162 DRAWN, 260 SHOWN -- µJump's proportions, for the same reason: "how much tissue" and
   "how much room" are different questions. 300 data pixels into 260 display pixels costs nothing
   extra to fetch and is sharper on any 2x screen. */
var EM_PLANE_W = 300, EM_PLANE_H = 162, EM_PLANE_CSS = 260, EM_PLANE_MIP = 4;
function emPlaneOn(){
  try { var v = localStorage.getItem(EM_PLANE_KEY); return v === null ? true : v === "1"; }
  catch (_e) { return true; }
}
function emPlaneSay(tok, msg, bad){
  var el = document.getElementById("emPlaneSay");
  if (!el || EM_PLANE_TOKEN !== tok) return;
  el.textContent = msg || "";
  el.style.color = bad ? "var(--bad)" : "var(--mut)";
}
/* WHERE THE IMAGERY IS, FROM THE IMAGERY. µJump carries window.MINNIE65_EM_BB as a constant; this
   reads the volume's own info, which core/segread.js has already fetched and cached, so there is
   no second copy of the extents to keep in step with the dataset. Null until the info lands, and
   a null box means "draw and find out" rather than "refuse" -- the guard exists to give a better
   message, not to be the only thing standing between a click and an error. */
var EM_PLANE_BB = null;
async function emPlaneBB(){
  if (EM_PLANE_BB) return EM_PLANE_BB;
  try {
    var info = await UJ.segread._getInfo(UJ.segread._httpBase(UJ.cfg.viewer.em));
    var s = info.scales[0], o = s.voxel_offset || [0, 0, 0];
    EM_PLANE_BB = { x: [o[0], o[0] + s.size[0]], y: [o[1], o[1] + s.size[1]],
                    z: [o[2], o[2] + s.size[2]], res: s.resolution };
  } catch (_e) { EM_PLANE_BB = null; }
  return EM_PLANE_BB;
}
/* IT SAYS WHY IT IS NOT THERE RATHER THAN NOT BEING THERE. These guards used to return "" in the
   page this came from -- the section simply did not appear, with nothing to suggest it ever
   should have. A core/*.js that 404s on the server, or a script an extension blocked, looks
   exactly like a page that never had the feature. */
function emPlaneBox(pos){
  var missing = null;
  if (typeof UJ === "undefined" || !UJ.emtiles || !UJ.segread)
    missing = "the EM reader did not load \\u2014 check that core/emtiles.js and core/segread.js are "
            + "being served, then reload with Ctrl-Shift-R";
  var tok = ++EM_PLANE_TOKEN, on = emPlaneOn() && !missing;
  EM_PLANE_LAST = { pos: pos };
  if (!missing) setTimeout(function(){ drawPanelEmPlane(tok); }, 0);
  /* The <label> resets four properties it would inherit from this page's global label rule
     (display:block, uppercase, letter-spaced, muted). That rule is for the form labels that head
     a control; this is a caption with a tick in it, and left alone it reads as a section title. */
  return '<div id="emPlaneBox" data-tok="' + tok + '" style="margin-top:10px">'
    + '<div class="hint" style="margin:0 0 3px">'
    + '<label for="emPlaneOn" style="display:inline-flex;align-items:center;gap:5px;margin:0;'
    + 'cursor:pointer;text-transform:none;letter-spacing:0;font-size:inherit;color:inherit" '
    + 'title="One plane of the EM at this coordinate, read from the imagery bucket. The first '
    + 'cell on a cold cache takes a few seconds; turning it off here is remembered.">'
    + '<input type="checkbox" id="emPlaneOn" style="width:auto;margin:0"' + (on ? " checked" : "")
    + (missing ? " disabled" : "") + '> '
    + 'EM section</label> <span id="emPlaneSay" style="color:var(--mut)">'
    + (missing ? escHtml(missing) : "") + '</span></div>'
    + '<canvas id="emPlaneCv" width="' + EM_PLANE_W + '" height="' + EM_PLANE_H + '" '
    + 'style="width:100%;max-width:' + EM_PLANE_CSS + 'px;display:' + (on ? "block" : "none")
    + ';margin:0 auto;background:var(--bg);border:1px solid var(--line);'
    + 'border-radius:6px"></canvas></div>';
}
/* A ROUND NUMBER, NOT A FIXED FRACTION. A bar of "30% of the view" reads 5.76 \\u00b5m here and
   something else on the next cell, and a scale bar whose label needs two decimals is one nobody
   uses. The largest of 0.5/1/2/5/10/20/50/100 \\u00b5m that fits in a third of the width. Drawn last,
   always, and white on a dark outline because EM is grey everywhere and a bar of one colour
   disappears somewhere on every section. */
function emPlaneScaleBar(cv, view){
  if (!cv || !view) return;
  var nmPerPx = view.effNmPerPx || view.nmPerPx;
  if (!(nmPerPx > 0)) return;
  var NICE = [0.5, 1, 2, 5, 10, 20, 50, 100], want = (view.umAcross || 0) / 3, um = NICE[0], i;
  for (i = 0; i < NICE.length; i++) if (NICE[i] <= want) um = NICE[i];
  var px = um * 1000 / nmPerPx;
  if (!(px > 8) || px > cv.width) return;
  var ctx = cv.getContext("2d"), x = 12, y = cv.height - 14, h = 4;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.lineWidth = 3;
  ctx.strokeRect(x, y, px, h);
  ctx.fillStyle = "#fff"; ctx.fillRect(x, y, px, h);
  var label = (um < 1 ? um : Math.round(um)) + " \\u00b5m";
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.lineWidth = 3;
  ctx.strokeText(label, x + px / 2, y - 5);
  ctx.fillStyle = "#fff"; ctx.fillText(label, x + px / 2, y - 5);
  ctx.restore();
  try { cv.dataset.scaleUm = String(um); } catch (_e) {}
}
async function drawPanelEmPlane(tok){
  var box = document.getElementById("emPlaneBox");
  if (!box) return;
  if (tok == null) tok = Number(box.dataset.tok || 0);
  if (EM_PLANE_TOKEN !== tok) return;
  var cv = document.getElementById("emPlaneCv");
  if (!cv || !EM_PLANE_LAST) return;
  if (!emPlaneOn()) { cv.style.display = "none"; emPlaneSay(tok, ""); return; }
  cv.style.display = "block";
  var pos = EM_PLANE_LAST.pos;
  emPlaneSay(tok, "\\u2026");
  /* A quarter second before anything is fetched: stepping through cells should not queue a read
     per cell you passed through. A newer cell bumps the token and this one drops out here. */
  await new Promise(function(r){ setTimeout(r, 250); });
  if (EM_PLANE_TOKEN !== tok) return;
  try {
    if (!emConfigure()) { emPlaneSay(tok, "the EM reader did not load", true); return; }
    var bb = await emPlaneBB();
    if (EM_PLANE_TOKEN !== tok) return;
    if (bb && (pos[0] < bb.x[0] || pos[0] > bb.x[1] || pos[1] < bb.y[0] || pos[1] > bb.y[1]
               || pos[2] < bb.z[0] || pos[2] > bb.z[1])) {
      cv.style.display = "none";
      emPlaneSay(tok, "outside Lee16\\u2019s imagery, so there is no section to draw here");
      return;
    }
    emPlaneSay(tok, "reading the EM\\u2026");
    var view = await UJ.emtiles.drawSection(cv, {
      centre: pos, w: EM_PLANE_W, h: EM_PLANE_H, mip: EM_PLANE_MIP, zoom: 1,
      lo: EM_WINDOW.lo, hi: EM_WINDOW.hi, tighten: true,
      onProgress: function(d, n){ emPlaneSay(tok, "reading the EM\\u2026 " + d + "/" + n); } });
    if (EM_PLANE_TOKEN !== tok) return;
    emPlaneScaleBar(cv, view);
    /* No slab caveat here, unlike \\u00b5Jump: every Lee16 scale keeps 40 nm sections, so this is one
       plane at every level and saying otherwise would be inventing a warning. */
    try {
      cv.title = view.umAcross.toFixed(1) + " \\u00b5m across at " + view.nmPerPx + " nm/px, z="
        + view.z + ". One 40 nm section. Contrast " + view.lo + "\\u2013" + view.hi
        + (view.tightened
           ? " (narrowed onto this plane from the " + view.windowAsked[0] + "\\u2013"
             + view.windowAsked[1] + " window, because a downsampled level\\u2019s values do not "
             + "fill it)"
           : "") + ".";
    } catch (_t) {}
    emPlaneSay(tok, "");
  } catch (e) {
    if (EM_PLANE_TOKEN !== tok) return;
    emPlaneSay(tok, "could not read the imagery: " + String(e && e.message || e), true);
  }
}
/* Delegated once, not wired per render: the box is rebuilt on every cell. */
function wireEmPlaneToggle(){
  if (EM_PLANE_WIRED) return;
  EM_PLANE_WIRED = true;
  document.addEventListener("change", function(e){
    var t = e.target;
    if (!t || t.id !== "emPlaneOn") return;
    try { localStorage.setItem(EM_PLANE_KEY, t.checked ? "1" : "0"); } catch (_e) {}
    var box = document.getElementById("emPlaneBox");
    drawPanelEmPlane(box ? Number(box.dataset.tok || 0) : EM_PLANE_TOKEN);
  });
}
wireEmPlaneToggle();
/* @emplane:end */
function emConfigure(){'''

# ── where it goes on the card ─────────────────────────────────────────────────────────────────
# Under the depth ruler and its explanation, which is the same slot µJump uses: beside the
# orientation diagram, where the column has room and the reader is already looking at "where is
# this cell" rather than "what is it".
MOUNT_OLD = u'''    +'</p></div>';

  h+='<div class="meta">\''''
MOUNT_NEW = u'''    +'</p></div>';

  /* The section goes under the depth ruler, which is the slot µJump uses: beside the orientation
     diagram, where this column has room and the reader is already asking where the cell is rather
     than what it is. */
  h+=emPlaneBox(pos);

  h+='<div class="meta">\''''

print("ljump.html")
edit("ljump.html", [
    (u"one plane of the EM, with no segmentation half", PLANE_ANCHOR, PLANE),
    (u"...shown under the depth ruler", MOUNT_OLD, MOUNT_NEW),
])

print(u"\nnow: node emljumpcheck.js && node ljumpcheck.js && node ljumpdashcheck.js "
      u"&& python3 src/build_stamps.py && node stampcheck.js")
