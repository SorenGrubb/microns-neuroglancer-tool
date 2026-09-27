# -*- coding: utf-8 -*-
u"""An added cell is filed under the name it was given.                                 2026-09-26

Søren, of the endothelial cell he reported and identified himself in ηJump:

    "the endothelial cell did not get its own category in the filter, it is just called cell not in
     H01's list. That should be fixed."

"Endothelial cell" is not one of H01's ten cell types — its nearest is "blood-vessel-cell" — so
there was no pool for it to join, and `not-in-h01` (added two days ago, so that a cell H01 never
listed would have a type at all) collected every named cell into one heap. That is the right name
for a cell nobody has identified and the wrong name for one somebody has.

THE RULE, WHICH FOLLOWS FROM WHAT THESE CELLS ARE. A published cell's pool is H01's call, and a
community identification moves it only where it resolves something H01 itself merged — that is
h01SplitFor(), and it stays exactly as it was. A cell H01 never listed has no published call to be
measured against: the name somebody gave it is the only name it has. So it is filed under that name,
in a group of its own, and `not-in-h01` goes back to naming only the cells reported without a type.

  ...WHICH ALSO TAKES A NAMED ONE OUT OF THE UNASSIGNED LIST, by the rule already written there:
  "a community-resolved cell is no longer uncalled". "Random unassigned cell — help identify one"
  should not offer a cell that has just been identified.

  THE POOLS ARE BUILT, NOT DECLARED. TYPE_GROUPS is a constant list of H01's own vocabulary and
  cannot name a cell type nobody has proposed yet, so typeGroups() returns it with one more group
  on the end when there are named added cells — and both lists that render from it read that
  instead. Their display names come from poolLabel(), because "added:Endothelial cell" is a key
  and not something anyone should read.

THIS REPLACES AN ASSERTION OF ITS OWN. hjnewcellcheck.js asserted on 2026-09-24 that an added cell
lands in the unassigned pool. That was right about a cell reported with no type and wrong about the
one under test, which was reported AS something. Both cases are asserted now, and the fixture's
proposed type moved from "Astrocyte" to "Endothelial cell" — H01 has 5,279 astrocytes, so the old
fixture would have passed on H01's pool and proved nothing.

Check: hjnewcellcheck.js; 3 of its assertions failed before this went in.
Run: python3 src/an_added_cell_is_filed_under_its_name.py, then python3 src/build_stamps.py
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
 (u"a pool per name, and a group to put them in",
  u"""const IDX_BY_TYPE={}, UNASSIGNED_IDX=[];""",
  u"""const IDX_BY_TYPE={}, UNASSIGNED_IDX=[];
/* ── A CELL H01 NEVER LISTED IS FILED UNDER ITS OWN NAME ──────────────────────  2026-09-26
   Søren: "the endothelial cell did not get its own category in the filter, it is just called cell
   not in H01's list." "Endothelial cell" is not an H01 type — its nearest is "blood-vessel-cell" —
   so there was no pool for it and every named added cell landed in one heap.

   The key carries the name so the pool needs nothing else to remember it; poolLabel() takes it
   back off for the screen. See src/an_added_cell_is_filed_under_its_name.py. */
