# -*- coding: utf-8 -*-
u"""Bulk organelle annotation moves out of ujump.html into core/bulkorgan.js.        2026-09-21

Stage H of the port, first slice. Søren's scope for the port included *"the Bulk organelle
annotation"* on every tool, and like the tracing card it was µJump-only: ~340 lines of script and a
card of markup inside ujump.html. The extraction comes first and changes NOTHING on µJump — the
proof is bulkorgancheck.js, written before this and run on both sides of it with identical output.

── READ, NOT RETYPED ──────────────────────────────────────────────────────────────

The script is cut out of ujump.html between its own header and the end of its wiring, and the
markup between the card's own tags; both land in the module verbatim except for the table of
substitutions below. Every substitution replaces a reach into µJump's globals with a call to a
HOST HOOK whose default is exactly that reach, so µJump — which sets none — runs the same code.

── THE HOOKS, UJ.cfg.bulk ─────────────────────────────────────────────────────────

  sources()           {seg, nuc, res} for core/segread.js     default: µJump's SRC.seg / SRC.nuc
  indexOfRoot(id)     the table row a root id is              default: rootIdToIndex
  indexOfNucleus(id)  the table row a nucleus id is           default: nidToIndex
  nucIdOf(i)          the nucleus id a row is filed under     default: String(NID[i])
  coordOf(i)          the voxel a row is filed at             default: NX/NY/NZ
  label(i)            the Cell column                         default: "Nucleus N · <name>"

A dataset with NO NUCLEUS VOLUME (βJump, ηJump) skips rung 3 of the ladder rather than asking
core/segread.js to search a volume that is not configured — which fetches "/info" off grubblab.com
and throws. That guard is the only behaviour this adds, and µJump, which has a nucleus volume,
never reaches it.

Run: python3 src/bulkorgan_extraction.py
"""
import io
import json
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UJ = os.path.join(HERE, "ujump.html")
MOD = os.path.join(HERE, "core", "bulkorgan.js")

s = io.open(UJ, encoding="utf-8").read()

if u'<script src="core/bulkorgan.js"></script>' in s and os.path.exists(MOD):
    print("already extracted")
    raise SystemExit(0)

# ── 1. cut the script ─────────────────────────────────────────────────────────────────────────
START = u"/* ── BULK ORGANELLE ANNOTATION ─"
END_MARK = u'document.getElementById("x").value="240640";'
i = s.index(START)
j = s.index(END_MARK, i)
code = s[i:j]
assert code.rstrip().endswith(u"})();"), "the cut does not end with the wiring IIFE"
assert code.count(u"function bulkOrgan") == 6, code.count(u"function bulkOrgan")

# ── 2. cut the markup ─────────────────────────────────────────────────────────────────────────
M_OPEN = u'<div class="card" id="bulkOrganCard">\n'
mi = s.index(M_OPEN) + len(M_OPEN)
mj = s.index(u"</details>\n</div>", mi) + len(u"</details>\n")
markup = s[mi:mj]
assert markup.startswith(u'<details id="bulkOrganPanel">') and u'id="bulkOrganSubmit"' in markup

