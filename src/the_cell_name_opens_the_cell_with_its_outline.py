# -*- coding: utf-8 -*-
u"""The cell's name opens the cell WITH its outline.                                      2026-09-24

Søren, with a screenshot of an arachnoid barrier cell whose panel reads "TRACED ON THIS CELL --
Whole cell · 675 µm³, 69 contours on 59 sections": "When the cell has a whole cell or nucleus
segmentation, it should load that when opening Neuroglancer by clicking the cell name."

celltypeLink() built an href off the cell's position and nothing else, so the ↗ beside the name
opened the segmentation alone -- the one view of that cell that leaves out the work he had just
finished on it. The outline was reachable from three other places on the page (the tracing card's
Neuroglancer button, the organelle list's "show the cell with all N", the filter's "Open all") and
not from the obvious one.

WHY THE IDS RIDE ON THE ANCHOR, rather than being read off CUR_NUCID when it is clicked. The same
link is drawn for the sub-cells of a merged detection, for a user-reported cell and for the
identification result -- the name on screen is not always the cell the panel is open on, and
reading the panel's current cell would attach one cell's outline to another cell's name. An anchor
given no ids is emitted exactly as it always was, so the three call sites that genuinely do not
know which cell they are naming keep the old behaviour rather than getting a wrong one.

ASKED BEFORE ANYTHING IS FETCHED. tracedKindHas() answers off the index that is already in memory
for the filter's counts, so a cell nobody has traced costs nothing at all: no request, no delay, and
the browser's own click goes through untouched -- including ctrl-click and middle-click, which are
left alone on every cell so "open in a background tab" keeps working.

THE TAB IS OPENED AT THE CLICK, before the outline is read, because a tab opened after an await is a
popup and browsers block it. This is the third place in the family that has had to learn that.

AND IF IT DOES NOT FIT: one cell is not the filter's twenty-five million characters, but a
hand-traced cell is large, so the length is measured against the same cap and the plain link is
opened rather than a blank tab, with the reason in the console. A cell that cannot be shown this way
is still shown; it is the outline that is dropped.

Check: celllinktracingcheck.js, written first; 6 of its 13 assertions failed before this went in.
Run: python3 src/the_cell_name_opens_the_cell_with_its_outline.py, then python3 src/build_stamps.py
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


# ── 1. the shared handler ──────────────────────────────────────────────────────────────────────
edit("core/tracedoutlines.js", [
 (u"a cell name that knows its cell opens with the outline",
  u'''var FILTER_ORGAN_SEG_FILLED=false;''',
  u'''/* ── THE CELL'S NAME OPENS THE CELL WITH ITS OUTLINE ────────────────  2026-09-24
   Søren: "When the cell has a whole cell or nucleus segmentation, it should load that when opening
   Neuroglancer by clicking the cell name."

   Delegated on the document rather than wired per anchor: these headlines are rewritten whenever a
   cell loads, a community identification wins, or a merged detection is expanded, and a listener
   attached to the anchor would be re-attached on each of those or quietly lost on one of them.

   An anchor opts in by carrying the cell's ids (class="ctlink", data-nuc, data-root). One that
   does not is left entirely alone -- see src/the_cell_name_opens_the_cell_with_its_outline.py for
   why that is not merely defensive. */
function tracedCellNameLayers(nucId, rootId){
  if (typeof tracedKindHas !== "function" || typeof buildTracedOrganelleLayers !== "function")
    return Promise.resolve([]);
  var wants = [];
  if (tracedKindHas("__traced_cell", nucId, rootId)) wants.push("__cells");
  if (tracedKindHas("__traced_nucleus", nucId, rootId)) wants.push("__nuclei");
  if (!wants.length) return Promise.resolve([]);
  /* One kind at a time and in series: buildTracedOrganelleLayers answers for one pick, and two
     Drive reads of one cell in parallel buy nothing worth the second connection. */
  var out = [];
  return wants.reduce(function(chain, w){
    return chain.then(function(){
      return buildTracedOrganelleLayers({ nuc: [String(nucId || "")], root: [String(rootId || "")] },
                                        w, function(){})
        .then(function(ls){ if (ls && ls.length) out.push.apply(out, ls); },
              function(e){ console.warn("[traced cell link] " + w + " unavailable", e); });
    });
  }, Promise.resolve()).then(function(){ return out; });
}
function tracedCellNameWire(){
  if (tracedCellNameWire.done || typeof document === "undefined") return;
  tracedCellNameWire.done = true;
  document.addEventListener("click", function(e){
    /* The browser's own shortcuts stay the browser's: ctrl/cmd-click and middle-click open the
       plain link in a background tab, which is what they are for. */
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = (e.target && e.target.closest) ? e.target.closest("a.ctlink") : null;
    if (!a || !a.href) return;
    var nuc = a.getAttribute("data-nuc") || "", root = a.getAttribute("data-root") || "";
    if (!nuc && !root) return;
    /* Asked of the index already in memory, so an untraced cell costs nothing: no request, no
       delay, and the anchor behaves exactly as it did before any of this existed. */
    if (typeof tracedKindHas !== "function") return;
    if (!tracedKindHas("__traced_cell", nuc, root) && !tracedKindHas("__traced_nucleus", nuc, root)) return;
    e.preventDefault();
    var href = a.href, win = null;
    try { win = window.open("", "_blank"); } catch (_e){}      // at the click, or it is a popup
    var ext = a.querySelector(".ext"), was = ext ? ext.innerHTML : "";
    if (ext) ext.innerHTML = "\\u2026";
    tracedCellNameLayers(nuc, root).then(function(layers){
      if (ext) ext.innerHTML = was;
      var url = href, k = href.indexOf("#!");
      if (layers.length && k >= 0){
        try {
          var st = JSON.parse(decodeURIComponent(href.slice(k + 2)));
          st.layers = (st.layers || []).concat(layers);
          var u2 = href.slice(0, k) + "#!" + encodeURIComponent(JSON.stringify(st));
          var cap = (typeof tracedLinkMax === "function") ? tracedLinkMax() : 2000000;
          if (u2.length <= cap) url = u2;
          else console.warn("[traced cell link] " + u2.length.toLocaleString() + " characters is past "
                            + "what a viewer link carries (" + cap.toLocaleString() + ") \\u2014 opened "
                            + "the cell without its outline.");
        } catch (_e){ console.warn("[traced cell link] could not read the link's own state", _e); }
      }
      if (win){ try { win.opener = null; } catch (_e){} win.location.href = url; }
      else window.open(url, "_blank", "noopener");
    });
  });
}
if (typeof document !== "undefined"){
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tracedCellNameWire);
  else tracedCellNameWire();
}
var FILTER_ORGAN_SEG_FILLED=false;'''),
])


# ── 2. the community identification's headline names its cell ──────────────────────────────────
edit("core/panel.js", [
 (u"the community name carries the cell's id",
  u'''              headEl.innerHTML=(typeof celltypeLink==="function"?celltypeLink(cellPos,escHtml(win.name)):escHtml(win.name))''',
  u'''              /* The ids go with the name so the ↗ can bring this cell's outline (2026-09-24);
                 loadCommunityReports is given the nucleus, not the root. */
              headEl.innerHTML=(typeof celltypeLink==="function"?celltypeLink(cellPos,escHtml(win.name),{nuc:nid,root:""}):escHtml(win.name))'''),
])


# ── 3. the three pages that draw a cell name ───────────────────────────────────────────────────
PAGE = [
 (u"celltypeLink can be told which cell it is naming",
  u'''function celltypeLink(pos,innerHtml){
  const url=pos?neuroglancerLinkForPos(pos):null;
  return url
    ?'<a href="'+url+'" target="_blank" rel="noopener" title="Open in Neuroglancer">'+innerHtml+' <span class="ext">&#8599;</span></a>'
    :innerHtml;
}''',
  u'''/* ── AND THE CELL'S OWN OUTLINE COMES WITH IT ────────────────────  2026-09-24
   Søren: "When the cell has a whole cell or nucleus segmentation, it should load that when opening
   Neuroglancer by clicking the cell name."

   `ids` is OPTIONAL and the third argument on purpose. This link is also drawn for the sub-cells of
   a merged detection, for a user-reported cell and for the identification result, and the name on
   screen is not always the cell the panel is open on -- so a call site that cannot say which cell
   it means says nothing, and gets exactly the link it got before. The handler that reads these is
   in core/tracedoutlines.js (tracedCellNameWire).
   See src/the_cell_name_opens_the_cell_with_its_outline.py. */
function celltypeLink(pos,innerHtml,ids){
  const url=pos?neuroglancerLinkForPos(pos):null;
  if(!url)return innerHtml;
  const mine=(ids&&(ids.nuc||ids.root))
    ?' class="ctlink" data-nuc="'+escHtml(ids.nuc||"")+'" data-root="'+escHtml(ids.root||"")+'"'
    :'';
  return '<a href="'+url+'"'+mine+' target="_blank" rel="noopener" title="Open in Neuroglancer">'+innerHtml+' <span class="ext">&#8599;</span></a>';
}'''),

 (u"the headline names its cell",
  u'''celltypeLink(pos,longName(ti.name))''',
  u'''celltypeLink(pos,longName(ti.name),{nuc:nid,root:root})'''),

 (u"...so does a verified identification",
  u'''celltypeLink(pos,longName(own.type))''',
  u'''celltypeLink(pos,longName(own.type),{nuc:nid,root:root})'''),

 (u"...and a merged detection, whose outline is filed against the detection",
  u'''celltypeLink(pos,escHtml(_sum))''',
  u'''celltypeLink(pos,escHtml(_sum),{nuc:nid,root:root})'''),
]
for _pg in ("ujump.html", "djump.html", "pjump.html"):
    print("  " + _pg)
    edit(_pg, PAGE)
