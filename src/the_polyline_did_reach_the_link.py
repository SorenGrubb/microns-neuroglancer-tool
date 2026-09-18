# -*- coding: utf-8 -*-
"""The polyline did reach the link.                                             2026-09-18

Søren: *"Was there really no way to get the polygon tool in the Neuroglancer instance when 'opening
a viewer instead'? We looked at the Github and I remember you sent a screenshot of it working, but
then said it was not possible."* — and then he pasted the state.

**I WAS WRONG.** On 2026-09-17 I recorded that Spelunker's polyline "draws on screen but never
reaches the link", and the card has been telling everybody so ever since. Here is what he pasted,
from Spelunker, trimmed to the layer that matters:

    { "type": "annotation", "tool": "annotatePolyline", "name": "annotation",
      "annotations": [ { "type": "polyline", "id": "2eb771b0...",
                         "points": [ [171061.96875, 139285.984375, 23865],
                                     [170833.96875, 140035.984375, 23865],
                                     ... six more ...
                                     [171061.96875, 139285.984375, 23865] ] } ] }

It reaches the link, and it arrives in better shape than anything else this reader handles:

  - ONE annotation per contour, not a parent and a heap of children to chain.
  - `points`, in order, in the TOOL's own 4/4/40 nm voxels -- the same frame everything else here
    already speaks.
  - CLOSED: the last point repeats the first, which is precisely what `ringFrom` already strips.
  - One z for the whole ring (23865 here), which is what a section-by-section tracing needs.

So the reader needed a branch, not a redesign. `polylineRing` is four lines, and the shape path that
already existed for BrainSharer's polygons takes it from there.

WHY I GOT IT WRONG, as far as it can be reconstructed: a polyline in progress is not in the state --
it appears when the shape is finished. Measuring by copying the link while the tool was still armed,
or before the last click closed it, gives exactly the result I recorded. The lesson is not about
Neuroglancer: **"I looked and it was not there" is a much weaker claim than it feels like**, and it
went into a card that tells every user something false in bold type. That text is corrected here too.

None of this makes the pad wasted. It gives section stepping, z-aware contours, undo and a live
volume that no viewer round trip does. But "Open a viewer instead" is now a real polygon route, and
the card should say so.

Run: python3 src/the_polyline_did_reach_the_link.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TRACING = [
    # ── it is a shape, and it is counted ────────────────────────────────────────────────────
    ('''    var seen = { volumes: 0, polygons: 0, lines: 0, points: 0, unreadable: 0, mixedZ: 0 };
    var byId = {}, polys = [], vols = [], loose = [], dots = [], layers = 0;''',
     '''    var seen = { volumes: 0, polygons: 0, polylines: 0, lines: 0, points: 0, unreadable: 0,
                 mixedZ: 0 };
    var byId = {}, polys = [], plines = [], vols = [], loose = [], dots = [], layers = 0;''',
     "a polyline is a shape this reader counts"),

    ('''        if (t === "polygon"){ polys.push(a); seen.polygons++; return; }''',
     '''        if (t === "polygon"){ polys.push(a); seen.polygons++; return; }
        /* ── POLYLINE, WHICH SPELUNKER DOES PUT IN THE LINK ────────────────────  2026-09-18
           Recorded here on 2026-09-17 as drawing on screen and never reaching the state. That was
           wrong -- Søren pasted the state and it is there, and in the best shape of anything this
           function reads: one annotation per contour, `points` in order, in the tool's own 4/4/40
           voxels, closed (last point repeats the first, which ringFrom already strips), all on one
           z. A polyline in progress is NOT in the state, which is the likeliest way a measurement
           taken with the tool still armed came back empty. */
        if (t === "polyline"){ plines.push(a); seen.polylines++; return; }''',
     "...and collected"),

    # ── the helper ──────────────────────────────────────────────────────────────────────────
    ('''  /* ── 1. polygons, as BrainSharer writes them ───────────────────────────────────────────────── */''',
     '''  /* ── 0. polylines, as Spelunker writes them ────────────────────────────────────────  2026-09-18
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

  /* ── 1. polygons, as BrainSharer writes them ───────────────────────────────────────────────── */''',
     "a polyline becomes a ring"),

    # ── the shape path takes it ─────────────────────────────────────────────────────────────
    ('''    if (polys.length){''',
     '''    if (polys.length || plines.length){''',
     "...and the shape path runs for it"),

    ('''      var orphan = [];
      polys.forEach(function(p){
        if (claimed[p.id]) return;
        addRing(polygonRing(p, byId, seen), orphan);
      });
      if (orphan.length) structures.push({ name: "", rings: orphan, from: "polygons" });''',
     '''      var orphan = [];
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
                          from: plines.length ? (polys.length ? "shapes" : "polylines") : "polygons" });''',
     "...with its contours in the same structure"),
]

CARD = [
    ('''<p class="hint" style="margin-top:6px"><b>There is no polygon tool.</b> Measured 2026-09-17: the MICrONS viewer offers point, bounding box, line and ellipsoid and nothing else; Spelunker adds a <i>polyline</i> that draws on screen but never reaches the link; BrainSharer's polygon tool needs an account and ignores a pasted link. Points are one click per vertex and come back in the order you clicked them, which is why they are what this asks for &mdash; a ring of <b>line</b> annotations is read too, at two clicks a segment.</p>''',
     '''<p class="hint" style="margin-top:6px"><b>Spelunker has a polyline tool, and it is the best route here.</b> Pick <i>Annotate polyline</i>, click round the cell, click the first vertex to close it, then copy the link &mdash; the whole contour arrives as one shape. (This card said the opposite until 2026-09-18: the polyline was measured as never reaching the link, which was wrong. A polyline only enters the link once it is <i>finished</i>, which is the likeliest way that measurement came back empty.) The MICrONS viewer still offers only point, bounding box, line and ellipsoid, so there a ring of <b>points</b> &mdash; one click per vertex, read back in the order you clicked them &mdash; or a ring of <b>line</b> annotations at two clicks a segment is the way. All three are read.</p>''',
     "the card stops telling people something false"),
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


edit("core/tracing.js", TRACING)
edit("ujump.html", CARD)
# The generator that first wrote the card's wording owns it too, or a re-run puts the false
# sentence back.
edit("src/the_tracing_card.py", CARD)
print("\nnow: node tracingcheck.js && python3 src/build_stamps.py")
