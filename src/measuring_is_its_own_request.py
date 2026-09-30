# -*- coding: utf-8 -*-
u"""Measuring is its own request.                                                        2026-09-30

Søren: *"But where are they in the Google sheets? I would like that these numbers are saved there,
so we can do graphs with them."*

The backend half is backend/src_the_numbers_are_kept_not_recomputed.py: the whitelist of columns a
measurement may write, and a `traced_measurements` branch that updates existing rows' measurement
columns and nothing else. This is the browser half -- the two ways the numbers get there.

ONE: A TRACING CARRIES ITS OWN, the way the volume has since 2026-09-17. It is measured against the
cell's outlines THAT THE PAD IS HOLDING, which is the honest scope at that moment: the three
relational numbers (nearest organelle, its surface distance, its centroid distance) can only be
measured against outlines whose geometry is in the page, and fetching the whole cell from Drive on
every press would make pressing Add slow for a number nobody is looking at yet. `measuredSiblings`
says what the scope was, so a row measured against two is visibly not a row measured against eleven.

TWO: A BUTTON PER CELL, AND ONE FOR EVERYTHING. That is the backfill -- 68 tracings today have rows
with no numbers at all -- and it is also the re-measure: outline another organelle in a cell and its
neighbours' three relational numbers are out of date the moment you do. Per cell is the everyday
one and costs one Drive read per outline of that cell. "All of them" is the whole dataset, and says
how many it did.

WHY NOT RE-SHARE THE TRACINGS INSTEAD. Because a re-share is a new version: a Drive rewrite, a row
in "Traced structures history", a version number and a name on the credit line -- 68 times, for a
change that moves no geometry. The separate request exists so that measuring cannot be mistaken for
tracing. Nobody is credited for pressing it.

ONE DEFINITION OF THE THREE OPTIONS, in window.tracedMeasureOpts(): the resolution, the nucleus
fallback and the cell-type lookup. The Excel sheet, the pad's sentence and both buttons now read the
same one. It was written out twice the day before this -- once in addTracedOrganelleSheet and once
as window.tracingNucCentroid -- and a nucleus fallback that disagrees with itself between the sheet
and the sheet's own backfill is the exact shape of bug this project keeps finding.

AND ONE MAPPING FROM AN INDEX ENTRY TO A TRACING, in tracedOneFrom(). tracedStructuresForCells had
it inline; the backfill needs the same thing, and a second copy would drift in the same week.

Check: organellesheetcheck.js, and backend/gs_harness_measurements.js for the other end.
Run: python3 src/measuring_is_its_own_request.py, then python3 src/build_stamps.py,
then, from inside wjump-build/, python3 build_wjump.py
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


# ── core/tracedoutlines.js ──────────────────────────────────────────────────────────────────────

ONEFROM = u'''/* ONE INDEX ENTRY PLUS ITS FETCHED GEOMETRY -> ONE TRACING, the shape tracedShapeRows() measures
   and blenderexport colours. Extracted from tracedStructuresForCells on 2026-09-30, when the
   measurement backfill needed the same mapping: two copies of "which id wins, and what is `kind`"
   would have drifted inside a week, and the four bugs this project has had of that shape all began
   as a second copy of something small. Null when the geometry could not be read. */
function tracedOneFrom(t, x){
  if (!t || !x || !x.st || !x.st.rings || !x.st.rings.length) return null;
  const one = (UJ.tracing.toTracings([x.st]) || [])[0];
  if (!one) return null;
  /* toTracings carries neither of these, and the notebook needs both: `kind` is what
     colour_policy colours by, and `root_id` is how blenderexport decides a tracing belongs to
     a cell in this export rather than judging it by where it sits. */
  one.kind = String(x.st.instanceOf || x.st.kind || t.instanceOf || t.kind || "");
  const rid = String(x.st.rootId || t.rootId || "");
  if (rid) one.root_id = rid;
  const nid = String(x.st.nucleusId || t.nucleusId || "");
  if (nid && !one.nucleus_id) one.nucleus_id = nid;
  one.structure_id = String(t.structureId);
  /* The published number, so a measured row can be told apart from its siblings by name. */
  if (x.st.instanceIndex || t.instanceIndex)
    one.instance_index = Number(x.st.instanceIndex || t.instanceIndex) || "";
  return one;
}

'''

MEASURE = u'''
/* ── MEASURING IS ITS OWN REQUEST ───────────────────────────────────  2026-09-30
   Søren: "I would like that these numbers are saved there, so we can do graphs with them."

   Everything traced before the measurements existed has a row without them, and a tracing's three
   RELATIONAL numbers -- the nearest organelle, its surface distance, its centroid distance -- go out
   of date the moment somebody outlines another organelle in the same cell. Both are the same job:
   read the outlines, measure them together, save the numbers.

   NOT BY RE-SHARING THE TRACINGS. A re-share is a new version of each: a Drive rewrite, a history
   row, a version number and a name on the credit line, 68 times over, for a change that moves no
   geometry and that nobody should be credited for. So it posts `traced_measurements`, which the
   backend answers by writing measurement columns onto rows that already exist and touching nothing
   else -- see backend/src_the_numbers_are_kept_not_recomputed.py. */

/* THE THREE OPTIONS, FROM WHICHEVER PAGE CAN ANSWER. µJump can: the voxel size, the MICrONS
   nucleus-detection centroid as a fallback when a cell's nucleus was never outlined, and the cell
   type. ωJump and χJump open volumes with no nucleus table and leave the hook undefined, and then
   the columns that need it are simply blank rather than invented. */
function tracedMeasureOpts_(){
  /* THE TRAILING UNDERSCORE MATTERS. core/*.js are classic scripts, so a top-level
     `function tracedMeasureOpts` IS window.tracedMeasureOpts -- this would have called itself for
     ever the moment a page defined the hook. */
  if (typeof window.tracedMeasureOpts === "function"){
    try { return window.tracedMeasureOpts() || { resNm: [4, 4, 40] }; } catch (_e){}
  }
  return { resNm: [4, 4, 40] };
}
/* Small enough that Apps Script never sees a payload worth worrying about, large enough that 68
   tracings are one request. Each chunk is answered before the next is sent, so a failure halfway
   through has saved the chunks before it and says so. */
const TRACED_MEASURE_BATCH = 200;

/* THE POST, READING ITS WHOLE ANSWER. postAndRead() reduces a success to {ok:true}, and the two
   numbers worth having here are `updated` and `missing` -- a structureId with no row means the page
   and the sheet disagree about what exists, which is the one thing this button can discover. */
async function tracedPostMeasurements(rows){
  if (typeof REPORT_ENDPOINT === "undefined" || !REPORT_ENDPOINT)
    return { error: "this page has no backend configured" };
  if (typeof GOOGLE_VERIFIED === "undefined" || !GOOGLE_VERIFIED
      || typeof GOOGLE_CREDENTIAL === "undefined" || !GOOGLE_CREDENTIAL)
    return { error: "please sign in with Google first \\u2014 the sheet records who wrote what" };
  const payload = { type: "traced_measurements", rows: rows,
                    credential: GOOGLE_CREDENTIAL,
                    reporterName: (typeof REPORTER_NAME !== "undefined" && REPORTER_NAME) || "",
                    reporterEmail: (typeof REPORTER_EMAIL !== "undefined" && REPORTER_EMAIL) || "" };
  try { if (UJ && UJ.cfg && UJ.cfg.backend && UJ.cfg.backend.ds) payload.ds = UJ.cfg.backend.ds; }
  catch (_e){}
  let text = "";
  try {
    const r = await fetch(REPORT_ENDPOINT, { method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
    text = await r.text();
  } catch (e){ return { error: "could not reach the server (" + String(e && e.message || e) + ")" }; }
  let d = null; try { d = JSON.parse(text); } catch (_pe){}
  if (!d){
    /* An HTML reply is Apps Script serving a sign-in page or its own error page, and the remedy
       differs -- ujump.html's postAndRead tells the two apart in a sentence. Here it is enough to
       say the reply was not JSON and put the body where it can be read. */
    try { console.warn("[measurements] reply was not JSON: " + String(text).slice(0, 300)); }
    catch (_cw){}
    return { error: "the server did not answer with JSON \\u2014 the deployment may be older than "
                  + "this page, or need approving again (the console has its reply)" };
  }
  if (d.ok !== true) return { error: String(d.error || "the server refused it") };
  return { updated: Number(d.updated) || 0, missing: (d.missing || []) };
}

/* Measure a list of tracings TOGETHER -- together because the relational numbers are about the set
   -- and save them. Returns {measured, updated, missing} or {error}. */
async function tracedMeasureAndSave(list, say){
  if (typeof tracedMeasurements !== "function")
    return { error: "this page cannot measure outlines (core/tracedoutlines.js is older than it)" };
  if (!list || !list.length) return { measured: 0, updated: 0, missing: [] };
  say && say("Measuring " + list.length + " outline" + (list.length === 1 ? "" : "s") + "\\u2026");
  let rows;
  try { rows = tracedMeasurements(list, tracedMeasureOpts_()) || []; }
  catch (e){ return { error: "could not measure them (" + String(e && e.message || e) + ")" }; }
  if (!rows.length) return { measured: 0, updated: 0, missing: [] };
  let updated = 0; const missing = [];
  for (let i = 0; i < rows.length; i += TRACED_MEASURE_BATCH){
    const chunk = rows.slice(i, i + TRACED_MEASURE_BATCH);
    say && say("Saving " + Math.min(i + chunk.length, rows.length) + "/" + rows.length + "\\u2026");
    const r = await tracedPostMeasurements(chunk);
    if (r.error) return { error: r.error, measured: rows.length, updated: updated, missing: missing };
    updated += r.updated;
    (r.missing || []).forEach(function(s){ missing.push(s); });
  }
  return { measured: rows.length, updated: updated, missing: missing };
}

/* One cell's outlines, read the way the Excel sheet reads them. The everyday button: the numbers
   that go stale are a cell's own, and this costs one Drive read per outline of that cell. */
async function tracedMeasureCells(ids, say){
  let got;
  try { got = await tracedStructuresForCells(ids, say); }
  catch (e){ return { error: "could not read the outlines (" + String(e && e.message || e) + ")" }; }
  const out = await tracedMeasureAndSave(got.tracings, say);
  if (got.capped) out.capped = got.capped;
  return out;
}

/* EVERY OUTLINE IN THE DATASET, measured cell by cell. Cell by cell rather than all at once because
   the relational numbers are only ever about one cell's organelles -- the pairing in
   tracedShapeRows() already refuses to cross cells -- so measuring a cell at a time gives the same
   answers while holding one cell's geometry in memory instead of all of it. */
async function tracedMeasureAll(say){
  if (typeof REPORT_ENDPOINT === "undefined" || !REPORT_ENDPOINT)
    return { error: "this page has no backend configured" };
  let index = [];
  try {
    say && say("Listing the dataset\\u2019s tracings\\u2026");
    const r = await fetch(REPORT_ENDPOINT + "?tracings=1" + tracedOutlinesDsQS());
    const d = await r.json();
    index = (d && d.tracings) || [];
  } catch (e){ return { error: "could not list the tracings (" + String(e && e.message || e) + ")" }; }
  if (!index.length) return { measured: 0, updated: 0, missing: [], cells: 0 };
  /* Grouped by the cell key tracedShapeRows pairs within, so each batch is exactly the set the
     relational numbers are measured against. A tracing filed against neither id is its own group:
     it has no siblings, and pretending it shares a cell with every other orphan would invent
     neighbours. */
  const groups = {};
  index.forEach(function(t){
    if (!t || !t.structureId) return;
    const nid = String(t.nucleusId || ""), rid = String(t.rootId || "");
    const key = (nid || rid) ? (nid + "|" + rid) : ("solo:" + t.structureId);
    (groups[key] = groups[key] || { nuc: [], root: [] });
    if (nid) groups[key].nuc.push(nid);
    if (rid) groups[key].root.push(rid);
  });
  const keys = Object.keys(groups);
  let measured = 0, updated = 0, capped = 0; const missing = [];
  for (let i = 0; i < keys.length; i++){
    const g = groups[keys[i]];
    const label = "Cell " + (i + 1) + "/" + keys.length;
    const r = await tracedMeasureCells(g, function(m){ say && say(label + " \\u2014 " + m); });
    if (r.error) return { error: r.error, measured: measured, updated: updated,
                          missing: missing, cells: i };
    measured += r.measured || 0;
    updated += r.updated || 0;
    capped += r.capped || 0;
    (r.missing || []).forEach(function(s){ missing.push(s); });
  }
  return { measured: measured, updated: updated, missing: missing, cells: keys.length,
           capped: capped };
}
window.tracedMeasureAndSave = tracedMeasureAndSave;
window.tracedMeasureCells = tracedMeasureCells;
window.tracedMeasureAll = tracedMeasureAll;
'''

edit("core/tracedoutlines.js", [

 (u"one index entry becomes one tracing, in one place",
  u"""async function tracedStructuresForCells(ids, say, opts){""",
  ONEFROM + u"""async function tracedStructuresForCells(ids, say, opts){"""),

 (u"...and tracedStructuresForCells uses it",
  u"""  mine.forEach(function(t){
    const x=res[t.structureId];
    if(!x||!x.st||!x.st.rings||!x.st.rings.length)return;
    const one=(UJ.tracing.toTracings([x.st])||[])[0];
    if(!one)return;
    /* toTracings carries neither of these, and the notebook needs both: `kind` is what
       colour_policy colours by, and `root_id` is how blenderexport decides a tracing belongs to
       a cell in this export rather than judging it by where it sits. */
    one.kind=String(x.st.instanceOf||x.st.kind||t.instanceOf||t.kind||"");
    const rid=String(x.st.rootId||t.rootId||"");
    if(rid)one.root_id=rid;
    const nid=String(x.st.nucleusId||t.nucleusId||"");
    if(nid&&!one.nucleus_id)one.nucleus_id=nid;
    one.structure_id=String(t.structureId);
    out.push(one);
  });""",
  u"""  mine.forEach(function(t){
    const one=tracedOneFrom(t,res[t.structureId]);
    if(one)out.push(one);
  });"""),

 (u"the numbers are measured and saved",
  u"window.tracedMeasurements = tracedMeasurements;",
  u"window.tracedMeasurements = tracedMeasurements;\n" + MEASURE),
])


# ── core/tracingcard.js ─────────────────────────────────────────────────────────────────────────

PUBMEAS = u'''/* ── WHAT THE TRACING'S MEASUREMENTS ARE, AT THE MOMENT IT IS SHARED ────────  2026-09-30
   Søren: "I would like that these numbers are saved there, so we can do graphs with them."

   Measured against THE CELL'S OUTLINES THE PAD IS HOLDING, and no others. Not a decision taken
   lightly: the three relational numbers -- nearest organelle, its surface distance, its centroid
   distance -- are about a set, and the cell may have outlines in the dataset that are not on the pad.
   Fetching all of them from Drive on every press would make Add slow for numbers nobody is reading
   yet, so the row carries `measuredSiblings` and the "Measure this cell" button measures against
   everything. A row measured against two siblings is then visibly not a row measured against eleven,
   which is the whole reason that column exists.

   Never throws and never blocks a share: a tracing that cannot be measured is still a tracing. */
function tracingPublishMeasurements(t){
  try {
    if (typeof tracedMeasurements !== "function" || !t || !t.rings || !t.rings.length) return null;
    const key = String(t.nucleus_id || "") + "|" + String(t.root_id || "");
    const as = function(k){
      return { structure_id: k.id, name: k.name || "", kind: k.kind || k.instance_of || "",
               type: k.type || "", instance_index: k.instance_index || "",
               nucleus_id: k.nucleus_id || "", root_id: k.root_id || "", rings: k.rings };
    };
    const list = (TRACINGS_KEPT || []).filter(function(k){
      return k && k.id && k.rings && k.rings.length
          && (String(k.nucleus_id || "") + "|" + String(k.root_id || "")) === key;
    }).map(as);
    /* The tracing being shared may not be in the kept list yet -- a first share puts it there
       afterwards -- and measuring it against a set it is not in would give it no distances at all. */
    if (!list.some(function(k){ return k.structure_id === t.id; })) list.push(as(t));
    const rows = tracedMeasurements(list,
      (typeof window.tracedMeasureOpts === "function") ? window.tracedMeasureOpts()
                                                       : { resNm: [4, 4, 40] }) || [];
    for (let i = 0; i < rows.length; i++){
      if (rows[i].structureId !== t.id) continue;
      const m = {};
      Object.keys(rows[i]).forEach(function(k){ if (k !== "structureId") m[k] = rows[i][k]; });
      return m;
    }
  } catch (_e){}
  return null;
}
'''

edit("core/tracingcard.js", [

 (u"the whole answer, not just whether it was yes",
  u"""      var d = null; try { d = JSON.parse(t); } catch (_pe){}
      return (d && (d.ok === true || d.status === "ok")) ? { ok: true }
           : { ok: false, error: (d && d.error) || String(t || "").slice(0, 200) };""",
  u"""      var d = null; try { d = JSON.parse(t); } catch (_pe){}
      /* THE REST OF THE ANSWER TOO (2026-09-30). It reduced a success to {ok:true}, which is all
         a tracing needs and throws away what a measurement batch replies -- how many rows it
         updated, and which structureIds it could not find. Merged, so every existing `res.ok`
         reads exactly as before. */
      return (d && (d.ok === true || d.status === "ok")) ? Object.assign({ ok: true }, d)
           : { ok: false, error: (d && d.error) || String(t || "").slice(0, 200) };"""),

 (u"a tracing is measured before it is shared",
  u"function tracingPublish(t,quiet){",
  PUBMEAS + u"function tracingPublish(t,quiet){"),

 (u"...and carries the numbers with it",
  u"""                                             areaUm2:t.area_um2, areas:t.areas});""",
  u"""                                             areaUm2:t.area_um2, areas:t.areas,
                                             /* the shape and the distances, measured the same way
                                                and for the same reason as the volume -- see
                                                tracingPublishMeasurements above */
                                             measurements:tracingPublishMeasurements(t)});"""),

 (u"a button to measure a cell, and one for all of them",
  u"""  host.innerHTML = '<label>In the dataset, by cell — open one to add to it or correct it</label>'""",
  u"""  /* ── THE BACKFILL, AND THE RE-MEASURE ────────────────────────  2026-09-30
     Two buttons, because there are two occasions. Everything traced before the measurements existed
     has a row with none, which is the whole dataset once; and a cell's relational numbers go stale
     the moment another organelle in it is outlined, which is one cell, often. Neither is a new
     version of anything -- see core/tracedoutlines.js's tracedMeasureAll. */
  host.innerHTML = '<label>In the dataset, by cell — open one to add to it or correct it</label>'
    + (typeof window.tracedMeasureAll === "function"
        ? '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 8px">'
          + '<button type="button" class="hist-chip" id="tracedMeasureAllBtn" title="Reads every '
            + 'outline in the dataset, measures it — shape, sphericity, the distances to the '
            + 'nucleus and to the nearest organelle — and saves the numbers onto its row in the '
            + 'sheet. It files no new version of any tracing and credits nobody: it only fills in '
            + 'the measurement columns. Do it once for everything traced before the measurements '
            + 'existed.">Measure every outline and save the numbers</button>'
          + '<span class="hint" id="tracedMeasureSay" style="flex:1 1 180px;min-width:0"></span></div>'
        : "")"""),

 (u"...on each cell's own row",
  u"""            + 'index.">Download zip</button></div>'""",
  u"""            + 'index.">Download zip</button>'
          + (typeof window.tracedMeasureCells === "function"
              ? '<button class="idbtn tracedmeasurecell" data-g="' + gi + '" ' + TRACING_BTN
                + ' title="Measures this cell’s outlines together and saves the numbers to the '
                + 'sheet. Worth doing after outlining another organelle here: each organelle’s '
                + 'distance to its nearest neighbour is measured against the others, so a new one '
                + 'makes the old numbers out of date.">Measure this cell</button>' : "")
          + '</div>'"""),

 (u"...and the buttons do it",
  u"""  [].slice.call(host.querySelectorAll(".tracingcellzip")).forEach(function(b){
    b.addEventListener("click", function(){ tracingCellZip(groups[Number(b.dataset.g)], b); });
  });""",
  u"""  [].slice.call(host.querySelectorAll(".tracingcellzip")).forEach(function(b){
    b.addEventListener("click", function(){ tracingCellZip(groups[Number(b.dataset.g)], b); });
  });
  [].slice.call(host.querySelectorAll(".tracedmeasurecell")).forEach(function(b){
    b.addEventListener("click", function(){
      const g = groups[Number(b.dataset.g)];
      if (!g) return;
      tracingMeasureRun(b, function(say){
        return window.tracedMeasureCells({ nuc: [g.nuc], root: [g.root] }, say);
      });
    });
  });
  const allBtn = document.getElementById("tracedMeasureAllBtn");
  if (allBtn) allBtn.addEventListener("click", function(){
    tracingMeasureRun(allBtn, function(say){ return window.tracedMeasureAll(say); },
                      document.getElementById("tracedMeasureSay"));
  });"""),
])

RUN = u'''
/* ── RUNNING A MEASUREMENT, AND SAYING WHAT HAPPENED ────────────────────  2026-09-30
   The progress goes on the button, which is where the eye already is, and the sentence afterwards
   says three numbers: how many were measured, how many rows the sheet updated, and -- the
   interesting one -- how many structures the sheet had no row for. That last is the only thing this
   button can discover that nothing else can: a page and a sheet disagreeing about what exists. */
async function tracingMeasureRun(btn, go, sayEl){
  if (!btn) return;
  const was = btn.textContent, wasDis = btn.disabled;
  btn.disabled = true;
  const say = function(m){
    btn.textContent = m;
    if (sayEl) sayEl.textContent = "";
  };
  let r;
  try { r = await go(say); }
  catch (e){ r = { error: String(e && e.message || e) }; }
  btn.textContent = was; btn.disabled = wasDis;
  let msg;
  if (r && r.error){
    msg = "Nothing was saved \\u2014 " + r.error + ".";
    if (r.updated) msg = r.updated + " row" + (r.updated === 1 ? "" : "s") + " had been saved "
                       + "before it stopped. Then: " + r.error + ".";
  } else if (!r || !r.measured){
    msg = "There was nothing to measure \\u2014 no outline could be read.";
  } else {
    msg = "Measured " + r.measured + " outline" + (r.measured === 1 ? "" : "s")
        + " and saved " + r.updated + " row" + (r.updated === 1 ? "" : "s") + " to the sheet.";
    if (r.missing && r.missing.length)
      msg += " " + r.missing.length + " had no row in the sheet to write to ("
           + r.missing.slice(0, 3).join(", ") + (r.missing.length > 3 ? ", \\u2026" : "")
           + ") \\u2014 which means the sheet and this page disagree about what exists.";
    if (r.capped) msg += " " + r.capped + " outline" + (r.capped === 1 ? "" : "s")
                       + " were left unread because of the per-cell read cap.";
  }
  if (sayEl) sayEl.textContent = msg;
  if (typeof tracingSay === "function") tracingSay(msg);
}
'''

edit("core/tracingcard.js", [
 (u"the sentence the buttons answer with",
  u"function tracingRenderShared(){",
  RUN + u"function tracingRenderShared(){"),
])


# ── ujump.html ──────────────────────────────────────────────────────────────────────────────────

HOOK = u'''  /* ── THE THREE THINGS A MEASUREMENT NEEDS FROM THIS PAGE ─────────────  2026-09-30
     The voxel size, a nucleus centroid to fall back on when a cell's nucleus was never outlined,
     and the cell type. Written out ONCE, here, because four callers now want them: the Excel sheet,
     the sentence beside the volume on the pad, the per-cell Measure button and the whole-dataset
     one. Two of those definitions existed a day apart in this file, and a nucleus fallback that
     disagreed with itself between the sheet and the sheet's own backfill is precisely the shape
     of bug this project keeps finding. ωJump and χJump leave this hook undefined -- they open
     volumes with no nucleus table -- and those columns are then blank rather than invented. */
  window.tracedMeasureOpts=function(){
    return {
      resNm:[UJ_RX,UJ_RY,UJ_RZ],
      nucCentroid:function(nid){
        const i=nidToIndex(nid);
        return i<0?null:{xVox:NX[i],yVox:NY[i],zVox:NZ[i]};
      },
      typeOf:function(nid){
        const i=nidToIndex(nid);
        return i<0?"":(typeInfo(i)||{}).name||"";
      }
    };
  };
'''

edit("ujump.html", [

 (u"one definition of what a measurement needs from the page",
  u"  window.tracingNucCentroid=function(nid){",
  HOOK + u"  window.tracingNucCentroid=function(nid){"),

 (u"...which the Excel sheet reads too",
  u"""    const rows=tracedShapeRows(got.tracings,{
      resNm:[UJ_RX,UJ_RY,UJ_RZ],
      nucCentroid:function(nid){
        const i=nidToIndex(nid);
        return i<0?null:{xVox:NX[i],yVox:NY[i],zVox:NZ[i]};
      },
      typeOf:function(nid){
        const i=nidToIndex(nid);
        return i<0?"":(typeInfo(i)||{}).name||"";
      }
    });""",
  u"""    const rows=tracedShapeRows(got.tracings,window.tracedMeasureOpts());"""),

 (u"the whole answer, not just whether it was yes",
  u"""      if(d&&(d.ok===true||d.status==="ok"))return {ok:true};""",
  u"""      /* THE REST OF THE ANSWER TOO (2026-09-30). This reduced every success to {ok:true},
         which is all a classification needs and throws away what a measurement batch replies:
         how many rows it updated, and which structureIds it had no row for. Merged, so every
         existing `res.ok` test reads exactly as before. */
      if(d&&(d.ok===true||d.status==="ok"))return Object.assign({ok:true},d);"""),
])

print("\nNow: node organellesheetcheck.js, then python3 src/build_stamps.py,"
      "\nthen, from inside wjump-build/, python3 build_wjump.py")
