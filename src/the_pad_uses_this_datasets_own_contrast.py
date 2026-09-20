# -*- coding: utf-8 -*-
u"""The pad stretches this dataset's EM, not minnie65's.                         2026-09-20

Søren, with two screenshots side by side: *"The contrast of the lJump tracing window is totally
off. The neuroglancer window should be changed to something like this, and also the tracing
window."* The pad's picture is very nearly black and white — membranes crushed to black, cytoplasm
and nucleoplasm blown to paper white, no midtones at all. Beside it, the same cell in Spelunker:
ordinary EM greyscale.

── WHAT IT ACTUALLY WAS ────────────────────────────────────────────────────────

The pad's one call to `UJ.emtiles.drawSection()` passed **no lo and no hi**. So every dataset got
the module's default, which is `lo: 86, hi: 172` — minnie65's numbers, sitting in a shared file as
though they were every volume's, which is the same fault this repo has now found three times.

On Lee16 that is not a small error. Measured on 1,048,576 real pixels — four chunks at the pad's
own default level, read live from the bucket on 2026-09-20:

    window        clipped to black   clipped to white
    86–172  (the pad's)     11.5 %             48.2 %      <- 59.7% of the picture is flat
    44–238  (measured)       2.1 %              1.7 %
    27–240  (Søren's)        0.9 %              1.2 %

**Three pixels in five were either pure black or pure white**, from an eight-bit volume, with
nothing anywhere saying so. That is the binary screenshot, and it is arithmetic rather than
opinion: this tissue's median is 168–189 depending where you sample, and the old window's top is
172.

**µJump never showed it, and could not have.** Its own EM_WINDOW is 86/172, exactly the module's
default, so its pad has always been right by coincidence rather than by being told. λJump is the
first page whose window differs — and δJump, whose window is 115/144, would have been wrong in the
same way the day it got the card.

`EM_WINDOW` already existed on all three pages, and the cell card's EM plane already used it. Only
the pad did not.

── AND THE VIEWER LINKS λJUMP BUILDS CARRIED NO WINDOW EITHER ──────────────────

µJump and δJump both put `shaderControls: EM_SHADER_CONTROLS` on their image layer, so a link they
build opens already stretched. λJump's image layer had neither that nor `tab: "rendering"`, so
Neuroglancer opened Lee16 on its own 0–255 default — flat, and with the control Søren would need to
fix it not even on screen.

**27 → 240 are Søren's numbers**, read off the Rendering panel in his screenshot. The same
million-pixel sample puts this volume's 1% at 30 and its 99% at 240 — so what he set by eye and
what the histogram says are the same window to within three levels. His ship, and they are also
the ones that clip least.

λJump now has the shape the other two already had — ONE window per dataset, written once as
EM_SHADER_CONTROLS, with EM_WINDOW derived from it, so the section drawn in the page and the
section drawn in the viewer cannot drift apart.

Run: python3 src/the_pad_uses_this_datasets_own_contrast.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs, marker=None):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    if marker and marker in s:
        for name, _o, _n in pairs:
            print("  already there: " + name)
        return
    before = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name)
            continue
        n = s.count(old)
        assert n == 1, "%s / %s: anchor found %d times" % (rel, name, n)
        s = s.replace(old, new, 1)
        print("  ok: " + name)
    if s != before:
        io.open(p, "w", encoding="utf-8").write(s)


# ── 1. the card learns what this page's window is ─────────────────────────────────────────────
WIN_OLD = u'''function tracingCfg(){'''

WIN_NEW = u'''/* ── THIS DATASET'S CONTRAST, NOT minnie65's ──────────────  2026-09-20
   core/emtiles.js stretches [lo,hi] to black-white and defaults to 86/172. Those are minnie65's
   numbers. The pad called drawSection with no window at all, so every dataset got them — and on
   Lee16, whose median is 189, more than half of every section clipped to pure white and the
   membranes clipped to pure black. Søren: *"The contrast of the lJump tracing window is totally
   off."* It was, and by a lot.

   µJump could never have shown it: its own EM_WINDOW is 86/172, so its pad was right by
   coincidence. δJump's is 115/144 and would have been wrong the day it got the card.

   READ FROM THE PAGE, THREE WAYS, IN ORDER. UJ.cfg.tracing.window if a host wants the pad
   stretched differently from the rest of its page; otherwise the page's own EM_WINDOW, which all
   three pages already define in one place and already use for the cell card's EM plane; otherwise
   emtiles' default, so a page with neither is exactly as it was.

   EM_WINDOW IS READ IN A try, NOT BEHIND typeof. It is a top-level `const`, and on µJump this
   file is parsed 2,000 lines before that line runs — `typeof` does not protect against a temporal
   dead zone, it throws like any other read. Called at draw time, so in practice it is long
   initialised; the try is for the page that loads the card and never defines one. */
function tracingWindow(){
  var w = null;
  try { w = (UJ && UJ.cfg && UJ.cfg.tracing) ? UJ.cfg.tracing.window : null; } catch (_e){ w = null; }
  if (typeof w === "function"){ try { w = w(); } catch (_e){ w = null; } }
  if (!w){ try { w = EM_WINDOW; } catch (_e){ w = null; } }
  if (!w || w.lo == null || w.hi == null) return { lo: 86, hi: 172 };
  return { lo: w.lo, hi: w.hi };
}
function tracingCfg(){'''

print("core/tracingcard.js")
edit("core/tracingcard.js", [
    (u"tracingWindow reads the page's own stretch", WIN_OLD, WIN_NEW),
], marker=u"THIS DATASET'S CONTRAST, NOT minnie65's")


DRAW_OLD = u'''    PAD_VIEW = await UJ.emtiles.drawSection(cv, {
      centre: PAD_CENTRE, mip: mip, zoom: zoom, w: wide, h: cv.height,
      onProgress: function(d, n){ if (d < n) padSay("Loading the section\\u2026 " + d + "/" + n); }
    });'''

DRAW_NEW = u'''    /* THE WINDOW GOES IN. Without it emtiles uses 86/172 — minnie65's — on every volume; see
       tracingWindow's header for what that did to Lee16. */
    var PAD_WIN = tracingWindow();
    PAD_VIEW = await UJ.emtiles.drawSection(cv, {
      centre: PAD_CENTRE, mip: mip, zoom: zoom, w: wide, h: cv.height,
      lo: PAD_WIN.lo, hi: PAD_WIN.hi,
      onProgress: function(d, n){ if (d < n) padSay("Loading the section\\u2026 " + d + "/" + n); }
    });'''

edit("core/tracingcard.js", [
    (u"the pad draws with it", DRAW_OLD, DRAW_NEW),
])


# ── 2. λJump gets one window, and its viewer links get it too ─────────────────────────────────
LJ_OLD = u'''   A 2-98% stretch is 44 → 238. Same constant name µJump uses, so the pad code reads identically
   on both pages and the difference between the two datasets stays in this one place. */
const EM_WINDOW = { lo: 44, hi: 238 };'''

LJ_NEW = u'''   A 2-98% stretch is 44 → 238.

   ── AND THEN SØREN LOOKED AT IT ─────────────────────────  2026-09-20
   *"The contrast of the lJump tracing window is totally off. The neuroglancer window should be
   changed to something like this, and also the tracing window."* — with the Rendering panel beside
   it reading **27 → 240**.

   Re-measured on 1,048,576 pixels, four chunks at the pad's own level: 1% is 30 and 99% is 240, so
   what he set by eye and what the histogram says are the same window to within three levels. What
   each choice throws away, on that sample:

       86-172 (what the pad was using)   11.5% black   48.2% white
       44-238 (the 2-98% below)           2.1% black    1.7% white
       27-240 (his)                       0.9% black    1.2% white

   A 2-98% stretch still throws away the tail where Lee16's membranes live, and on a picture you
   are about to put vertices on, a membrane you cannot see is the one thing that matters.

   ── ONE WINDOW, WRITTEN ONCE ────────────────────────────
   Written as EM_SHADER_CONTROLS with EM_WINDOW derived from it, which is the shape µJump and
   δJump already have. The viewer links this page builds and the sections it draws in the page are
   then stretched by the same two numbers, and one edit moves both. */
const EM_SHADER_CONTROLS = { normalized: { range: [27, 240] } };
const EM_WINDOW = { lo: EM_SHADER_CONTROLS.normalized.range[0],
                    hi: EM_SHADER_CONTROLS.normalized.range[1] };'''

print("\nljump.html")
edit("ljump.html", [
    (u"λJump's window is Søren's 27–240, in one place", LJ_OLD, LJ_NEW),
], marker=u"AND THEN SØREN LOOKED AT IT")


LAYER_OLD = u'''    layers:[{type:"image",source:V.em,tab:"source",name:"lee16"}],'''

LAYER_NEW = u'''    /* shaderControls, 2026-09-20. Without it Neuroglancer opens Lee16 on its own 0-255 default,
       which is flat — and with tab:"source" the control that would fix it is not even the panel
       on screen. µJump and δJump have both carried this on their image layer all along. */
    layers:[{type:"image",source:V.em,tab:"rendering",name:"lee16",
             shaderControls:EM_SHADER_CONTROLS}],'''

edit("ljump.html", [
    (u"...and the viewer links carry it", LAYER_OLD, LAYER_NEW),
])

print(u"\nnow: node emljumpcheck.js && node emdjumpcheck.js && node tracingcardhtmlcheck.js")
