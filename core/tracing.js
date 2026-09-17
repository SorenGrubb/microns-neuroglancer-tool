/* ── CONTOURS OUT OF A PASTED LINK ──────────────────────────────────────────────  2026-09-16

   Stage 1 of tracing a cell the segmentation does not have. `trace_mesh.py` already turns a stack
   of closed contours into a surface and puts it in the Blender scene; this is the half that gets
   the contours out of a viewer and into a shape the backend can store.

   TWO SOURCES, ONE ANSWER, because there are two ways to draw a contour today:

   1. BRAINSHARER'S POLYGON TOOL. Their Neuroglancer fork adds POLYGON and VOLUME annotation types
      (src/neuroglancer/annotation/index.ts, read 2026-09-16). A Polygon is a `Collection`: it
      stores only a `source` point and `childAnnotationIds`, and its GEOMETRY IS ORDINARY LINE
      ANNOTATIONS. A Volume is a Collection of Polygons. Everything sits in ONE FLAT LIST, each
      child carrying `parentAnnotationId`, and all of it round-trips through toJSON -- so it
      arrives in the state URL, not only in their database. `annotationToJson` writes
      `type = AnnotationType[...].toLowerCase()`, so the strings are "polygon", "volume", "line".

   2. PLAIN LINES, in the stock MICrONS viewer, which has no polygon tool. Draw the outline as a
      chain of line annotations on each section and this joins them up. Tedious to draw, nothing to
      install, works today.

   The caller gets the same rings either way, so the drawing tool can change later without anything
   downstream noticing -- which is the point of doing it in this order.

   WHY ITS OWN DECODER. The first eight lines duplicate core/organelles.js's markersFromLink. That
   is deliberate and it is not free: organelles.js is INLINED into ωJump by build_wjump.py, whose
   reseed guard currently refuses to rewrite the page, so the copy there is patched by hand from the
   same generator pairs. Extracting a shared decoder would mean a hand edit in a file no generator
   can write. tracingcheck.js instead asserts the two decoders AGREE -- same verdict, same error,
   on the same inputs -- which is the property that actually matters.

   COORDINATES ARE THE TOOL'S OWN VOXELS, untouched. Neuroglancer writes the annotation layer's
   coordinate space, which for every tool in this family is the same grid the coordinate box uses.
   trace_mesh.py converts to nanometres itself, from a resolution the page passes it. Nothing here
   should know how big a voxel is.  */
