# -*- coding: utf-8 -*-
u"""ηJump: a cell H01 never listed can be reported, and identified.                       2026-09-24

Søren: "We need a way to identify new cells in hJump. We have 'Report a new cell' in µJump. I want
something similar." And, a minute later: "Also, when putting in a coordinate, when clicking on the
numbers they should be marked, and also we need a 'Jump to this nucleus', like we have for µJump."

THREE THINGS, AND TWO OF THEM ARE SMALL.

THE JUMP BUTTON ALREADY EXISTED -- `Jump to this cell ↗`, at the very bottom of the panel, under the
IDs and the mesh buttons. µJump's moved up onto the line that names what it jumps to on 2026-09-18,
at his request: "Jump to this nucleus should be next to the nearest nucleus at this voxel, just
after 'from query', but make it look nice." ηJump never got that move, so it gets it now. The NOUN
stays this page's own: an ηJump cell is a soma with a cell_bodies id, and there is no nucleus
volume in H01 to jump to.

THE COORDINATE BOXES select their contents when you click into them. µJump does this for its x box
only, because that one also takes a pasted triple; all three are worth it, and the reason is the
same either way -- you click a box to replace what is in it, not to append to it.

AND THE REPORT. H01's cell_bodies list is not the whole volume, and this page already says so: its
ID search answers "H01 has 1,917 somata with no cell-type call that are not loaded here". So a cell
you are looking at may be in none of it. The shape of the answer is µJump's `new_cell_no_nucleus`
row plus λJump's derived id -- and ηJump adds the thing neither of them can do.

WHAT ηJUMP HAS THAT THE OTHER TWO DO NOT: a flat segmentation it can read. core/segread.js is
already configured against h01-release for the tracing card, so the coordinate you report can be
turned into a REAL c3 segment id on the spot. That is the difference between a point somebody
logged and a cell: with a segment id it has a mesh, a volume, a highlight in the viewer, and
anything filed against a root id can be filed against it.

THE DERIVED ID, AND WHY IT IS SAFE HERE. Everything identity does in this family is keyed on a
numeric id; a cell with none cannot be identified, voted on, or disagreed with. λJump derives one
from the coordinate -- FNV-1a of "<dataset>|<x,y,z>", mapped into a band starting at a million --
so every client computes the same id with no new state anywhere. Measured on this page's own table:
H01's cell_bodies ids run 1 to 49,376, so the band cannot meet them, and the dataset key is inside
the hash so ηJump's added cells cannot meet λJump's either. The function MOVED to core/report.js
rather than being copied: this family has already had six near-copies of one control drift apart,
and an id that two tools compute differently would be worse than that.

WHEN IT IS OFFERED. Past ten micrometres from the nearest soma in the table. Not the 50 µm this page
already warns at -- that one is about being outside the classified volume altogether -- and not
µJump's 3 µm, which is a nucleus radius. A soma centroid ten micrometres away is a different cell.

AND WHEN THE SEGMENTATION CANNOT BE READ, the report still goes. The claim is the coordinate; the
segment id is what makes it useful, not what makes it true.

Check: hjnewcellcheck.js, written first; 21 of its 24 assertions failed before this went in.
Run: python3 src/a_cell_h01_never_listed.py, then python3 src/build_stamps.py
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


# ── 1. one derived id, in one place ────────────────────────────────────────────────────────────
edit("core/report.js", [
 (u"a stable id for a cell nothing detected",
  u"""/* ── core/report.js ─ shared reporting surface ─────────────────────────────────""",
  u"""/* ── A STABLE ID FOR A CELL NOTHING DETECTED ───────────────────────────  2026-09-24
   Everything identity does in this family is keyed on a NUMERIC cell id: the Master cell list is
   keyed by it, votes and history address it, and a cell without one cannot be identified, voted on
   or disagreed with — its name lives on its own row where the first writer wins.

   Derived from the coordinate rather than assigned by a server: every client computes the same id
   from the same row, with no new state to keep and nothing to deploy. FNV-1a, mapped into a band
   starting at a million. Measured: λJump's Lee16 detections are 1..488 and ηJump's H01 cell_bodies
   ids are 1..49,376, so the band cannot meet either. The DATASET KEY IS INSIDE THE HASH, so two
   tools cannot collide with each other. Across a thousand added cells the chance of two hashing
   alike is about 0.02 %.

   Written for λJump on 2026-09-10 and moved here on 2026-09-24, when ηJump needed the same id: a
   family that has already watched six near-copies of one control drift apart should not have two
   tools computing an identity differently. λJump's addedNucleusId() is now one line.
   See src/a_cell_h01_never_listed.py. */
