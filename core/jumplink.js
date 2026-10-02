/* core/jumplink.js — a coordinate written in a sentence is a place you can go.      2026-10-01

   Søren, on Gary's forum idea: *"what if a user wants to talk about more than one coordinate in a
   post? Can we instead make it recognise when a coordinate or rootID is pasted and then make it
   into a link automatically?"*

   An anchor field holds one place. A paragraph holds as many as somebody wants to write about, so
   the text itself is the anchor: this reads a piece of prose and finds the references in it.

   ── RESOLVE, DO NOT PATTERN-MATCH ────────────────────────────────────────────────────────────
   A bare six-digit number could be a nucleus id, a count, a year or a page number. Three numbers
   in a row could be a coordinate or three measurements. Shape alone cannot tell, and a linkifier
   that guesses is worse than none: a wrong link in somebody's sentence is a claim the author did
   not make, on a page about getting cell identity right.

   So nothing is linked on appearance. A triple becomes a coordinate only when it LANDS INSIDE one
   of the two imaged volumes, and a bare number becomes a cell only when it is IN THIS VOLUME'S
   NUCLEUS TABLE *and* the author wrote a word meaning cell in front of it. The page answers both
   questions from data it already holds. A page that cannot answer (ωJump and χJump have no nucleus
   table) leaves the hook undefined, and then those references stay as the text somebody typed —
   which is the honest failure.

   The cue word is there because the lookup alone was not enough, and the check caught it before
   anyone saw it: in "Between 2024 and 2026 we traced 42 cells", the number 2026 IS a nucleus in
   this dataset. See RE_CUED below.

   ── SCANNED RAW, EMITTED ESCAPED ─────────────────────────────────────────────────────────────
   This is user-written text going into innerHTML on a page holding a Google credential, so the
   output is fully escaped. The ORDER is the subtle half, and the obvious order is wrong: escaping
   first and then scanning would hand the scanner "it&#39;s", whose entity contains the digits 39 —
   a number rule would read them, link half an entity, and render a broken apostrophe beside a link
   to nothing. Scanning the raw text and escaping each plain run as it is emitted cannot do that.
   Nothing the author typed reaches the page unescaped either way; only this way is also correct.

   ── WHAT IS STORED IS WHAT WAS TYPED ─────────────────────────────────────────────────────────
   The linkifying happens at render, never on save. A mis-detection is then a display bug rather
   than data loss, and sharpening the rules next month sharpens every post already written.

   ── BOTH VOLUMES, ALWAYS ─────────────────────────────────────────────────────────────────────
   Søren: *"Make sure that it recognises the minnie35 and minnie65 differences but opens the viewer
   with both segmentation layers and both em layers."* So the DIFFERENCE is used for what it can
   actually settle — which volume a coordinate is in, hence what the link says and where the point
   is drawn — and the viewer is opened with both EM layers and both segmentations regardless, since
   a post comparing across the boundary is exactly the post worth writing. The nuclei layer is the
   one exception: there is no nucleus detection over minnie35, so out there it would be an empty
   layer pretending to be a dataset.

   WHAT A HOST DOES
     define   window.jumpLinkHost() -> { resNm, volumes:[{key,label,bb,em,seg,nuc?}], dim,
                                         emShader, bg, viewer(), nucleus(id) }
              `bb` is in NANOMETRES, `nucleus(id)` returns {xVox,yVox,zVox,label} or null.
     call     el.innerHTML = UJ.jumplink.html(rawText);
              and, for "open all of them", UJ.jumplink.url(UJ.jumplink.scan(rawText)).
   A host that defines no hook gets plain escaped text and no links — never an exception.

   Check: jumplinkcheck.js */
