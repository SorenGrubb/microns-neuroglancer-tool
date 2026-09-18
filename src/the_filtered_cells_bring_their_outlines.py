# -*- coding: utf-8 -*-
"""The filtered cells bring their organelle outlines with them.                2026-09-18

Søren: *"In the filter and show, it should also be possible to select include organelles
segmentations of a specific kind or all organelle segmentations for the filtered cells."* — and,
asked where that switch should act, he chose the Neuroglancer "open all matches".

Filter and show has painted organelle POINTS into that view for a while: one toggleable layer per
kind, from the community reports. What it has never had is the other half — the OUTLINES, which are
the same organelles with a shape and a volume. A view of forty astrocytes with every logged
mitochondrion as a dot, and nothing to say which of them anybody has actually drawn, is a picture of
half the work.

ONE LAYER PER KIND, not per structure. A filter can match hundreds of cells; a layer each would be a
layer list nobody can use and a URL nobody can open. Per kind matches what the points already do
there, so the two halves of one organelle arrive as two layers you can turn on together.

Lines, as everywhere else this tool writes contours into a viewer: no viewer a link can reach has a
polygon tool (measured 2026-09-17), and an annotation type a viewer does not know is one it does not
draw. See tracingViewerOpen(), which does this for one cell.

WHAT IT COSTS, SAID BEFORE IT IS SPENT. The index (?tracings=1) is one sheet scan and carries no
contours, so the geometry is one Drive read PER OUTLINE. That is fine for the handful on one cell and
is not fine for a filter that matched three hundred, so there is a cap, the button says what it is
reading while it reads, and the view says how many outlines it has when it opens.

Run: python3 src/the_filtered_cells_bring_their_outlines.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MARKUP = [
    ('''<div id="filterOrganellesBox" style="max-height:260px;overflow-y:auto;border:1px solid var(--line);border-radius:7px;padding:8px 10px;margin-top:8px"></div>
</div>''',
     '''<div id="filterOrganellesBox" style="max-height:260px;overflow-y:auto;border:1px solid var(--line);border-radius:7px;padding:8px 10px;margin-top:8px"></div>
<!-- THE OTHER HALF OF AN ORGANELLE.  2026-09-18. Søren: "In the filter and show, it should also be
     possible to select include organelles segmentations of a specific kind or all organelle
     segmentations for the filtered cells." The boxes above draw where organelles were LOGGED; this
     draws what has been OUTLINED, which is the same organelles with a shape and a volume. -->
<div class="row" style="gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap">
<label style="font-size:12px;flex:0 0 auto;text-transform:none;letter-spacing:normal" for="filterOrganSeg" title="Hand-traced organelle outlines for the matched cells, drawn into the 3D view as contours &mdash; one layer per kind, in the colour each was drawn in. The outlines live in Drive and are read one file each, so this costs a moment per outline and is capped; the points above cost nothing extra.">Traced organelle outlines</label>
<select id="filterOrganSeg" style="flex:1 1 200px;min-width:0">
<option value="">None &mdash; points only</option>
<option value="__all">All outlined organelles</option>
</select>
</div>
</div>''',
     "the picker, under the organelle points"),
]

FILL_KINDS = r'''  /* ── THE PICKER LISTS WHAT EXISTS ─────────────────────────────────────────────  2026-09-18
     "a specific kind" has to be a list of kinds, and a list invented from the ontology would offer
     sixty-one options of which two have ever been drawn. So it is filled from the index the moment
     somebody reaches for it -- once, lazily, because a filter card that fetches on load costs every
     visitor a request for a control most of them never touch.

     THE NUMBER IS OUTLINES IN THE DATASET, and the label says so. The counts beside the organelle
     POINT checkboxes above are cells-carrying-the-structure over cells examined (see
     core/organellefilter.js, and the day that number was misread), and quietly putting a different
     unit in the same panel would be the same mistake from the other side. */
  var FILTER_ORGAN_SEG_FILLED=false;
  async function fillOrganSegKinds(){
    if(FILTER_ORGAN_SEG_FILLED)return;
    const sel=document.getElementById("filterOrganSeg");
    if(!sel||!REPORT_ENDPOINT)return;
    FILTER_ORGAN_SEG_FILLED=true;
    try{
      const r=await fetch(REPORT_ENDPOINT+"?tracings=1");
      const d=await r.json();
      const n={};
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
      sel.options[1].textContent="All outlined organelles ("+kinds.reduce(function(a,k){return a+n[k];},0)+")";
      kinds.forEach(function(k){
        const label=(typeof ORGANELLE_KIND_BY_VALUE!=="undefined"&&ORGANELLE_KIND_BY_VALUE[k])
                   ?(ORGANELLE_KIND_BY_VALUE[k].short||ORGANELLE_KIND_BY_VALUE[k].label||k):k;
        const o=document.createElement("option");
        o.value=k;
        o.textContent=label.charAt(0).toUpperCase()+label.slice(1)+" ("+n[k]+" outlined)";
        sel.appendChild(o);
      });
    }catch(e){
      FILTER_ORGAN_SEG_FILLED=false;      // a hiccup is not an answer; let the next reach try again
      console.warn("[uJump filter] could not list traced organelle kinds",e);
    }
  }
  (function(){
    const sel=document.getElementById("filterOrganSeg");
    if(!sel)return;
    ["focus","mousedown"].forEach(function(ev){ sel.addEventListener(ev,fillOrganSegKinds); });
  })();
'''

PAGE = [
    # ── the layer builder, beside the vasculature one it is modelled on ──────────────────────────
    ('''  const VASC_URL_WARN_LENGTH=Math.round(1.95*1024*1024);''',
     '''  /* ── THE FILTERED CELLS BRING THEIR OUTLINES ──────────────────────────────────  2026-09-18
     Søren: "it should also be possible to select include organelles segmentations of a specific
     kind or all organelle segmentations for the filtered cells."

     Modelled on buildVascTraceLayers, which this handler already awaits and pushes onto the state:
     a list of ready-made annotation layers, or [] when nothing is asked for or nothing can be read.
     Nothing about which cells matched, or about the Excel export, is touched by it.

     ONE LAYER PER KIND. A filter can match hundreds of cells; a layer per outline would be a layer
     list nobody can use and a URL nobody can open. Per kind is what the organelle POINTS already do
     in this view, so the two halves of one organelle arrive as two layers you turn on together. */
  const FILTER_TRACE_CAP=150;
  async function buildTracedOrganelleLayers(matches,want,say){
    if(!want||!REPORT_ENDPOINT)return [];
    /* The cells that matched, by both ids -- a tracing is filed against whichever the tracer had. */
    const nucSet=new Set(),rootSet=new Set();
    (matches||[]).forEach(function(m){
      const nid=rowNucId(m.row);if(nid)nucSet.add(String(nid));
      const rid=rowRootId(m.row);if(rid)rootSet.add(String(rid));
    });
    if(!nucSet.size&&!rootSet.size)return [];
    let index=[];
    try{
      say&&say("Looking up traced outlines\\u2026");
      const r=await fetch(REPORT_ENDPOINT+"?tracings=1");
      const d=await r.json();
      index=(d&&d.tracings)||[];
    }catch(e){console.warn("[uJump filter] tracings index unavailable",e);return [];}
    const isOrganelle=function(t){
      const k=String((t&&(t.instanceOf||t.kind))||"").toLowerCase();
      return !!k&&k!=="cell"&&k!=="nucleus";
    };
    let mine=index.filter(function(t){
      if(!t||!t.structureId||!isOrganelle(t))return false;
      if(want!=="__all"&&String(t.instanceOf||t.kind||"").toLowerCase()!==String(want).toLowerCase())
        return false;
      return nucSet.has(String(t.nucleusId||""))||rootSet.has(String(t.rootId||""));
    });
    if(!mine.length)return [];
    /* THE CAP IS SAID, NOT SILENT. One Drive read per outline is right for a cell and wrong for a
       filter that matched three hundred, and a view that quietly drew the first hundred and fifty
       would be a lie about what the dataset holds. */
    let capped=0;
    if(mine.length>FILTER_TRACE_CAP){capped=mine.length-FILTER_TRACE_CAP;mine=mine.slice(0,FILTER_TRACE_CAP);}
    const got=[];
    for(let i=0;i<mine.length;i++){
      say&&say("Reading outline "+(i+1)+"/"+mine.length+"\\u2026");
      try{
        const r=await fetch(REPORT_ENDPOINT+"?tracings=1&structureId="+encodeURIComponent(mine[i].structureId));
        const d=await r.json();
        const one=((d&&d.tracings)||[])[0];
        const st=(one&&!one.error)?(UJ.tracing.rowsToStructures(one.rows||[])[0]||null):null;
        if(st&&st.rings&&st.rings.length)got.push({t:mine[i],rings:st.rings});
      }catch(_e){/* one unreadable outline is not the view's problem */}
    }
    if(!got.length)return [];
    /* Grouped by kind, each kind's outlines in one layer, in the colour that kind was drawn in. */
    const byKind={};
    got.forEach(function(g){
      const k=String(g.t.instanceOf||g.t.kind||"organelle").toLowerCase();
      (byKind[k]=byKind[k]||[]).push(g);
    });
    const layers=[];
    Object.keys(byKind).sort().forEach(function(k){
      const anns=[];
      byKind[k].forEach(function(g,gi){
        /* The same closed loops of lines tracingViewerOpen writes for one cell -- see its header
           for why lines and not polygons. */
        (g.rings||[]).forEach(function(r,ri){
          const pts=r.points||[];
          if(pts.length<3)return;
          const z=Math.round(r.z);
          for(let i=0;i<pts.length;i++){
            const a=pts[i],b=pts[(i+1)%pts.length];
            anns.push({type:"line",id:"to"+gi+"_"+ri+"_"+i,
                       pointA:[Math.round(a[0]),Math.round(a[1]),z],
                       pointB:[Math.round(b[0]),Math.round(b[1]),z]});
          }
        });
      });
      if(!anns.length)return;
      const label=(typeof ORGANELLE_KIND_BY_VALUE!=="undefined"&&ORGANELLE_KIND_BY_VALUE[k])
                 ?(ORGANELLE_KIND_BY_VALUE[k].short||ORGANELLE_KIND_BY_VALUE[k].label||k):k;
      layers.push({type:"annotation",source:"local://annotations",tab:"annotations",
                   name:"traced "+label+" ("+byKind[k].length+")",
                   annotationColor:byKind[k][0].t.color||"#40e28c",
                   annotations:anns});
    });
    if(capped&&typeof showSubmitToast==="function")
      showSubmitToast(false,"Drew "+got.length+" traced outline"+(got.length===1?"":"s")
        +" and left "+capped+" out \\u2014 the view reads one file per outline, so it stops at "
        +FILTER_TRACE_CAP+". Narrow the filter, or pick one kind rather than all.");
    return layers;
  }
  const VASC_URL_WARN_LENGTH=Math.round(1.95*1024*1024);''',
     "the outlines become layers, one per kind"),

    # ── the handler asks for them ────────────────────────────────────────────────────────────────
    ('''    viewAllBtn.textContent="Fetching proposed segmentation IDs…";
    window.ALL_ROOTID_PROPOSALS=await fetchAllRootIdProposals();''',
     '''    /* The outlines, if any kind was asked for. Same shape as the vasculature tracings above: a
       list of ready-made layers, pushed onto the state after it is built, so nothing about which
       cells matched or what the Excel holds can be touched by it. */
    const organSegSel=document.getElementById("filterOrganSeg");
    const organSegLayers=await buildTracedOrganelleLayers(lastResult.matches,
      organSegSel&&organSegSel.value,function(msg){viewAllBtn.textContent=msg;});
    viewAllBtn.textContent="Fetching proposed segmentation IDs…";
    window.ALL_ROOTID_PROPOSALS=await fetchAllRootIdProposals();''',
     "the handler fetches them"),

    ('''    if(vascTraceLayers.length)state.layers.push(...vascTraceLayers);''',
     '''    if(vascTraceLayers.length)state.layers.push(...vascTraceLayers);
    if(organSegLayers.length)state.layers.push(...organSegLayers);''',
     "...and they go into the view"),

    # ── the kinds in the picker are the kinds that have outlines ─────────────────────────────────
    ("  const FILTER_TRACE_CAP=150;",
     FILL_KINDS + "  const FILTER_TRACE_CAP=150;",
     "the picker lists the kinds that have been outlined"),
]


def edit(rel, pairs):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    print(rel)
    for old, new, why in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + why)
            continue
        assert not (new in s and old in s), "AMBIGUOUS: " + why
        assert old in s, "NOT FOUND: " + why
        assert s.count(old) == 1, "ambiguous (%d): %s" % (s.count(old), why)
        s = s.replace(old, new, 1)
        print("  ok: " + why)
    io.open(p, "w", encoding="utf-8").write(s)


edit("ujump.html", MARKUP + PAGE)
print("\nnow: node filterorgansegcheck.js")
