# -*- coding: utf-8 -*-
u"""A layer is a structure.                                                      2026-09-19

Søren: *"If there is more than one annotation channel in the neuroglancer link, it should be
suggested that there are more than one organelle, and the user can then deselect tracings if they
are not supposed to be there, but all of them should be shown in the 3D window."*

WHAT IT DID BEFORE: every readable annotation layer was poured into ONE structure. Three layers --
a cell, a mitochondrion and a nucleus -- came back as one object with everything in it, lofted into
one impossible surface, and committed under one name. There was no way to see that it had happened,
because nothing in the card ever mentioned a layer.

SO THE LAYER BECOMES THE STRUCTURE. `readLayer()` is the whole of the old body, moved, and
ringsFromLink now runs it once per layer and concatenates, tagging each structure with the layer it
came from. A layer that has a Volume in it still yields one structure per Volume, as it always did:
a Volume is a stronger statement about what belongs together than a layer is, and this does not
overrule it.

THE "tracing" PREFERENCE STOPS BEING A FILTER AND BECOMES A HINT. It existed so the layer box could
stay empty in the ordinary case, and it worked by reading ONLY that layer -- which is precisely what
has to stop, because a link with a "tracing" layer and two organelle layers is the case being asked
about. The reader now reports what is on the link and says which layer it would have preferred
(`preferred`); the CARD decides what is ticked. A reader that decides is a reader that cannot be
overruled by the person looking at the picture.

WHY THE DEFAULT SELECTION IS STILL CAUTIOUS, decided by looking rather than by taste. µJump writes
annotation layers into its own links all over the file -- synapses in and out, cell contacts,
organelle points, nucleus→centriole vectors, cilium base→tip vectors. Several of those are POINTS,
and three points that happen to share a z are a ring as far as this reader is concerned. So a link
copied from one of those views, pasted here, would offer a handful of plausible-looking structures
made of synapses. With a "tracing" layer present, that one is the one this tool made, and it is the
only one ticked; without one, everything readable is ticked. Either way nothing is hidden -- the
rows are all there with their counts, and one click either way.

`Cortical layers` stays excluded outright, for the reason recorded on 2026-09-17: the pia and
white-matter bands are `line` annotations shaped exactly like a contour segment, they chain into
rings spanning the whole dataset, and the result MESHES. Wrong, and it still produces an object.

Run: python3 src/a_layer_is_a_structure.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BLOCK = u'''  /* ── what a link contains ──────────────────────────────────────────────────────────────────── */
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
                 mixedZ: 0 };

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
'''

EXPORT = [
    (u'''  return { ringsFromLink: ringsFromLink, ringsToRows: ringsToRows, toSubmission: toSubmission,''',
     u'''  return { ringsFromLink: ringsFromLink, _readLayer: readLayer,
           ringsToRows: ringsToRows, toSubmission: toSubmission,''',
     "the per-layer reader is reachable from the check"),
]


def edit(rel, pairs):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    print(rel)
    for old, new, why in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + why)
            continue
        assert not (new in s and old in s), "AMBIGUOUS: " + why
        assert old in s, "NOT FOUND: " + why
        assert s.count(old) == 1, "ambiguous (%d): %s" % (s.count(old), why)
        s = s.replace(old, new, 1)
        print("  ok: " + why)
    io.open(p, "w", encoding="utf-8").write(s)


# SENTINELS, not a line inside the block -- the lesson of 2026-09-18 and again of this morning
# (src/a_contour_inside_another_is_a_hole.py, whose first guard duplicated every helper it wrote
# because the helpers moved out of the region the guard was looking in). The replacement writes
# readLayer ABOVE ringsFromLink, so the original anchors cannot find it on a second run.
OPEN, CLOSE = "  /* @perlayer:start */", "  /* @perlayer:end */"


def resplice(rel, start_line, end_line, block):
    p = os.path.join(HERE, rel)
    lines = io.open(p, encoding="utf-8").read().split("\n")
    if OPEN in lines and CLOSE in lines:
        a, b = lines.index(OPEN) - 1, lines.index(CLOSE) + 1      # -1: the banner above it
        if "\n".join(lines[a:b]) == block.rstrip("\n"):
            print(rel + "\n  already there: a layer is a structure")
            return
        what = "ringsFromLink re-spliced"
    else:
        aa = [i for i, L in enumerate(lines) if L.startswith(start_line)]
        bb = [i for i, L in enumerate(lines) if L.startswith(end_line)]
        assert len(aa) == 1, "start anchor found %d times" % len(aa)
        assert len(bb) == 1, "end anchor found %d times" % len(bb)
        assert aa[0] < bb[0], "anchors out of order"
        a, b = aa[0], bb[0]
        what = "ringsFromLink replaced"
    out = lines[:a] + block.rstrip("\n").split("\n") + lines[b:]
    io.open(p, "w", encoding="utf-8").write("\n".join(out))
    assert "\n".join(out).count("function readLayer(l, seen){") == 1, "the block went in twice"
    assert "\n".join(out).count("function ringsFromLink(text, layerName){") == 1, "two readers"
    print(rel + "\n  ok: %s, %d lines -> %d" % (what, b - a, len(block.rstrip("\n").split("\n"))))


resplice("core/tracing.js",
         "  /* ── what a link contains",
         "  /* ── storage",
         BLOCK)
edit("core/tracing.js", EXPORT)
print("\nnow: node tracingcheck.js")
