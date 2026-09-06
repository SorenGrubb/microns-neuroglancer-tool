/* core/charts.js -- ONE CHART LOOK FOR EVERY TOOL.                                   2026-09-06

   Søren: "I want the graphs to be consistent in the look between the datasets. Also, where
   relevant it should be dot plots to show the spread in points, like in uJump."

   µJump, δJump and πJump already draw the same way -- their palette, layout helpers and three
   chart functions are byte-identical copies across the three files. ηJump grew its own: one orange
   for every series, its own layout(), and box plots with boxpoints:false, so the chart family that
   most needed to show spread was the one hiding it.

   GENERATED, NOT WRITTEN: everything below the hooks is lifted verbatim out of ujump.html by
   src/core_charts.py, because two hand-maintained copies of "the shared look" is the exact failure
   this file exists to end. chartlookcheck.js then drives this file and µJump's own copy side by
   side against the same data and asserts they produce the same traces.

   ── WHAT A PAGE MUST SUPPLY ─────────────────────────────────────────────────────────────────

   liveThemeColors()   required, already on every page. Plotly cannot read CSS custom properties,
                       so ink/line/panel are read from :root at every draw rather than frozen at
                       load -- which is what keeps a chart correct across a theme toggle.

   Optionally, on UJ.charts, BEFORE this file loads (the defaults are µJump's own behaviour, so a
   page that sets none of them gets exactly what µJump draws today):

   UJ.charts.shortLabel(t)   how to shorten a type name for an axis tick. Default: the code in
                             trailing brackets -- "L2/3 pyramidal neuron (23P)" -> "23P".
   UJ.charts.categoryOf(t)   the broad family a type belongs to. Used for chart ORDER only.
   UJ.charts.categoryOrder   those families, in the sequence charts should run in.
   UJ.charts.typeRank(t)     an explicit within-category rank, where one matters.

   Top-level const/function, shared across classic <script> tags exactly like core/ontology.js.
   Do NOT also declare these names in a page that loads this file -- a second `const PALETTE` is a
   SyntaxError that silently kills the whole block.

   LAYER_COLORS is deliberately NOT here. µJump keys it "Layer 1", ηJump keys it "L1": two dataset
   vocabularies, not one look drifting apart, and ηJump already declares its own.

   ── ON COLOURING BY CELL TYPE ───────────────────────────────────────────────────────────────

   ηJump's dashboard card used to state that cell type is never carried by colour, because no
   ten-hue set survives colour-vision checks. That is true of hue used ALONE, and here it never is:
   the type is on the labelled axis, in the hover text and in the panel title, so hue is redundant
   with three other channels and a reader who cannot separate the hues loses only decoration.
   Søren chose this palette for the whole family on 2026-09-06. The narrower rule still holds:
   colour must stay REDUNDANT. A chart where hue is the only way to tell two series apart needs a
   second channel. */
window.UJ = window.UJ || {};
UJ.charts = UJ.charts || {};

/* ── the page hooks, defaulting to what µJump does ────────────────────────────────────────────*/
function chartCategoryOf(t){
  return (UJ.charts.categoryOf ? UJ.charts.categoryOf(t) : "Other") || "Other";
}
function chartCategoryOrder(){ return UJ.charts.categoryOrder || []; }
function chartTypeRank(t){
  const r = UJ.charts.typeRank ? UJ.charts.typeRank(t) : undefined;
  return (r === undefined || r === null) ? Infinity : r;
}
function catRank(t){
  const order = chartCategoryOrder();
  const i = order.indexOf(chartCategoryOf(t));
  return i < 0 ? order.length : i;
}
/* Stable sort: primarily by category rank, then by a caller-supplied DESCENDING secondary key
   (count, or sample size) within each category. A page that declares no categories gets the
   secondary key alone -- the sensible default rather than a special case. */
function sortByCategory(types, secondaryFn){
  return types.slice().sort(function(a, b){
    const ra = catRank(a), rb = catRank(b);
    if (ra !== rb) return ra - rb;
    if (secondaryFn) return secondaryFn(b) - secondaryFn(a);
    return String(a).localeCompare(String(b));
  });
}
/* Like sortByCategory, but honouring an explicit within-category rank where a page defines one
   (µJump orders excitatory neurons by cortical layer and puts Endothelial cell first among the
   vascular types). Unranked types fall through to the same secondary key. */
