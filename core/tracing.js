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
  /* ── LINES THAT NEARLY MEET ARE ONE CONTOUR ──────────────────────────────────  2026-09-22
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
  }

  /* ── what a link contains ──────────────────────────────────────────────────────────────────── */
  /* @perlayer:start */
  /* ── ONE LAYER AT A TIME ───────────────────────────────────────────────────────  2026-09-19
     Søren: *"If there is more than one annotation channel in the neuroglancer link, it should be
     suggested that there are more than one organelle, and the user can then deselect tracings if
     they are not supposed to be there."*

     This is the old body of ringsFromLink, moved, and it is worth saying why the move is the whole
     change: everything readable used to be poured into ONE structure, so a cell, a mitochondrion
     and a nucleus drawn in three layers came back as a single object with all of it in it. Run per
     layer instead, the same code says three structures, and the caller can take them apart.

     A Volume inside a layer still wins: it is a stronger statement about what belongs together
     than a layer is, and it can still make several structures out of one layer. */
  function readLayer(l, seen){
    var byId = {}, polys = [], plines = [], vols = [], loose = [], dots = [];
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
    return { structures: structures, rings: all };
  }

  function ringsFromLink(text, layerName){
    var d = decode(text);
    if (d.error) return { ok: false, error: d.error, structures: [], rings: [] };
    var st = d.state;
    var seen = { volumes: 0, polygons: 0, polylines: 0, lines: 0, points: 0, unreadable: 0,
                 mixedZ: 0,
                 /* Ends of hand-drawn line annotations that were within a tolerance of each other
                    and became one vertex (2026-09-22). */
                 joined: 0 };

    /* WHICH ANNOTATION LAYERS COUNT, when nobody named one.  2026-09-17
       A pasted µJump link normally carries "Cortical layers" -- the pia/white-matter bands, which
       are `line` annotations in a local annotation layer exactly like a hand-drawn contour. Read
       as contours they chain into rings spanning the whole dataset, quietly, and the result still
       meshes. So: never read them. */
    var annLayers = (st.layers || []).filter(function(l){
      return l && l.type === "annotation" && !/^cortical layers$/i.test(String(l.name || ""));
    });
    /* A HINT NOW, NOT A FILTER, since 2026-09-19. A link from the card's own "Open a viewer to
       trace in" button carries a layer called "tracing", and until today finding one meant reading
       NOTHING ELSE -- which is exactly the case Søren is asking about: a "tracing" layer beside two
       organelle layers came back as the tracing alone, silently. So the name is reported and the
       card decides what is ticked. The reader says what is on the link; it does not choose. */
    var preferred = annLayers.some(function(l){ return l.name === "tracing"; }) ? "tracing" : "";

    var structures = [], all = [], layers = 0, layerList = [];
    annLayers.forEach(function(l){
      if (layerName && l.name !== layerName) return;
      layers++;
      var got = readLayer(l, seen), zs = {};
      got.rings.forEach(function(r){ zs[r.z] = 1; all.push(r); });
      got.structures.forEach(function(s){
        /* WHICH LAYER IT CAME FROM, on the structure itself -- the card lists these as ticks, and a
           row that could not say where it came from would be asking somebody to choose between
           three things called nothing. */
        s.layer = String(l.name || "");
        structures.push(s);
      });
      layerList.push({ name: String(l.name || ""), structures: got.structures.length,
                       rings: got.rings.length, sections: Object.keys(zs).length });
    });

    if (!layers)
      return { ok: false, structures: [], rings: [], seen: seen,
               error: layerName ? ('that link has no annotation layer called "' + layerName + '"')
                                : "that link has no annotation layer on it" };

    if (!all.length)
      return { ok: false, structures: [], rings: [], seen: seen,
               error: "that link has an annotation layer but no contours on it — ring the cell "
                    + "with POINT annotations (ctrl+click each vertex, going round one way), at "
                    + "least three to a section and on at least two sections. Lines and polygons "
                    + "are read too." };
    return { ok: true, structures: structures, rings: all, seen: seen,
             layers: layerList, preferred: preferred };
  }
  /* @perlayer:end */
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
                /* The cell's centre, "x,y,z" in voxels (2026-09-21): a cell is also a place, and on
                   a dataset with no segmentation it may be the only name it has. */
                cellCoord: meta.cellCoord || "",
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
      ["kind", "cellType", "color", "nucleusId", "rootId", "cellCoord"].forEach(function(f){
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

  /* ── SEVERAL TRACINGS' GEOMETRY, TOGETHER ────────────────────────────────────  2026-09-22
     Søren: "Opening the neuroglancer with 4 filtered cells with 15 traced organelles took a long
     time." One request per 20 (?structureIds=), one each six at a time from an older deployment,
     and nothing twice in a page. Returns {structureId: {t, st} | {error}}.
     See src/the_outlines_come_in_one_request.py. */
  var MANY_CACHE = {}, MANY_BATCH = null;
  function manyKey(e){ return e && e.groupId ? String(e.structureId) + "|" + String(e.groupId) : ""; }
  function manyResult(t){
    if (!t) return { error: "the dataset has no tracing with that id any more" };
    if (t.error) return { t: t, error: t.error };
    var st = rowsToStructures(t.rows || [])[0] || null;
    if (!st || !st.rings || !st.rings.length) return { t: t, error: "that tracing came back with no contours on it" };
    return { t: t, st: st };
  }
  async function fetchMany(endpoint, entries, qs, onProgress){
    qs = qs || "";
    var out = {}, todo = [], total = (entries || []).length, done = 0;
    var tick = function(){ done++; if (onProgress) try { onProgress(done, total); } catch (_e){} };
    (entries || []).forEach(function(e){
      var k = manyKey(e);
      if (k && MANY_CACHE[k]){ out[e.structureId] = MANY_CACHE[k]; tick(); }
      else if (!(e.structureId in out)) todo.push(e);
    });
    var keep = function(e, r){
      out[e.structureId] = r;
      var k = manyKey(e);
      if (k && r && r.st) MANY_CACHE[k] = r;
      tick();
    };
    var pool = async function(items, n, fn){
      var i = 0;
      var worker = async function(){ while (i < items.length){ var it = items[i++]; await fn(it); } };
      var ws = []; for (var w = 0; w < Math.min(n, items.length); w++) ws.push(worker());
      await Promise.all(ws);
    };
    /* Together, while the deployment answers with rows. */
    if (todo.length && MANY_BATCH !== false){
      var chunks = [];
      for (var c = 0; c < todo.length; c += 20) chunks.push(todo.slice(c, c + 20));
      await pool(chunks, 3, async function(ch){
        if (MANY_BATCH === false) return;
        try {
          var r = await fetch(endpoint + "?tracings=1&structureIds="
                              + encodeURIComponent(ch.map(function(e){ return e.structureId; }).join(",")) + qs);
          var d = await r.json(), ts = (d && d.tracings) || [];
          var withRows = ts.filter(function(t){ return t && Array.isArray(t.rows); });
          if (ts.length && !withRows.length){ MANY_BATCH = false; return; }   // an older deployment
          MANY_BATCH = true;
          var by = {};
          withRows.forEach(function(t){ by[t.structureId] = t; });
          ch.forEach(function(e){ keep(e, manyResult(by[e.structureId])); });
        } catch (_e){ /* left for the one-at-a-time pass */ }
      });
    }
    /* One each, six at a time, for whatever is left. */
    var left = todo.filter(function(e){ return !(e.structureId in out); });
    await pool(left, 6, async function(e){
      try {
        var r = await fetch(endpoint + "?tracings=1&structureId=" + encodeURIComponent(e.structureId) + qs);
        var d = await r.json();
        keep(e, manyResult(((d && d.tracings) || [])[0]));
      } catch (err){ keep(e, { error: String(err && err.message || err) }); }
    });
    return out;
  }

  /* ── THE WAY OUT ───────────────────────────────────────────────────────────  2026-09-22
     One POLYLINE per contour -- the inverse of polylineRing above, and the shape Spelunker itself
     writes. A ring is stored open here and goes out closed: the first vertex repeated as the last,
     because a polyline draws the segments between consecutive points and nothing more. ringFrom
     drops that repeat again on the way back in, so a link read by this file returns what it held.

     Every annotation carries an id. Measured in Søren's browser on 2026-09-22: a state whose
     annotations have none loads a layer with ZERO in it, in silence.

     THE SHAPE FOLLOWS THE VIEWER (2026-09-22, src/the_viewer_decides_the_shape.py). Measured in
     Søren's browser, one probe state per viewer: spelunker.cave-explorer.org and
     neuroglancer-demo.appspot.com read a polyline; ngl.microns-explorer.org, neuroglancer.neuvue.io
     and h01-dot-neuroglancer-demo.appspot.com do NOT -- and on those, ONE polyline empties the
     WHOLE layer, taking the lines and points beside it, in silence. So an unknown viewer gets
     lines: a longer link is a cost, an empty layer is a lie.

     JUMP_VIEWER_POLYLINES = true (or false) in the console forces it on that page. */
  var POLYLINE_VIEWERS = { "spelunker.cave-explorer.org": 1, "neuroglancer-demo.appspot.com": 1 };
  function viewerBase(){
    try { var el = document.getElementById("viewer"); if (el && el.value) return String(el.value); }
    catch (_e){}
    try { if (window.UJ && UJ.cfg && UJ.cfg.viewer && UJ.cfg.viewer.base)
            return String(UJ.cfg.viewer.base); } catch (_e){}
    return "";
  }
  function viewerTakesPolylines(base){
    try { if (window.JUMP_VIEWER_POLYLINES === true) return true;
          if (window.JUMP_VIEWER_POLYLINES === false) return false; } catch (_e){}
    var h = "";
    /* The exact host, never a substring: "h01-dot-neuroglancer-demo.appspot.com" ends in
       "neuroglancer-demo.appspot.com" and does NOT take polylines. */
    try { h = new URL(String(base || viewerBase()), location.href).host; } catch (_e){ return false; }
    return !!POLYLINE_VIEWERS[h];
  }
  /* ── FEWER POINTS ──────────────────────────────────────────────────────────  2026-09-22
     Søren: "Could we reduce the number of annotation points when they seem redundant?"

     Douglas-Peucker. A closed ring is split at the point farthest from the first, so the answer
     does not depend on where the pen happened to start, and each half is walked with an explicit
     stack -- a freehand contour is thousands of points and recursion would be thousands deep.

     `tol` is in VOXELS of the space the contour is stored in and no point of the drawn outline
     moves further than that. Half a voxel by default: below what the screen shows at the level it
     was traced at, and the area it encloses moves by well under a tenth of a percent.

     THE RINGS HANDED IN ARE NOT MODIFIED. This is for the link; the tracing is the record.
     See src/fewer_points_and_the_real_cap.py. */
  var SIMPLIFY_TOL = 0.5;
  function dpKeep(pts, first, last, tol, keep){
    var stack = [[first, last]];
    while (stack.length){
      var seg = stack.pop(), i0 = seg[0], i1 = seg[1];
      if (i1 <= i0 + 1) continue;
      var ax = pts[i0][0], ay = pts[i0][1], bx = pts[i1][0], by = pts[i1][1];
      var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      var worst = -1, at = -1;
      for (var i = i0 + 1; i < i1; i++){
        var qx = pts[i][0] - ax, qy = pts[i][1] - ay, d;
        if (L2 === 0){ d = qx * qx + qy * qy; }
        else {
          var t = (qx * dx + qy * dy) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          var ex = qx - t * dx, ey = qy - t * dy;
          d = ex * ex + ey * ey;
        }
        if (d > worst){ worst = d; at = i; }
      }
      if (worst > tol * tol){ keep[at] = 1; stack.push([i0, at]); stack.push([at, i1]); }
    }
  }
  function simplifyRing(pts, tol){
    var n = pts.length;
    if (n < 6 || !(tol > 0)) return pts;
    /* The far point, so the two halves are the two sides of the shape and not an arbitrary cut. */
    var far = 0, best = -1, i;
    for (i = 1; i < n; i++){
      var dx = pts[i][0] - pts[0][0], dy = pts[i][1] - pts[0][1], d = dx * dx + dy * dy;
      if (d > best){ best = d; far = i; }
    }
    var keep = {}; keep[0] = 1; keep[far] = 1;
    dpKeep(pts, 0, far, tol, keep);
    /* The second half runs far -> n -> 0, so index n stands for point 0. */
    var wrap = pts.slice(far).concat([pts[0]]);
    var keep2 = {}; keep2[0] = 1; keep2[wrap.length - 1] = 1;
    dpKeep(wrap, 0, wrap.length - 1, tol, keep2);
    for (var k in keep2){ var j = far + (+k); if (j < n) keep[j] = 1; }
    var out = [];
    for (i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
    return out.length >= 3 ? out : pts;
  }
  /* rings -> { rings, before, after }, the counts so the card can say what it dropped. */
  function simplifyRings(rings, tol){
    var t = (typeof tol === "number") ? tol : SIMPLIFY_TOL;
    try { if (typeof window.JUMP_SIMPLIFY_TOL === "number") t = window.JUMP_SIMPLIFY_TOL; }
    catch (_e){}
    var before = 0, after = 0;
    var out = (rings || []).map(function(r){
      var pts = r.points || [];
      before += pts.length;
      var s = simplifyRing(pts, t);
      after += s.length;
      return (s === pts) ? r : { z: r.z, points: s };
    });
    return { rings: out, before: before, after: after, tol: t };
  }

  function ringAnnotations(rings, idPrefix, opts){
    var out = [];
    var asLines = (opts && typeof opts.lines === "boolean")
                ? opts.lines : !viewerTakesPolylines(opts && opts.base);
    /* Redundant points go before anything is written, on both shapes (2026-09-22). opts.tol = 0
       keeps every point. The counts ride back on the array for a caller that wants to report. */
    var simp = simplifyRings(rings, opts && opts.tol);
    rings = simp.rings;
    (rings || []).forEach(function(r, ri){
      var pts = r.points || [];
      if (pts.length < 3) return;
      var z = Math.round(r.z), i;
      if (asLines){
        for (i = 0; i < pts.length; i++){
          var a = pts[i], b = pts[(i + 1) % pts.length];
          out.push({ type: "line", id: idPrefix + "_" + ri + "_" + i,
                     pointA: [Math.round(a[0]), Math.round(a[1]), z],
                     pointB: [Math.round(b[0]), Math.round(b[1]), z] });
        }
        return;
      }
      var P = [];
      for (i = 0; i < pts.length; i++) P.push([Math.round(pts[i][0]), Math.round(pts[i][1]), z]);
      P.push(P[0].slice());
      out.push({ type: "polyline", id: idPrefix + "_" + ri, points: P });
    });
    out.simplified = { before: simp.before, after: simp.after, tol: simp.tol };
    return out;
  }

  return { ringsFromLink: ringsFromLink, _readLayer: readLayer, fetchMany: fetchMany,
           ringAnnotations: ringAnnotations, simplifyRings: simplifyRings,
           viewerTakesPolylines: viewerTakesPolylines,
           viewerBase: viewerBase,
           ringsToRows: ringsToRows, toSubmission: toSubmission,
           INSTANCE_COLOURS: INSTANCE_COLOURS, instanceColour: instanceColour,
           instanceName: instanceName,
           rowsToStructures: rowsToStructures, toTracings: toTracings,
           structureId: structureId,
           encodePoints: encodePoints, decodePoints: decodePoints };
})();
