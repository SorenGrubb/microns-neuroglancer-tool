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
           MIN_VERTICES: MIN_VERTICES, CLOSE_PX: CLOSE_PX };
})();
