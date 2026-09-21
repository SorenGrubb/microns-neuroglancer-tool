# -*- coding: utf-8 -*-
u"""The tracing pad gets four buttons that move the picture half a screen.          2026-09-21

Søren: *"For all of the tracing panels, we need to have some buttons to move the image up, down,
left or right. It should move half a screen every time the button is clicked. Then you can also
navigate around using a phone or tablet."*

The pad moved only by shift+click and a drag -- both need a keyboard or a mouse, and on a tablet a
drag with the pen draws. Four buttons in the corner of the canvas, over the picture rather than in
the toolbar above it, because on a phone the toolbar wraps off-screen while the picture is what you
are looking at. Half a screen, so the part you were looking at is still on it after the move.

Moves are measured off the view the pad actually drew (PAD_VIEW.toolAt at two corners), so the
step is half of what is on the screen at every zoom and on every dataset's voxel size.

A press while a section is still loading is not lost: the centre moves at once, and padDraw
draws again when it finishes, from where the centre is by then. Several quick presses add up.

core/tracingcard.js is the one file: µJump, δJump, λJump, βJump and ηJump all build the pad from it.

Run: python3 src/the_pad_moves_by_buttons.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def edit(rel, pairs):
    p = os.path.join(HERE, rel); s = io.open(p, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s / %s: %d" % (rel, name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(p, "w", encoding="utf-8").write(s)

BTN = (u'padding:0;width:38px;height:38px;font-size:16px;line-height:1;border-radius:7px;'
       u'background:rgba(0,0,0,.55);color:#fff;border:1px solid rgba(255,255,255,.4);cursor:pointer')

def b(pan, glyph, what):
    return (u'"<button type=\\"button\\" class=\\"padpan\\" data-pan=\\"%s\\" style=\\"%s\\" '
            u'title=\\"Move the picture half a screen %s\\" aria-label=\\"Move %s\\">%s</button>",'
            % (pan, BTN, what, what, glyph))

MARKUP = u'\n'.join([
    u'"<!-- FOUR BUTTONS THAT MOVE THE PICTURE.  2026-09-21. Søren: \\"we need to have some buttons to move the",',
    u'"     image up, down, left or right. It should move half a screen every time... Then you can also",',
    u'"     navigate around using a phone or tablet.\\" Over the picture, in its corner, because on a phone",',
    u'"     the toolbar above wraps out of sight. -->",',
    u'"<div id=\\"tracePadPan\\" style=\\"position:absolute;right:8px;bottom:8px;display:grid;'
    u'grid-template-columns:repeat(3,38px);grid-template-rows:repeat(3,38px);gap:3px;opacity:.9\\">",',
    u'"<span></span>",', b(u"0,-0.5", u"&#9650;", u"up"), u'"<span></span>",',
    b(u"-0.5,0", u"&#9664;", u"left"), u'"<span></span>",', b(u"0.5,0", u"&#9654;", u"right"),
    u'"<span></span>",', b(u"0,0.5", u"&#9660;", u"down"), u'"<span></span>",',
    u'"</div>",'])

PAIRS = [
 (u"the contract names the new id",
  u'''     #tracePadMip #tracePadPrev #tracePadNext #tracePadStep #tracePadUndo #tracePadPen''',
  u'''     #tracePadMip #tracePadPrev #tracePadNext #tracePadStep #tracePadUndo #tracePadPen #tracePadPan'''),
 (u"the buttons, in the canvas' corner",
  u'''    "<canvas id=\\"tracePad\\" width=\\"560\\" height=\\"460\\" style=\\"display:block;cursor:crosshair;touch-action:none\\"></canvas>",
    "</div>",''',
  u'''    "<canvas id=\\"tracePad\\" width=\\"560\\" height=\\"460\\" style=\\"display:block;cursor:crosshair;touch-action:none\\"></canvas>",
''' + u'\n'.join(u'    ' + l for l in MARKUP.split(u'\n')) + u'''
    "</div>",'''),
 (u"a press while loading is kept",
  u'''var PAD = null, PAD_VIEW = null, PAD_BUSY = false, PAD_HOVER = null, PAD_CENTRE = null;''',
  u'''var PAD = null, PAD_VIEW = null, PAD_BUSY = false, PAD_HOVER = null, PAD_CENTRE = null;
/* A move asked for while a section is loading: padDraw draws again when it is done. */
var PAD_REDRAW = false;'''),
 (u"...and drawn when the load finishes",
  u'''  if (PAD_BUSY) return;
  PAD_BUSY = true;''',
  u'''  if (PAD_BUSY){ PAD_REDRAW = true; return; }
  PAD_BUSY = true;
  PAD_REDRAW = false;'''),
 (u"...from where the centre is by then",
  u'''  PAD_BUSY = false;
  padZLabel();
}''',
  u'''  PAD_BUSY = false;
  padZLabel();
  if (PAD_REDRAW){ PAD_REDRAW = false; padDraw(); }
}

/* ── HALF A SCREEN AT A TIME ─────────────────────────────────────────────────  2026-09-21
   fx, fy are fractions of what is on the pad: -0.5 is half a screen left (or up). Measured off
   the view actually drawn, so it is half the screen at every zoom and every voxel size. */
function padPan(fx, fy){
  if (!PAD_VIEW || !PAD_CENTRE) return;
  const a = PAD_VIEW.toolAt(0, 0), b = PAD_VIEW.toolAt(PAD_VIEW.w, PAD_VIEW.h);
  const dx = Math.round((b[0] - a[0]) * fx), dy = Math.round((b[1] - a[1]) * fy);
  PAD_CENTRE = [PAD_CENTRE[0] + dx, PAD_CENTRE[1] + dy, PAD.z];
  PAD_SAY_NEXT = "Moved to " + PAD_CENTRE[0] + ", " + PAD_CENTRE[1] + ".";
  padDraw();
}'''),
 (u"wired",
  u'''  document.getElementById("tracePadPrev").addEventListener("click", function(){ padStep(-1); });''',
  u'''  document.getElementById("tracePadPrev").addEventListener("click", function(){ padStep(-1); });
  [].slice.call(document.querySelectorAll("#tracePadPan .padpan")).forEach(function(bt){
    bt.addEventListener("click", function(e){
      e.preventDefault(); e.stopPropagation();
      const f = String(bt.dataset.pan).split(",");
      padPan(+f[0], +f[1]);
    });
  });'''),
 (u"...and says where it ended up, not where it was on the way",
  u'''      + (PAD_SAY_NEXT ? " " + PAD_SAY_NEXT : ""));
    PAD_SAY_NEXT = "";''',
  u'''      + (PAD_SAY_NEXT ? " " + PAD_SAY_NEXT : ""));
    /* Kept while another draw is queued behind this one: the note is about where the pad is going. */
    if (!PAD_REDRAW) PAD_SAY_NEXT = "";'''),
]
print("core/tracingcard.js"); edit("core/tracingcard.js", PAIRS)
