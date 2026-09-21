# -*- coding: utf-8 -*-
u"""A tracing opened in Neuroglancer shows the whole cell: its root ID and the community's.   2026-09-21

Søren, with two screenshots of "Lysosome 6": "when I show the segmented organelle in Neuroglancer,
it only shows with the default root ID, not with the community reported root IDs. This should be
changed."

A cell the segmentation split is its root ID plus the root IDs people have proposed for its nucleus
-- the list the 3D model, the PowerPoint and the volume already combine (fetchExtraRootIdsFor, read
from ?rootIds=<nucleus>, filtered to this segmentation). The tracing card's viewer link selected the
tracing's one root and nothing else, and the pad's "show the segmentation" painted the same one.

  tracingExtraRootsFor(nuc, root)   the proposed root IDs, from the host (UJ.cfg.tracing.extraRootsFor)
                                    or the page's own fetchExtraRootIdsFor; cached per nucleus for the
                                    session; at most 5 s -- a slow backend delays the view, it never
                                    stops it.
  tracingViewerOpen                 opens its tab FIRST (a tab opened after an await is a blocked
                                    popup), reads the proposed IDs, adds them to the cell layer, then
                                    sends the tab there. A tracing with a nucleus and no root shows the
                                    cell from the proposed IDs alone.
  padSegOverlay                     paints them with the root, as rootAlso.

βJump and ηJump keep proposals too, under their own functions and segmentation types; each page's
UJ.cfg.tracing now names its reader (extraRootsFor): βJump's bjumpExtraRootIdsFor (secgan16), ηJump's
?rootIds= read filtered to c3. δJump has no cell segmentation in the viewer and πJump no tracing
card; λJump has no segmentation, χJump's cell is its assembly (cellIdsFor), ωJump has no proposals --
all unchanged.

ONE CELL, ONE COLOUR. Where proposals are added, the root and every proposal are pinned to one colour
(#ff3b3b, βJump's "this nucleus" colour since 2026-09-09, when Søren asked that proposed root IDs be
"the same color as the original one"): Neuroglancer hashes each id to its own colour otherwise, and
one cell in four colours reads as four cells.

Run: python3 src/the_viewer_shows_the_whole_cell.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    p = os.path.join(HERE, rel); s = io.open(p, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s / %s: %d" % (rel, name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(p, "w", encoding="utf-8").write(s)


edit("core/tracingcard.js", [
 (u"the proposed root IDs, read once per nucleus",
  u'''function tracingShowCellIn(st, root, nuc){''',
  u'''/* ── THE COMMUNITY'S ROOT IDS FOR THIS NUCLEUS ─────────────────────────────  2026-09-21
   Søren: "when I show the segmented organelle in Neuroglancer, it only shows with the default root
   ID, not with the community reported root IDs." The same list the 3D model and the volume combine:
   the host's extraRootsFor, else the page's own fetchExtraRootIdsFor (µJump, δJump, πJump), else
   nothing. Cached per nucleus for the session, and never waited on for more than 5 s. */
var TRACING_EXTRA_ROOTS = {};
function tracingExtraRootsFor(nuc, root){
  nuc = String(nuc || ""); root = String(root || "");
  if (!nuc) return Promise.resolve([]);
  var f = (UJ.cfg && UJ.cfg.tracing && UJ.cfg.tracing.extraRootsFor)
       || (typeof fetchExtraRootIdsFor === "function" ? fetchExtraRootIdsFor : null);
  if (!f) return Promise.resolve([]);
  var key = nuc + "|" + root;
  if (!TRACING_EXTRA_ROOTS[key]){
    TRACING_EXTRA_ROOTS[key] = Promise.resolve()
      .then(function(){ return f(nuc, root); })
      .then(function(l){ return (l || []).map(String).filter(function(x){ return x && x !== "0" && x !== root; }); },
            function(){ delete TRACING_EXTRA_ROOTS[key]; return []; });
  }
  var timeout = new Promise(function(res){ setTimeout(function(){ res(null); }, 5000); });
  return Promise.race([TRACING_EXTRA_ROOTS[key], timeout]).then(function(l){
    if (l === null){ delete TRACING_EXTRA_ROOTS[key]; return []; }   /* try again next time */
    return l;
  });
}
/* The proposed root IDs onto a state's cell layer, after the root it already selects. */
function tracingAddRootsTo(st, extra){
  if (!extra || !extra.length) return false;
  var isNuc = function(l){ return /nucle/i.test(String(l.name || "") + " " + String(l.source || "")); };
  var cell = (st.layers || []).filter(function(l){ return l && l.type === "segmentation" && !isNuc(l); })[0];
  if (!cell){
    cell = { type: "segmentation", source: tracingSources().seg, tab: "source", name: "segmentation",
             notSelectedAlpha: 0.05, objectAlpha: 0.35 };
    st.layers.push(cell);
  }
  cell.segments = (cell.segments || []).slice();
  extra.forEach(function(x){ if (cell.segments.indexOf(x) < 0) cell.segments.push(x); });
  if (cell.objectAlpha == null) cell.objectAlpha = 0.35;
  /* One cell, one colour -- see this change's header. */
  cell.segmentColors = Object.assign({}, cell.segmentColors || {});
  cell.segments.forEach(function(x){ cell.segmentColors[x] = "#ff3b3b"; });
  return true;
}
function tracingShowCellIn(st, root, nuc){'''),
 (u"the viewer opens its tab first, then adds them",
  u'''  window.open(url, "_blank", "noopener");
  const nStr = structs.length + " structure" + (structs.length === 1 ? "" : "s");
  const cellStr = shown''',
  u'''  /* THE WHOLE CELL, 2026-09-21: the tab first, synchronously, then the community's root IDs for
     the nucleus onto the cell layer, then the tab is sent there. Where there are none to read the
     wait is nothing, and a backend that does not answer costs 5 s, not the view. */
  const nucId = (ids && ids.nuc) || "", rootId = (ids && ids.root) || "";
  const canExtra = !!nucId && tracingSources().seg
    && !!((UJ.cfg && UJ.cfg.tracing && UJ.cfg.tracing.extraRootsFor) || typeof fetchExtraRootIdsFor === "function");
  if (!canExtra) window.open(url, "_blank", "noopener");
  else {
    let win = null;
    try { win = window.open("", "_blank"); } catch (_e){}
    tracingExtraRootsFor(nucId, rootId).then(function(extra){
      let u = url;
      if (tracingAddRootsTo(st, extra)) u = base + "#!" + encodeURIComponent(JSON.stringify(st));
      if (win){ try { win.opener = null; } catch (_e){} win.location.href = u; }
      else window.open(u, "_blank", "noopener");
      if (extra.length) tracingSay((say || ("Opened in the viewer at " + pos.join(", ") + ".")) + " The cell "
        + "is shown with its " + extra.length + " community-proposed root ID" + (extra.length === 1 ? "" : "s")
        + " as well as " + (rootId ? "its own" : "its nucleus") + ".");
    });
  }
  const nStr = structs.length + " structure" + (structs.length === 1 ? "" : "s");
  const cellStr = shown'''),
 (u"the pad paints them too",
  u'''    } catch (_e){ also = []; }
    const got = await UJ.segpaint.paint(cv, PAD_VIEW, { root: root, rootAlso: also, nuc: nuc, alpha: 0.4,''',
  u'''    } catch (_e){ also = []; }
    /* And the community's proposed root IDs for the nucleus, 2026-09-21 -- the same cell the viewer
       link shows. The nucleus box is read whether or not there is a nucleus volume to paint it in. */
    const nucForExtras = (document.getElementById("tracingNucId").value || "").trim();
    if (SRCS.seg && nucForExtras){
      try { (await tracingExtraRootsFor(nucForExtras, root)).forEach(function(x){
              if (x !== root && also.indexOf(x) < 0) also.push(x); }); } catch (_e){}
    }
    const got = await UJ.segpaint.paint(cv, PAD_VIEW, { root: root || also[0] || "", rootAlso: root ? also : also.slice(1), nuc: nuc, alpha: 0.4,'''),
])

print("bjump.html")
edit("bjump.html", [(u"the tracing card reads βJump's proposals",
  u'''    penKey:    "bjump_tracing_pen_v1",''',
  u'''    penKey:    "bjump_tracing_pen_v1",
    /* The community's proposed root IDs for a nucleus, secgan16 only -- what the 3D model and the
       viewer already combine. The tracing card's viewer link and pad add them (2026-09-21). */
    extraRootsFor: function(nuc, root){ return bjumpExtraRootIdsFor(nuc, root); },''')])

print("hjump.html")
edit("hjump.html", [(u"the tracing card reads ηJump's proposals",
  u'''    penKey:    "hjump_tracing_pen_v1",''',
  u'''    penKey:    "hjump_tracing_pen_v1",
    /* The community's proposed c3 IDs for a cell body -- the list the extra-ID panel shows and the
       3D model combines, filtered to the segmentation the viewer paints (2026-09-21). */
    extraRootsFor: function(body, root){
      var want = (UJ.cfg.mesh && UJ.cfg.mesh.extraRootSegType) || "c3";
      return fetch(REPORT_ENDPOINT + "?rootIds=" + encodeURIComponent(body) + "&ds=" + encodeURIComponent(UJ.cfg.backend.ds))
        .then(function(r){ return r.json(); })
        .then(function(d){
          var seen = {}; seen[String(root || "")] = 1;
          return ((d && (d.rootIds || d.proposals)) || []).filter(function(x){
            var id = x && String(x.rootId || ""), st = x && x.segType;
            if (!id || seen[id] || (st && st !== want)) return false;
            seen[id] = 1; return true;
          }).map(function(x){ return String(x.rootId); });
        });
    },''')])

print("core/tracingcard.js: the pad says how many proposed IDs it painted")
edit("core/tracingcard.js", [
 (u"the pad counts the proposed IDs it painted",
  u'''    const nucForExtras = (document.getElementById("tracingNucId").value || "").trim();
    if (SRCS.seg && nucForExtras){
      try { (await tracingExtraRootsFor(nucForExtras, root)).forEach(function(x){
              if (x !== root && also.indexOf(x) < 0) also.push(x); }); } catch (_e){}
    }''',
  u'''    const nucForExtras = (document.getElementById("tracingNucId").value || "").trim();
    let proposed = 0;
    if (SRCS.seg && nucForExtras){
      try { (await tracingExtraRootsFor(nucForExtras, root)).forEach(function(x){
              if (x !== root && also.indexOf(x) < 0){ also.push(x); proposed++; } }); } catch (_e){}
    }'''),
 (u"...and says so",
  u'''    const said = [part(also.length ? "cell (" + (also.length + 1) + " segments)" : "root",
                       root, got && got.cell), part("nucleus", nuc, got && got.nucleus)]''',
  u'''    /* Søren, 2026-09-21: "for the tracing segmentation, all the root IDs that have been proposed
       should be shown" -- they are painted, and the line says how many. */
    const said = [part(proposed ? "root + " + proposed + " proposed root ID" + (proposed === 1 ? "" : "s")
                       : also.length ? "cell (" + (also.length + 1) + " segments)" : "root",
                       root || also[0] || "", got && got.cell), part("nucleus", nuc, got && got.nucleus)]'''),
])
