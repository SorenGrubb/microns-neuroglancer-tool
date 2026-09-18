# -*- coding: utf-8 -*-
"""The line only speaks when it has news.                                       2026-09-18

Søren: *"if we remove the 'within Img65's imaged extent' ... we can make it more compact."* — and,
a moment later, on the other half of that idea: *"Nevermind writing on the model, it says what the
colors represent just above."*

So the legend stays exactly where it is. This removes one line, and only in the case where it says
nothing: "within Img65's imaged extent" is true of very nearly every cell in a minnie65 roster, and
being told so is being told nothing. A line that is always there is furniture; a line that appears
only when it has something to report gets read.

The other two things it can say are not furniture, and they stay:

    in Img35, outside Img65   there is no MICrONS segmentation for this point, which is the whole
                             reason its panel looks different from every other panel
    outside both             there is no imagery here at all

Eighteen pixels on the taller of the panel's two columns, which is where the panel's spare height
has to come from.

Run: python3 src/the_line_only_speaks_when_it_has_news.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAIRS = [
    ("""  const where=inside65?"within Img65’s imaged extent":inside35?"within Img35’s imaged extent, outside Img65":"outside both datasets’ imaged extent";
  return '<div class="hint" style="margin-bottom:3px">Top view (X &rarr;, Z &darr;) &mdash; '+legend+'</div>'+svg+'<p class="hint" style="margin-top:4px">'+where+'</p>';""",
     """  /* THE NOTE ONLY APPEARS WHEN IT HAS SOMETHING TO SAY, 2026-09-18. "within Img65's imaged
     extent" was true of very nearly every cell in a minnie65 roster, so it was a line of the panel
     spent on telling somebody nothing. The other two cases are not: outside Img65 there is no
     MICrONS segmentation for the point, which is why that panel looks unlike every other one, and
     outside both there is no imagery at all. The legend above is untouched -- it names the two
     colours, which the picture cannot do for itself. */
  const where=inside65?"":inside35?"in Img35, outside Img65 — no MICrONS segmentation here"
                                  :"outside both datasets’ imaged extent";
  return '<div class="hint" style="margin-bottom:3px">Top view (X &rarr;, Z &darr;) &mdash; '+legend+'</div>'+svg
    +(where?'<p class="hint" style="margin-top:4px">'+where+'</p>':'');""",
     "the ordinary case stops saying so"),
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


edit("ujump.html", PAIRS)
print("\nnow: node emplanecheck.js && python3 src/build_stamps.py")
