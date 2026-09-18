"""There is no polygon tool. There is a point tool, and it is faster anyway.          2026-09-17

Søren, in the viewer the button opened for him, on the tracing layer, with the Annotations tab
open: *"I don't see the polygon tool."*

It is not there, and that is not his viewer's fault. Measured today on ngl.microns-explorer.org,
which is the viewer his screenshot shows, the annotation toolbox offers exactly four things:

    ["Annotate point", "Annotate bounding box", "Annotate line", "Annotate ellipsoid"]

No polygon, no polyline. Spelunker has a fifth, "Annotate polyline", and yesterday's measurement
showed it draws on screen and never enters the state — so across every viewer a pasted link can
reach, there is nothing that outlines a shape in one gesture.

THE POINT TOOL IS THE ANSWER, and it is better than the line tool this card has been recommending
since yesterday. Measured, same session:

    ctrl+click, ctrl+click, ctrl+click →
    "annotations":[{"point":[240296.5,207661,21360],"type":"point","id":"913a9f10…"},
                   {"point":[240416.5,207721,21360],"type":"point","id":"c5cc74d1…"}, …]

One click per vertex instead of two, no landing each segment's start on the previous one's end,
and **the array is in click order** — 240296.5 was clicked before 240416.5 and is stored first. A
ring of points going round a cell in one direction IS the contour, already ordered, with nothing to
chain.

So: `ringsFromLink` now reads loose `point` annotations as contour vertices — per layer, per
section, in state order, three or more to a section. The button opens with `annotatePoint` live.

PRECEDENCE, AND WHY. Polygons first (a viewer that has the tool said what it meant), then chainable
lines, then points. Lines ahead of points so that one stray point left in a line tracing cannot
invent a vertex; points only when the lines produced no ring at all, so one stray line in a point
tracing cannot suppress it either. Each rule protects the other shape's accident.

THE ONE THING THIS GIVES UP. A link of loose points was, until now, unambiguously a marker list —
that is what `markersFromLink` reads for the bulk organelle card, and `tracingcheck.js` asserted the
two decoders disagreed about exactly such a link. They still disagree on the fixture that assertion
uses (one point is one marker and no contour), but the general claim is gone on purpose: the same
link is organelle markers in one box and a contour in the other, and the box it is pasted into is
what says which. Two things keep a mistake visible rather than silent: a contour needs three points
on the SAME section and two sections at least, which a scattered marker list almost never has; and
the status line now says which shape it read — "from 36 points", "from line annotations",
"from polygons" — so pasting the wrong link into the wrong box shows up in words.

Run: python3 src/a_ring_of_points_is_a_contour.py
     node tracingcheck.js && node tracingpanelcheck.js


HANDED OVER, 2026-09-17: this file's edits to ujump.html now live in src/the_tracing_card.py,
which owns the card and the pad whole. The reasoning above is why the card is the way it is and
is still the record; the literal is there. Anything this file still edits (a core module, a
check) it still owns.
"""
# ── RETRACTED IN PART, 2026-09-18 ────────────────────────────────────────────────────────────
# The claim below that Spelunker's polyline "never reaches the link" is WRONG. Søren pasted the
# state on 2026-09-18 and the polyline is in it -- one annotation, `points` in order, closed, in
# tool voxels. core/tracing.js reads it now; see src/the_polyline_did_reach_the_link.py, which
# also rewrote the card. Everything else here still stands: a ring of points and a ring of lines
# are both read, and the MICrONS viewer still has no shape tool at all. Left in place rather than
# quietly edited, because a generator that once wrote a false sentence into the page is part of
# how that sentence got there.

import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TRACING = [
    ('''    var seen = { volumes: 0, polygons: 0, lines: 0, unreadable: 0, mixedZ: 0 };
    var byId = {}, polys = [], vols = [], loose = [], layers = 0;''',
     '''    var seen = { volumes: 0, polygons: 0, lines: 0, points: 0, unreadable: 0, mixedZ: 0 };
    var byId = {}, polys = [], vols = [], loose = [], dots = [], layers = 0;''',
     "loose points are collected too"),

    ('''        var A = trip(a.pointA), B = trip(a.pointB);
        if (A && B){ seen.lines++; if (!a.parentAnnotationId) loose.push({ a: A, b: B }); }''',
     '''        if (t === "point"){
          /* ORDER IS THE CONTOUR. Neuroglancer appends a new annotation to this array, so points
             arrive in the order they were clicked -- measured on ngl.microns-explorer.org,
             2026-09-17. Going round a cell in one direction therefore needs no chaining at all. */
          var P = trip(a.point);
          if (P && !a.parentAnnotationId){ seen.points++; dots.push(P); }
          return;
        }
        var A = trip(a.pointA), B = trip(a.pointB);
        if (A && B){ seen.lines++; if (!a.parentAnnotationId) loose.push({ a: A, b: B }); }''',
     "a point annotation is a vertex"),

    ('''    } else if (loose.length){
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
    }''',
     '''    } else {
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
    }''',
     "points become rings when the lines gave nothing"),

    ('''               error: "that link has an annotation layer but no closed contours on it — draw "
                    + "a polygon, or an outline of line annotations, on at least two sections." };''',
     '''               error: "that link has an annotation layer but no contours on it — ring the cell "
                    + "with POINT annotations (ctrl+click each vertex, going round one way), at "
                    + "least three to a section and on at least two sections. Lines and polygons "
                    + "are read too." };''',
     "the refusal names the tool that exists"),
]

