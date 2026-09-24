# -*- coding: utf-8 -*-
u"""A whole cell is something you can pick in Filter and show.                            2026-09-23

Søren, with a screenshot of the filter card: "There are no options to select whole cell structure in
the Filter and show."

There were not. core/tracedoutlines.js excluded them in TWO places, both by the same test:

    if(!k||k==="cell"||k==="nucleus")return;          // filling the picker
    return !!k&&k!=="cell"&&k!=="nucleus";            // isOrganelle(), building the layers

which was right when the only thing anybody had traced was organelles, and stopped being right the
day he outlined three arachnoid barrier cells. The count on the option said 27 while the dataset
held 30 structures, and the three missing ones were the cells.

A CELL GETS ITS OWN ENTRY rather than joining "All outlined organelles". Two reasons. The count
beside that option is what somebody reads to decide whether the filter is worth opening, and a whole
cell is not an organelle, so folding them in would make that number mean something else without
saying so. And a whole cell is two orders of magnitude bigger than a lysosome -- Søren's arachnoid
barrier cells are 176, 114 and 103 contours against a lysosome's dozen -- so "all organelles" and
"all cells" are different decisions about how much you are asking the viewer to carry, and they
should be different clicks.

Nuclei get one too, on the same reasoning and for free.

THE LABEL SAYS WHOLE CELL. `tracedOutlinesKindName("cell")` answers "cell", and a layer called
"traced cell (3)" beside "traced lysosome (12)" reads as though a cell were another organelle. The
two kinds that are not organelles are named here rather than looked up.

WHAT IS NOT DONE HERE: the size. Three whole cells is tens of thousands of vertices and the link has
a hard limit -- see src/open_all_opens_where_it_fits.py, which is the other half of the same
sentence Søren wrote.

Check: organoutlinecheck.js, extended first; five of its assertions failed before this went in.
Run: python3 src/a_whole_cell_is_something_you_can_pick.py, then python3 src/build_stamps.py, then
python3 wjump-build/build_wjump.py and python3 xjump-build/build_xjump.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s: %d" % (name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("core/tracedoutlines.js", [
 (u"the two kinds that are not organelles have names of their own",
  u'''function tracedOutlinesKindName(k){''',
  u'''/* ── THE TWO KINDS THAT ARE NOT ORGANELLES ────────────────────────────────────  2026-09-23
   Søren: "There are no options to select whole cell structure in the Filter and show."
   Named here rather than looked up: tracedOutlinesKindName("cell") answers "cell", and a layer
   called "traced cell (3)" beside "traced lysosome (12)" reads as though a cell were another
   organelle. See src/a_whole_cell_is_something_you_can_pick.py. */
var TRACED_NOT_ORGANELLE = { cell: { pick: "__cells", plural: "Whole cells", layer: "whole cell" },
                             nucleus: { pick: "__nuclei", plural: "Nuclei", layer: "nucleus" } };
function tracedOutlinesKindName(k){'''),

 (u"the picker counts cells and nuclei on their own",
  u'''    const n={};
    ((d&&d.tracings)||[]).forEach(function(t){
      const k=String((t&&(t.instanceOf||t.kind))||"").toLowerCase();
      if(!k||k==="cell"||k==="nucleus")return;
      n[k]=(n[k]||0)+1;
    });
    const kinds=Object.keys(n).sort();
    if(!kinds.length){
      sel.options[1].textContent="All outlined organelles — none traced yet";
      return;
    }
    sel.options[1].textContent="All outlined organelles ("+kinds.reduce(function(a,k){return a+n[k];},0)+")";''',
  u'''    const n={}, other={};
    ((d&&d.tracings)||[]).forEach(function(t){
      const k=String((t&&(t.instanceOf||t.kind))||"").toLowerCase();
      if(!k)return;
      /* A cell and a nucleus are counted apart from the organelles, and offered apart: the number
         beside "All outlined organelles" is what somebody reads to decide whether the view is
         worth opening, and a whole cell is a hundred times the contours of a lysosome. */
      if(TRACED_NOT_ORGANELLE[k]){ other[k]=(other[k]||0)+1; return; }
      n[k]=(n[k]||0)+1;
    });
    const kinds=Object.keys(n).sort();
    if(!kinds.length&&!Object.keys(other).length){
      sel.options[1].textContent="All outlined organelles — none traced yet";
      return;
    }
    sel.options[1].textContent=kinds.length
      ?"All outlined organelles ("+kinds.reduce(function(a,k){return a+n[k];},0)+")"
      :"All outlined organelles — none traced yet";
    /* Straight after "all organelles", so it is found rather than scrolled to. */
    Object.keys(TRACED_NOT_ORGANELLE).forEach(function(k){
      if(!other[k])return;
      const m=TRACED_NOT_ORGANELLE[k];
      const o=document.createElement("option");
      o.value=m.pick;
      o.textContent=m.plural+" ("+other[k]+" outlined)";
      sel.insertBefore(o, sel.options[2]||null);
    });'''),

 (u"...and the builder draws what was picked",
  u'''  const isOrganelle=function(t){
    const k=String((t&&(t.instanceOf||t.kind))||"").toLowerCase();
    return !!k&&k!=="cell"&&k!=="nucleus";
  };
  let mine=index.filter(function(t){
    if(!t||!t.structureId||!isOrganelle(t))return false;
    if(want!=="__all"&&String(t.instanceOf||t.kind||"").toLowerCase()!==String(want).toLowerCase())
      return false;
    return nucSet.has(String(t.nucleusId||""))||rootSet.has(String(t.rootId||""));
  });''',
  u'''  const kindOf=function(t){ return String((t&&(t.instanceOf||t.kind))||"").toLowerCase(); };
  /* WHAT THIS SELECTION MEANS (2026-09-23). "__all" is every ORGANELLE, as it always was; the two
     kinds that are not organelles answer to pickers of their own. */
  const wantedKind=(function(){
    for(var k in TRACED_NOT_ORGANELLE)
      if(TRACED_NOT_ORGANELLE[k].pick===want)return k;
    return "";
  })();
  const takes=function(t){
    const k=kindOf(t);
    if(!k)return false;
    if(wantedKind)return k===wantedKind;
    if(want==="__all")return !TRACED_NOT_ORGANELLE[k];
    return k===String(want).toLowerCase();
  };
  let mine=index.filter(function(t){
    if(!t||!t.structureId||!takes(t))return false;
    return nucSet.has(String(t.nucleusId||""))||rootSet.has(String(t.rootId||""));
  });'''),

 (u"...and the layer says whole cell",
  u'''    const label=(typeof ORGANELLE_KIND_BY_VALUE!=="undefined"&&ORGANELLE_KIND_BY_VALUE[k])
               ?(ORGANELLE_KIND_BY_VALUE[k].short||ORGANELLE_KIND_BY_VALUE[k].label||k):tracedOutlinesKindName(k);
    layers.push({type:"annotation",source:"local://annotations",tab:"annotations",''',
  u'''    const label=TRACED_NOT_ORGANELLE[k]?TRACED_NOT_ORGANELLE[k].layer
               :((typeof ORGANELLE_KIND_BY_VALUE!=="undefined"&&ORGANELLE_KIND_BY_VALUE[k])
                 ?(ORGANELLE_KIND_BY_VALUE[k].short||ORGANELLE_KIND_BY_VALUE[k].label||k)
                 :tracedOutlinesKindName(k));
    layers.push({type:"annotation",source:"local://annotations",tab:"annotations",'''),
])
