# -*- coding: utf-8 -*-
"""The figure carries its own caption.                                          2026-09-18

Søren: *"perhaps we could have Top view as a title in the diagram and then img35 and img65 written
in the diagram to show the dataset names, they should have the same colors as the regions they
represent. Then we can remove the top line and perhaps make it more compact."*

(He had waved this off an hour earlier -- *"Nevermind writing on the model, it says what the colors
represent just above"* -- and then came back to it with the piece that was missing: the title moves
INTO the figure too, so the line above it has nothing left on it and can go entirely. That is what
makes it compact. Half the idea saved nothing; the whole idea saves a wrapped caption.)

WHAT THE LINE ABOVE COST. At panel width "Top view (X -> , Z v) -- [] Img65 (minnie65)  [] Img35
(minnie35)" wraps to TWO lines: 36 px. The title band added inside the SVG is 15 px. So the figure
grows by 15 and the panel shrinks by 36, and it reads as a figure rather than as a picture with a
sentence stuck on top.

THE MAP KEEPS ITS EXACT PROPORTIONS. The viewBox grows from 260x140 to 260x155 and the plot band is
inset by the same 15 px, so the usable height stays 128 px and every rectangle, and the dot, lands
where it landed before. A title added by squeezing the map would have changed the one thing in this
figure that means something.

OPPOSITE EDGES FOR THE TWO NAMES. The extents overlap, so both labels on the same edge would collide
inside the overlap for some cells and not others. Img35 rides the top inside edge of its rectangle
and Img65 the bottom inside edge of its own. Each in its rectangle's own colour -- which he asked
for, and which is also what makes the DOT legible without a key: the dot is already drawn in the
colour of the extent it is in, and now that colour has its name written beside it in the same
picture.

Run: python3 src/the_figure_carries_its_own_caption.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

APO = "’"
ARROW_R = "&rarr;"
ARROW_D = "&darr;"

OLD = '''  const W=260,H=140,pad=6;
  const sx=v=>pad+(v-fullA0)/(fullA1-fullA0)*(W-2*pad);
  const sy=v=>pad+(v-fullB0)/(fullB1-fullB0)*(H-2*pad);
  let svg='<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="max-width:260px;display:block;margin:6px auto;background:var(--bg);border:1px solid var(--line);border-radius:6px" xmlns="http://www.w3.org/2000/svg">';
  for(const e of extents){
    const ex0=sx(e.a0),ex1=sx(e.a1),ey0=sy(e.b0),ey1=sy(e.b1);
    svg+='<rect x="'+ex0.toFixed(1)+'" y="'+ey0.toFixed(1)+'" width="'+(ex1-ex0).toFixed(1)+'" height="'+(ey1-ey0).toFixed(1)+'" fill="none" stroke="'+e.color+'" stroke-width="1.3" stroke-dasharray="3,3"/>';
  }'''

NEW = '''  /* THE FIGURE CARRIES ITS OWN CAPTION, 2026-09-18 (Søren: "have Top view as a title in the diagram
     and then img35 and img65 written in the diagram ... they should have the same colors as the
     regions they represent. Then we can remove the top line"). TOP is a title band inside the SVG;
     the plot band is inset by it, so the map's usable height stays the 128 px it always was and
     every rectangle and the dot land exactly where they did. Squeezing the map to make room for a
     title would have moved the one thing in this figure that means something. */
  const TOP=15;
  const W=260,H=140+TOP,pad=6;
  const sx=v=>pad+(v-fullA0)/(fullA1-fullA0)*(W-2*pad);
  const sy=v=>TOP+pad+(v-fullB0)/(fullB1-fullB0)*(H-TOP-2*pad);
  let svg='<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="max-width:260px;display:block;margin:6px auto;background:var(--bg);border:1px solid var(--line);border-radius:6px" xmlns="http://www.w3.org/2000/svg">';
  svg+='<text x="'+pad+'" y="11" font-size="9.5" font-family="monospace" style="fill:var(--mut)">Top view (X ''' + ARROW_R + ''', Z ''' + ARROW_D + ''')</text>';
  for(const e of extents){
    const ex0=sx(e.a0),ex1=sx(e.a1),ey0=sy(e.b0),ey1=sy(e.b1);
    svg+='<rect x="'+ex0.toFixed(1)+'" y="'+ey0.toFixed(1)+'" width="'+(ex1-ex0).toFixed(1)+'" height="'+(ey1-ey0).toFixed(1)+'" fill="none" stroke="'+e.color+'" stroke-width="1.3" stroke-dasharray="3,3"><title>'+e.name+'</title></rect>';
    /* OPPOSITE EDGES: the two extents overlap, so two labels on the same edge would collide inside
       the overlap for some cells and not others. Each in its own rectangle's colour, which is also
       what lets the dot be read without a key -- the dot is drawn in the colour of the extent it
       is in. The short name, because this is a label on a 260 px drawing; the long one is in the
       <title> on both the box and the label. */
    const ly=e.bottom?(ey1-4):(ey0+9.5);
    svg+='<text x="'+(ex0+4).toFixed(1)+'" y="'+ly.toFixed(1)+'" font-size="9" font-family="monospace" font-weight="bold" fill="'+e.color+'">'+e.short+'<title>'+e.name+'</title></text>';
  }'''

OLD_EXT = '''    {name:"Img65 (minnie65)",color:"#58a6ff",a0:BB65.xmin,a1:BB65.xmax,b0:BB65.zmin,b1:BB65.zmax},
    {name:"Img35 (minnie35)",color:"#f0883e",a0:BB35.xmin,a1:BB35.xmax,b0:BB35.zmin,b1:BB35.zmax}'''

NEW_EXT = '''    /* `short` is what is written on the drawing and `bottom` is which inside edge it rides -- see
       the label block below for why the two extents use different edges. */
    {name:"Img65 (minnie65)",short:"Img65",bottom:true,color:"#58a6ff",a0:BB65.xmin,a1:BB65.xmax,b0:BB65.zmin,b1:BB65.zmax},
    {name:"Img35 (minnie35)",short:"Img35",bottom:false,color:"#f0883e",a0:BB35.xmin,a1:BB35.xmax,b0:BB35.zmin,b1:BB35.zmax}'''

OLD_TAIL = '''  const legend=extents.map(e=>'<span style="color:'+e.color+'">&#9633;</span> '+e.name).join('&nbsp;&nbsp;&nbsp;');
  /* THE NOTE ONLY APPEARS WHEN IT HAS SOMETHING TO SAY, 2026-09-18. "within Img65's imaged
     extent" was true of very nearly every cell in a minnie65 roster, so it was a line of the panel
     spent on telling somebody nothing. The other two cases are not: outside Img65 there is no
     MICrONS segmentation for the point, which is why that panel looks unlike every other one, and
     outside both there is no imagery at all. The legend above is untouched -- it names the two
     colours, which the picture cannot do for itself. */
  const where=inside65?"":inside35?"in Img35, outside Img65 ''' + "—" + ''' no MICrONS segmentation here"
                                  :"outside both datasets''' + APO + ''' imaged extent";
  return '<div class="hint" style="margin-bottom:3px">Top view (X &rarr;, Z &darr;) &mdash; '+legend+'</div>'+svg
    +(where?'<p class="hint" style="margin-top:4px">'+where+'</p>':'');'''

NEW_TAIL = '''  /* NOTHING ABOVE THE FIGURE ANY MORE. The title and the two dataset names are inside it, so the
     line that used to carry them -- and which wrapped to two lines at panel width, 36 px -- has
     nothing left to say. The title band inside the SVG costs 15 of those 36 back.
     THE NOTE BELOW ONLY APPEARS WHEN IT HAS SOMETHING TO SAY: "within Img65's imaged extent" was
     true of very nearly every cell in a minnie65 roster, so it was a line spent telling somebody
     nothing. The other two cases are not -- outside Img65 there is no MICrONS segmentation for the
     point, which is why that panel looks unlike every other one, and outside both there is no
     imagery at all. */
  const where=inside65?"":inside35?"in Img35, outside Img65 ''' + "—" + ''' no MICrONS segmentation here"
                                  :"outside both datasets''' + APO + ''' imaged extent";
  return svg+(where?'<p class="hint" style="margin-top:4px">'+where+'</p>':'');'''

PAIRS = [
    (OLD_EXT, NEW_EXT, "each extent carries a short name and an edge to ride"),
    (OLD, NEW, "the title and the two names are drawn inside the figure"),
    (OLD_TAIL, NEW_TAIL, "...and the line above the figure is gone"),
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
