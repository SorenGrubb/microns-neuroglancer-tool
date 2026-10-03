# -*- coding: utf-8 -*-
u"""A surface shown on its own is framed on and drawn solid.                             2026-10-03

Søren, twice in a row, with the isolate button lit:

  *"When the nucleus has been isolated, it should be centered and zoom should zoom in on it instead
  of where the root ID center was."*
  *"When the mesh is shown alone it should not be transparent."*

Both are the same mistake made twice: HIDING A SURFACE WAS NOT THE SAME EVENT AS FRAMING ONE, and
the alpha was decided once, when the panel was built, by a caller who could not know a surface
would later be on its own.

THE CAMERA. It orbits the middle of the FRAME, and the frame is the cell's -- a nucleus sits
off-centre in its cell by definition. So "show only the nucleus" left the camera where the cell had
been, and the nucleus stayed a pale blob to one side of an empty panel. There was already a button
that framed it, so there were two states where there should have been one: `framedNuc` is now that
one state, and the ⊙ button and the ◉ button are two ways of setting it. Its lit state follows,
because two buttons that disagree about one state are worse than one button.

THE ALPHA. core/empreview.js draws the cell at 0.14 so you can see the nucleus inside it -- the
notebook's rule, written down a few lines from here: transparency with nothing behind it costs
contrast and shows nothing. Hide the nucleus and that is precisely the situation, and what Søren
got was a whole pyramidal cell drawn at 14% on a dark field, which is a cobweb. Measured by
mesh3disocheck.js before the change: 890 pixels clearly lit with the nucleus present, ZERO with the
cell on its own.

THE RULE IS ABOUT BEING ALONE, not about which surface it is, and not about which is the subject --
empreview makes the nucleus the subject and the pad does the opposite. A surface carrying a `what`,
drawn while the other kind is hidden, is drawn solid. A surface with NO `what` keeps its own alpha:
that is the tracing on the pad, which is the user's own work, is never what isolation is about, and
is a thing you are meant to see the cell through.

Check: mesh3disocheck.js.
Run: python3 src/alone_means_framed_and_solid.py
     python3 src/build_stamps.py
     node mesh3disocheck.js
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

 (u"nothing else in the panel",
  u'''    function isoCan(){''',
  u'''    /* ── IS THERE ANYTHING ELSE IN HERE ──────────────────────────────────────  2026-10-03
       A surface with no `what` is the tracing on the pad: the user's own drawing, the reason the
       panel is open, and -- this is the part that matters here -- something that sits INSIDE the
       cell. Both of the things isolation does to the picture are only right when there is nothing
       of that kind present:

         framing the nucleus   would fly the camera away from the drawing;
         drawing what is left solid   would hide the drawing behind the cell.

       Each was caught by mesh3dtoolscheck.js on the pad's own arrangement, which counts the
       tracing's pixels: 921 of them became 0 when the camera left, and 664 when the cell went
       opaque in front of it. On a panel holding only a cell and a nucleus, both are right and
       neither has anything to hide. */
    function nothingElse(){
      return !ALL.some(function(it){ return !it.what; });
    }
    function isoCan(){'''),

 (u"one state for being on the nucleus",
  u'''    function lookAtNucleus(){
      var ng = nucleusGeo();
      if (!ng) return false;
      if (wasAt){
        view.target = wasAt.target; view.dist = wasAt.dist;
        nearest = DIST_NEAR;                  // the ordinary floor comes back with the view
        wasAt = null; paint(); return false;
      }
      wasAt = { target: view.target || null, dist: view.dist };''',
  u'''    /* ── ON THE NUCLEUS, OR NOT ───────────────────────────────────────────────  2026-10-03
       Søren: "When the nucleus has been isolated, it should be centered and zoom should zoom in on
       it instead of where the root ID center was."

       He is right, and the reason is that hiding a surface and framing one were separate states.
       The camera orbits the middle of the FRAME, which is the cell's, and a nucleus is off-centre
       in its cell by definition -- so showing only the nucleus left the camera where the cell had
       been and the nucleus stayed a blob to one side.

       ONE PIECE OF STATE, so the two buttons cannot disagree: `framedNuc` says whether the camera
       is on the nucleus, `wasAt` remembers where it was before. ⊙ toggles it; showing only the
       nucleus sets it and leaving that state clears it. */
    var framedNuc = false;
    function frameNucleus(on){
      var ng = nucleusGeo();
      if (!ng) return false;
      on = !!on;
      if (on === framedNuc) return framedNuc;
      if (!on){
        if (wasAt){ view.target = wasAt.target; view.dist = wasAt.dist; wasAt = null; }
        nearest = DIST_NEAR;                  // the ordinary floor comes back with the view
        framedNuc = false; paint(); return false;
      }
      wasAt = { target: view.target || null, dist: view.dist };''') ,

 (u"...and the framing ends by saying so",
  u'''      var want = rn / (Math.tan(FOV / 2) * 0.70);
      nearest = Math.min(DIST_NEAR, Math.max(want, 0.02));
      view.dist = clampDist(want);
      paint();
      return true;
    }''',
  u'''      var want = rn / (Math.tan(FOV / 2) * 0.70);
      nearest = Math.min(DIST_NEAR, Math.max(want, 0.02));
      view.dist = clampDist(want);
      framedNuc = true; paint();
      return true;
    }
    /* The ⊙ button: the same switch under a different glyph. */
    function lookAtNucleus(){ return frameNucleus(!framedNuc); }'''),

 (u"the nucleus is framed on its own size, not on how far it sits from the middle",
  u'''      var rn = (ng.radius || 0) / (geo.span || 1);''',
  u'''      /* ITS OWN SIZE, NOT ITS BOUNDING SPHERE.  2026-10-03
         prepare() measures the bounding sphere AFTER re-centring, and a ghost sharing the cell's
         frame is centred on the CELL -- so ng.radius is the distance from the cell's middle to the
         furthest nucleus vertex, which is right for fitting the whole model and wrong for framing
         one part of it. Here it made the framing distance grow with how far off-centre the nucleus
         sat: a 7 µm nucleus 21 µm out was framed as if it were 28 µm across, four times too far
         out, and the further off-centre the worse. Its own box does not move when the frame does.
         Found by mesh3disocheck.js measuring 0.83 where the arithmetic said 0.21. */
      var half = Math.max(ng.hi[0] - ng.lo[0],
                          ng.hi[1] - ng.lo[1],
                          ng.hi[2] - ng.lo[2]) / 2;
      var rn = half / (geo.span || 1);'''),

 (u"isolating the nucleus frames it",
  u'''    function isoNext(){
      ISO = ISO === "all" ? "cell" : ISO === "cell" ? "nucleus" : "all";
      paint();
      return ISO;
    }''',
  u'''    function isoNext(){
      ISO = ISO === "all" ? "cell" : ISO === "cell" ? "nucleus" : "all";
      /* SHOWING ONLY THE NUCLEUS *IS* LOOKING AT IT. Anything else leaves the camera aimed at a
         point in a cell that is no longer on screen.

         BUT NOT PAST THE USER'S OWN WORK. A panel holding a surface with no `what` is the tracing
         pad, and the drawing is the reason it is open -- the same argument that keeps that surface
         visible in every isolate state keeps the camera from flying away from it. Caught by
         mesh3dtoolscheck.js, which went from 921 green pixels to 0 the moment this reframed on the
         pad. The \u2299 button still flies to the nucleus there, on purpose and on a press.
         2026-10-03. */
      if (nothingElse()) frameNucleus(ISO === "nucleus");
      paint();
      return ISO;
    }''') ,

 (u"a surface drawn alone is drawn solid",
  u'''      var opaque = [], clear = [];
      ALL.forEach(function(it){
        if (!isoShows(it)) return;
        (it.alpha >= 1 ? opaque : clear).push(it);
      });''',
  u'''      var opaque = [], clear = [];
      /* ── ALONE MEANS SOLID ────────────────────────────────────────────────────  2026-10-03
         Søren: "When the mesh is shown alone it should not be transparent." core/empreview.js
         draws the cell at 0.14 so you can see the nucleus inside it -- the rule a few lines below,
         that transparency with nothing behind it costs contrast and shows nothing. Hide the
         nucleus and that is exactly the situation: a whole pyramidal cell at 14% on a dark field
         is a cobweb. Measured before the change: 890 pixels clearly lit with the nucleus there,
         ZERO with the cell on its own.

         BY BEING ALONE, not by which surface it is and not by which is the subject -- empreview
         makes the nucleus the subject and the pad does the opposite. And only where there is
         nothing else in the panel: on the pad the tracing sits INSIDE the cell, so a solid cell
         would hide the drawing the panel is open for. See nothingElse(). */
      var alone = ISO !== "all" && nothingElse();
      ALL.forEach(function(it){
        if (!isoShows(it)) return;
        if (alone && it.what){ opaque.push(it); return; }
        (it.alpha >= 1 ? opaque : clear).push(it);
      });'''),

 (u"the panel can say whether it is framed",
  u'''             spin: spin, nucleus: lookAtNucleus, iso: isoNext, isoCan: isoCan,
             isoNow: function(){ return ISO; } };''',
  u'''             spin: spin, nucleus: lookAtNucleus, iso: isoNext, isoCan: isoCan,
             isoNow: function(){ return ISO; },
             framedNow: function(){ return framedNuc; } };'''),

 (u"and the two buttons agree about it",
  u'''    on(".m3d-iso", function(el){
      var now = LAST && LAST.iso ? LAST.iso() : "all";
      var face = ISO_FACE[now] || ISO_FACE.all;
      el.textContent = face[0];
      el.setAttribute("aria-label", face[1]);
      el.setAttribute("title", face[2]);
      el.classList.toggle("m3d-on", now !== "all");
    });''',
  u'''    on(".m3d-iso", function(el){
      var now = LAST && LAST.iso ? LAST.iso() : "all";
      var face = ISO_FACE[now] || ISO_FACE.all;
      el.textContent = face[0];
      el.setAttribute("aria-label", face[1]);
      el.setAttribute("title", face[2]);
      el.classList.toggle("m3d-on", now !== "all");
      /* "Showing only the nucleus" and "looking at the nucleus" are one state, so the other button
         has to show it. Two buttons disagreeing about one state is worse than one button.
         2026-10-03. */
      var nuc = stage.querySelector(".m3d-nuc");
      if (nuc){
        var framed = !!(LAST && LAST.framedNow && LAST.framedNow());
        nuc.setAttribute("aria-pressed", framed ? "true" : "false");
        nuc.classList.toggle("m3d-on", framed);
      }
    });'''),
])
print("\nNow: python3 src/build_stamps.py, then node mesh3disocheck.js")
