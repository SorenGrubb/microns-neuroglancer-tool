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
    return { z: z || 0, pending: [], rings: [] };
  }

  function setZ(pad, z){
    /* A half-drawn contour belongs to the section it was drawn on. Carrying it to the next one
       would silently produce a ring whose vertices come from two sections -- which meshes, and is
       wrong in a way nothing downstream can see. */
    pad.pending = [];
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
    pad.rings.push({ z: pad.z, points: pad.pending.slice() });
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
      if (r.z === pad.z) out.push({ ring: i, points: r.points.length });
    });
    return out;
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
    return pad.rings.map(function(r, i){ return { z: r.z, points: r.points, i: i }; })
      .sort(function(a, b){ return (a.z - b.z) || (a.i - b.i); })
      .map(function(r){ return { z: r.z, points: r.points }; });
  }

  return { create: create, setZ: setZ, addVertex: addVertex, closeRing: closeRing,
           nearFirst: nearFirst, undo: undo, clearSection: clearSection,
           count: count, toRings: toRings,
           /* editing a contour that is already closed -- 2026-09-17 */
           hitVertex: hitVertex, moveVertex: moveVertex, deleteVertex: deleteVertex,
           hitEdge: hitEdge, insertVertex: insertVertex, deleteRing: deleteRing,
           onSection: onSection, vertexOf: vertexOf, pointsOf: pointsOf,
           MIN_VERTICES: MIN_VERTICES, CLOSE_PX: CLOSE_PX, GRAB_PX: GRAB_PX };
})();
