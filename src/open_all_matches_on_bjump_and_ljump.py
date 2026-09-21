# -*- coding: utf-8 -*-
u"""βJump and λJump get "Open all matches in Neuroglancer (3D)", with the traced outlines.   2026-09-21

Søren, on these two having no such view, so that the Filter-and-show traced-outline layer had
nowhere to go: "Yes, build that."

What each page gains, in the same place µJump has it:

  * under the organelle filter, µJump's "Traced organelle outlines" picker, read out of ujump.html;
  * under Preview / Download, the button, disabled until a preview has matches and again whenever a
    filter changes (the picker does not count as a filter: it changes the view, not the matches);
  * the click: the page's own state builder, core/openall.js's matchesViewState, then
    tracedOutlinesOpen, which adds the outlines when a kind is picked.

The view (see core/openall.js's header for why points): the page's EM, a point on every matched
nucleus with one layer per community identity, the region boxes if any, framed to fit. βJump adds
its two segmentations, each matched segment in its identity's colour; λJump has none.

Outlines are looked up by the ids a tracing on each page is filed under -- the nucleus number
(BID) on both, and on βJump the cell's segment (BSEG), which is what its card's root box holds.

Run: python3 src/open_all_matches_on_bjump_and_ljump.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rd(rel):
    return io.open(os.path.join(HERE, rel), encoding="utf-8").read()


def wr(rel, s):
    io.open(os.path.join(HERE, rel), "w", encoding="utf-8").write(s)


u = rd("ujump.html")
pi = u.index(u"<!-- THE OTHER HALF OF AN ORGANELLE.")
pj = u.index(u"</select>\n</div>\n", pi) + len(u"</select>\n</div>\n")
PICKER = u[pi:pj]
assert u'id="filterOrganSeg"' in PICKER and PICKER.count(u"<option") == 2
PICKER = PICKER.replace(u"The outlines live in Drive and are read one file each, so this costs a moment "
                        u"per outline and is capped; the points above cost nothing extra.",
                        u"The outlines live in Drive and are read one file each, so this costs a moment "
                        u"per outline and is capped.")
assert u"points above" not in PICKER

BOX = u'<div id="fOrganellesBox"></div>\n</div>\n'

BUTTONS_OLD = u'''<button class="idbtn" id="filterDownload" disabled title="Click &quot;Preview matches&quot; first" style="flex:1">Download as Excel</button>
</div>
'''
BUTTON_TITLE = {
    "bjump.html": u"Opens a zoomed-out 3D view sized to fit every matching nucleus: a point on each, one "
                  u"colour-coded layer per community identity, and each one&rsquo;s segment in the same colour "
                  u"where the segmentation has it (it covers about half of this block). Region boxes and any "
                  u"traced organelle outlines picked above come as extra layers.",
    "ljump.html": u"Opens a zoomed-out 3D view sized to fit every matching nucleus: a point on each, one "
                  u"colour-coded layer per community identity, over the EM. Lee16 has no segmentation, so "
                  u"the points are the cells. Region boxes and any traced organelle outlines picked above "
                  u"come as extra layers.",
}

INVALIDATE_OLD = u'''    dlBtn.title="Click \\"Preview matches\\" first";
    statusEl.textContent="";'''
INVALIDATE_NEW = u'''    dlBtn.title="Click \\"Preview matches\\" first";
    const vab=document.getElementById("filterViewerAll"); if(vab)vab.disabled=true;
    statusEl.textContent="";'''
ENABLE_OLD = u'''    dlBtn.title=n===0?"No matches to download":"";
    UJ.stepthrough.initStepThrough(lastMatches);'''
ENABLE_NEW = u'''    dlBtn.title=n===0?"No matches to download":"";
    const vab=document.getElementById("filterViewerAll"); if(vab)vab.disabled=n===0;
    UJ.stepthrough.initStepThrough(lastMatches);'''
SKIP_OLD = u'''      if(el===runBtn||el===dlBtn)return;'''
SKIP_NEW = u'''      /* The outline picker changes what the view SHOWS, not which cells match. */
      if(el===runBtn||el===dlBtn||el.id==="filterOrganSeg")return;'''
CLICK_ANCHOR = u'''  runBtn.addEventListener("click",runPreview);
'''
CLICK = {
    "bjump.html": u'''  runBtn.addEventListener("click",runPreview);
  /* OPEN ALL MATCHES IN NEUROGLANCER (3D), 2026-09-21 -- see core/openall.js. The segments are the
     ids this page's own single-cell view selects, each in the layer of the volume it came from. */
  (function(){
    const vab=document.getElementById("filterViewerAll");
    if(!vab||typeof matchesViewState!=="function")return;
    vab.addEventListener("click",function(){
      if(!lastMatches||!lastMatches.length||vab.dataset.busy)return;
      const rows=lastMatches.map(function(m){return m.row.i;});
      const V=UJ.cfg.viewer;
      const state=matchesViewState({
        res:UJ.cfg.res, rows:rows, noun:"nuclei",
        posOf:function(i){return [BX[i],BY[i],BZ[i]];},
        groupOf:function(i){return bjumpIdentityOf(i);},
        images:[{type:"image",source:V.em,tab:"source",name:"EM (CLAHE)"},
                {type:"image",source:V.emSecgan,tab:"source",name:"EM (SECGAN 16nm)",visible:false}],
        segs:[{source:V.seg,name:"Segmentation (SECGAN 16nm)",
               idOf:function(i){return BSRC[i]===1&&BSEG[i]?String(BSEG[i]):"";}},
              {source:V.seg32,name:"Segmentation (32nm)",
               idOf:function(i){return BSRC[i]===2&&BSEG[i]?String(BSEG[i]):"";}}],
        boxes:BJ_REGION?BJ_REGION.getBoxesNM():[], bg:ngBgColor()});
      vab.dataset.busy="1";
      tracedOutlinesOpen(V.base,state,
        {nuc:rows.map(function(i){return String(BID[i]);}),
         root:rows.map(function(i){return BSEG[i]?String(BSEG[i]):"";})},vab)
        .then(function(){delete vab.dataset.busy;},function(){delete vab.dataset.busy;});
    });
  })();
''',
    "ljump.html": u'''  runBtn.addEventListener("click",runPreview);
  /* OPEN ALL MATCHES IN NEUROGLANCER (3D), 2026-09-21 -- see core/openall.js. Lee16 has no
     segmentation, so the points are the cells; the EM carries the window this page opens it at. */
  (function(){
    const vab=document.getElementById("filterViewerAll");
    if(!vab||typeof matchesViewState!=="function")return;
    vab.addEventListener("click",function(){
      if(!lastMatches||!lastMatches.length||vab.dataset.busy)return;
      const rows=lastMatches.map(function(m){return m.row.i;});
      const V=UJ.cfg.viewer;
      const state=matchesViewState({
        res:UJ.cfg.res, rows:rows, noun:"nuclei",
        posOf:function(i){return [BX[i],BY[i],BZ[i]];},
        groupOf:function(i){return ljumpIdentityOf(i);},
        images:[{type:"image",source:V.em,tab:"rendering",name:"lee16",shaderControls:EM_SHADER_CONTROLS}],
        boxes:LJ_REGION?LJ_REGION.getBoxesNM():[], bg:ngBgColor()});
      vab.dataset.busy="1";
      tracedOutlinesOpen(V.base,state,
        {nuc:rows.map(function(i){return BID[i]?String(BID[i]):"";}), root:[]},vab)
        .then(function(){delete vab.dataset.busy;},function(){delete vab.dataset.busy;});
    });
  })();
''',
}

TAGS_ANCHOR = u'<script src="core/tracingcard.js"></script>\n'
TAGS = (u'<!-- "Open all matches in Neuroglancer (3D)" and its traced-outline layer, 2026-09-21. -->\n'
        u'<script src="core/tracedoutlines.js"></script>\n'
        u'<script src="core/openall.js"></script>\n')

for page in ["bjump.html", "ljump.html"]:
    s = rd(page)
    if u'id="filterViewerAll"' in s:
        print(page + ": already there")
        continue
    BUTTONS_NEW = BUTTONS_OLD + (
        u'<div class="row" style="margin-top:8px;gap:10px">\n'
        u'<button class="idbtn" id="filterViewerAll" disabled title="Click &quot;Preview matches&quot; first &mdash; '
        + BUTTON_TITLE[page] + u'" style="flex:1">Open all matches in Neuroglancer (3D)</button>\n'
        u'</div>\n')
    for name, old, new in [
            (u"the picker", BOX, BOX + PICKER),
            (u"the button", BUTTONS_OLD, BUTTONS_NEW),
            (u"disabled when a filter changes", INVALIDATE_OLD, INVALIDATE_NEW),
            (u"enabled by a preview with matches", ENABLE_OLD, ENABLE_NEW),
            (u"the picker is not a filter", SKIP_OLD, SKIP_NEW),
            (u"the click", CLICK_ANCHOR, CLICK[page]),
            (u"the modules", TAGS_ANCHOR, TAGS_ANCHOR + TAGS)]:
        n = s.count(old)
        assert n == 1, "%s / %s: anchor found %d times" % (page, name, n)
        s = s.replace(old, new, 1)
        print("  %s: %s" % (page, name))
    assert s.count(u"core/tracedoutlines.js\"") == 1, page
    wr(page, s)