# ── 3. the substitutions: every reach into µJump's globals becomes a hook ─────────────────────
SUBS = [
    (u"the cell's name, when a host has its own way to say it",
     u'''function bulkOrganCellName(i){
  if(i<0)return "";''',
     u'''function bulkOrganCellName(i){
  if(i<0)return "";
  if(bulkCfg().name)return bulkCfg().name(i);'''),

    (u"rung 1: the row a root id is",
     u'''    let i=(typeof rootIdToIndex==="function")?rootIdToIndex(hit.r.rootId):-1;
    if(i<0&&hit.r.nucleusId&&typeof nidToIndex==="function")i=nidToIndex(hit.r.nucleusId);''',
     u'''    let i=bulkIndexOfRoot(hit.r.rootId);
    if(i<0&&hit.r.nucleusId)i=bulkIndexOfNucleus(hit.r.nucleusId);'''),

    (u"...and the disagreement test asks the host for the row's nucleus",
     u'''    if(i>=0&&hit.r.nucleusId&&String(NID[i])!==String(hit.r.nucleusId)){''',
     u'''    if(i>=0&&hit.r.nucleusId&&bulkNucIdOf(i)!==String(hit.r.nucleusId)){'''),

    (u"...and the warning names it the same way",
     u'''      out.warn="the cell here is nucleus "+NID[i]+" but the point is inside nucleus "+hit.r.nucleusId;''',
     u'''      out.warn="the cell here is nucleus "+bulkNucIdOf(i)+" but the point is inside nucleus "+hit.r.nucleusId;'''),

    (u"rung 2: the row a nucleus id is",
     u'''    out.i=(typeof nidToIndex==="function")?nidToIndex(hit.r.nucleusId):-1;''',
     u'''    out.i=bulkIndexOfNucleus(hit.r.nucleusId);'''),

    (u"rung 3 only where there is a nucleus volume to search",
     u'''  for(const e of ends){
    const n=await UJ.segread.nearestNucleus(e[1],BULK_ORGAN_NEAR_NM);''',
     u'''  /* A dataset with no nucleus volume has no rung 3: searching one that is not configured fetches
     "/info" off this page's own host and throws. Rows fall through to "nothing here", with the
     reason the reader gave. */
  for(const e of (bulkSources().nuc?ends:[])){
    const n=await UJ.segread.nearestNucleus(e[1],BULK_ORGAN_NEAR_NM);'''),

    (u"...and its row",
     u'''  out.i=(typeof nidToIndex==="function")?nidToIndex(near.nucleusId):-1;''',
     u'''  out.i=bulkIndexOfNucleus(near.nucleusId);'''),

    (u"the Cell column",
     u'''    if(r.i>=0)return "Nucleus "+NID[r.i]+" &middot; "+escHtml(bulkOrganCellName(r.i));''',
     u'''    if(r.i>=0)return bulkCellLabel(r.i);'''),

    (u"the reader is pointed at the host's sources",
     u'''    UJ.segread.configure({seg:SRC.seg,nuc:SRC.nuc,res:UJ.cfg.res});''',
     u'''    UJ.segread.configure(bulkSources());'''),

    (u"the submission files under the host's ids",
     u'''    const nucId=(i>=0)?String(NID[i]):(rows[0].nucleusId?String(rows[0].nucleusId):"");
    const coord=(i>=0)?[NX[i],NY[i],NZ[i]].join(","):rows[0].a.join(",");''',
     u'''    const nucId=(i>=0)?bulkNucIdOf(i):(rows[0].nucleusId?String(rows[0].nucleusId):"");
    const coord=(i>=0)?bulkCoordOf(i):rows[0].a.join(",");'''),

    (u"the wiring waits for the card to be built",
     u'''(function wireBulkOrgan(){
  const kindEl=document.getElementById("bulkOrganKind");
  if(!kindEl)return;''',
     u'''function wireBulkOrgan(){
  const kindEl=document.getElementById("bulkOrganKind");
  if(!kindEl||BULK_ORGAN_WIRED)return;
  BULK_ORGAN_WIRED=true;'''),
]
for name, old, new in SUBS:
    n = code.count(old)
    assert n == 1, "%s: %d matches" % (name, n)
    code = code.replace(old, new, 1)
    print("  sub: " + name)
assert code.rstrip().endswith(u"})();")
code = code.rstrip()[:-len(u"})();")] + u"}\n"

for bad in [u"NID[", u"NX[", u"SRC.", u"rootIdToIndex", u"nidToIndex"]:
    stripped = u"\n".join(l for l in code.split(u"\n") if not l.lstrip().startswith((u"/*", u"*", u"//"))
                         and u"typeof " not in l and u"__COMM_ROWTYPE" not in l)
    assert bad not in stripped, "the module still reaches for %r" % bad

