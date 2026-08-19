/* core/stepthrough.js — shared tab-switching + step-through-review engine (2026-08-18)
   7th core module. Two independent pieces that only share a file because both are small,
   dataset-agnostic UI mechanics that both µJump and βJump need now that βJump is getting a
   Filter-and-show tab of its own for the first time:

   1. Tab bar switching (UJ.stepthrough.wireTabs) — was an inline IIFE in ujump.html, generalized
      here: the localStorage key and the ?tab= URL param name are now per-dataset
      (UJ.cfg.tabs.lsKey/urlParam) rather than hardcoded "ujump_active_tab"/"tab", so µJump and
      βJump (opened in the same browser) never clobber each other's remembered tab. The
      dashboard-tab lazy-init hook stays but is now fully optional (typeof-guarded) — µJump has
      a dashboard tab, βJump does not yet.

   2. Step-through review (UJ.stepthrough.initStepThrough / stepGoTo) — moved close to verbatim
      from ujump.html (added originally for Gary's cortical-column microglia-checking workflow):
      visits every matched cell in a fixed order exactly once, persists progress in localStorage
      keyed by a signature of the match set, resumes on the next "Preview matches". The
      localStorage key is also per-dataset now (UJ.cfg.stepthrough.lsKey) for the same
      cross-tool-clobbering reason as above — µJump used a single hardcoded "ujump_stepthrough_v1"
      key; that was fine when only one tool existed, but two tools open in the same browser origin
      would have shared (and corrupted) each other's progress counters.

   HOST CONTRACT
   -------------
   Required, must exist before wireTabs()/initStepThrough() are called:
     - `rowPos(row)`         -- returns [x,y,z] voxel position for a match's `.row`
     - `jumpToVoxel(x,y,z)`  -- navigates the Jump panel to that position (same function the
                                coordinate "Go" button and random-cell buttons already call)
   DOM ids expected to exist (all are individually null-checked; a missing one just means that
   piece of UI is inert, not a thrown error):
     - `#mainTabs` with child `.tabbtn[data-tab]` buttons, and `.tabpanel[data-tabpanel]` panels
       elsewhere in the document
     - `#stepThroughCard`, `#stepCounter`, `#stepPrev`, `#stepNext`, `#stepReset`
   Optional, guarded:
     - `initDashboardTab()` + `ensureConnPlotly()` -- if both exist, clicking the "dashboard" tab
       lazy-inits it exactly as µJump already does; if either is missing (βJump today), the
       dashboard special-case is simply skipped, tab switching still works for every other tab.

   UJ.cfg.tabs = { lsKey, urlParam } -- defaults "ujump_active_tab"/"tab" (µJump's original
   values, so its own behavior/URLs are unchanged); βJump sets "bjump_active_tab"/"tab".
   UJ.cfg.stepthrough = { lsKey } -- default "ujump_stepthrough_v1"; βJump sets
   "bjump_stepthrough_v1".
*/
(function(){
  window.UJ = window.UJ || {};
  var UJ = window.UJ;
  UJ.stepthrough = UJ.stepthrough || {};

  function tabsCfg(){ try{ return (UJ&&UJ.cfg&&UJ.cfg.tabs)||{}; }catch(_e){ return {}; } }
  function stepCfg(){ try{ return (UJ&&UJ.cfg&&UJ.cfg.stepthrough)||{}; }catch(_e){ return {}; } }

  /* ---------- 1. Tab bar switching ---------------------------------------------------- */
  function wireTabs(){
    var bar=document.getElementById("mainTabs");
    if(!bar)return;
    var lsKey=tabsCfg().lsKey||"ujump_active_tab";
    var urlParam=tabsCfg().urlParam||"tab";
    var btns=Array.prototype.slice.call(bar.querySelectorAll(".tabbtn[data-tab]"));
    function activate(name){
      btns.forEach(function(b){var on=b.dataset.tab===name;b.classList.toggle("active",on);b.setAttribute("aria-selected",on?"true":"false");});
      document.querySelectorAll(".tabpanel").forEach(function(p){p.classList.toggle("active",p.dataset.tabpanel===name);});
      try{localStorage.setItem(lsKey,name);}catch(e){}
      if(name==="dashboard"&&!window.__dashTabInited&&typeof initDashboardTab==="function"&&typeof ensureConnPlotly==="function"){
        window.__dashTabInited=true;
        var statusEl=document.getElementById("statusLine");
        ensureConnPlotly().then(function(){initDashboardTab();}).catch(function(err){
          if(statusEl)statusEl.textContent="Failed to load the charting library — "+err.message;
        });
      }
    }
    btns.forEach(function(b){b.addEventListener("click",function(){activate(b.dataset.tab);});});
    UJ.stepthrough.activateTab=activate;
    document.addEventListener("DOMContentLoaded",function(){
      var fromUrl=null;try{fromUrl=new URLSearchParams(location.search).get(urlParam);}catch(e){}
      var saved=null;try{saved=localStorage.getItem(lsKey);}catch(e){}
      var pick=[fromUrl,saved].find(function(t){return t&&btns.some(function(b){return b.dataset.tab===t;});});
      activate(pick||"jump");
    });
  }
  UJ.stepthrough.wireTabs=wireTabs;

  /* ---------- 2. Step-through review --------------------------------------------------- */
  var stepMatches=null,stepIndex=0,stepVisited=[];
  var stepCard,stepCounterEl,stepPrevBtn,stepNextBtn,stepResetBtn,stepWired=false;

  function stepLsKey(){ return stepCfg().lsKey||"ujump_stepthrough_v1"; }

  function stepSig(matches){
    if(!matches||!matches.length)return "";
    if(typeof rowPos!=="function")return String(matches.length);
    var a=rowPos(matches[0].row),b=rowPos(matches[matches.length-1].row);
    return matches.length+"|"+a.join(",")+"|"+b.join(",");
  }
  function loadStepState(){
    try{return JSON.parse(localStorage.getItem(stepLsKey()))||null;}catch(e){return null;}
  }
  function saveStepState(){
    try{localStorage.setItem(stepLsKey(),JSON.stringify({sig:stepSig(stepMatches),index:stepIndex,visited:stepVisited}));}catch(e){}
  }
  function updateStepUI(){
    if(!stepCard)return;
    if(!stepMatches||!stepMatches.length){stepCard.style.display="none";return;}
    stepCard.style.display="";
    var total=stepMatches.length;
    var visitedCount=stepVisited.length;
    if(stepCounterEl)stepCounterEl.textContent="Cell "+(stepIndex+1).toLocaleString()+" of "+total.toLocaleString()+" — "+visitedCount.toLocaleString()+" checked so far";
    if(stepPrevBtn)stepPrevBtn.disabled=stepIndex<=0;
    if(stepNextBtn)stepNextBtn.textContent=stepIndex>=total-1?"Done — restart from #1":"Next →";
  }
  function stepGoTo(i){
    if(!stepMatches||i<0||i>=stepMatches.length)return;
    stepIndex=i;
    if(stepVisited.indexOf(i)<0)stepVisited.push(i);
    if(typeof rowPos==="function"&&typeof jumpToVoxel==="function"){
      var pos=rowPos(stepMatches[i].row);
      jumpToVoxel(pos[0],pos[1],pos[2]);
    }
    saveStepState();
    updateStepUI();
  }
  /* initStepThrough(matches): call with the fresh match array right after every successful
     "Preview matches" run (matches=null/[] when the filters change and invalidate the old
     preview). Lazily grabs its DOM elements and wires the Prev/Next/Reset buttons on first call,
     so a host page can load this module before those elements exist in the DOM. */
  function initStepThrough(matches){
    if(!stepWired){
      stepCard=document.getElementById("stepThroughCard");
      stepCounterEl=document.getElementById("stepCounter");
      stepPrevBtn=document.getElementById("stepPrev");
      stepNextBtn=document.getElementById("stepNext");
      stepResetBtn=document.getElementById("stepReset");
      if(stepPrevBtn)stepPrevBtn.addEventListener("click",function(){if(stepMatches)stepGoTo(Math.max(0,stepIndex-1));});
      if(stepNextBtn)stepNextBtn.addEventListener("click",function(){
        if(!stepMatches)return;
        stepGoTo(stepIndex>=stepMatches.length-1?0:stepIndex+1);
      });
      if(stepResetBtn)stepResetBtn.addEventListener("click",function(){
        if(!stepMatches)return;
        if(!confirm("Clear step-through progress ("+stepVisited.length.toLocaleString()+" cell(s) checked so far) for this set of "+stepMatches.length.toLocaleString()+" matched cells?"))return;
        stepIndex=0;stepVisited=[];
        saveStepState();
        updateStepUI();
      });
      stepWired=true;
    }
    stepMatches=(matches&&matches.length)?matches:null;
    if(!stepMatches){stepVisited=[];stepIndex=0;updateStepUI();return;}
    var sig=stepSig(stepMatches);
    var saved=loadStepState();
    var resumeIndex=0;
    if(saved&&sig&&saved.sig===sig){
      resumeIndex=Math.min(Math.max(0,saved.index||0),stepMatches.length-1);
      stepVisited=Array.isArray(saved.visited)?saved.visited.filter(function(i){return i>=0&&i<stepMatches.length;}):[];
    } else {
      stepVisited=[];
    }
    stepGoTo(resumeIndex);
  }
  UJ.stepthrough.initStepThrough=initStepThrough;
  UJ.stepthrough.stepGoTo=stepGoTo;
  UJ.stepthrough.currentIndex=function(){return stepIndex;};
  UJ.stepthrough.currentMatches=function(){return stepMatches;};
})();
