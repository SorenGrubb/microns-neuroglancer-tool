/* ── core/tree.js ─ the guided-identification engine ────────────────────────────────
   Extracted from ujump.html on 2026-08-18 (stage P3, after core/panel.js) so µJump, ηJump and
   βJump walk the SAME decision tree with the same controls, instead of each having its own
   renderer. The tree data itself already lived in core/ontology.js; this is the machinery that
   walks it.

   Moved: ID_PATH / ID_NODE / ID_CTX, leavesUnder, startNodeFor, openIdentify, closeIdentify,
   renderIdentify, chooseOption, goBack, jumpToLeaf, openIdentifyToLeaf, openLocationOnlyReport,
   searchLeaves, leafSearchHtml, wireLeafSearch, getCertainty, checkOverrideContext,
   renderOverrideWarning. Nothing renamed — every function is still a plain global, so no call
   site in ujump.html changed.

   DELIBERATELY NOT MOVED, because each is genuinely per-tool:
     - renderResult()  — the submit screen. µJump's asks "do you agree with MICrONS?" and files a
       confirmation or a discrepancy; βJump has no prediction to agree with and files a plain
       new_identification. Reached here through treeResult() (see below).
     - the reference-image gallery (galleryHtml / categoryGalleryHtml) — µJump's curated
       IMAGE_LIBRARY screenshots plus the Neuroglancer state builders that open them.
     - the merged-nucleus and not-a-nucleus report forms.
     - renderLocationDiagram / estimateLayer — cortical-layer geometry, meaningless in CA1.
   All five are reached through `typeof …` guards, so a host with none of them still navigates
   the tree correctly — it just shows no gallery, no diagram and no flags.

   CONFIG — UJ.cfg.tree, all optional:
     panelId    id of the element to render into            (default "idfpanel")
     startNode  the tree node the first question comes from  (default "q2")
     modal      true  → the panel is an overlay: toggle .show and scrollIntoView on open
                false → the panel is inline: never touched, never scrolled  (default true)

   HOST CONTRACT: escHtml, TREE + LEAF_NAMES (core/ontology.js), and a global renderResult(slug).
   A host with no renderResult gets a legible message in the panel rather than a thrown error. */
window.UJ = window.UJ || {};
UJ.tree = UJ.tree || {};
UJ.tree.BUILD = "2026-08-18 stage-P3";

function treeCfg(){
  try{ return (UJ&&UJ.cfg&&UJ.cfg.tree)||{}; }catch(_e){ return {}; }
}
function treePanel(){ return document.getElementById(treeCfg().panelId||"idfpanel"); }
/* Two halves of "open the panel", split so the inline case can opt out of both. µJump's
   #idfpanel is display:none until .show is added; βJump's #idbox is always in the flow, and
   scrolling it into view on every step would yank the page around mid-classification. */
function showTreePanel(){
  const p=treePanel(); if(p&&treeCfg().modal!==false)p.classList.add("show");
}
function revealTreePanel(){
  const p=treePanel();
  if(p&&treeCfg().modal!==false&&p.scrollIntoView)p.scrollIntoView({behavior:"smooth",block:"nearest"});
}
/* The per-tool submit screen. Guarded rather than called directly so that a host which has not
   written one yet fails visibly in the panel instead of throwing a ReferenceError inside a click
   handler, where it would look like the button simply did nothing. */
function treeResult(slug){
  if(typeof renderResult==="function")return renderResult(slug);
  const p=treePanel();
  if(p)p.innerHTML='<p class="hint">No result screen is wired up on this page '
    +'(core/tree.js needs a global renderResult(slug)).</p>';
}
/* Every step taken, as the QUESTIONS that were answered rather than the answers chosen — the
   same string µJump has always submitted in a report's `path` column, exposed here so βJump
   submits the identical shape and the two datasets' rows stay directly comparable. */
