# -*- coding: utf-8 -*-
u"""The traced-outline layer in Filter and show moves into core/tracedoutlines.js, and δJump and
πJump get it.                                                                        2026-09-21

Stage I of the port. µJump's "Traced organelle outlines" picker (2026-09-18, see
claude/the-filtered-cells-bring-their-outlines.md): pick a kind, or all, and "Open all matches"
brings the hand-traced outlines of the matched cells into the 3D view, one layer per kind.

── MOVED, NOT RETYPED ─────────────────────────────────────────────────────────────

µJump's two functions and the picker's wiring are cut out of its filter closure and put in the
module with three changes, each in the table below:

  1. buildTracedOrganelleLayers takes the matched cells' ids — {nuc:[...], root:[...]} — rather
     than the matches themselves. Reading an id off a match is each filter's own business
     (rowNucId/rowRootId live in µJump's closure), so each caller now does it and says so.
  2. every read names the page's dataset, for the reason src/every_read_names_its_dataset.py
     gives: on a tool that does not wrap fetch, a bare `?tracings=1` reads µJump's sheet.
  3. the picker wires itself when the page has one, on DOMContentLoaded.

organoutlinecheck.js was written first and run on µJump before and after: identical.

── δJUMP AND πJUMP ────────────────────────────────────────────────────────────────

Both carry µJump's Filter-and-show, down to rowNucId/rowRootId and the "Open all matches" handler,
so the port is µJump's own three pieces: the picker markup (read out of ujump.html), the call, and
the push onto the state. Their fetch wrappers already add ds; the module adds it too and the
wrapper sees it there.

ηJump, βJump and λJump are NOT in this change — see the stage doc: ηJump's "Open all" is a link
built synchronously, and βJump and λJump have no "Open all matches" view at all.

Run: python3 src/tracedoutlines_extraction.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOD = os.path.join(HERE, "core", "tracedoutlines.js")


def rd(rel):
    return io.open(os.path.join(HERE, rel), encoding="utf-8").read()


def wr(rel, s):
    io.open(os.path.join(HERE, rel), "w", encoding="utf-8").write(s)


u = rd("ujump.html")
TAG = u'<script src="core/tracedoutlines.js"></script>'

# ── 1. cut µJump's block ──────────────────────────────────────────────────────────────────────
START = u"  /* ── THE FILTERED CELLS BRING THEIR OUTLINES ─"
END = u"  const VASC_URL_WARN_LENGTH=Math.round(1.95*1024*1024);"
PICK_START = u"<!-- THE OTHER HALF OF AN ORGANELLE."
if TAG in u and os.path.exists(MOD):
    print("µJump already extracted")
else:
    i = u.index(START)
    j = u.index(END, i)
    block = u[i:j]
    assert u"async function buildTracedOrganelleLayers(matches,want,say){" in block
    assert u"async function fillOrganSegKinds(){" in block

    SUBS = [
        (u"it takes ids, not matches",
         u'''  async function buildTracedOrganelleLayers(matches,want,say){''',
         u'''  async function buildTracedOrganelleLayers(ids,want,say){'''),
        (u"...so the caller decides what a match's ids are",
         u'''    (matches||[]).forEach(function(m){
      const nid=rowNucId(m.row);if(nid)nucSet.add(String(nid));
      const rid=rowRootId(m.row);if(rid)rootSet.add(String(rid));
    });''',
         u'''    ((ids&&ids.nuc)||[]).forEach(function(n){if(n)nucSet.add(String(n));});
    ((ids&&ids.root)||[]).forEach(function(r){if(r&&r!=="0")rootSet.add(String(r));});'''),
        (u"the picker's list is this dataset's",
         u'''      const r=await fetch(REPORT_ENDPOINT+"?tracings=1");
      const d=await r.json();
      const n={};''',
         u'''      const r=await fetch(REPORT_ENDPOINT+"?tracings=1"+tracedOutlinesDsQS());
      const d=await r.json();
      const n={};'''),
        (u"...and so is the index the layers are chosen from",
         u'''      const r=await fetch(REPORT_ENDPOINT+"?tracings=1");
      const d=await r.json();
      index=(d&&d.tracings)||[];''',
         u'''      const r=await fetch(REPORT_ENDPOINT+"?tracings=1"+tracedOutlinesDsQS());
      const d=await r.json();
      index=(d&&d.tracings)||[];'''),
        (u"...and each outline",
         u'''        const r=await fetch(REPORT_ENDPOINT+"?tracings=1&structureId="+encodeURIComponent(mine[i].structureId));''',
         u'''        const r=await fetch(REPORT_ENDPOINT+"?tracings=1&structureId="+encodeURIComponent(mine[i].structureId)
                            +tracedOutlinesDsQS());'''),
        (u"the picker wires itself",
         u'''  (function(){
    const sel=document.getElementById("filterOrganSeg");
    if(!sel)return;
    ["focus","mousedown"].forEach(function(ev){ sel.addEventListener(ev,fillOrganSegKinds); });
  })();''',
         u'''  function tracedOutlinesWire(){
    const sel=document.getElementById("filterOrganSeg");
    if(!sel||sel.dataset.wired)return;
    sel.dataset.wired="1";
    ["focus","mousedown"].forEach(function(ev){ sel.addEventListener(ev,fillOrganSegKinds); });
  }'''),
    ]
    for name, old, new in SUBS:
        n = block.count(old)
        assert n == 1, "%s: %d" % (name, n)
        block = block.replace(old, new, 1)
        print("  sub: " + name)
    assert u"rowNucId" not in block and u"rowRootId" not in block
    body = u"\n".join((l[2:] if l.startswith(u"  ") else l) for l in block.rstrip().split(u"\n"))

    MODULE = u'''/* core/tracedoutlines.js — the matched cells' hand-traced outlines, in "Open all matches".  2026-09-21

   Moved out of ujump.html's Filter-and-show closure, where it was built on 2026-09-18 (its own
   notes follow, kept). organoutlinecheck.js was written first and prints the same on both sides.

   WHAT A HOST DOES
     markup   a <select id="filterOrganSeg"> with options "" (None — points only) and "__all";
              the module fills in the kinds lazily, the first time somebody reaches for it.
     call     const layers = await buildTracedOrganelleLayers({nuc:[...], root:[...]}, sel.value, say);
              with the MATCHED cells' ids — both, because a tracing is filed against whichever
              the tracer had — then push the layers onto the state it opens.
   Needs REPORT_ENDPOINT, core/tracing.js (rowsToStructures) and, for the kind labels,
   core/ontology.js's ORGANELLE_KIND_BY_VALUE. Reads name UJ.cfg.backend.ds. */
var UJ = UJ || {};
function tracedOutlinesDsQS(){
  try { if (UJ && UJ.cfg && UJ.cfg.backend && UJ.cfg.backend.ds)
          return "&ds=" + encodeURIComponent(UJ.cfg.backend.ds); } catch (_e){}
  return "";
}
''' + body + u'''
if (typeof document !== "undefined"){
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tracedOutlinesWire);
  else tracedOutlinesWire();
}
'''
    io.open(MOD, "w", encoding="utf-8").write(MODULE)
    print("  wrote core/tracedoutlines.js")

    u = u[:i] + u[j:]
    CALL_OLD = u'''    const organSegLayers=await buildTracedOrganelleLayers(lastResult.matches,'''
    CALL_NEW = u'''    /* The matched cells' two ids, by this filter's own rule for a row. The outline code is in
       core/tracedoutlines.js since 2026-09-21 and takes ids, so a filter with other rows can call it. */
    const organSegLayers=await buildTracedOrganelleLayers(
      {nuc:lastResult.matches.map(function(m){return rowNucId(m.row);}),
       root:lastResult.matches.map(function(m){return rowRootId(m.row);})},'''
    assert u.count(CALL_OLD) == 1
    u = u.replace(CALL_OLD, CALL_NEW, 1)
    T_OLD = u'<script src="core/bulkorgan.js"></script>\n'
    T_NEW = (u'<script src="core/bulkorgan.js"></script>\n'
             u'<!-- The traced-outline layer for "Open all matches", extracted from this file 2026-09-21. -->\n'
             + TAG + u'\n')
    assert u.count(T_OLD) == 1
    u = u.replace(T_OLD, T_NEW, 1)
    wr("ujump.html", u)
    print("  ujump.html: block out, call passes ids, tag in")

# ── 2. δJump and πJump ────────────────────────────────────────────────────────────────────────
u = rd("ujump.html")
pi = u.index(PICK_START)
pj = u.index(u"</select>\n</div>\n", pi) + len(u"</select>\n</div>\n")
PICKER = u[pi:pj]
assert u'id="filterOrganSeg"' in PICKER and PICKER.count(u"<option") == 2

BOX = (u'<div id="filterOrganellesBox" style="max-height:260px;overflow-y:auto;border:1px solid '
       u'var(--line);border-radius:7px;padding:8px 10px;margin-top:8px"></div>\n')

H_OLD = u'''    if(centVecOn||cilVecOn||orgPointKinds.length){viewAllBtn.textContent="Fetching organelle reports…";window.ORG_MAP=await fetchAllOrganelles();}else{window.ORG_MAP={};}
    viewAllBtn.textContent="Fetching proposed segmentation IDs…";'''
H_NEW = u'''    if(centVecOn||cilVecOn||orgPointKinds.length){viewAllBtn.textContent="Fetching organelle reports…";window.ORG_MAP=await fetchAllOrganelles();}else{window.ORG_MAP={};}
    /* THE MATCHED CELLS' TRACED OUTLINES, 2026-09-21 — µJump's, from core/tracedoutlines.js:
       one layer per kind, pushed onto the state after it is built, so nothing about which cells
       matched or what the Excel holds is touched. Both ids, by this filter's own rule for a row. */
    const organSegSel=document.getElementById("filterOrganSeg");
    const organSegLayers=(typeof buildTracedOrganelleLayers==="function")
      ? await buildTracedOrganelleLayers(
          {nuc:lastResult.matches.map(function(m){return rowNucId(m.row);}),
           root:lastResult.matches.map(function(m){return rowRootId(m.row);})},
          organSegSel&&organSegSel.value,function(msg){viewAllBtn.textContent=msg;})
      : [];
    viewAllBtn.textContent="Fetching proposed segmentation IDs…";'''
P_OLD = u'''    if(vascTraceLayers.length)state.layers.push(...vascTraceLayers);
    const url=document.getElementById("viewer").value+"#!"+encodeURIComponent(JSON.stringify(state));'''
P_NEW = u'''    if(vascTraceLayers.length)state.layers.push(...vascTraceLayers);
    if(organSegLayers.length)state.layers.push(...organSegLayers);
    const url=document.getElementById("viewer").value+"#!"+encodeURIComponent(JSON.stringify(state));'''

for page in ["djump.html", "pjump.html"]:
    s = rd(page)
    if TAG in s:
        print(page + ": already there")
        continue
    for old, new in [(BOX, BOX + PICKER), (H_OLD, H_NEW), (P_OLD, P_NEW),
                     (u'<script src="core/bulkorgan.js"></script>\n',
                      u'<script src="core/bulkorgan.js"></script>\n'
                      u'<!-- The traced-outline layer for "Open all matches", shared with µJump since 2026-09-21. -->\n'
                      + TAG + u'\n')]:
        n = s.count(old)
        assert n == 1, "%s: anchor found %d times: %r" % (page, n, old[:60])
        s = s.replace(old, new, 1)
    wr(page, s)
    print(page + ": picker, call, push and tag")

# ── 3. πJump never loaded core/tracing.js, which turns a tracing's rows into rings ───────────
# Found by organoutlinecheck.js: both outlines were READ on πJump and neither was DRAWN, because
# buildTracedOrganelleLayers parses each one with UJ.tracing.rowsToStructures inside a try, and
# on a page without the module that is a quiet empty list. The module is pure parsing; it goes
# in beside the reader πJump gained for the bulk card.
s = rd("pjump.html")
TR = u'<script src="core/tracing.js"></script>'
if TR in s:
    print("pjump.html: core/tracing.js already loads")
else:
    OLD = u'<script src="core/segread.js"></script>\n'
    assert s.count(OLD) == 1
    s = s.replace(OLD, OLD + u'<!-- Reads a tracing\'s rows into rings, for the traced-outline layer in "Open all matches". -->\n'
                  + TR + u'\n', 1)
    wr("pjump.html", s)
    print("pjump.html: core/tracing.js loads")
