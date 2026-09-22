# -*- coding: utf-8 -*-
u"""Alt+draw continues a contour, so a lifted pen does not cost the whole outline.        2026-09-22

Søren: "I have sometimes had the problem that I accidentally liftet the pen while drawing and the I
had to start over. I would like if there was a possibility to append to a traced polyline by
drawing with the pen again. Perhaps starting by holding alt while drawing."

Lifting the pen closes the stroke: a chord is drawn across the gap and the contour is done. With
alt (option on a Mac) held, a stroke that STARTS on a contour of the structure being drawn, on this
section, continues that contour instead of starting a new one:

  - it ends in the air: the edge it set off along (the chord across the gap, normally) goes, the
    stroke goes in, and the ring closes from the stroke's end to the other side of the gap;
  - it ends on the contour again: the shorter stretch between its two ends is replaced by the
    stroke -- redrawing part of an outline that went wrong.

Both ends snap to the nearest point on the contour within 15 px, a vertex or a point on an edge.
The contour keeps its winding and its structure; only the new stroke is thinned, so the rest of the
outline is exactly as it was. Undo takes back the continuation, not the contour. An alt-stroke that
starts nowhere near a contour is an ordinary new one. With alt held a press on a vertex draws
instead of grabbing it -- the end of a lifted stroke IS a vertex -- and alt+drag draws even with
"draw freehand" unticked.

core/tracepad.js: extendStroke(pad, tol, snapTol), and undo() knows the last continuation.
core/tracingcard.js: the pad's pointer handlers, and a line in the help table and the tick box.
Check: tracepadcheck.js ("continuing a contour after the pen was lifted"), tracingpanelcheck.js.
Run: python3 src/the_pen_picks_up_where_it_left_off.py, then python3 src/build_stamps.py
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


EXTEND = u'''
  /* ── PICKING UP WHERE THE PEN LEFT OFF ───────────────────────────────────────  2026-09-22
     Søren: "I have sometimes had the problem that I accidentally lifted the pen while drawing and
     then I had to start over." A stroke that starts on a contour of the structure being drawn, on
     this section, continues it (the caller asks for this with alt held). Ending in the air, the
     edge it set off along is cut and the stroke goes in; ending on the contour again, the shorter
     stretch between its ends is replaced. Only the new stroke is thinned. Returns "extended",
     "replaced", or endStroke's answer when there was no contour near its start.
     See src/the_pen_picks_up_where_it_left_off.py. */
  function dist2(a, b){ var dx = a[0] - b[0], dy = a[1] - b[1]; return dx * dx + dy * dy; }
  /* The nearest point on a closed ring: {seg, pt, d}. */
  function nearestOnRing(pts, x, y){
    var best = null, n = pts.length;
    for (var i = 0; i < n; i++){
      var a = pts[i], b = pts[(i + 1) % n], vx = b[0] - a[0], vy = b[1] - a[1];
      var L = vx * vx + vy * vy, t = L ? ((x - a[0]) * vx + (y - a[1]) * vy) / L : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      var q = [a[0] + vx * t, a[1] + vy * t], d = Math.sqrt(dist2(q, [x, y]));
      if (!best || d < best.d) best = { seg: i, pt: q, d: d };
    }
    return best;
  }
  /* The vertex at that point -- an existing one within `tol`, else one put in. Returned by
     reference, so a second insertion cannot lose it. */
  function snapVertex(pts, hit, tol){
    var n = pts.length, a = pts[hit.seg], b = pts[(hit.seg + 1) % n];
    if (Math.sqrt(dist2(a, hit.pt)) <= tol) return a;
    if (Math.sqrt(dist2(b, hit.pt)) <= tol) return b;
    var v = [Math.round(hit.pt[0]), Math.round(hit.pt[1])];
    pts.splice(hit.seg + 1, 0, v);
    return v;
  }
  function signedArea(pts){
    var s = 0;
    for (var i = 0; i < pts.length; i++){
      var a = pts[i], b = pts[(i + 1) % pts.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s / 2;
  }
  function extendStroke(pad, tol, snapTol){
    var raw = pad.stroke || [];
    if (raw.length < 2) return endStroke(pad, tol);
    var start = raw[0], end = raw[raw.length - 1], ri = -1, hit = null;
    for (var i = 0; i < pad.rings.length; i++){
      var R = pad.rings[i];
      if (R.z !== pad.z || (R.inst || 0) !== (pad.inst || 0) || R.points.length < MIN_VERTICES) continue;
      var h = nearestOnRing(R.points, start[0], start[1]);
      if (h.d <= snapTol && (!hit || h.d < hit.d)){ hit = h; ri = i; }
    }
    if (ri < 0) return endStroke(pad, tol);
    pad.stroke = null;
    var ring = pad.rings[ri], before = ring.points.map(function(v){ return v.slice(); });
    var pts = ring.points.map(function(v){ return v.slice(); });
    var sRef = snapVertex(pts, hit, tol);
    var eHit = nearestOnRing(pts, end[0], end[1]);
    var eRef = eHit.d <= snapTol ? snapVertex(pts, eHit, tol) : null;
    var n = pts.length, si = pts.indexOf(sRef), ei = eRef ? pts.indexOf(eRef) : -1;
    if (ei === si) ei = -1;
    var d;
    if (ei >= 0){
      /* Ending on the contour: the shorter way round between the two ends is what was redrawn. */
      var fwd = 0, bwd = 0, k;
      for (k = si; k !== ei; k = (k + 1) % n) fwd += Math.sqrt(dist2(pts[k], pts[(k + 1) % n]));
      for (k = si; k !== ei; k = (k - 1 + n) % n) bwd += Math.sqrt(dist2(pts[k], pts[(k - 1 + n) % n]));
      d = fwd <= bwd ? 1 : -1;
    } else {
      /* Ending in the air: the edge the stroke set off along is the one it replaces -- after a
         lifted pen, the chord across the gap. Its heading is taken a little way in, past the
         snapping distance, so a wobble at the pen's first touch does not decide it. */
      var probe = end;
      for (var j = 1; j < raw.length; j++) if (Math.sqrt(dist2(raw[j], start)) > snapTol){ probe = raw[j]; break; }
      var vx = probe[0] - sRef[0], vy = probe[1] - sRef[1];
      var cosTo = function(p){ var ux = p[0] - sRef[0], uy = p[1] - sRef[1];
        var L = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy)); return L ? (ux * vx + uy * vy) / L : -1; };
      d = cosTo(pts[(si + 1) % n]) >= cosTo(pts[(si - 1 + n) % n]) ? 1 : -1;
    }
    /* What stays: from the far end of the cut round to the start, in the same direction. */
    var kept = [], at = ei >= 0 ? ei : (si + d + n) % n;
    for (var guard = 0; guard <= n; guard++){
      kept.push(pts[at]);
      if (at === si) break;
      at = (at + d + n) % n;
    }
    var line = simplify(raw, tol).slice(1);
    if (ei >= 0 && line.length) line.pop();          // it ends on pts[ei], which is kept[0]
    var out = kept.concat(line.map(function(v){ return [Math.round(v[0]), Math.round(v[1])]; }));
    if (out.length < MIN_VERTICES) return "";
    /* The contour keeps its winding: nothing downstream should see it flip because it was mended. */
    if ((signedArea(out) < 0) !== (signedArea(before) < 0)) out.reverse();
    ring.points = out;
    /* To the end of the list, so Undo -- which takes back the latest contour here -- finds it. */
    pad.rings.splice(ri, 1); pad.rings.push(ring);
    pad.pending = [];
    pad.lastExtend = { ring: ring, before: before };
    return ei >= 0 ? "replaced" : "extended";
  }
'''

edit("core/tracepad.js", [
 (u"extendStroke",
  u'''
  return { create: create, setZ: setZ, addVertex: addVertex, closeRing: closeRing,''',
  EXTEND + u'''
  return { create: create, setZ: setZ, addVertex: addVertex, closeRing: closeRing,'''),
 (u"...exported",
  u'''           startStroke: startStroke, strokePoint: strokePoint, endStroke: endStroke,''',
  u'''           startStroke: startStroke, strokePoint: strokePoint, endStroke: endStroke,
           extendStroke: extendStroke,'''),
 (u"Undo takes back a continuation",
  u'''    if (pad.pending.length){ pad.pending.pop(); return "vertex"; }
    for (var i = pad.rings.length - 1; i >= 0; i--)''',
  u'''    if (pad.pending.length){ pad.pending.pop(); return "vertex"; }
    /* A continued contour goes back to what it was before, not away (2026-09-22). */
    var X = pad.lastExtend;
    pad.lastExtend = null;
    if (X && pad.rings[pad.rings.length - 1] === X.ring && X.ring.z === pad.z){
      X.ring.points = X.before; return "extension";
    }
    for (var i = pad.rings.length - 1; i >= 0; i--)'''),
])

HELP_ROW = u'''While it is on, a plain drag DRAWS, so <b>shift+drag</b> is how you pan.</td></tr>",'''
edit("core/tracingcard.js", [
 (u"the flag a stroke carries",
  u'''async function padDraw(){''',
  u'''/* Alt was held when this stroke began: it continues a contour rather than starting one.
   See src/the_pen_picks_up_where_it_left_off.py. */
var PAD_EXTEND = false;
async function padDraw(){'''),
 (u"with alt a press on a vertex draws",
  u'''    if (!e.shiftKey){
      const t = PAD_VIEW.toolAt(e.offsetX, e.offsetY);
      dragging = UJ.tracepad.hitVertex(PAD, t[0], t[1], PAD_VIEW.pxPerToolVoxel);''',
  u'''    /* NOT WITH ALT (2026-09-22): alt carries on a contour, and the end of a lifted stroke is a
       vertex -- grabbing it would drag the end instead of drawing from it. */
    if (!e.shiftKey && !e.altKey){
      const t = PAD_VIEW.toolAt(e.offsetX, e.offsetY);
      dragging = UJ.tracepad.hitVertex(PAD, t[0], t[1], PAD_VIEW.pxPerToolVoxel);'''),
 (u"...and alt+drag draws, ticked or not",
  u'''    if (drawFreehand() && !dragging && !e.shiftKey){
      const t0 = PAD_VIEW.toolAt(e.offsetX, e.offsetY);''',
  u'''    PAD_EXTEND = false;
    if ((drawFreehand() || e.altKey) && !dragging && !e.shiftKey){
      PAD_EXTEND = !!e.altKey;
      const t0 = PAD_VIEW.toolAt(e.offsetX, e.offsetY);'''),
 (u"lifting an alt-stroke continues the contour",
  u'''      const what = UJ.tracepad.endStroke(PAD, padTol(1.2));
      PAD_HOVER = null;''',
  u'''      /* ALT: CARRY ON THE CONTOUR IT STARTED ON (2026-09-22). Snapping within 15 px of it. */
      const extend = (PAD_EXTEND || e.altKey) && UJ.tracepad.extendStroke;
      PAD_EXTEND = false;
      const what = extend ? UJ.tracepad.extendStroke(PAD, padTol(1.2), padTol(15))
                          : UJ.tracepad.endStroke(PAD, padTol(1.2));
      PAD_HOVER = null;
      if (what === "extended" || what === "replaced"){
        padPaint(); padRings();
        padSay(what === "extended"
          ? "Contour continued from where the pen left it, and closed again. Alt+draw again to go on; Undo takes this part back."
          : "Contour mended — the stretch between where the stroke began and ended is replaced by it. Undo takes it back.");
        return;
      }
      if (extend && what === "ring"){
        const n0 = PAD.rings[PAD.rings.length - 1].points.length;
        padPaint(); padRings();
        padSay("A new contour, " + n0 + " points — alt+draw continues a contour only when it starts "
          + "on one of this structure’s, on this section.");
        return;
      }'''),
 (u"the help table says so",
  HELP_ROW,
  HELP_ROW + u'''
    "<tr><td style=\\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\\"><b>alt+draw</b> (option on a Mac)</td><td style=\\"padding:3px 0\\">Carries on a contour. Lifted the pen too early? Hold alt and draw on from where it stopped: the closing line across the gap goes and the new stroke goes in. End the stroke on the contour and it replaces the stretch between its two ends instead &mdash; redrawing a part that went wrong. Undo takes back just that part. A pen button set to alt in the tablet&rsquo;s driver does the same.</td></tr>",'''),
 (u"...and the tick box",
  u'''With this on, a plain drag DRAWS, so shift+drag is how you pan.\\"><input type=\\"checkbox\\" id=\\"tracePadPen\\">''',
  u'''With this on, a plain drag DRAWS, so shift+drag is how you pan. Lifted too early? Hold alt (option on a Mac) and draw on from where it stopped.\\"><input type=\\"checkbox\\" id=\\"tracePadPen\\">'''),
])