var ADDED_CELL_ID_BASE = 1000000, ADDED_CELL_ID_SPAN = 1000000000;
function addedCellId(coordStr){
  var s = ((window.UJ && UJ.cfg && UJ.cfg.backend && UJ.cfg.backend.ds) || "")
        + "|" + String(coordStr || "").replace(/\\s+/g, "");
  var h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ADDED_CELL_ID_BASE + (h % ADDED_CELL_ID_SPAN);
}

/* ── core/report.js ─ shared reporting surface ────────────────────────────"""),
])

edit("ljump.html", [
 (u"λ: the derived id comes from core now",
  u"""const ADDED_ID_BASE=1000000, ADDED_ID_SPAN=1000000000;
function addedNucleusId(coordStr){
  const s=((UJ&&UJ.cfg&&UJ.cfg.backend&&UJ.cfg.backend.ds)||"")+"|"+String(coordStr||"").replace(/\\s+/g,"");
  let h=0x811c9dc5;
  for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,0x01000193)>>>0; }
  return ADDED_ID_BASE+(h%ADDED_ID_SPAN);
}""",
  u"""/* MOVED to core/report.js on 2026-09-24, when ηJump needed the same id — the body above is now
   addedCellId() there, unchanged, so every id this page has ever derived stays the same. This name
   is what λJump's own callers use. See src/a_cell_h01_never_listed.py. */
function addedNucleusId(coordStr){ return addedCellId(coordStr); }"""),
])


# ── 2. the two small ones ──────────────────────────────────────────────────────────────────────
edit("hjump.html", [
 (u"η: the coordinate boxes mark what is in them",
  u"""["x","y","z"].forEach(function(id){
  document.getElementById(id).addEventListener("keydown",function(e){ if(e.key==="Enter") doJump(); });
});""",
  u"""["x","y","z"].forEach(function(id){
  const el=document.getElementById(id);
  el.addEventListener("keydown",function(e){ if(e.key==="Enter") doJump(); });
  /* ── CLICKING A BOX MARKS WHAT IS IN IT ─────────────────────────  2026-09-24
     Søren: "when clicking on the numbers they should be marked." You click a coordinate box to
     replace what is in it, not to append to it. On a timeout because the click that follows focus
     collapses the selection again — which is why µJump's x box does the same dance. */
  el.addEventListener("focus",function(){
    setTimeout(function(){ try{ el.select(); }catch(_e){} },0);
  });
});"""),

 (u"η: the re-centre button is on the line that names the distance",
  u"""    +(distNm!=null?' &middot; '+(distNm/1000).toFixed(2)+' &micro;m from your query':'')+'</div>';""",
  u"""    +(distNm!=null?' &middot; '+(distNm/1000).toFixed(2)+' &micro;m from your query':'')
    /* ── THE JUMP IS ON THE LINE THAT NAMES WHAT IT JUMPS TO ────────────  2026-09-24
       Søren, of µJump on 2026-09-18: "Jump to this nucleus should be next to the nearest nucleus at
       this voxel, just after 'from query', but make it look nice." µJump moved it that day; this
       page kept its copy at the very bottom, under the IDs and the mesh buttons, where nobody
       reading "27.79 µm from your query" would look for it. Same class, so the panel's existing
       .jump wiring picks it up unchanged. */
    +'<button class="jump" data-x="'+pos[0]+'" data-y="'+pos[1]+'" data-z="'+pos[2]+'" '
    +'style="margin:0 0 0 10px;padding:2px 8px;font-size:11px;vertical-align:middle" '
    +'title="Put this cell\\u2019s own voxel in the coordinate boxes and go there">'
    +'Jump to this cell &#8599;</button></div>';"""),

 (u"η: ...and not also at the bottom",
  u"""
  h+='<button class="jump" data-x="'+pos[0]+'" data-y="'+pos[1]+'" data-z="'+pos[2]+'">Jump to this cell &#8599;</button>';
""",
  u"""
  /* The button that was here moved onto the line that names the distance (2026-09-24). */
