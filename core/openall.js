/* core/openall.js -- "Open all matches in Neuroglancer (3D)" for a page that did not have one.
   2026-09-21

   Søren, on βJump and λJump having no such view (so the traced-outline layer had nowhere to go):
   "Yes, build that."

   µJump, δJump and πJump build their own 3D view of the matches inside their filter closures, and
   ηJump writes a link. βJump and λJump had neither. This file is the part those two share, so it
   is written once:

     matchesViewState(o)                   the Neuroglancer state: the page's own image and
                                           segmentation layers, ONE POINT LAYER PER IDENTITY with a
                                           point on every matched nucleus, the region boxes if the
                                           search was limited to any, framed to fit all of it.
     tracedOutlinesOpen(base,state,ids,btn)  opens it -- with the matched cells' traced outlines
                                           pushed on first, when #filterOrganSeg picks any
                                           (core/tracedoutlines.js).

   WHY POINTS AND NOT ONLY SEGMENTS. βJump's segmentation covers about half the block and λJump
   has none at all, so a view of the matched segments would lose half, or all, of the matches
   without a word. A nucleus always has a position; the point is the one thing every match has.
   On βJump the segments ride along, in their identity's colour, where there are any.

   Coordinates are the page's voxels, and the state declares the page's voxel size as its
   dimensions, exactly as each page's own single-cell state does -- so no conversion anywhere,
   and a traced outline (stored in the same voxels) lands where it was drawn.

   Host contract: nothing global. Everything comes in through the arguments. */