const ADDED_POOL = "added:";
let ADDED_POOLS = [];
function addedPoolFor(i){
  if(!HADDED[i]) return "";
  const nm = hjCellName(i);
  if(!nm || nm === "Unnamed added cell") return "";
  return ADDED_POOL + nm;
}
function poolLabel(t){
  const s = String(t||"");
  return s.indexOf(ADDED_POOL)===0 ? s.slice(ADDED_POOL.length) : longName(s);
}
/* TYPE_GROUPS is H01's own vocabulary and cannot name a type nobody has proposed yet. */
function typeGroups(){
  if(!ADDED_POOLS.length) return TYPE_GROUPS;
  return TYPE_GROUPS.concat([{ label:"Not in H01 \\u2014 named here", types:ADDED_POOLS.slice() }]);
}"""),

 (u"the pools are rebuilt with the cells",
  u"""  D.CT_NAMES.forEach(function(t){ IDX_BY_TYPE[t]=[]; });
  for(const k in ALWAYS_SHOW_TYPES) IDX_BY_TYPE[k]=[];
  UNASSIGNED_IDX.length=0;
  for(let i=0;i<N;i++){
    const t=typeName(i);
    const split=haveIdent?h01SplitFor(hjumpIdentityOf(i)):undefined;
    const bucket=split||t;
    if(IDX_BY_TYPE[bucket]) IDX_BY_TYPE[bucket].push(i);
    /* "no confident call" stays keyed on what H01 itself said: a community-resolved cell is no
       longer uncalled, so a resolved microglia/opc drops out of this list too. */
    if(H01_NO_CALL[t]&&!split) UNASSIGNED_IDX.push(i);
  }""",
  u"""  D.CT_NAMES.forEach(function(t){ IDX_BY_TYPE[t]=[]; });
  for(const k in ALWAYS_SHOW_TYPES) IDX_BY_TYPE[k]=[];
  ADDED_POOLS.forEach(function(k){ delete IDX_BY_TYPE[k]; });
  ADDED_POOLS=[];
  UNASSIGNED_IDX.length=0;
  for(let i=0;i<N;i++){
    const t=typeName(i);
    const split=haveIdent?h01SplitFor(hjumpIdentityOf(i)):undefined;
    /* A cell H01 never listed has no published call to be measured against, so the name somebody
       gave it is not an override of anything — it is the only name it has, and it is what the
       cell is filed under. A published cell's pool is still H01's, moved only by h01SplitFor
       (2026-09-26). */
    const own=addedPoolFor(i);
    if(own&&!IDX_BY_TYPE[own]){ IDX_BY_TYPE[own]=[]; ADDED_POOLS.push(own); }
    const bucket=own||split||t;
    if(IDX_BY_TYPE[bucket]) IDX_BY_TYPE[bucket].push(i);
    /* "no confident call" stays keyed on what H01 itself said: a community-resolved cell is no
       longer uncalled, so a resolved microglia/opc drops out of this list too -- and so does an
       added cell somebody has just named, by the same rule. */
    if(H01_NO_CALL[t]&&!split&&!own) UNASSIGNED_IDX.push(i);
  }
  ADDED_POOLS.sort();"""),

 (u"the checkbox list reads the built groups",
  u"""  box.innerHTML=TYPE_GROUPS.map(function(g){
    const inner=g.types.filter(function(t){ return (IDX_BY_TYPE[t]&&IDX_BY_TYPE[t].length)||ALWAYS_SHOW_TYPES[t]; })""",
  u"""  box.innerHTML=typeGroups().map(function(g){
    const inner=g.types.filter(function(t){ return (IDX_BY_TYPE[t]&&IDX_BY_TYPE[t].length)||ALWAYS_SHOW_TYPES[t]; })"""),

 (u"...and names them the way a person reads them",
  u"""          +escHtml(longName(t))+' <span class="nsub">'+fmt(n)+'</span></label>'; }).join("");""",
  u"""          +escHtml(poolLabel(t))+' <span class="nsub">'+fmt(n)+'</span></label>'; }).join("");"""),

 (u"the browse picker too",
  u"""  sel.innerHTML=TYPE_GROUPS.map(function(g){
    const col=TYPE_GROUP_COLOUR[g.label]||"var(--cat-other)";
    const opts=g.types.filter(function(t){ return IDX_BY_TYPE[t]&&IDX_BY_TYPE[t].length; })
      .map(function(t){ return '<option value="'+escHtml(t)+'" style="color:'+col+'">'+escHtml(longName(t))+' ('+fmt(IDX_BY_TYPE[t].length)+')</option>'; }).join("");""",
  u"""  sel.innerHTML=typeGroups().map(function(g){
    const col=TYPE_GROUP_COLOUR[g.label]||"var(--cat-other)";
    const opts=g.types.filter(function(t){ return IDX_BY_TYPE[t]&&IDX_BY_TYPE[t].length; })
      .map(function(t){ return '<option value="'+escHtml(t)+'" style="color:'+col+'">'+escHtml(poolLabel(t))+' ('+fmt(IDX_BY_TYPE[t].length)+')</option>'; }).join("");"""),

 (u"...and the new group has a colour",
  u"""  "Glia":"var(--cat-glia)","Vascular":"var(--cat-vasc)","No confident call":"var(--cat-other)"};""",
  u"""  "Glia":"var(--cat-glia)","Vascular":"var(--cat-vasc)","No confident call":"var(--cat-other)",
  "Not in H01 \\u2014 named here":"var(--cat-other)"};"""),
])
print("\nNow: python3 src/build_stamps.py")