var UJ = UJ || {};
(function(){
"use strict";

function hostOf(){
  if (typeof window.jumpLinkHost !== "function") return null;
  try { return window.jumpLinkHost() || null; } catch (_e){ return null; }
}
function esc(s){
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* ── WHICH VOLUME, AND IN WHAT UNITS ──────────────────────────────────────────────────────────
   VOXELS ARE TRIED FIRST because that is what every box, link and label in these tools is in --
   there is a build guard that says so. Nanometres are tried second, for a number copied out of a
   paper or a mesh file. A triple that is inside neither volume in either reading is not a
   coordinate, and this returns null rather than linking to somewhere nobody meant. */
/* ── ONE CONTAINMENT TEST, AND IT LIVES IN core/volumes.js ─────────────────────  2026-10-03
   It was written here, because this was the only thing that needed it. The pad, the cell card, the
   mesh fetch and the EM preview need it too now that minnie35 is being drawn, and four copies of
   "is this point in that box" is four chances for one of them to be the wrong one. The fallback is
   the same three lines rather than a refusal: core/volumes.js is loaded before this file on every
   page that has one, and a page that somehow has not loaded it should still linkify. */
function inBox(nm, bb){
  if (window.UJ && UJ.volumes && UJ.volumes.inBox) return UJ.volumes.inBox(nm, bb);
  if (!nm || !bb) return false;
  return nm[0] >= bb.xmin && nm[0] <= bb.xmax
      && nm[1] >= bb.ymin && nm[1] <= bb.ymax
      && nm[2] >= bb.zmin && nm[2] <= bb.zmax;
}
function placeOf(triple, host){
  if (!host || !host.resNm || !host.volumes || !host.volumes.length) return null;
  var r = host.resNm;
  var readings = [
    { unit: "voxel", voxel: triple.slice(),
      nm: [triple[0] * r[0], triple[1] * r[1], triple[2] * r[2]] },
    { unit: "nm", nm: triple.slice(),
      voxel: [Math.round(triple[0] / r[0]), Math.round(triple[1] / r[1]),
              Math.round(triple[2] / r[2])] }
  ];
  for (var i = 0; i < readings.length; i++){
    for (var v = 0; v < host.volumes.length; v++){
      var vol = host.volumes[v];
      /* THE VOLUMES ARE IN PRIORITY ORDER, which settles the overlap rather than leaving it to
         whichever happens to be first in an object: the two imaged slabs touch in z, and a point
         in the seam is reported as the one with segmentation and nuclei over it. */
      if (vol.bb && inBox(readings[i].nm, vol.bb))
        return { unit: readings[i].unit, voxel: readings[i].voxel, nm: readings[i].nm,
                 volume: vol.key, volumeLabel: vol.label || vol.key };
    }
  }
  return null;
}

/* ── WHAT IS LOOKED FOR, IN THIS ORDER ────────────────────────────────────────────────────────
   Priority matters because the patterns overlap: a coordinate is three numbers, and two of them
   would each pass for a nucleus id on their own. Earlier rules CLAIM their span and later rules
   skip anything that overlaps a claim -- so "at 240000, 200000, 20000" is one coordinate rather
   than one coordinate and two spurious cells. A rule that looks but does not resolve claims
   nothing, so a triple that is not a coordinate leaves its numbers free to be read as ids. */
var RE_VIEWER = /https?:\/\/[^\s<>"']+#!\S+/g;
var RE_TRIPLE = /\[?\s*(-?\d{1,9})\s*(?:,\s*|\s+)(-?\d{1,9})\s*(?:,\s*|\s+)(-?\d{1,9})\s*\]?/g;
/* EXACTLY EIGHTEEN DIGITS: MICrONS root ids are 18 wide, and eighteen consecutive digits in a
   sentence are not a year, a count or a measurement. This is the one rule that needs no lookup,
   because nothing else in prose looks remotely like it. */
var RE_ROOT   = /\b\d{18}\b/g;
/* ── AND THE AMBIGUOUS ONE, WHICH NEEDS BOTH A LOOKUP AND A CUE ───────────────────────────────
   "Resolve, do not pattern-match" was necessary and not sufficient, and jumplinkcheck.js said so
   before a single user saw it: in the sentence "Between 2024 and 2026 we traced 42 cells", the
   number 2026 IS a nucleus in this dataset. The table answered honestly and the link was still
   nonsense -- a year turned into a cell.

   There is no amount of looking at the digits that fixes that, because the digits are identical.
   What differs is what the author was doing, so the author says: a bare number is linked only when
   something immediately before it means a cell. "cell 253863" and "#253863" link; "2026" and
   "42 cells" do not, and nor does the stray 240640 in "the numbers 240640, 207872, 41784 are from
   a different experiment" -- which the triple rule had already, correctly, refused.

   This is deliberately the strict direction. A missed link is a number somebody can still read; a
   wrong one is a claim the author never made, on a page about getting cell identity right. The
   compose box says what it recognised, so an author who meant a cell can see that it was not taken
   as one and write the word. */
var RE_CUED   = /(^|[^0-9A-Za-z_])((?:nucleus|nuclei|nuc|cell|soma|id)\s*[:#.]?\s*|#\s*)(\d{3,8})\b/gi;

function scan(text){
  var s = String(text == null ? "" : text), host = hostOf();
  var hits = [], taken = [];
  var free = function(a, b){
    for (var i = 0; i < taken.length; i++)
      if (a < taken[i][1] && taken[i][0] < b) return false;
    return true;
  };
  var claim = function(a, b, h){ taken.push([a, b]); h.start = a; h.end = b; h.raw = s.slice(a, b);
                                 hits.push(h); };
  var m;

  RE_VIEWER.lastIndex = 0;
  while ((m = RE_VIEWER.exec(s))){
    if (free(m.index, m.index + m[0].length))
      claim(m.index, m.index + m[0].length, { kind: "viewer", url: m[0] });
  }

  RE_TRIPLE.lastIndex = 0;
  while ((m = RE_TRIPLE.exec(s))){
    /* The match may have eaten surrounding spaces and brackets; the claim is the numbers. */
    var a = s.indexOf(m[1], m.index), bEnd = m.index + m[0].length;
    while (bEnd > a && !/\d/.test(s.charAt(bEnd - 1))) bEnd--;
    if (!free(a, bEnd)) continue;
    var place = placeOf([Number(m[1]), Number(m[2]), Number(m[3])], host);
    if (!place) continue;            /* claims nothing: those numbers may still be ids */
    claim(a, bEnd, { kind: "coord", unit: place.unit, voxel: place.voxel,
                     volume: place.volume, label: place.volumeLabel });
  }

  RE_ROOT.lastIndex = 0;
  while ((m = RE_ROOT.exec(s))){
    if (free(m.index, m.index + m[0].length))
      claim(m.index, m.index + m[0].length, { kind: "root", id: m[0] });
  }

  RE_CUED.lastIndex = 0;
  while ((m = RE_CUED.exec(s))){
    /* The CUE IS NOT CLAIMED, only the number: "cell" stays ordinary prose and the link is the id,
       which is what a reader wants to click and what they want to be able to copy. */
    var nStart = m.index + m[1].length + m[2].length, nEnd = nStart + m[3].length;
    if (!free(nStart, nEnd)) continue;
    var nuc = null;
    if (host && typeof host.nucleus === "function"){
      try { nuc = host.nucleus(m[3]); } catch (_e){ nuc = null; }
    }
    /* Cued AND in the table. The cue says what was meant; the table says whether it exists here. */
    if (!nuc) continue;
    claim(nStart, nEnd,
          { kind: "nucleus", id: m[3], label: nuc.label || "",
            voxel: [nuc.xVox, nuc.yVox, nuc.zVox], volume: nuc.volume || "minnie65" });
    /* A cue immediately followed by another cued number ("cells 1234 and 5678") would otherwise be
       skipped, because lastIndex has moved past the gap the next match needs to start in. */
    RE_CUED.lastIndex = nEnd;
  }

  hits.sort(function(x, y){ return x.start - y.start; });
  return hits;
}

/* What a link says when you hover it. The volume is named on every coordinate, because "which
   volume is this in" is the question the two imaged slabs make somebody ask. */
function titleOf(h){
  if (h.kind === "viewer") return "Open this Neuroglancer view";
  if (h.kind === "root")   return "Open segment " + h.id + " in the viewer";
  if (h.kind === "nucleus")
    return "Nucleus " + h.id + (h.label ? " — " + h.label : "") + ". Open it in the viewer.";
  return "A place in " + (h.label || h.volume)
       + (h.unit === "nm" ? ", written in nanometres" : "")
       + ". Opens with both volumes’ imagery and segmentation.";
}

/* ── RAW IN, ESCAPED OUT ──────────────────────────────────────────────────────────────────────
   Each plain run is escaped as it is emitted and each hit becomes an anchor built from values this
   module computed -- never from a slice of the author's text used as markup. */
function html(text, opts){
  var s = String(text == null ? "" : text);
  var hits;
  try { hits = scan(s); } catch (_e){ hits = []; }
  if (!hits.length) return esc(s);
  var o = opts || {}, cls = o.className || "jumplink";
  var out = [], at = 0;
  hits.forEach(function(h, i){
    out.push(esc(s.slice(at, h.start)));
    var shown = esc(h.kind === "viewer" ? "this view" : h.raw);
    out.push('<a href="#" class="' + esc(cls) + '" data-jl="' + i + '" title="' + esc(titleOf(h))
             + '">' + shown + "</a>");
    at = h.end;
  });
  out.push(esc(s.slice(at)));
  return out.join("");
}

/* ── THE VIEWER STATE ─────────────────────────────────────────────────────────────────────────
   Both EM layers and both segmentations, whichever volume the point is in -- Søren's instruction,
   and the right one: a post comparing something across the two slabs is exactly the post worth
   writing, and a viewer that opened only one of them would make that post unreadable.

   Root ids go on BOTH segmentations' `segments`. Nothing in a sentence says which segmentation an
   id came from, and a viewer simply does not find an id that is not in a layer -- so listing it in
   both shows the cell wherever it lives, where guessing would show it half the time. */
function state(hits, opts){
  var host = hostOf();
  if (!host) return null;
  var o = opts || {};
  var list = (hits || []).filter(function(h){ return h && h.voxel; });
  var pos = (o.position || (list[0] && list[0].voxel) || null);
  var roots = (hits || []).filter(function(h){ return h.kind === "root"; })
                          .map(function(h){ return h.id; });
  var nucs = (hits || []).filter(function(h){ return h.kind === "nucleus"; })
                         .map(function(h){ return h.id; });
  var here = (list[0] && list[0].volume) || (host.volumes[0] && host.volumes[0].key);
  var layers = [];

  host.volumes.forEach(function(v){
    if (v.em) layers.push({ type: "image", source: v.em, tab: "rendering",
                            name: "EM (" + (v.label || v.key) + ")",
                            shaderControls: host.emShader });
  });
  /* ── SEE-THROUGH ONLY WHERE THERE IS SOMETHING INSIDE ──────────────  2026-10-03
     Søren: "The nucleus should be visible through the soma in the neuroglancer view also. Use same
     settings as for the cell identity cell name neuroglancer link." A solid soma hides the nucleus
     in it, and the cell-identity link has turned the cell down to 0.35 for that reason since it was
     written. The two numbers come from the host rather than being repeated here, so retuning them
     moves every link this tool writes.

     Conditional on the nuclei layer actually being in the state: a cell with nothing inside it
     should stay solid, because solid is the right picture for a lone cell. */
  var wantNuc = host.volumes.some(function(v){
    return v.nuc && (v.key === here || nucs.length); });
  var alpha = host.alpha || {};
  host.volumes.forEach(function(v){
    if (!v.seg) return;
    var s = { type: "segmentation", source: v.seg, tab: "source",
              name: "segmentation (" + (v.label || v.key) + ")", notSelectedAlpha: 0.05 };
    if (roots.length) s.segments = roots.slice();
    if (wantNuc) s.objectAlpha = (alpha.cell === undefined ? 0.35 : alpha.cell);
    layers.push(s);
  });
  /* NUCLEI ONLY WHERE THERE ARE ANY. minnie35 has no nucleus detection over it, so a nuclei layer
     out there would be an empty layer that looks like a dataset with nothing in it. */
  host.volumes.forEach(function(v){
    if (!v.nuc) return;
    if (v.key !== here && !nucs.length) return;
    var nl = { type: "segmentation", source: v.nuc, tab: "source", name: "nuclei",
               notSelectedAlpha: 0.05,
               objectAlpha: (alpha.nuc === undefined ? 0.4 : alpha.nuc) };
    if (nucs.length) nl.segments = nucs.slice();
    layers.push(nl);
  });

  /* ONE LAYER FOR EVERY PLACE THE POST MENTIONS, not one tab per place. A paragraph comparing
     four capillaries then opens as one picture, which is the thing a list of links cannot do. */
  if (list.length){
    layers.push({ type: "annotation", source: "local://annotations", tab: "annotations",
                  name: "mentioned here (" + list.length + ")",
                  annotationColor: o.color || "#f0883e",
                  annotations: list.map(function(h, i){
                    return { type: "point", id: "jl" + i, point: h.voxel.slice(),
                             description: h.kind === "nucleus"
                               ? ("nucleus " + h.id + (h.label ? " — " + h.label : ""))
                               : (h.label || h.volume || "") };
                  }) });
  }
  /* A POST MAY NAME CELLS AND NO PLACE. "Compare 864691135570733037 with 864691135234029401" has
     two references, both real, and neither is a coordinate -- so there is nothing to centre on, and
     the viewer opens on its own default with both segments already selected. Returning null there
     would have made the button do nothing, which is the worse of the two answers. */
  if (!pos && !roots.length && !nucs.length) return null;
  var st = { dimensions: host.dim,
             crossSectionScale: 3.0, layers: layers,
             selectedLayer: { layer: layers[0] && layers[0].name, visible: true },
             layout: { type: "xy-3d", orthographicProjection: true },
             showDefaultAnnotations: false };
  if (pos) st.position = pos.slice();
  if (host.bg){ st.crossSectionBackgroundColor = host.bg; st.perspectiveViewBackgroundColor = host.bg; }
  return st;
}

function url(hits, opts){
  var host = hostOf();
  if (!host) return "";
  /* A pasted viewer link is already a state somebody built, and opening OUR state instead would
     throw away whatever they had set up. Theirs wins. */
  var paste = (hits || []).filter(function(h){ return h.kind === "viewer"; })[0];
  if (paste && (hits || []).length === 1) return paste.url;
  var st = state(hits, opts);
  if (!st) return paste ? paste.url : "";
  var base = (typeof host.viewer === "function" ? host.viewer() : "") || "";
  return base + "#!" + encodeURIComponent(JSON.stringify(st));
}

/* One click handler for a whole container: the anchors carry an index into the scan of their own
   element's text, so nothing has to be re-scanned on click and no state is kept between renders. */
function wire(el, text, opts){
  if (!el) return;
  el.innerHTML = html(text, opts);
  var hits = scan(text);
  [].slice.call(el.querySelectorAll("a[data-jl]")).forEach(function(a){
    a.addEventListener("click", function(ev){
      ev.preventDefault();
      var h = hits[Number(a.getAttribute("data-jl"))];
      if (!h) return;
      var u = url([h], opts);
      if (u) window.open(u, "_blank", "noopener");
    });
  });
}

UJ.jumplink = { scan: scan, html: html, state: state, url: url, wire: wire,
                _esc: esc, _placeOf: placeOf };
})();
