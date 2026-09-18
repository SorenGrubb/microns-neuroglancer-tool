# -*- coding: utf-8 -*-
"""One window for every EM.                                                     2026-09-18

Søren: *"The EM section and the trace a cell EM should have a similar contrast as for the
Neuroglancer session."*

WHAT WAS ALREADY TRUE, AND WHY THAT IS NOT REASSURING. The page sends Neuroglancer
`EM_SHADER_CONTROLS = {normalized:{range:[86,172]}}`, and core/emtiles.js defaults its own stretch to
`lo = 86, hi = 172`. The same two numbers, arrived at independently, written down in two files that
do not know about each other. They agree today by coincidence, and the first time anybody retunes
the Neuroglancer window the pad and the panel will quietly keep the old one -- which is exactly the
complaint he is making now, one edit early.

So this makes the page's constant the source and hands it to both drawSection calls. No pixel
changes today; the point is that none can change on one side alone tomorrow.

WHAT THIS DOES NOT FIX, SAID PLAINLY. If the pad still does not look like his Neuroglancer session
after this, the cause is not the window, and there are three candidates worth naming rather than
guessing between:

  - LAYER OPACITY. Neuroglancer multiplies emitGrayscale's alpha by the image layer's opacity, and
    the states this tool writes never set one. If its default is 0.5, his Neuroglancer EM is at half
    strength over black and the pad is the brighter of the two. Setting opacity explicitly is a
    one-line change and a no-op if the default is already 1.
  - THE LEVEL BEING READ. A fixed window applied to downsampled data looks flatter, because
    averaging pulls the histogram toward its middle. The panel now reads 64 nm; Neuroglancer at a
    soma-sized zoom is showing something finer. Same window, genuinely less contrast.
  - NEITHER, in which case the honest fix is a window control on the pad rather than a better guess
    here.

Which one it is, is a thing only somebody looking at both can say, so this generator does the part
that is right regardless and the question goes to him.

Run: python3 src/one_window_for_every_em.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# SENTINELS, FOR THE REASON THE OTHER GENERATOR HAS THEM -- and this one learned it the hard way.
# Its first edit used to be an ordinary pair whose REPLACEMENT contained its own anchor (the
# EM_SHADER_CONTROLS line, kept and appended to). That is idempotent only while the replacement text
# never changes: the moment EM_SEG_ALPHA was added to it, `new in s` was false and `old in s` was
# true, so it appended a SECOND copy of the block and the page died on "Identifier 'EM_WINDOW' has
# already been declared" -- every later script in the file gone with it. A generator that owns a
# region has to identify the region, not one line inside it.
START = "/* @emwindow:start */"
END = "/* @emwindow:end */"
ANCHOR = "const EM_SHADER_CONTROLS={normalized:{range:[86,172]}};"
BODY = r"""/* ── AND THE SAME WINDOW IN THE PAGE'S OWN CANVASES ─────────────────────────────  2026-09-18
   Søren: "The EM section and the trace a cell EM should have a similar contrast as for the
   Neuroglancer session." core/emtiles.js stretches [lo,hi] to black-white with the identical
   arithmetic Neuroglancer's normalized() control uses, and defaulted to the same 86/172 -- the same
   two numbers written down twice, in two files with no knowledge of each other. That is agreement
   by coincidence, and it lasts exactly until somebody retunes one of them. Read from the constant
   above instead, so the tracing pad, the cell panel and every Neuroglancer link this file writes
   cannot drift apart without being edited together. */
const EM_WINDOW={lo:EM_SHADER_CONTROLS.normalized.range[0],hi:EM_SHADER_CONTROLS.normalized.range[1]};
/* ── AND ONE OPACITY FOR THE OVERLAY ───────────────────────────────────────────  2026-09-18
   Søren: "The segmentation overlay to the EM is a bit too bright, can we turn it down by like
   20%." 0.4 was the value both the pad and the cell panel were passing, written out twice, which is
   the same coincidence EM_WINDOW above was introduced to stop. 0.4 x 0.8 = 0.32, and it lives here
   so the two canvases cannot answer this differently. The overlay exists to say WHERE the
   segmentation thinks the cell is; at 0.4 it was also deciding what the membranes underneath look
   like, which is the tick beside it's job to turn off, not the paint's job to prevent. */
const EM_SEG_ALPHA=0.32;"""
BLOCK = START + "\n" + BODY + "\n" + END


def resplice(s):
    """Insert the block after the anchor, or replace it in place if it is already there."""
    i = s.find(START)
    if i >= 0:
        j = s.find(END, i)
        assert j > 0, "start sentinel with no end -- refusing to guess where the block ends"
        cur = s[i:j + len(END)]
        if cur == BLOCK:
            print("  already there: the window and overlay-opacity block")
            return s, False
        print("  ok: the window and overlay-opacity block was refreshed")
        return s[:i] + BLOCK + s[j + len(END):], True
    assert s.count(ANCHOR) == 1, "anchor not unique (%d)" % s.count(ANCHOR)
    print("  ok: the page gains one EM window and one overlay opacity")
    return s.replace(ANCHOR, ANCHOR + "\n" + BLOCK, 1), True


PAIRS = [

    # THE CELL PANEL'S OWN CALL IS NOT EDITED HERE. It lives inside the region
    # src/a_section_beside_the_model.py splices between sentinels, so an edit made here would be
    # silently reverted the next time that generator ran -- which is the failure mode sentinels
    # were introduced to prevent, arriving from the other direction. The lo/hi is in
    # src/_emplane_block.js, next to the rest of that panel's draw call.

    ('''    PAD_VIEW = await UJ.emtiles.drawSection(cv, {
      centre: PAD_CENTRE, mip: mip, zoom: zoom, w: wide, h: cv.height,''',
     '''    PAD_VIEW = await UJ.emtiles.drawSection(cv, {
      centre: PAD_CENTRE, mip: mip, zoom: zoom, w: wide, h: cv.height,
      lo: EM_WINDOW.lo, hi: EM_WINDOW.hi, tighten: true,''',
     "...and so does the tracing pad, and both tighten onto the plane they drew"),

    ("""    const got = await UJ.segpaint.paint(cv, PAD_VIEW, { root: root, nuc: nuc, alpha: 0.4,""",
     """    const got = await UJ.segpaint.paint(cv, PAD_VIEW, { root: root, nuc: nuc, alpha: EM_SEG_ALPHA,""",
     "...and the pad's overlay is the one opacity too"),
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


page = os.path.join(HERE, "ujump.html")
text = io.open(page, encoding="utf-8").read()
print("ujump.html")
text, did = resplice(text)
if did:
    io.open(page, "w", encoding="utf-8").write(text)

edit("ujump.html", PAIRS)
print("\nnow: node emplanecheck.js && node tracingpanelcheck.js && python3 src/build_stamps.py")