"""),
])


# ── 3. the markup: the offer, and the form ─────────────────────────────────────────────────────
edit("hjump.html", [
 (u"η: the form and the list of added cells",
  u"""<div class="hist-row" id="searchHistory"></div>""",
  u"""<!-- ── A CELL H01 NEVER LISTED ───────────────────────────────  2026-09-24
     Søren: "We need a way to identify new cells in hJump." The ID search above already says H01 has
     1,917 somata this page does not load, and the volume has more cells than either. Shut by
     default like every other panel in this card; the offer after a far jump opens it.
     See src/a_cell_h01_never_listed.py. -->
<details class="rv-panel" id="newCellPanel">
<summary>Report a cell that is not in this table</summary>
<p class="hint" style="margin-top:6px">H01's cell_bodies list is not the whole volume. Give the
  coordinate of a soma nothing here has, and it becomes a cell this tool can identify, vote on and
  argue about like any other.</p>
<div class="row" style="margin-top:6px">
  <div class="coord" style="flex:2 1 auto"><input type="text" id="newCellCoord" placeholder="x, y, z in 8&middot;8&middot;33 nm voxels"></div>
  <button class="idbtn" id="newCellSegRead" title="Reads H01's c3 segmentation at that voxel, so the reported cell arrives with a real segment ID — a mesh, a volume, and a highlight in the viewer.">Read the segment there</button>
</div>
<p class="hint" id="newCellSegSay"></p>
<div class="row" style="margin-top:4px">
  <div class="coord" style="flex:2 1 auto"><select id="newCellType" style="width:100%"><option value="">What is it? (optional — leave blank to log the location only)</option></select></div>
</div>
<div class="row" style="margin-top:4px">
  <div class="coord" style="flex:2 1 auto"><input type="text" id="newCellComment" placeholder="Anything worth saying about it (optional)"></div>
  <button class="idbtn" id="newCellSend">Report this cell</button>
</div>
<p class="hint" id="newCellMsg"></p>
<div class="rv-list" id="newCellList"></div>
</details>

<div class="hist-row" id="searchHistory"></div>"""),

 (u"η: and the offer, where the error goes",
  u"""<p class="err" id="err"></p>""",
  u"""<p class="err" id="err"></p>
<!-- Filled by doJump when the nearest soma is far enough away to be a different cell. Its own
     element rather than #err's text, because it is an offer and not an error (2026-09-24). -->
<div id="newCellCta"></div>"""),
])


# ── 4. the behaviour ───────────────────────────────────────────────────────────────────────────
edit("hjump.html", [
 (u"η: reporting a cell, and identifying it",
  u"""document.getElementById("dscount").textContent = fmt(N)+" cells are loaded in this page.";""",
  u"""/* ── A CELL H01 NEVER LISTED ─────────────────────────────────  2026-09-24
   See src/a_cell_h01_never_listed.py for why ten micrometres, why the id is derived, and why the
   segment read is worth making. */
const HJ_NEW_CELL_NM = 10000;          // past this, the nearest soma is a different cell
let HJ_NEW_CELLS = null, HJ_NEW_CELLS_FETCHED = false;

/* The c3 segment at a voxel, or "" where nothing is segmented. Rejects only when the read itself
   failed — no network, no reader — because "there is no cell there" is an answer, not a fault.
   Assigned to window so a harness can drive the form without the segmentation. */
window.hjSegAt = async function(pos){
  if (!window.UJ || !UJ.segread) throw new Error("the segmentation reader did not load");
  if (!UJ.segread.configured()){
    const s = (UJ.cfg.tracing && UJ.cfg.tracing.sources) ? UJ.cfg.tracing.sources() : null;
    if (!s || !s.seg) throw new Error("this page has no flat segmentation configured");
    UJ.segread.configure({ seg: s.seg, nuc: s.nuc || "", res: s.res || UJ.cfg.res });
  }
  const r = await UJ.segread.segmentAt(pos);
  return (!r || !r.rootId || r.rootId === "0") ? "" : String(r.rootId);
};

