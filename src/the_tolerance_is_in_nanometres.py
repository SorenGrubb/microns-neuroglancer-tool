# -*- coding: utf-8 -*-
u"""The tolerance is in nanometres, and the offer is not hidden behind a threshold.      2026-09-22

Søren, twice: "I don't see anywhere I can reduce the number of points", and then, after the button
was added to the pad as well: "I still don't see the reduce points button, even after pasting a
link".

IT WAS HIDING ITSELF, correctly, by a rule that was wrong. MEASURED on a contour of the shape he
actually makes -- 176 contours of ~228 CLICKED vertices, not a pen stroke -- against his own
dataset's 4 nm voxels:

    0.5 voxels (2 nm)    40,128 -> 38,636    3.7%   <- under the 10% threshold, so: hidden
    1   voxel  (4 nm)    40,128 -> 37,093    7.6%   <- still hidden
    4   voxels (16 nm)   40,128 -> 30,738   23.4%
    8   voxels (32 nm)   40,128 -> 24,963   37.8%

TWO MISTAKES, both mine.

ONE: the tolerance was in DATASET BASE VOXELS. minnie65 is 4 nm, and he traces at the 32 nm level,
where one screen pixel is EIGHT voxels. Half a base voxel is a sixteenth of a pixel -- far tighter
than anything he drew or can see, so "redundant" meant almost nothing. It is in NANOMETRES now,
converted through UJ.cfg.res, and the default is 16 nm: half a pixel at the level tracings are
drawn at, which is the honest reading of "below what the screen can show".

TWO: the button appeared only when a tenth or more would go. That was meant to stop it being a
button that does nothing, but it made it a button that is not there when it would do something --
and a hidden control cannot be argued with. It shows whenever ANY point would go, with the count on
it, and he decides.

AND HE CAN PUSH IT. A nanometre box beside the button, so 16 can become 32 and the label answers
before anything is pressed. JUMP_SIMPLIFY_NM in the console does the same for the viewer link.

AND THE COST OF LOOSENING IT, found by the checks and then bounded. At 16 nm a 1.6 µm test
structure lost 0.513% of its volume where a 12 µm cell loses 0.09% -- the same setting, five times
the error, because the object is smaller. A polygon within `tol` of a circle of radius R encloses
about (2/3)(tol/R) less area, so the tolerance is capped at 0.003 R per contour: it never binds on
a cell (0.003 x 3,000 voxels = 9, and 16 nm is 4), and on the small one it brought the volume error
to 0.077% while still dropping 82% of the points.

Checks: tolerancecheck.js (his own 176 clicked contours), dropredundantcheck.js (the volume bound).
Run: python3 src/the_tolerance_is_in_nanometres.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s: %d" % (name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


# ── 1. nanometres, not base voxels ────────────────────────────────────────────────────────────
edit("core/tracing.js", [
 (u"the tolerance is in nanometres",
  u'''  var SIMPLIFY_TOL = 0.5;''',
  u'''  /* IN NANOMETRES, not in base voxels (2026-09-22). minnie65 is 4 nm and a tracing is drawn at
     the 32 nm level, where one screen pixel is EIGHT voxels -- so half a base voxel is a sixteenth
     of a pixel, tighter than anything anybody drew, and "redundant" meant almost nothing. 16 nm is
     half a pixel at the level tracings are drawn at. See src/the_tolerance_is_in_nanometres.py. */
  var SIMPLIFY_NM = 16;
  function resNmXY(){
    try { var r = window.UJ && UJ.cfg && UJ.cfg.res; if (r && +r[0] > 0) return +r[0]; } catch (_e){}
    return 4;
  }
  function simplifyTolVox(nm){
    var n = (typeof nm === "number" && nm > 0) ? nm : SIMPLIFY_NM;
    try { if (typeof window.JUMP_SIMPLIFY_NM === "number") n = window.JUMP_SIMPLIFY_NM; } catch (_e){}
    return n / resNmXY();
  }
  var SIMPLIFY_TOL = 0.5;'''),
 (u"a small contour is never coarsened",
  u'''  function simplifyRing(pts, tol){
    var n = pts.length;
    if (n < 6 || !(tol > 0)) return pts;''',
  u'''  /* THE AREA IS THE MEASUREMENT, so the tolerance is capped at a fraction of the contour's own
     size (2026-09-22). A polygon whose vertices sit within `tol` of a circle of radius R encloses
     about (2/3)(tol/R) less area, so a fixed 16 nm costs 0.09% on a 12 µm cell and 0.5% on a 1.6 µm
     organelle -- the same setting, ten times the error, because the structure is smaller. Capping
     tol at 0.003 R holds the area error near 0.2% whatever is being traced: it never binds on a
     cell, and it is the whole tolerance on a lysosome. Measured in tolerancecheck.js. */
  var AREA_GUARD = 0.003;
  function meanRadius(pts){
    var cx = 0, cy = 0, i;
    for (i = 0; i < pts.length; i++){ cx += pts[i][0]; cy += pts[i][1]; }
    cx /= pts.length; cy /= pts.length;
    var s = 0;
    for (i = 0; i < pts.length; i++)
      s += Math.sqrt(Math.pow(pts[i][0] - cx, 2) + Math.pow(pts[i][1] - cy, 2));
    return s / pts.length;
  }
  function simplifyRing(pts, tol){
    var n = pts.length;
    if (n < 6 || !(tol > 0)) return pts;
    var cap = AREA_GUARD * meanRadius(pts);
    if (cap > 0 && cap < tol) tol = cap;'''),
 (u"...and simplifyRings uses it",
  u'''    var t = (typeof tol === "number") ? tol : SIMPLIFY_TOL;
    try { if (typeof window.JUMP_SIMPLIFY_TOL === "number") t = window.JUMP_SIMPLIFY_TOL; }
    catch (_e){}''',
  u'''    var t = (typeof tol === "number" && tol > 0) ? tol : simplifyTolVox();
    /* JUMP_SIMPLIFY_TOL is still in voxels, for anyone who set it this morning. */
    try { if (typeof window.JUMP_SIMPLIFY_TOL === "number") t = window.JUMP_SIMPLIFY_TOL; }
    catch (_e){}'''),
 (u"...and says so in nanometres too",
  u'''    return { rings: out, before: before, after: after, tol: t };''',
  u'''    return { rings: out, before: before, after: after, tol: t,
             nm: Math.round(t * resNmXY() * 10) / 10 };'''),
 (u"...exported for the boxes",
  u'''           ringAnnotations: ringAnnotations, simplifyRings: simplifyRings,''',
  u'''           ringAnnotations: ringAnnotations, simplifyRings: simplifyRings,
           simplifyTolVox: simplifyTolVox, simplifyDefaultNm: function(){ return SIMPLIFY_NM; },'''),
])

# ── 2. the offer is not hidden behind a threshold, and takes a nanometre box ───────────────────
edit("core/tracingcard.js", [
 (u"the found panel's box",
  u'''    "<!-- THE SHAPE, BEFORE IT IS COMMITTED.  2026-09-19. Søren: \\"the neuroglancer link paste function",''',
  u'''    "<label id=\\"tracingThinNmRow\\" style=\\"display:none;font-size:12px;align-items:center;gap:6px;margin-top:4px\\" title=\\"How far a point may move, in nanometres. 16 nm is half a pixel at the 32 nm level tracings are drawn at — below what the screen showed you. Raise it to drop more; the button says how many before you press it.\\">within <input type=\\"number\\" id=\\"tracingThinNm\\" value=\\"16\\" min=\\"1\\" max=\\"400\\" step=\\"1\\" style=\\"width:64px\\"> nm</label>",
    "<!-- THE SHAPE, BEFORE IT IS COMMITTED.  2026-09-19. Søren: \\"the neuroglancer link paste function",'''),
 (u"...read by the found panel",
  u'''function tracingThinGain(){
  const rings = (TRACING_PENDING && TRACING_PENDING.rings) || null;
  if (!rings || !rings.length) return null;
  if (!(window.UJ && UJ.tracing && UJ.tracing.simplifyRings)) return null;
  const r = UJ.tracing.simplifyRings(rings.map(function(x){ return { z: x.z, points: x.points }; }));
  if (!r.before || r.before - r.after <= r.before / 10) return null;
  return r;
}
function tracingThinShow(){
  const btn = document.getElementById("tracingThin");
  if (!btn) return;
  const g = tracingThinGain();
  btn.style.display = g ? "" : "none";
  if (g) btn.textContent = "Drop redundant points (" + g.before.toLocaleString() + " \\u2192 "
                         + g.after.toLocaleString() + ")";
}''',
  u'''/* The tolerance the boxes hold, in nanometres -- see src/the_tolerance_is_in_nanometres.py. */
function thinNmOf(id){
  try {
    const el = document.getElementById(id);
    const v = el ? parseFloat(el.value) : NaN;
    if (v > 0) return v;
  } catch (_e){}
  try { return UJ.tracing.simplifyDefaultNm(); } catch (_e){}
  return 16;
}
function thinVox(id){
  try { return UJ.tracing.simplifyTolVox(thinNmOf(id)); } catch (_e){ return thinNmOf(id) / 4; }
}
function tracingThinGain(){
  const rings = (TRACING_PENDING && TRACING_PENDING.rings) || null;
  if (!rings || !rings.length) return null;
  if (!(window.UJ && UJ.tracing && UJ.tracing.simplifyRings)) return null;
  const r = UJ.tracing.simplifyRings(rings.map(function(x){ return { z: x.z, points: x.points }; }),
                                     thinVox("tracingThinNm"));
  /* ANY point, not a tenth of them (2026-09-22): a threshold made this a button that is not there
     when it would do something, and a hidden control cannot be argued with. */
  if (!r.before || r.after >= r.before) return null;
  return r;
}
function tracingThinShow(){
  const btn = document.getElementById("tracingThin");
  if (!btn) return;
  const row = document.getElementById("tracingThinNmRow");
  const any = !!(TRACING_PENDING && (TRACING_PENDING.rings || []).length);
  if (row) row.style.display = any ? "flex" : "none";
  const nm = document.getElementById("tracingThinNm");
  if (nm && !nm.dataset.wired){
    nm.dataset.wired = "1";
    nm.addEventListener("input", tracingThinShow);
  }
  const g = tracingThinGain();
  btn.style.display = g ? "" : "none";
  if (g) btn.textContent = "Drop redundant points (" + g.before.toLocaleString() + " \\u2192 "
                         + g.after.toLocaleString() + ")";
}'''),
 (u"...and the sentence says nanometres",
  u'''    + g.after.toLocaleString() + ". No point of the outline moved more than " + g.tol
    + " voxel" + (g.tol === 1 ? "" : "s") + "." + volSay
    + " Nothing is saved until you add it \\u2014 read the link again to get every point back.");''',
  u'''    + g.after.toLocaleString() + ". No point of the outline moved more than " + g.nm
    + " nm." + volSay
    + " Nothing is saved until you add it \\u2014 read the link again to get every point back.");'''),
])

# ── 3. and the same on the pad ────────────────────────────────────────────────────────────────
edit("core/tracingcard.js", [
 (u"the pad's box",
  u'''\\">Drop redundant points</button>",
    "<p class=\\"hint\\" id=\\"tracePadVol\\"''',
  u'''\\">Drop redundant points</button>",
    "<label id=\\"padThinNmRow\\" style=\\"display:none;font-size:12px;align-items:center;gap:6px;margin-top:4px\\" title=\\"How far a point may move, in nanometres. 16 nm is half a pixel at the 32 nm level tracings are drawn at — below what the screen showed you. Raise it to drop more; the button says how many before you press it.\\">within <input type=\\"number\\" id=\\"padThinNm\\" value=\\"16\\" min=\\"1\\" max=\\"400\\" step=\\"1\\" style=\\"width:64px\\"> nm</label>",
    "<p class=\\"hint\\" id=\\"tracePadVol\\"'''),
 (u"...read by the pad",
  u'''function padThinGain(){
  if (!PAD || !PAD.rings || !PAD.rings.length) return null;
  if (!(window.UJ && UJ.tracing && UJ.tracing.simplifyRings)) return null;
  const r = UJ.tracing.simplifyRings(PAD.rings.map(function(x){
    return { z: x.z, points: x.points };
  }));
  if (!r.before || r.before - r.after <= r.before / 10) return null;
  return r;
}
function padThinShow(){
  const btn = document.getElementById("padThin");
  if (!btn) return;
  if (!btn.dataset.wired){ btn.dataset.wired = "1"; btn.addEventListener("click", padThinRun); }
  try { padSmoothWire(); } catch (_e){}
  const g = padThinGain();
  btn.style.display = g ? "" : "none";
  if (g) btn.textContent = "Drop redundant points (" + g.before.toLocaleString() + " \\u2192 "
                         + g.after.toLocaleString() + ")";
}''',
  u'''function padThinGain(){
  if (!PAD || !PAD.rings || !PAD.rings.length) return null;
  if (!(window.UJ && UJ.tracing && UJ.tracing.simplifyRings)) return null;
  const r = UJ.tracing.simplifyRings(PAD.rings.map(function(x){
    return { z: x.z, points: x.points };
  }), thinVox("padThinNm"));
  if (!r.before || r.after >= r.before) return null;
  return r;
}
function padThinShow(){
  const btn = document.getElementById("padThin");
  if (!btn) return;
  if (!btn.dataset.wired){ btn.dataset.wired = "1"; btn.addEventListener("click", padThinRun); }
  try { padSmoothWire(); } catch (_e){}
  const row = document.getElementById("padThinNmRow");
  if (row) row.style.display = (PAD && PAD.rings && PAD.rings.length) ? "flex" : "none";
  const nm = document.getElementById("padThinNm");
  if (nm && !nm.dataset.wired){ nm.dataset.wired = "1"; nm.addEventListener("input", padThinShow); }
  const g = padThinGain();
  btn.style.display = g ? "" : "none";
  if (g) btn.textContent = "Drop redundant points (" + g.before.toLocaleString() + " \\u2192 "
                         + g.after.toLocaleString() + ")";
}'''),
 (u"...and its sentence too",
  u'''    + g.after.toLocaleString() + ". No point of the outline moved more than " + g.tol
    + " voxel" + (g.tol === 1 ? "" : "s") + "." + volSay
    + " Nothing is shared until you press \\u201cUse these contours\\u201d.");''',
  u'''    + g.after.toLocaleString() + ". No point of the outline moved more than " + g.nm
    + " nm." + volSay
    + " Nothing is shared until you press \\u201cUse these contours\\u201d.");'''),
])

# ── 4. and the viewer link's own sentence ─────────────────────────────────────────────────────
edit("core/tracingcard.js", [
 (u"the link's tally says nanometres",
  u'''      + cut.after.toLocaleString() + " (no point of the outline moved more than " + cut.tol
      + " voxel" + (cut.tol === 1 ? "" : "s") + "; your saved tracing is unchanged)."''',
  u'''      + cut.after.toLocaleString() + " (no point of the outline moved more than "
      + (Math.round(cut.tol * 40) / 10) + " nm; your saved tracing is unchanged)."'''),
 (u"...and carries the nm back",
  u'''      cut.tol = anns.simplified.tol;''',
  u'''      cut.tol = anns.simplified.tol; cut.nm = anns.simplified.nm;'''),
])