PAGE = [
    ('''<p class="hint" style="margin-top:8px">For a cell the segmentation does not have. Open a viewer, ring the cell with <b>line</b> annotations on one section &mdash; <b>ctrl+click</b> each end of each segment; a plain click does nothing &mdash; step a section with <b>,</b> and <b>.</b>, and go round again. Then paste the whole address bar back here. Two sections is the minimum; tracing every fifth section comes out about half a percent off the real volume, every fortieth about eleven.</p>''',
     '''<p class="hint" style="margin-top:8px">For a cell the segmentation does not have. Open a viewer and ring the cell with <b>point</b> annotations &mdash; <b>ctrl+click</b> once per vertex, going round one way; a plain click does nothing &mdash; then step a section with <b>,</b> or <b>.</b> and go round again. Paste the whole address bar back here. Three points to a section, two sections minimum; tracing every fifth section comes out about half a percent off the real volume, every fortieth about eleven.</p>''',
     "the card says points, and how many"),

    ('''<p class="hint" style="margin-top:6px">Measured 2026-09-17, in the browser: Spelunker keeps line annotations in the address bar, so they survive the paste. Its <i>polyline</i> tool draws on screen but never reaches the link, and BrainSharer's polygon tool needs an account and ignores a pasted link &mdash; so a ring of lines is the route that actually works.</p>''',
     '''<p class="hint" style="margin-top:6px"><b>There is no polygon tool.</b> Measured 2026-09-17: the MICrONS viewer offers point, bounding box, line and ellipsoid and nothing else; Spelunker adds a <i>polyline</i> that draws on screen but never reaches the link; BrainSharer's polygon tool needs an account and ignores a pasted link. Points are one click per vertex and come back in the order you clicked them, which is why they are what this asks for &mdash; a ring of <b>line</b> annotations is read too, at two clicks a segment.</p>''',
     "the card says why there is no polygon tool"),
    # ^ SUPERSEDED: src/the_polyline_did_reach_the_link.py replaced that paragraph on 2026-09-18.
    #   The edit() below skips a pair whose OLD text is gone, so re-running this file is a no-op on
    #   that paragraph rather than a reversion -- which is what it has to be, since the newer text
    #   is the true one.

    ('''  st.layers.push({type:"annotation",source:"local://annotations",tool:"annotateLine",
                  tab:"annotations",name:"tracing",annotations:[]});''',
     '''  /* annotatePoint, not annotateLine: no viewer a link can reach has a polygon tool (measured
     2026-09-17 -- the MICrONS viewer has four tools and Spelunker's polyline never serialises), and
     of what is left the point tool is one ctrl+click per vertex against the line tool's two, with
     the clicks stored in order. core/tracing.js reads either. */
  st.layers.push({type:"annotation",source:"local://annotations",tool:"annotatePoint",
                  tab:"annotations",name:"tracing",annotations:[]});''',
     "the viewer opens with the point tool"),

    ('''  tracingSay("Viewer opened at "+pos.join(", ")+", on a layer called \\u201ctracing\\u201d with the line "
    +"tool live. Ctrl+click each end of a segment; , and . step a section. Paste the address bar back here.");''',
     '''  tracingSay("Viewer opened at "+pos.join(", ")+", on a layer called \\u201ctracing\\u201d with the point "
    +"tool live. Ctrl+click round the cell, one click per vertex; , and . step a section. There is no "
    +"polygon tool in any viewer a link can reach \\u2014 points are the fast way. Paste the address bar back here.");''',
     "the message says what to do with the point tool"),

    ('''  tracingSay(rings.length+" contour"+(rings.length===1?"":"s")+" on "+sections.size
    +" section"+(sections.size===1?"":"s")+", z "+zs[0]+"\\u2013"+zs[zs.length-1]''',
     '''  /* WHICH SHAPE IT READ, in words. The same link is organelle markers to the bulk card and a
     contour to this one -- the box it is pasted into is what decides -- so saying "from 36 points"
     rather than just "3 contours" makes pasting the wrong link into the wrong box visible. */
  const fromWhat={points:"from "+r.seen.points+" points",lines:"from line annotations",
                  polygons:"from polygons",volume:"from a traced volume"};
  const src=fromWhat[(r.structures[0]||{}).from||""]||"";
  tracingSay(rings.length+" contour"+(rings.length===1?"":"s")+(src?" "+src:"")+" on "+sections.size
    +" section"+(sections.size===1?"":"s")+", z "+zs[0]+"\\u2013"+zs[zs.length-1]''',
     "the status says which shape it read"),
]

