/* core/organelles.js -- µJump's organelle reporting, as a shared module.
   Extracted from wjump_organelles.js on 2026-09-02, when Søren asked for the same reporting in
   χJump: "We should build the organelle reporting like in uJump and then also implement the
   filter."

   THE EXTRACTION IS THE POINT, not a tidy-up. wjump_organelle_data.js's own header says why the
   61-kind list is generated from core/ontology.js rather than copied: that list was factored out
   in the first place so ηJump would stop "hand-duplicating a 61-kind list that would drift from
   µJump's". Copying the CODE THAT READS IT into a third tool is the same mistake one level up --
   the rule "a vector kind needs both points" would then exist in three places and be true in
   however many of them somebody remembered to change. So ωJump and χJump load this one file, and
   a fix to the validation reaches both.

   NOTHING IN HERE KNOWS WHICH TOOL IT IS IN. The vocabulary arrives as UJ.organelleData, written
   by each tool's own build from the same ontology; the thing an organelle is reported against is
   a key the caller passes to groupId(). ωJump passes a nucleusKey it created
   ("jrc_mus-meissner-corpuscle-1:7"); χJump passes a cell key ("cb2/htem/pc_0" or "cb2:41").
   Both carry their dataset in the string, which is what makes them safe to write into a sheet
   with no dataset column.

   COORDINATES ARE VOXELS in every tool that loads this. ωJump's were nanometres until 2026-08-31,
   when Søren asked for voxels there too -- "a coordinate is only useful to the lab that published
   the volume if it is in the frame their own viewer shows". χJump has been voxels from the start.

   Everything else is deliberately identical to µJump: the same `organelle_location` POST, the
   same groupId/subIndex/subCount convention for one submission covering several structures, the
   same two-point handling for vector kinds, the same sheet, the same points. */