(function(){
  if (typeof window === "undefined") return;

  /* Golden-angle hue stepping, the generator µJump and ηJump colour their "Open all" layers with,
     so consecutive groups never get near-identical colours however many there are. */
  function palette(idx){
    var h = (idx * 137.508) % 360, sat = 0.72, l = 0.58;
    var k = function(n){ return (n + h / 30) % 12; }, a = sat * Math.min(l, 1 - l);
    var f = function(n){ return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); };
    var hex = function(x){ var s = Math.round(255 * x).toString(16); return s.length < 2 ? "0" + s : s; };
    return "#" + hex(f(0)) + hex(f(8)) + hex(f(4));
  }

  /* o = {
       res:      [x,y,z] nm per voxel,
       rows:     matched indices,
       posOf:    i -> [x,y,z] voxels,
       groupOf:  i -> a name (the cell's identity; "" is "unclassified"),
       noun:     "nuclei" -- what a point is,
       images:   [image layer, ...]  -- the page's own, first one visible,
       segs:     [{source, name, idOf: i -> id or "", visible}]  -- optional,
       boxes:    core/regionbox.js getBoxesNM() -- nm, with the colour each box is drawn in,
       bg:       background colour
     } */
  function matchesViewState(o){
    var res = o.res, rows = o.rows || [];
    var groups = {}, order = [];
    rows.forEach(function(i){
      var g = String(o.groupOf(i) || "").trim() || "unclassified";
      if (!groups[g]){ groups[g] = []; order.push(g); }
      groups[g].push(i);
    });
    /* Largest group first, "unclassified" last: the first colours are the most distinct, and
       they go to the identities there is most of. */
    order.sort(function(a, b){
      if ((a === "unclassified") !== (b === "unclassified")) return a === "unclassified" ? 1 : -1;
      return groups[b].length - groups[a].length || (a < b ? -1 : 1);
    });
    var colourOf = {};
    order.forEach(function(g, k){ colourOf[g] = palette(k); });

    var layers = (o.images || []).slice();
    (o.segs || []).forEach(function(s){
      var ids = [], col = {};
      order.forEach(function(g){
        groups[g].forEach(function(i){
          var id = String(s.idOf(i) || "");
          if (!id || id === "0" || col[id]) return;
          ids.push(id); col[id] = colourOf[g];
        });
      });
      if (!ids.length) return;
      layers.push({ type: "segmentation", source: s.source, tab: "segments",
                    name: s.name + " (" + ids.length + ")", segments: ids, segmentColors: col,
                    objectAlpha: 0.85, visible: s.visible !== false });
    });
    order.forEach(function(g){
      var anns = groups[g].map(function(i){
        var p = o.posOf(i);
        return { type: "point", id: "match_" + i, point: [p[0], p[1], p[2]] };
      });
      layers.push({ type: "annotation", source: "local://annotations", tab: "annotations",
                    name: g + " — " + (o.noun || "nuclei") + " (" + anns.length + ")",
                    annotationColor: colourOf[g], annotations: anns });
    });
    /* The boxes the search was limited to, each on its own layer in the colour the filter draws it
       in, as µJump and ηJump do. regionbox gives nanometres; the state is in voxels. */
    var boxes = o.boxes || [], corners = [];
    boxes.forEach(function(b, k){
      var A = [b.xmin / res[0], b.ymin / res[1], b.zmin / res[2]],
          B = [b.xmax / res[0], b.ymax / res[1], b.zmax / res[2]];
      layers.push({ type: "annotation", source: "local://annotations", tool: "annotateBoundingBox",
                    annotations: [{ type: "axis_aligned_bounding_box", id: "filter-region-box-" + k,
                                    pointA: A, pointB: B }],
                    annotationColor: b.color || "#ffd43b",
                    name: boxes.length > 1 ? ("Region box " + (b.n || k + 1)) : "Region box" });
      corners.push(A, B);
    });
    /* Framed to fit every match AND every box: a box larger than the cells in it, framed on the
       cells alone, opens the view inside it with no edges showing. */
    var pts = rows.map(o.posOf).concat(corners);
    var c = [0, 0, 0];
    pts.forEach(function(p){ c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; });
    if (pts.length){ c[0] /= pts.length; c[1] /= pts.length; c[2] /= pts.length; }
    var span = 20000;
    pts.forEach(function(p){
      span = Math.max(span, Math.sqrt(Math.pow((p[0] - c[0]) * res[0], 2) +
                                      Math.pow((p[1] - c[1]) * res[1], 2) +
                                      Math.pow((p[2] - c[2]) * res[2], 2)));
    });
    return { dimensions: { x: [res[0] / 1e9, "m"], y: [res[1] / 1e9, "m"], z: [res[2] / 1e9, "m"] },
             position: c, crossSectionScale: 3.0, projectionScale: span * 2.2,
             layers: layers, layout: { type: "4panel", orthographicProjection: true },
             crossSectionBackgroundColor: o.bg, perspectiveViewBackgroundColor: o.bg };
  }

  /* Opens the view. With "None — points only" picked, at once. Otherwise the tab is opened FIRST,
     synchronously -- a tab opened after an await is a popup, and browsers block those -- then the
     outlines are read, pushed onto the state, and the tab is sent there. If it could not be opened
     the finished URL is opened instead. */
  function tracedOutlinesOpen(base, state, ids, btn){
    var url = function(st){ return base + "#!" + encodeURIComponent(JSON.stringify(st)); };
    var sel = document.getElementById("filterOrganSeg");
    var want = sel && sel.value;
    if (!want || typeof buildTracedOrganelleLayers !== "function"){
      window.open(url(state), "_blank");
      return Promise.resolve();
    }
    var win = null;
    try { win = window.open("", "_blank"); } catch (_e){}
    var label = btn ? btn.textContent : "";
    return buildTracedOrganelleLayers(ids, want, function(m){ if (btn) btn.textContent = m; })
      .catch(function(e){ console.warn("[open all] traced outlines unavailable", e); return []; })
      .then(function(layers){
        if (btn) btn.textContent = label;
        if (layers && layers.length) state.layers.push.apply(state.layers, layers);
        var json = JSON.stringify(state);
        var u = url(state);
        /* ── PAST THE CAP, HAND OVER THE STATE ───────────────────────────  2026-09-24
           The same answer µJump’s filter gives, for the three tools that open through here.
           The blank tab opened a moment ago for the popup blocker is closed again: leaving it on
           about:blank while the offer appears behind it is two confusing things at once.
           See src/too_big_to_open_is_not_too_big_to_use.py. */
        if (typeof tracedLinkMax === "function" && u.length > tracedLinkMax()){
          if (win){ try { win.close(); } catch (_e){} }
          if (typeof tracedOutlinesStateOffer === "function")
            tracedOutlinesStateOffer(btn || sel, json, u.length);
          return;
        }
        if (win){ try { win.opener = null; } catch (_e){} win.location.href = u; }
        else window.open(u, "_blank");
      });
  }

  window.matchesViewState = matchesViewState;
  window.tracedOutlinesOpen = tracedOutlinesOpen;
  window.UJ = window.UJ || {};
  window.UJ.openall = { matchesViewState: matchesViewState, open: tracedOutlinesOpen, _palette: palette };
})();