CHECK = [
    ('''  const empty = T.ringsFromLink(link([{ type: "point", id: "p", point: [1, 2, 3] }]));
  ok(!empty.ok && /no closed contours/.test(empty.error),
     "an annotation layer with only points says what is missing", empty.error);''',
     '''  const empty = T.ringsFromLink(link([{ type: "point", id: "p", point: [1, 2, 3] }]));
  ok(!empty.ok && /no contours on it/.test(empty.error) && /three to a section/.test(empty.error),
     "one point in an annotation layer says what is missing, and how many it needs", empty.error);''',
     "the refusal test follows the refusal"),

    ('''console.log("\\ntwo contours on one section");''',
     '''console.log("\\na ring of points, which is the only tool every viewer has");
{
  /* Measured 2026-09-17 on ngl.microns-explorer.org: the toolbox is point / bounding box / line /
     ellipsoid, and nothing else. No polygon anywhere a pasted link can reach. Points come back in
     the order they were clicked, so a ring drawn one way round needs no chaining. */
  const pts = (cx, cy, z, r, n) => circle(cx, cy, z, r, n).map((p, i) =>
    ({ type: "point", id: "p" + z + "_" + i, point: p }));
  const r = T.ringsFromLink(link(pts(1000, 2000, 500, 40, 14)
    .concat(pts(1005, 2005, 505, 38, 14), pts(1010, 2010, 510, 30, 14))));
  ok(r.ok === true && r.rings.length === 3, "three rings of points are three contours",
     r.rings.length);
  ok(r.rings.every(x => x.points.length === 14), "...every vertex kept", r.rings[0].points.length);
  ok(r.structures[0].from === "points", "...and it says it read them as points",
     r.structures[0].from);
  ok(String(r.rings[0].points[0]) === String(circle(1000, 2000, 500, 40, 14)[0].slice(0, 2)),
     "...in the order they were clicked, which is what makes them a ring at all",
     String(r.rings[0].points[0]));

  const two = T.ringsFromLink(link(pts(1000, 2000, 500, 40, 3).concat(pts(1000, 2000, 505, 40, 2))));
  ok(two.ok === true && two.rings.length === 1,
     "a section with two points is not a contour; three is", two.rings.length);

  /* A stray line in a point tracing must not suppress the points: one segment never chains. */
  const stray = T.ringsFromLink(link(pts(1000, 2000, 500, 40, 8)
    .concat(pts(1005, 2005, 505, 38, 8),
            [{ type: "line", id: "oops", pointA: [1, 1, 500], pointB: [9, 9, 500] }])));
  ok(stray.ok === true && stray.rings.length === 2 && stray.structures[0].from === "points",
     "a stray line left behind does not suppress a point tracing", stray.rings.length + " rings");

  /* And a stray point in a line tracing must not invent a vertex: lines win when they chain.
     Built as LOOSE lines (no parentAnnotationId) -- polygonOf's carry one, and a line inside a
     polygon is that polygon's geometry rather than a contour of its own. */
  const ringLines = (cx, cy, z, n, tag) => {
    const q = circle(cx, cy, z, 40, n);
    return q.map((p, i) => ({ type: "line", id: tag + i, pointA: p, pointB: q[(i + 1) % q.length] }));
  };
  const mixed = T.ringsFromLink(link(ringLines(1000, 2000, 500, 10, "ma")
    .concat(ringLines(1005, 2005, 505, 10, "mb"),
            [{ type: "point", id: "stray", point: [7000, 7000, 500] }])));
  ok(mixed.ok === true && (mixed.structures[0] || {}).from === "lines"
     && mixed.rings.every(x => x.points.every(p => p[0] < 2000)),
     "a stray point left behind does not get into a line tracing",
     (mixed.structures[0] || {}).from + ", " + mixed.rings.length + " rings");
}

console.log("\\ntwo contours on one section");''',
     "a ring of points is read, and the two shapes do not contaminate each other"),

    ('''  const pointOnly = link([{ type: "point", id: "p", point: [1, 2, 3] }]);
  ok(O.markersFromLink(pointOnly).ok === true && T.ringsFromLink(pointOnly).ok === false,
     "...while a link of loose points is a marker list and NOT a contour, as it should be",
     "the one place they are meant to disagree");''',
     '''  /* They used to disagree about ANY link of loose points: markers to one, nothing to the other.
     Since 2026-09-17 points are how a cell is traced, so the general claim is gone on purpose --
     the same link is markers in the bulk organelle box and a contour in the tracing box, and the
     box it is pasted into is what decides. What still separates them is shape: a contour needs
     three points on one SECTION and at least two sections, which a scattered marker list does not
     have, and the status line says which shape it read. */
  const pointOnly = link([{ type: "point", id: "p", point: [1, 2, 3] }]);
  ok(O.markersFromLink(pointOnly).ok === true && T.ringsFromLink(pointOnly).ok === false,
     "...while ONE loose point is a marker and still not a contour",
     "three to a section is what a contour needs");
  const scattered = link([1, 2, 3, 4, 5, 6].map((i) =>
    ({ type: "point", id: "m" + i, point: [1000 + i * 50, 2000, 500 + i * 10] })));
  ok(O.markersFromLink(scattered).ok === true && T.ringsFromLink(scattered).ok === false,
     "...and six markers on six different sections are six markers, not a tracing",
     "one per section chains into nothing");''',
     "what still separates a marker list from a contour"),
]