UJ.tree.pathText=function(){
  return ((typeof ID_PATH!=="undefined"&&ID_PATH)||[])
    .map(function(n){return (typeof TREE!=="undefined"&&TREE[n])?TREE[n].q:n;}).join(" > ");
};

/* ==== guided-ID state + leavesUnder  (was ujump.html lines 6107-6112) ==== */
let ID_PATH=[],ID_NODE=null,ID_CTX={};
function leavesUnder(nodeId,seen){
  seen=seen||new Set();const node=TREE[nodeId];const out=[];
  for(const o of node.opts){if(o.leaf)out.push(o.leaf);else if(o.next&&!seen.has(o.next)){seen.add(o.next);out.push(...leavesUnder(o.next,seen));}}
  return out;
}

/* ==== tree navigation, leaf search, certainty, override warning  (was ujump.html lines 6240-6445) ==== */
function startNodeFor(ctx){
  if(ctx&&ctx.layer&&ctx.layer.region==="leptomeninges")return "lepto";
  return treeCfg().startNode||"q2";
}
function openIdentify(ctx){
  ID_CTX=ctx||{};
  if(ID_CTX.pos&&!ID_CTX.layer&&typeof estimateLayer==="function")ID_CTX.layer=estimateLayer(ID_CTX.pos[0],ID_CTX.pos[1],ID_CTX.pos[2]);
  ID_PATH=[];ID_NODE=startNodeFor(ID_CTX);
  showTreePanel();
  renderIdentify();
  revealTreePanel();
}
function closeIdentify(){var p=treePanel();if(p&&treeCfg().modal!==false)p.classList.remove("show");}
function renderIdentify(){
  const panel=treePanel();
  if(!panel)return;
  const node=TREE[ID_NODE];
  const first=ID_PATH.length===0;
  /* Who made the machine prediction this screen is asking you to second-guess. µJump's is
     MICrONS; βJump has NO classifier at all, so it sets suggestionSource:null and the crumb
     disappears entirely -- rendering "no MICrONS suggestion on file" on a hippocampal
     Alzheimer's volume is not a neutral default, it is a false statement about the dataset. */
  const sugSrc=(treeCfg().suggestionSource===undefined)?"MICrONS":treeCfg().suggestionSource;
  const crumb=ID_CTX.suggested
    ? '<div class="idf-crumbs">'+(sugSrc?escHtml(sugSrc)+" suggestion: ":"suggestion: ")+'<b>'+ID_CTX.suggested+'</b></div>'
    : (sugSrc?'<div class="idf-crumbs">no '+escHtml(sugSrc)+' suggestion on file</div>':'');
  /* The close button only exists for a modal panel. On an inline one there is nothing to close,
     and a visible button that does nothing reads as a bug. */
  const closeBtnHtml=(treeCfg().modal!==false)
    ? '<button class="idf-close" id="idfclose" title="close">&times;</button>' : '';
  let h='<div class="idf-head"><div><div class="idf-title">Guided identification</div>'
    +crumb
    +(ID_CTX.layer?'<div class="idf-crumbs">predicted location: <b>'+ID_CTX.layer.label+'</b>'+(ID_CTX.layer.depthText?' &middot; '+ID_CTX.layer.depthText:'')+'</div>':'')
    +'</div>'+closeBtnHtml+'</div>';
  if(first){
    if(ID_CTX.pos&&typeof renderLocationDiagram==="function")h+=renderLocationDiagram(ID_CTX.pos);
  }
  /* The "reporting as" identity field used to live here, on the very first guided-ID screen --
     shown unconditionally, before the person even knew whether they'd end up submitting
     anything. It went almost entirely unused because it read as an unexplained ask, with
     nothing to connect it to. Moved to renderResult(), where it's only shown when there's
     actually a discrepancy/new-ID to submit, right next to the Submit/Contribute button it
     affects -- see the "Want credit for this ID" block there. */
  h+=leafSearchHtml("idfLeaf");
  if(ID_PATH.length)h+='<span class="idf-back" id="idfback">&larr; back one step</span>';
  h+='<div class="idf-q">'+node.q+'</div><div class="idf-opts">';
  node.opts.forEach((o,idx)=>{
    const label=o.leaf?o.label+' <b>('+LEAF_NAMES[o.leaf]+')</b>':o.label;
    h+='<button class="idf-opt" data-idx="'+idx+'">'+label+'</button>';
  });
  h+='</div>';
  if(typeof mergedFlagHtml==="function")h+=mergedFlagHtml();
  /* "Not a nucleus" is only offered on the FIRST guided-ID screen (before any cell-type
     questions have been answered), unlike the merged-nucleus flag above which is available at
     every step -- flagging a false detection is a decision made up front, not partway through
     narrowing down a cell type. */
  if(first&&typeof notNucleusFlagHtml==="function")h+=notNucleusFlagHtml();
  /* The reference-image gallery is µJump's own (IMAGE_LIBRARY plus its Neuroglancer state
     builders); a dataset without curated example images simply gets no gallery. */
  if(ID_NODE===(treeCfg().startNode||"q2")){ if(typeof categoryGalleryHtml==="function")h+=categoryGalleryHtml(); }
  else if(typeof galleryHtml==="function")h+=galleryHtml([...new Set(leavesUnder(ID_NODE))]);
  panel.innerHTML=h;
  const closeBtn=document.getElementById("idfclose");
  if(closeBtn)closeBtn.addEventListener("click",closeIdentify);
  const back=document.getElementById("idfback");if(back)back.addEventListener("click",goBack);
  panel.querySelectorAll(".idf-opt").forEach(b=>b.addEventListener("click",()=>chooseOption(node.opts[+b.dataset.idx])));
  wireLeafSearch("idfLeaf",slug=>jumpToLeaf(slug));
  if(typeof wireMergedFlag==="function")wireMergedFlag(renderIdentify);
  if(typeof wireNotNucleusFlag==="function")wireNotNucleusFlag(renderIdentify);
}
function chooseOption(o){
  ID_PATH.push(ID_NODE);
  if(o.leaf){treeResult(o.leaf);return;}
  ID_NODE=o.next;renderIdentify();
}
function goBack(){ID_NODE=ID_PATH.pop();renderIdentify();}
/* Fast path for "I already know what this is": jumps straight to the result screen for a
   leaf cell type, skipping the rest of the decision tree. Pushes the current node onto
   ID_PATH first, exactly like chooseOption() does for a leaf option, so "back one step"
   from the result screen still returns to wherever the search was triggered from. */
