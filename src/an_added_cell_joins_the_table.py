# -*- coding: utf-8 -*-
u"""An added cell joins ηJump's table.                                                  2026-09-24

Søren, a minute after reporting his first one:

    "I just reported a cell, then pressed Jump to it and it took me to another cell, the nearest
     cell which is 27 µm away..."

WHICH IS EXACTLY WHAT THE BUTTON DID. "Jump to it ↗" filled the three coordinate boxes and clicked
#go, and #go runs doJump() — which answers "what is the nearest cell to this voxel" by walking the
47,447 rows of the embedded table. The cell he had just reported is not one of those rows. So the
nearest cell was a stranger 27.6 µm away, which is the very distance the offer had quoted at him
one screen earlier as its reason for asking. The card then opened wearing that stranger's name and
"H01 published classification" under it.

λJUMP ALREADY SOLVED THIS, and its own comment on the attempt it abandoned is the argument:

    "This used to hand an added cell to a separate hand-built card, which had none of the tool on
     it."

So there, added nuclei JOIN THE ARRAYS — and the file says why that is one change rather than
twenty: "Every reader in this file -- nearest(), kNearest(), Filter and show, the Excel export, the
charts, the random picker -- walks 0..N-1 over the parallel arrays. Teaching each of them about a
second kind of cell is how the second kind keeps being forgotten."

ηJump's readers are the same shape. nearest() and kNearest() are linear scans over 0..N-1;
rebuildTypePools(), wireContacts() and the random pickers are too. So the arrays grow here as well,
and the twelve red assertions go green without a single reader being told anything.

WHAT AN ADDED ROW CARRIES, and what it refuses to pretend:

  the coordinate              what was reported; the claim itself
  the c3 segment              split into D.HI + HLB the way every published row is, so c3Id(i)
                              reads it unchanged. A high word the table never used is appended to
                              D.HI. Zero where nothing was read, and a zero suppresses the mesh
                              buttons rather than offering a download that cannot exist.
  a derived cell id           addedCellId() — core/report.js, shared with λJump since yesterday.
                              H01's cell_bodies ids run 1..49,377; the band starts at a million.
  type `not-in-h01`           a pool of its own, in H01_NO_CALL so the cell counts as uncalled and
                              lands in the unassigned list, which is where an unnamed cell belongs.
                              NOT "unknown-type": that is H01 saying it looked and could not tell.
  no layer                    HYV/HYL are set to the no-answer values, which makes layerHtml fall
                              through to the fitted estimate and print "(estimated)" — already
                              worded for exactly this case. Sampling H01's layers volume would be
                              the better answer and is not available in a browser.
  NaN volume, NaN spininess,  λJump's reasoning verbatim: every numeric filter compares with < and
  NaN morphology              >, and NaN fails both, so an added cell is EXCLUDED from "soma 500 to
                              900 µm³" rather than arriving as a spurious zero. Nothing measured
                              this cell, and a filter about measurements must not match it.

AND THE CARD TELLS THE TRUTH ABOUT IT. The headline is the name it was reported with, not H01's;
the byline says "added here, not in H01's list"; the morphology block is replaced by where the cell
came from, who reported it and when; and the vote panel is seeded with the reported name, so it is
votable the moment it exists instead of after somebody identifies it a second time.

IDEMPOTENT, like λJump's: always rebuilt from the first N_TAB entries, so running it again after
somebody adds or renames a cell replaces the tail rather than compounding it.

`var` for HADDED/HADDED_REC, deliberately: showCell reads them, showCell can run from a restored
panel at DOMContentLoaded, and a `let` in its temporal dead zone throws on `typeof` — the trap that
took this page down yesterday. `var` hoists and is already initialised.

Check: hjnewcellcheck.js, extended first; 12 of its assertions failed before this went in.
Run: python3 src/an_added_cell_joins_the_table.py, then python3 src/build_stamps.py
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


edit("hjump.html", [
 # ── 1. the arrays can grow, and the table remembers how many rows were its own ───────────────
 (u"the table's own rows are counted, and the arrays can grow past them",
  u"""const N   = D.N;
