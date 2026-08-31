/* core/regionbox.js -- 2026-08-31, Søren: "For lJump and bJump we should add the bounding box
   limitation + colab code for download to filter and show".

   µJump has had a "Limit to region(s) (bounding box)" control inside Filter and show since
   2026-07-31, and a per-box "Colab notebook for this box" button since 2026-08-29. Both were
   written inline in ujump.html, ~230 lines of DOM building, paste-splitting, SVG previewing and
   notebook wiring. Copying that into λJump and βJump would have made three copies of a control
   that has already been corrected twice (the multi-box rewrite, and the extents-margin fix that
   stopped a dataset outline from being drawn flush with the panel border and reading as absent).
   A third and fourth copy is how the next correction reaches one page and not the others.

   So it lives here, dataset-agnostic, the same way core/mesh.js and core/colabexport.js already
   do. What differs between tools is DATA, declared in UJ.cfg.regionbox by the page:

     UJ.cfg.regionbox = {
       extents: [ {name, color, xmin,xmax,ymin,ymax,zmin,zmax} ]   // nm, the volume outline(s)
                   drawn behind the boxes so a typed coordinate can be seen to be inside or
                   outside the data. µJump draws two (minnie65 and minnie35); a single-volume
                   tool draws one. An empty array draws no outline and the preview then has no
                   scale to draw against, so mount() refuses it rather than drawing a blank.

                   MAY BE A FUNCTION returning that array, and on these pages it must be. The
                   volume bounds live in a <script type="application/json"> data block, and the
                   config that wants to read them is a <script> ABOVE it -- so an array built
                   eagerly at config time calls getElementById on an element the parser has not
                   reached yet, gets null, and falls back to whatever default the page wrote.
                   That is not a crash: λJump quietly drew one outline instead of two and looked
                   entirely correct, which is how it shipped past me once already. Resolved here
                   at mount time, which is after DOMContentLoaded, so the data block exists.
       unit: "voxels" (default) or "nm" -- what the six coordinate fields are in. Only wording:
                   the conversion is `res`, passed to mount(). ALL SEVEN tools take voxels, because
                   that is the frame Neuroglancer shows and a user pastes.
                   ωJump was the exception until 2026-08-31: its whole coordinate system was
                   nanometres, so it passed unit:"nm" and res [1,1,1]. Søren asked for voxels there
                   too -- a coordinate is only useful to the lab that published the volume if it is
                   in the frame they use -- so the "nm" branch now has no caller. It is kept
                   because the wording is one string and a module that only works for the one unit
                   its callers happen to use today is a module that has to be reopened the day one
                   of them differs.
       depthCaption: string, optional -- the side view's vertical axis label. Defaults to
                   "Y - depth". µJump says "pia at top, white matter at bottom"; that is true of
                   a cortical block and false of, say, a corpuscle, so it is per-tool text.
       colab: {em, seg, meshes} -- booleans. FALSE MEANS THE DATASET CANNOT DO IT, not that it is
                   off by default. A false entry renders its tickbox disabled and unticked with
                   its reason as the hover text, which is what Søren asked for on λJump
                   ("Show all three, disabled with a note") rather than hiding it: a hidden
                   control says nothing, a disabled one says "this exists and this volume has no
                   data for it". Omit the object entirely and all three are available.
       colabWhy: {seg, meshes} -- the reason text for a disabled tickbox. Required for any key
                   set false in `colab`; mount() refuses without it, because "disabled with a
                   note" is the whole point and a disabled box with no note is worse than none.
     }

   Public surface: UJ.regionbox.mount(opts) -> controller. See mount()'s own comment. */
