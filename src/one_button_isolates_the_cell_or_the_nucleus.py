# -*- coding: utf-8 -*-
u"""One button isolates the cell or the nucleus, and both panels say which is which.     2026-10-03

Søren: *"Also a button to only show nucleus or only show root ID"*.

ONE BUTTON, THREE STATES, because he asked for the strip to stay small: both → the cell on its own
→ the nucleus on its own → both. The glyph shows what is on screen NOW rather than what pressing
will do next, which is the way round that does not need explaining; the title says what the press
will do.

It appears only where there is something to isolate — a panel holding one surface has nothing to
take away. A tracing is never hidden by it: it is the user's own work and the thing the panel is
open for, so "only the nucleus" means the nucleus and the outline you drew, not a panel that has
quietly discarded the drawing.

AND THE REASON THIS TOOK A SECOND EDIT TO TWO OTHER FILES. core/mesh3d.js had no idea which of the
surfaces it was handed was a cell and which was a nucleus. It had the colours — and the colours
would have worked, today, which is exactly the trap: a tint is a colour, colours get retuned, and a
button that stopped isolating the right surface because somebody adjusted a blue would be
indistinguishable from a bug in the button.

So the callers say so, in the word they already use among themselves. core/empreview.js has had
`parts[i].what` of "cell" or "nucleus" since it was written and was dropping it on the way into
show(); core/tracingcard.js has `x.what` and was doing the same. Both now pass it through, which
also fixes something that was quietly broken an hour ago: the "look at the nucleus" button looks
for a ghost marked `what: "nucleus"`, and neither panel was marking one, so it would never have
appeared in either place. Found by writing this, not by anybody pressing it.

Check: mesh3dtoolscheck.js.
Run: python3 src/one_button_isolates_the_cell_or_the_nucleus.py, then node mesh3dtoolscheck.js
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


edit("core/empreview.js", [

 (u"the ghosts say what they are",
  u'''    ghosts.push({ geo: g,
                  alpha: parts[i].what === "cell" ? 0.14 : 0.35,
                  tint: parts[i].what === "cell" ? CELL : NUC });''',
  u'''    ghosts.push({ geo: g,
                  /* PASSED ON, not re-derived from the colour. core/mesh3d.js's "look at the
                     nucleus" and "show one of them" buttons need to know which surface is which,
                     and this function has known since it was written. 2026-10-03. */
                  what: parts[i].what,
                  alpha: parts[i].what === "cell" ? 0.14 : 0.35,
                  tint: parts[i].what === "cell" ? CELL : NUC });'''),

 (u"...and so does the subject",
  u'''  M.show(host, geos[leadAt], { ghosts: ghosts, view: host.__empView,
                               tint: (leadAt === nucAt) ? NUC : CELL,
                               emptyMessage: "That cell has no mesh to draw." });''',
  u'''  M.show(host, geos[leadAt], { ghosts: ghosts, view: host.__empView,
                               what: parts[leadAt].what,
                               tint: (leadAt === nucAt) ? NUC : CELL,
                               emptyMessage: "That cell has no mesh to draw." });'''),
])


edit("core/tracingcard.js", [

 (u"the pad's ghosts say what they are too",
  u'''      return { geo: tracingM3D().prepare(x.mesh.positions, x.mesh.indices,
                                      { unitNm: 1000, frame: frame }),''',
  u'''      return { geo: tracingM3D().prepare(x.mesh.positions, x.mesh.indices,
                                      { unitNm: 1000, frame: frame }),
               /* "cell" or "nucleus", for the panel's own buttons. It was already in hand here and
                  dropped on the way in. 2026-10-03. */
               what: x.what,'''),
])


edit("core/mesh3d.js", [

 (u"every drawable carries what it is",
  u'''    var ALL = [{ d: MAIN, tint: o.tint || null,
                 alpha: (o.alpha === undefined ? 1 : o.alpha) }].concat(GHOSTS);''',
  u'''    var ALL = [{ d: MAIN, tint: o.tint || null, what: o.what || "",
                 alpha: (o.alpha === undefined ? 1 : o.alpha) }].concat(GHOSTS);'''),

 (u"...including the ghosts",
  u'''      return d ? { d: d, tint: g.tint || null, alpha: (g.alpha === undefined ? 0.22 : g.alpha) } : null;''',
  u'''      return d ? { d: d, tint: g.tint || null, what: g.what || "",
                   alpha: (g.alpha === undefined ? 0.22 : g.alpha) } : null;'''),

 (u"showing one of them",
  u'''    var spinning = 0;''',
  u'''    /* ── SHOWING ONE OF THEM ──────────────────────────────────────────────────  2026-10-03
       Søren: "Also a button to only show nucleus or only show root ID". Three states on one
       button, because the strip is meant to stay small.

       BY WHAT A SURFACE IS, not by its colour and not by whether it is the subject: core/empreview
       makes the NUCLEUS the subject and the cell a ghost, the pad does the opposite, and a rule
       about subjects would hide the wrong thing in one of the two.

       A SURFACE WITH NO `what` IS ALWAYS DRAWN. That is the tracing on the pad — the user's own
       work and the reason the panel is open. "Only the nucleus" means the nucleus and the outline
       you drew, not a panel that has quietly thrown the drawing away. */
    var ISO = "all";
    function isoShows(it){
      if (ISO === "cell") return it.what !== "nucleus";
      if (ISO === "nucleus") return it.what !== "cell";
      return true;
    }
    function isoCan(){
      var has = {};
      ALL.forEach(function(it){ if (it.what) has[it.what] = 1; });
      return !!(has.cell && has.nucleus);
    }
    function isoNext(){
      ISO = ISO === "all" ? "cell" : ISO === "cell" ? "nucleus" : "all";
      paint();
      return ISO;
    }

    var spinning = 0;'''),

 (u"and the paint skips what is hidden",
  u'''      var opaque = [], clear = [];
      ALL.forEach(function(it){ (it.alpha >= 1 ? opaque : clear).push(it); });''',
  u'''      var opaque = [], clear = [];
      ALL.forEach(function(it){
        if (!isoShows(it)) return;
        (it.alpha >= 1 ? opaque : clear).push(it);
      });'''),

 (u"the panel offers it",
  u'''    LAST = { gl: gl, paint: paint, canvas: canvas, sweep: sweep,
             spin: spin, nucleus: lookAtNucleus };''',
  u'''    LAST = { gl: gl, paint: paint, canvas: canvas, sweep: sweep,
             spin: spin, nucleus: lookAtNucleus, iso: isoNext, isoCan: isoCan,
             isoNow: function(){ return ISO; } };'''),

 (u"the button, beside the other three",
  u'''  function hasNucleus(o){
    return (o && o.ghosts || []).some(function(g){ return g && g.what === "nucleus"; });
  }''',
  u'''  function hasNucleus(o){
    if (o && o.what === "nucleus") return true;
    return (o && o.ghosts || []).some(function(g){ return g && g.what === "nucleus"; });
  }
  /* Something to isolate means BOTH are here — a panel holding one surface has nothing to take
     away, and a button that only ever does nothing is worse than no button. */
  function hasBoth(o){
    var has = {};
    if (o && o.what) has[o.what] = 1;
    (o && o.ghosts || []).forEach(function(g){ if (g && g.what) has[g.what] = 1; });
    return !!(has.cell && has.nucleus);
  }
  /* The glyph says what is ON SCREEN, not what the press will do — that way round needs no
     explaining. The title says what the press will do. */
  var ISO_FACE = { all:     ["\\u25c9", "Showing the cell and the nucleus",
                             "Showing both. Press to show the cell on its own."],
                   cell:    ["\\u25cb", "Showing the cell on its own",
                             "Showing the cell on its own. Press to show the nucleus on its own."],
                   nucleus: ["\\u25cf", "Showing the nucleus on its own",
                             "Showing the nucleus on its own. Press to show both again."] };''' ),

 (u"...in the markup",
  u'''      + (hasNucleus(o)
          ? b("m3d-nuc", "\\u2299", "Look at the nucleus",''',
  u'''      + (hasBoth(o)
          ? b("m3d-iso", ISO_FACE.all[0], ISO_FACE.all[1], ISO_FACE.all[2])
          : "")
      + (hasNucleus(o)
          ? b("m3d-nuc", "\\u2299", "Look at the nucleus",'''),

 (u"...and wired",
  u'''    on(".m3d-nuc", function(el){''',
  u'''    on(".m3d-iso", function(el){
      var now = LAST && LAST.iso ? LAST.iso() : "all";
      var face = ISO_FACE[now] || ISO_FACE.all;
      el.textContent = face[0];
      el.setAttribute("aria-label", face[1]);
      el.setAttribute("title", face[2]);
      el.classList.toggle("m3d-on", now !== "all");
    });
    on(".m3d-nuc", function(el){'''),
])
print("\nNow: node mesh3dtoolscheck.js")