HEADER = u'''/* core/bulkorgan.js — one paste, one structure type, as many cells as you marked.  2026-09-21

   Moved out of ujump.html, where it was built on 2026-09-10 (see the header below, kept as it was).
   Nothing about what it does changed in the move; bulkorgancheck.js was written first and prints the
   same thing on both sides of it.

   WHAT A HOST PROVIDES, all optional, all defaulting to what µJump has always used:

     UJ.cfg.bulk = {
       sources:        () -> {seg, nuc, res}   what core/segread.js reads      (SRC.seg, SRC.nuc)
       indexOfRoot:    (rootId) -> row                                          (rootIdToIndex)
       indexOfNucleus: (nucleusId) -> row                                       (nidToIndex)
       nucIdOf:        (row) -> the nucleus id a structure is filed under       (NID[row])
       coordOf:        (row) -> "x,y,z" it is filed at                          (NX, NY, NZ)
       label:          (row) -> HTML for the Cell column              ("Nucleus N · <name>")
       name:           (row) -> the cell's type, for that label      (own / community / MICrONS)
     }

   A DATASET WITH NO NUCLEUS VOLUME has no rung 3 — see the ladder.

   DOM: an empty `<div class="card" id="bulkOrganCard"></div>` where the page wants the card. The
   module fills it on DOMContentLoaded and wires it once; a page that already has the markup keeps
   it. Needs core/organelles.js, core/segread.js, core/ontology.js (for the Nucleus group) loaded
   first, and the host's postReport / reportGateBlock / escHtml. */
var UJ = UJ || {};
var BULK_ORGAN_WIRED = false;
function bulkCfg(){ return (typeof UJ !== "undefined" && UJ.cfg && UJ.cfg.bulk) || {}; }
function bulkSources(){
  var c = bulkCfg();
  if (c.sources){
    var o = (typeof c.sources === "function") ? c.sources() : c.sources;
    return { seg: o.seg || "", nuc: o.nuc || "", res: o.res || UJ.cfg.res };
  }
  return { seg: SRC.seg, nuc: SRC.nuc, res: UJ.cfg.res };
}
function bulkIndexOfRoot(r){
  var c = bulkCfg();
  if (c.indexOfRoot) return c.indexOfRoot(r);
  return (typeof rootIdToIndex === "function") ? rootIdToIndex(r) : -1;
}
function bulkIndexOfNucleus(n){
  var c = bulkCfg();
  if (c.indexOfNucleus) return c.indexOfNucleus(n);
  return (typeof nidToIndex === "function") ? nidToIndex(n) : -1;
}
function bulkNucIdOf(i){
  var c = bulkCfg();
  return c.nucIdOf ? String(c.nucIdOf(i)) : String(NID[i]);
}
function bulkCoordOf(i){
  var c = bulkCfg();
  return c.coordOf ? String(c.coordOf(i)) : [NX[i], NY[i], NZ[i]].join(",");
}
function bulkCellLabel(i){
  var c = bulkCfg();
  return c.label ? c.label(i) : "Nucleus " + NID[i] + " &middot; " + escHtml(bulkOrganCellName(i));
}

'''

FOOTER = u'''
/* The card's markup, read out of ujump.html as it was on 2026-09-21. */
function bulkOrganHtml(){
  return %s;
}
/* Fill an empty wrapper, wire once. A page that still carries its own copy keeps it. */
function bulkOrganMount(){
  var w = document.getElementById("bulkOrganCard");
  if (!w) return false;
  if (!w.firstElementChild) w.innerHTML = bulkOrganHtml();
  wireBulkOrgan();
  return true;
}
if (typeof document !== "undefined"){
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bulkOrganMount);
  else bulkOrganMount();
}
''' % json.dumps(markup, ensure_ascii=False)

io.open(MOD, "w", encoding="utf-8").write(HEADER + code + FOOTER)
print("  wrote core/bulkorgan.js")

# ── 4. ujump.html loses both, and loads the module ────────────────────────────────────────────
s = s[:i] + s[j:]
s = s[:mi] + s[mj:]
TAG_OLD = u'''<script src="core/ontology.js"></script>
<script src="core/panel.js"></script>'''
TAG_NEW = u'''<script src="core/ontology.js"></script>
<!-- Bulk organelle annotation, extracted from this file on 2026-09-21. After ontology.js, whose
     Nucleus group it reads at parse time; it builds the card into #bulkOrganCard below. -->
<script src="core/bulkorgan.js"></script>
<script src="core/panel.js"></script>'''
assert s.count(TAG_OLD) == 1
s = s.replace(TAG_OLD, TAG_NEW, 1)
io.open(UJ, "w", encoding="utf-8").write(s)
print("  ujump.html: script and markup moved out, tag added")
