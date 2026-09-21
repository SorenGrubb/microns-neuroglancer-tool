# -*- coding: utf-8 -*-
u"""ηJump's "Open all in Neuroglancer" brings the matched cells' traced outlines.     2026-09-21

Stage I of the port, the last page it can reach. µJump, δJump and πJump build their "Open all
matches" state when the button is pressed, so the outline layer is awaited and pushed onto it
(src/tracedoutlines_extraction.py). ηJump's is a LINK whose href renderFilterResults writes as soon
as the preview is done — synchronously, before anyone has picked an outline kind, and one Drive
read per outline is not something to do on every preview.

So:

  1. µJump's picker markup, read out of ujump.html, goes under ηJump's organelle filter box.
  2. renderFilterResults keeps the rows the link was built for, FILTER.shown (the first 200).
  3. A click handler on the link. With the picker on "None — points only" it does nothing and the
     link opens as it always has. Otherwise it stops the link, opens the tab AT ONCE (a window
     opened after an await is a popup, and browsers block those), reads the outlines of those
     same rows by both their ids — cell body (what ηJump files as nucleusId) and c3 segment (its
     rootId) — pushes the layers onto the link's own state, and sends the tab there. If the tab
     could not be opened it opens the finished URL instead.

The coordinates need no conversion: a tracing is stored in the page's voxels, and the link's state
declares the page's voxel size as its dimensions.

βJump and λJump have no "Open all matches" view at all, so there is nothing there to add a layer to.

Run: python3 src/tracedoutlines_hjump.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rd(rel):
    return io.open(os.path.join(HERE, rel), encoding="utf-8").read()


def wr(rel, s):
    io.open(os.path.join(HERE, rel), "w", encoding="utf-8").write(s)


u = rd("ujump.html")
PICK_START = u"<!-- THE OTHER HALF OF AN ORGANELLE."
pi = u.index(PICK_START)
pj = u.index(u"</select>\n</div>\n", pi) + len(u"</select>\n</div>\n")
PICKER = u[pi:pj]
assert u'id="filterOrganSeg"' in PICKER and PICKER.count(u"<option") == 2
# µJump's tooltip says "the points above"; ηJump has no organelle-point layers in its link.
PICKER = PICKER.replace(u"; the points above cost nothing extra.", u".")
assert u"points above" not in PICKER

TAG = u'<script src="core/tracedoutlines.js"></script>'

BOX = (u'<div style="max-height:230px;overflow-y:auto;border:1px solid var(--line);border-radius:7px;'
       u'padding:8px 10px;margin-top:8px" id="filterOrganelles"><p class="hint" style="margin:0">'
       u'Loading community organelle reports&hellip;</p></div>\n')

SHOWN_OLD = u'''    const shown=rows.slice(0,CAP);
    vb.href=filterViewerUrl(shown);'''
SHOWN_NEW = u'''    const shown=rows.slice(0,CAP);
    FILTER.shown=shown;   /* the rows the link was built for -- its traced outlines are theirs */
    vb.href=filterViewerUrl(shown);'''

CLICK_ANCHOR = u'''/* One segmentation layer per cell type, each its own colour, so a mixed result set is readable
   rather than one undifferentiated blob. */
function filterViewerUrl(rows){'''
CLICK = u'''/* THE MATCHED CELLS' TRACED OUTLINES, 2026-09-21 -- µJump's picker and core/tracedoutlines.js.
   The link above is written when the preview finishes, before a kind is picked, and reading one
   Drive file per outline on every preview would be wrong; so the outlines are read when the link is
   PRESSED, and only if a kind is picked. The tab is opened first, synchronously -- one opened after
   an await is a popup -- and sent to the finished view. Both ids of each row: a tracing on this
   page is filed with the cell body as its nucleusId and the c3 segment as its rootId. */
(function(){
  const vb=document.getElementById("filterViewer");
  if(!vb)return;
  vb.addEventListener("click",function(e){
    const sel=document.getElementById("filterOrganSeg");
    const want=sel&&sel.value;
    const rows=FILTER.shown||[];
    if(!want||!rows.length||typeof buildTracedOrganelleLayers!=="function"||!vb.href)return;
    e.preventDefault();
    const href=vb.href, label=vb.textContent;
    let win=null;
    try{ win=window.open("","_blank"); }catch(_e){}
    buildTracedOrganelleLayers(
      {nuc:rows.map(function(i){ return String(HSB[i]); }),
       root:rows.map(function(i){ return c3Id(i); })},
      want,function(msg){ vb.textContent=msg; })
    .catch(function(err){ console.warn("[hJump filter] traced outlines unavailable",err); return []; })
    .then(function(layers){
      vb.textContent=label;
      let url=href;
      if(layers.length){
        const k=href.indexOf("#!");
        const st=JSON.parse(decodeURIComponent(href.slice(k+2)));
        st.layers.push.apply(st.layers,layers);
        url=href.slice(0,k)+"#!"+encodeURIComponent(JSON.stringify(st));
      }
      if(win){ try{ win.opener=null; }catch(_e){} win.location.href=url; }
      else window.open(url,"_blank","noopener");
    });
  });
})();

''' + CLICK_ANCHOR

BULK = u'<script src="core/bulkorgan.js"></script>\n'

s = rd("hjump.html")
if TAG in s:
    print("hjump.html: already there")
else:
    for name, old, new in [
            (u"the picker, under the organelle filter", BOX, BOX + PICKER),
            (u"the link keeps its rows", SHOWN_OLD, SHOWN_NEW),
            (u"the click reads the outlines", CLICK_ANCHOR, CLICK),
            (u"the module", BULK, BULK + u'<!-- The traced-outline layer for "Open all in Neuroglancer", '
                                        u'shared with µJump since 2026-09-21. -->\n' + TAG + u'\n')]:
        n = s.count(old)
        assert n == 1, "%s: anchor found %d times" % (name, n)
        s = s.replace(old, new, 1)
        print("  ok: " + name)
    wr("hjump.html", s)
    print("hjump.html: picker, rows, click and tag")
