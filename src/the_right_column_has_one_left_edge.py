# -*- coding: utf-8 -*-
u"""δJump's top view lines up with the EM section under it.                      2026-09-20

Søren: *"and... can we vertically align the top view with the EM preview?"*

Measured on the card in a 1280 px window, both in the same right-hand column:

    column        647 → 984   (337 wide)
    top view      686 → 946   (260 wide)   <- centred, 39 px of gutter each side
    "EM section"  647 → 984                <- the label, full width
    the canvas    647 → 907   (260 wide)   <- flush left

**Both pictures are exactly 260 px wide.** They look unaligned because the SVG carries
`margin:6px auto` and the canvas carries `margin:4px 0 0`, so one is centred in the column and the
other is not — 39 px apart, under a label that starts at the column's left edge.

Flush left, both, so the column has ONE left edge: picture, label, picture. Centring was never a
decision about this layout; it is what an SVG that might be alone in a card wants, and these two
have not been alone in a card since the section moved up beside the top view this afternoon.

THE LAYER DIAGRAM TOO, in the other column, for the same reason and to keep the two columns
symmetrical — it was centred in its own 337 px column with the same 39 px indent, which read as
dead space on the left of the card.

δJump only. πJump's top view keeps its centring: it has no EM section under it, so there is
nothing there to line up with.

Run: python3 src/the_right_column_has_one_left_edge.py
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


# The two diagrams differ in the rest of their style strings, so each is anchored on enough of its
# own to be unique -- `margin:6px auto` alone appears in both.
TOP_OLD = u'''  let svg='<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="max-width:260px;display:block;margin:6px auto;background:var(--bg);border:1px solid var(--line);border-radius:6px" xmlns="http://www.w3.org/2000/svg">';
  svg+='<text x="'+pad+'" y="11" font-size="9.5" font-family="monospace" style="fill:var(--mut)">Top view (X &rarr;, Z &darr;)</text>';'''

TOP_NEW = u'''  /* FLUSH LEFT, NOT CENTRED.  2026-09-20. Søren: "can we vertically align the top view with the
     EM preview?" They are both 260 px wide and they sat 39 px apart, because this had
     `margin:6px auto` and the EM canvas below it has `margin:4px 0 0`. Centring is what an SVG
     alone in a card wants; this one has not been alone since the section moved up beside it. */
  let svg='<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="max-width:260px;display:block;margin:6px 0;background:var(--bg);border:1px solid var(--line);border-radius:6px" xmlns="http://www.w3.org/2000/svg">';
  svg+='<text x="'+pad+'" y="11" font-size="9.5" font-family="monospace" style="fill:var(--mut)">Top view (X &rarr;, Z &darr;)</text>';'''

print("djump.html")
edit("djump.html", [
    (u"the top view is flush left, like the section under it", TOP_OLD, TOP_NEW),
], marker=u"FLUSH LEFT, NOT CENTRED")

# The layer diagram, in the other column. Its <svg> is built by renderLayerDiagram; find the one
# that is not the top view's by the piece of style only it carries.
s = io.open(os.path.join(HERE, "djump.html"), encoding="utf-8").read()
hits = [ln for ln in s.split("\n") if "margin:6px auto" in ln]
print("\n  lines still centring a diagram: %d" % len(hits))
for ln in hits:
    print("   " + ln.strip()[:120])


# The layer diagram, in the other column: same 39 px indent, same fix, so the two columns stay
# symmetrical. Anchored on the <text> that only it emits.
LAYER_OLD = u'''  let svg='<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="max-width:260px;display:block;margin:6px auto;background:var(--bg)" xmlns="http://www.w3.org/2000/svg">';'''
LAYER_NEW = u'''  /* Flush left, for the reason the top view beside it is — it was centred in its own 337 px
     column with a 39 px indent, which read as dead space down the left of the card. */
  let svg='<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="max-width:260px;display:block;margin:6px 0;background:var(--bg)" xmlns="http://www.w3.org/2000/svg">';'''

edit("djump.html", [
    (u"...and so is the layer diagram in the other column", LAYER_OLD, LAYER_NEW),
])