window.UJ = window.UJ || {};
UJ.tracing = (function(){
  "use strict";

  function decode(text){
    if (!text || !String(text).trim()) return { error: "nothing pasted" };
    var t = String(text).trim();
    var hash = t.indexOf("#!");
    if (hash >= 0) t = t.slice(hash + 2);
    if (/%7B|%22/i.test(t)){ try { t = decodeURIComponent(t); } catch (e){} }
    t = t.trim();
    if (t.charAt(0) !== "{") return { error: "that does not look like a Neuroglancer link" };
    try { return { state: JSON.parse(t) }; }
    catch (e){ return { error: "that link's state is not valid JSON — copy the whole address "
                             + "bar, not part of it" }; }
  }

  function trip(v){
    if (!v || v.length < 2) return null;
    for (var i = 0; i < Math.min(v.length, 3); i++) if (!isFinite(Number(v[i]))) return null;
    return [Number(v[0]), Number(v[1]), v.length > 2 ? Number(v[2]) : 0];
  }
  function key(p){ return Math.round(p[0] * 100) + "|" + Math.round(p[1] * 100); }
  function same(a, b){ return key(a) === key(b); }

  /* The section a ring sits on. Every point of a contour drawn on one section shares a z; a ring
     whose points disagree is reported rather than averaged into a plane that was never drawn. */
  function sectionOf(points){
    var zs = points.map(function(p){ return Math.round(p[2]); });
    var first = zs[0], mixed = false;
    for (var i = 1; i < zs.length; i++) if (zs[i] !== first) mixed = true;
    return { z: first, mixed: mixed };
  }

  function ringFrom(points, closeIt){
    var out = [], i;
    for (i = 0; i < points.length; i++){
      if (out.length && same(out[out.length - 1], points[i])) continue;
      out.push(points[i]);
    }
    /* A closed ring is stored open: the last point is not a repeat of the first. Every consumer --
       the even-odd fill in trace_mesh.py included -- closes it itself, and storing the repeat once
       meant two different lengths for the same contour. */
    if (closeIt !== false && out.length > 2 && same(out[0], out[out.length - 1])) out.pop();
    return out;
  }

  /* ── 1. polygons, as BrainSharer writes them ───────────────────────────────────────────────── */
  function polygonRing(poly, byId, seen){
    var ids = poly.childAnnotationIds || [];
    var kids = [];
    var i, a;
    for (i = 0; i < ids.length; i++){ a = byId[ids[i]]; if (a) kids.push(a); }
    if (!kids.length){
      /* No childAnnotationIds, or ids that name nothing: fall back to the other direction of the
         same link. Both are written, so either can be the one that survived an edit. */
      for (var k in byId){
        a = byId[k];
        if (a && a.parentAnnotationId === poly.id) kids.push(a);
      }
    }
    var pts = [];
    for (i = 0; i < kids.length; i++){
      var A = trip(kids[i].pointA), B = trip(kids[i].pointB);
      if (!A || !B){ seen.unreadable++; continue; }
      /* The children are in the order they were drawn, so pointA of each is the ring in order and
         no chaining is needed. The last segment's far end closes it. */
      pts.push(A);
      if (i === kids.length - 1) pts.push(B);
    }
    return ringFrom(pts);
  }

  /* ── 2. loose lines, in a viewer with no polygon tool ──────────────────────────────────────── */
  function chainLines(lines, seen){
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
  }

  /* ── what a link contains ──────────────────────────────────────────────────────────────────── */
  function ringsFromLink(text, layerName){
    var d = decode(text);
    if (d.error) return { ok: false, error: d.error, structures: [], rings: [] };
    var st = d.state;
    var seen = { volumes: 0, polygons: 0, lines: 0, unreadable: 0, mixedZ: 0 };
    var byId = {}, polys = [], vols = [], loose = [], layers = 0;

    /* WHICH ANNOTATION LAYERS COUNT, when nobody named one.  2026-09-17
       A pasted µJump link normally carries "Cortical layers" -- the pia/white-matter bands, which
       are `line` annotations in a local annotation layer exactly like a hand-drawn contour. Read
       as contours they chain into rings spanning the whole dataset, quietly, and the result still
       meshes. So: never read them.

       And a link from the card's own "Open a viewer to trace in" button carries a layer called
       "tracing". If one is there, it is the answer and nothing else needs looking at -- which
       means the layer box can stay empty in the ordinary case instead of being a name he has to
       match by hand. */
    var annLayers = (st.layers || []).filter(function(l){
      return l && l.type === "annotation" && !/^cortical layers$/i.test(String(l.name || ""));
    });
    if (!layerName && annLayers.some(function(l){ return l.name === "tracing"; }))
      layerName = "tracing";

    annLayers.forEach(function(l){
      if (layerName && l.name !== layerName) return;
      layers++;
      (l.annotations || []).forEach(function(a){
        if (!a) return;
        if (a.id) byId[a.id] = a;
        var t = String(a.type || "").toLowerCase();
        if (t === "volume"){ vols.push(a); seen.volumes++; return; }
        if (t === "polygon"){ polys.push(a); seen.polygons++; return; }
        var A = trip(a.pointA), B = trip(a.pointB);
        if (A && B){ seen.lines++; if (!a.parentAnnotationId) loose.push({ a: A, b: B }); }
      });
    });

    if (!layers)
      return { ok: false, structures: [], rings: [], seen: seen,
               error: layerName ? ('that link has no annotation layer called "' + layerName + '"')
                                : "that link has no annotation layer on it" };

    var structures = [], all = [];
    function addRing(ring, into){
      if (ring.length < 3) return;
      var s = sectionOf(ring);
      if (s.mixed) seen.mixedZ++;
      var r = { z: s.z, points: ring.map(function(p){ return [p[0], p[1]]; }) };
      into.push(r); all.push(r);
    }

    if (polys.length){
      /* A Volume names which polygons are one structure. Without one, every polygon in the layer
         is taken as the same structure -- which is what a person drawing one cell in one layer
         means, and the alternative (a structure per contour) is never what anybody wants. */
      var claimed = {};
      vols.forEach(function(v){
        var rings = [];
        (v.childAnnotationIds || []).forEach(function(pid){
          var p = byId[pid];
          if (!p || String(p.type || "").toLowerCase() !== "polygon") return;
          claimed[pid] = 1;
          addRing(polygonRing(p, byId, seen), rings);
        });
        if (rings.length)
          structures.push({ name: v.description || "", rings: rings, from: "volume" });
      });
      var orphan = [];
      polys.forEach(function(p){
        if (claimed[p.id]) return;
        addRing(polygonRing(p, byId, seen), orphan);
      });
      if (orphan.length) structures.push({ name: "", rings: orphan, from: "polygons" });
    } else if (loose.length){
      /* Lines with no polygon around them: one section at a time, joined end to end. */
      var byZ = {};
      loose.forEach(function(L){
        var z = Math.round((L.a[2] + L.b[2]) / 2);
        (byZ[z] = byZ[z] || []).push(L);
      });
      var rings2 = [];
      Object.keys(byZ).map(Number).sort(function(x, y){ return x - y; }).forEach(function(z){
        chainLines(byZ[z], seen).forEach(function(r){ addRing(r, rings2); });
      });
      if (rings2.length) structures.push({ name: "", rings: rings2, from: "lines" });
    }

    if (!all.length)
      return { ok: false, structures: [], rings: [], seen: seen,
               error: "that link has an annotation layer but no closed contours on it — draw "
                    + "a polygon, or an outline of line annotations, on at least two sections." };
    return { ok: true, structures: structures, rings: all, seen: seen };
  }

  /* ── storage ───────────────────────────────────────────────────────────────────────────────────
     ONE ROW PER RING, which is what makes this fit a spreadsheet at all: a ring of forty points is
     about four hundred characters, a cell over sixty sections is sixty rows, and nothing has to be
     split across rows or reassembled in an order the sheet does not guarantee. `ringIndex` is
     within its section, so two contours on one section are two rows that both say which.

     There is NO CONSENSUS on a tracing -- Søren, 2026-09-16: "I don't think the traced structures
     should have consensus handling, but it should be marked who traced the structures." The
     reporter's name comes from the sign-in, the same as every other report, so nothing here
     carries a name; `structureId` ties the rows of one tracing together. */
  function encodePoints(points){
    return points.map(function(p){
      return Math.round(p[0]) + "," + Math.round(p[1]);
    }).join(";");
  }
  function decodePoints(s){
    if (!s) return [];
    return String(s).split(";").map(function(pair){
      var xy = pair.split(",");
      return [Number(xy[0]), Number(xy[1])];
    }).filter(function(p){ return isFinite(p[0]) && isFinite(p[1]); });
  }

  function structureId(name, stamp){
    /* Readable, unique per submission, and stable within one: the rows of one tracing have to find
       each other on the way back out, and a reader looking at the sheet should be able to tell
       which cell a row belongs to without a join. */
    var slug = String(name || "traced").toLowerCase().replace(/[^a-z0-9]+/g, "-")
                 .replace(/^-|-$/g, "").slice(0, 40) || "traced";
    return slug + "_" + (stamp || Date.now());
  }

  function ringsToRows(rings, meta){
    meta = meta || {};
    var id = meta.structureId || structureId(meta.name, meta.stamp);
    var perZ = {};
    return (rings || []).map(function(r){
      var z = Math.round(r.z);
      perZ[z] = (perZ[z] || 0);
      var row = { type: "traced_structure", structureId: id,
                  name: meta.name || "", cellType: meta.cellType || "",
                  color: meta.color || "", nucleusId: meta.nucleusId || "",
                  rootId: meta.rootId || "",
                  z: z, ringIndex: perZ[z], points: encodePoints(r.points),
                  pointCount: r.points.length, comment: meta.comment || "" };
      perZ[z]++;
      return row;
    });
  }

  function rowsToStructures(rows){
    var by = {};
    (rows || []).forEach(function(r){
      if (!r) return;
      var id = r.structureId || "";
      if (!id) return;
      /* KEYED BY TRACING *AND* TRACER.  2026-09-17
         No consensus handling here, by instruction -- so two people who outline the same cell are
         two tracings and must stay two tracings. Keying by structureId alone interleaved their
         rings into a single object whose shape depended on who posted last, which is consensus
         handling arrived at by accident, and the worst kind: silent, and wrong in a way that looks
         like a mesh. `reporterName` is what the backend sends back; `tracedBy` is what a structure
         already read once carries, so a round trip through this function is stable. */
      var who = String(r.reporterName || r.tracedBy || "");
      var key = id + "|" + who;
      var s = by[key] || (by[key] = { structureId: id, tracedBy: who, name: r.name || "",
                                    cellType: r.cellType || "", color: r.color || "",
                                    nucleusId: r.nucleusId || "", rootId: r.rootId || "",
                                    tracedBy: r.reporterName || r.tracedBy || "", rings: [] });
      if (!s.name && r.name) s.name = r.name;
      if (!s.tracedBy && (r.reporterName || r.tracedBy)) s.tracedBy = r.reporterName || r.tracedBy;
      var pts = decodePoints(r.points);
      if (pts.length >= 3) s.rings.push({ z: Number(r.z), points: pts,
                                          ringIndex: Number(r.ringIndex || 0) });
    });
    return Object.keys(by).map(function(k){
      var s = by[k];
      s.rings.sort(function(a, b){ return (a.z - b.z) || (a.ringIndex - b.ringIndex); });
      s.sections = s.rings.reduce(function(acc, r){
        if (acc.indexOf(r.z) < 0) acc.push(r.z); return acc;
      }, []).length;
      return s;
    });
  }

  /* What the Blender panel writes into the notebook's TRACINGS. The names are trace_mesh.py's, so
     a structure read back out of the sheet goes straight in with no translation. */
  function toTracings(structures){
    return (structures || []).map(function(s){
      var t = { name: s.name || s.structureId || "traced", type: s.cellType || "traced",
                traced_by: s.tracedBy || "",
                rings: (s.rings || []).map(function(r){ return { z: r.z, points: r.points }; }) };
      if (s.color) t.color = s.color;
      if (s.nucleusId) t.nucleus_id = String(s.nucleusId);
      return t;
    });
  }

  return { ringsFromLink: ringsFromLink, ringsToRows: ringsToRows,
           rowsToStructures: rowsToStructures, toTracings: toTracings,
           structureId: structureId,
           encodePoints: encodePoints, decodePoints: decodePoints };
})();
