# -*- coding: utf-8 -*-
u"""δJump and πJump get µJump's top view.                                        2026-09-20

Søren, looking at δJump's cell card: *"Also, the top view could be updated the same way as uJump."*

µJump's top view was changed on 2026-09-18 at his own request — *"have Top view as a title in the
diagram and then img35 and img65 written in the diagram ... they should have the same colors as the
regions they represent. Then we can remove the top line"* — and δJump and πJump were left on the
version before it. λ/β/η have no top view at all, so these two are the whole remainder.

── WHAT MOVES ─────────────────────────────────────────────────────────────────

  the title      out of an HTML line above the figure and into a band INSIDE the SVG. The plot is
                 inset by the band, so the map keeps the 128 px of usable height it always had and
                 every rectangle and the dot land exactly where they did. Squeezing the map to make
                 room for a title would have moved the one thing in the figure that means anything.
  the legend     out of the line above and into a label inside the rectangle, in the rectangle's
                 own colour. The line it came from wrapped to two at panel width and cost 36 px;
                 the band inside costs 15 of them back.

── AND TWO THINGS THAT WERE WRONG RATHER THAN OLD ─────────────────────────────

Both are visible in the screenshot Søren sent, and neither is about layout:

1. **The dot was drawn in µJump's palette.** `dotColor` picked `#58a6ff` for "inside Img65" and
   `#f0883e` for "inside Img35" — minnie65's two colours. δJump draws its one rectangle in
   `#b388ff`, so the card showed a **purple box with a blue dot in it** and no way to read the
   pairing. The dot now takes the colour of the extent it is in, which is what makes the figure
   legible without a key.

2. **δJump's caption said "within Img65's imaged extent"** — on a V1DD page, about a volume this
   tool does not contain. Same class of fault as the four MICrONS-crediting sentences fixed in
   `src/whose_prediction_is_it_anyway.py`: shared wording asserting something true of one dataset
   on a page about another. πJump's caption already named pinky100 and is left alone.

   And following µJump, the caption now **only appears when it has something to say**. "Within the
   imaged extent" is true of very nearly every cell in either roster, so it was a line spent
   telling somebody nothing; outside it is real news and still printed.

`BB35` is dropped from both. On δJump `MINNIE35_EM_BB` is literally assigned `= MINNIE65_EM_BB`,
and on πJump the file's own comment already says the two are the same rectangle — so the second
lookup could only ever produce one dashed outline drawn exactly on top of another, under the name
of a volume neither tool contains. (The constants keep their minnie-shaped NAMES here, because the
region-filter diagram reads them too; renaming them is a separate change and not this one.)

Run: python3 src/the_top_view_carries_its_own_caption_too.py
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


# ── the body both pages share, with the per-page parts substituted in ─────────────────────────
BODY = u'''function renderTopViewDiagram(vx,vy,vz){
  const BB=window.MINNIE65_EM_BB;
  if(!BB)return "";
  const nx=vx*UJ_RX,nz=vz*UJ_RZ;
  /* ONE BOX, NOT TWO. MINNIE35_EM_BB is the same rectangle as MINNIE65_EM_BB on this page, so
     drawing both put one dashed outline exactly on top of another under the name of a volume this
     tool does not contain. The constants keep their minnie-shaped names because the region-filter
     diagram reads them too. */
  const extents=[
    {name:__LONG__,short:__SHORT__,color:__COLOUR__,
     a0:BB.xmin,a1:BB.xmax,b0:BB.zmin,b1:BB.zmax}
  ];
  const rawA0=Math.min(...extents.map(e=>e.a0)),rawA1=Math.max(...extents.map(e=>e.a1));
  const rawB0=Math.min(...extents.map(e=>e.b0)),rawB1=Math.max(...extents.map(e=>e.b1));
  const marginA=(rawA1-rawA0)*0.06,marginB=(rawB1-rawB0)*0.06;
  const fullA0=rawA0-marginA,fullA1=rawA1+marginA,fullB0=rawB0-marginB,fullB1=rawB1+marginB;
  /* THE FIGURE CARRIES ITS OWN CAPTION, 2026-09-18 on \\u00b5Jump and 2026-09-20 here. S\\u00f8ren:
     "have Top view as a title in the diagram and then img35 and img65 written in the diagram ...
     they should have the same colors as the regions they represent. Then we can remove the top
     line". TOP is a title band inside the SVG and the plot band is inset by it, so the map's
     usable height stays the 128 px it always was and every rectangle and the dot land exactly
     where they did. */
  const TOP=15;
  const W=260,H=140+TOP,pad=6;
  const sx=v=>pad+(v-fullA0)/(fullA1-fullA0)*(W-2*pad);
  const sy=v=>TOP+pad+(v-fullB0)/(fullB1-fullB0)*(H-TOP-2*pad);
  let svg='<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="max-width:260px;display:block;margin:6px auto;background:var(--bg);border:1px solid var(--line);border-radius:6px" xmlns="http://www.w3.org/2000/svg">';
  svg+='<text x="'+pad+'" y="11" font-size="9.5" font-family="monospace" style="fill:var(--mut)">Top view (X &rarr;, Z &darr;)</text>';
  for(const e of extents){
    const ex0=sx(e.a0),ex1=sx(e.a1),ey0=sy(e.b0),ey1=sy(e.b1);
    svg+='<rect x="'+ex0.toFixed(1)+'" y="'+ey0.toFixed(1)+'" width="'+(ex1-ex0).toFixed(1)+'" height="'+(ey1-ey0).toFixed(1)+'" fill="none" stroke="'+e.color+'" stroke-width="1.3" stroke-dasharray="3,3"><title>'+e.name+'</title></rect>';
    /* Inside its own rectangle and in its own colour, which is also what lets the dot be read
       without a key: the dot is drawn in the colour of the extent it is in. The short name,
       because this is a label on a 260 px drawing; the long one is in the <title>. */
    svg+='<text x="'+(ex0+4).toFixed(1)+'" y="'+(ey1-4).toFixed(1)+'" font-size="9" font-family="monospace" font-weight="bold" fill="'+e.color+'">'+e.short+'<title>'+e.name+'</title></text>';
  }
  /* THE DOT TAKES THE EXTENT'S COLOUR. It used to take \\u00b5Jump's Img65 blue whatever this page's
     rectangle was drawn in -- on \\u03b4Jump a purple box with a blue dot inside it, and nothing to say
     the two were about the same volume. Yellow when it is in none of them. */
  const inside=nx>=BB.xmin&&nx<=BB.xmax&&nz>=BB.zmin&&nz<=BB.zmax;
  const dotColor=inside?extents[0].color:"#fff200";
  svg+='<circle cx="'+sx(nx).toFixed(1)+'" cy="'+sy(nz).toFixed(1)+'" r="5" fill="'+dotColor+'" stroke="#0d1117" stroke-width="1"/>';
  svg+='</svg>';
  /* NOTHING ABOVE THE FIGURE ANY MORE: the title and the dataset's name are inside it.
     AND THE NOTE BELOW ONLY APPEARS WHEN IT HAS SOMETHING TO SAY. "Within the imaged extent" is
     true of very nearly every cell in this roster, so it was a line spent telling somebody
     nothing. Outside it, there is no imagery at the point at all, which is worth a sentence. */
  const where=inside?"":__OUTSIDE__;
  return svg+(where?'<p class="hint" style="margin-top:4px">'+where+'</p>':'');
}'''

PAGES = {
    "djump.html": {
        "long":  u'"V1DD imaged extent"',
        "short": u'"V1DD"',
        # The purple this page already drew its rectangle in.
        "colour": u'"#b388ff"',
        "outside": u'"outside V1DD\\u2019s imaged extent"',
        # Its caption said "within Img65's imaged extent" -- minnie65's vocabulary on a V1DD page.
        "old_tail": u'''  const inside65=nx>=BB65.xmin&&nx<=BB65.xmax&&nz>=BB65.zmin&&nz<=BB65.zmax;
  const inside35=nx>=BB35.xmin&&nx<=BB35.xmax&&nz>=BB35.zmin&&nz<=BB35.zmax;
  const dotColor=inside65?"#58a6ff":(inside35?"#f0883e":"#fff200");''',
    },
    "pjump.html": {
        "long":  u'"pinky100 imaged extent"',
        "short": u'"pinky100"',
        "colour": u'"#58a6ff"',
        "outside": u'"outside pinky100\\u2019s imaged extent"',
        "old_tail": None,
    },
}


def body_for(cfg):
    b = BODY
    for k, v in [("__LONG__", cfg["long"]), ("__SHORT__", cfg["short"]),
                 ("__COLOUR__", cfg["colour"]), ("__OUTSIDE__", cfg["outside"])]:
        assert k in b
        b = b.replace(k, v)
    assert "__" not in b.replace("__", "", 0) or True
    for left in ["__LONG__", "__SHORT__", "__COLOUR__", "__OUTSIDE__"]:
        assert left not in b, "placeholder %s survived" % left
    return b


def old_body(rel):
    """The page's current renderTopViewDiagram, start to its closing brace, read not typed."""
    s = io.open(os.path.join(HERE, rel), encoding="utf-8").read()
    i = s.index(u"function renderTopViewDiagram(vx,vy,vz){")
    j = s.index(u"\n}\n", i) + len(u"\n}")
    b = s[i:j]
    assert b.count(u"renderTopViewDiagram") == 1 and u"svg+='</svg>'" in b, \
        "%s: that is not one whole function" % rel
    assert u"MINNIE65_EM_BB" in b, "%s: the extents are not where they were" % rel
    return b


for rel, cfg in PAGES.items():
    print(rel)
    old = old_body(rel)
    new = body_for(cfg)
    edit(rel, [(u"the top view carries its own title and label", old, new)],
         marker=u"Top view (X &rarr;, Z &darr;)</text>")

print(u"\nnow: node emdjumpcheck.js && node jumpcardcheck.js && node topviewcheck.js")