const HX  = new Uint32Array(b64(D.XB).buffer), HY = new Uint32Array(b64(D.YB).buffer),
      HZ  = new Uint16Array(b64(D.ZB).buffer);
const HHB = b64(D.HB), HLB = new Uint32Array(b64(D.LB).buffer);
const HSB = new Uint32Array(b64(D.SB).buffer);           // cell_bodies object id
const HTB = b64(D.TB), HYL = b64(D.YLB), HMB = new Uint16Array(b64(D.MB).buffer);
const HYV = b64(D.YVB);                                  // layer sampled from H01's layers volume
const HVB = new Float32Array(b64(D.VB).buffer);          // soma volume, µm³
const HSP = new Float32Array(b64(D.SPB).buffer);         // spininess
const MORPH = {};""",
  u"""/* ── THE TABLE'S ROWS, AND THE ROWS THE COMMUNITY ADDS ────────────────────────  2026-09-24
   `let`, and N_TAB beside N, for λJump's reason: a cell H01 never listed joins these arrays
   rather than living on a card of its own, so that nearest(), kNearest(), the contact search,
   the type pools and every random picker — all of which walk 0..N-1 — find it without being
   told. absorbAddedCells() below replaces the tail; N_TAB is where the published table ends.
   See src/an_added_cell_joins_the_table.py. */
let N     = D.N;
const N_TAB = D.N;
let HX  = new Uint32Array(b64(D.XB).buffer), HY = new Uint32Array(b64(D.YB).buffer),
    HZ  = new Uint16Array(b64(D.ZB).buffer);
let HHB = b64(D.HB), HLB = new Uint32Array(b64(D.LB).buffer);
let HSB = new Uint32Array(b64(D.SB).buffer);             // cell_bodies object id
let HTB = b64(D.TB), HYL = b64(D.YLB), HMB = new Uint16Array(b64(D.MB).buffer);
let HYV = b64(D.YVB);                                    // layer sampled from H01's layers volume
let HVB = new Float32Array(b64(D.VB).buffer);            // soma volume, µm³
let HSP = new Float32Array(b64(D.SPB).buffer);           // spininess
/* 1 where the community added this row, and the report it came from. `var`, not `let`: showCell
   reads both, showCell can run from a restored panel before this script's last line, and reaching
   a `let` in its temporal dead zone throws even through `typeof` — which took this page down
   yesterday. `var` hoists already initialised. */
var HADDED = [], HADDED_REC = [];
/* A CELL TYPE FOR "H01 NEVER LISTED IT", which is not the same claim as either of H01's own
   no-call labels: "unknown-type" and "unclassified-neuron" are H01 saying it looked at a segment
   and could not tell. Pushed onto the embedded vocabulary so typeName(), rebuildTypePools() and
   the pickers treat it as an ordinary pool. */
const NOT_IN_H01 = "not-in-h01";
const CT_NOT_IN_H01 = (function(){
  let k = D.CT_NAMES.indexOf(NOT_IN_H01);
  if (k < 0){ k = D.CT_NAMES.length; D.CT_NAMES.push(NOT_IN_H01); }
  return k;
})();
const MORPH = {};"""),

 # ── 2. the pseudo-type takes its place in every name and grouping map ────────────────────────
 (u"an added cell is unclassified, not non-neuronal",
  u"""  if(t==="unclassified-neuron"||t==="unknown-type") return "none"; return "non"; }""",
  u"""  if(t==="unclassified-neuron"||t==="unknown-type"||t===NOT_IN_H01) return "none"; return "non"; }"""),

 (u"...and has a display name",
  u"""  "unknown-type":"Unknown type"
};""",
  u"""  "unknown-type":"Unknown type",
  /* Not "Unclassified": H01 did not decline to call this cell, it never had it. */
  "not-in-h01":"Cell not in H01’s list"
};"""),

 (u"...and a chart category",
  u"""  "unknown-type":"Unresolved"
};""",
  u"""  "unknown-type":"Unresolved",
  "not-in-h01":"Unresolved"
};"""),

 (u"...and counts as a cell nobody has called",
  u"""const H01_NO_CALL = {"unclassified-neuron":1,"unknown-type":1};""",
  u"""/* NOT_IN_H01 belongs here for the same reason the other two do: it decides whether the card
   invites an identification, whether the vote panel is seeded with a published name, and whether
   the cell is in the unassigned pool. A cell H01 never listed answers yes, none, yes. */
