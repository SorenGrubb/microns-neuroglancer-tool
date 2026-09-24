# -*- coding: utf-8 -*-
u"""The cell name opens where its outline fits.                                           2026-09-24

Søren, clicking the name of a pia mater fibroblast whose whole cell is 479 contours on 243 sections:

    ✗ Not one of these 1 outlines fits a viewer link on its own — a viewer link cannot be opened
      past 2,097,152 characters. Pick one kind rather than all, or narrow the filter. A whole cell
      is a hundred times the contours of a lysosome. This viewer cannot read polyline annotations,
      so every edge of every contour is its own line and these outlines cost about four times what
      they need to — Spelunker and neuroglancer-demo read polylines, and the same cells fit there.

THREE THINGS WRONG WITH THAT, and the last one is the real one.

  IT IS THE FILTER'S SENTENCE. "Pick one kind rather than all, or narrow the filter" on a click that
  used no filter, about a cell that has exactly one outline. buildTracedOrganelleLayers was written
  for "Open all matches" and the cell-name link borrowed it whole, including its voice.

  IT IS THE FILTER'S BUDGET. FILTER_TRACE_BUDGET is 1,200,000 characters, deliberately short of the
  2,097,152 a link can carry, because a filter view has many cells to fit and a base state to leave
  room for. One cell has neither problem, and was being refused against a limit that is not its own.

  AND THE ANSWER WAS ALREADY IN THE SENTENCE. Measured on that fibroblast: 418,811 characters as
  polylines, 1,790,053 as lines -- the four-to-one the message itself names. µJump's viewer reads no
  polylines, so it was the long form that did not fit. Spelunker reads them, and the tracing card
  has opened tracings there since src/too_big_here_opens_where_it_fits.py, for exactly this reason:
  "Can't you just measure when it will fail to open and then open with Spelunker instead?"

SO THE MEASUREMENT IS ACTED ON. The link is composed for the page's own viewer first and opened
there if it fits, which is every ordinary cell and costs nothing. When it does not fit and the
viewer cannot read polylines, the outline is read again as polylines against a viewer that can, and
that is where the tab goes -- with a sentence saying where it went and why, because a tab that
quietly lands on a different host is worse than one that explains itself. The viewer setting is not
changed: one link went elsewhere because it had to.

WHEN EVEN POLYLINES DO NOT FIT, the cell opens without its outline rather than into a tab the
browser will refuse, and the message says the tracing card's own Neuroglancer button will hand over
the state to paste. That is the honest end of the road, and it is the one case where nothing can be
done inside a URL.

THE SECOND READ IS REAL and is only paid on this path: buildTracedOrganelleLayers reads the contour
files to build annotations, so asking for the other shape asks again. Every ordinary cell fits on
the first try and reads once.

Check: celllinktracingcheck.js, extended first; 3 of its new assertions failed before this went in.
Run: python3 src/the_cell_name_opens_where_the_outline_fits.py, then python3 src/build_stamps.py,
then python3 wjump-build/build_wjump.py
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


edit("core/tracedoutlines.js", [
 # ── 1. the builder can be asked for a shape, and told to keep quiet ───────────────────────────
 (u"the builder takes a viewer base",
  u"""      const a=UJ.tracing.ringAnnotations(g.rings||[],"to"+gi);""",
  u"""      /* opts.base names the viewer the annotations are FOR, which is what decides their shape:
         one polyline per contour where the viewer reads them, one line per edge where it does not.
         Absent, it is the page's own viewer, exactly as before (2026-09-24). */
      const a=UJ.tracing.ringAnnotations(g.rings||[],"to"+gi,
                                         (opts&&opts.base)?{base:opts.base}:undefined);"""),

 (u"...for the reads cap too",
  u"""  if(capped&&typeof showSubmitToast==="function")""",
  u"""  if(capped&&!(opts&&opts.quiet)&&typeof showSubmitToast==="function")"""),

 # ── 2. one cell is measured against the link, not against the filter's share of it ────────────
 (u"one cell gets the whole link to itself",
  u"""function tracedCellNameLayers(nucId, rootId){
  if (typeof tracedKindHas !== "function" || typeof buildTracedOrganelleLayers !== "function")
    return Promise.resolve([]);
  var wants = [];
  if (tracedKindHas("__traced_cell", nucId, rootId)) wants.push("__cells");
  if (tracedKindHas("__traced_nucleus", nucId, rootId)) wants.push("__nuclei");
  if (!wants.length) return Promise.resolve([]);""",
  u"""/* A viewer that reads polylines, preferring one the page already offers him, so a link that has
   to move lands somewhere he has chosen before. */
function tracedPolylineViewer(){
  try {
    if (!UJ.tracing || !UJ.tracing.viewerTakesPolylines) return "";
    var el = document.getElementById("viewer");
    var hit = el && [].filter.call(el.options, function(o){
      return UJ.tracing.viewerTakesPolylines(o.value); })[0];
    if (hit) return hit.value;
    return "https://spelunker.cave-explorer.org/";
  } catch (_e){ return ""; }
}
function tracedCellNameLayers(nucId, rootId, base){
  if (typeof tracedKindHas !== "function" || typeof buildTracedOrganelleLayers !== "function")
    return Promise.resolve([]);
  var wants = [];
  if (tracedKindHas("__traced_cell", nucId, rootId)) wants.push("__cells");
  if (tracedKindHas("__traced_nucleus", nucId, rootId)) wants.push("__nuclei");
  if (!wants.length) return Promise.resolve([]);"""),

 (u"...and is not refused against the filter's budget",
  u"""      return buildTracedOrganelleLayers({ nuc: [String(nucId || "")], root: [String(rootId || "")] },
                                        w, function(){})""",
  u"""      /* THE URL DECIDES, not a budget in here — deciding "it does not fit" before anything has
         been composed takes the decision away from the caller, and the caller is the one that knows
         the link can go somewhere else (2026-09-24). Since all_of_them_or_the_json.py the builder
         has no budget at all; `quiet` is still wanted, because the reads cap speaks in the filter's
         voice. */
      return buildTracedOrganelleLayers({ nuc: [String(nucId || "")], root: [String(rootId || "")] },
                                        w, function(){},
                                        { quiet: true, base: base || "" })"""),

 # ── 3. and the click opens where it fits ──────────────────────────────────────────────────────
 (u"the click opens where the outline fits",
  u"""    ready.then(function(){ return tracedCellNameLayers(nuc, root); }).then(function(layers){
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
    });""",
  u"""    var cap = (typeof tracedLinkMax === "function") ? tracedLinkMax() : 2097152;
    var k = href.indexOf("#!");
    var hostOf = function(u){ try { return new URL(u).host; } catch (_e){ return u; } };
    /* The link's own state with these layers added, for whichever viewer is named. */
    var compose = function(baseStr, layers){
      if (k < 0 || !layers || !layers.length) return "";
      try {
        var st = JSON.parse(decodeURIComponent(href.slice(k + 2)));
        st.layers = (st.layers || []).concat(layers);
        return (baseStr || href.slice(0, k)) + "#!" + encodeURIComponent(JSON.stringify(st));
      } catch (_e){ return ""; }
    };
    var go = function(url){
      if (ext) ext.innerHTML = was;
      if (win){ try { win.opener = null; } catch (_e){} win.location.href = url; }
      else window.open(url, "_blank", "noopener");
    };
    ready.then(function(){ return tracedCellNameLayers(nuc, root); }).then(function(layers){
      var here = compose("", layers);
      if (!here) return go(href);                       // nothing traced, or no state to add to
      if (here.length <= cap) return go(here);          // the ordinary case, and it costs nothing
      /* \u2500\u2500 IT DOES NOT FIT HERE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  2026-09-24
         S\u00f8ren's pia mater fibroblast: 418,811 characters as polylines, 1,790,053 as lines. This
         viewer reads no polylines, so it is the long form that will not go. The same measurement
         that says so says where it will. */
      var alt = (UJ.tracing && UJ.tracing.viewerTakesPolylines
                 && !UJ.tracing.viewerTakesPolylines()) ? tracedPolylineViewer() : "";
      if (!alt) return said(href, here.length, 0);
      if (ext) ext.innerHTML = "\\u2026";
      /* Read again, because the shape is decided while the annotations are built. Only on this
         path; every cell that fits read its contours once. */
      return tracedCellNameLayers(nuc, root, alt).then(function(pl){
        var there = compose(alt, pl);
        if (!there || there.length > cap) return said(href, here.length, there ? there.length : 0);
        if (typeof showSubmitToast === "function")
          showSubmitToast(true, "Too big for " + hostOf(href) + " as line annotations ("
            + Math.round(here.length / 1000) + "k; a tab cannot be opened past "
            + cap.toLocaleString() + "), so this cell opened in " + hostOf(alt) + " as polylines, "
            + "where it is " + Math.round(there.length / 1000) + "k. Nothing was left out, and your "
            + "viewer setting is unchanged \\u2014 this one link went elsewhere because it had to.");
        go(there);
      }, function(){ said(href, here.length, 0); });
    }, function(){ go(href); });
    /* The end of the road: the cell opens, the outline does not, and the way to see it is the
       tracing card's own button, which hands over the state instead of a URL. */
    function said(url, hereLen, thereLen){
      if (typeof showSubmitToast === "function")
        showSubmitToast(false, "This cell's outline is " + Math.round(hereLen / 1000)
          + "k of link" + (thereLen ? " (" + Math.round(thereLen / 1000) + "k even as polylines)" : "")
          + ", and a tab cannot be opened past " + cap.toLocaleString() + ", so the cell opened "
          + "without it. Open the tracing in \\u00b5Jump's tracing card and use its Neuroglancer "
          + "button \\u2014 that hands you the state to paste, which has no length limit.");
      go(url);
    }"""),
])