function hjNewCellCoord(){
  const raw = ((document.getElementById("newCellCoord")||{}).value || "")
                .trim().split(/[\\s,;]+/).filter(Boolean).map(Number);
  return (raw.length >= 3 && raw.slice(0,3).every(isFinite)) ? raw.slice(0,3).map(Math.round) : null;
}
let HJ_NEW_CELL_SEG = "";
function hjNewCellReadSeg(){
  const say = document.getElementById("newCellSegSay");
  const pos = hjNewCellCoord();
  HJ_NEW_CELL_SEG = "";
  if (!pos){ say.textContent = "Paste three numbers: x, y, z in voxels."; return Promise.resolve(); }
  say.textContent = "Reading the segmentation there\\u2026";
  return window.hjSegAt(pos).then(function(id){
    HJ_NEW_CELL_SEG = id || "";
    say.textContent = id
      ? "c3 segment " + id + " is at that voxel \\u2014 it will go with the report, so the cell has a "
        + "mesh and a volume here."
      : "Nothing is segmented at that voxel. The report still works; it just carries the coordinate "
        + "alone.";
  }, function(e){
    say.textContent = "Could not read the segmentation there (" + (e && e.message ? e.message : "no answer")
      + "). The report still works \\u2014 the coordinate is the claim.";
  });
}

/* Every leaf of the shared ontology, by name, the way λJump's own form offers them. */
function hjNewCellTypes(){
  const sel = document.getElementById("newCellType");
  if (!sel || sel.options.length > 1) return;
  try {
    const LN = UJ.ontology.LEAF_NAMES, out = [];
    for (const slug in LN) out.push(LN[slug]);
    out.sort(function(a,b){ return a.localeCompare(b); });
    sel.innerHTML = sel.options[0].outerHTML
      + out.map(function(nm){ return '<option value="'+escHtml(nm)+'">'+escHtml(nm)+'</option>'; }).join("");
  } catch (_e){}
}

function hjNewCellPos(rec){
  const raw = String((rec && rec.coord) || "").split(/[\\s,;]+/).filter(Boolean).map(Number);
  return (raw.length >= 3 && raw.slice(0,3).every(isFinite)) ? raw.slice(0,3) : null;
}
function fetchHjumpNewCells(){
  if (HJ_NEW_CELLS) return Promise.resolve(HJ_NEW_CELLS);
  if (typeof REPORT_ENDPOINT === "undefined" || !REPORT_ENDPOINT) return Promise.resolve([]);
  const ds = (UJ.cfg.backend && UJ.cfg.backend.ds) || "";
  return fetch(REPORT_ENDPOINT + "?newCells=1" + (ds ? "&ds=" + encodeURIComponent(ds) : ""))
    .then(function(r){ return r.json(); })
    .then(function(d){
      HJ_NEW_CELLS = ((d && d.newCells) || []).filter(hjNewCellPos);
      HJ_NEW_CELLS_FETCHED = true;
      renderHjumpNewCells();
      return HJ_NEW_CELLS;
    }, function(){ HJ_NEW_CELLS_FETCHED = true; renderHjumpNewCells(); return []; });
}
function renderHjumpNewCells(){
  const host = document.getElementById("newCellList");
  if (!host) return;
  if (!HJ_NEW_CELLS_FETCHED && !HJ_NEW_CELLS){
    host.innerHTML = '<p class="hint">Checking what others have added\\u2026</p>'; return;
  }
  const list = (HJ_NEW_CELLS || []).slice().sort(function(a,b){
    return String(b.timestamp||"").localeCompare(String(a.timestamp||""));
  });
  if (!list.length){ host.innerHTML = '<p class="hint">Nobody has added a cell here yet.</p>'; return; }
  host.innerHTML = list.map(function(rec, k){
    const p = hjNewCellPos(rec), seg = String(rec.rootId || "");
    const who = rec.reporterName ? (" &middot; " + escHtml(rec.reporterName)) : "";
    return '<div class="nrow" style="align-items:center;gap:8px;flex-wrap:wrap">'
      + '<div style="flex:1 1 180px;min-width:0"><b>'
        + escHtml(rec.identified || "No type proposed") + '</b>'
        + '<div class="nsub">' + escHtml(p.join(", "))
        + (seg ? ' &middot; c3 ' + escHtml(seg) : ' &middot; no segment read') + who + '</div>'
        + (rec.comment ? '<div class="nsub">' + escHtml(rec.comment) + '</div>' : '')
      + '</div>'
      + '<button class="idbtn jump" data-x="'+p[0]+'" data-y="'+p[1]+'" data-z="'+p[2]+'" '
        + 'style="padding:2px 9px;font-size:11px">Jump to it &#8599;</button>'
      + '<button class="idbtn newcellid" data-k="'+k+'" style="padding:2px 9px;font-size:11px" '
        + 'title="Identify this cell through the same guided flow every other cell here uses">'
        + 'Identify it</button>'
      + '</div>';
  }).join("");
  /* The list is rebuilt whenever it changes, so its buttons are wired with it. */
  [].slice.call(host.querySelectorAll(".jump")).forEach(function(b){
    b.addEventListener("click", function(){
      document.getElementById("x").value = b.dataset.x;
      document.getElementById("y").value = b.dataset.y;
      document.getElementById("z").value = b.dataset.z;
      document.getElementById("go").click();
    });
  });
  [].slice.call(host.querySelectorAll(".newcellid")).forEach(function(b){
    b.addEventListener("click", function(){
      const rec = list[Number(b.dataset.k)], p = hjNewCellPos(rec);
      if (!rec || !p) return;
      /* THE PAGE'S OWN IDENTIFICATION FLOW, given a cell it has no index for: openIdentify takes a
         context as well as an index since 2026-09-24, so an added cell is identified by exactly the
         path every H01 cell is, and the report it posts is an ordinary new_identification. */
      openIdentify({ i: -1, seg: String(rec.rootId || ""), body: String(addedCellId(p.join(","))),
                     pos: p, layer: estimateLayer(p[0], p[1]).layer, depth: 0, published: null });
    });
  });
}