function sortByCategoryAndRank(types, secondaryFn){
  return types.slice().sort(function(a, b){
    const ra = catRank(a), rb = catRank(b);
    if (ra !== rb) return ra - rb;
    const ta = chartTypeRank(a), tb = chartTypeRank(b);
    if (ta !== tb) return ta - tb;
    if (secondaryFn) return secondaryFn(b) - secondaryFn(a);
    return String(a).localeCompare(String(b));
  });
}

/* A sequential ramp for the two charts that encode MAGNITUDE across two categories (ηJump's
   type x layer and nearest-neighbour heatmaps). Built from the palette's own muted green rather
   than a saturated default, so a heatmap sits in the same family as the bars beside it. Magnitude
   through lightness is the one place colour is legitimately load-bearing, and lightness survives
   every colour-vision check. */
function chartRamp(){
  const light = document.documentElement.getAttribute("data-theme") === "light";
  return light
    ? [[0,"#f2f5f3"],[0.25,"#cddbd4"],[0.5,"#96b5a6"],[0.75,"#5d8c77"],[1,"#2e5c48"]]
    : [[0,"#1a231f"],[0.25,"#2e4a3c"],[0.5,"#4a7460"],[0.75,"#7aa892"],[1,"#b8d6c6"]];
}


/* ══ LIFTED VERBATIM FROM ujump.html BY src/core_charts.py ══════════════════════════
   Do not edit below this line by hand: edit µJump and re-run the generator, or the two
   copies of the shared look start to differ again, which is the whole problem. */

const PALETTE=["#8a3b2a","#5a4a7a","#3a6b5a","#a37a3a","#4a6b8a","#7a3a5a","#6b7a3a","#3a5a6b",
               "#8a5a3a","#5a3a6b","#3a7a6b","#7a5a3a","#4a3a6b","#6b3a4a","#3a4a6b","#7a6b3a",
               "#4a7a3a","#8a4a5a","#3a6b8a","#6b4a3a","#5a6b3a","#3a4a5a","#8a6b4a","#4a5a3a",
               "#6b3a6b","#3a8a6b","#8a3a3a","#3a3a6b","#6b8a3a","#8a6b3a"];

const colorFor=(function(){
  const map={}; let next=0;
  return function(name){
    if(!(name in map)){map[name]=PALETTE[next%PALETTE.length];next++;}
    return map[name];
  };
})();

function axisFont(){
  const c=liveThemeColors();
  return{family:"-apple-system,Segoe UI,Helvetica,Arial,sans-serif",size:11,color:c.ink};
}

function baseLayout(){
  const c=liveThemeColors();
  return{
    margin:{l:56,r:16,t:8,b:110},
    font:axisFont(),
    paper_bgcolor:"rgba(0,0,0,0)",
    plot_bgcolor:"rgba(0,0,0,0)",
    showlegend:false,
    xaxis:{tickangle:-45,automargin:true,gridcolor:c.line},
    yaxis:{gridcolor:c.line,zeroline:false},
    hoverlabel:{bgcolor:c.panel,font:{color:c.ink},bordercolor:c.line}
  };
}

const PLOTLY_CFG={displaylogo:false,responsive:true,modeBarButtonsToRemove:["lasso2d","select2d"]};

const TIGHT_BOX_LAYOUT={boxgap:0.15,boxgroupgap:0.05};

function categorizedLayout(types,extra){
  const layout=baseLayout();
  return Object.assign({},layout,{
    xaxis:Object.assign({},layout.xaxis,{categoryorder:"array",categoryarray:types})
  },extra||{});
}

function shortSingleTypeLabel(t){
  /* THE ONE DEPARTURE from the lifted text, and the reason it is marked: a page may say how its
     own names shorten. ηJump's types carry no trailing "(CODE)" and its longest is
     "Excitatory/spiny-with-atypical-tree", which the default would return whole. Default behaviour
     -- µJump's -- is unchanged for any page that sets no hook. */
  if (UJ.charts.shortLabel) return UJ.charts.shortLabel(t);
  const m=/\(([^()]+)\)\s*$/.exec(String(t||""));
  return m?m[1]:t;
}

