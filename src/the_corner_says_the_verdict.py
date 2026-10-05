# -*- coding: utf-8 -*-
u"""The corner says what the cell IS, where it is, and what else is drawn.                2026-10-04

Søren, on the exported picture: *"Instead of the cell and nucleus IDs, I want the verdict on the
cell type and the coordinates of the center of the nucleus. If there are organelles included, I want
the type(s) of organelles not their numbers."*

A ROOT ID IS NOT A FINDING. "Cell 864691136194733032 / Nucleus 487264" is two database keys: true,
checkable, and of no use to anyone reading a figure. What a figure has to carry is the claim —
*this is a pyramidal cell* — the place anyone can go and look for themselves, and what else is in
the picture. The ids stay in the Discussion post and in the file name, where they are the right
thing; the corner block becomes the three facts a reader needs.

SO THE BLOCK STOPS BEING A LIST OF SURFACES. `legend()` used to return one entry per drawn surface
and the exporter printed their names. That is the wrong shape for what he asked for: the verdict
belongs to the CELL and not to any one surface, the coordinate belongs to the NUCLEUS, and the
organelles want collapsing rather than listing. It now returns a description of the specimen:

    { verdict: "Pyramidal cell", atVox: [216448, 164096, 21360], kinds: ["Mitochondrion"] }

and the three callers fill it from what each already has in hand.

KINDS, NOT INSTANCES — which is the "not their numbers" part. A picture with twenty mitochondria in
it says "Mitochondrion" once. The rule is the `what` contract this file already keeps: a surface
that is not the cell and not the nucleus is a structure, and its label is what it IS. Duplicates
collapse case-insensitively, and isolation still applies, because a block naming something the
reader cannot see is worse than no block.

WHERE EACH CALLER GETS THE VERDICT, with no new plumbing in three of the four:

  the cell card     the sibling [data-celltype] button in the same row — the one the PowerPoint
                    export reads — and window.CUR_CELLTYPE_DISPLAY when that button is marked
                    data-follow-live. That is exactly the precedence ujump.html's own two click
                    handlers use, and it exists because the attribute goes stale the moment a
                    community report lands: "downloads kept saying Unclassified after the headline
                    had moved on". Copied rather than invented, and said so here.
  the Discussion    cfg.typeOf(nucleusId), added to emPreviewHost below — the one new hook. The
                    page's own long name, so the picture says "Oligodendrocyte" and not "oligo".
  the tracing pad   #tracingType, the card's own cell-type select, whose title already says it is
                    "suggested from the nucleus or root ID below, by the same precedence the rest
                    of the tool uses".

AND THE COORDINATE IS THE NUCLEUS'S OWN CENTROID, not the point somebody clicked. In the Discussion
those are different things — the preview opens at a coordinate in a sentence, and the nucleus it
finds is up to 4 µm away — and the centroid is the one that means anything to a reader. Voxels, not
micrometres, for the reason ujump.html's voxelToPasteStr already gives: "µm can't be pasted back
into MICrONS/Neuroglancer, so voxel wins over readability here." Marked `vox` on the picture,
because a figure travels away from the tool that made it.

THE PAD'S SUBJECT GETS A NAME AT LAST. core/tracingcard.js passed `label` for the siblings and the
ghosts but not for the subject — the traced structure, the thing the pad exists to draw — so the one
surface the picture is OF was the one surface the corner never named. padLoftName() was already
defined sixty lines above it.

Check: shotcheck.js, "the corner says what the specimen is".
Run: python3 src/the_corner_says_the_verdict.py
     python3 src/build_stamps.py
     node shotcheck.js
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    print(rel)
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("core/mesh3d.js", [

 (u"the panel is told what the specimen is",
  u'''    var ALL = [{ d: MAIN, tint: o.tint || null, what: o.what || "", label: o.label || "",
                 alpha: (o.alpha === undefined ? 1 : o.alpha) }].concat(GHOSTS);''',
  u'''    var ALL = [{ d: MAIN, tint: o.tint || null, what: o.what || "", label: o.label || "",
                 alpha: (o.alpha === undefined ? 1 : o.alpha) }].concat(GHOSTS);
    /* WHAT THE SPECIMEN IS, as opposed to what each surface is. Søren: "I want the verdict on
       the cell type and the coordinates of the center of the nucleus." Neither of those belongs to
       a surface — the verdict is about the cell whether or not the cell is the one being drawn,
       and the coordinate is the nucleus's centroid even when the nucleus is hidden. So it rides
       beside the surfaces rather than on one of them. 2026-10-04. */
    var ABOUT = o.about || null;'''),

 (u"...and the legend describes the specimen",
  u'''             /* ── WHAT IS ON SCREEN, IN ORDER ───────────────────────────────────────  2026-10-04
                Only what is actually drawn: the isolate button hides a surface, and a corner block
                naming something the reader cannot see is worse than no block. Unnamed surfaces are
                left out rather than listed as blanks. */
             legend: function(){
               return ALL.filter(function(it){ return it.label && isoShows(it); })
                         .map(function(it){
                           return { what: it.what, label: it.label,
                                    tint: it.tint ? it.tint.slice() : null };
                         });
             },''',
  u'''             /* ── WHAT THE PICTURE IS OF ────────────────────────────────────────────  2026-10-04
                Three facts, not a list of surfaces. Søren: "Instead of the cell and nucleus IDs, I
                want the verdict on the cell type and the coordinates of the center of the nucleus.
                If there are organelles included, I want the type(s) of organelles not their
                numbers."

                KINDS, NOT INSTANCES. A cell with twenty mitochondria drawn in it says
                "Mitochondrion" once. The rule is the `what` contract this file already keeps:
                anything that is not the cell and not the nucleus is a structure, and its label is
                what it is rather than which one it is. Case-insensitive, because one caller
                capitalises a layer name and another may not.

                ISOLATION STILL APPLIES to the kinds — hide every mitochondrion and the word goes —
                but NOT to the verdict or the place. Isolating the nucleus does not make the cell a
                different cell, and a figure of a nucleus alone still wants to say whose it is. */
             legend: function(){
               var kinds = [], seen = {};
               ALL.forEach(function(it){
                 if (!it.label || !isoShows(it)) return;
                 if (it.what === "cell" || it.what === "nucleus") return;
                 var k = String(it.label).toLowerCase();
                 if (seen[k]) return;
                 seen[k] = 1; kinds.push(it.label);
               });
               return { verdict: (ABOUT && ABOUT.verdict) ? String(ABOUT.verdict) : "",
                        atVox: (ABOUT && ABOUT.atVox && ABOUT.atVox.length === 3)
                               ? ABOUT.atVox.slice() : null,
                        kinds: kinds };
             },'''),

 (u"the cell card reads the verdict off its own row",
  u'''    function decorate(dl){
      if (!dl || dl.getAttribute("data-m3d")) return;''',
  u'''    /* ── THE VERDICT, FROM THE BUTTON NEXT DOOR ──────────────────────────────────────────
       µJump renders three buttons in one row — "3D model", "PowerPoint", "Compute volume" — and
       the last two already carry data-celltype, because the PowerPoint slide has always been
       labelled with the cell type. The 3D panel sits in the same row and had never asked.

       data-follow-live IS NOT DECORATION. ujump.html's own two click handlers prefer the live
       window.CUR_CELLTYPE_DISPLAY over the attribute when that flag is set, and the comment on
       meshDlButtonHtml() says why: the attribute is baked at render time and goes stale the moment
       a community report resolves, so "downloads kept saying Unclassified even after the on-screen
       headline had already moved on". The same precedence, read at draw time, which is as live as
       a click. A page with no such sibling — δJump, βJump — gets "" and the line is left out.
       2026-10-04. */
    function verdictNear(dl){
      try {
        var row = dl.parentNode;
        var el = row && row.querySelector("[data-celltype]");
        if (!el) return "";
        if (el.getAttribute("data-follow-live") === "1" && window.CUR_CELLTYPE_DISPLAY)
          return String(window.CUR_CELLTYPE_DISPLAY);
        return String(el.getAttribute("data-celltype") || "");
      } catch (_e){ return ""; }
    }

    /* And the nucleus's own centroid. The sibling's data-coords FIRST, because that is the string
       the PowerPoint export prints and two labels for one cell that disagree would be worse than
       either; the nucleus table only when there is no such sibling to ask. Voxels in both. */
    function nucVoxNear(dl, nucId){
      var v = null, s, cfg;
      try {
        var el = dl.parentNode && dl.parentNode.querySelector("[data-coords]");
        s = el ? String(el.getAttribute("data-coords") || "") : "";
        if (s){
          v = s.split(",").map(function(t){ return parseInt(t, 10); });
          if (v.length === 3 && v.every(function(n){ return isFinite(n); })) return v;
        }
      } catch (_e){}
      try {
        cfg = (typeof window.emPreviewHost === "function") ? window.emPreviewHost() : null;
        if (cfg && typeof cfg.nucleusAt === "function" && nucId) return cfg.nucleusAt(nucId) || null;
      } catch (_e){}
      return null;
    }

    function decorate(dl){
      if (!dl || dl.getAttribute("data-m3d")) return;'''),

 (u"...and passes them to the panel",
  u'''            var opts2 = { what: "cell", lead: lead,
                          /* For the exported picture's corner and for the file's name. Both ids
                             are in hand here and neither was being passed on. 2026-10-04. */
                          label: "Cell " + root,
                          saveName: "cell_" + root,
                          emptyMessage: "This cell has no mesh geometry to draw." };''',
  u'''            /* The file keeps the root id, because a folder of pictures wants a key you can
               sort and search. The PICTURE gets the verdict and the place, which is what Søren
               asked for: "instead of the cell and nucleus IDs".

               AND THE ID COMES BACK WHEN THERE IS NOTHING ELSE. μJump always has a verdict, even
               if it is "Unclassified cell"; ωJump and χJump browse volumes with no cell-type
               predictions and no nucleus table at all, so without this their pictures would carry
               a scale bar, a wordmark and nothing to say which cell it is. An unlabelled figure is
               worse than one labelled with a key. 2026-10-04. */
            var vd = verdictNear(dl), vx = nucVoxNear(dl, nucId);
            var opts2 = { what: "cell", lead: lead,
                          about: { verdict: vd || (vx ? "" : "Cell " + root), atVox: vx },
                          saveName: "cell_" + root,
                          emptyMessage: "This cell has no mesh geometry to draw." };'''),

 (u"...so the nucleus no longer labels itself",
  u'''                opts2.ghosts = [{ geo: ng, what: "nucleus", label: "Nucleus " + nucId,
                                  tint: NUC_TINT, alpha: 1 }];''',
  u'''                opts2.ghosts = [{ geo: ng, what: "nucleus", tint: NUC_TINT, alpha: 1 }];'''),
])


edit("core/mesh3dshot.js", [

 (u"the corner block is three facts",
  u'''  function legendLines(){
    var L = [];
    try { L = m3d().legend() || []; } catch (_e){ return []; }
    var names = L.map(function(q){ return q.label; }).filter(Boolean);
    if (names.length <= MAX_LINES) return names;
    return names.slice(0, MAX_LINES - 1)
                .concat(["+ " + (names.length - (MAX_LINES - 1)) + " more"]);
  }''',
  u'''  /* ── WHAT IT IS, WHERE IT IS, WHAT ELSE IS IN IT ──────────────────────────────────────────
     Søren: "I want the verdict on the cell type and the coordinates of the center of the nucleus.
     If there are organelles included, I want the type(s) of organelles not their numbers."

     Each line is left out when there is nothing to put in it, so a panel that knows nothing gets a
     clean picture rather than three blanks — and the caption below, which reads this same list,
     cannot then disagree with the corner about what is in the frame.

     `vox` ON THE COORDINATE, which the tool's own on-screen labels do not bother with because they
     are surrounded by a sentence that says it. A posted picture has no sentence around it. Voxels
     rather than micrometres for ujump.html's reason: they paste straight back into Neuroglancer's
     position box and micrometres do not. 2026-10-04. */
  function legendLines(){
    var L = null;
    try { L = m3d().legend(); } catch (_e){ return []; }
    if (!L) return [];
    var out = [], k = L.kinds || [];
    if (L.verdict) out.push(L.verdict);
    if (L.atVox) out.push(L.atVox[0] + ", " + L.atVox[1] + ", " + L.atVox[2] + " vox");
    if (k.length) out.push(k.length <= MAX_KINDS ? k.join(", ")
                           : k.slice(0, MAX_KINDS - 1).join(", ")
                             + " + " + (k.length - (MAX_KINDS - 1)) + " more");
    return out;
  }'''),

 (u"...and the cap is on the kinds, not the lines",
  u'''  var MAX_LINES = 4;''',
  u'''  /* Three lines at most, so the cap is now on how many KINDS share the third one rather than on
     how many lines there are. 2026-10-04. */
  var MAX_KINDS = 3;'''),
])


edit("core/empreview.js", [

 (u"the preview is told what it found",
  u'''function drawMeshes(host, parts){''',
  u'''/* ── WHAT THE DISCUSSION'S PREVIEW IS OF ──────────────────────────────────────────────────
   The verdict from the page's own long name, and the NUCLEUS'S CENTROID rather than the clicked
   point — in a Discussion post those are different things, since the preview opens where somebody
   wrote a coordinate and the nucleus it finds may be up to 4 µm away. The centroid is the one a
   reader can act on. Falls back to the point itself when there is no nucleus to centre on, and to
   nothing at all on a page with no nucleus table. 2026-10-04. */
function aboutAt(at, cfg, pos){
  var v = null, t = "";
  try { if (cfg && typeof cfg.nucleusAt === "function" && at && at.nuc) v = cfg.nucleusAt(at.nuc); }
  catch (_e){}
  try { if (cfg && typeof cfg.typeOf === "function" && at && at.nuc) t = cfg.typeOf(at.nuc) || ""; }
  catch (_e){}
  return { verdict: t, atVox: v || pos || null };
}

function drawMeshes(host, parts, about){'''),

 (u"...and passes it on",
  u'''  M.show(host, geos[leadAt], { ghosts: ghosts, view: host.__empView,
                               what: parts[leadAt].what,
                               label: parts[leadAt].label || "",
                               saveName: parts[leadAt].saveName || "cell",''',
  u'''  M.show(host, geos[leadAt], { ghosts: ghosts, view: host.__empView,
                               what: parts[leadAt].what,
                               about: about || null,
                               saveName: parts[leadAt].saveName || "cell",'''),

 (u"the cell it drew",
  u'''      parts.unshift({ what: "cell", mesh: m, unitNm: 1000,
                      label: "Cell " + at.root, saveName: "cell_" + at.root });
      drawMeshes(host3d, parts);''',
  u'''      parts.unshift({ what: "cell", mesh: m, unitNm: 1000, saveName: "cell_" + at.root });
      drawMeshes(host3d, parts, aboutAt(at, cfg, pos));'''),

 (u"...and the nucleus it drew",
  u'''      parts.push({ what: "nucleus", mesh: n, unitNm: 1000, label: "Nucleus " + at.nuc });
      drawMeshes(host3d, parts);''',
  u'''      /* saveName too, which it has never had: a nucleus-led preview fell through to the
         literal "cell" and every file it saved was called that. 2026-10-04. */
      parts.push({ what: "nucleus", mesh: n, unitNm: 1000, saveName: "nucleus_" + at.nuc });
      drawMeshes(host3d, parts, aboutAt(at, cfg, pos));'''),
])


edit("core/tracingcard.js", [

 (u"the pad names what it is drawing",
  u'''    tracingM3D().show(host, geo, { lead: lead, ghosts: drawn, view: PAD3D_VIEW,
                                tint: pad3DTint(lofts[subject].inst),
                                emptyMessage: "Nothing to draw yet." });''',
  u'''    /* ── THE SUBJECT HAS A NAME, AND THE PAD KNOWS THE CELL ──────────────────────────────
       The siblings and the ghosts were labelled from the day the corner block was written and the
       SUBJECT was not — the traced structure, the one thing the picture is of, was the one surface
       that never reached the legend. padLoftName() is sixty lines above.

       And the verdict and the place come off the card's own two fields. #tracingType's title says
       it is "suggested from the nucleus or root ID below, by the same precedence the rest of the
       tool uses: verified, then community-reported, then the MICrONS prediction" — so reading it
       here is reading that precedence rather than inventing a second one. 2026-10-04. */
    var padType = "", padVox = null;
    try {
      var te = document.getElementById("tracingType");
      padType = te && te.value && te.value !== "traced" ? String(te.value) : "";
      var ce = document.getElementById("tracingCellAt");
      var cv = ce && ce.value ? String(ce.value).split(",").map(function(t){
                 return parseInt(t, 10); }) : null;
      if (cv && cv.length === 3 && cv.every(function(n){ return isFinite(n); })) padVox = cv;
      else if (typeof window.tracingNucCentroid === "function"){
        var nc = window.tracingNucCentroid(pad3DIds().nuc);
        if (nc) padVox = [nc.xVox, nc.yVox, nc.zVox];
      }
    } catch (_e){}
    tracingM3D().show(host, geo, { lead: lead, ghosts: drawn, view: PAD3D_VIEW,
                                tint: pad3DTint(lofts[subject].inst),
                                label: padLoftName(lofts[subject]),
                                saveName: (padLoftName(lofts[subject]) || "tracing")
                                            .toLowerCase().replace(/[^a-z0-9]+/g, "_"),
                                about: { verdict: padType, atVox: padVox },
                                emptyMessage: "Nothing to draw yet." });'''),
])


edit("ujump.html", [

 (u"the page says what a nucleus is, in words",
  u'''      cellAt:function(rid){
        try{
          const i=rootIdToIndex(rid);
          return i<0?null:[NX[i],NY[i],NZ[i]];
        }catch(_e){ return null; }
      },''',
  u'''      cellAt:function(rid){
        try{
          const i=rootIdToIndex(rid);
          return i<0?null:[NX[i],NY[i],NZ[i]];
        }catch(_e){ return null; }
      },
      /* THE LONG NAME, not the code. jumpLinkHost().nucleus() already hands back typeInfo().name --
         "23P", "oligo" -- which is the right thing in a link's tooltip and the wrong thing in the
         corner of a picture somebody is about to post. longName() is this page's own table and is
         what the headline uses. Søren, on the exported figure: "I want the verdict on the cell
         type". 2026-10-04. */
      typeOf:function(nid){
        try{
          const i=nidToIndex(nid);
          if(i<0)return "";
          const t=typeInfo(i);
          return (t&&t.name&&t.name!=="Unclassified")?longName(t.name):"";
        }catch(_e){ return ""; }
      },'''),
])
print("\nNow: python3 src/build_stamps.py, then node shotcheck.js")