window.UJ = window.UJ || {};
UJ.organelles = (function(){
  "use strict";
  var DATA   = (UJ.organelleData && UJ.organelleData.groups) || [];
  var GROUPS = DATA;
  var KINDS  = GROUPS.reduce(function(a, g){ return a.concat(g.kinds); }, []);
  var BY_VALUE = {};
  KINDS.forEach(function(k){ BY_VALUE[k.value] = k; });

  function esc(s){ return String(s == null ? "" : s)
    .replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }

  /* <optgroup>-sectioned, exactly as µJump renders it: a flat 61-item dropdown is unusable and
     the topics are the reason the ontology is a list of groups rather than a list of kinds. */
  function optionsHtml(){
    return GROUPS.map(function(g){
      return "<optgroup label=\"" + esc(g.label) + "\">"
        + g.kinds.map(function(k){
            return "<option value=\"" + esc(k.value) + "\">" + esc(k.label) + "</option>"; }).join("")
        + "</optgroup>";
    }).join("");
  }

  /* "is this kind the two-point shape", asked of the DATA rather than by name. µJump learned this
     the hard way: a hardcoded ===\"cilium\" check meant nucleoplasmic reticulum type II silently
     got one coordinate field when it was added as the second vector kind. */
  function isVector(v){
    var k = BY_VALUE[v];
    if (k) return !!k.vector;
    /* No UJ.organelleData on this page: the µJump family carries the same ontology as
       core/ontology.js's ORGANELLE_KIND_BY_VALUE. Read rather than assumed false -- answering
       "not a vector" for a cilium would pair nothing and make half-filled rows. */
    var o = (typeof ORGANELLE_KIND_BY_VALUE !== "undefined") ? ORGANELLE_KIND_BY_VALUE[v] : null;
    return !!(o && o.vector);
  }
  function pointLabels(v){ var k = BY_VALUE[v]; return (k && k.pointLabels) || ["Point 1", "Point 2"]; }
  function labelOf(v){ var k = BY_VALUE[v]; return (k && k.label) || v; }
  function shortOf(v){ var k = BY_VALUE[v]; return (k && k.short) || v; }

  /* THE MARKERS IN A PASTED VIEWER LINK.                                          2026-09-03

     Søren: "I also wanted the option to paste url, like in xJump where you can log a lot of
     organelles of the same type quickly."

     Decoding a Neuroglancer state and pulling the point annotations out of it is not page
     knowledge -- it is the same six lines wherever it happens -- and the µJump family had no copy
     of it at all, so the alternative to putting it here was writing one into core/panel.js and a
     second into hjump.html. χJump keeps its own X.parsePoints, which does more (it reads the
     position too, and its callers need to tell "no markers" from "markers in the wrong layer"
     apart); this is the smaller shared thing the other forms need.

     THE LAYER NAME IS OPTIONAL and the µJump family passes nothing. χJump filters to its
     `organelles` layer because its own button arms exactly that layer, so a marker dropped
     elsewhere means something else. No other tool has that convention, and being fussy about a
     layer name nobody was told to use would reject the links people actually paste.

     A point is kept only if it is three finite numbers. Neuroglancer's annotation list also holds
     lines, boxes and ellipsoids, and a half-written point annotation can carry nulls. */
  function markersFromLink(text, layerName){
    if (!text || !String(text).trim()) return { ok:false, error:"nothing pasted", points:[] };
    var t = String(text).trim();
    var hash = t.indexOf("#!");
    if (hash >= 0) t = t.slice(hash + 2);
    if (/%7B|%22/i.test(t)){ try { t = decodeURIComponent(t); } catch (e){} }
    t = t.trim();
    if (t.charAt(0) !== "{")
      return { ok:false, error:"that does not look like a Neuroglancer link", points:[] };
    var st;
    try { st = JSON.parse(t); }
    catch (e){ return { ok:false, points:[],
      error:"that link's state is not valid JSON \u2014 copy the whole address bar, not part of it" }; }
    var pts = [];
    (st.layers || []).forEach(function(l){
      if (!l || l.type !== "annotation") return;
      if (layerName && l.name !== layerName) return;
      (l.annotations || []).forEach(function(a){
        if (a && a.point && a.point.length === 3
            && a.point.every(function(v){ return isFinite(Number(v)); }))
          pts.push(a.point.map(Number));
      });
    });
    return { ok:true, points: pts };
  }

  /* ONE PASTE OF MARKERS, ONE KIND -- how many markers does a row of this kind take?

     Søren, 2026-09-03: "we should be able to define what organelle you are submitting, so that
     you will not have to choose which organelle each of the points are afterwards."

     A point kind takes one marker per row, so N markers make N rows. A VECTOR kind takes two --
     a cilium is base + tip -- so N markers make ceil(N/2) rows, consumed in click order. Without
     that, choosing cilium and pasting six markers would make six half-filled rows and fail at the
     submit button, which is a worse fault than the one this feature fixes.

     ASKED OF isVector, not of the kind's name, for the reason written above it. And here rather
     than in a page because it is ontology arithmetic: the day µJump grows a paste box it reads
     this instead of restating the rule.

     An odd marker is KEPT as a row with an empty second point and reported, not dropped -- losing
     a click somebody made is worse than showing them an empty field they can see and fill. */
  function rowsFromPoints(kind, points){
    var pts = points || [], out = [];
    if (!isVector(kind)){
      pts.forEach(function(p){ out.push({ kind: kind, a: p, b: null }); });
      return { rows: out, odd: false };
    }
    for (var i = 0; i < pts.length; i += 2)
      out.push({ kind: kind, a: pts[i], b: (i + 1 < pts.length) ? pts[i + 1] : null });
    return { rows: out, odd: pts.length % 2 === 1 };
  }

  /* "2× centriole · 1× mitochondrion". Unrecognised kinds are shown rather than dropped -- a row
     written by an older build with a kind since renamed is still a real observation, and silently
     hiding it would make the read-back disagree with the sheet. */
  function countParts(list){
    return (list || []).filter(function(o){ return o && o.kind && o.n; })
      .map(function(o){ return { kind:o.kind, n:o.n, short: shortOf(o.kind),
                                 known: !!BY_VALUE[o.kind] }; })
      .sort(function(a, b){ return b.n - a.n || (a.short < b.short ? -1 : 1); });
  }

  /* Turn the form's rows into the submissions µJump posts. Rows come in as
       { kind, a:[x,y,z] | null, b:[x,y,z] | null }
     with strings or numbers; out come {kind, pointA, pointB} with pointB empty for point kinds.
     Validation is here rather than in the DOM so the rule "a vector kind needs BOTH points" is
     one testable statement instead of a condition buried in a click handler. */
  function buildSubs(rows){
    var out = [], missing = [];
    (rows || []).forEach(function(r, i){
      var vec = isVector(r.kind);
      var a = trip(r.a), b = vec ? trip(r.b) : "";
      if (!a || (vec && !b)) missing.push(i + 1);
      out.push({ kind: r.kind, pointA: a || "", pointB: b || "" });
    });
    if (missing.length)
      return { ok:false, error: "Fill in every coordinate for structure "
               + missing.join(", ") + (missing.length > 1 ? " — " : " — ")
               + "a two-point kind needs both.", subs: out };
    if (!out.length) return { ok:false, error:"Nothing to submit.", subs: out };
    return { ok:true, subs: out };
  }
  function trip(p){
    if (!p || p.length !== 3) return "";
    for (var i = 0; i < 3; i++){
      var v = String(p[i]).trim();
      if (v === "" || isNaN(Number(v))) return "";
    }
    return p.map(function(v){ return String(Math.round(Number(v))); }).join(",");
  }

  /* Pasting "x, y, z" into an x field fills all three, same as µJump. Kept here so the splitting
     rule is tested once rather than trusted in three input handlers. */
  function splitPaste(text){
    var p = String(text == null ? "" : text).split(/[\s,]+/).filter(function(s){ return s !== ""; });
    return p.length >= 3 && p.slice(0, 3).every(function(v){ return !isNaN(Number(v)); })
      ? p.slice(0, 3) : null;
  }

  /* One submission, several structures: the groupId ties them together and subIndex/subCount say
     how many there were, so a reader of the sheet can tell "three structures on one cell" from
     "three separate visits". Same convention as µJump's merged_split and organelle reports. */
  function groupId(nucleusKey, stamp){
    return (nucleusKey || "nonuc") + "_" + stamp + "_org";
  }

  return { GROUPS:GROUPS, KINDS:KINDS, BY_VALUE:BY_VALUE, optionsHtml:optionsHtml,
           isVector:isVector, pointLabels:pointLabels, labelOf:labelOf, shortOf:shortOf,
           countParts:countParts, buildSubs:buildSubs, splitPaste:splitPaste, groupId:groupId,
           rowsFromPoints:rowsFromPoints, markersFromLink:markersFromLink };
})();