function jumpToLeaf(slug){
  ID_PATH.push(ID_NODE);
  treeResult(slug);
}
/* Opens the guided-ID panel and jumps straight to a leaf's result screen, for the fast
   search box shown next to the "Guided identification" button (i.e. before the tree has
   even been opened). Mirrors openIdentify(), but seeds ID_PATH with the tree's normal
   starting node instead of leaving it empty, so "back one step" from the result screen
   lands on the first real question instead of erroring on an empty history. */
function openIdentifyToLeaf(ctx,slug){
  ID_CTX=ctx||{};
  if(ID_CTX.pos&&!ID_CTX.layer&&typeof estimateLayer==="function")ID_CTX.layer=estimateLayer(ID_CTX.pos[0],ID_CTX.pos[1],ID_CTX.pos[2]);
  ID_NODE=startNodeFor(ID_CTX);
  ID_PATH=[ID_NODE];
  showTreePanel();
  treeResult(slug);
  revealTreePanel();
}
/* Lets a user save an Img35/minnie35 cell's coordinate (and any root ID / nucleus root ID they
   can identify) WITHOUT picking a cell type at all -- skips the guided-ID tree entirely. For
   "there's clearly a real cell here, but I don't know (or don't want to guess) what it is yet" --
   so the location and any segmentation IDs aren't lost while it waits for someone who does know.
   Reuses renderResult()'s noNucleus form (coordinate/root/nucRoot fields, dupe-check, append
   flow) with slug=null; ID_CTX.locationOnly toggles renderResult() into a lighter mode (no
   certainty rating -- nothing is actually being asserted -- and no cell-type gallery/random-
   example sections, since there's no cell type to illustrate). Classifying it later goes through
   the exact same "report a new cell" flow as normal (see renderUserReportedCell's "Classify this
   cell" CTA) -- the dupe-check there finds this coordinate and the user chooses to append, which
   fills in identified/certainty/comment on this same row server-side instead of creating a
   duplicate (see doPost's new_cell_no_nucleus append-merge branch). ID_PATH is deliberately left
   empty (no tree steps were taken), so the result screen's "back one step" is hidden rather than
   wired to goBack(), which would otherwise pop an empty array and crash on TREE[undefined]. */
