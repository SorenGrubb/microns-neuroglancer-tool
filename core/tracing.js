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

  /* ── 0. polylines, as Spelunker writes them ────────────────────────────────────────  2026-09-18
     The whole contour in one `points` array, in order. ringFrom drops the closing repeat and any
     duplicate neighbours, so there is nothing else to do -- which is what makes this the cheapest
     shape to accept and, in hindsight, the most expensive thing to have got wrong. */
  function polylineRing(pl, seen){
    var pts = [], src = pl.points || [], i, P;
    for (i = 0; i < src.length; i++){
      P = trip(src[i]);
      if (P) pts.push(P); else seen.unreadable++;
    }
    return ringFrom(pts);
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
    var seen = { volumes: 0, polygons: 0, polylines: 0, lines: 0, points: 0, unreadable: 0,
                 mixedZ: 0 };
    var byId = {}, polys = [], plines = [], vols = [], loose = [], dots = [], layers = 0;

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
        /* ── POLYLINE, WHICH SPELUNKER DOES PUT IN THE LINK ────────────────────  2026-09-18
           Recorded here on 2026-09-17 as drawing on screen and never reaching the state. That was
           wrong -- Søren pasted the state and it is there, and in the best shape of anything this
           function reads: one annotation per contour, `points` in order, in the tool's own 4/4/40
           voxels, closed (last point repeats the first, which ringFrom already strips), all on one
           z. A polyline in progress is NOT in the state, which is the likeliest way a measurement
           taken with the tool still armed came back empty. */
        if (t === "polyline"){ plines.push(a); seen.polylines++; return; }
        if (t === "point"){
          /* ORDER IS THE CONTOUR. Neuroglancer appends a new annotation to this array, so points
             arrive in the order they were clicked -- measured on ngl.microns-explorer.org,
             2026-09-17. Going round a cell in one direction therefore needs no chaining at all. */
          var P = trip(a.point);
          if (P && !a.parentAnnotationId){ seen.points++; dots.push(P); }
          return;
        }
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

    if (polys.length || plines.length){
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
      /* Polylines join the same structure as any loose polygons: somebody drawing one cell in one
         layer means one cell, and a structure per contour is never what anybody wants. They are
         never inside a Volume -- nothing that writes Volumes writes polylines -- so they are all
         orphans by definition. */
      plines.forEach(function(p){ addRing(polylineRing(p, seen), orphan); });
      if (orphan.length)
        structures.push({ name: "", rings: orphan,
                          from: plines.length ? (polys.length ? "shapes" : "polylines") : "polygons" });
    } else {
      /* LINES BEFORE POINTS, AND POINTS ONLY IF THE LINES GAVE NOTHING.  2026-09-17
         Each order protects the other shape's accident: a stray point left in a line tracing
         cannot invent a vertex, and a stray line left in a point tracing cannot suppress it
         (one segment never chains into a ring, so rings2 comes back empty and the points run). */
      var rings2 = [], from = "lines";
      if (loose.length){
        /* Lines with no polygon around them: one section at a time, joined end to end. */
        var byZ = {};
        loose.forEach(function(L){
          var z = Math.round((L.a[2] + L.b[2]) / 2);
          (byZ[z] = byZ[z] || []).push(L);
        });
        Object.keys(byZ).map(Number).sort(function(x, y){ return x - y; }).forEach(function(z){
          chainLines(byZ[z], seen).forEach(function(r){ addRing(r, rings2); });
        });
      }
      if (!rings2.length && dots.length){
        /* A ring of points, in the order they were clicked. No viewer a pasted link can reach has
           a polygon tool -- measured 2026-09-17 -- and the point tool is one click per vertex
           against the line tool's two, so this is the ordinary way to trace, not a fallback. */
        from = "points";
        var pZ = {};
        dots.forEach(function(P){ var z = Math.round(P[2]); (pZ[z] = pZ[z] || []).push(P); });
        Object.keys(pZ).map(Number).sort(function(x, y){ return x - y; }).forEach(function(z){
          addRing(pZ[z], rings2);   // addRing drops anything under 3 points of its own accord
        });
      }
      if (rings2.length) structures.push({ name: "", rings: rings2, from: from });
    }

    if (!all.length)
      return { ok: false, structures: [], rings: [], seen: seen,
               error: "that link has an annotation layer but no contours on it — ring the cell "
                    + "with POINT annotations (ctrl+click each vertex, going round one way), at "
                    + "least three to a section and on at least two sections. Lines and polygons "
                    + "are read too." };
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

  /* ── ONE COLOUR EACH, AND THE SAME ONES THE SCENE USES ─────────────────────────  2026-09-17
     Søren: *"the extra added organelles should have different colors, so you can distinguish
     them."*

     This is blender/colour_policy.py's CELL_PALETTE, value for value, and it is copied rather than
     invented for the reason that file gives: red MEANS vessel (#b03a48) and blue MEANS nucleus
     (#3a72d8), so the palette reserves hues 335-25 and 200-250 and contains neither. A second
     palette chosen here would put a mitochondrion in nucleus blue on the pad and something else
     entirely in the .blend, and the two pictures would disagree about what a colour means.

     IN BISECTION ORDER, also from that file: the first two entries are far apart in hue, and the
     first four, and so on -- because most tracings are two or three structures, and two neighbouring
     greens would defeat the point of colouring them at all. */
  var INSTANCE_COLOURS = [
    "#40e28c", "#bfdd78", "#9740e2", "#ddc478", "#56e240",
    "#78dadd", "#e240e2", "#ddab78", "#e2e240", "#a2dd78",
    "#40e25b", "#78ddc4", "#7140e2", "#c678dd", "#e240b7"
  ];
  function instanceColour(i){
    return INSTANCE_COLOURS[((Math.round(i) || 0) % INSTANCE_COLOURS.length + INSTANCE_COLOURS.length)
                            % INSTANCE_COLOURS.length];
  }

  /* What the thing is called once there are several of them. The ontology label stays the `kind`
     -- that is the join, and it must not gain a number -- so the number goes on the NAME, which is
     what a person reads on the sheet, in the Blender outliner and on the cell's own panel. One of a
     kind keeps its plain label: "Nucleus 1" would be a strange way to say there is one. */
  function instanceName(label, index, several){
    var n = Math.round(index) || 0;
    if (!several || n < 1) return String(label || "");
    return String(label || "") + " " + n;
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
                  name: meta.name || "", kind: meta.kind || "", cellType: meta.cellType || "",
                  color: meta.color || "", nucleusId: meta.nucleusId || "",
                  rootId: meta.rootId || "",
                  z: z, ringIndex: perZ[z], points: encodePoints(r.points),
                  pointCount: r.points.length, comment: meta.comment || "" };
      perZ[z]++;
      return row;
    });
  }

  /* ── ONE SUBMISSION FOR A WHOLE TRACING ─────────────────────────────────────────  2026-09-17
     Søren: "I imagine that these segmentations will quickly fill up the Google sheet and make it
     very slow... saved in a different file on the Google drive."

     So the geometry no longer goes into the sheet at all: the backend writes it to one JSON file in
     Drive and keeps a single index row pointing at it. That makes a share ONE submission carrying
     every contour, where it used to be one POST per contour -- µJump posts no-cors and cannot read
     a response either way, so the old shape bought N round trips and nothing else.

     ringsToRows() stays: it is still the shape a tracing comes BACK in, and rowsToStructures()
     below is still what reads it. What changed is only which direction the sheet is involved in. */
  function toSubmission(rings, meta){
    meta = meta || {};
    var id = meta.structureId || structureId(meta.name, meta.stamp);
    var perZ = {};
    var contours = (rings || []).map(function(r){
      var z = Math.round(r.z);
      perZ[z] = (perZ[z] || 0);
      var c = { z: z, ringIndex: perZ[z], points: encodePoints(r.points) };
      perZ[z]++;
      return c;
    }).filter(function(c){ return c.points; });
    var out = { type: "traced_structure", structureId: id,
                name: meta.name || "", kind: meta.kind || "", cellType: meta.cellType || "",
                color: meta.color || "", nucleusId: meta.nucleusId || "", rootId: meta.rootId || "",
                comment: meta.comment || "",
                sections: Object.keys(perZ).length, contours: contours };
    /* ── HOW BIG IT IS, CARRIED WITH IT ───────────────────────────────────────────  2026-09-17
       Søren: *"We need to calculate the organelle volumes also and add the volumes to the data for
       the cell when submitting."*

       Measured by core/traceloft.js from these same contours and handed in, rather than computed
       here: this file is the storage shape and knows nothing about geometry, and the page already
       has the number on screen before anybody presses anything. Passing it through means the number
       stored is THE NUMBER HE SAW, which is worth more than a second, independent computation that
       could quietly disagree with the one that persuaded him to submit.

       `areas` is per section and goes to the Drive file only -- a few hundred bytes, and the thing
       anybody re-analysing a tracing wants first. */
    /* WHICH ONE OF SEVERAL. `instanceIndex` is the number it is published under -- 1-based, and
       decided by the page from what the cell already carries, not by counting what is in this
       submission. `instanceOf` is the kind it is one of, so a reader can group them without parsing
       the name. Absent on a tracing that is the only one of its kind, which is most of them. */
    if (meta.instanceIndex){
      out.instanceIndex = Math.round(meta.instanceIndex);
      out.instanceOf = meta.instanceOf || meta.kind || "";
    }
    if (meta.volumeUm3 !== undefined && meta.volumeUm3 !== null && isFinite(meta.volumeUm3)){
      out.volumeUm3 = Number(meta.volumeUm3);
      out.volumeMethod = meta.volumeMethod || "cavalieri";
      if (isFinite(meta.volumeTrapezoidUm3)) out.volumeTrapezoidUm3 = Number(meta.volumeTrapezoidUm3);
      if (isFinite(meta.sectionGapNm)) out.sectionGapNm = Number(meta.sectionGapNm);
      if (isFinite(meta.areaUm2)) out.areaUm2 = Number(meta.areaUm2);
      if (meta.areas && meta.areas.length)
        out.areas = meta.areas.map(function(a){
          return { z: Math.round(a.z), areaUm2: Number(a.areaUm2) || 0 };
        });
    }
    return out;
  }

  function rowsToStructures(rows){
    var by = {};
    (rows || []).forEach(function(r){
      if (!r) return;
      var id = r.structureId || "";
      if (!id) return;
      /* KEYED BY THE TRACING, AND ONLY BY THE TRACING.  2026-09-17
         It was keyed by tracing AND tracer for one day, on the reading that two people outlining
         the same cell are two tracings. Søren settled it the other way the moment he saw it: *"the
         meshes made should always be a part of the dataset and everybody should be able to use it.
         Also, other people should be able to add to it or edit it."* A structureId names a piece of
         the anatomy, not an author's copy of it — so a second person extending it is the same
         object, later, and keying by author would give them a rival to it instead.

         THIS IS STILL NOT CONSENSUS. Nothing votes and nothing is merged: the newest share of a
         tracing is its geometry, whoever made it, exactly as the newest version of a document is
         the document. What accumulates is the credit — `contributors`, everyone who has shared a
         version, in the order they first did — because the alternative is that the second editor
         silently erases the first one's name. */
      var who = String(r.reporterName || r.tracedBy || "");
      var s = by[id] || (by[id] = { structureId: id, tracedBy: who, name: r.name || "",
                                    kind: r.kind || "",
                                    cellType: r.cellType || "", color: r.color || "",
                                    nucleusId: r.nucleusId || "", rootId: r.rootId || "",
                                    contributors: [], rings: [] });
      if (who && s.contributors.indexOf(who) < 0) s.contributors.push(who);
      if (who) s.tracedBy = who;          // the latest hand on it, which is what a row's order says
      if (!s.name && r.name) s.name = r.name;
      /* Metadata follows the geometry: a later share that named the cell type fills in what an
         earlier one left blank, and never blanks what was there. */
      ["kind", "cellType", "color", "nucleusId", "rootId"].forEach(function(f){
        if (!s[f] && r[f]) s[f] = r[f];
      });
      /* The VOLUME follows the newest share rather than the first, because it is a property of the
         geometry and the newest geometry is the tracing. A version that did not carry one leaves
         the last known figure alone -- it is still the best answer available. */
      if (r.volumeUm3 !== undefined && r.volumeUm3 !== "" && isFinite(Number(r.volumeUm3)))
        s.volumeUm3 = Number(r.volumeUm3);
      if (r.volumeMethod) s.volumeMethod = r.volumeMethod;
      if (r.instanceIndex && !s.instanceIndex) s.instanceIndex = Number(r.instanceIndex);
      if (r.instanceOf && !s.instanceOf) s.instanceOf = r.instanceOf;
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
      /* EVERYONE WHO DREW ON IT, not only the last one. A tracing several people have extended has
         several authors, and `traced_by` is the provenance field in the notebook — a name that
         quietly became the most recent editor would be a wrong answer to the question it asks. */
      var who = (s.contributors && s.contributors.length)
                  ? s.contributors.join(", ") : (s.tracedBy || "");
      var t = { name: s.name || s.structureId || "traced", type: s.cellType || "traced",
                traced_by: who,
                rings: (s.rings || []).map(function(r){ return { z: r.z, points: r.points }; }) };
      if (s.color) t.color = s.color;
      if (s.nucleusId) t.nucleus_id = String(s.nucleusId);
      /* The measured volume travels into the notebook too. trace_mesh.py computes its own from the
         reconstructed surface -- a different estimator over the same contours -- and having both in
         the scene is how a disagreement between them ever gets noticed. */
      if (isFinite(s.volumeUm3)) t.volume_um3 = Number(s.volumeUm3);
      /* The number goes to the scene too, so the outliner says "Mitochondrion 3" rather than three
         objects with one name between them. */
      if (s.instanceIndex) t.instance_index = Number(s.instanceIndex);
      if (s.instanceOf) t.instance_of = String(s.instanceOf);
      return t;
    });
  }

  return { ringsFromLink: ringsFromLink, ringsToRows: ringsToRows, toSubmission: toSubmission,
           INSTANCE_COLOURS: INSTANCE_COLOURS, instanceColour: instanceColour,
           instanceName: instanceName,
           rowsToStructures: rowsToStructures, toTracings: toTracings,
           structureId: structureId,
           encodePoints: encodePoints, decodePoints: decodePoints };
})();