const H01_NO_CALL = {"unclassified-neuron":1,"unknown-type":1,"not-in-h01":1};"""),

 (u"...and is offered in the browse picker",
  u"""  {label:"No confident call",    types:["unclassified-neuron","unknown-type"]}""",
  u"""  {label:"No confident call",    types:["unclassified-neuron","unknown-type","not-in-h01"]}"""),

 # ── 3. the name a cell actually has ──────────────────────────────────────────────────────────
 (u"one name for a cell, whoever named it",
  u"""function longName(t){ return H01_LONG_NAME[t] || (String(t).charAt(0).toUpperCase()+String(t).slice(1)); }""",
  u"""function longName(t){ return H01_LONG_NAME[t] || (String(t).charAt(0).toUpperCase()+String(t).slice(1)); }
/* ── THE NAME A CELL ACTUALLY HAS ─────────────────────────────────────────────  2026-09-24
   For a published row that is H01's label. For a row the community added there is no H01 label to
   show, and showing one would be a lie about provenance — the lie Søren caught when the cell he
   had just reported opened as somebody else's oligodendrocyte. So: what the community has called
   it if anything, else the name it was reported with, else that it has none yet.

   hjumpIdentityOf reads a `let` declared much further down, so it is reached through a try: on
   first paint the identities have not landed and the reported name is the answer anyway. */
