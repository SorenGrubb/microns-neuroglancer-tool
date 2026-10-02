# -*- coding: utf-8 -*-
u"""Three buttons in the corner, and the light waits for the mesh.                       2026-10-03

Søren: *"The lightning kinda blimped before the 3D mesh had finished loading. I think it should go
at least 3 times and then there should be a button in the corner of the 3D window to fire it again.
Also a button to make the model rotate and a button to make it zoom in on the nucleus. You can use
icons instead of text to make the buttons smaller."*

WHY IT BLIPPED, which is the part worth understanding. The sweep fired when show() was called, and
show() is called as soon as the SUBJECT's geometry is in hand — a lofted tracing, which takes a
millisecond. The cell mesh and the nucleus mesh are megabytes and arrive afterwards, each
triggering another show(). So the light ran through an outline and was finished before the thing he
wanted to watch it cross had loaded.

The key that decides "is this a new model" counted the subject's triangles and radius only, so
those later arrivals were "the same model, redrawn" and swept nothing. THE GHOSTS ARE PART OF THE
MODEL, so they are part of the key — and the cell arriving is now exactly what it looks like, a new
thing to light.

THREE PASSES, as asked, and they run back to back as one 4.5 s event rather than three separate
sweeps, so the thing that ends it is the thing that started it. Still once per model, still
stopped entirely by prefers-reduced-motion.

THE BUTTONS, and what each one needs:

  ✦  sweep again. Nothing new — UJ.mesh3d.sweep() already existed for exactly this.

  ⟳  spin. A rAF loop on yaw, and it is a TOGGLE rather than a one-shot because "make the model
     rotate" is a state somebody turns on while they look at something else. It survives
     prefers-reduced-motion deliberately: the preference is about animation nobody asked for, and
     this one is a button somebody pressed. Her repo puts it well — reduced motion means no
     animation, not no interaction.

  ⊙  zoom to the nucleus. THIS ONE NEEDED THE CAMERA TO LEARN SOMETHING. mv was
     translate(0,0,-dist) · rotX · rotY · norm, which can only ever orbit the middle of the frame —
     there was no way to put something off-centre in the middle of the picture, and a nucleus is by
     definition off-centre in its cell. `view.target` is a model-space point the camera looks at,
     applied before the rotation, so the orbit happens around it. A second press goes back.

     It appears only when a ghost says it is a nucleus. A caller marks it `what: "nucleus"`, which
     is the word core/empreview.js already uses for its own parts, rather than this file guessing
     from a tint — a tint is a colour and colours get retuned.

ICONS, and they are text characters rather than SVG: one glyph each, no file to fetch, and they
inherit the page's own colour and size. Every one carries a title and an aria-label, because a
rebus is not a label.

POINTER EVENTS ARE THE TRAP HERE. The canvas is turned by dragging and zoomed by pinching, so the
button strip is positioned over it and must not swallow a drag that starts anywhere but on a
button: the strip is pointer-events:none and only the buttons themselves take pointers.

Check: mesh3dtoolscheck.js, written red first.
Run: python3 src/the_3d_panel_gets_three_buttons.py, then node mesh3dtoolscheck.js
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

 (u"the panel has a stage for the canvas and its buttons",
  u'''    host.innerHTML = "<div class='m3d'><canvas class='m3d-canvas'></canvas>"
      + "<div class='m3d-note'></div></div>";
    var canvas = host.querySelector(".m3d-canvas"), note = host.querySelector(".m3d-note");''',
  u'''    /* A stage round the canvas so the buttons have something to be positioned inside. Every
       selector anywhere else is a descendant one (.m3d-canvas, .m3d-note), so nothing else has to
       know this exists. */
    host.innerHTML = "<div class='m3d'><div class='m3d-stage'>"
      + "<canvas class='m3d-canvas'></canvas>" + toolsHtml(o) + "</div>"
      + "<div class='m3d-note'></div></div>";
    var canvas = host.querySelector(".m3d-canvas"), note = host.querySelector(".m3d-note");
    wireTools(host, o);'''),

 (u"the camera can look at something other than the middle",
  u"      var mv = mul(translate(0, 0, -view.dist), mul(rotX(view.pitch), mul(rotY(view.yaw), norm)));",
  u'''      /* ── WHAT THE CAMERA IS LOOKING AT ────────────────────────────────────  2026-10-03
         It could only ever orbit the middle of the frame, which is fine for one object and no use
         at all for "zoom in on the nucleus": a nucleus is off-centre in its cell by definition, and
         there was nowhere to put that offset. `view.target` is a point in MODEL units (the same
         units geo.lo/hi are in, measured from the frame's mid), translated out before the rotation
         so the orbit happens around it. Absent, it is the origin and every panel is as it was. */
      var tg = view.target || null;
      var base = tg ? mul(translate(-tg[0] / (geo.span || 1), -tg[1] / (geo.span || 1),
                                    -tg[2] / (geo.span || 1)), norm)
                    : norm;
      var mv = mul(translate(0, 0, -view.dist), mul(rotX(view.pitch), mul(rotY(view.yaw), base)));'''),

 (u"the ghosts are part of the model, so the light waits for them",
  u'''    var key = (geo.triangles || 0) + ":" + Math.round((geo.radius || 0) * 10);
    if (key !== SWEPT){ SWEPT = key; sweep(); }''',
  u'''    /* ── THE GHOSTS ARE PART OF THE MODEL ─────────────────────────────────────  2026-10-03
       Søren: "The lightning kinda blimped before the 3D mesh had finished loading." It did, and
       this line is why: show() is called as soon as the SUBJECT is ready — a lofted tracing, which
       takes a millisecond — and the cell and nucleus meshes are megabytes that arrive afterwards
       and call show() again. Keyed on the subject alone, those arrivals were "the same model,
       redrawn", so the light had already been and gone through an outline.

       Counting the ghosts makes the cell landing exactly what it looks like: a new thing to light.
       And a redraw that changes only the camera, the tint or the alpha still changes nothing here,
       which is what keeps the pad from sweeping after every contour. */
    var key = (geo.triangles || 0) + ":" + Math.round((geo.radius || 0) * 10)
            + "|" + (o.ghosts || []).map(function(g){
                return (g && g.geo && g.geo.triangles) || 0; }).join(",");
    if (key !== SWEPT){ SWEPT = key; sweep(); }'''),

 (u"three passes, back to back",
  u'''      var t0 = (typeof performance !== "undefined" && performance.now) ? performance.now()
                                                                       : Date.now();
      var me = ++sweeping, SPAN = 1500;''',
  u'''      var t0 = (typeof performance !== "undefined" && performance.now) ? performance.now()
                                                                       : Date.now();
      /* THREE, at Søren's asking, as one event rather than three: "I think it should go at least
         3 times". Back to back, so what ends it is what started it and a second press cannot
         leave two overlapping. */
      var me = ++sweeping, SPAN = 1500, PASSES = 3;'''),

 (u"...and the loop runs them",
  u'''        var k = (now - t0) / SPAN;
        if (k >= 1){ PULSE = -1; paint(); return; }
        /* From just outside one end to just outside the other, so the band enters and leaves
           rather than appearing on the surface and vanishing off it. */
        PULSE = -0.12 + k * 1.24;''',
  u'''        var k = (now - t0) / SPAN;
        if (k >= PASSES){ PULSE = -1; paint(); return; }
        /* From just outside one end to just outside the other, so the band enters and leaves
           rather than appearing on the surface and vanishing off it. k % 1 restarts it for each
           pass; between passes the band is briefly outside the model, which is the beat that makes
           three passes read as three rather than as one long flicker. */
        PULSE = -0.12 + (k % 1) * 1.24;'''),

 (u"the buttons, their markup and their wiring",
  u'''  /* Run the light through again — for a button, a double-click, or a tool that wants to point
     at the panel. Silent on a page whose panel has gone. */
  function sweepAgain(){ if (LAST && LAST.sweep) LAST.sweep(); }''',
  u'''  /* Run the light through again — for a button, a double-click, or a tool that wants to point
     at the panel. Silent on a page whose panel has gone. */
  function sweepAgain(){ if (LAST && LAST.sweep) LAST.sweep(); }

  /* ── THREE BUTTONS IN THE CORNER ────────────────────────────────────────────────  2026-10-03
     Søren: "there should be a button in the corner of the 3D window to fire it again. Also a button
     to make the model rotate and a button to make it zoom in on the nucleus. You can use icons
     instead of text to make the buttons smaller."

     GLYPHS RATHER THAN SVG: one character each, nothing to fetch, and they take the page's own
     colour and size. Each carries a title and an aria-label, because an icon is a rebus and a
     rebus is not a label.

     THE NUCLEUS BUTTON IS CONDITIONAL, and on the caller SAYING so: a ghost marked
     `what: "nucleus"`, which is the word core/empreview.js already uses for its own parts. Guessing
     from the tint would work today and break the day somebody retunes a colour. */
  function hasNucleus(o){
    return (o && o.ghosts || []).some(function(g){ return g && g.what === "nucleus"; });
  }
  function toolsHtml(o){
    var b = function(cls, glyph, label, title){
      return "<button type='button' class='m3d-tool " + cls + "' aria-label='" + esc(label)
           + "' title='" + esc(title) + "'>" + glyph + "</button>";
    };
    return "<div class='m3d-tools'>"
      + b("m3d-spin", "\\u27f3", "Turn it slowly",
          "Turns the model slowly so you can see it from every side. Press again to stop. Dragging "
          + "still works while it turns.")
      + b("m3d-sweep", "\\u2726", "Run the light through it again",
          "Sends a band of light out from the centre of the structure, three times. It is the "
          + "surface it crosses that lights up, so a gap in it shows as a gap the light goes past.")
      + (hasNucleus(o)
          ? b("m3d-nuc", "\\u2299", "Look at the nucleus",
              "Moves the camera onto the nucleus and comes in close. Press again to go back to the "
              + "whole cell.")
          : "")
      + "</div>";
  }
  function wireTools(host, o){
    var stage = host.querySelector(".m3d-stage");
    if (!stage) return;
    var on = function(sel, f){
      var el = stage.querySelector(sel);
      if (el) el.addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); f(el); });
    };
    on(".m3d-sweep", function(){ sweepAgain(); });
    on(".m3d-spin", function(el){
      var now = LAST && LAST.spin ? LAST.spin() : false;
      el.setAttribute("aria-pressed", now ? "true" : "false");
      el.classList.toggle("m3d-on", !!now);
    });
    on(".m3d-nuc", function(el){
      var now = LAST && LAST.nucleus ? LAST.nucleus() : false;
      el.setAttribute("aria-pressed", now ? "true" : "false");
      el.classList.toggle("m3d-on", !!now);
    });
  }'''),

 (u"spin and look-at, beside the sweep",
  u'''    var FOV = 0.9, FILL = 0.88;''',
  u'''    /* ── TURNING IT SLOWLY ────────────────────────────────────────────────────  2026-10-03
       A toggle, not a one-shot: "make the model rotate" is a state somebody turns on while they
       look at something else. A drag still works while it runs, because the drag writes the same
       view.yaw this does and the next frame carries on from wherever the hand left it.

       NOT SUPPRESSED BY prefers-reduced-motion, and that is deliberate rather than an oversight:
       the preference is about animation nobody asked for. This one is a button somebody pressed,
       and taking it away would leave them with a control that does nothing. */
    var spinning = 0;
    function spin(){
      if (spinning){ spinning = 0; return false; }
      var me = ++spinning;
      var last = (typeof performance !== "undefined" && performance.now) ? performance.now()
                                                                        : Date.now();
      (function step(){
        if (spinning !== me) return;
        var now = (typeof performance !== "undefined" && performance.now) ? performance.now()
                                                                          : Date.now();
        /* Radians a second, not radians a frame: a 120 Hz screen must not turn it twice as fast. */
        view.yaw += (now - last) * 0.00045;
        last = now;
        paint();
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(step);
        else spinning = 0;
      })();
      return true;
    }

    /* ── LOOKING AT THE NUCLEUS ───────────────────────────────────────────────  2026-10-03
       The ghost that says it is one, in model units measured from the frame's mid — which is where
       prepare() put every vertex, so its own lo/hi midpoint IS that offset. Toggles back to the
       whole cell, and remembers the distance it came from rather than guessing one. */
    var wasAt = null;
    function nucleusGeo(){
      var g = (o.ghosts || []).filter(function(x){ return x && x.what === "nucleus" && x.geo; })[0];
      return g ? g.geo : null;
    }
    function lookAtNucleus(){
      var ng = nucleusGeo();
      if (!ng) return false;
      if (wasAt){ view.target = wasAt.target; view.dist = wasAt.dist; wasAt = null; paint(); return false; }
      wasAt = { target: view.target || null, dist: view.dist };
      /* lo/hi are ABSOLUTE and mid is the frame's centre, so the nucleus's own centre relative to
         that frame is its box midpoint minus the frame mid — which is exactly what its vertices
         were shifted by. */
      view.target = [ (ng.lo[0] + ng.hi[0]) / 2 - ng.mid[0],
                      (ng.lo[1] + ng.hi[1]) / 2 - ng.mid[1],
                      (ng.lo[2] + ng.hi[2]) / 2 - ng.mid[2] ];
      var rn = (ng.radius || 0) / (ng.span || geo.span || 1);
      view.dist = Math.max(rn / (Math.tan(0.9 / 2) * 0.70), 0.05);
      paint();
      return true;
    }

    var FOV = 0.9, FILL = 0.88;'''),

 (u"...and the panel offers them",
  u'''    LAST = { gl: gl, paint: paint, canvas: canvas, sweep: sweep };''',
  u'''    LAST = { gl: gl, paint: paint, canvas: canvas, sweep: sweep,
             spin: spin, nucleus: lookAtNucleus };'''),

 (u"the buttons are styled, and cannot eat a drag",
  u'''    + ".m3d-btn{}";''',
  u'''    + ".m3d-btn{}"
    /* ── THE CORNER BUTTONS ──────────────────────────────────────────────────────  2026-10-03
       The strip is pointer-events:none and only the buttons take pointers, because the canvas
       under it is turned by dragging and pinched to zoom: a strip that swallowed a drag starting
       anywhere near the corner would read as the model sticking. */
    + ".m3d-stage{position:relative}"
    + ".m3d-tools{position:absolute;top:8px;right:8px;display:flex;gap:5px;pointer-events:none}"
    + ".m3d-tool{pointer-events:auto;width:26px;height:26px;line-height:1;display:flex;"
    + "align-items:center;justify-content:center;font-size:14px;cursor:pointer;"
    + "border:1px solid var(--line,#333);border-radius:7px;background:var(--card,#1a1a1a);"
    + "color:var(--ink,#eee);opacity:.62;transition:opacity .15s,background .15s}"
    + ".m3d-tool:hover,.m3d-tool:focus-visible{opacity:1}"
    + ".m3d-tool.m3d-on{opacity:1;border-color:var(--accent,#49b0ff);color:var(--accent,#49b0ff)}"'''),
])
print("\nNow: node mesh3dtoolscheck.js && node mesh3dlookcheck.js")
