# -*- coding: utf-8 -*-
u"""The pasted contours get a picture.                                           2026-09-19

Søren: *"I think the neuroglancer link paste function needs to have a 3D rendering also, so you can
see the 3D mesh before committing."*

THE PREVIEW ALREADY KNEW ABOUT PASTED CONTOURS. `pad3DRings()` has read them since the day it was
written:

    function pad3DRings(){
      if (PAD && PAD.rings && PAD.rings.length) return UJ.tracepad.toRings(PAD);
      if (TRACING_PENDING && TRACING_PENDING.rings) return TRACING_PENDING.rings;   // <- this
      return [];
    }

What was missing was somewhere to draw. The button, the ghosts tick and the canvas all live inside
`#tracePadWrap`, which is `display:none` until the pad is opened -- so on the paste route the whole
feature existed, worked, and could not be reached. That is a worse bug than a missing one: it looks
like a feature nobody built.

SO THE PREVIEW MOVES TO WHICHEVER CARD THE CONTOURS CAME FROM, by the same rule pad3DRings() already
uses to choose them. `pad3DTarget()` is that rule written once; `pad3DHost()`, `pad3DWanted()`,
`pad3DWantGhosts()` and `pad3DTint()` all ask it. One preview, one WebGL context, one camera -- and
no second copy of a hundred and forty lines to drift out of step with the first, which is what a
"paste3DDraw()" would have become by the end of the week.

IT DRAWS ITSELF, rather than waiting for a button as the pad's does. The reason the pad's is behind
one still holds and is not about the loft: the loft is a millisecond, and the CELL's mesh is
megabytes. So the tracing appears at once and the ghosts are a tick, unchecked here -- on the pad it
is checked, because there the first click already said yes to the wait.

THE COLOUR IS THE ONE THE CARD IS SHOWING. This route has a colour picker of its own, so the surface
is drawn in whatever `#tracingColor` says rather than in the pad's palette. The pad's own preview is
unchanged and still takes the structure's colour from its chip.

TWO HOSTS, ONE CONTEXT. pad3DRelease() now loses the context in BOTH hosts and empties the one that
is not the target, because "too many active WebGL contexts: oldest context will be lost" is a real
message and the oldest context on this page belongs to somebody's cell panel. Leaving a dead canvas
in the other card would also be a picture of the wrong tracing sitting under a card that is about a
different one.

Run: python3 src/the_pasted_contours_get_a_picture.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MARKUP = [
    (u'''<p class="hint" id="tracingVolSay" style="margin-top:4px"></p>''',
     u'''<p class="hint" id="tracingVolSay" style="margin-top:4px"></p>
<!-- THE SHAPE, BEFORE IT IS COMMITTED.  2026-09-19. Søren: "the neuroglancer link paste function
     needs to have a 3D rendering also, so you can see the 3D mesh before committing." The pad has
     had this since 2026-09-17, and pad3DRings() has ALWAYS fallen back to a pasted tracing -- but
     the button, the tick and the canvas all live inside #tracePadWrap, which is display:none
     unless the pad is open, so on this route the feature existed and could not be reached.
     It draws itself rather than waiting for a button: the loft is a millisecond. The ghosts are
     the megabytes, so they are the tick, and it starts off here. -->
<label style="font-size:12px;display:flex;align-items:center;gap:6px;margin-top:8px" title="Fetches the cell&#39;s own mesh for the root ID and the nucleus mesh for the nucleus ID, and draws both see-through around your tracing, so you can see where it sits. Megabytes for a whole neuron, which is why it is a choice."><input type="checkbox" id="tracingPasteGhosts"> with the cell and nucleus, see-through</label>
<div id="tracingPaste3DHost" style="margin-top:6px"></div>''',
     "the paste card has somewhere to draw"),
]

CHOOSER = [
    (u'''function pad3DHost(){ return document.getElementById("tracePad3DHost"); }''',
     u'''/* ── WHICH CARD THE PREVIEW BELONGS TO ─────────────────────────────────────────  2026-09-19
   Søren: *"the neuroglancer link paste function needs to have a 3D rendering also, so you can see
   the 3D mesh before committing."*

   THE SAME RULE pad3DRings() BELOW ALREADY USES TO CHOOSE THE CONTOURS -- written once here so the
   picture and the contours in it can never disagree about whose tracing is being shown. The pad
   wins while it has anything on it (pressing "Use these contours" sets TRACING_PENDING but leaves
   the pad open, and the preview should stay where the person is working); a pasted link with no
   pad behind it draws in the paste card. */
function pad3DTarget(){
  if (PAD && PAD.rings && PAD.rings.length) return "pad";
  if (TRACING_PENDING && TRACING_PENDING.rings && TRACING_PENDING.rings.length) return "paste";
  return "pad";
}
function pad3DHosts(){
  return [document.getElementById("tracePad3DHost"),
          document.getElementById("tracingPaste3DHost")].filter(Boolean);
}
function pad3DHost(){
  return document.getElementById(pad3DTarget() === "paste" ? "tracingPaste3DHost"
                                                           : "tracePad3DHost");
}
/* The pad's preview is behind a button and stays behind it. The paste card's draws as soon as there
   are contours, because by then the person has pasted a link and is deciding whether to commit it,
   which is the whole of what was asked for. */
function pad3DWanted(){
  return pad3DTarget() === "paste" ? !!(TRACING_PENDING && TRACING_PENDING.rings
                                        && TRACING_PENDING.rings.length)
                                   : PAD3D_ON;
}
function pad3DWantGhosts(){
  var t = document.getElementById(pad3DTarget() === "paste" ? "tracingPasteGhosts"
                                                            : "tracePadGhosts");
  return !!(t && t.checked);
}
/* The paste card has a colour picker of its own, and a preview in a different colour from the swatch
   six lines above it is the tool disagreeing with itself. The pad keeps taking the colour from the
   structure's chip. */
function pad3DTint(inst){
  if (pad3DTarget() === "paste"){
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
      .exec(String((document.getElementById("tracingColor") || {}).value || ""));
    if (m) return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
  }
  return padInstTint(inst);
}''',
     "one rule decides which card the preview is in"),

    (u'''function pad3DRelease(){
  const h = pad3DHost(); if (!h) return;
  const cv = h.querySelector("canvas"); if (!cv) return;
  try {
    const gl = cv.getContext("webgl") || cv.getContext("experimental-webgl");
    const e = gl && gl.getExtension("WEBGL_lose_context");
    if (e) e.loseContext();
  } catch (_e){}
}''',
     u'''function pad3DRelease(){
  /* BOTH HOSTS, since 2026-09-19: the preview moves between the pad and the paste card, and a
     canvas left behind in the other one is two things at once -- a live context counting against
     the browser's limit, and a picture of a different tracing sitting under a card that is about
     this one. */
  const here = pad3DHost();
  pad3DHosts().forEach(function(h){
    const cv = h.querySelector("canvas");
    if (cv) try {
      const gl = cv.getContext("webgl") || cv.getContext("experimental-webgl");
      const e = gl && gl.getExtension("WEBGL_lose_context");
      if (e) e.loseContext();
    } catch (_e){}
    if (h !== here) h.innerHTML = "";
  });
}''',
     "...and the one it left keeps no context and no stale picture"),

    (u'''  if (!PAD3D_ON || PAD3D_BUSY) return;''',
     u'''  if (!pad3DWanted() || PAD3D_BUSY) return;''',
     "the draw runs for either card"),

    (u'''    const wantGhosts = !!(document.getElementById("tracePadGhosts") || {}).checked;''',
     u'''    const wantGhosts = pad3DWantGhosts();''',
     "...reading whichever ghosts tick belongs to it"),

    (u'''                                tint: padInstTint(lofts[subject].inst),''',
     u'''                                tint: pad3DTint(lofts[subject].inst),''',
     "...in the colour that card is showing"),

    (u'''  if (!PAD3D_ON) return;''',
     u'''  if (!pad3DWanted()) return;''',
     "...and the coalesced redraw does too"),
]

WIRING = [
    # The redraw goes AFTER the block is shown: a canvas sized inside display:none comes out zero
    # by zero, and mesh3d has no reason to know it was measured too early.
    (u'''  document.getElementById("tracingFound").style.display="";
  tracingEachRender(true);
}''',
     u'''  document.getElementById("tracingFound").style.display="";
  tracingEachRender(true);
  /* AFTER the block is shown, never before: a canvas measured inside display:none comes back zero
     by zero, and the renderer has no reason to know it was asked too early. */
  pad3DSoon();
}''',
     "reading a link draws the shape"),

    (u'''  TRACING_PENDING=null;
  const r=UJ.tracing.ringsFromLink(link,layer||null);''',
     u'''  TRACING_PENDING=null;
  /* The old picture goes with the old contours. Every failure below returns early, and a preview
     of the last link that worked sitting under an error about this one is the worst of both. */
  pad3DRelease();
  const r=UJ.tracing.ringsFromLink(link,layer||null);''',
     "...and a failed read leaves no picture of the previous one"),

    (u'''  document.getElementById("tracingRead").addEventListener("click",function(){
    try{tracingReadLink();}catch(e){tracingSay(String(e&&e.message||e),true);}
  });''',
     u'''  document.getElementById("tracingRead").addEventListener("click",function(){
    try{tracingReadLink();}catch(e){tracingSay(String(e&&e.message||e),true);}
  });
  /* WHAT CHANGES THE PICTURE, REDRAWS IT.  2026-09-19. The ghosts tick is the one that costs
     something -- it fetches the cell's mesh -- so it is the one that has to be a tick rather than a
     default. The two id boxes feed those same fetches (pad3DIds), and the colour is the surface's
     own colour, so all four belong here. pad3DSoon() coalesces, which matters for the id boxes:
     they are typed into a digit at a time. */
  ["tracingPasteGhosts","tracingNucId","tracingRootId","tracingColor"].forEach(function(id){
    const el=document.getElementById(id);
    if(el)el.addEventListener("change",function(){pad3DSoon();});
  });''',
     "the ghosts tick, the ids and the colour redraw it"),

    (u'''  TRACING_PENDING=null;
  document.getElementById("tracingFound").style.display="none";
  document.getElementById("tracingLink").value="";''',
     u'''  TRACING_PENDING=null;
  /* Committed: the contours are in the dataset now and the card is about nothing. A preview left
     behind would be of a tracing that is no longer pending -- and the block it lives in is being
     hidden anyway, so its context would sit there lost to nobody. */
  pad3DRelease();
  document.getElementById("tracingFound").style.display="none";
  document.getElementById("tracingLink").value="";''',
     "and committing takes the picture down with the card"),
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


edit("ujump.html", MARKUP + CHOOSER + WIRING)
print("\nnow: node tracingpreviewcheck.js && node tracingpanelcheck.js "
      "&& python3 src/build_stamps.py")
