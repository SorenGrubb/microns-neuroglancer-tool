# -*- coding: utf-8 -*-
u"""The pad says it is loading, zooms from the keyboard, and lends a contour.           2026-10-06

Søren, three asks in one breath:

  *"When the tracing pad is loading there should be a loading icon, or else it is difficult to know
  whether to wait or draw. We should also be able to zoom in or out with + or -. Also, if there is a
  tracing already and we want to copy that to the layer we are tracing, it should be added with
  ctrl+shift+left click."*

THE WAIT WAS SAID AND NOT SHOWN. padDraw() already reported "Loading the section... 12/40" into the
status line under the pad -- a line that also carries the contour count, the last move and every
error, and which sits below the picture you are looking at. The pad itself looked finished the whole
time: the previous section is still on the canvas while the next one fetches, by design, because a
blank pad mid-fetch is worse. So the one moment the picture is lying about what it shows is the one
moment nothing on it says so. Now a dimmed cover sits over the canvas with the tile count on it, and
the cursor over the pad is `progress` while it is there.

PLUS AND MINUS STEP THE ZOOM MENU, which is one select whose options run from the widest view to 8x.
Through dispatching its own change event rather than calling padDraw(): one place redraws, and a key
that took a different route would be a second expression of the same decision.

AND A CONTOUR CAN BE LENT. With a tracing opened on the pad beside the one being drawn -- a nucleus
under a whole cell, the commonest case -- ctrl+shift+click on one of its contours puts a copy of it
on the structure you are drawing, on that section, to be dragged into shape. Shift plus the
whole-contour modifier, so it is Cmd+shift on a Mac for the reason padErase has always given: ctrl
+click IS the secondary click there.

IT GOES FIRST IN pointerdown, before padErase, which on a PC is ctrl alone and would otherwise eat
the gesture and delete the contour instead of copying it.

Check: padcopycheck.js (new).
Run: python3 src/the_pad_says_it_is_loading_and_takes_a_copy.py
     python3 src/build_stamps.py
     node padcopycheck.js
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
        n = s.count(old)
        assert n == 1, "@NM@ (@F@): @N@".replace("@NM@", name).replace("@F@", os.path.basename(P)).replace("@N@", str(n))
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


BUSY = u'''/* ── THE COVER THAT SAYS IT IS NOT READY ───────────────────────  2026-10-06
   Søren: *"When the tracing pad is loading there should be a loading icon, or else it is
   difficult to know whether to wait or draw."*

   The pad deliberately keeps the PREVIOUS section on screen while the next one fetches -- a blank
   canvas mid-fetch is worse, and that is why padCapture exists. So while it loads the picture is
   showing somewhere you are not, and until now the only thing that said so was one line in a status
   row that also carries the contour count, the last move and every error.

   A cover over the canvas, with the tile count padDraw was already computing. The canvas' parent is
   already position:relative -- #tracePadPan sits in its corner -- so this needs no layout. */
function padBusy(on, msg){
  var el = document.getElementById("tracePadBusy");
  var cv = document.getElementById("tracePad");
  if (!el) return;
  if (on){
    var t = el.querySelector(".padbusytext");
    if (t) t.textContent = msg || "Loading the section\\u2026";
    el.style.display = "flex";
    if (cv) cv.style.cursor = "progress";
  } else {
    el.style.display = "none";
    if (cv) cv.style.cursor = "crosshair";
  }
}
'''

COPY = u'''/* ── A CONTOUR CAN BE LENT TO THE STRUCTURE YOU ARE DRAWING ─────────  2026-10-06
   Søren: *"if there is a tracing already and we want to copy that to the layer we are tracing,
   it should be added with ctrl+shift+left click."*

   With a tracing opened on the pad beside the one being drawn -- a nucleus under a whole cell, which
   is the case that has cost him two evenings this week -- its contours are right there and retracing
   them by hand is the only way to use them.

   ONE CONTOUR, THE ONE UNDER THE POINTER, onto the structure the pad is on, on this section. A
   vertex or a line of it: either is a way of pointing at the contour you mean, which is the same
   rule padEraseAt uses and for the same reason.

   Refusing to copy a contour onto itself is not pedantry -- a duplicate ring in one structure is two
   identical outlines the volume will integrate twice. */
function padCopyContourAt(e){
  if (!PAD_VIEW || !PAD) return;
  var t = PAD_VIEW.toolAt(e.offsetX, e.offsetY);
  var k = PAD_VIEW.pxPerToolVoxel;
  var hit = UJ.tracepad.hitVertex(PAD, t[0], t[1], k) || UJ.tracepad.hitEdge(PAD, t[0], t[1], k);
  if (!hit || hit.ring < 0 || !PAD.rings[hit.ring]){
    padSay("Nothing to copy there \\u2014 " + PAD_MOD + "+shift+click ON a contour that belongs to "
      + "another number, and a copy of it joins the one you are drawing.", true);
    return;
  }
  var src = PAD.rings[hit.ring], mine = PAD.inst || 0, from = src.inst || 0;
  if (from === mine){
    padSay("That contour is already part of number " + (mine + 1) + ". Copy one from another "
      + "number \\u2014 the nucleus under a whole cell, say.", true);
    return;
  }
  PAD.rings.push({ z: src.z, inst: mine,
                   points: (src.points || []).map(function(p){ return [p[0], p[1]]; }) });
  padPaint(); padRings();
  padSay("Copied " + ((src.points || []).length) + " points from number " + (from + 1)
    + " onto number " + (mine + 1) + ", on this section. Drag its points to fit, or Undo to take "
    + "it back.");
}
/* ── AND THE ZOOM MENU HAS TWO KEYS ───────────────────────────  2026-10-06
   Søren: *"We should also be able to zoom in or out with + or -."* The menu runs from the
   widest view at the top to 8x at the bottom, so + is one step down it.

   THROUGH ITS OWN change EVENT, not by calling padDraw: the menu's handler is where a zoom change
   is decided, and a key with its own route would be a second copy of that decision. */
function padZoomStep(d){
  var sel = document.getElementById("tracePadMip");
  if (!sel || !sel.options.length) return;
  var i = Math.max(0, Math.min(sel.options.length - 1, sel.selectedIndex + d));
  if (i === sel.selectedIndex){
    padSay(d > 0 ? "Already as close as the pad goes." : "Already as wide as the pad goes.");
    return;
  }
  sel.selectedIndex = i;
  sel.dispatchEvent(new Event("change"));
  padSay("Zoom: " + (sel.options[i].textContent || "").trim() + "\\u2026");
}
'''

edit("core/tracingcard.js", [

 (u"the cover and the copy exist",
  u"""async function padDraw(){""",
  BUSY + COPY + u"""async function padDraw(){"""),

 (u"the cover goes up while it loads",
  u"""  const mip = +pick[0], zoom = +(pick[1] || 1);
  try{""",
  u"""  const mip = +pick[0], zoom = +(pick[1] || 1);
  padBusy(true, "Loading the section\\u2026");
  try{"""),

 (u"...and reports the tiles on itself",
  u"""      onProgress: function(d, n){ if (d < n) padSay("Loading the section\\u2026 " + d + "/" + n); }""",
  u"""      onProgress: function(d, n){
        if (d < n){
          padSay("Loading the section\\u2026 " + d + "/" + n);
          padBusy(true, "Loading the section\\u2026 " + d + "/" + n);
        }
      }"""),

 (u"...and comes down however it ends",
  u"""  PAD_BUSY = false;
  padZLabel();""",
  u"""  PAD_BUSY = false;
  padBusy(false);
  padZLabel();"""),

 (u"the gesture goes before the one that erases",
  u"""    if (padErase(e)){ down = null; dragging = null; padEraseAt(e); return; }""",
  u"""    /* BEFORE padErase, which on a PC is ctrl alone and would otherwise delete the contour this
       gesture is asking for a copy of. Left button only, like everything else that draws. */
    if (e.shiftKey && padErase(e) && e.button === 0){
      down = null; dragging = null; padCopyContourAt(e); return;
    }
    if (padErase(e)){ down = null; dragging = null; padEraseAt(e); return; }"""),

 (u"plus and minus zoom",
  u"""    if (e.key === ","){ padStep(-1); e.preventDefault(); }""",
  u"""    /* +/- ZOOM (2026-10-06). "=" and "_" are the unshifted keys under + and − on most
       layouts, and the numpad sends its own names; all of them mean the same thing here. */
    if (e.key === "+" || e.key === "=" || e.key === "Add"){ padZoomStep(1); e.preventDefault(); }
    else if (e.key === "-" || e.key === "_" || e.key === "Subtract"){ padZoomStep(-1); e.preventDefault(); }
    else if (e.key === ","){ padStep(-1); e.preventDefault(); }"""),

 (u"the cover is in the markup",
  u"""    "<canvas id=\\"tracePad\\" width=\\"560\\" height=\\"460\\" style=\\"display:block;cursor:crosshair;touch-action:none\\"></canvas>",""",
  u"""    "<canvas id=\\"tracePad\\" width=\\"560\\" height=\\"460\\" style=\\"display:block;cursor:crosshair;touch-action:none\\"></canvas>",
    "<!-- THE PAD KEEPS THE PREVIOUS SECTION ON SCREEN WHILE THE NEXT ONE FETCHES, so while it loads",
    "     the picture is of somewhere you are not. This says so, over the picture, where the eye is.",
    "     2026-10-06. -->",
    "<div id=\\"tracePadBusy\\" style=\\"position:absolute;inset:0;display:none;align-items:center;justify-content:center;gap:10px;background:rgba(13,17,23,.55);color:#fff;font-size:13px;pointer-events:none;backdrop-filter:blur(1px)\\">",
    "<span style=\\"width:18px;height:18px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:padspin .8s linear infinite;display:inline-block\\"></span>",
    "<span class=\\"padbusytext\\">Loading the section\\u2026</span>",
    "</div>","""),

 (u"and the spinner turns",
  u"""    "<div id=\\"tracePadWrap\\" style=\\"display:none;margin-top:10px\\">",""",
  u"""    "<style>@keyframes padspin{to{transform:rotate(360deg)}}",
    "@media (prefers-reduced-motion:reduce){#tracePadBusy span:first-child{animation:none}}</style>",
    "<div id=\\"tracePadWrap\\" style=\\"display:none;margin-top:10px\\">","""),
 (u"the help table names the new gestures",
  u'''    "<tr><td style=\\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\\"><b>,</b> and <b>.</b></td>''',
  u'''    "<tr><td style=\\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\\"><b class=\\"padmod\\">Ctrl</b>+shift+click a contour</td><td style=\\"padding:3px 0\\">Copy that contour onto the number you are drawing, on this section &mdash; the nucleus under a whole cell, say. Its points come with it; drag them to fit. <b>Undo</b> takes it back.</td></tr>",
    "<tr><td style=\\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\\"><b>+</b> and <b>&minus;</b></td><td style=\\"padding:3px 0\\">Zoom in and out one step of the &micro;m menu. Your contours stay put at every zoom.</td></tr>",
    "<tr><td style=\\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\\"><b>,</b> and <b>.</b></td>'''),

])
print("\\nNow: python3 src/build_stamps.py, then node padcopycheck.js")