function hjCellName(i){
  if (!HADDED[i]) return longName(typeName(i));
  let nm = "";
  try { nm = hjumpIdentityOf(i) || ""; } catch (_tdz){ nm = ""; }
  if (!nm){ const rec = HADDED_REC[i] || {}; nm = rec.identified || ""; }
  return nm ? String(nm) : "Unnamed added cell";
}"""),
])
print("  -- showCell --")

edit("hjump.html", [
 (u"the headline names the cell, and credits whoever named it",
  u"""  h+='<div class="celltype" id="ctHeadline" data-unclassified="'+(noPub?"1":"0")+'"'
    +' data-microns-name="'+(noPub?"":escHtml(longName(t)))+'">'
    +celltypeLink(pos,seg,escHtml(longName(t)))+star
    +' <small>H01 published classification</small></div>';""",
  u"""  h+='<div class="celltype" id="ctHeadline" data-unclassified="'+(noPub?"1":"0")+'"'
    +' data-microns-name="'+(noPub?"":escHtml(longName(t)))+'">'
    +celltypeLink(pos,seg,escHtml(hjCellName(i)))+star
    /* The byline is a provenance claim, so an added cell gets its own (2026-09-24). */
    +(HADDED[i]?' <small>added here, not in H01&rsquo;s list</small>'
               :' <small>H01 published classification</small>')+'</div>';"""),

 (u"...and the tag says which kind of no-call this is",
  u"""  if(noPub) h+=' <span class="tag none" id="ctTag" title="H01 published no cell type for this '
    +'segment — nobody has agreed on one here yet">unclassified</span>';""",
  u"""  if(noPub) h+=' <span class="tag none" id="ctTag" title="'
    +(HADDED[i]?'This cell is not in H01\\u2019s cell_bodies list at all, so there was never a '
               +'published type to disagree with. Whatever the community settles on is the only '
               +'name it has.'
              :'H01 published no cell type for this segment — nobody has agreed on one here yet')
    +'">'+(HADDED[i]?'not in H01&rsquo;s list':'unclassified')+'</span>';"""),

 (u"no soma volume where nothing measured the soma",
  u"""  h+='<div class="meta">Soma '+fmt(HVB[i].toFixed(0))+' &micro;m&sup3; &middot; '
    +(dep>=0?dep.toFixed(0)+' &micro;m below the L1/L2 boundary':Math.abs(dep).toFixed(0)+' &micro;m above the L1/L2 boundary')""",
  u"""  /* HVB[i] IS NaN FOR AN ADDED CELL, on purpose (see absorbAddedCells), so the line does not
     open with a measurement that does not exist. The depth is fitted from the coordinate and is
     as true for an added cell as for a published one, so it stays. */
  h+='<div class="meta">'+(HADDED[i]?'':'Soma '+fmt(HVB[i].toFixed(0))+' &micro;m&sup3; &middot; ')
    +(dep>=0?dep.toFixed(0)+' &micro;m below the L1/L2 boundary':Math.abs(dep).toFixed(0)+' &micro;m above the L1/L2 boundary')"""),

 (u"a cell with no segment is not offered a mesh",
  u"""  h+='<div class="ids">';
  h+=idRow("c3 segment", seg, "H01 c3 segmentation ID — click to copy",""",
  u"""  h+='<div class="ids">';
  /* NOTHING SEGMENTED HERE IS A FACT ABOUT THE CELL, not a reason to hide the row — but it is a
     reason not to offer "⬇ 3D model", which would be a download that cannot exist. 998 of the
     1,917 somata H01 detected without classifying sample background in c3 at their own centroid,
     so this is the ordinary case for a cell nobody segmented, not an edge one (2026-09-24). */
  if(seg==="0"){
    h+=idRow("c3 segment", "none read here",
             "Nothing is segmented in H01\\u2019s c3 at this voxel, so this cell has no mesh, no "
             +"computed volume and nothing to highlight in the viewer. Its claim is the coordinate.");
  } else
  h+=idRow("c3 segment", seg, "H01 c3 segmentation ID — click to copy","""),

 (u"...and its id is named for what it is",
  u"""  h+=idRow("cell body", String(HSB[i]), "cell_bodies segmentation ID — a separate ID space from c3");""",
  u"""  h+=idRow(HADDED[i]?"cell id (derived)":"cell body", String(HSB[i]),
      HADDED[i]?"H01 never detected this cell, so it has no cell_bodies object. The id is derived "
                +"from its coordinate \\u2014 \\u03bbJump's scheme, now shared through "
                +"core/report.js \\u2014 so votes, favourites and history can key on it, and every "
                +"client computes the same number without anything being assigned by a server."
               :"cell_bodies segmentation ID — a separate ID space from c3");"""),

 (u"where the cell came from, instead of eleven NaNs",
  u"""  h+='<div class="neigh"><h4>Morphology (H01 segment properties)</h4><div class="meta" style="margin-top:0;color:var(--ink)">';
  Object.keys(MORPH_LABEL).forEach(function(k){
    h+='<span style="display:inline-block;min-width:150px">'+escHtml(MORPH_LABEL[k])
      +' <b>'+fmt(MORPH[k][i])+'</b></span>';
  });
  h+='<span style="display:inline-block;min-width:150px">spininess <b>'+HSP[i].toFixed(3)+'</b></span></div></div>';""",
  u"""  /* H01 MEASURED NOTHING ABOUT A CELL IT NEVER LISTED, and printing eleven NaNs would say the
     opposite of that. What goes here instead is the one thing the card was missing when Søren
     opened his own reported cell and found it dressed as a published oligodendrocyte: where this
     row came from, who put it there, and what it therefore does not have. */
  if(HADDED[i]){
    const arec=HADDED_REC[i]||{};
    h+='<div class="neigh"><h4>Where this cell came from</h4>'
      +'<div class="meta" style="margin-top:0;color:var(--ink)">'
      +'Reported at this voxel'+(arec.reporterName?' by '+escHtml(arec.reporterName):'')
      +(arec.timestamp?' on '+escHtml(String(arec.timestamp).slice(0,10)):'')
      +' as a soma H01&rsquo;s cell_bodies list does not have. H01 published no cell type, no soma '
      +'volume and no segment properties for it, so this card carries the coordinate, the c3 '
      +'segment read there, and whatever the community says about it.'
      +(arec.comment?'<div style="margin-top:6px">&ldquo;'+escHtml(arec.comment)+'&rdquo;</div>':'')
      +'</div></div>';
  } else {
  h+='<div class="neigh"><h4>Morphology (H01 segment properties)</h4><div class="meta" style="margin-top:0;color:var(--ink)">';
  Object.keys(MORPH_LABEL).forEach(function(k){
    h+='<span style="display:inline-block;min-width:150px">'+escHtml(MORPH_LABEL[k])
      +' <b>'+fmt(MORPH[k][i])+'</b></span>';
  });
  h+='<span style="display:inline-block;min-width:150px">spininess <b>'+HSP[i].toFixed(3)+'</b></span></div></div>';
  }"""),

 (u"the neighbour list uses the same names",
  u"""      +escHtml(longName(typeName(c.i)))+' <span class="nsub">'+escHtml(classLabel(c.i))+'</span></div>'""",
  u"""      +escHtml(hjCellName(c.i))+' <span class="nsub">'+escHtml(classLabel(c.i))+'</span></div>'"""),

 (u"...and the invitation knows there was never a published call",
  u"""    +(noCall?'H01 has no published type for this cell &mdash; yours would be the first on record.'
            :'Not sure, or think H01 got it wrong? Take the guided identification.')""",
  u"""    +(HADDED[i]
        ?'This cell is not in H01&rsquo;s list, so nobody has ever published a type for it &mdash; '
         +'the community&rsquo;s reading is the only one there will be.'
        :noCall?'H01 has no published type for this cell &mdash; yours would be the first on record.'
               :'Not sure, or think H01 got it wrong? Take the guided identification.')"""),

 (u"the vote panel is seeded with the name it was reported with",
  u"""  loadIdentityVotesPanel(String(HSB[i]), H01_NO_CALL[t]?[]:[longName(t)]);""",
  u"""  /* AN ADDED CELL IS VOTABLE THE MOMENT IT EXISTS. Its seed is the name whoever reported it
     proposed — otherwise the first reading of a cell could only be agreed with after somebody
     ran the guided identification on it a second time (2026-09-24). */
  loadIdentityVotesPanel(String(HSB[i]),
    HADDED[i]?((HADDED_REC[i]&&HADDED_REC[i].identified)?[String(HADDED_REC[i].identified)]:[])
             :(H01_NO_CALL[t]?[]:[longName(t)]));"""),

 (u"the recent chip shows the cell's own name",
  u"""  SEARCH_HISTORY.unshift({key:key,i:i,label:longName(typeName(i))});""",
  u"""  SEARCH_HISTORY.unshift({key:key,i:i,label:hjCellName(i)});"""),
])
print("  -- absorb --")

edit("hjump.html", [
 (u"the added cells join the arrays",
  u"""function fetchHjumpNewCells(){""",
  u"""/* ── THE SAME RIGHTS: AN ADDED CELL JOINS THE ARRAYS ─────────────────────────  2026-09-24
   Søren, having reported one: "I just reported a cell, then pressed Jump to it and it took me to
   another cell, the nearest cell which is 27 µm away..." — because the jump asked doJump() what is
   nearest to that voxel, and doJump() only knew the 47,447 published rows. The cell he had just
   added was not one of them.

   λJump's answer, ported. Its own note on the version it replaced is the argument for this one:
   "This used to hand an added cell to a separate hand-built card, which had none of the tool on
   it." Appending is one change that reaches every reader at once — nearest(), kNearest(), the
   contact candidate scan, the type pools, the unassigned list and both random pickers all walk
   0..N-1 and none of them had to be told.

   IDEMPOTENT: always rebuilt from the first N_TAB entries, so running again after somebody adds or
   renames a cell replaces the tail rather than compounding it. */
function absorbAddedCells(){
  const list = (HJ_NEW_CELLS || []).filter(hjNewCellPos);
  const cut = function(a){ return Array.prototype.slice.call(a, 0, N_TAB); };
  const hx=cut(HX), hy=cut(HY), hz=cut(HZ), hhb=cut(HHB), hlb=cut(HLB), hsb=cut(HSB),
        htb=cut(HTB), hyl=cut(HYL), hmb=cut(HMB), hyv=cut(HYV), hvb=cut(HVB), hsp=cut(HSP);
  const mo = {}; Object.keys(MORPH).forEach(function(k){ mo[k] = cut(MORPH[k]); });
  /* The no-answer values, so layerHtml falls through to its fitted estimate and prints
     "(estimated)". Claiming H01's layers volume was sampled at this coordinate would be the one
     thing on this card that is not checkable. */
  const noLayer = Math.max(0, D.LV_NAMES.indexOf("no-layer"));
  const noTag   = Math.max(0, D.LY_NAMES.indexOf("layer-unclassified"));
  const flags=[], recs=[];
  list.forEach(function(rec){
    const p = hjNewCellPos(rec);
    hx.push(p[0]); hy.push(p[1]); hz.push(p[2]);
    /* THE SEGMENT IN THIS PAGE'S OWN SPLIT FORM, so c3Id(i) reads an added row with no change: the
       high 32 bits index D.HI (appended if this segment needs a word the table never used) and the
       low 32 go in HLB. Zero where nothing was read, which is what the card treats as "no mesh". */
    let hi = 0, lo = 0;
    try {
      const big = BigInt(String(rec.rootId || "0").replace(/[^0-9]/g, "") || "0");
      hi = Number(big / 4294967296n); lo = Number(big % 4294967296n);
    } catch (_e){ hi = 0; lo = 0; }
    let hk = D.HI.indexOf(hi); if (hk < 0){ hk = D.HI.length; D.HI.push(hi); }
    hhb.push(hk); hlb.push(lo >>> 0);
    /* core/report.js's, shared with λJump so every id either tool has derived stays the same. */
    hsb.push(addedCellId(p.join(",")));
    htb.push(CT_NOT_IN_H01);
    hyv.push(noLayer); hyl.push(noTag);
    hmb.push(0);
    /* NaN, NOT ZERO — λJump's reasoning, unchanged: every numeric range filter here compares with
       < and >, and NaN fails both, so an added cell is EXCLUDED from "soma 500 to 900 µm³" rather
       than arriving as a spurious zero. Nothing measured this cell. */
    hvb.push(NaN); hsp.push(NaN);
    Object.keys(mo).forEach(function(k){ mo[k].push(NaN); });
    flags.push(1); recs.push(rec);
  });
  HX=hx;HY=hy;HZ=hz;HHB=hhb;HLB=hlb;HSB=hsb;HTB=htb;HYL=hyl;HMB=hmb;HYV=hyv;HVB=hvb;HSP=hsp;
  Object.keys(mo).forEach(function(k){ MORPH[k] = mo[k]; });
  HADDED=[]; HADDED_REC=[];
  for (let i=0;i<N_TAB;i++){ HADDED.push(0); HADDED_REC.push(null); }
  HADDED = HADDED.concat(flags); HADDED_REC = HADDED_REC.concat(recs);
  N = N_TAB + list.length;
  /* Everything that counted the old N. Each in its own try: a page that loses one list should
     lose one list, not the cells. */
  try { rebuildTypePools(); } catch (_e1){}
  try { if (typeof renderTypeCheckboxes === "function") renderTypeCheckboxes(); } catch (_e2){}
  try { if (typeof renderRandomTypeSelect === "function") renderRandomTypeSelect(); } catch (_e3){}
  try {
    const uc = document.getElementById("unassignedCount");
    if (uc) uc.textContent = fmt(UNASSIGNED_IDX.length)
                           + " cells in this table have no confident H01 call.";
  } catch (_e4){}
  return N;
}
/* The row's own index, or -1. Used by the jump button, which must not settle for "nearest". */
function addedIndexAt(coordStr){
  const bid = String(addedCellId(String(coordStr).split(/[\\s,;]+/).filter(Boolean).join(",")));
  for (let i=N_TAB;i<N;i++) if (String(HSB[i]) === bid) return i;
  return -1;
}
function fetchHjumpNewCells(){"""),

 (u"...as soon as they are fetched",
  u"""      HJ_NEW_CELLS = ((d && d.newCells) || []).filter(hjNewCellPos);
      HJ_NEW_CELLS_FETCHED = true;
      renderHjumpNewCells();
      return HJ_NEW_CELLS;""",
  u"""      HJ_NEW_CELLS = ((d && d.newCells) || []).filter(hjNewCellPos);
      HJ_NEW_CELLS_FETCHED = true;
      try { absorbAddedCells(); } catch (_e){}
      renderHjumpNewCells();
      return HJ_NEW_CELLS;"""),

 (u"...and as soon as one is reported",
  u"""        HJ_NEW_CELLS = (HJ_NEW_CELLS || []).concat([rec]);
        HJ_NEW_CELLS_FETCHED = true;
        renderHjumpNewCells();""",
  u"""        HJ_NEW_CELLS = (HJ_NEW_CELLS || []).concat([rec]);
        HJ_NEW_CELLS_FETCHED = true;
        /* Into the table, not just the list: the cell has to be findable before the button that
           says "Jump to it" is pressed, which is a second away (2026-09-24). */
        try { absorbAddedCells(); } catch (_ea){}
        renderHjumpNewCells();"""),

 (u"the jump goes to the cell, not to its neighbourhood",
  u"""  [].slice.call(host.querySelectorAll(".jump")).forEach(function(b){
    b.addEventListener("click", function(){
      document.getElementById("x").value = b.dataset.x;
      document.getElementById("y").value = b.dataset.y;
      document.getElementById("z").value = b.dataset.z;
      document.getElementById("go").click();
    });
  });""",
  u"""  [].slice.call(host.querySelectorAll(".jump")).forEach(function(b){
    b.addEventListener("click", function(){
      const p = [b.dataset.x, b.dataset.y, b.dataset.z];
      document.getElementById("x").value = p[0];
      document.getElementById("y").value = p[1];
      document.getElementById("z").value = p[2];
      /* THE CELL, NOT THE NEIGHBOURHOOD. This used to click #go, and #go asks "what is nearest to
         this voxel" — Søren: "I just reported a cell, then pressed Jump to it and it took me to
         another cell, the nearest cell which is 27 µm away..." The row's own index is looked up
         now, so a published soma that happens to be closer cannot win; #go stays as the fallback
         for a row absorbAddedCells has somehow not taken in yet. */
      const hit = addedIndexAt(p.join(","));
      if (hit < 0){ document.getElementById("go").click(); return; }
      try { if (typeof fail === "function") fail(""); } catch (_e){}
      const cta = document.getElementById("newCellCta"); if (cta) cta.innerHTML = "";
      showCell(hit, 0, false);
    });
  });"""),
])
print("\nNow: python3 src/build_stamps.py")
