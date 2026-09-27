# -*- coding: utf-8 -*-
u"""One shape for the cell-name link, on all six pages.                                 2026-09-26

Søren, looking at an endothelial cell he had identified himself in ηJump:

    "First, why does it call the endothelial cell Object object?"

BECAUSE THE SHARED CALLER AND THE PAGE DISAGREED ABOUT THE ARGUMENTS. core/panel.js promotes a
winning community name into #ctHeadline and builds it with

    celltypeLink(cellPos, escHtml(win.name), {nuc: nid, root: ""})

— µJump's shape, (pos, innerHtml, ids). ηJump's own function took (pos, segId, innerHtml), because
an H01 viewer link carries the c3 segment and the other tools' links do not. So the name landed in
`segId`, the ids object landed in `innerHtml`, and an object concatenated into a string is
"[object Object]". The link still opened the right cell; it just had no name on it.

IT HAD A GUARD, AND THE GUARD IS THE REAL FAULT. ηJump's function tested `innerHtml === undefined`
and shuffled a two-argument call into place — which is exactly what panel.js made until 2026-09-24,
when src/the_cell_name_opens_the_cell_with_its_outline.py added the third argument so that the ↗
could carry the cell's own outline. A third argument made the guard stop firing. Nothing threw,
nothing logged, and every community-identified H01 cell lost its name.

A guard that adapts to two call shapes is a guard that hides the day a third arrives. So it goes,
and ηJump takes the shape the other five use. The segment its link needs comes out of ids.root,
falling back to the cell on screen — which is what the two-argument path was reaching for anyway.

AND TWO MORE PAGES WERE QUIETLY WRONG IN THE OTHER DIRECTION, which is the part Søren could not
have seen. λJump and βJump declare (pos, innerHtml) — two parameters — so JavaScript discards
panel.js's ids object without a word. No "[object Object]" there, and no `class="ctlink"` either:
that attribute is what makes the ↗ open the cell WITH its hand-traced outline. That feature has
been live since 2026-09-24 and had never once run on those two pages. Measured, not reasoned:
celltypelinkcheck.js reported `2 parameters` and `(no class)` for both before this went in.

SO ALL SIX NOW TAKE (pos, innerHtml, ids), each keeping its own URL. The check asserts the contract
rather than the symptom, so the next page that invents an argument order fails in a test instead of
in a headline.

Check: celltypelinkcheck.js, written first; 13 of its assertions failed before this went in.
Run: python3 src/one_shape_for_the_cell_name_link.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


print("hjump.html")
edit("hjump.html", [
 (u"one shape, and the segment comes out of the ids",
  u"""/* Matches µJump's celltypeLink() exactly, including the .ext arrow span -- the cell NAME is the
   Neuroglancer link, there is no separate button (Søren, 2026-08-16). */
/* ── TWO SHAPES, ONE LINK ──────────────────────────────────  2026-09-20
   This page's five call sites pass (pos, segId, innerHtml), because an H01 viewer link carries the
   c3 segment and the other five tools' links do not. core/panel.js calls the shape those five
   use — celltypeLink(pos, innerHtml) — when a community identification takes over the headline,
   and would otherwise have passed the cell's NAME as a segment id: a link into a segment called
   "Astrocyte", and a headline with nothing in it.

   Two arguments means "take the segment from the cell on screen", which is the cell the override
   is renaming. The three-argument call sites are untouched. */
function celltypeLink(pos, segId, innerHtml){
  if(innerHtml===undefined){ innerHtml=segId; segId=(typeof CUR_ROOT!=="undefined"&&CUR_ROOT)||""; }
  return '<a href="'+escHtml(viewerUrl(pos,segId))+'" target="_blank" rel="noopener" '
    +'title="Open this cell in Neuroglancer, with its c3 segment already selected">'
    +innerHtml+' <span class="ext">&#8599;</span></a>';
}""",
  u"""/* Matches µJump's celltypeLink() exactly, including the .ext arrow span -- the cell NAME is the
   Neuroglancer link, there is no separate button (Søren, 2026-08-16). */
/* ── ONE SHAPE, ONE LINK ───────────────────────────────────  2026-09-26
   (pos, innerHtml, ids) — µJump's, δJump's, πJump's, λJump's and βJump's. It was this page's own
   (pos, segId, innerHtml) until today, guarded by `innerHtml === undefined` so that core/panel.js's
   two-argument call still worked.

   THAT GUARD IS WHY THE NAME DISAPPEARED. On 2026-09-24 panel.js gained a third argument, so the
   ↗ on a community-named cell could open it with its outline. The guard stopped firing, the name
   went into `segId`, the ids object went into `innerHtml`, and Søren's endothelial cell was
   headlined "[object Object]". Nothing threw; a guard that adapts to two shapes hides the arrival
   of a third.

   An H01 viewer link carries the c3 segment, which the other tools' links do not, so the segment
   is read out of ids.root — and where the caller has none, out of the cell on screen, which is
   what the two-argument path was reaching for all along. The ctlink attributes are µJump's
   verbatim; core/tracedoutlines.js wires `a.ctlink` by class on every page that has them.
   See src/one_shape_for_the_cell_name_link.py. */