window.UJ = window.UJ || {};
UJ.regionbox = (function(){

  /* One colour per box, cycled by row order. The SAME list the host page must use when it draws
     the boxes as Neuroglancer annotation layers, so the preview and the 3D view agree about which
     box is which -- exposed for that reason rather than kept private. */
  var COLORS = ["#58a6ff", "#f0883e", "#3fb950", "#d29922", "#bc8cff", "#ff7b72"];

  function num(el){ var v = el ? parseFloat(el.value) : NaN; return v; }

  /* ── the preview ───────────────────────────────────────────────────────────────────────────
     Two orthographic panels, top (X–Z) and side (X–Y), each drawing the dataset extent(s) as a
     dashed outline and every complete box as a filled rect in its own colour. This is the part
     that catches a typo before a filter is run: a box outside the data draws visibly outside the
     outline instead of silently matching nothing. */
  function svgBoxPanel(label, capA, capB, boxes, extents){
    var W = 260, H = 120, pad = 6;
    var rawA0 = Math.min.apply(null, extents.map(function(e){ return e.a0; }));
    var rawA1 = Math.max.apply(null, extents.map(function(e){ return e.a1; }));
    var rawB0 = Math.min.apply(null, extents.map(function(e){ return e.b0; }));
    var rawB1 = Math.max.apply(null, extents.map(function(e){ return e.b1; }));
    /* A margin around the tightest-fitting extent before it becomes the drawing scale. Without
       it, whichever dataset defines the outer bound sits its dashed outline exactly flush with
       the panel border -- visually indistinguishable from the frame, so it reads as "no box" and
       makes the genuinely smaller volume look like the only one. Found and fixed in µJump; kept
       here because the same thing happens with one extent as with two. */
    var marginA = (rawA1 - rawA0) * 0.06, marginB = (rawB1 - rawB0) * 0.06;
    var fullA0 = rawA0 - marginA, fullA1 = rawA1 + marginA;
    var fullB0 = rawB0 - marginB, fullB1 = rawB1 + marginB;
    /* A degenerate axis (a volume with zero extent on one axis, or one extent whose min equals
       its max) would divide by zero and put every coordinate at NaN, which SVG renders as
       nothing at all -- a blank panel that looks like a loading failure. Guarded to 1 nm. */
    var spanA = (fullA1 - fullA0) || 1, spanB = (fullB1 - fullB0) || 1;
    var sx = function(v){ return pad + (v - fullA0) / spanA * (W - 2*pad); };
    var sy = function(v){ return pad + (v - fullB0) / spanB * (H - 2*pad); };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:320px;height:'
            + H + 'px;background:var(--bg);border:1px solid var(--line);border-radius:6px;display:block">';
    extents.forEach(function(e){
      var ex0 = sx(e.a0), ex1 = sx(e.a1), ey0 = sy(e.b0), ey1 = sy(e.b1);
      svg += '<rect x="' + ex0.toFixed(1) + '" y="' + ey0.toFixed(1) + '" width="' + (ex1-ex0).toFixed(1)
           + '" height="' + (ey1-ey0).toFixed(1) + '" fill="none" stroke="' + e.color
           + '" stroke-width="1.3" stroke-dasharray="3,3"/>';
    });
    var insideAny = false;
    boxes.forEach(function(b){
      var ax0 = Math.max(b.a0, rawA0), ax1 = Math.min(b.a1, rawA1);
      var ay0 = Math.max(b.b0, rawB0), ay1 = Math.min(b.b1, rawB1);
      var rx = sx(ax0), ry = sy(ay0);
      var rw = Math.max(0, sx(ax1) - sx(ax0)), rh = Math.max(0, sy(ay1) - sy(ay0));
      if (extents.some(function(e){ return !(b.a1 < e.a0 || b.a0 > e.a1 || b.b1 < e.b0 || b.b0 > e.b1); }))
        insideAny = true;
      if (rw > 0 && rh > 0)
        svg += '<rect x="' + rx.toFixed(1) + '" y="' + ry.toFixed(1) + '" width="' + rw.toFixed(1)
             + '" height="' + rh.toFixed(1) + '" fill="' + b.color + '" fill-opacity="0.35" stroke="' + b.color + '"/>';
    });
    svg += '</svg>';
    /* Physical size printed beside each name so the relative sizes in the picture can be checked
       against real numbers rather than by eye. µJump's volumes are millimetres; ωJump's smallest
       is 20 µm, where "0.00×0.00 mm" would be the whole legend -- so the unit follows the size. */
    var legend = extents.map(function(e){
      var a = e.a1 - e.a0, b = e.b1 - e.b0;
      var mm = Math.max(a, b) >= 1e6;
      return '<span style="color:' + e.color + '">&#9633;</span> ' + e.name + ' ('
           + (mm ? (a/1e6).toFixed(2) + '×' + (b/1e6).toFixed(2) + ' mm'
                 : (a/1e3).toFixed(1) + '×' + (b/1e3).toFixed(1) + ' µm') + ')';
    }).join('&nbsp;&nbsp;&nbsp;');
    return '<div style="margin-top:6px"><div class="hint" style="margin-bottom:3px">' + label
         + ' (' + capA + ' →, ' + capB + ' ↓) &mdash; ' + legend + '</div>' + svg
         + (boxes.length && !insideAny
             ? '<p class="hint" style="color:#f0883e">None of the boxes fall inside the dataset’s extent on this axis.</p>'
             : '') + '</div>';
  }

  /* mount(opts) wires one region-box panel and returns a controller.

     opts = {
       boxesEl, addBtn, onEl, vizEl : the four DOM nodes from the page's own markup. onEl is the
                     "Limit to region(s)" checkbox; everything else greys out while it is off.
       res         : [rx,ry,rz] nm/voxel. The coordinate fields are in VOXELS (the same frame as
                     the tool's main search box, which is what a user pastes from Neuroglancer);
                     everything this module hands back is in nanometres.
       onChange    : optional, called whenever a box changes -- the host uses it to mark a
                     previously previewed filter result stale.
       rootIdsInBox: optional fn(boxNM) -> string[]. Called when a notebook is generated with
                     Meshes ticked; returns the matched cells whose nucleus is inside THAT box.
                     Return null (not []) to mean "no filter has been run yet", which is refused
                     with a message rather than shipping an empty mesh list silently.
       download    : optional fn({boxNM, boxLabel, include}) -> true if it handled the download.
                     Supplied when the tool's volumes are not Neuroglancer precomputed and so
                     cannot go through core/colabexport.js -- ωJump's are OME-Zarr and use
                     core/colabzarr.js instead. Left out, the built-in cloud-volume path is used.
                     It lives in the host rather than here because ωJump picks its EM and
                     segmentation URLs per SELECTED DATASET, and this module has no idea which
                     dataset a page is showing.
     } */
  function mount(opts){
    var cfg = (UJ.cfg && UJ.cfg.regionbox) || {};
    var extents = typeof cfg.extents === "function" ? cfg.extents() : (cfg.extents || []);
    if (!extents.length) throw new Error("UJ.cfg.regionbox.extents is required -- the preview has no scale to draw against without at least one volume outline");
    /* A zero-span outline draws as a line, scales the whole panel to nothing, and is what you get
       when the data block did not parse and a default of zeroes came through. Caught here, where
       the message can say so, rather than downstream as an empty picture. */
    extents.forEach(function(e){
      if (!(e.xmax > e.xmin && e.ymax > e.ymin && e.zmax > e.zmin))
        throw new Error("UJ.cfg.regionbox extent \"" + (e.name || "?") + "\" has no size on some axis ("
          + [e.xmin,e.xmax,e.ymin,e.ymax,e.zmin,e.zmax].join(",") + ") -- usually a data block that was read before the parser reached it");
    });
    var colab = cfg.colab || {};
    var why = cfg.colabWhy || {};
    ["seg", "meshes"].forEach(function(k){
      if (colab[k] === false && !why[k])
        throw new Error("UJ.cfg.regionbox.colab." + k + " is false but colabWhy." + k + " is missing -- a disabled tickbox with no stated reason is worse than no tickbox");
    });
    var can = { em: colab.em !== false, seg: colab.seg !== false, meshes: colab.meshes !== false };
    var res = opts.res || (UJ.cfg && UJ.cfg.res) || [1,1,1];
    var RX = res[0], RY = res[1], RZ = res[2];
    var depthCaption = cfg.depthCaption || "Y – depth";
    var unit = cfg.unit === "nm" ? "nanometres" : "voxels";

    function fire(){ if (opts.onChange) opts.onChange(); }

    /* Reads every row currently mounted and returns the complete ones as physical-nm boxes. A row
       with any blank or non-numeric field is SKIPPED, not treated as an error -- otherwise
       "+ Add another box" would immediately break the filter until all six new fields were typed.
       n and the raw voxel corners ride along so an export can name the box a cell fell in and
       show its corners as the user typed them: either diagonal is allowed, so corner 1 is not
       necessarily the min corner and the sorted xmin/xmax below would misreport it. */
    function getBoxesNM(){
      if (!opts.onEl || !opts.onEl.checked) return [];
      var boxes = [];
      rows().forEach(function(row, idx){
        var g = function(c){ return num(row.querySelector("." + c)); };
        var x1=g("rx1"), y1=g("ry1"), z1=g("rz1"), x2=g("rx2"), y2=g("ry2"), z2=g("rz2");
        if ([x1,y1,z1,x2,y2,z2].some(function(v){ return isNaN(v); })) return;
        var nx1=x1*RX, nx2=x2*RX, ny1=y1*RY, ny2=y2*RY, nz1=z1*RZ, nz2=z2*RZ;
        boxes.push({
          xmin: Math.min(nx1,nx2), xmax: Math.max(nx1,nx2),
          ymin: Math.min(ny1,ny2), ymax: Math.max(ny1,ny2),
          zmin: Math.min(nz1,nz2), zmax: Math.max(nz1,nz2),
          n: idx+1, x1:x1, y1:y1, z1:z1, x2:x2, y2:y2, z2:z2,
          color: COLORS[idx % COLORS.length]
        });
      });
      return boxes;
    }
    function rows(){ return Array.prototype.slice.call(opts.boxesEl.querySelectorAll(".rbox-row")); }

    function redraw(){
      if (!opts.vizEl) return;
      if (!opts.onEl || !opts.onEl.checked){ opts.vizEl.innerHTML = ""; return; }
      var boxes = [], anyIncomplete = false;
      rows().forEach(function(row, idx){
        var g = function(c){ return num(row.querySelector("." + c)); };
        var x1=g("rx1"), y1=g("ry1"), z1=g("rz1"), x2=g("rx2"), y2=g("ry2"), z2=g("rz2");
        if ([x1,y1,z1,x2,y2,z2].some(function(v){ return isNaN(v); })){ anyIncomplete = true; return; }
        var nx1=x1*RX, nx2=x2*RX, ny1=y1*RY, ny2=y2*RY, nz1=z1*RZ, nz2=z2*RZ;
        boxes.push({ bx0:Math.min(nx1,nx2), bx1:Math.max(nx1,nx2),
                     by0:Math.min(ny1,ny2), by1:Math.max(ny1,ny2),
                     bz0:Math.min(nz1,nz2), bz1:Math.max(nz1,nz2),
                     color: COLORS[idx % COLORS.length] });
      });
      if (!boxes.length){
        opts.vizEl.innerHTML = '<p class="hint">Enter both corners (' + unit + ') for at least one box to preview it.</p>';
        return;
      }
      var exXZ = extents.map(function(e){ return {name:e.name, color:e.color, a0:e.xmin, a1:e.xmax, b0:e.zmin, b1:e.zmax}; });
      var exXY = extents.map(function(e){ return {name:e.name, color:e.color, a0:e.xmin, a1:e.xmax, b0:e.ymin, b1:e.ymax}; });
      var html = "";
      if (boxes.length > 1)
        html += '<p class="hint" style="margin-bottom:4px">' + boxes.map(function(b,i){
          return '<span style="color:' + b.color + '">&#9632;</span> Box ' + (i+1); }).join('&nbsp;&nbsp;') + '</p>';
      html += svgBoxPanel("Top view", "X", "Z",
                boxes.map(function(b){ return {a0:b.bx0,a1:b.bx1,b0:b.bz0,b1:b.bz1,color:b.color}; }), exXZ);
      html += svgBoxPanel("Side view", "X", depthCaption,
                boxes.map(function(b){ return {a0:b.bx0,a1:b.bx1,b0:b.by0,b1:b.by1,color:b.color}; }), exXY);
      if (anyIncomplete)
        html += '<p class="hint">One or more boxes have incomplete coordinates and won’t be used until all 6 fields are filled in.</p>';
      opts.vizEl.innerHTML = html;
    }

    /* The coordinate rows do nothing until "Limit to region(s)" is ticked (getBoxesNM returns []),
       so they are greyed and made unclickable while it is off -- a visual answer to "why is
       nothing happening when I type in here". */
    function updateUI(){
      var on = !!(opts.onEl && opts.onEl.checked);
      [opts.boxesEl, opts.addBtn].forEach(function(el){
        if (!el) return;
        el.style.opacity = on ? "" : "0.4";
        el.style.pointerEvents = on ? "" : "none";
      });
    }

    function renumber(){
      rows().forEach(function(row, idx){
        var n = row.querySelector(".rbox-num");
        if (n) n.textContent = String(idx + 1);
      });
    }

    function tick(cls, label, allowed, reason){
      var dis = allowed ? "" : " disabled";
      var style = "font-size:11px;color:var(--mut);display:flex;align-items:center;gap:3px;"
                + (allowed ? "cursor:pointer" : "cursor:not-allowed;opacity:.55");
      /* The title carries the reason on a disabled box. It is set on the LABEL, not the input:
         a disabled input does not fire pointer events in any browser, so a title on it never
         appears -- which would have made "disabled with a note" a note nobody can read. */
      return '<label style="' + style + '"' + (allowed ? "" : ' title="' + String(reason).replace(/"/g, "&quot;") + '"')
           + '><input type="checkbox" class="' + cls + '"' + (allowed ? " checked" : "") + dis + '>' + label
           + (allowed ? "" : " — not in this dataset") + '</label>';
    }

    function makeRow(){
      var row = document.createElement("div");
      row.className = "rbox-row";
      row.style.cssText = "border:1px solid var(--line);border-radius:6px;padding:8px;margin-top:8px";
      row.innerHTML =
        '<div class="row" style="justify-content:space-between;align-items:center">'
        + '<span style="font-size:12px;color:var(--mut)">Box <span class="rbox-num"></span></span>'
        + '<button type="button" class="rbox-remove" style="background:none;border:none;color:var(--mut);cursor:pointer;font-size:16px;line-height:1;padding:0 4px" title="Remove this box">&times;</button>'
        + '</div>'
        + '<div class="row" style="margin-top:6px;gap:8px">'
        + '<div class="coord"><input type="text" class="rx1" inputmode="decimal" placeholder="x1"></div>'
        + '<div class="coord"><input type="text" class="ry1" inputmode="decimal" placeholder="y1"></div>'
        + '<div class="coord"><input type="text" class="rz1" inputmode="decimal" placeholder="z1"></div>'
        + '</div>'
        + '<div class="row" style="margin-top:4px;gap:8px">'
        + '<div class="coord"><input type="text" class="rx2" inputmode="decimal" placeholder="x2"></div>'
        + '<div class="coord"><input type="text" class="ry2" inputmode="decimal" placeholder="y2"></div>'
        + '<div class="coord"><input type="text" class="rz2" inputmode="decimal" placeholder="z2"></div>'
        + '</div>'
        + '<div class="row" style="margin-top:6px;gap:10px;align-items:center;flex-wrap:wrap">'
        + tick("colab-em", "EM", can.em, why.em)
        + tick("colab-seg", "Segmentation", can.seg, why.seg)
        + tick("colab-meshes", "Meshes", can.meshes, why.meshes)
        + '</div>'
        + '<div class="row" style="margin-top:6px">'
        + '<button type="button" class="rbox-colab" style="font-size:11px;padding:3px 8px" '
        + 'title="Generates a Colab notebook (.ipynb) that downloads whichever of the boxes above are ticked, for this box only — nothing is downloaded here, the notebook does the fetching when you run it in Colab.">'
        + '&#11015; Colab notebook for this box</button>'
        + '</div>';

      row.querySelectorAll('input[type="text"]').forEach(function(el){
        el.addEventListener("input", function(){ redraw(); fire(); });
      });
      /* Paste-split, matching the main coordinate field: paste "x, y, z" into either corner's
         first field and it fills that corner's three inputs. */
      [[".rx1",".ry1",".rz1"], [".rx2",".ry2",".rz2"]].forEach(function(sel){
        var xEl = row.querySelector(sel[0]), yEl = row.querySelector(sel[1]), zEl = row.querySelector(sel[2]);
        if (!xEl) return;
        xEl.addEventListener("input", function(e){
          var p = e.target.value.split(/[\s,]+/).filter(function(s){ return s !== ""; });
          if (p.length >= 3){
            e.target.value = p[0];
            if (yEl) yEl.value = p[1];
            if (zEl) zEl.value = p[2];
            redraw(); fire();
          }
        });
      });
      row.querySelector(".rbox-remove").addEventListener("click", function(){
        row.remove(); renumber(); redraw(); fire();
      });
      row.querySelector(".rbox-colab").addEventListener("click", function(){ generate(row); });
      return row;
    }

    function generate(row){
      var g = function(c){ return num(row.querySelector("." + c)); };
      var x1=g("rx1"), y1=g("ry1"), z1=g("rz1"), x2=g("rx2"), y2=g("ry2"), z2=g("rz2");
      if ([x1,y1,z1,x2,y2,z2].some(function(v){ return isNaN(v); })){
        alert("Fill in both corners of this box first."); return;
      }
      if (!opts.download && (!UJ.cfg.em || !UJ.colab)){
        alert("This tool doesn't have a region-download notebook configured yet."); return;
      }
      var ck = function(c){ var el = row.querySelector("." + c); return !!(el && el.checked && !el.disabled); };
      var wantEM = ck("colab-em"), wantSeg = ck("colab-seg"), wantMeshes = ck("colab-meshes");
      if (!wantEM && !wantSeg && !wantMeshes){
        alert("Tick at least one of EM, Segmentation, or Meshes."); return;
      }
      var nx1=x1*RX, nx2=x2*RX, ny1=y1*RY, ny2=y2*RY, nz1=z1*RZ, nz2=z2*RZ;
      var boxNM = { xmin:Math.min(nx1,nx2), xmax:Math.max(nx1,nx2),
                    ymin:Math.min(ny1,ny2), ymax:Math.max(ny1,ny2),
                    zmin:Math.min(nz1,nz2), zmax:Math.max(nz1,nz2) };
      /* Meshes are the one piece that depends on the FILTER rather than on the box: they are the
         cells Filter-and-show matched whose nucleus fell inside this box. rootIdsInBox returns
         null when no filter has been run, and that is refused loudly -- a notebook with an empty
         MESH_ROOT_IDS looks like it worked and downloads nothing, which is the worst outcome of
         the three. EM and segmentation are a pure spatial cutout and never gated on the filter. */
      var rootIds = [];
      if (wantMeshes){
        rootIds = opts.rootIdsInBox ? opts.rootIdsInBox(boxNM) : [];
        if (rootIds === null){
          alert('Meshes need a current "Filter and show" result, so the notebook matches what you are previewing. Run the filter (tick "Limit to region(s)" with this box if you want it applied), then click this again — or untick Meshes to download EM/segmentation only.');
          return;
        }
      }
      var idx = rows().indexOf(row);
      var boxLabel = "Box " + (idx >= 0 ? idx + 1 : 1);
      /* A host-supplied generator takes over completely when present. Checked AFTER the corner,
         tickbox and mesh-preview validation above, so every tool gets the same refusals for the
         same reasons and only the notebook-writing differs. */
      if (opts.download){
        opts.download({ boxNM: boxNM, boxLabel: boxLabel,
                        include: { em: wantEM, seg: wantSeg, meshes: wantMeshes },
                        rootIds: rootIds });
        return;
      }
      UJ.colab.downloadNotebook({
        datasetId: UJ.cfg.id, datasetLabel: UJ.cfg.label,
        emSource: UJ.cfg.em.emSource, segSource: UJ.cfg.em.segSource,
        segCaveAuth: !!UJ.cfg.em.segCaveAuth,
        boxNM: boxNM, boxLabel: boxLabel, rootIds: rootIds,
        include: { em: wantEM, seg: wantSeg, meshes: wantMeshes }
      });
    }

    function addRow(){
      opts.boxesEl.appendChild(makeRow());
      renumber(); redraw();
    }

    if (opts.addBtn) opts.addBtn.addEventListener("click", addRow);
    if (opts.onEl) opts.onEl.addEventListener("change", function(){ redraw(); updateUI(); fire(); });
    addRow();      // seed one empty row so the panel is not blank on load
    updateUI();

    return { getBoxesNM: getBoxesNM, addRow: addRow, redraw: redraw, updateUI: updateUI,
             colors: COLORS, capabilities: can };
  }

  return { mount: mount, COLORS: COLORS, _svgBoxPanel: svgBoxPanel };
})();
