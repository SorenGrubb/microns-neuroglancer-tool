# -*- coding: utf-8 -*-
u"""Line annotations that nearly meet become one contour, with each corner kept once.    2026-09-22

Søren: "I have previously used a normal line annotation to segment, which means that there are many
not exactly connected points, and points where there are 2 line annotations, instead of just one
point of a poly-line. Do you think we can register that and turn all the annotations in the same
z-plane into one polyline to save points?"

Chaining demanded that one segment's end and the next one's start agree to a HUNDREDTH of a voxel
(`key()` rounds to 1/100). Clicking a line tool round a cell never does that: each corner is two
clicks a voxel or two apart. So a hand-drawn outline chained into nothing -- twenty-four segments,
twenty-four two-point chains, all dropped as "unreadable" -- and where it did chain, every corner
was stored twice.

WITHIN ONE SECTION (chainLines is already called per z), ends that fall within a tolerance are the
same corner: the chain takes their MIDPOINT and keeps it once, so N segments give N vertices rather
than 2N, and a ring whose two ends nearly meet is closed the same way.

THE TOLERANCE IS MEASURED FROM THE DRAWING, not fixed: a third of the median segment length. A
click-to-click gap is a small fraction of a segment; a real gap -- an outline left open, two arcs on
one section -- is a whole segment or more, so it stays a gap and stays two contours. Nothing here
knows how big a voxel is, which is the rule the module is written to.

`seen.joined` counts the ends joined, so the card can say so.

Check: tracingcheck.js ("line annotations that nearly meet, as a person draws them").
Run: python3 src/lines_that_nearly_meet_are_one_contour.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(HERE, "core/tracing.js")
s = io.open(P, encoding="utf-8").read(); b = s


def edit(name, old, new):
    global s
    if new in s: print("  already there: " + name); return
    assert s.count(old) == 1, "%s: %d" % (name, s.count(old))
    s = s.replace(old, new, 1); print("  ok: " + name)


OLD = u'''  function chainLines(lines, seen){
    var ends = {}, i, L, kA, kB;
    for (i = 0; i < lines.length; i++){
      L = lines[i];
      kA = key(L.a); kB = key(L.b);
      (ends[kA] = ends[kA] || []).push(i);
      (ends[kB] = ends[kB] || []).push(i);
    }
    var used = {}, rings = [];
    for (i = 0; i < lines.length; i++){
      if (used[i]) continue;
      used[i] = 1;
      var pts = [lines[i].a, lines[i].b];
      var tail = lines[i].b;
      for (var guard = 0; guard < lines.length + 2; guard++){
        var cand = ends[key(tail)] || [], next = -1;
        for (var j = 0; j < cand.length; j++) if (!used[cand[j]]){ next = cand[j]; break; }
        if (next < 0) break;
        used[next] = 1;
        var L2 = lines[next];
        tail = same(L2.a, tail) ? L2.b : L2.a;
        pts.push(tail);
      }
      var ring = ringFrom(pts);
      if (ring.length >= 3) rings.push(ring);
      else seen.unreadable += 1;
    }
    return rings;
  }'''

NEW = u'''  /* ── LINES THAT NEARLY MEET ARE ONE CONTOUR ──────────────────────────────────  2026-09-22
     Søren: "I have previously used a normal line annotation to segment, which means that there are
     many not exactly connected points, and points where there are 2 line annotations, instead of
     just one point of a poly-line. Do you think we can register that and turn all the annotations
     in the same z-plane into one polyline to save points?"

     It demanded an exact meeting (key() rounds to a hundredth of a voxel), which two clicks never
     are, so a hand-drawn outline chained into nothing at all. Ends within `tol` are now the same
     corner: their MIDPOINT is kept, once -- N segments, N vertices, not 2N -- and a ring whose two
     ends nearly meet is closed the same way.

     THE TOLERANCE COMES FROM THE DRAWING: a third of the median segment length. A click-to-click
     gap is a small fraction of a segment; a gap that is a real gap is a segment or more, and stays
     one. This file still knows nothing about how big a voxel is. See
     src/lines_that_nearly_meet_are_one_contour.py. */
  function dist2d(a, b){ var dx = a[0] - b[0], dy = a[1] - b[1]; return Math.sqrt(dx * dx + dy * dy); }
  function midOf(a, b){ return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[2]]; }
  function joinTolerance(lines){
    var lens = [], i;
    for (i = 0; i < lines.length; i++) lens.push(dist2d(lines[i].a, lines[i].b));
    lens.sort(function(x, y){ return x - y; });
    var med = lens.length ? lens[lens.length >> 1] : 0;
    /* A third of a typical segment. Zero-length segments (a double click) leave med 0, and then
       only an exact meeting joins, which is what this did before. */
    return med > 0 ? med / 3 : 0;
  }
  function chainLines(lines, seen){
    var n = lines.length, i, j;
    if (!n) return [];
    var tol = joinTolerance(lines);
    /* Endpoints in a grid of tol-sized cells, so a chain of a thousand segments does not cost a
       million comparisons. Each entry is {li, end} -- which line, and which of its two ends. */
    var cell = tol > 0 ? tol : 1, grid = {};
    var at = function(p){ return Math.floor(p[0] / cell) + "|" + Math.floor(p[1] / cell); };
    var put = function(p, li, end){ var k = at(p); (grid[k] = grid[k] || []).push({ li: li, end: end }); };
    for (i = 0; i < n; i++){ put(lines[i].a, i, 0); put(lines[i].b, i, 1); }
    var used = {};
    /* The nearest unused end within tol, from anywhere but this line. */
    var nearest = function(p){
      var best = null, bd = tol, cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), dx, dy;
      for (dx = -1; dx <= 1; dx++) for (dy = -1; dy <= 1; dy++){
        var box = grid[(cx + dx) + "|" + (cy + dy)] || [];
        for (var k = 0; k < box.length; k++){
          var e = box[k];
          if (used[e.li]) continue;
          var q = e.end ? lines[e.li].b : lines[e.li].a;
          var d = dist2d(p, q);
          if (d <= bd){ bd = d; best = e; }
        }
      }
      return best;
    };
    var rings = [];
    for (i = 0; i < n; i++){
      if (used[i]) continue;
      used[i] = 1;
      var pts = [lines[i].a, lines[i].b];
      /* Forwards from the tail, then backwards from the head: a person does not always draw a
         contour in one direction, and a chain started in the middle would otherwise stop short. */
      var dir;
      for (dir = 0; dir < 2; dir++){
        for (var guard = 0; guard < n + 2; guard++){
          var tip = dir ? pts[0] : pts[pts.length - 1];
          var hit = nearest(tip);
          if (!hit) break;
          used[hit.li] = 1;
          var L2 = lines[hit.li];
          var near = hit.end ? L2.b : L2.a, far = hit.end ? L2.a : L2.b;
          var shared = midOf(tip, near);            // ONE corner out of the two clicks
          if (dir){ pts[0] = shared; pts.unshift(far); }
          else { pts[pts.length - 1] = shared; pts.push(far); }
          seen.joined = (seen.joined || 0) + 1;
        }
      }
      /* The two ends of a ring meet the same way its corners do. */
      if (pts.length > 2 && tol > 0 && dist2d(pts[0], pts[pts.length - 1]) <= tol){
        pts[0] = midOf(pts[0], pts[pts.length - 1]);
        pts.pop();
        seen.joined = (seen.joined || 0) + 1;
      }
      var ring = ringFrom(pts);
      if (ring.length >= 3) rings.push(ring);
      else seen.unreadable += 1;
    }
    return rings;
  }'''
edit(u"ends within a tolerance are one corner", OLD, NEW)
edit(u"...and the reader counts them",
     u'''    var seen = { volumes: 0, polygons: 0, polylines: 0, lines: 0, points: 0, unreadable: 0,
                 mixedZ: 0 };''',
     u'''    var seen = { volumes: 0, polygons: 0, polylines: 0, lines: 0, points: 0, unreadable: 0,
                 mixedZ: 0,
                 /* Ends of hand-drawn line annotations that were within a tolerance of each other
                    and became one vertex (2026-09-22). */
                 joined: 0 };''')
if s != b: io.open(P, "w", encoding="utf-8").write(s)

# And the card says it, because a reader that silently mends something should say what it mended.
P2 = os.path.join(HERE, "core/tracingcard.js")
s = io.open(P2, encoding="utf-8").read(); b = s
edit(u"the card says how many ends it joined",
     u'''  const fromWhat={points:"from "+r.seen.points+" points",lines:"from line annotations",''',
     u'''  /* JOINED ENDS, SAID OUT LOUD (2026-09-22). Line annotations drawn by hand do not meet
     exactly; the reader joins ends within a third of a segment and keeps one vertex where there
     were two. That is a change to his drawing, so it is reported rather than done quietly. */
  const fromWhat={points:"from "+r.seen.points+" points",
                  lines:"from "+r.seen.lines+" line annotations"
                       +(r.seen.joined?", "+r.seen.joined+" nearly-meeting ends joined into one "
                         +"vertex each":""),''')
if s != b: io.open(P2, "w", encoding="utf-8").write(s)
