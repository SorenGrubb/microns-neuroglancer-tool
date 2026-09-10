"""A line annotation is a marker too.                                                2026-09-10

Søren: *"When I pasted a link into this with a new annotation tab and a line annotation it did not
find any markers in the link. It worked if I put in point annotations, but for structures like NR
type II and primary cilia it would be helpful if it could recognize line annotations. (this goes for
all tools that uses this)"*

The parser read exactly one field:

    if (a && a.point && a.point.length === 3 ...) pts.push(a.point.map(Number));

A Neuroglancer POINT annotation carries `point`. A LINE carries `pointA` and `pointB`, an
axis-aligned bounding box the same pair, and an ellipsoid a `center`. None of those has a `point`,
so a link full of lines came back with nothing on it -- and said so, which was the only honest thing
it could say about a state it could not read.

WHY LINES ARE THE RIGHT SHAPE HERE, and this is his point rather than a nicety: the two kinds he
named are the two VECTOR kinds in the ontology. A primary cilium is base and tip; an NR type II is
endpoint 1 and endpoint 2. Drawing one line is drawing exactly that, in one gesture, in the right
order -- where two separate points rely on clicking them in the right sequence and pairing them up
afterwards by position in the list.

THE RULE, and it is the same one rowsFromPoints already applied to pairs of points:

    a line, for a VECTOR kind   ->  one row, a = pointA, b = pointB.  No pairing, no odd-marker
                                    case, no dependence on click order.
    a line, for a POINT kind    ->  one row at its MIDPOINT. One line is one structure; turning it
                                    into two rows would invent a second mitochondrion out of a
                                    gesture that marked one.
    a bounding box              ->  its two corners, treated exactly as a line. Somebody who boxed a
                                    structure meant one structure.
    an ellipsoid                ->  its centre, treated as a point.

Points behave exactly as before, down to the odd-marker row and the `odd` flag -- the legacy shape
(a bare [x,y,z]) still flows through both functions unchanged, which is what keeps ωJump's and
χJump's own callers, and wjumpcheck's assertions, true without edits.

ONE COPY, and ωJump gets it by rebuilding: core/organelles.js is inlined into wjump.html by
build_wjump.py (`ORGAN = shared("organelles.js")`), so the fix reaches ωJump the same way it reaches
every other tool -- through the one file that owns the rule.

Run: python3 src/a_line_is_a_marker_too.py
     python3 build_wjump.py            <- ωJump inlines this file
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PARSE = [
    ('''    var pts = [];
    (st.layers || []).forEach(function(l){
      if (!l || l.type !== "annotation") return;
      if (layerName && l.name !== layerName) return;
      (l.annotations || []).forEach(function(a){
        if (a && a.point && a.point.length === 3
            && a.point.every(function(v){ return isFinite(Number(v)); }))
          pts.push(a.point.map(Number));
      });
    });
    return { ok:true, points: pts };''',
     '''    /* ── EVERY ANNOTATION SHAPE NEUROGLANCER DRAWS ──────────────────────────────────────────
       Søren, 2026-09-10: "with a new annotation tab and a line annotation it did not find any
       markers... for structures like NR type II and primary cilia it would be helpful if it could
       recognize line annotations."

       This read `a.point` and nothing else. A POINT annotation has `point`; a LINE has `pointA`
       and `pointB`; an axis-aligned BOUNDING BOX has the same pair; an ELLIPSOID has `center`. A
       link full of lines therefore came back empty.

       Lines are not a convenience here, they are the right shape: the two kinds he named are the
       ontology's two VECTOR kinds -- a cilium is base and tip, an NR type II is endpoint 1 and
       endpoint 2 -- so one line is one complete row, drawn in one gesture, already in order.
       Two separate points have to be clicked in the right sequence and paired afterwards.

       A two-ended marker is kept as {a,b}; a one-ended one stays a bare [x,y,z], which is what
       every existing caller and every existing check already handles. rowsFromPoints below decides
       what a two-ended marker means for the kind being logged. */
    var pts = [];
    var seen = { point:0, line:0, box:0, ellipsoid:0, unreadable:0 };
    var trip = function(v){
      if (!v || v.length !== 3) return null;
      if (!v.every(function(n){ return isFinite(Number(n)); })) return null;
      return v.map(Number);
    };
    (st.layers || []).forEach(function(l){
      if (!l || l.type !== "annotation") return;
      if (layerName && l.name !== layerName) return;
      (l.annotations || []).forEach(function(a){
        if (!a) return;
        var A = trip(a.pointA), B = trip(a.pointB);
        if (A && B){
          pts.push({ a:A, b:B });
          seen[a.type === "axis_aligned_bounding_box" ? "box" : "line"]++;
          return;
        }
        var P = trip(a.point);
        if (P){ pts.push(P); seen.point++; return; }
        var C = trip(a.center);
        if (C){ pts.push(C); seen.ellipsoid++; return; }
        seen.unreadable++;
      });
    });
    return { ok:true, points: pts, seen: seen };''',
     "the parser reads lines, boxes and ellipsoids too"),
]

ROWS = [
    ('''  function rowsFromPoints(kind, points){
    var pts = points || [], out = [];
    if (!isVector(kind)){
      pts.forEach(function(p){ out.push({ kind: kind, a: p, b: null }); });
      return { rows: out, odd: false };
    }
    for (var i = 0; i < pts.length; i += 2)
      out.push({ kind: kind, a: pts[i], b: (i + 1 < pts.length) ? pts[i + 1] : null });
    return { rows: out, odd: pts.length % 2 === 1 };
  }''',
     '''  /* A marker is either a bare [x,y,z] (a point annotation, and the shape every caller and check
     already passes) or {a,b} (a line or a box, both of which have two ends). */
  function markerEnds(m){
    if (Array.isArray(m)) return { a:m, b:null };
    return { a:(m && m.a) || null, b:(m && m.b) || null };
  }
  /* Voxels, so a half-voxel midpoint is rounded rather than carried -- every coordinate this tool
     writes elsewhere is an integer voxel and a ".5" in one column would be the odd one out. */
  function midpoint(a, b){
    return [Math.round((a[0]+b[0])/2), Math.round((a[1]+b[1])/2), Math.round((a[2]+b[2])/2)];
  }
  function rowsFromPoints(kind, points){
    var pts = points || [], out = [], odd = false;
    if (!isVector(kind)){
      /* ONE LINE IS ONE STRUCTURE. Splitting it into two rows would invent a second mitochondrion
         out of a gesture that marked one, so a two-ended marker collapses to its midpoint. */
      pts.forEach(function(m){
        var e = markerEnds(m);
        if (!e.a) return;
        out.push({ kind: kind, a: e.b ? midpoint(e.a, e.b) : e.a, b: null });
      });
      return { rows: out, odd: false };
    }
    /* A vector kind wants two ends. A line already IS two ends, in the order they were drawn, so it
       becomes one row with no pairing and no odd-marker case. Loose points still pair up in click
       order exactly as before -- including the odd one, kept as a half-filled row rather than
       dropped, because losing a click somebody made is worse than showing a field they can fill. */
    var pending = null;
    pts.forEach(function(m){
      var e = markerEnds(m);
      if (!e.a) return;
      if (e.b){ out.push({ kind: kind, a: e.a, b: e.b }); return; }
      if (pending){ out.push({ kind: kind, a: pending, b: e.a }); pending = null; }
      else pending = e.a;
    });
    if (pending){ out.push({ kind: kind, a: pending, b: null }); odd = true; }
    return { rows: out, odd: odd };
  }''',
     "a line becomes one vector row, or one midpoint"),
]

# The one sentence a user sees when nothing was found. It named only one gesture.
MSG_OLD = ('''      note.innerHTML='<span style="color:var(--bad)">That link has no markers on it. '
        +'Ctrl+click the structures in the viewer first, then copy the whole address bar.</span>';''')
MSG_NEW = ('''      note.innerHTML='<span style="color:var(--bad)">That link has no annotations on it. '
        +'Mark the structures in the viewer first \\u2014 a point, or a LINE for anything with two '
        +'ends like a cilium or an NR type II \\u2014 then copy the whole address bar.</span>';''')

MESSAGES = {
    "core/panel.js": [(MSG_OLD, MSG_NEW, "the message names lines as well as points")],
    "hjump.html": [("  " + MSG_OLD.replace("\n      ", "\n        "),
                    "  " + MSG_NEW.replace("\n      ", "\n        "),
                    "ηJump's own copy says the same")],
}


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


edit("core/organelles.js", PARSE + ROWS)
# ── ωJump carries its OWN inlined copy, and its generator currently cannot rewrite the page ──────
# build_wjump.py inlines core/organelles.js (`ORGAN = shared("organelles.js")`), so in principle a
# rebuild would carry this. In practice reseed.refuse_if_it_would_lose_code() REFUSES to write
# wjump.html: the served page holds 88 lines the current generator does not produce -- some of them
# genuinely newer than the generator's inputs (this morning's UTF-8 sign-in fix among them). That
# refusal is the guard doing its job and must not be overridden; the fix is to fold those lines back
# into build_wjump.py's inputs, which is its own piece of work.
# Until then the inlined copy is patched with the SAME text, from the SAME pairs, so the two copies
# cannot say different things about what a line annotation means.
edit("wjump.html", PARSE + ROWS)
for rel, pairs in MESSAGES.items():
    edit(rel, pairs)
print("\nnow: node organellelinecheck.js   and   python3 build_wjump.py")
