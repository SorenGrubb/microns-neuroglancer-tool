# -*- coding: utf-8 -*-
u"""A vessel is longer than the box, so it is chosen rather than caught.                 2026-10-09

Søren: *"What if I want to include vasculature together with the bounding box I have, but it does
not download it because the bounding box is smaller than the vasculature. Maybe it would be better
if the vasculature could be added in some other way? Like for the cells? Then I could choose
whether to include it or not."*

HE IS RIGHT, AND IT IS YESTERDAY'S MISTAKE OF MINE. I wrote, in the note for the vessel work, that
a vessel "travels in a region box's notebook by the box test, which for a vessel is exactly the
right question". It is exactly the WRONG question. The box test keeps a tracing whose CENTRE is
inside the box, and a capillary's centre is wherever its middle happens to fall -- draw a box round
one endothelial cell on a 60 um capillary and the vessel's centre is 25 um outside it. The whole
reason to put a vessel in a scene is that it runs through the picture and out of it. A rule written
for organelles was applied to the one kind of object it cannot describe, and I said so in a project
doc as though it were a feature.

SO IT IS CHOSEN, LIKE THE CELLS. A tick on the box row; the vessels come in WHOLE, every segment,
box or no box. Two readings:

    all traced vessels          -- the default, which is what he asked for
    only the kinds ticked above -- the Vasculature list in Filter and show, the control he already
                                   has, used the way "Cell 3D model" uses the filter result

and asking for the ticked kinds with none ticked REFUSES rather than writing TRACINGS = [] -- a
notebook that looks like it worked and downloads nothing is the worst of the three outcomes, which
core/regionbox.js already says about meshes.

AND THE BOX TEST NO LONGER APPLIES TO A VESSEL AT ALL. Leaving it would mean two ways in, which is
the architecture this project keeps paying for; a vessel sitting inside the box would arrive
without being chosen and a vessel outside it would not, and nobody could say which rule had
spoken. One rule: the tick.

ONE DEFINITION, FIVE CALL SITES. The region box is hand-written in ujump, djump, pjump and
hjump and shared in core/regionbox.js -- five copies of one control, which is how the last four
corrections reached some pages and not others. So the tick's markup and its reading are
UJ.blender.vesselTickHtml() and UJ.blender.vesselWantFrom(row), in core/blenderexport.js, and each
of the five inserts one expression and passes one option.

A VESSEL CARRIES ITS COLOUR, which an organelle deliberately does not (2026-09-22: sending the
pad's per-structure colour beat colour_policy's rule and made nine lysosomes nine colours). There
is no policy for a capillary, and the colour is part of the vocabulary in core/tracing.js -- it has
to be the same magenta in the pad, the viewer and the scene or the picture lies.

Check: vesselboxcheck.js (new)
Run: python3 src/a_vessel_is_chosen_not_caught.py
     python3 src/build_stamps.py
     node vesselboxcheck.js
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
        n = s.count(old)
        assert n == 1, "@NM@ (@F@): @N@".replace("@NM@", name).replace("@F@", os.path.basename(P)).replace("@N@", str(n))
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


# ── 1. the tick, and what it means ────────────────────────────────────────────────────────────
TICK = u'''
  /* ── THE TRACED VASCULATURE TICK ─────────────────────────────────────────────  2026-10-09
     Søren: *"the bounding box is smaller than the vasculature... maybe it could be added in some
     other way? Like for the cells? Then I could choose whether to include it or not."*

     The markup and the reading live here, not in the five region-box panels, because there ARE
     five -- ujump, djump, pjump and hjump each carry their own copy of that control and
     core/regionbox.js carries the fifth. Every correction to it so far has reached some of them.
     Each one now inserts one expression and passes one option.

     Returns null when unticked; {want:"all"} or {want:[kinds]}; {error} when he asked for the
     ticked kinds and ticked none, because an empty TRACINGS that looks like it worked is the
     outcome core/regionbox.js already refuses for meshes. */
  function vesselTickHtml(){
    var V = (window.UJ && UJ.tracing && UJ.tracing.VESSELS) || null;
    if (!V || !V.length) return "";
    return '<label class="colab-vessels-lab" style="font-size:11px;color:var(--mut);display:flex;'
      + 'align-items:center;gap:3px;cursor:pointer" title="Hand-traced vessels go into the scene '
      + 'WHOLE, every segment, however far they run outside this box \\u2014 a capillary is longer '
      + 'than any box you would draw round a cell on it. Nothing is cut. Blender file only.">'
      + '<input type="checkbox" class="colab-vessels">Traced vasculature</label>'
      + '<select class="colab-vessels-which" style="font-size:11px;padding:1px 2px;width:auto;'
      + 'background:var(--inset);color:var(--ink);border:1px solid var(--line);border-radius:4px" '
      + 'title="ALL brings in every vessel anybody has traced in this dataset. TICKED brings in '
      + 'only the kinds ticked in the Vasculature list in Filter and show \\u2014 the same control, '
      + 'used the way Cell 3D model uses the filter result.">'
      + '<option value="all">all traced vessels</option>'
      + '<option value="ticked">only the kinds ticked in Filter and show</option></select>';
  }
  function vesselWantFrom(row){
    var tick = row && row.querySelector(".colab-vessels");
    if (!tick || !tick.checked || tick.disabled) return null;
    var which = row.querySelector(".colab-vessels-which");
    if (!which || which.value === "all") return { want: "all" };
    /* The Vasculature ticks in Filter and show, wherever that panel is on this page. Read from
       the document rather than handed in, because all five region boxes would otherwise each
       need to know where their page keeps it. */
    var kinds = [];
    try {
      kinds = Array.prototype.map.call(document.querySelectorAll(".fvessel:checked"),
        function(cb){ return cb.value; });
    } catch (_e){ kinds = []; }
    if (!kinds.length)
      return { error: "No vessel kind is ticked in the Vasculature list in Filter and show, so "
             + "\\u201conly the kinds ticked\\u201d would put nothing in the notebook. Tick one "
             + "there, or choose \\u201call traced vessels\\u201d." };
    return { want: kinds };
  }
'''

ANCHOR = u'''  return {buildNotebook, downloadNotebook, filenameFor, brandFromPage'''

edit("core/blenderexport.js", [
    (u"the tick and its reading, in one place", ANCHOR, TICK + ANCHOR),
    (u"...on the module",
     u'''  return {buildNotebook, downloadNotebook, filenameFor, brandFromPage};''',
     u'''  return {buildNotebook, downloadNotebook, filenameFor, brandFromPage,
          vesselTickHtml, vesselWantFrom, vesselTickSync};'''),
])
print("done 1")

# ── 2. one way in for a vessel ────────────────────────────────────────────────────────────────
OLD_FILT = u'''    var leftOut = 0;
    tracings = tracings.filter(function(t){'''
NEW_FILT = u'''    var leftOut = 0;
    /* ── A VESSEL IS CHOSEN, NEVER CAUGHT ──────────────────  2026-10-09
       Søren: *"the bounding box is smaller than the vasculature."* It is, and it always will
       be: a box is drawn round a cell and a capillary runs out of the picture, which is why you
       want it in the scene. The box test asks where a tracing's CENTRE is, and for a vessel that
       is a question about nothing.

       `is_vessel` is set by vesselTracingsFor() on exactly the vessels the tick asked for, so a
       flagged one travels whole and an unflagged one is refused — including one sitting inside
       the box, which would otherwise be a second way in, and two ways in is how a rule stops
       being a rule. See src/a_vessel_is_chosen_not_caught.py. */
    var isVesselKind = function(t){
      try { return !!(UT && UT.isVessel && UT.isVessel(String((t && (t.instanceOf || t.kind)) || ""))); }
      catch (_e){ return false; }
    };
    tracings = tracings.filter(function(t){
      if (t && t.is_vessel) return true;
      if (isVesselKind(t)) return false;'''

OLD_ROW = u'''      lines.push("    {'name': " + pyStr(t.name || "traced")
                   + ", 'kind': " + pyStr(t.kind || "")
                   + ", 'type': " + pyStr(t.type || "traced")
                   + ", 'traced_by': " + pyStr(t.traced_by || "")'''
NEW_ROW = u'''      /* A VESSEL CARRIES ITS COLOUR (2026-10-09). The note below is right about organelles and
         stays: colour_policy owns the scene's palette. There is no policy for a capillary, and
         its colour is declared beside its kind in core/tracing.js precisely so it is the same
         magenta in the pad, the viewer and the scene. */
      var vcol = "";
      try {
        if (t && t.is_vessel && UT && UT.vesselOf)
          vcol = String(t.color || (UT.vesselOf(t.kind) || {}).color || "");
      } catch (_ec){ vcol = ""; }
      lines.push("    {'name': " + pyStr(t.name || "traced")
                   + ", 'kind': " + pyStr(t.kind || "")
                   + ", 'type': " + pyStr(t.type || "traced")
                   + (vcol ? ", 'color': " + pyStr(vcol) : "")
                   + ", 'traced_by': " + pyStr(t.traced_by || "")'''

# ── 3. and they are fetched, whole, when the tick asks ────────────────────────────────────────
OLD_DS = u'''  async function downloadNotebook(opts){
    opts = Object.assign({}, opts, { tracings: await datasetTracingsFor(opts) });'''
NEW_DS = u'''  /* ── THE VESSELS THE TICK ASKED FOR, WHOLE ──────────────  2026-10-09
     datasetTracingsFor() asks the dataset for the outlines filed against the export's CELLS, and
     a vessel is filed against no cell, so it could never come back from that fetch. This is its
     own read: the vessel index (one sheet scan, cached) names the segments, and fetchMany brings
     their contours 20 to a request. Every segment of the chosen vessels, with no box anywhere in
     it. See src/a_vessel_is_chosen_not_caught.py. */
  async function vesselTracingsFor(opts){
    var ask = opts && opts.vessels;
    if (!ask || ask.error || !ask.want) return [];
    if (typeof tracedVesselIndex !== "function"
        || !(window.UJ && UJ.tracing && UJ.tracing.fetchMany)) return [];
    var idx;
    try { idx = await tracedVesselIndex(); } catch (_e){ return []; }
    var kinds = (ask.want === "all") ? null : [].concat(ask.want);
    var segs = [];
    ((idx && idx.vessels) || []).forEach(function(v){
      if (kinds && kinds.indexOf(v.kind) < 0) return;
      (v.segments || []).forEach(function(s){ segs.push(s); });
    });
    if (!segs.length) return [];
    var qs = (typeof tracedOutlinesDsQS === "function") ? tracedOutlinesDsQS() : "";
    var got;
    try { got = await UJ.tracing.fetchMany(REPORT_ENDPOINT, segs, qs); }
    catch (_e2){ return []; }
    var out = [];
    segs.forEach(function(s){
      var x = got[s.structureId];
      if (!x || !x.st || !(x.st.rings || []).length) return;
      var t = x.st;
      /* The flag the filter reads, and the two names the notebook writes from. */
      t.is_vessel = 1;
      t.type = t.cellType || "vessel";
      t.traced_by = (t.contributors && t.contributors.length) ? t.contributors.join(", ")
                                                              : (t.tracedBy || "");
      out.push(t);
    });
    return out;
  }
  async function downloadNotebook(opts){
    var vessels = await vesselTracingsFor(opts);
    opts = Object.assign({}, opts, { tracings: (await datasetTracingsFor(opts)).concat(vessels) });'''

edit("core/blenderexport.js", [
    (u"a vessel is chosen, never caught", OLD_FILT, NEW_FILT),
    (u"...and carries its colour", OLD_ROW, NEW_ROW),
    (u"...and the chosen ones are fetched whole", OLD_DS, NEW_DS),
])
print("done 2")

# ── 4. the tick follows the Blender tick, in one place ────────────────────────────────────────
OLD_T2 = u'''  function vesselWantFrom(row){'''
NEW_T2 = u'''  /* Blender-only, for the same reason the Nuclei tick is: the EM/segmentation notebook writes
     PNG sections and has nowhere to put a 3D model. Each of the five panels already has a closure
     that follows its own Blender tick; this is the one line they add to it. */
  function vesselTickSync(row, on){
    var tick = row && row.querySelector(".colab-vessels");
    var lab = row && row.querySelector(".colab-vessels-lab");
    var which = row && row.querySelector(".colab-vessels-which");
    if (!tick) return;
    tick.disabled = !on;
    if (which) which.disabled = !on;
    if (lab){
      lab.style.opacity = on ? "" : "0.45";
      if (!on) lab.title = "Traced vessels are part of the Blender scene only \\u2014 the "
        + "EM/segmentation notebook has no 3D step. Tick \\u201cBlender file\\u201d to enable this.";
    }
  }
  function vesselWantFrom(row){'''

edit("core/blenderexport.js", [
    (u"the tick follows the Blender tick", OLD_T2, NEW_T2),
])

# ── 5. the five region boxes ──────────────────────────────────────────────────────────────────
# One expression in the markup, one option on the call, one line in the sync closure. The pages
# differ in whitespace and quoting, so each is anchored on its own spacer and its own call.
PAGE_MARKUP_OLD = u'''      +'<span style="flex:1"></span>\''''
PAGE_MARKUP_NEW = u'''      /* TRACED VASCULATURE (2026-10-09). Markup from core/blenderexport.js, because five
         region-box panels with five copies of one control is how the last four corrections
         reached some pages and not others. */
      +((window.UJ&&UJ.blender&&UJ.blender.vesselTickHtml)?UJ.blender.vesselTickHtml():"")
      +'<span style="flex:1"></span>\''''

for _pg in ("ujump.html", "djump.html", "pjump.html", "hjump.html"):
    edit(_pg, [(u"the Traced vasculature tick on the box row", PAGE_MARKUP_OLD, PAGE_MARKUP_NEW)])

CORE_OLD = u'''        + (can.blender ? '<span style="flex:1"></span>\''''
CORE_NEW = u'''        /* TRACED VASCULATURE (2026-10-09) -- see the same insertion in the four hand-written
           panels. The markup is core/blenderexport.js's, so there is one control. */
        + ((window.UJ && UJ.blender && UJ.blender.vesselTickHtml) ? UJ.blender.vesselTickHtml() : "")
        + (can.blender ? '<span style="flex:1"></span>\''''
edit("core/regionbox.js", [
    (u"the Traced vasculature tick on the box row", CORE_OLD, CORE_NEW),
])
print("done 3")

# ── 6. and the option on the call ─────────────────────────────────────────────────────────────
# The refusal comes first: a notebook that says it has the vasculature and has none is the
# outcome this whole change exists to prevent.
GATE = u'''      /* TRACED VASCULATURE (2026-10-09). Read before anything is built, like every other
         refusal in this handler, and said rather than silently written as an empty list. */
      var _ves=(window.UJ&&UJ.blender&&UJ.blender.vesselWantFrom)?UJ.blender.vesselWantFrom(row):null;
      if(_ves&&_ves.error){ alert(_ves.error); return; }
'''

for _pg, _ind in (("ujump.html", u"        "), ("djump.html", u"        "),
                  ("pjump.html", u"        "), ("hjump.html", u"      ")):
    edit(_pg, [
        (u"the vasculature choice is read, and refused loudly",
         _ind + u"UJ.blender.downloadNotebook({",
         GATE.replace(u"      ", _ind, 1).replace(u"\n         ", u"\n" + _ind + u"   ")
             .replace(u"\n      var", u"\n" + _ind + u"var")
             .replace(u"\n      if(", u"\n" + _ind + u"if(")
         + _ind + u"UJ.blender.downloadNotebook({"),
        (u"...and handed to the export",
         _ind + u"  datasetId:UJ.cfg.id,datasetLabel:UJ.cfg.label,",
         _ind + u"  vessels:_ves,\n" + _ind + u"  datasetId:UJ.cfg.id,datasetLabel:UJ.cfg.label,"),
    ])

CORE_GATE_OLD = u'''        var vxEl = row.querySelector(".colab-vasc-extent");
        UJ.blender.downloadNotebook({
          datasetId: UJ.cfg.id, datasetLabel: UJ.cfg.label,'''
CORE_GATE_NEW = u'''        var vxEl = row.querySelector(".colab-vasc-extent");
        /* TRACED VASCULATURE (2026-10-09) -- the same two lines as the four hand-written panels,
           for the same reason: a notebook that says it has the vasculature and has none is the
           outcome this change exists to prevent. */
        var _ves = (window.UJ && UJ.blender && UJ.blender.vesselWantFrom)
                 ? UJ.blender.vesselWantFrom(row) : null;
        if (_ves && _ves.error){ alert(_ves.error); return; }
        UJ.blender.downloadNotebook({
          vessels: _ves,
          datasetId: UJ.cfg.id, datasetLabel: UJ.cfg.label,'''
edit("core/regionbox.js", [
    (u"the vasculature choice is read, refused loudly, and handed over",
     CORE_GATE_OLD, CORE_GATE_NEW),
])
print("done 4")

# ── 7. ...and the tick dims with the Blender tick, in each panel's own closure ────────────────
SY = u'''        /* TRACED VASCULATURE, 2026-10-09: Blender-only, for the same reason the rest of this
           closure's ticks are. The one line each panel adds. */
        if(window.UJ&&UJ.blender&&UJ.blender.vesselTickSync)UJ.blender.vesselTickSync(row,bl.checked);
'''
edit("ujump.html", [
    (u"the tick dims with the Blender tick",
     u"      const sync=()=>{\n        nu.disabled=!bl.checked;",
     u"      const sync=()=>{\n" + SY + u"        nu.disabled=!bl.checked;"),
])
edit("djump.html", [
    (u"the tick dims with the Blender tick",
     u"      const sync=()=>{\n        help.style.display=bl.checked?\"\":\"none\";",
     u"      const sync=()=>{\n" + SY + u"        help.style.display=bl.checked?\"\":\"none\";"),
])
edit("pjump.html", [
    (u"the tick dims with the Blender tick",
     u"      const sync=()=>{\n        if(help)help.style.display=bl.checked?\"\":\"none\";",
     u"      const sync=()=>{\n" + SY + u"        if(help)help.style.display=bl.checked?\"\":\"none\";"),
])
edit("hjump.html", [
    (u"the tick dims with the Blender tick",
     u"      const sync=function(){ help.style.display=bl.checked?\"\":\"none\"; };",
     u"      const sync=function(){\n"
     + u"        /* TRACED VASCULATURE, 2026-10-09: Blender-only, like every 3D tick on this row. */\n"
     + u"        if(window.UJ&&UJ.blender&&UJ.blender.vesselTickSync)UJ.blender.vesselTickSync(row,bl.checked);\n"
     + u"        help.style.display=bl.checked?\"\":\"none\";\n      };"),
])
edit("core/regionbox.js", [
    (u"the tick dims with the Blender tick",
     u'''        function sync(){
          var on = bl.checked;
          if (help) help.style.display = on ? "" : "none";''',
     u'''        function sync(){
          var on = bl.checked;
          /* TRACED VASCULATURE, 2026-10-09: Blender-only, like the two ticks below. */
          if (UJ.blender && UJ.blender.vesselTickSync) UJ.blender.vesselTickSync(row, on);
          if (help) help.style.display = on ? "" : "none";'''),
])
print("done 5")
