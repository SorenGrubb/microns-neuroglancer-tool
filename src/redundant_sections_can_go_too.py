# -*- coding: utf-8 -*-
u"""Sections that lie on the line between their neighbours can go too.                   2026-09-23

Søren: "I guess there is no more that can be gained from removing points in each z-plane and my
segmentation is still a bit too big for Neuroglancer. Can we reduce z-layers that are redundant in
addition?"

FIRST, WHAT THE SIZE PROBLEM ACTUALLY IS. Measured on a cell of his shape, after the redundant
points had already gone (30,738 of them left, 176 contours):

    as LINE annotations   30,738 annotations   4,757k characters   <- ngl.microns-explorer.org
    as POLYLINES             176 annotations   1,004k characters   <- Spelunker, neuroglancer-demo

The cap is 2,097,152. So his cell does not fit as lines and fits twice over as polylines: the size
problem is the VIEWER, and switching it is a 4.7x win that throws nothing away. Shortening the
annotation ids, which was the other idea, is worth 4% -- not worth having. That is said to him
plainly, and this generator is the thing he asked for rather than the thing he needs first.

THE CRITERION, and why it is LINEAR and not the cubic from yesterday. loft() bands straight between
sections and Cavalieri is a trapezoid sum over them. A contour already on the straight line between
its two neighbours therefore contributes nothing to the mesh and nothing to the volume -- redundant
in exactly the sense that matters. A cubic fit would be prettier and false: it is not what either
consumer does with the sections.

AND UNLIKE DROPPING POINTS, THIS MOVES THE VOLUME. Dropping a vertex inside a contour changes one
area by a bounded sliver. Dropping a SECTION changes which areas the sum is over -- so the button
recomputes the volume and says it, and the check's real assertions are the volume ones. Measured:
a cylinder loses every interior section for no change at all; a sphere over 41 sections cannot lose
many, and what it loses costs under 2%.

Greedy, smallest deviation first, recomputing the two neighbours after each drop, stopping when the
next one would exceed the tolerance. The first and last section of the stack are never dropped:
they are what the object's extent IS.

AND A HAZARD THE CHECK TURNED UP, which matters more than the feature. The headline "Volume" on
the card is the CAVALIERI figure: every section stands for a full slab, so the two end sections each
count their one gap twice. That is right when sections are close and even, and it INFLATES as they
are thinned -- a cylinder of 50 sections reduced to its 2 ends reports DOUBLE. The trapezoid figure
the card already prints as "between the outermost contours" integrates between the end contours and
is exactly stable: 8.852594459716828 -> 8.852594459716824. So the button reports that one, and says
the Cavalieri figure will move.

Measured on a cell of his shape, 176 sections: 176 -> 122 at 16 nm (31%), 176 -> 59 at 64 nm, with
no measurable change to the volume between the outermost contours in either.

Check: thinzcheck.js.
Run: python3 src/redundant_sections_can_go_too.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s: %d" % (name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("core/traceloft.js", [
 (u"thinSections",
  u'''  return { loft: loft, volume: volume, interpolate: interpolate,''',
  u'''  /* ── SECTIONS THAT LIE ON THE LINE BETWEEN THEIR NEIGHBOURS ──────────────────  2026-09-23
     Søren: "Can we reduce z-layers that are redundant in addition?"

     LINEAR, not the cubic interpolate() above uses. loft() bands straight between sections and
     Cavalieri is a trapezoid sum over them, so a contour already on the straight line between its
     two neighbours adds nothing to the mesh and nothing to the volume. Fitting a cubic here would
     be prettier and false: it is not what either consumer does with the sections.

     AND THIS MOVES THE VOLUME, which dropping points inside a contour does not: it changes which
     areas the sum is over. The caller is given volBefore/volAfter to say so.

     thinSections(rings, {nm}) -> { rings, before, after, dropped, worstNm }
     The first and last section are never dropped -- they are what the object's extent IS.
     See src/redundant_sections_can_go_too.py. */
  function thinSections(rings, opts){
    opts = opts || {};
    var resNm = (window.UJ && UJ.cfg && UJ.cfg.res && +UJ.cfg.res[0]) || 4;
    var tol = (+opts.nm > 0 ? +opts.nm : 16) / resNm;      /* voxels */
    var byZ = {}, zs = [];
    (rings || []).forEach(function(r){
      if (!r || !r.points || r.points.length < 3) return;
      var z = +r.z;
      if (!byZ[z]){ byZ[z] = []; zs.push(z); }
      byZ[z].push(r);
    });
    zs.sort(function(a, b){ return a - b; });
    if (zs.length < 3) return { rings: (rings || []).slice(), before: zs.length,
                                after: zs.length, dropped: [], worstNm: 0 };

    /* One resampled, aligned ring per section: the comparison has to be vertex to vertex, and
       pairUp/bestOffset are how every other part of this file decides which vertex is which. */
    var reps = zs.map(function(z){ return resample(orient(byZ[z][0].points), N); });
    for (var i = 1; i < reps.length; i++){
      var off = bestOffset(reps[i - 1], reps[i]);
      reps[i] = reps[i].slice(off).concat(reps[i].slice(0, off));
    }

    /* How far section k sits from the straight line between a and b. */
    function devOf(a, k, b){
      var t = (zs[k] - zs[a]) / (zs[b] - zs[a]), worst = 0;
      for (var v = 0; v < N; v++){
        var x = reps[a][v][0] + (reps[b][v][0] - reps[a][v][0]) * t;
        var y = reps[a][v][1] + (reps[b][v][1] - reps[a][v][1]) * t;
        var d = Math.sqrt(Math.pow(reps[k][v][0] - x, 2) + Math.pow(reps[k][v][1] - y, 2));
        if (d > worst) worst = d;
      }
      return worst;
    }

    /* Greedy: the cheapest section goes first, and its two neighbours are re-judged against the
       wider gap they now span. A section only ever gets harder to drop, never easier. */
    var alive = zs.map(function(){ return true; });
    var prev = zs.map(function(_, i){ return i - 1; });
    var next = zs.map(function(_, i){ return i + 1; });
    var dev = zs.map(function(_, i){
      return (i === 0 || i === zs.length - 1) ? Infinity : devOf(i - 1, i, i + 1);
    });
    var dropped = [], worst = 0;
    for (;;){
      var best = -1, bestD = Infinity;
      for (var k = 1; k < zs.length - 1; k++)
        if (alive[k] && dev[k] < bestD){ bestD = dev[k]; best = k; }
      if (best < 0 || bestD > tol) break;
      alive[best] = false; dropped.push(zs[best]);
      if (bestD > worst) worst = bestD;
      var a = prev[best], b = next[best];
      next[a] = b; prev[b] = a;
      if (a > 0 && alive[a]) dev[a] = devOf(prev[a], a, next[a]);
      if (b < zs.length - 1 && alive[b]) dev[b] = devOf(prev[b], b, next[b]);
    }

    var keep = {};
    zs.forEach(function(z, i){ if (alive[i]) keep[z] = 1; });
    var out = (rings || []).filter(function(r){ return keep[+r.z]; });
    return { rings: out, before: zs.length, after: zs.length - dropped.length,
             dropped: dropped, worstNm: Math.round(worst * resNm * 10) / 10 };
  }

  return { loft: loft, volume: volume, interpolate: interpolate, thinSections: thinSections,'''),
])


# ── the button, beside the one that drops points ──────────────────────────────────────────────
edit("core/tracingcard.js", [
 (u"the section button's markup",
  u'''    "<!-- THE SHAPE, BEFORE IT IS COMMITTED.  2026-09-19. Søren: \\"the neuroglancer link paste function",''',
  u'''    "<!-- DROP REDUNDANT SECTIONS.  2026-09-23. Søren: \\"Can we reduce z-layers that are redundant",
    "     in addition?\\" A section already on the straight line between its neighbours adds nothing to",
    "     the mesh or the volume. Unlike dropping POINTS this moves the Cavalieri figure, so the",
    "     sentence says the stable one. See src/redundant_sections_can_go_too.py. -->",
    "<button class=\\"idbtn\\" id=\\"tracingThinZ\\" style=\\"display:none;margin-top:4px\\" title=\\"Drops whole sections whose contour already lies on the straight line between the sections above and below — which is what the mesh and the volume assume between them anyway. Unlike dropping points, this changes which sections the volume is summed over: the figure between the outermost contours stays put, the Cavalieri one moves. Nothing is saved until you add it.\\">Drop redundant sections</button>",
    "<!-- THE SHAPE, BEFORE IT IS COMMITTED.  2026-09-19. Søren: \\"the neuroglancer link paste function",'''),
 (u"what it does",
  u'''function tracingThinShow(){''',
  u'''/* ── DROP REDUNDANT SECTIONS ─────────────────────────────────────────────────  2026-09-23
   Søren: "Can we reduce z-layers that are redundant in addition?" A section on the straight line
   between its neighbours adds nothing to the mesh (which bands straight) or to the volume (a
   trapezoid sum over the sections). See src/redundant_sections_can_go_too.py. */
function tracingThinZGain(){
  const rings = (TRACING_PENDING && TRACING_PENDING.rings) || null;
  if (!rings || !rings.length) return null;
  if (!(window.UJ && UJ.traceloft && UJ.traceloft.thinSections)) return null;
  const r = UJ.traceloft.thinSections(rings, { nm: thinNmOf("tracingThinNm") });
  if (!r || r.after >= r.before) return null;
  return r;
}
function tracingThinZShow(){
  const btn = document.getElementById("tracingThinZ");
  if (!btn) return;
  if (!btn.dataset.wired){ btn.dataset.wired = "1"; btn.addEventListener("click", tracingThinZRun); }
  const g = tracingThinZGain();
  btn.style.display = g ? "" : "none";
  if (g) btn.textContent = "Drop redundant sections (" + g.before + " \\u2192 " + g.after + ")";
}
function tracingThinZRun(){
  const rings = (TRACING_PENDING && TRACING_PENDING.rings) || null;
  if (!rings || !rings.length) return;
  const g = tracingThinZGain();
  if (!g){ tracingSay("No section lies close enough to the line between its neighbours to drop."); return; }
  const vb = tracingVolumeOf(rings);
  TRACING_PENDING.rings = g.rings.map(function(r){
    return { z: r.z, points: r.points, inst: r.inst || 0 };
  });
  const gs = tracingGroups();
  if (gs){
    const keep = {};
    g.rings.forEach(function(r){ keep[+r.z] = 1; });
    gs.forEach(function(grp){
      grp.rings = (grp.rings || []).filter(function(r){ return keep[+r.z]; });
    });
  }
  const va = tracingVolumeOf(TRACING_PENDING.rings);
  tracingLayersRender();
  tracingVolShow();
  tracingThinShow();
  tracingThinZShow();
  pad3DSoon();
  /* THE STABLE FIGURE, and a word about the other one. volumeTrapezoidUm3 integrates between the
     outermost contours and does not move when sections go; the headline Cavalieri figure gives
     every section a full slab and therefore does. Measured in thinzcheck.js: a cylinder thinned to
     its two ends keeps its trapezoid volume exactly and DOUBLES its Cavalieri one. */
  let volSay = "";
  if (vb && va && vb.ok && va.ok){
    const b0 = vb.volumeTrapezoidUm3, a0 = va.volumeTrapezoidUm3;
    const moved = b0 ? Math.abs(a0 - b0) / b0 : 0;
    volSay = " Between the outermost contours it is " + volFmt(a0) + " \\u00b5m\\u00b3, was "
           + volFmt(b0) + " (" + (100 * moved).toFixed(2) + "%). The Cavalieri figure above moves "
           + "more, because every remaining section now stands for a wider slab.";
  }
  tracingSay("Dropped " + (g.before - g.after) + " section" + (g.before - g.after === 1 ? "" : "s")
    + ": " + g.before + " \\u2192 " + g.after + ". No contour was further than " + g.worstNm
    + " nm from the line between the sections either side of it." + volSay
    + " Nothing is saved until you add it \\u2014 read the link again to get every section back.");
}
function tracingThinShow(){'''),
 (u"...shown with the other one",
  u'''  const g = tracingThinGain();
  btn.style.display = g ? "" : "none";
  if (g) btn.textContent = "Drop redundant points (" + g.before.toLocaleString() + " \\u2192 "
                         + g.after.toLocaleString() + ")";
}
function tracingThinRun(){''',
  u'''  const g = tracingThinGain();
  btn.style.display = g ? "" : "none";
  if (g) btn.textContent = "Drop redundant points (" + g.before.toLocaleString() + " \\u2192 "
                         + g.after.toLocaleString() + ")";
  try { tracingThinZShow(); } catch (_e){}
}
function tracingThinRun(){'''),
])