/* The offer, after a jump that landed nowhere near a soma this page has. */
function hjNewCellOffer(pos, distNm){
  const host = document.getElementById("newCellCta");
  if (!host) return;
  if (!pos || !(distNm > HJ_NEW_CELL_NM)){ host.innerHTML = ""; return; }
  host.innerHTML = '<div class="idcta warn"><div class="idcta-top">'
    + '<span>The nearest cell body in this table is ' + (distNm/1000).toFixed(1)
    + ' &micro;m away, which is a different cell. Is there a soma at the coordinate you asked for? '
    + 'H01\\u2019s cell_bodies list does not have every one.</span>'
    + '<button class="idbtn" id="newCellOpen">Report a new cell &rarr;</button></div></div>';
  document.getElementById("newCellOpen").addEventListener("click", function(){
    const panel = document.getElementById("newCellPanel");
    if (panel) panel.open = true;
    hjNewCellTypes();
    document.getElementById("newCellCoord").value = pos.join(", ");
    document.getElementById("newCellMsg").textContent = "";
    hjNewCellReadSeg();
    if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

/* ON A TIMEOUT, NOT NOW. This block sits ABOVE `const REPORT_ENDPOINT` and `let GOOGLE_VERIFIED`
   in the same script, and reaching either while it is still in its temporal dead zone throws —
   even `typeof` does — which aborts the rest of the script and takes the whole page with it.
   Measured the hard way: the cell panel stopped rendering. A timeout runs after this script has
   finished, when everything below is initialised (2026-09-24). */
setTimeout(function(){
  const read = document.getElementById("newCellSegRead");
  if (read) read.addEventListener("click", function(){ hjNewCellReadSeg(); });
  const panel = document.getElementById("newCellPanel");
  if (panel) panel.addEventListener("toggle", function(){ if (panel.open) hjNewCellTypes(); });
  const send = document.getElementById("newCellSend");
  if (send) send.addEventListener("click", function(){
    const msg = document.getElementById("newCellMsg");
    if (typeof GOOGLE_VERIFIED !== "undefined" && !GOOGLE_VERIFIED){
      msg.textContent = "Sign in first \\u2014 reports are attributed."; return;
    }
    const pos = hjNewCellCoord();
    if (!pos){ msg.textContent = "Paste three numbers: x, y, z in voxels."; return; }
    const coord = pos.join(",");
    let ident = ((document.getElementById("newCellType")||{}).value || "").trim();
    try { ident = UJ.ontology.canonSubmitName(ident) || ""; } catch (_e){}
    const comment = ((document.getElementById("newCellComment")||{}).value || "").trim();
    const seg = HJ_NEW_CELL_SEG || "";
    msg.textContent = "sending\\u2026";
    /* TWO REPORTS, because they are two different claims — λJump's reasoning, unchanged. The row
       records that a cell EXISTS here, which is a fact about the volume; the identification is
       somebody's opinion about what it is, and it goes through the path every other identification
       takes so the next person can disagree and the most supported name wins. */
    if (ident) postReport({ type: "new_identification", timestamp: new Date().toISOString(),
                            nucleusId: String(addedCellId(coord)), rootId: seg, coord: coord,
                            identified: ident, path: "", comment: "", certainty: "" }, ident);
    Promise.resolve(postReport({ type: "new_cell_no_nucleus", timestamp: new Date().toISOString(),
                                 coord: coord, rootId: seg, identified: ident, comment: comment },
                               "new cell"))
      .then(function(d){
        const okd = !d || d.ok !== false;
        msg.textContent = okd ? "Thank you \\u2014 recorded." : "Could not record that.";
        if (!okd) return;
        document.getElementById("newCellComment").value = "";
        /* Straight into the list, without waiting for a reload: the row is saved and the cache is
           the only thing that does not know it yet. */
        const rec = { coord: coord, rootId: seg, identified: ident, comment: comment,
                      reporterName: (typeof REPORTER_NAME !== "undefined" && REPORTER_NAME) || "",
                      timestamp: new Date().toISOString() };
        HJ_NEW_CELLS = (HJ_NEW_CELLS || []).concat([rec]);
        HJ_NEW_CELLS_FETCHED = true;
        renderHjumpNewCells();
      }, function(){ msg.textContent = "Could not record that."; });
  });
  renderHjumpNewCells();
  fetchHjumpNewCells();
}, 0);

document.getElementById("dscount").textContent = fmt(N)+" cells are loaded in this page.";"""),

 # ── 5. the jump offers it ─────────────────────────────────────────────────────────────────────
 (u"η: a far jump offers to report a cell",
  u"""  const r=nearest(v[0],v[1],v[2]);
  if(r.i<0)return fail("No cell found.");
  if(r.dist>50000){""",
  u"""  const r=nearest(v[0],v[1],v[2]);
  if(r.i<0)return fail("No cell found.");
  /* Past ten micrometres the nearest soma is a different cell, so the coordinate you asked about
     may be one this table does not have (2026-09-24). */
  try { hjNewCellOffer(v, r.dist); } catch (_e){}
  if(r.dist>50000){"""),

 (u"η: ...and a near one clears it",
  u"""function doJump(){
  fail("");""",
  u"""function doJump(){
  fail("");
  try { const c=document.getElementById("newCellCta"); if(c) c.innerHTML=""; } catch (_e){}"""),

 # ── 6. the identification flow takes a cell it has no index for ──────────────────────────────
 (u"η: openIdentify takes a context as well as an index",
  u"""function openIdentify(i){
  const lay = volLayer(i)!=="no-layer" ? volLayer(i) : tagLayer(i);
  ID_CTX = {i:i, seg:c3Id(i), body:String(HSB[i]), pos:[HX[i],HY[i],HZ[i]],
            layer:lay, depth:depthUm(i),
            published: H01_NO_CALL[typeName(i)] ? null : typeName(i)};""",
  u"""/* An INDEX, or a context for a cell this page has no index for — one the community added, which
   has a derived id, a coordinate and (usually) a c3 segment, and no row in the table. Everything
   below reads ID_CTX and not `i`, so a cell that arrives this way is identified by exactly the path
   every H01 cell is (2026-09-24). See src/a_cell_h01_never_listed.py. */
function openIdentify(i){
  if (i && typeof i === "object"){
    ID_CTX = i;
    ID_PATH=[]; ID_NODE=startNodeFor();
    document.getElementById("idfpanel").classList.add("show");
    renderIdentify();
    const el0=document.getElementById("idfpanel");
    if(el0.scrollIntoView) el0.scrollIntoView({behavior:"smooth",block:"nearest"});
    return;
  }
  const lay = volLayer(i)!=="no-layer" ? volLayer(i) : tagLayer(i);
  ID_CTX = {i:i, seg:c3Id(i), body:String(HSB[i]), pos:[HX[i],HY[i],HZ[i]],
            layer:lay, depth:depthUm(i),
            published: H01_NO_CALL[typeName(i)] ? null : typeName(i)};"""),
])