function celltypeLink(pos, innerHtml, ids){
  const segId=(ids&&ids.root)?ids.root:((typeof CUR_ROOT!=="undefined"&&CUR_ROOT)||"");
  const mine=(ids&&(ids.nuc||ids.root))
    ?' class="ctlink" data-nuc="'+escHtml(ids.nuc||"")+'" data-root="'+escHtml(ids.root||"")+'"'
    :'';
  return '<a href="'+escHtml(viewerUrl(pos,segId))+'"'+mine+' target="_blank" rel="noopener" '
    +'title="Open this cell in Neuroglancer, with its c3 segment already selected">'
    +innerHtml+' <span class="ext">&#8599;</span></a>';
}"""),

 (u"the cell panel calls it the shared way",
  u"""    +celltypeLink(pos,seg,escHtml(hjCellName(i)))+star""",
  u"""    +celltypeLink(pos,escHtml(hjCellName(i)),{nuc:String(HSB[i]),root:seg})+star"""),

 (u"...and so does the guided result",
  u"""    +celltypeLink(ID_CTX.pos, ID_CTX.seg, escHtml(name))+'</div>';""",
  u"""    +celltypeLink(ID_CTX.pos, escHtml(name),
                  {nuc:String(ID_CTX.body||""), root:String(ID_CTX.seg||"")})+'</div>';"""),
])

print("ljump.html")
edit("ljump.html", [
 (u"the ids are not thrown away",
  u"""function celltypeLink(pos,innerHtml){
  const i=CUR_IDX;
  if(i==null) return innerHtml;
  const u=viewerUrl([BX[i],BY[i],BZ[i]]);
  return '<a href="'+escHtml(u)+'" target="_blank" rel="noopener" title="Open this nucleus in Neuroglancer" '
       + 'style="color:var(--accent);text-decoration:none">'+innerHtml
       + ' <span style="font-size:.7em;opacity:.75">&#8599;</span></a>';
}""",
  u"""/* ── THE IDS COME WITH THE NAME ────────────────────────────────────────────────  2026-09-26
   This took (pos, innerHtml) — two parameters — so core/panel.js's third argument was discarded
   silently, and the ctlink attributes that let the ↗ open a cell WITH its hand-traced outline were
   never written on this page. The feature went in on 2026-09-24 and had never run here. Measured:
   celltypelinkcheck.js reported "2 parameters" and "(no class)" before this line changed.
   See src/one_shape_for_the_cell_name_link.py. */
function celltypeLink(pos,innerHtml,ids){
  const i=CUR_IDX;
  if(i==null) return innerHtml;
  const u=viewerUrl([BX[i],BY[i],BZ[i]]);
  const mine=(ids&&(ids.nuc||ids.root))
    ?' class="ctlink" data-nuc="'+escHtml(ids.nuc||"")+'" data-root="'+escHtml(ids.root||"")+'"'
    :'';
  return '<a href="'+escHtml(u)+'"'+mine+' target="_blank" rel="noopener" title="Open this nucleus in Neuroglancer" '
       + 'style="color:var(--accent);text-decoration:none">'+innerHtml
       + ' <span style="font-size:.7em;opacity:.75">&#8599;</span></a>';
}"""),

 (u"...and the headline passes them",
  u"""    + celltypeLink(pos,added?escHtml(addedName||"Unnamed cell"):('Nucleus '+BID[i]))""",
  u"""    + celltypeLink(pos,added?escHtml(addedName||"Unnamed cell"):('Nucleus '+BID[i]),
                   {nuc:String(BID[i]),root:""})"""),
])

print("bjump.html")
edit("bjump.html", [
 (u"the ids are not thrown away",
  u"""function celltypeLink(pos,innerHtml){
  const i=CUR_IDX;
  if(i==null) return innerHtml;""",
  u"""/* ── THE IDS COME WITH THE NAME ────────────────────────────────────────────────  2026-09-26
   λJump's fault, and for the same reason: two parameters, so core/panel.js's ids object was
   discarded and the ↗ on a community-named cell could not bring its outline. Measured the same
   way — celltypelinkcheck.js, "2 parameters" and "(no class)".
   See src/one_shape_for_the_cell_name_link.py. */
function celltypeLink(pos,innerHtml,ids){
  const i=CUR_IDX;
  if(i==null) return innerHtml;"""),

 (u"...on the anchor this page builds",
  u"""  const u=viewerUrl([BX[i],BY[i],BZ[i]],BSEG[i],BSRC[i],bjumpCellSegIds(i,BSEG[i]));
  return '<a href="'+escHtml(u)+'" target="_blank" rel="noopener" title="Open this nucleus in Neuroglancer" '""",
  u"""  const u=viewerUrl([BX[i],BY[i],BZ[i]],BSEG[i],BSRC[i],bjumpCellSegIds(i,BSEG[i]));
  const mine=(ids&&(ids.nuc||ids.root))
    ?' class="ctlink" data-nuc="'+escHtml(ids.nuc||"")+'" data-root="'+escHtml(ids.root||"")+'"'
    :'';
  return '<a href="'+escHtml(u)+'"'+mine+' target="_blank" rel="noopener" title="Open this nucleus in Neuroglancer" '"""),

 (u"...and the headline passes them",
  u"""    + celltypeLink(pos,'Nucleus '+BID[i])""",
  u"""    + celltypeLink(pos,'Nucleus '+BID[i],{nuc:String(BID[i]),root:seg?String(seg):""})"""),
])
print("\nNow: python3 src/build_stamps.py")
