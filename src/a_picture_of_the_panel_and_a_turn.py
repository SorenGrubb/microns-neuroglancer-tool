# -*- coding: utf-8 -*-
u"""The panel can hand out a frame, and a turn, and offers to save them.                 2026-10-03

Søren: *"Can we make a button to export the view of the show in 3D as an image with scalebar or as a
movie that rotates 360 degrees with the current view?"* — a PNG and a GIF, from a fifth icon in the
corner strip.

WHAT GOES IN THIS FILE AND WHAT DOES NOT. core/mesh3dshot.js owns the scale bar, the PNG and the
GIF. This file owns the three things only it can do:

  frame()     paint and read the colour buffer IN ONE TURN. Without preserveDrawingBuffer the
              buffer is undefined once control returns to the browser, which is the trap probe()
              already carries a paragraph about -- a check once reported "nothing drawn" about a
              working panel for exactly this reason. So the grab cannot live anywhere else.
  nmPerPx()   what a pixel is worth, in nanometres: 2·dist·tan(FOV/2)·span ÷ height. All three of
              dist, FOV and span live here. A second copy of the field of view in the module that
              draws the bar would be wrong by a constant, which is the kind of wrong that looks
              right, and it would be read off a figure by somebody who was not here.
  turn()      a full revolution and back. The camera is this file's, and an export must not leave
              the model somewhere the reader did not put it.

THE BUTTON APPEARS ONLY WHERE THE MODULE IS. A page that does not load core/mesh3dshot.js gets four
buttons, as before -- an icon that can only ever fail is worse than no icon, which is the rule the
other two conditional buttons in this strip already follow.

Check: shotcheck.js.
Run: python3 src/a_picture_of_the_panel_and_a_turn.py
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

 (u"the panel can be photographed and turned",
  u'''    LAST = { gl: gl, paint: paint, canvas: canvas, sweep: sweep,
             spin: spin, nucleus: lookAtNucleus, iso: isoNext, isoCan: isoCan,
             isoNow: function(){ return ISO; },
             framedNow: function(){ return framedNuc; } };''',
  u'''    LAST = { gl: gl, paint: paint, canvas: canvas, sweep: sweep,
             spin: spin, nucleus: lookAtNucleus, iso: isoNext, isoCan: isoCan,
             isoNow: function(){ return ISO; },
             framedNow: function(){ return framedNuc; },
             /* ── WHAT A PIXEL IS WORTH ─────────────────────────────────────────  2026-10-03
                In NANOMETRES. 2·dist·tan(FOV/2) is the visible height at the model's own centre
                plane in MODEL units, and a model unit is geo.span nanometres; divided by the
                pixels that cover it. Here, because dist, FOV and span are all here — the module
                that draws the scale bar asks rather than re-deriving, and a second copy of the
                field of view would be wrong by a constant, which looks right. */
             nmPerPx: function(){
               return 2 * (view.dist || 1) * Math.tan(FOV / 2) * (geo.span || 1)
                      / (canvas.height || 1);
             },
             /* A FULL REVOLUTION, AND BACK. `each(k)` is called with the camera already moved, so
                a caller grabs the frame inside it. The view is restored at the end: an export is
                not a navigation, and leaving the model turned would be a side effect of taking a
                picture of it. */
             turn: function(n, each){
               var yaw0 = view.yaw, k;
               try {
                 for (k = 0; k < n; k++){
                   view.yaw = yaw0 + k / n * Math.PI * 2;
                   each(k);
                 }
               } finally { view.yaw = yaw0; paint(); }
               return n;
             } };'''),

 (u"...and says so to anyone who asks",
  u'''  /* Run the light through again — for a button, a double-click, or a tool that wants to point
     at the panel. Silent on a page whose panel has gone. */
  function sweepAgain(){ if (LAST && LAST.sweep) LAST.sweep(); }''',
  u'''  /* Run the light through again — for a button, a double-click, or a tool that wants to point
     at the panel. Silent on a page whose panel has gone. */
  function sweepAgain(){ if (LAST && LAST.sweep) LAST.sweep(); }

  /* ── ONE PAINTED FRAME, READ IN THE SAME TURN ──────────────────────────────────  2026-10-03
     The colour buffer is undefined once control returns to the browser unless
     preserveDrawingBuffer is on, and keeping a copy of every frame for a panel nobody photographs
     is a real cost — the whole argument probePixels carries above. So the grab lives here, beside
     the context, and hands back the bytes with everything needed to put a scale bar on them.

     `bottomUp` because readPixels' origin is the BOTTOM-left while a canvas image runs top-down.
     Said rather than assumed: getting it wrong mirrors the picture vertically, and on a neuron
     that is not obvious — it just looks like a different cell. */
  function frame(){
    if (!LAST) return null;
    LAST.paint();
    var gl = LAST.gl, c = LAST.canvas;
    var px = new Uint8Array(c.width * c.height * 4);
    gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { px: px, w: c.width, h: c.height, nmPerPx: LAST.nmPerPx(), bottomUp: true };
  }
  function turn(n, each){
    if (!LAST || !LAST.turn) return 0;
    return LAST.turn(n, each);
  }
  /* Whether anything can be saved from here: the module that writes the files, and a panel to
     write one of. */
  function canSave(){
    return !!(LAST && window.UJ && UJ.mesh3dshot && UJ.mesh3dshot.imageBlob);
  }'''),

 (u"a fifth icon, and the two things it offers",
  u'''  function toolsHtml(o){
    var b = function(cls, glyph, label, title){''',
  u'''  /* ── SAVING WHAT YOU ARE LOOKING AT ────────────────────────────────────────────  2026-10-03
     Søren: "a button to export the view of the show in 3D as an image with scalebar or as a movie
     that rotates 360 degrees with the current view." Two things, and the icon does not guess which
     — it opens a pair of named choices, which is two taps and no ambiguity. The strip stays five
     wide, which is what he asked for when the fourth was added.

     core/mesh3dshot.js writes both files. The button is offered only where that module is loaded:
     an icon that can only ever fail is worse than no icon, which is the rule the nucleus and
     isolate buttons already follow. */
  var SAVE_FACE = ["\\u2913", "Save this view",
                   "Save this view as a picture or as a turning model"];
  function hasShot(){
    return !!(window.UJ && UJ.mesh3dshot && UJ.mesh3dshot.imageBlob);
  }
  function toolsHtml(o){
    var b = function(cls, glyph, label, title){'''),

 (u"...in the strip",
  u'''    return "<div class='m3d-tools'>"''',
  u'''    var saveBtn = hasShot()
      ? b("m3d-save", SAVE_FACE[0], SAVE_FACE[1], SAVE_FACE[2])
        + "<div class='m3d-saves' hidden>"
        + "<button type='button' class='m3d-savepng'>Picture (PNG)</button>"
        + "<button type='button' class='m3d-savegif'>Turn (GIF)</button>"
        + "</div>"
      : "";
    return "<div class='m3d-tools'>"'''),

 (u"...at the end of it",
  u'''      + (hasBoth(o)
          ? b("m3d-iso", ISO_FACE.all[0], ISO_FACE.all[1], ISO_FACE.all[2])
          : "")''',
  u'''      + saveBtn
      + (hasBoth(o)
          ? b("m3d-iso", ISO_FACE.all[0], ISO_FACE.all[1], ISO_FACE.all[2])
          : "")'''),

 (u"and wired to the module",
  u'''    on(".m3d-sweep", function(){ sweepAgain(); });''',
  u'''    on(".m3d-sweep", function(){ sweepAgain(); });
    /* THE MENU IS A TOGGLE AND THE CHOICES CLOSE IT. Nothing listens on the document to dismiss
       it: a click anywhere on the canvas is a drag starting, and swallowing those to close a menu
       would make the model stick. Pressing the icon again is the way out. */
    var menu = stage.querySelector(".m3d-saves");
    on(".m3d-save", function(el){
      if (!menu) return;
      menu.hidden = !menu.hidden;
      el.classList.toggle("m3d-on", !menu.hidden);
    });
    var saving = false;
    var run = function(what, el){
      if (saving || !window.UJ || !UJ.mesh3dshot) return;
      saving = true;
      var was = el.textContent;
      el.textContent = "working\\u2026";
      var name = (o && o.saveName) || "cell";
      var p = what === "gif" ? UJ.mesh3dshot.saveTurn({ name: name })
                             : UJ.mesh3dshot.saveImage({ name: name });
      p.catch(function(e){
        /* IN THE PANEL'S OWN NOTE, not an alert. A refusal that interrupts is worse than one you
           can read beside the thing that refused. */
        var note = host.querySelector(".m3d-note");
        if (note) note.innerHTML += "<br><b style='color:var(--bad)'>Could not save that: "
          + esc(e && e.message ? e.message : String(e)) + "</b>";
      }).then(function(){
        saving = false;
        el.textContent = was;
        if (menu){ menu.hidden = true; }
        var sv = stage.querySelector(".m3d-save");
        if (sv) sv.classList.remove("m3d-on");
      });
    };
    on(".m3d-savepng", function(el){ run("png", el); });
    on(".m3d-savegif", function(el){ run("gif", el); });'''),

 (u"...and the three are exported",
  u'''           probePixels: probePixels, NUC_TINT: NUC_TINT, NUC_COLOR: NUC_COLOR,''',
  u'''           probePixels: probePixels, frame: frame, turn: turn, canSave: canSave,
           NUC_TINT: NUC_TINT, NUC_COLOR: NUC_COLOR,'''),

 (u"and the menu has somewhere to sit",
  u'''    + ".m3d-tool.m3d-on{opacity:1;border-color:var(--accent,#49b0ff);color:var(--accent,#49b0ff)}"''',
  u'''    + ".m3d-tool.m3d-on{opacity:1;border-color:var(--accent,#49b0ff);color:var(--accent,#49b0ff)}"
    /* Under the strip, right-aligned with it. pointer-events back on, because the strip above
       turns them off for everything that is not a button. */
    + ".m3d-saves{position:absolute;top:40px;right:8px;display:flex;flex-direction:column;gap:4px;"
    + "pointer-events:auto;z-index:2}"
    + ".m3d-saves[hidden]{display:none}"
    + ".m3d-saves button{font-size:12px;padding:5px 10px;cursor:pointer;white-space:nowrap;"
    + "border:1px solid var(--line,#333);border-radius:7px;"
    + "background:var(--card,var(--panel,var(--bg,#1a1a1a)));color:var(--ink,#eee)}"
    + ".m3d-saves button:hover,.m3d-saves button:focus-visible{border-color:var(--accent,#49b0ff)}"'''),
])
print("\nNow: python3 src/build_stamps.py, then node shotcheck.js")