function shortAxisLabel(t){
  const s=String(t||"");
  return s.indexOf(" × ")>=0?s.split(" × ").map(shortSingleTypeLabel).join(" × "):shortSingleTypeLabel(s);
}

function sortedEntries(obj){
  return Object.entries(obj).sort((a,b)=>b[1]-a[1]);
}

const MIN_DOTS_TO_PLOT=3;

function dotsWaiting_(dataObj,countOf){
  const plotted=[],waiting=[];
  Object.keys(dataObj||{}).forEach(function(t){
    const n=countOf?countOf(t):((dataObj[t]||[]).length);
    if(!n)return;
    if(n>=MIN_DOTS_TO_PLOT)plotted.push(t); else waiting.push({t:t,n:n});
  });
  waiting.sort(function(a,b){return b.n-a.n;});
  return {plotted:plotted,waiting:waiting};
}

function waitingList_(waiting){
  return waiting.map(function(w){return w.t+" ("+w.n+")";}).join(", ");
}

function sayWhyNothingPlots_(divId,waiting,noun){
  const el=document.getElementById(divId);
  if(!el)return;
  try{if(window.Plotly&&Plotly.purge)Plotly.purge(divId);}catch(e){}
  const box=document.createElement("div");
  box.className="placeholder";
  const total=waiting.reduce(function(a,w){return a+w.n;},0);
  box.textContent=total
    ?("Not enough yet to draw a distribution — a cell type needs at least "+MIN_DOTS_TO_PLOT+" "
      +(noun||"measurements")+" before it gets a box. "+total+" so far, none of one type reaching "
      +MIN_DOTS_TO_PLOT+": "+waitingList_(waiting)+".")
    : ("No "+(noun||"measurements")+" recorded yet.");
  el.innerHTML="";
  el.appendChild(box);
}

function noteDotsWaiting_(divId,waiting,noun){
  const el=document.getElementById(divId);
  if(!el||!el.parentNode)return;
  const id=divId+"__waiting";
  const old=document.getElementById(id);
  if(old&&old.parentNode)old.parentNode.removeChild(old);
  if(!waiting.length)return;
  const total=waiting.reduce(function(a,w){return a+w.n;},0);
  const note=document.createElement("p");
  note.className="footnote";
  note.id=id;
  note.title="A box needs at least "+MIN_DOTS_TO_PLOT+" values of the same cell type to describe a "
            +"distribution. These types have fewer, so their data is stored but not drawn yet.";
  note.textContent=waiting.length+" cell type"+(waiting.length===1?"":"s")+" with fewer than "
                  +MIN_DOTS_TO_PLOT+" "+(noun||"measurements")+" not drawn yet ("+total+" value"
                  +(total===1?"":"s")+"): "+waitingList_(waiting)+".";
  el.parentNode.insertBefore(note,el.nextSibling);
}

function dotMedianChart(divId,dataObj,yTitle,tight,useRank,noun){
  /* The >=3 filter used to live inline here and say nothing. Same rule, now reported -- see
     MIN_DOTS_TO_PLOT above. Charts calling this and then adding a footnote of their own
     (renderVolumeShare) still work: noteDotsWaiting_ inserts its own, keyed by id. */
  const w=dotsWaiting_(dataObj);
  if(!w.plotted.length){sayWhyNothingPlots_(divId,w.waiting,noun);return;}
  let types=w.plotted;
  types=(useRank?sortByCategoryAndRank:sortByCategory)(types,t=>dataObj[t].length);
  const traces=types.map(function(t){
    return {
      /* name stays the FULL string (t) -- hoverinfo:"y+name" already shows it on hover, unrelated
         to the axis tick, which is why only x0 needs shortening here (see shortAxisLabel()). */
      type:"box", name:t, y:dataObj[t], x0:shortAxisLabel(t),
      boxpoints:"all", jitter:0.55, pointpos:0,
      marker:{color:"#8a8a8a",size:3,opacity:0.45},
      line:{color:colorFor(t),width:3},
      fillcolor:"rgba(0,0,0,0)",
      whiskerwidth:0, quartilemethod:"linear",
      hoverinfo:"y+name"
    };
  });
  Plotly.newPlot(divId,traces,categorizedLayout(types.map(shortAxisLabel),Object.assign({
    yaxis:Object.assign({},baseLayout().yaxis,{title:yTitle}),
    showlegend:false
  },tight?TIGHT_BOX_LAYOUT:{})),PLOTLY_CFG);
  noteDotsWaiting_(divId,w.waiting,noun);
}