function openLocationOnlyReport(pos){
  ID_CTX={pos,noNucleus:true,locationOnly:true};
  ID_PATH=[];
  showTreePanel();
  treeResult(null);
  revealTreePanel();
}
/* Substring match against the leaf display names -- deliberately not a prefix/startsWith
   match, so partial words anywhere in a multi-word name are found (e.g. typing "pericy"
   must also surface "Venular smooth muscle cell/pericyte", not just "Pericyte"). */
function searchLeaves(query){
  const q=query.trim().toLowerCase();
  if(!q)return[];
  return Object.keys(LEAF_NAMES).filter(slug=>LEAF_NAMES[slug].toLowerCase().includes(q)).slice(0,8);
}
/* Generic "fast jump to a cell type" search box. idPrefix keeps the two places this is used
   (next to the main "Guided identification" button, and inside the guided-ID panel itself)
   from clashing on element IDs; onSelect(slug) lets each call site decide what "jump" means
   there (open the panel fresh at that leaf, vs. jump mid-tree). */
function leafSearchHtml(idPrefix,label){
  return '<div class="leaf-search"><label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin-bottom:4px">'+(label||"Already know the cell type? Jump straight there")+'</label>'
    +'<input type="text" id="'+idPrefix+'Input" placeholder="type any part of a cell type, e.g. “pericy” or “muscle”" autocomplete="off">'
    +'<div class="leaf-search-results" id="'+idPrefix+'Results"></div></div>';
}
function wireLeafSearch(idPrefix,onSelect){
  const input=document.getElementById(idPrefix+"Input"),results=document.getElementById(idPrefix+"Results");
  if(!input||!results)return;
  let hi=-1;
  function items(){return[...results.querySelectorAll(".leaf-search-item")];}
  function setHi(idx){
    const els=items();
    if(!els.length){hi=-1;return;}
    hi=(idx+els.length)%els.length;
    els.forEach((el,i)=>el.classList.toggle("hi",i===hi));
    els[hi].scrollIntoView({block:"nearest"});
  }
  function renderMatches(){
    const matches=searchLeaves(input.value);
    if(!input.value.trim()){results.classList.remove("show");results.innerHTML="";hi=-1;return;}
    results.innerHTML=matches.length
      ? matches.map(slug=>'<div class="leaf-search-item" data-slug="'+slug+'">'+LEAF_NAMES[slug]+'</div>').join("")
      : '<div class="leaf-search-empty">No cell types match</div>';
    results.classList.add("show");
    /* Selection used to be bound on "mousedown" only. On Søren's pen display (Kamvas 13) and
       any touchscreen, a pen/touch tap doesn't reliably fire "mousedown" before the input's
       blur handler below has already hidden the dropdown -- pointer/touch input generates its
       own event sequence (pointerdown/touchstart) that a mouse-only listener never sees, so the
       tap effectively lands on nothing. "pointerdown" is the unified event for mouse, pen AND
       touch (falls back to "mousedown" only on the rare browser without Pointer Events support),
       so this single listener now reliably catches a click/tap/pen-tap on a suggestion
       regardless of input device. */
    const selectEvt=window.PointerEvent?"pointerdown":"mousedown";
    results.querySelectorAll(".leaf-search-item").forEach(el=>el.addEventListener(selectEvt,ev=>{
      ev.preventDefault();onSelect(el.dataset.slug);
    }));
    hi=-1;
    if(matches.length)setHi(0);
  }
  input.addEventListener("input",renderMatches);
  input.addEventListener("focus",renderMatches);
  input.addEventListener("keydown",ev=>{
    if(ev.key==="ArrowDown"){if(items().length){ev.preventDefault();setHi(hi+1);}}
    else if(ev.key==="ArrowUp"){if(items().length){ev.preventDefault();setHi(hi-1);}}
    else if(ev.key==="Enter"){
      const els=items(),el=(hi>=0&&els[hi])?els[hi]:els[0];
      if(el){ev.preventDefault();onSelect(el.dataset.slug);}
    } else if(ev.key==="Escape"){
      results.classList.remove("show");input.blur();
    }
  });
  input.addEventListener("blur",()=>setTimeout(()=>results.classList.remove("show"),150));
}
/* Reads the selected 1-5 pill from the result screen's certainty scale, if any is selected.
   Kept as a standalone lookup (rather than a stored variable) so it can be called from the
   Copy summary handler and both report/contribute handlers without worrying about render order. */