PANELCHECK = [
    ('''    ok(!!tr && tr.tool === "annotateLine",
       "...with the LINE tool live \\u2014 measured 2026-09-17 as the only kind that reaches the "
       + "address bar; the polyline tool draws and is never serialised", tr && tr.tool);''',
     '''    ok(!!tr && tr.tool === "annotatePoint",
       "...with the POINT tool live \\u2014 no viewer a link can reach has a polygon tool "
       + "(measured 2026-09-17), and a point is one ctrl+click per vertex against a line's two",
       tr && tr.tool);''',
     "the button opens with the point tool"),

    ('''  ok(/3 contours on 3 sections/.test(read.status), "...and it says what it found", read.status);''',
     '''  ok(/3 contours from polygons on 3 sections/.test(read.status),
     "...and it says what it found, AND which shape it read it from \\u2014 the same link is "
     + "organelle markers to the bulk card and a contour to this one", read.status);''',
     "the status names the shape"),

    ('''  console.log("\\na single section is refused");''',
     '''  console.log("\\na ring of points, read by the page");
  {
    const dots = (cx, cy, z, r, n, tag) => {
      const out = [];
      for (let i = 0; i < n; i++){
        const t = 2 * Math.PI * i / n;
        out.push({ type: "point", id: tag + i,
                   point: [Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), z] });
      }
      return out;
    };
    const pr = await p.evaluate(({ url }) => {
      document.getElementById("tracingLink").value = url;
      document.getElementById("tracingRead").click();
      return { status: document.getElementById("tracingStatus").innerText,
               shown: document.getElementById("tracingFound").style.display !== "none",
               rings: (typeof TRACING_PENDING !== "undefined" && TRACING_PENDING)
                      ? TRACING_PENDING.rings.length : 0,
               verts: (typeof TRACING_PENDING !== "undefined" && TRACING_PENDING)
                      ? TRACING_PENDING.rings[0].points.length : 0 };
    }, { url: link(dots(1000, 2000, 500, 40, 12, "d5")
          .concat(dots(1005, 2005, 505, 38, 12, "d6"))) });
    ok(pr.rings === 2 && pr.verts === 12,
       "two rings of twelve ctrl+clicks are two contours \\u2014 the tool every viewer has",
       pr.rings + " rings of " + pr.verts);
    ok(/from 24 points/.test(pr.status),
       "...and the page says it counted points, not lines or polygons", pr.status);
    ok(pr.shown, "...and it offers to keep it");
  }

  console.log("\\na single section is refused");''',
     "a point-traced link is read by the real page"),

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
# ujump.html is src/the_tracing_card.py's now -- see the note at the end of the docstring.
edit("tracingcheck.js", CHECK)
edit("tracingpanelcheck.js", PANELCHECK)
print("\nnow: node tracingcheck.js && node tracingpanelcheck.js")
