# -*- coding: utf-8 -*-
u"""Every surface can carry a name, and the panel will list them.                        2026-10-04

Søren, asked what a shared picture's caption should say: *"It should say which cell it is and if
there are organelles, then also which organelles. Another thing, we also need to have a tool logo in
the lower right corner and the cell name and organelle names in the top left corner."*

THE CAPTION AND THE CORNER ARE THE SAME LIST, so there is one of it. `legend()` hands back what the
panel is drawing RIGHT NOW — in draw order, skipping whatever the isolate button has hidden —
and core/mesh3dshot.js writes it into the corner and into the post from the one call.

A `label` BESIDE `what`, NOT INSTEAD OF IT. `what` is a contract between callers and this file's
buttons — "cell" and "nucleus", nothing else, and hasBoth() and nucleusGeo() read it. A label is
free text for a human: "Cell 864691135194795306", "Nucleus 485387", "Mitochondrion 3". Putting the
id into `what` would have made the buttons stop finding the nucleus the first time somebody wrote a
number after it.

AND THE SURFACE WITH NO `what` FINALLY GETS A NAME. That is the tracing on the pad, and on the pad
it is usually an organelle — which is exactly what he is asking to see named. It has never had
anywhere to say so; now it does.

Check: shotcheck.js.
Run: python3 src/the_panel_says_what_it_is_drawing.py
     python3 src/build_stamps.py
     node shotcheck.js
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    print(rel)
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("core/mesh3d.js", [

 (u"a surface can be named",
  u'''    var ALL = [{ d: MAIN, tint: o.tint || null, what: o.what || "",
                 alpha: (o.alpha === undefined ? 1 : o.alpha) }].concat(GHOSTS);''',
  u'''    /* `label` is free text for a reader — "Cell 864691135194795306", "Mitochondrion 3" — and
       sits BESIDE `what`, which stays the contract this file's own buttons read. 2026-10-04. */
    var ALL = [{ d: MAIN, tint: o.tint || null, what: o.what || "", label: o.label || "",
                 alpha: (o.alpha === undefined ? 1 : o.alpha) }].concat(GHOSTS);'''),

 (u"...and a ghost too",
  u'''      return d ? { d: d, tint: g.tint || null, what: g.what || "",
                   alpha: (g.alpha === undefined ? 0.22 : g.alpha) } : null;''',
  u'''      return d ? { d: d, tint: g.tint || null, what: g.what || "", label: g.label || "",
                   alpha: (g.alpha === undefined ? 0.22 : g.alpha) } : null;'''),

 (u"the panel lists what it is drawing",
  u'''             framedNow: function(){ return framedNuc; },''',
  u'''             framedNow: function(){ return framedNuc; },
             /* ── WHAT IS ON SCREEN, IN ORDER ───────────────────────────────────────  2026-10-04
                Only what is actually drawn: the isolate button hides a surface, and a corner block
                naming something the reader cannot see is worse than no block. Unnamed surfaces are
                left out rather than listed as blanks. */
             legend: function(){
               return ALL.filter(function(it){ return it.label && isoShows(it); })
                         .map(function(it){
                           return { what: it.what, label: it.label,
                                    tint: it.tint ? it.tint.slice() : null };
                         });
             },''') ,

 (u"...and anyone can ask",
  u'''  function turn(n, each){
    if (!LAST || !LAST.turn) return 0;
    return LAST.turn(n, each);
  }''',
  u'''  function turn(n, each){
    if (!LAST || !LAST.turn) return 0;
    return LAST.turn(n, each);
  }
  /* What the open panel is drawing, named. core/mesh3dshot.js writes this into the picture's
     top-left corner and into the text of a post, from the one call — so the two cannot disagree
     about what is in the picture. */
  function legend(){
    return (LAST && LAST.legend) ? LAST.legend() : [];
  }'''),

 (u"...and it is exported",
  u'''           probePixels: probePixels, frame: frame, turn: turn, canSave: canSave,''',
  u'''           probePixels: probePixels, frame: frame, turn: turn, canSave: canSave,
           legend: legend,'''),
])
print("\nNow: python3 src/build_stamps.py, then node shotcheck.js")