function groupedDotChart(divId,seriesList,yTitle,tight,useRank,noun){
  /* A type counts by its FULLEST series -- the same "does any series have 3?" test the set-builder
     did, written once so the same number can be reported when the answer is no. Input and Output
     are two views of ONE queried cell, so summing them would claim twice the sample there is. */
  const union={};
  seriesList.forEach(function(s){
    Object.keys(s.dataObj||{}).forEach(function(t){
      const n=(s.dataObj[t]||[]).length;
      if(n>(union[t]||0))union[t]=n;
    });
  });
  const w=dotsWaiting_(union,function(t){return union[t];});
  if(!w.plotted.length){sayWhyNothingPlots_(divId,w.waiting,noun);return;}
  const types=(useRank?sortByCategoryAndRank:sortByCategory)(w.plotted,function(t){
    return union[t];
  });
  const traces=[];
  seriesList.forEach(function(s){
    let legendShown=false;
    types.forEach(function(t){
      const arr=s.dataObj[t];
      if(!arr||arr.length<3)return;
      traces.push({
        /* Unlike dotMedianChart, `name` here is the SERIES name (e.g. "Input (received)"), not the
           cell type -- hoverinfo:"y+name" alone would no longer reveal which type a box belongs to
           once x0 is shortened (see shortAxisLabel()), so this uses an explicit hovertemplate that
           embeds the type's FULL name (t, captured from the closure) instead. */
        type:"box", name:s.name, x0:shortAxisLabel(t), y:arr,
        boxpoints:"all", jitter:0.55, pointpos:0,
        marker:{color:"#8a8a8a",size:3,opacity:0.4},
        line:{color:s.color,width:2.5},
        fillcolor:"rgba(0,0,0,0)",
        whiskerwidth:0, quartilemethod:"linear",
        showlegend:!legendShown,
        hovertemplate:t+"<br>%{y}<br>"+s.name+"<extra></extra>"
      });
      legendShown=true;
    });
  });
  Plotly.newPlot(divId,traces,categorizedLayout(types.map(shortAxisLabel),Object.assign({
    yaxis:Object.assign({},baseLayout().yaxis,{title:yTitle}),
    boxmode:"group",
    showlegend:true,legend:{orientation:"h",y:1.15,font:{size:10}}
  },tight?TIGHT_BOX_LAYOUT:{})),PLOTLY_CFG);
  noteDotsWaiting_(divId,w.waiting,noun);
}

function barChart(divId,dataObj,yTitle,byCategory,emptyNote){
  /* "% of cells with a cilium, by cell type has no data" -- an empty object drew an empty axis
     with no explanation, which reads as a broken chart rather than an unstarted one. */
  if(!Object.keys(dataObj||{}).length){
    const el=document.getElementById(divId);
    if(el){
      try{if(window.Plotly&&Plotly.purge)Plotly.purge(divId);}catch(e){}
      const box=document.createElement("div");
      box.className="placeholder";
      box.textContent=emptyNote||"Nothing recorded yet.";
      el.innerHTML="";el.appendChild(box);
    }
    return;
  }
  let types=Object.keys(dataObj);
  types=byCategory?sortByCategory(types,t=>dataObj[t]):types.sort((a,b)=>dataObj[b]-dataObj[a]);
  const y=types.map(t=>dataObj[t]);
  const shortTypes=types.map(shortAxisLabel);
  const bl=baseLayout();
  const layout=byCategory
    ?categorizedLayout(shortTypes,{yaxis:Object.assign({},bl.yaxis,{title:yTitle})})
    :Object.assign({},bl,{yaxis:Object.assign({},bl.yaxis,{title:yTitle})});
  Plotly.newPlot(divId,[{
    type:"bar",x:shortTypes,y,text:types,
    hovertemplate:"%{text}<br>"+yTitle+": %{y}<extra></extra>",
    marker:{color:types.map(colorFor)}
  }],layout,PLOTLY_CFG);
}
