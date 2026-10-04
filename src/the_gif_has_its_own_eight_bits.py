# -*- coding: utf-8 -*-
u"""The turn is dithered at the GIF's grid, not at the screen's.                         2026-10-04

Søren, asked where the rings are: *the exported PNG and the rotating GIF, not the panel on screen.*

MEASURED, in the files themselves rather than in the canvas. The widest run of one identical pixel
along a row across the background:

    panel on screen      1 px (dark)    2 px (light)
    exported PNG         1 px           2 px
    exported GIF       234 px         351 px

The PNG is clean. The GIF is four flat slabs across a 1240-pixel row, which is far worse than the
68-pixel banding that started all of this — and it is mine, not his screen's.

A GIF HAS 256 COLOURS, AND GIFENC CHOOSES THEM IN 5-6-5. Both `quantize` and `applyPalette` key
every pixel by `rgb888_to_rgb565`, so the smallest difference either function can see is one
thirty-second of the range: 8 of 255 on red and blue, 4 on green. The field spans eighteen levels in
the light theme and nine in the dark. The whole gradient is therefore two or three distinguishable
values before a palette is even chosen, and the half-level of noise that fixed the screen is
invisible at that grid — it was sized for the eight bits of a framebuffer, and this is a coarser
machine entirely.

SO THE NOISE IS SIZED FOR THE GRID IT HAS TO BEAT: twelve levels, half as much again as a 5-bit
step, added to the frame before the palette sees it. A pixel in the middle of a slab now lands
either side of the bin boundary in proportion to where it really sits, which is what dithering is.
The ramp is still only three values wide — nothing can change that inside a GIF — but it is three
values mixed rather than three slabs:

    noise      8      10      12      16
    dark     6 px   4 px    4 px    1 px
    light   44 px   8 px    6 px    4 px

EIGHT WAS NOT ENOUGH, AND THE REASON IS THE CEILING. The light field's middle IS the page's white:
253.7 of 255, with the 5-bit bin running from 248. Four levels down from there is 249.7, still the
same bin, and four levels up clamps — so in the brightest part of the picture no pixel could reach
the neighbouring bin at all and the plateau stayed solid. Twelve clears it. Sixteen is better again
and is not worth the texture.

AND IT HAS TO BE THIS NOISE. The same thing with a white-noise hash in place of ign, at the same
amplitude, measured 40 px dark and 254 px light — barely better than no dither. Uniform random
values clump, and a clump landing on one side of a bin boundary IS a flat patch; ign is a
low-discrepancy pattern, which means it is specifically designed not to do that. It was chosen for
the shader because it survives mediump, and it is kept here for a different reason entirely.

THE SAME PATTERN EVERY FRAME, which is the part that matters for a turn. Noise redrawn per frame is
noise that CRAWLS, and 24 frames a second of crawling grain is more distracting than the banding.
`ign(x, y)` depends on position only, so the grain is a fixed texture the model turns underneath.

EQUALLY ON ALL THREE CHANNELS, so a grey stays grey. Scaling each channel by its own bin size would
tint the background by a couple of levels in a direction that changes with the noise.

AND ON THE SAMPLE TOO, not only the encoded frames. The palette is chosen from three sample frames;
if those are undithered the quantiser never sees the in-between bins and never allocates an entry to
them, and the dither on the real frames would have nothing to dither between.

NOT ON THE PNG. The PNG is a true 8-bit file and measures clean; eight levels of grain there would
be a visible texture added to fix a problem it does not have.

Check: shotcheck.js — decodes the GIF it just made and walks a row, the same measurement as above.
Run: python3 src/the_gif_has_its_own_eight_bits.py
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


edit("core/mesh3dshot.js", [

 (u"the grain the palette can see",
  u'''  /* One frame, right way up, with the same furniture on it, as the flat RGBA the encoder wants. */
  function frameRGBA(f, deco){''',
  u'''  /* ── TWELVE LEVELS OF GRAIN, FOR A MACHINE THAT COUNTS IN THIRTY-TWOS ──────────────────────
     Søren, asked where the rings are: the exported PNG and the rotating GIF, not the panel. The
     PNG measures clean — 2px of one value across 1240. The GIF measured 351. This is why.

     gifenc keys every pixel by rgb888_to_rgb565, in `quantize` when it chooses the palette and in
     `applyPalette` when it looks one up. The smallest difference either can see is 8 of 255 on red
     and blue and 4 on green. The field spans eighteen levels in the light theme: two bins. The
     half-level of noise in the shader was sized for a framebuffer's eight bits and is invisible at
     this grid, so the gradient arrived as flat slabs with hard joins.

     TWELVE LEVELS, then — half as much again as a 5-bit step. Eight is not enough, because the
     light field's middle is the page's own white at 253.7 and its bin starts at 248: four down is
     still the same bin and four up clamps, so the brightest plateau could not break up at all. The
     flat run across a 1240px row goes 44px at eight, 8px at ten, 6px at twelve.

     Equally on all three channels, so a grey stays a grey; and from ign(x, y), which depends on
     position alone, so the grain is a fixed texture the model turns underneath rather than
     something that crawls from frame to frame. A white-noise hash in its place measured 254px:
     uniform random values clump, and a clump on one side of a boundary is a flat patch. ign is
     low-discrepancy, which is precisely the property that stops that.

     The same function as the shader's, in JavaScript. A GIF cannot hold more than three values
     across this ramp whatever is done to it; what it can hold is three values mixed. 2026-10-04. */
  function grain(d, w){
    var i, x, y, t;
    for (i = 0; i < d.length; i += 4){
      x = (i >> 2) % w; y = (i >> 2) / w | 0;
      t = (x * 0.06711056 + y * 0.00583715) % 1;
      t = (52.9829189 * t) % 1 - 0.5;
      d[i] += t * 12; d[i + 1] += t * 12; d[i + 2] += t * 12;
    }
    return d;
  }

  /* One frame, right way up, with the same furniture on it, as the flat RGBA the encoder wants. */
  function frameRGBA(f, deco){'''),

 (u"...on every frame the encoder sees",
  u'''    if (deco.mark !== false) drawMark(p.ctx, f.w, f.h);
    return p.ctx.getImageData(0, 0, f.w, f.h).data;''',
  u'''    if (deco.mark !== false) drawMark(p.ctx, f.w, f.h);
    return grain(p.ctx.getImageData(0, 0, f.w, f.h).data, f.w);'''),
])
print("\nNow: python3 src/build_stamps.py, then node shotcheck.js")
