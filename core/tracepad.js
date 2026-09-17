/* core/tracepad.js — the polygon tool's state, with no DOM in it.                     2026-09-17

   Søren: *"A polygon tool is much easier for the user. Can you try to implement it?"* No viewer a
   pasted link can reach has one, so µJump draws the section itself (core/emtiles.js) and this is
   the tool that goes on it: vertices, the ring being drawn, the rings already closed, and the two
   decisions that make the thing usable — when a click closes a contour, and what Undo takes back.

   VERTICES ARE IN TOOL VOXELS, never in canvas pixels. Zooming from 32 nm to 8 nm and panning are
   both routine while tracing one cell, and either one would move a contour stored in pixels. The
   one place pixels are needed is hit-testing the first vertex, so `pxPerToolVoxel` is a parameter
   of exactly the two functions that test it and is stored nowhere.

   THE FIRST VERTEX IS THE CLOSE. Clicking it again is what ends a contour, which is the gesture
   every drawing program has and the one Søren asked to be able to see: it is drawn as an open ring
   from the moment it is placed, and lights up under the pointer. Enter and a double-click close it
   too, for anyone who expects those, but neither is the thing you are told about.

   Run: node tracepadcheck.js */
var UJ = UJ || {};
UJ.tracepad = (function(){
  "use strict";

  /* Three vertices is a triangle and the least that encloses anything; under that, a "close" is a
     mis-click rather than a contour, and closing on it would leave a line in the export. */
  var MIN_VERTICES = 3;
  /* How near the first vertex counts as clicking it. Generous, because the alternative -- not
     closing -- costs another lap of the cell, while closing early costs one Undo. */
  var CLOSE_PX = 10;
  /* How near counts as grabbing a vertex or an edge. Tighter than CLOSE_PX, because grabbing the
     wrong vertex silently moves part of a contour, while missing one costs a second click. */
  var GRAB_PX = 8;

  function create(z){
    /* `stroke` is the pen's raw path while it is down, and null every other moment -- see
       startStroke below. It is deliberately NOT `pending`: a half-drawn clicked contour survives
       everything except stepping a section, and a stroke exists only between press and lift. */
    /* ── SEVERAL OF THE SAME THING ─────────────────────────────────────────────  2026-09-17
       Søren: *"I want the option to draw more than one organelle of the same type, the extra added
       organelles should have different colors, so you can distinguish them, and when publishing
       they should have different numbers."*

       A cell has forty mitochondria, not one, and until now a pad held one structure: every contour
       on it was part of the same object, and two contours on one section were two blobs OF THAT
       OBJECT. So a ring now carries `inst` -- which of the things being drawn it belongs to -- and
       the pad carries the one being drawn now.

       IT IS AN INDEX, NOT AN IDENTITY. The number is 0, 1, 2 in the order they were started here;
       what they are CALLED when published (mitochondrion 3, 4, 5) is decided at submission from
       what the cell already has, because this module cannot know and should not guess. Kept
       separate on purpose: renumbering on publish must never renumber what is on the pad. */
    return { z: z || 0, pending: [], rings: [], stroke: null, inst: 0 };
  }

  function setZ(pad, z){
    /* A half-drawn contour belongs to the section it was drawn on. Carrying it to the next one
       would silently produce a ring whose vertices come from two sections -- which meshes, and is
       wrong in a way nothing downstream can see. */
    pad.pending = [];
    pad.stroke = null;
    pad.z = Math.round(z);
    return pad;
  }

  function nearFirst(pad, x, y, pxPerToolVoxel){
    if (pad.pending.length < MIN_VERTICES) return false;
    var f = pad.pending[0], k = pxPerToolVoxel || 1;
    var dx = (x - f[0]) * k, dy = (y - f[1]) * k;
    return Math.sqrt(dx * dx + dy * dy) <= CLOSE_PX;
  }

  /* Returns {closed:true} when this click finished a contour, so the caller can say so without
     having to work it out by comparing counts. */
  function addVertex(pad, x, y, pxPerToolVoxel){
    if (nearFirst(pad, x, y, pxPerToolVoxel)){
      closeRing(pad);
      return { closed: true, vertices: 0 };
    }
    pad.pending.push([Math.round(x), Math.round(y)]);
    return { closed: false, vertices: pad.pending.length };
  }

  function closeRing(pad){
    if (pad.pending.length < MIN_VERTICES) return false;
    pad.rings.push({ z: pad.z, points: pad.pending.slice(), inst: pad.inst || 0 });
    pad.pending = [];
    return true;
  }

  /* One step back, and which step depends on where you are: mid-contour it is the last vertex,
     between contours it is the last contour, on THIS section. Undoing a closed contour from
     another section while drawing here would be a surprise, and there is no way to see it happen
     from the section you are on. */
  function undo(pad){
    if (pad.pending.length){ pad.pending.pop(); return "vertex"; }
    for (var i = pad.rings.length - 1; i >= 0; i--)
      if (pad.rings[i].z === pad.z){ pad.rings.splice(i, 1); return "ring"; }
    return "";
  }

  function clearSection(pad){
    pad.pending = [];
    pad.rings = pad.rings.filter(function(r){ return r.z !== pad.z; });
    return pad;
  }

  /* ── EDITING A CONTOUR THAT IS ALREADY CLOSED ──────────────────────────────────  2026-09-17
     Søren: *"We also need a way to delete segmentations and correct if a line in the polyline is
     placed wrongly. Also, after the segmentation is done, it should be possible to move the
     polyline points individually."*

     Until now a closed contour was finished: Undo could throw the whole thing away and that was
     the only correction there was, so one misplaced vertex out of forty cost the other
     thirty-nine. Nothing here is a new kind of state -- a ring is still a list of points -- these
     are the four things you can do to one: find a vertex, move it, delete it, and put a new one in
     the middle of a segment that bulges the wrong way.

     ALL FOUR WORK ON THE SECTION YOU ARE ON, and on the pending contour as well as the closed
     ones, because "the one I can see" is the only set a person can mean. A hit on a ring from
     another section would be invisible, and correcting something you cannot see is worse than not
     being able to correct it at all. */

  /* `ring` is an index into pad.rings, or -1 for the contour being drawn. */
  function vertexOf(pad, ring, i){
    var pts = (ring < 0) ? pad.pending : (pad.rings[ring] && pad.rings[ring].points);
    return pts ? pts[i] : null;
  }
  function pointsOf(pad, ring){
    return (ring < 0) ? pad.pending : (pad.rings[ring] ? pad.rings[ring].points : null);
  }

  /* The vertex under the pointer, if any: the NEAREST one within the grab radius, searched over
     the contour being drawn and every closed contour on this section. Nearest rather than first,
     because two contours can touch and the one you meant is the one you are closer to. */
  function hitVertex(pad, x, y, pxPerToolVoxel){
    var k = pxPerToolVoxel || 1, best = null, bestD = GRAB_PX + 1;
    function scan(ring, pts){
      (pts || []).forEach(function(p, i){
        var d = Math.sqrt(Math.pow((x - p[0]) * k, 2) + Math.pow((y - p[1]) * k, 2));
        if (d < bestD){ bestD = d; best = { ring: ring, vertex: i, dPx: d }; }
      });
    }
    scan(-1, pad.pending);
    pad.rings.forEach(function(r, i){ if (r.z === pad.z) scan(i, r.points); });
    return best;
  }

  function moveVertex(pad, hit, x, y){
    if (!hit) return false;
    var pts = pointsOf(pad, hit.ring);
    if (!pts || !pts[hit.vertex]) return false;
    pts[hit.vertex] = [Math.round(x), Math.round(y)];
    return true;
  }

  /* Deleting a vertex can end the contour: two points enclose nothing, so a ring that falls under
     three is removed rather than left as a line that would still mesh into a sliver. Says which
     happened, so the pad can tell him rather than leave him to notice. */
  function deleteVertex(pad, hit){
    if (!hit) return "";
    var pts = pointsOf(pad, hit.ring);
    if (!pts || !pts[hit.vertex]) return "";
    pts.splice(hit.vertex, 1);
    if (hit.ring >= 0 && pts.length < MIN_VERTICES){
      pad.rings.splice(hit.ring, 1);
      return "ring";
    }
    return "vertex";
  }

  function deleteRing(pad, ring){
    if (ring < 0){ var had = pad.pending.length > 0; pad.pending = []; return had; }
    if (!pad.rings[ring]) return false;
    pad.rings.splice(ring, 1);
    return true;
  }

  /* The segment under the pointer. "A line in the polyline is placed wrongly" is usually a corner
     that needs one more point in it, not a vertex in the wrong place -- so this finds the EDGE and
     insertVertex puts a point on it, between the two it runs between. */
  function hitEdge(pad, x, y, pxPerToolVoxel){
    var k = pxPerToolVoxel || 1, best = null, bestD = GRAB_PX + 1;
    function scan(ring, pts){
      if (!pts || pts.length < 2) return;
      /* A closed contour has one more segment than a ring of points: the one back to the start.
         The contour being drawn does not -- it has not been closed yet. */
      var n = (ring < 0) ? pts.length - 1 : pts.length;
      for (var i = 0; i < n; i++){
        var a = pts[i], b = pts[(i + 1) % pts.length];
        var d = pointToSegmentPx(x, y, a, b, k);
        if (d < bestD){ bestD = d; best = { ring: ring, after: i, dPx: d }; }
      }
    }
    scan(-1, pad.pending);
    pad.rings.forEach(function(r, i){ if (r.z === pad.z) scan(i, r.points); });
    return best;
  }

  function pointToSegmentPx(x, y, a, b, k){
    var vx = b[0] - a[0], vy = b[1] - a[1];
    var wx = x - a[0], wy = y - a[1];
    var len2 = vx * vx + vy * vy;
    var t = len2 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;
    var dx = (x - (a[0] + t * vx)) * k, dy = (y - (a[1] + t * vy)) * k;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function insertVertex(pad, hit, x, y){
    if (!hit) return false;
    var pts = pointsOf(pad, hit.ring);
    if (!pts) return false;
    pts.splice(hit.after + 1, 0, [Math.round(x), Math.round(y)]);
    return true;
  }

  /* The contours on the section you are on, with their index into pad.rings, for a per-contour
     delete. Returned rather than rendered: this module has no DOM in it. */
  function onSection(pad){
    var out = [];
    pad.rings.forEach(function(r, i){
      if (r.z === pad.z) out.push({ ring: i, points: r.points.length, inst: r.inst || 0 });
    });
    return out;
  }

  /* ── THE STRUCTURES ON THIS PAD ────────────────────────────────────────────────  2026-09-17
     One entry per thing being drawn, in the order they were started, each with the contours that
     belong to it. An instance with no contours yet is still listed while it is the one selected --
     starting a second mitochondrion and then looking at the list should show two, not one and a
     mystery. */
  function instances(pad){
    var by = {}, order = [];
    (pad.rings || []).forEach(function(r){
      var k = r.inst || 0;
      if (!by[k]){ by[k] = { inst: k, rings: [], sections: {} }; order.push(k); }
      by[k].rings.push(r);
      by[k].sections[r.z] = 1;
    });
    var cur = pad.inst || 0;
    if (!by[cur]){ by[cur] = { inst: cur, rings: [], sections: {} }; order.push(cur); }
    order.sort(function(a, b){ return a - b; });
    return order.map(function(k){
      return { inst: k, rings: by[k].rings, contours: by[k].rings.length,
               sections: Object.keys(by[k].sections).length };
    });
  }
  /* The next free index, which is one past the highest USED -- not the count. Deleting the second
     of three and starting a new one must not reuse the number of the one still on the pad. */
  function newInstance(pad){
    var top = -1;
    (pad.rings || []).forEach(function(r){ if ((r.inst || 0) > top) top = r.inst || 0; });
    if ((pad.inst || 0) > top) top = pad.inst || 0;
    pad.inst = top + 1;
    pad.pending = [];
    pad.stroke = null;
    return pad.inst;
  }
  function setInstance(pad, i){
    pad.inst = Math.max(0, Math.round(i) || 0);
    pad.pending = [];
    pad.stroke = null;
    return pad.inst;
  }

  function count(pad){
    var z = {};
    pad.rings.forEach(function(r){ z[r.z] = 1; });
    return { rings: pad.rings.length, sections: Object.keys(z).length,
             pending: pad.pending.length,
             onThisSection: pad.rings.filter(function(r){ return r.z === pad.z; }).length };
  }

  /* Out in the same shape ringsFromLink() produces, so everything downstream -- the naming fields,
     Keep, Share, the Blender export -- cannot tell a drawn contour from a pasted one. Sorted by
     section, then by the order they were drawn within it, because a sheet guarantees no order and
     trace_mesh.py reads them in the order it is given. */
  function toRings(pad){
    return pad.rings.map(function(r, i){ return { z: r.z, points: r.points, i: i, inst: r.inst || 0 }; })
      .sort(function(a, b){ return (a.z - b.z) || (a.i - b.i); })
      /* `inst` rides along. Everything downstream that does not care about several structures --
         the volume, the loft, the export of one of them -- simply never looks at it, and the one
         place that does (the card, splitting a pad into one submission per structure) has it
         without a second shape to carry. */
      .map(function(r){ return { z: r.z, points: r.points, inst: r.inst || 0 }; });
  }

  /* ── DRAWING IT, RATHER THAN CLICKING IT ────────────────────────────────────────  2026-09-17
     Søren: *"Could we have an option to click and draw the mouse around a structure to mimic using
     a pen to draw, so that you can use a e.g. Kamvas 13 pad or a Apple pen to draw the polylines?"*

     He has a pen display and the gesture it is built for is one stroke round the cell, not forty
     clicks. So: press, go round, lift — and what comes back is an ordinary contour, indistinguishable
     from a clicked one, which is the property that matters. Every correction gesture that exists
     (drag a point, delete a point, put one in a line, remove the contour) works on it unchanged,
     because there is nothing new in the state: a ring is still a list of points.

     A RAW STROKE IS NOT A CONTOUR, and this is the whole of the work. A pen samples at the display's
     refresh rate; going round a soma takes a second and arrives as five hundred points a fifth of a
     pixel apart. Kept, that would be a contour nobody can edit (five hundred handles on top of each
     other), forty times the storage of a clicked one, and no more accurate — the extra points record
     the hand's tremor, not the membrane. So the stroke is thinned twice:

       WHILE DRAWING, by distance: a sample nearer than `minStep` to the last kept one is dropped.
       That is a cheap guard against a stationary pen emitting hundreds of identical points.

       ON LIFTING, by Ramer-Douglas-Peucker: the points whose removal moves the line by less than
       `tol` go, and the corners stay. It is the right algorithm here because its tolerance is a
       DISTANCE -- "within a pixel of where I drew" is a promise about the picture, which is what
       the tracer is looking at, unlike a target vertex count which would smooth a careful outline
       and a scribble to the same length.

     Both tolerances are in TOOL VOXELS, like everything else in this file; the caller converts from
     pixels through the view's pxPerToolVoxel, so the thinning is the same on screen at every zoom.  */
  function startStroke(pad, x, y){
    pad.stroke = [[Math.round(x), Math.round(y)]];
    return pad;
  }
  function strokePoint(pad, x, y, minStep){
    if (!pad.stroke || !pad.stroke.length) return startStroke(pad, x, y);
    var last = pad.stroke[pad.stroke.length - 1];
    var dx = x - last[0], dy = y - last[1];
    if (Math.sqrt(dx * dx + dy * dy) < (minStep || 0)) return pad;
    pad.stroke.push([Math.round(x), Math.round(y)]);
    return pad;
  }

  /* Perpendicular distance from p to the line through a and b -- or to a, when a and b are the same
     point, which happens on a stroke that doubled back exactly. */
  function perp(p, a, b){
    var vx = b[0] - a[0], vy = b[1] - a[1];
    var len = Math.sqrt(vx * vx + vy * vy);
    if (!len) return Math.sqrt(Math.pow(p[0] - a[0], 2) + Math.pow(p[1] - a[1], 2));
    return Math.abs(vy * p[0] - vx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
  }
  /* Ramer-Douglas-Peucker, iterative. Recursion would be fine for a hand-drawn stroke and is one
     deep call away from not being: a pen held down for a minute is tens of thousands of points, and
     a stack overflow in the middle of somebody's tracing is a poor way to find that out. */
  function simplify(points, tol){
    var n = (points || []).length;
    if (n < 3 || !(tol > 0)) return (points || []).slice();
    var keep = new Array(n);
    for (var i = 0; i < n; i++) keep[i] = false;
    keep[0] = keep[n - 1] = true;
    var stack = [[0, n - 1]];
    while (stack.length){
      var seg = stack.pop(), a = seg[0], b = seg[1];
      var worst = -1, at = -1;
      for (var k = a + 1; k < b; k++){
        var d = perp(points[k], points[a], points[b]);
        if (d > worst){ worst = d; at = k; }
      }
      if (worst > tol && at > 0){
        keep[at] = true;
        stack.push([a, at]); stack.push([at, b]);
      }
    }
    var out = [];
    for (var j = 0; j < n; j++) if (keep[j]) out.push(points[j]);
    return out;
  }

  /* A CLOSED STROKE IS NOT AN OPEN ONE, and plain Ramer-Douglas-Peucker does not know it.
     Its first step measures every sample against the line from the FIRST to the LAST -- and a stroke
     drawn all the way round a cell ends where it began, so that "line" is a point. perp() has a
     fallback for exactly that (it measures to the point instead), which is why the open version does
     not misbehave; but the first split is then decided by distance-from-a-point rather than by the
     tolerance, and the shape of the answer rests on a fallback rather than on the algorithm.

     HONEST ABOUT THE SIZE OF IT: this is a tidiness fix, not a rescue. Measured on a 400-sample
     circle whose ends coincide, plain RDP keeps 33 vertices and this keeps 32 -- the degenerate step
     costs one extra point, not a disaster, and the two outlines differ in area by well under a
     percent (traceloftcheck's neighbours assert both). It is kept because cutting the ring at the
     sample FARTHEST from the first -- roughly the other side of the cell -- makes both halves
     genuine open paths, so the thinning means what its tolerance says it means at every step. */
  function simplifyClosed(points, tol){
    var n = (points || []).length;
    if (n < 4 || !(tol > 0)) return (points || []).slice();
    var far = 0, best = -1;
    for (var i = 1; i < n; i++){
      var d = Math.pow(points[i][0] - points[0][0], 2) + Math.pow(points[i][1] - points[0][1], 2);
      if (d > best){ best = d; far = i; }
    }
    var head = simplify(points.slice(0, far + 1), tol);
    var tail = simplify(points.slice(far), tol);
    var ring = head.concat(tail.slice(1));           // points[far] belongs to both halves
    /* The ends of a stroke round a cell are two samples beside each other, and joining them is what
       closing means -- so a last point within the tolerance of the first is the same point twice. */
    while (ring.length > MIN_VERTICES
           && Math.sqrt(Math.pow(ring[ring.length-1][0] - ring[0][0], 2)
                      + Math.pow(ring[ring.length-1][1] - ring[0][1], 2)) <= tol) ring.pop();
    return ring;
  }

  /* Lifting the pen closes the contour. Returns "" when the stroke was not one -- a tap, a twitch,
     a pen put down and lifted without going anywhere -- so the caller can treat that as the click it
     almost certainly was, rather than leaving a two-point sliver in the tracing. */
  function endStroke(pad, tol){
    var raw = pad.stroke || [];
    pad.stroke = null;
    if (raw.length < MIN_VERTICES) return "";
    var ring = simplifyClosed(raw, tol || 0);
    if (ring.length < MIN_VERTICES) return "";
    pad.rings.push({ z: pad.z, points: ring, inst: pad.inst || 0 });
    pad.pending = [];
    return "ring";
  }

  return { create: create, setZ: setZ, addVertex: addVertex, closeRing: closeRing,
           instances: instances, newInstance: newInstance, setInstance: setInstance,
           startStroke: startStroke, strokePoint: strokePoint, endStroke: endStroke,
           simplify: simplify, simplifyClosed: simplifyClosed,
           nearFirst: nearFirst, undo: undo, clearSection: clearSection,
           count: count, toRings: toRings,
           /* editing a contour that is already closed -- 2026-09-17 */
           hitVertex: hitVertex, moveVertex: moveVertex, deleteVertex: deleteVertex,
           hitEdge: hitEdge, insertVertex: insertVertex, deleteRing: deleteRing,
           onSection: onSection, vertexOf: vertexOf, pointsOf: pointsOf,
           MIN_VERTICES: MIN_VERTICES, CLOSE_PX: CLOSE_PX, GRAB_PX: GRAB_PX };
})();
