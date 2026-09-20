# -*- coding: utf-8 -*-
u"""δJump stops telling its readers about volumes it does not contain.           2026-09-20

Found while fixing the top view, which had been printing *"within Img65's imaged extent"* under a
V1DD cell. That was not the only one. δJump was built from µJump, and it inherited minnie65's
TWO-VOLUME WORLD — an Img65 and an Img35 with separate segmentations, separate IDs and a border
between them — where V1DD has one volume and no border at all.

The same fault as the four MICrONS-crediting sentences in `src/whose_prediction_is_it_anyway.py`:
shared wording asserting something true of one dataset on a page about another. And the same rule
applies — **comments stay, because they record where the code came from; what a READER sees has to
be true of the dataset in front of them.**

── THE SIX SENTENCES AND THE ONE DIAGRAM ───────────────────────────────────────

Found by stripping comments and searching what was left, not by reading:

  the Jump card's summary   "jump to it in minnie65"
  out of region             "outside the minnie65 predicted volume (e.g. minnie35/Img35 imagery)"
  no detection              "inside the minnie65 predicted volume, but MICrONS's automatic
                             nucleus detector produced no matching detection here"
  found a real cell?        "The minnie35/Img35 imagery isn't covered by MICrONS's nucleus
                             detector or verified-cell dataset at all yet"
  the ID proposal block     "an Img65 or Img35 segment ID, or a Nucleus ID"
  out-of-region neighbours  "Only a handful of cells have been identified in the minnie35/Img35
                             imagery so far, unlike the densely-covered minnie65 dataset"
  the region-filter preview TWO extents, "Img65 (minnie65)" and "Img35 (minnie35)"

── "MICrONS" GOES TOO, WHERE IT IS A CREDIT ────────────────────────────────────

Three of these credit MICrONS for V1DD's nucleus detection. This page's own config already says
why that is wrong, in the comment beside `predictedBy`:

> V1DD is the Allen Institute's V1 Deep Dive, and calling its predictions "MICrONS-predicted"
> credited the wrong laboratory on all 207,455 of them.

── THE DIAGRAM DRAWS ONE BOX, FOR THE REASON THE TOP VIEW DOES ─────────────────

`MINNIE35_EM_BB` is literally assigned `= MINNIE65_EM_BB` further down this file. So the region
preview was drawing two dashed rectangles **exactly on top of each other**, in two colours, under
the names of two volumes this tool does not have — and a legend explaining the difference between
them. One box, named for the dataset, in the purple this page already uses for it.

The CONSTANTS keep their minnie-shaped names. Renaming `MINNIE65_EM_BB` reaches the region filter,
the layer diagram and the top view, and is a separate change from what a reader is told.

Run: python3 src/djump_stops_speaking_minnie65.py
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


PAIRS = [
    (u"the Jump card says which dataset it jumps into",
     u'&mdash; jump to it in minnie65, identify the nearest cell &amp; its neighbours,',
     u'&mdash; jump to it in V1DD, identify the nearest cell &amp; its neighbours,'),

    (u"...and out-of-region says it in V1DD's terms",
     u"""?'outside the minnie65 predicted volume (e.g. minnie35/Img35 imagery), so no MICrONS segmentation or root ID is available here.'""",
     u"""?'outside the part of V1DD the automatic detector covers, so no segmentation or root ID is available here.'"""),

    (u"...as does a point inside it with no detection",
     u"""    :'inside the minnie65 predicted volume, but MICrONS\\u2019s automatic nucleus detector produced no matching detection here, so no MICrONS segmentation or root ID is available for this point.';""",
     u"""    :'inside the covered part of V1DD, but its automatic nucleus detector produced no matching detection here, so no segmentation or root ID is available for this point.';"""),

    (u"...and the offer to report one",
     u"""<span>Found a real cell here? The minnie35/Img35 imagery isn\\'t covered by MICrONS\\'s nucleus detector or verified-cell dataset at all yet.</span>""",
     u"""<span>Found a real cell here? This part of the volume isn\\'t covered by V1DD\\'s nucleus detector or verified-cell dataset at all yet.</span>"""),

    (u"the ID proposal block stops naming two segmentations",
     u"Pick which segmentation each ID comes from — an Img65 or Img35 segment ID, or a Nucleus ID — because an ID only works in its own segmentation.",
     u"Pick which segmentation each ID comes from — a segment ID or a Nucleus ID — because an ID only works in its own segmentation."),

    (u"...and the sparse-neighbours warning names the region, not a volume",
     u'&#9888; Only a handful of cells have been identified in the minnie35/Img35 imagery so far, unlike the densely-covered minnie65 dataset &mdash; these "nearest" matches can easily be tens of &micro;m away and shouldn’t be trusted as real neighbours yet.',
     u'&#9888; Only a handful of cells have been identified out here so far, unlike the densely-covered part of V1DD &mdash; these "nearest" matches can easily be tens of &micro;m away and shouldn’t be trusted as real neighbours yet.'),

    (u"the region preview draws one extent, not the same one twice",
     u'''    const extentsXZ=[
      {name:"Img65 (minnie65)",color:"#58a6ff",a0:MINNIE65_EM_BB.xmin,a1:MINNIE65_EM_BB.xmax,b0:MINNIE65_EM_BB.zmin,b1:MINNIE65_EM_BB.zmax},
      {name:"Img35 (minnie35)",color:"#f0883e",a0:MINNIE35_EM_BB.xmin,a1:MINNIE35_EM_BB.xmax,b0:MINNIE35_EM_BB.zmin,b1:MINNIE35_EM_BB.zmax}
    ];
    const extentsXY=[
      {name:"Img65 (minnie65)",color:"#58a6ff",a0:MINNIE65_EM_BB.xmin,a1:MINNIE65_EM_BB.xmax,b0:MINNIE65_EM_BB.ymin,b1:MINNIE65_EM_BB.ymax},
      {name:"Img35 (minnie35)",color:"#f0883e",a0:MINNIE35_EM_BB.xmin,a1:MINNIE35_EM_BB.xmax,b0:MINNIE35_EM_BB.ymin,b1:MINNIE35_EM_BB.ymax}
    ];''',
     u'''    /* ONE EXTENT, NOT THE SAME ONE TWICE.  2026-09-20
       MINNIE35_EM_BB is assigned `= MINNIE65_EM_BB` further down this file, so this drew two
       dashed rectangles exactly on top of each other, in two colours, under the names of two
       volumes this tool does not have — with a legend explaining the difference between them.
       Same fault the top view had, in the second diagram that carries it. The constants keep
       their minnie-shaped names; renaming those reaches three more callers and is its own
       change. #b388ff is the purple this page already draws its own extent in. */
    const EXTENT_NAME="V1DD imaged extent",EXTENT_COLOR="#b388ff";
    const extentsXZ=[
      {name:EXTENT_NAME,color:EXTENT_COLOR,a0:MINNIE65_EM_BB.xmin,a1:MINNIE65_EM_BB.xmax,b0:MINNIE65_EM_BB.zmin,b1:MINNIE65_EM_BB.zmax}
    ];
    const extentsXY=[
      {name:EXTENT_NAME,color:EXTENT_COLOR,a0:MINNIE65_EM_BB.xmin,a1:MINNIE65_EM_BB.xmax,b0:MINNIE65_EM_BB.ymin,b1:MINNIE65_EM_BB.ymax}
    ];'''),
]

print("djump.html")
edit("djump.html", PAIRS, marker=u"ONE EXTENT, NOT THE SAME ONE TWICE")

# An eighth, missed by the first pass because the scan that found the others truncated its line at
# 165 characters and this one says it at 190. Its own edit() call, so the marker above cannot
# short-circuit it on a re-run.
edit("djump.html", [
    (u"...and a standalone report's caption",
     u"&mdash; this is the reporter’s own estimated location; the minnie35/Img35 imagery here has no MICrONS nucleus detection to compare against.",
     u"&mdash; this is the reporter’s own estimated location; there is no automatic nucleus detection here to compare against."),
])


# ── and nothing a reader can see says it any more ─────────────────────────────────────────────
# Comments are stripped before the assertion, because this file's comments quote the very strings
# it just replaced -- the trap this repo has now hit three times.
def visible_text(rel):
    s = io.open(os.path.join(HERE, rel), encoding="utf-8").read()
    out, inblk = [], False
    for ln in s.split("\n"):
        t = ln
        if inblk:
            if "*/" in t:
                t = t.split("*/", 1)[1]
                inblk = False
            else:
                continue
        while "/*" in t:
            a, b = t.split("/*", 1)
            if "*/" in b:
                t = a + b.split("*/", 1)[1]
            else:
                t = a
                inblk = True
                break
        if t.strip().startswith("//"):
            continue
        out.append(t)
    return "\n".join(out)


code = visible_text("djump.html")
LEFT = []
for word in [u"minnie65", u"minnie35", u"Img65", u"Img35"]:
    for ln in code.split("\n"):
        if word in ln:
            LEFT.append(ln.strip()[:120])
LEFT = sorted(set(LEFT))
print(u"\n%d code lines still mention a minnie volume:" % len(LEFT))
for ln in LEFT:
    print("   " + ln)
print(u"""
Those that remain are LAYER NAMES and CONSTANT NAMES, not sentences: the Neuroglancer layers a
built link carries ("EM (Img65)", "segmentation (Img35)", "Vasculature (Img35)") and the
VASC_ID_IMG65/IMG35 pair they read. On this page SRC.em35 === SRC.em and SRC.seg35 === SRC.seg, so
those branches can only ever add a DUPLICATE layer pointing at the volume already there, under the
name of a volume that is not. Real, and a change to link building rather than to wording — left
for its own edit rather than folded into this one.""")