function getCertainty(){
  const sel=document.querySelector("#certScale .cert-opt.sel");
  return sel?sel.dataset.val:"";
}
/* "Prevent situations where users repeatedly overwrite each other without context" (Søren).
   The reporting endpoint is POSTed with mode:"no-cors" (see postReport()), which means the
   client can NEVER read a response body back -- so a server-side "reject and explain why" round
   trip is not viable here (it would either silently drop the submission with no visible error,
   or the UI would have to lie and show "submitted" regardless). This guard instead runs
   entirely client-side, BEFORE postReport() is ever called, using window.CUR_COMMUNITY_IDS
   (already populated by loadCommunityReports() with every distinct identity currently on file
   for this nucleus). If the name about to be submitted differs from every identity already on
   record AND no comment has been written, submission is held back with an inline explanation
   instead of silently overwriting -- adding a comment (any comment) satisfies it. This is a
   friction/UX gate, not a hard block: nothing stops a user who really has nothing to add from
   writing one word, on purpose -- the point is making an override a deliberate, visible choice
   rather than a silent one, and every override is now permanently visible afterwards in the
   Classification History panel regardless. Returns the list of existing identities being
   overridden, or null if no warning is needed. */
function checkOverrideContext(newName,commentText){
  if(commentText&&commentText.trim())return null; // context given -- nothing to warn about
  const ids=window.CUR_COMMUNITY_IDS||[];
  if(!ids.length)return null; // nothing on file yet -- there is nothing to "override"
  const nn=String(newName||"").trim().toLowerCase();
  if(ids.some(x=>String(x).trim().toLowerCase()===nn))return null; // agrees with what's already there
  return ids;
}
function renderOverrideWarning(existingIds){
  const el=document.getElementById("overrideWarning");
  if(!el)return;
  if(!existingIds){el.innerHTML="";return;}
  el.innerHTML='<div class="idf-flag" style="border-color:var(--warn);color:var(--warn);margin-top:10px">'
    +'&#9888; Already identified as <b>'+existingIds.map(escHtml).join(", ")+'</b> by the community. '
    +'Please add a short comment explaining your reasoning before submitting a different identification &mdash; '
    +'it helps future contributors understand why the call changed. (This is recorded either way in the '
    +'Classification history panel, but a comment makes it far more useful.)</div>';
  const cEl=document.getElementById("idfComment");
  if(cEl)cEl.focus();
}
