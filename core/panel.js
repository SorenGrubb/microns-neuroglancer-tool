/* ── core/panel.js ─ the shared cell panel ───────────────────────────────────────
   Extracted verbatim from ujump.html on 2026-08-18 (stage P1 of the panel extraction in
   claude/shared-core-refactor-plan.md) so µJump, ηJump and βJump share ONE implementation of
   the community-report / cell-history / organelle-reporting panel instead of three that drift.

   Four regions moved, in their original order:
     1. organelle & extracellular-structure ontology (ORGANELLE_GROUPS and friends) plus the
        two read-back renderers, organelleCountParts() and organelleStructRowsHtml()
     2. loadIdentityVotesPanel() / stepVoteRowHtml() / renderStepVotePanel()
     3. the cell-history audit trail and loadCommunityReports() — the light-blue community
        identification block, its consensus naming, and the headline override
     4. the inline organelle report form (organelleFlagHtml / organelleFormHtml / wireOrganelleForm)

   NOTHING was renamed. Every function is still a plain global, so no call site in ujump.html
   changed — the same convention core/mesh.js, core/gamify.js and core/ontology.js already use.

   HOST CONTRACT — what the page must provide for this module to work:
     required : escHtml, coordSpan, postReport, REPORT_ENDPOINT, REPORTER_NAME, REPORTER_EMAIL,
                GOOGLE_VERIFIED, GOOGLE_CREDENTIAL, ID_CTX (an object)
     from core: LEAF_NAMES / TREE / canonSubmitName (core/ontology.js),
                favStarHtml / refreshFavStars (core/gamify.js)
     optional : celltypeLink, restoreClassification, neuroglancerLinkForPos, initGSI,
                saveReporterFromInput, ID_PATH, CUR_NUCID, CUR_ROOT, SEARCH_HISTORY,
                renderSearchHistory, renderStepVotePanel — every one of these is reached
                through a `typeof …` guard, so a page that has none of them still renders the
                panel correctly, just without that page-specific extra.

   DOM ids this module reads/writes (a host page must use these names to get the panel):
     #commReports        the community identification block
     #classHistoryPanel  the cell history / audit trail
     #idVotePanel        the per-identity agree/disagree votes
     #ctHeadline #ctTag  the cell headline the community name overrides
                         (#ctHeadline carries data-unclassified and data-microns-name)

   CAUTION when editing: several `const` declarations here (ORGANELLE_GROUPS, ORGANELLE_KINDS,
   ORGANELLE_KIND_BY_VALUE, ORGANELLE_KIND_OPTIONS_HTML) are top-level. Top-level const DOES
   cross <script> boundaries but is NOT on window, and a second declaration of the same name
   anywhere on the page throws a SyntaxError that silently kills that whole block. Do not
   re-declare them in a page that loads this file. */
window.UJ = window.UJ || {};
UJ.panel = UJ.panel || {};
UJ.panel.BUILD = "2026-08-18 stage-P1";

/* Every READ this module makes has to say which dataset it is about, exactly as core/gamify.js
   does for its own reads (see gamifyGet's comment there): the backend routes by `ds` and only
   namespaces its cache once the request carries it. Without this, βJump's cell panel would
   quietly read µJump's spreadsheet and show a hippocampal nucleus somebody else's cortical
   identifications. A missing or unknown ds falls back to ujump server-side, so this is a no-op
   on µJump and safe to ship either side of a backend deploy. */
/* Which cell the panel is currently showing. Set by loadCommunityReports()/
   loadClassificationHistory() at CALL time and re-checked when their fetches resolve, so a slow
   response for the cell you just left can never write into the cell you just opened. Without
   this, clicking a neighbour while the first cell's community read is still in flight renames
   the NEW cell's headline with the OLD cell's consensus -- caught 2026-08-18 by bjumpcheck.js,
   and present in µJump for as long as this code has existed. βJump's own pre-extraction panel
   had the equivalent guard (`if(CUR_IDX!==i) return;`); this moves it into the shared module so
   all three tools get it. */
var PANEL_CUR_NID=null;
UJ.panel.currentNucleusId=function(){return PANEL_CUR_NID;};

function panelDsQS(){
  try{ if(UJ&&UJ.cfg&&UJ.cfg.backend&&UJ.cfg.backend.ds) return "&ds="+encodeURIComponent(UJ.cfg.backend.ds); }catch(_e){}
  return "";
}


/* ==== organelle/structure ontology (ORGANELLE_GROUPS/ORGANELLE_KINDS/ORGANELLE_KIND_BY_VALUE/
   organReportPointLabels/ORGANELLE_KIND_OPTIONS_HTML) MOVED to core/ontology.js on 2026-08-20
   (Søren: "I should be able to report the same organelles in hJump and bJump as in uJump") --
   hJump loads core/ontology.js already (see hjump-architecture-correction-2026-08-19: it
   deliberately does NOT load this file, core/panel.js, wholesale) but needed this pure-data
   ontology to build its own organelle-report form. core/ontology.js loads BEFORE this file in
   every page that loads both (bjump.html, ujump.html), so every function below that reads
   ORGANELLE_GROUPS/ORGANELLE_KINDS/etc. is unaffected -- same shared global lexical environment
   as always (see the "VERIFIED 2026-08-16" note that used to sit here), just declared in a
   different <script> tag now. Nothing in this file was renamed; only the declaration moved. */
/* Tally a flat list of {kind,...} structures into short "N× label" parts, generically over
   EVERY kind in ORGANELLE_KINDS (not just centriole/cilium) -- shared by the three near-identical
   "structures logged for this cell" summary lines (main nucleus panel, out-of-region community
   panel, merged-sub-cell panel) so a newly-added kind shows up correctly in all three at once
   rather than needing three separate hand-edits (the exact drift this file's own
   organelleStructRowsHtml comment already warned about). An unrecognized kind string (e.g. from
   an older report predating this kind, or a future kind added server-side before this dropdown
   catches up) falls back to showing the raw kind string rather than being silently dropped. */
function organelleCountParts(structs){
  const counts={};
  structs.forEach(s=>{counts[s.kind]=(counts[s.kind]||0)+1;});
  return Object.keys(counts).map(k=>{
    const info=ORGANELLE_KIND_BY_VALUE[k];
    return counts[k]+"× "+(info?info.short:k);
  });
}
/* Shared renderer for a list of {kind,pointA,pointB} organelle/structure annotations -- pointA/
   pointB are "x,y,z" voxel strings (pointA only for a single-point kind; pointA/pointB both set
   for a vector kind -- cilium and, since 2026-08-07, nucleoplasmic_reticulum_2 -- with wording
   from organReportPointLabels() rather than a hardcoded "base"/"tip"). Used both by
   loadCommunityReports() below (in-region, per-nucleus organelleGroups) and
   renderUserReportedCell() (out-of-region, coordinate-matched organelle reports -- see
   organellesNearPos()), factored out so both stay in sync rather than drifting apart. */
function organelleStructRowsHtml(structs){
  const parsePt=s=>{const p=(s||"").split(",").map(Number);return(p.length===3&&p.every(n=>!isNaN(n)))?p:null;};
  const jumpBtn=p=>'<button type="button" class="jumpview" data-x="'+p[0]+'" data-y="'+p[1]+'" data-z="'+p[2]+'" style="margin-left:6px;padding:2px 8px;font-size:11px">Jump</button>';
  return structs.map(s=>{
    const pa=parsePt(s.pointA);
    const info=ORGANELLE_KIND_BY_VALUE[s.kind];
    const label=info?info.short:(s.kind||"Structure");
    const capLabel=label.charAt(0).toUpperCase()+label.slice(1);
    if(info&&info.vector){
      const pb=parsePt(s.pointB);
      if(!pa&&!pb)return"";
      const pl=organReportPointLabels(s.kind).map(l=>l.toLowerCase());
      return '<div class="meta" style="margin-top:4px">'+capLabel
        +(pa?' '+pl[0]+' ('+coordSpan(pa[0],pa[1],pa[2])+')'+jumpBtn(pa):'')
        +(pb?' &rarr; '+pl[1]+' ('+coordSpan(pb[0],pb[1],pb[2])+')'+jumpBtn(pb):'')
        +'</div>';
    }
    return pa?'<div class="meta" style="margin-top:4px">'+capLabel+' at ('+coordSpan(pa[0],pa[1],pa[2])+')'+jumpBtn(pa)+'</div>':"";
  }).join("");
}

/* ==== identity vote panel + step-through vote rows  (was ujump.html lines 4920-5020) ==== */
function loadIdentityVotesPanel(nid,seeds){
  var el=document.getElementById("idVotePanel");
  if(!el||!REPORT_ENDPOINT||!nid){if(el)el.innerHTML="";return;}
  if(window.__idvNid!==String(nid)){window.CUR_COMMUNITY_IDS=[];}
  window.__idvNid=String(nid);window.__idvBase=(seeds||[]);
  var votable=function(nm){return nm&&String(nm).trim()&&!/unclassif/i.test(String(nm));};
  var base=(seeds||[]).concat(window.CUR_COMMUNITY_IDS||[]).filter(votable).map(String);
  el.innerHTML="";
  var render=function(list){
    var map={};list.forEach(function(v){map[String(v.identity).toLowerCase()]=v;});
    var names=[],seen={};
    base.concat(list.map(function(v){return v.identity;})).forEach(function(nm){var k=String(nm).toLowerCase();if(k&&!seen[k]&&votable(nm)){seen[k]=1;names.push(nm);}});
    if(!names.length){el.innerHTML="";return;}
    var multi=names.length>1;
    var h='<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12px;color:var(--mut)"><span>agree?</span>';
    var mine=window.MY_PROPOSED_IDS||{};
    names.forEach(function(nm){
      var t=map[String(nm).toLowerCase()]||{up:0,down:0,net:0};
      var isMine=!!mine[String(nm).toLowerCase()];
      h+='<span style="display:inline-flex;align-items:center;gap:4px;border:1px solid var(--line);border-radius:14px;padding:1px 7px">'
        +(multi?'<span style="color:var(--ink)">'+escHtml(nm)+'</span>':'')
        +(isMine?''
          :'<button class="idbtn idvote" data-nm="'+escHtml(nm)+'" data-v="1" title="agree" style="padding:0 5px">▲</button>')
        +'<span style="min-width:14px;text-align:center;color:var(--ink)">'+(t.net>0?"+":"")+t.net+'</span>'
        +(isMine?'<span title="You proposed this identification, so you can\'t vote on it" style="color:var(--mut);font-size:11px;margin-left:2px">your ID</span>'
          :'<button class="idbtn idvote" data-nm="'+escHtml(nm)+'" data-v="-1" title="disagree" style="padding:0 5px">▼</button>')
        +'</span>';
    });
    h+='</div>';
    el.innerHTML=h;
    el.querySelectorAll(".idvote").forEach(b=>b.addEventListener("click",()=>{
      if(postReport({type:"vote_identity",timestamp:new Date().toISOString(),nucleusId:nid,identity:b.dataset.nm,vote:Number(b.dataset.v)},"Vote recorded — thank you."))
        setTimeout(function(){loadIdentityVotesPanel(nid,window.__idvBase||[]);},1500);
    }));
  };
  fetch(REPORT_ENDPOINT+"?identityVotes="+encodeURIComponent(nid)+panelDsQS()).then(function(r){return r.json();}).then(function(d){render((d&&d.identityVotes)||[]);}).catch(function(){});
}
/* Step-through review voting -- 2026-08-09 (Søren: "users can step through filtered cells one by
   one, but cannot easily vote on classifications... Upvote/downvote original classification,
   upvote/downvote community classification"). Deliberately its own small function, NOT a call
   into loadIdentityVotesPanel() -- that panel pools every votable identity (MICrONS prediction +
   every community proposal) into one undifferentiated list of pills, which is exactly right for
   "agree with any of these names" but wrong here: the review workflow specifically wants ONE
   clearly-labelled action for "the original (MICrONS) call" and ONE for "the community's current
   call", not a variable-length pill list someone has to parse while quickly stepping through many
   cells. Reuses the EXACT same server mechanism though (postReport type "vote_identity", the same
   "Identity votes" sheet/?identityVotes= read endpoint) -- voting is voting, regardless of which
   UI surface it's cast from, so no backend changes were needed for this feature.
   name may be null (no MICrONS prediction, or no community identification yet for this cell) --
   returns "" in that case, which is how the two rows below independently disappear rather than
   showing an empty/dead vote target ("minimal clutter"). */
function stepVoteRowHtml(label,name,votesMap){
  if(!name)return"";
  var t=votesMap[String(name).toLowerCase()]||{up:0,down:0,net:0};
  var mine=window.MY_PROPOSED_IDS||{};
  var isMine=!!mine[String(name).toLowerCase()];
  return '<div class="stepvote-row">'
    +'<span class="stepvote-label">'+escHtml(label)+'</span>'
    +'<span class="stepvote-name">'+escHtml(name)+'</span>'
    +(isMine?'<span class="nsub" title="You proposed this identification, so you can\'t vote on it">your ID</span>'
      :'<button type="button" class="idbtn stepvote" data-nm="'+escHtml(name)+'" data-v="1" aria-label="Upvote '+escHtml(label)+' classification: '+escHtml(name)+'" title="Agree">&#9650;</button>')
    +'<span class="stepvote-net">'+(t.net>0?"+":"")+t.net+'</span>'
    +(isMine?''
      :'<button type="button" class="idbtn stepvote" data-nm="'+escHtml(name)+'" data-v="-1" aria-label="Downvote '+escHtml(label)+' classification: '+escHtml(name)+'" title="Disagree">&#9660;</button>')
    +'</div>';
}
/* Renders (or clears) #stepVotePanel, inside #stepThroughCard on the Filter-and-show tab. Safe to
   call from anywhere, any time -- no-ops cleanly if the panel isn't in the DOM (e.g. before the
   Filter tab has ever been opened) or there's no current nucleus. When window.CUR_MICRONS_NAME
   and window.CUR_COMMUNITY_TOP_NAME resolve to the SAME name (a cell everyone agrees on), only
   ONE row is shown instead of two identical-looking vote targets -- voting on either would cast
   an identical vote for the identical string, so showing both would just be visual clutter with
   no added function. */
function renderStepVotePanel(){
  var el=document.getElementById("stepVotePanel");
  if(!el)return;
  var nid=(typeof CUR_NUCID!=="undefined"&&CUR_NUCID)||"";
  if(!nid){el.innerHTML="";return;}
  var micronsName=window.CUR_MICRONS_NAME||null;
  var commName=window.CUR_COMMUNITY_TOP_NAME||null;
  /* 2026-08-20, Søren: "I want to have the cell identity appear under the step through matches,
     so you can see what cell you are stepping to, like in the Jump screen. It worked earlier for
     uJump, not sure why it went away?" It never actually worked THIS way -- the old code returned
     an empty panel (el.innerHTML="") whenever neither a MICrONS prediction nor a community
     identity existed to VOTE on, which for large stretches of an unclassified dataset meant a
     blank panel on nearly every step. That was deliberate at the time (a panel with nothing
     votable had nothing to show), but it's not what someone stepping through matches needs: they
     need to know WHICH CELL they're looking at even when nobody has identified it yet, exactly
     like the main Jump-tab panel always shows a headline. Falls all the way to a nucleus-id label
     only when NOTHING has named this cell yet, the same "Nucleus <id>" convention bJump's own
     cellLabel() already uses elsewhere on this page.

     2026-08-20 (5th pass), found via idcard_commcheck.js: the name here is picked with
     commName/micronsName FIRST, window.CUR_CELLTYPE_DISPLAY only as a fallback -- NOT the other
     way around, even though CUR_CELLTYPE_DISPLAY is the same headline text the main Jump-tab
     panel shows. Reason: showNucleus() sets CUR_CELLTYPE_DISPLAY="Unclassified" SYNCHRONOUSLY for
     a genuinely-unclassified cell -- a real, truthy string, not null -- and that value only gets
     overwritten once loadCommunityReports()'s community-report fetch resolves AND finds a winning
     name (the "window.CUR_CELLTYPE_DISPLAY=win.name" line below), AND only when #ctHeadline exists
     in the DOM. This function's own THIRD call site (right after "window.CUR_COMMUNITY_TOP_NAME=
     win.name", a few lines before that CUR_CELLTYPE_DISPLAY update runs) fires BEFORE
     CUR_CELLTYPE_DISPLAY is updated -- so at that exact render, CUR_CELLTYPE_DISPLAY is still the
     STALE "Unclassified" string, which is truthy and therefore used to win over the fresh, correct
     commName if CUR_CELLTYPE_DISPLAY were checked first. Since no further render happens after
     CUR_CELLTYPE_DISPLAY finally catches up, the panel was left permanently stuck on
     "Unclassified" even though the community name had already won. commName/micronsName are this
     function's own locals, re-read from window.* fresh on every call, so preferring them avoids
     the staleness entirely; CUR_CELLTYPE_DISPLAY still matters as the fallback for cases
     commName/micronsName can't express (a merged-nucleus sum name, or an own verified override)
     where it's the only name available and isn't racing anything. */
  var curName=commName||micronsName||window.CUR_CELLTYPE_DISPLAY||null;
  /* 2026-08-20 (4th pass): "what I wanted was to have this window underneath it with the cell
     identity and layer model and all" -- the plain one-line headline above (still built as the
     FALLBACK, for cells/branches that don't set the richer card -- see showNucleus()'s own reset
     comment) wasn't what Søren meant by "the cell identity". window.CUR_STEP_CARD_HTML, when
     present, is host-page-built read-only markup (tag + celltype headline + layer/V1-column
     badge + nucleus ID + root ID) reusing the exact same pieces the Jump-tab panel itself
     renders for this cell -- see showNucleus()'s "4th pass" comment for where it's built. Using
     it here, rather than re-deriving a smaller summary, is what keeps this card and the Jump-tab
     panel from ever visually disagreeing. */
  /* The "@@STEPCARD_NAME@@" token (see showNucleus()'s "4th pass" comment) gets the CURRENT name
     substituted in on every render, not just the first -- this is what keeps the card's name in
     sync when a community identification wins moments after the cell first loaded, the same
     freshness the plain-text fallback below already had via curName directly. */
  var headline=window.CUR_STEP_CARD_HTML
    ?'<div class="stepvote-idcard">'+window.CUR_STEP_CARD_HTML.split("@@STEPCARD_NAME@@").join(escHtml(curName||("Nucleus "+nid)))+'</div>'
    :'<div class="stepvote-headline">Currently: <b>'
      +escHtml(curName||("Nucleus "+nid+" — not yet identified"))+'</b></div>';
  // Same click-to-copy behaviour the .idval pills already have inside #nucpanel (see
  // panel.querySelectorAll(".idval") in showNucleus()/showCell()) -- wired here too since the
  // rich card's nucleus-ID/root-ID rows (window.CUR_STEP_CARD_HTML) reuse the same .idval class
  // but live in a different container (#stepVotePanel) that isn't covered by that wiring.
  function wireIdCopy(){
    el.querySelectorAll(".idval").forEach(function(v){
      v.addEventListener("click",function(){
        if(navigator.clipboard)navigator.clipboard.writeText(v.dataset.c);
        var o=v.textContent;v.textContent="copied";setTimeout(function(){v.textContent=o;},900);
      });
    });
  }
  if(!REPORT_ENDPOINT){el.innerHTML='<div class="stepvote-panel">'+headline+'</div>';wireIdCopy();return;}
  // Render the headline immediately, synchronously -- don't make it wait on the votes fetch below,
  // which is only needed for the OPTIONAL vote-button rows underneath.
  el.innerHTML='<div class="stepvote-panel">'+headline+'</div>';
  wireIdCopy();
  fetch(REPORT_ENDPOINT+"?identityVotes="+encodeURIComponent(nid)+panelDsQS()).then(function(r){return r.json();}).then(function(d){
    var list=(d&&d.identityVotes)||[];
    var map={};list.forEach(function(v){map[String(v.identity).toLowerCase()]=v;});
    var sameAsMicrons=micronsName&&commName&&String(micronsName).toLowerCase()===String(commName).toLowerCase();
    var rows=sameAsMicrons
      ?stepVoteRowHtml("Original / community-confirmed",micronsName,map)
      :stepVoteRowHtml("Original (MICrONS)",micronsName,map)+stepVoteRowHtml("Community",commName,map);
    el.innerHTML='<div class="stepvote-panel">'+headline
      +(rows?'<div class="stepvote-title">Vote on this cell&rsquo;s classification</div>'+rows:'')+'</div>';
    wireIdCopy();
    el.querySelectorAll(".stepvote").forEach(function(b){
      b.addEventListener("click",function(){
        b.disabled=true;
        if(postReport({type:"vote_identity",timestamp:new Date().toISOString(),nucleusId:nid,identity:b.dataset.nm,vote:Number(b.dataset.v)},"Vote recorded — thank you.")){
          setTimeout(renderStepVotePanel,1500);
        } else {
          b.disabled=false;
        }
      });
    });
  }).catch(function(){}); // headline is already showing; a failed votes fetch just means no vote rows this time
}

/* ==== cell history (audit trail) + community reports  (was ujump.html lines 6035-6352) ==== */
/* Cell history panel -- 2026-08-09, extended 2026-08-09 (Søren: every reclassification should be
   understandable to future contributors, not just visible as a changed headline; then further:
   "a complete annotation audit trail... reports report status... unresolved vs resolved... link
   related annotations together"). Merges TWO sources into one chronological feed, both fetched
   from Code.gs.txt's doGet:
     - ?classificationHistory=<nucleusId> -> {history:[...]}, NAME-CHANGE events only, derived
       from the "Classification history" sheet (who/when/previous->new identity/certainty/
       comment/sourceType).
     - ?annotationHistory=<nucleusId> -> {annotations:[...]}, the RAW report log across every
       sheet a submission can land in (New identifications/Confirmations/Discrepancies/Merged
       splits/Organelle locations/Not a nucleus) -- so a comment or note that never changed the
       current identity (e.g. a Confirmation's remark, a merged-nucleus report's justification, an
       organelle report, a not-a-nucleus flag) still shows up here instead of being invisible.
   Deliberately ONE combined panel/#classHistoryPanel rather than two side-by-side panels, so a
   contributor sees the whole story for a cell in one scroll instead of having to reconcile two
   lists themselves. Fails silently on either fetch, same convention as loadCommunityReports()
   below, since this is additive context on top of the core lookup, not required for the tool to
   work. Only wired up for the main in-region nucleus panel (showNucleus's in-region branch) --
   standalone/merged-sub/user-reported cells aren't tracked by nucleusId in "Master cell list"
   today, so there is nothing for either endpoint to return for them yet. */
function sourceTypeLabel(src){
  if(src==="microns_original")return"Original MICrONS annotation";
  if(src==="verification")return"Verification (Grubb et al.)";
  if(src==="manual_revision")return"Manual revision";
  if(src==="undo")return"Undo";
  if(src==="admin_restore")return"Restored by administrator";
  return"Community identification";
}
function annotationTypeLabel(t){
  if(t==="new_identification")return"New identification";
  if(t==="confirmation")return"Confirmation";
  if(t==="discrepancy")return"Discrepancy";
  if(t==="merged_split")return"Merged-nucleus report";
  if(t==="organelle_location")return"Organelle report";
  if(t==="not_a_nucleus")return"Not-a-nucleus flag";
  return t||"Report";
}
function fmtHistTs(ts){
  if(!ts)return"";
  try{return new Date(ts).toLocaleString(undefined,{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});}catch(e){return String(ts);}
}
/* Combines classification-history items (kind:"change") and annotation-history items
   (kind:"annotation") into one array sorted oldest-first by timestamp -- plain string sort works
   since both endpoints already return ISO-format timestamps. */
function mergeCellHistory(changeItems,annoItems){
  const combined=(changeItems||[]).map(function(h){return Object.assign({kind:"change"},h);})
    .concat((annoItems||[]).map(function(a){return Object.assign({kind:"annotation"},a);}));
  combined.sort(function(a,b){return String(a.timestamp||"").localeCompare(String(b.timestamp||""));});
  return combined;
}
/* nucleusId/rootId/coord (2026-08-09, undo/restore feature) are only needed to wire up the
   "Correct this" / "Restore this version" buttons below (they must know which cell/version to
   restore) -- every OTHER caller of renderCellHistory keeps working unchanged since these are
   optional. canRestore on a "change" item (only ?classificationHistory= entries carry it --
   annotation-history entries from ?annotationHistory= never do, so those never get a button) is
   computed server-side from the viewer's own verified identity (see doGet's viewerCredential
   handling) -- isOwn -> button reads "Correct this" (re-apply one of MY OWN earlier calls, no
   time limit); OWNER_EMAIL-but-not-isOwn -> "Restore this version" (administrator override,
   authoritative, no time limit). Never shown for a signed-out visitor or anyone else's entry. */
function renderCellHistory(items,nucleusId,rootId,coord){
  const el=document.getElementById("classHistoryPanel");
  if(!el)return;
  if(!items||!items.length){el.innerHTML='<div class="chist-panel"><h4>Cell history</h4><div class="chist-empty">No recorded changes or reports yet for this cell.</div></div>';return;}
  const rows=items.map(function(h){
    if(h.kind==="change"){
      const src=h.sourceType||"community";
      const change=h.previousIdentity
        ?'<span class="old">'+escHtml(h.previousIdentity)+'</span> &rarr; '+escHtml(h.newIdentity||"(unnamed)")
        :escHtml(h.newIdentity||"(unnamed)");
      const cert=h.certainty?'<div class="chist-cert">Certainty: '+escHtml(String(h.certainty))+'/5</div>':"";
      const comment=h.comment?'<div class="chist-comment">“'+escHtml(h.comment)+'”</div>':"";
      const restoreBtn=(h.canRestore&&nucleusId&&h.timestamp)
        ?'<button class="idbtn chist-restore-btn" data-ts="'+escHtml(String(h.timestamp))+'" style="padding:2px 8px;font-size:11px;margin-top:5px">'+(h.isOwn?"Correct this":"Restore this version")+'</button>'
        :"";
      return '<div class="chist-row">'
        +'<div class="chist-top"><span class="chist-change">'+change+'</span>'
        +'<span class="chist-src '+escHtml(src)+'">'+escHtml(sourceTypeLabel(src))+'</span></div>'
        +'<div class="chist-meta">'+(h.reporterName?escHtml(h.reporterName)+' &middot; ':"")+fmtHistTs(h.timestamp)+'</div>'
        +cert+comment+restoreBtn+'</div>';
    }
    // kind:"annotation" -- a raw report-log row, may or may not have changed the current identity.
    const statusClass=h.status==="resolved"?"st-resolved":(String(h.status||"").indexOf("unresolved")===0?"st-unresolved":"st-recorded");
    const identLine=h.identified?'<div class="chist-change">'+escHtml(h.identified)+(h.registered?' <span class="old">(was: '+escHtml(h.registered)+')</span>':'')+'</div>':"";
    const cert=h.certainty?'<div class="chist-cert">Certainty: '+escHtml(String(h.certainty))+'/5</div>':"";
    const note=h.note?'<div class="chist-comment">“'+escHtml(h.note)+'”</div>':"";
    const groupTag=h.groupId?'<span class="chist-group">group '+escHtml(String(h.groupId))+(h.subIndex?(' &middot; sub '+escHtml(String(h.subIndex))+(h.subCount?'/'+escHtml(String(h.subCount)):'')):'')+'</span>':"";
    return '<div class="chist-row">'
      +'<div class="chist-top"><span class="chist-type">'+escHtml(annotationTypeLabel(h.type))+'</span>'+groupTag+'</div>'
      +identLine
      +'<div class="chist-meta">'+(h.reporterName?escHtml(h.reporterName)+' &middot; ':"")+fmtHistTs(h.timestamp)+'</div>'
      +cert+note
      +'<div class="chist-status '+statusClass+'">'+escHtml(h.status||"recorded")+'</div>'
      +'</div>';
  }).join("");
  el.innerHTML='<div class="chist-panel"><h4>Cell history ('+items.length+')</h4>'+rows+'</div>';
  if(nucleusId){
    Array.prototype.forEach.call(el.querySelectorAll(".chist-restore-btn"),function(btn){
      btn.addEventListener("click",function(){
        const ts=btn.getAttribute("data-ts");
        const label=btn.textContent;
        if(!confirm((label==="Correct this"?"Re-apply this earlier identification of yours":"Restore the cell to this earlier classification (administrator override)")+"?\n\nThis is logged in the cell's history like any other change — nothing is deleted."))return;
        btn.disabled=true;btn.textContent="Submitting…";
        if(typeof restoreClassification==="function")restoreClassification(nucleusId,{targetTimestamp:ts,rootId:rootId,coord:coord,
          reason:label==="Correct this"?"Correcting my own earlier submission via the history panel.":"Administrator restore via the history panel."});
        setTimeout(()=>loadClassificationHistory(nucleusId),2500);
      });
    });
  }
}
function loadClassificationHistory(nid){
  const el=document.getElementById("classHistoryPanel");
  if(!el)return;
  el.innerHTML="";
  if(!REPORT_ENDPOINT||!nid)return;
  PANEL_CUR_NID=String(nid);
  const stale=function(){return PANEL_CUR_NID!==String(nid);};
  const viewerQS=(GOOGLE_VERIFIED&&GOOGLE_CREDENTIAL)?"&viewerCredential="+encodeURIComponent(GOOGLE_CREDENTIAL):"";
  Promise.all([
    fetch(REPORT_ENDPOINT+"?classificationHistory="+encodeURIComponent(nid)+viewerQS+panelDsQS()).then(r=>r.json()).catch(()=>null),
    fetch(REPORT_ENDPOINT+"?annotationHistory="+encodeURIComponent(nid)+panelDsQS()).then(r=>r.json()).catch(()=>null)
  ]).then(function(results){
    if(stale())return;                   // see PANEL_CUR_NID
    const changeItems=(results[0]&&results[0].history)||[];
    const annoItems=(results[1]&&results[1].annotations)||[];
    renderCellHistory(mergeCellHistory(changeItems,annoItems),nid,(typeof CUR_ROOT!=="undefined"&&CUR_ROOT)||"",window.CUR_POS?window.CUR_POS.join(","):"");
  }).catch(()=>{});
}
function loadCommunityReports(nid,cellPos){
  const el=document.getElementById("commReports");
  if(!el)return;
  el.innerHTML="";
  if(!REPORT_ENDPOINT||!nid)return;
  PANEL_CUR_NID=String(nid);
  /* 2026-08-20 (2nd pass), Søren: "still don't see it for any of the datasets" after the first
     pass -- confirmed live via the actual grubblab.com page that the headline-when-nothing's-
     votable fix above was correct but USELESS in practice: renderStepVotePanel()'s only call
     sites were both inside THIS function's own fetch(...).then() chain (lines below), so nothing
     painted the panel until the ?nucleusId= round trip to Apps Script actually resolved --
     measured 5+ seconds on a live cell, sometimes longer. A reviewer clicking Next every second or
     two would see a permanently empty panel, never wait long enough to see it appear. Calling it
     here, BEFORE the fetch even starts, paints the headline instantly from whatever
     window.CUR_CELLTYPE_DISPLAY already holds (set synchronously by showNucleus()/showCell(),
     already reset for this new cell by the time loadCommunityReports() runs -- see the
     CUR_MICRONS_NAME/CUR_COMMUNITY_TOP_NAME reset in showCell()/showNucleus()). The two later
     calls (once the fetch resolves, and again once a community name wins) then upgrade it from
     "not yet identified" to a real name as that data arrives -- this call is what makes the
     panel non-empty on the very first render instead of only after a slow network round trip. */
  if(typeof renderStepVotePanel==="function")renderStepVotePanel();
  const stale=function(){return PANEL_CUR_NID!==String(nid);};
  fetch(REPORT_ENDPOINT+"?nucleusId="+encodeURIComponent(nid)+panelDsQS())
    .then(r=>r.json())
    .then(d=>{
      if(stale())return;                 // the user moved on while this was in flight
      const reports=(d&&d.reports)||[];
      const mergedGroups=(d&&d.mergedGroups)||[];
      const notNucleusReports=(d&&d.notNucleusReports)||[];
      const organelleGroups=(d&&d.organelleGroups)||[];
      window.CUR_COMMUNITY_IDS=Array.from(new Set(reports.map(function(r){return r.identified;}).filter(Boolean).map(String)));
      try{var _myn=String((typeof REPORTER_NAME!=="undefined"&&REPORTER_NAME)||"").trim().toLowerCase();var _mine={};if(_myn){reports.forEach(function(r){if(r&&r.identified&&String(r.reporterName||"").trim().toLowerCase()===_myn)_mine[String(r.identified).toLowerCase()]=1;});}window.MY_PROPOSED_IDS=_mine;}catch(_mp){window.MY_PROPOSED_IDS={};}
      if(typeof loadIdentityVotesPanel==="function")loadIdentityVotesPanel(nid,window.__idvBase||[]);
      /* Placed BEFORE the early-return just below so it always fires, whether or not this
         nucleus has any community reports -- CUR_COMMUNITY_TOP_NAME may still be null at this
         point (set further down, only if ranked.length), which is correct: renderStepVotePanel()
         just shows the "Original (MICrONS)" row alone in that case. Re-called again after
         ranked/win resolves below when there IS a winning community name, so the panel never has
         to guess -- it always reflects window.CUR_MICRONS_NAME/CUR_COMMUNITY_TOP_NAME as of the
         moment it's called. */
      if(typeof renderStepVotePanel==="function")renderStepVotePanel();
      if(!reports.length&&!mergedGroups.length&&!notNucleusReports.length&&!organelleGroups.length)return;
      let html="";
      if(reports.length){
        /* CONSENSUS NAMING. Previously this was a flat tally -- "3 reports: Astrocyte (2 users),
           Microglia (1 user)" -- which said what had been proposed but never which name the cell
           actually carries, and credited nobody. Per Søren: the first person to identify an
           unclassified cell names it and is credited; if others later propose a different type,
           the name follows whichever type has the most reports, showing that count and crediting
           whoever proposed THAT name first; the remaining proposals stay visible underneath with
           their own counts.

           Ties are broken by whichever name was proposed earliest, so a newcomer drawing level
           with the standing name does not silently take it over -- it takes strictly more support
           to rename a cell than to keep it. Reports with a blank identity (location-only
           submissions) are excluded from the naming race but still counted in the total, since
           they are deliberately not a claim about type. */
        const norm=s=>String(s||"").trim();
        const named=reports.filter(r=>norm(r.identified));
        const groups={};
        for(const rep of named){
          const k=norm(rep.identified);
          const t=Date.parse(rep.timestamp||"")||Number.MAX_SAFE_INTEGER;
          if(!groups[k])groups[k]={name:k,n:0,cert:0,firstTs:t,firstBy:norm(rep.reporterName)};
          groups[k].n++;
          groups[k].cert+=(Number(rep.certainty)||0);
          if(t<groups[k].firstTs){groups[k].firstTs=t;groups[k].firstBy=norm(rep.reporterName);}
        }
        // Winner = most reports; ties broken by higher summed certainty (1-5 per report), then by
        // whoever proposed the name earliest, so a level newcomer with less-confident reports does
        // not take over the standing name.
        const ranked=Object.keys(groups).map(k=>groups[k])
          .sort((a,b)=>b.n-a.n||b.cert-a.cert||a.firstTs-b.firstTs);
        const credit=g=>g.firstBy?' &mdash; first proposed by '+escHtml(g.firstBy):' &mdash; first proposer not named';
        const users=n=>n+' '+(n>1?'users':'user');
        if(ranked.length){
          const win=ranked[0];
          window.CUR_COMMUNITY_TOP_NAME=win.name; // see CUR_COMMUNITY_TOP_NAME's reset comment in showNucleus() -- feeds the step-through vote panel
          if(typeof renderStepVotePanel==="function")renderStepVotePanel();
          /* Promote the winning name to the cell's HEADLINE when the cell was otherwise
             unclassified -- the point of letting the first reporter name a cell is that the cell
             then carries that name, not that it stays "Unclassified" with the name in small print
             underneath. Only ever applied where showNucleus marked the headline as unclassified
             (see data-unclassified there), so a real MICrONS prediction is never silently
             overwritten by community votes. The "no prediction" tag is rewritten at the same time,
             otherwise the cell would show a name and a tag denying one exists. */
          const headEl=document.getElementById("ctHeadline");
          if(headEl&&win){
            var wasUncl=headEl.dataset.unclassified==="1";
            var micronsName=headEl.dataset.micronsName||"";
            /* A "confirm-only" cell -- MICrONS DID make a prediction, and the winning community
               name is exactly that prediction (everyone who reported it just agreed with
               MICrONS). This is not an override, so the headline keeps showing "MICrONS
               prediction" rather than being relabelled "community identification", which would
               wrongly imply the name came from users overriding MICrONS rather than confirming
               it. Per Søren: confirming a prediction should still say what MICrONS predicted. */
            var isConfirmOnly=!wasUncl&&micronsName&&micronsName.toLowerCase()===String(win.name).toLowerCase();
            if(isConfirmOnly){
              var smallEl=headEl.querySelector("small");
              if(smallEl)smallEl.textContent="MICrONS prediction \u2014 confirmed by "+users(win.n);
              headEl.title=(headEl.title?headEl.title+" \u2014 ":"")+users(win.n)+" confirmed this matches MICrONS\u2019s prediction"+(win.firstBy?", first confirmed by "+win.firstBy:"")+".";
            } else {
              headEl.innerHTML=(typeof celltypeLink==="function"?celltypeLink(cellPos,escHtml(win.name)):escHtml(win.name))
                +((typeof favStarHtml==="function"&&cellPos)?favStarHtml(nid,"",cellPos[0],cellPos[1],cellPos[2]):"")
                +' <small>community identification</small>';
              /* Keep the PowerPoint/3D-model export's title in sync with this override -- it reads
                 window.CUR_CELLTYPE_DISPLAY, which showNucleus() sets synchronously before this
                 community-report fetch resolves, so without this line the export would keep
                 showing "Unclassified" (or the old MICrONS name) after the on-screen headline has
                 already moved on to the community's "ruling" identification. Per Søren, 28 Jul 2026. */
              window.CUR_CELLTYPE_DISPLAY=win.name;
              if(typeof refreshFavStars==="function")refreshFavStars();try{if(window.CUR_POS){var _k=window.CUR_POS.join(",");for(var _i=0;_i<SEARCH_HISTORY.length;_i++){if(SEARCH_HISTORY[_i].key===_k)SEARCH_HISTORY[_i].label=win.name;}renderSearchHistory();}}catch(_e2){}
              headEl.title=win.n+(win.n>1?" users have":" user has")+" identified this cell"
                +(win.firstBy?", first proposed by "+win.firstBy:"")
                +(wasUncl?". MICrONS made no prediction here.":". Shown in place of the MICrONS prediction — user reports take precedence here.");
              const tagEl=document.getElementById("ctTag");
              if(tagEl){
                tagEl.textContent="community identification";
                tagEl.title=(wasUncl?"Named by users of this tool, not by MICrONS — MICrONS has no prediction for this nucleus.":"Named by users of this tool and shown in place of the MICrONS prediction — user reports take precedence.")+" The name shown is whichever identification has the most reports; see the breakdown below.";
              }
            }
          }
          html+='<span style="color:var(--accent)">&#128172; Community name: <b>'+escHtml(win.name)+'</b> &mdash; '
            +users(win.n)+credit(win)+'.</span>';
          if(ranked.length>1){
            const others=ranked.slice(1).map(g=>escHtml(g.name)+' ('+users(g.n)+(g.firstBy?', first by '+escHtml(g.firstBy):'')+')');
            html+='<br><span class="meta">Also proposed: '+others.join('; ')+'.</span>';
          }
        }
        const locOnly=reports.length-named.length;
        if(locOnly)html+=(html?'<br>':'')+'<span class="meta">'+users(locOnly)+' logged this cell without proposing a type.</span>';
      }
      /* Merged-split reports are shown separately from the identity tally above -- each group
         is one reporter's claim that this single MICrONS detection is actually N distinct
         nuclei, with their guesses at each sub-nucleus's identity. Folding these into the
         same counts as normal single-cell reports would misrepresent both. */
      if(mergedGroups.length){
        const lines=mergedGroups.map(g=>{
          const idents=g.subs.map(s=>s.identified||"unsure").join(", ");
          return (g.subCount||g.subs.length)+" nuclei ("+idents+")";
        });
        html+=(html?"<br>":"")+'<span style="color:var(--warn)">&#9888; '+mergedGroups.length+' '+(mergedGroups.length>1?"users report":"user reports")+' this detection is actually merged &mdash; '+lines.join("; ")+'.</span>';
      }
      /* "Not a nucleus" flags -- shown as their own distinct warning, separate from both the
         identity tally and the merged-split warning above, since this is a different claim
         entirely (false detection, not "wrong type" or "actually N nuclei"). */
      if(notNucleusReports.length){
        const withComments=notNucleusReports.filter(r=>r.comment).map(r=>r.comment);
        html+=(html?"<br>":"")+'<span style="color:var(--warn)">&#9888; '+notNucleusReports.length+' '+(notNucleusReports.length>1?"users flag":"user flags")+' this as not a real nucleus (segmentation artifact)'+(withComments.length?" &mdash; "+withComments.join("; "):"")+'.</span>';
      }
      /* Centriole/cilium ("organelle_location") reports -- previously write-only, never shown
         back to anyone. Each group is one report submission (subCount structures, each with its
         own kind + pointA/pointB voxel coords -- see doGet's organelleGroups above). The summary
         line rolls up a "N centrioles, M cilia" count across every submission for this nucleus;
         below it, each individual structure gets its own row with the actual reported
         coordinate(s) (not just the count) plus a Jump button, since knowing THAT someone
         reported a centriole isn't as useful as being able to go look at where. */
      let organRowsHtml="";
      if(organelleGroups.length){
        const allStructs=[].concat(...organelleGroups.map(g=>(g.structures||[]).map(s=>({kind:s.kind,pointA:s.pointA,pointB:s.pointB}))));
        const parts=organelleCountParts(allStructs);
        const comments=organelleGroups.filter(g=>g.comment).map(g=>g.comment);
        html+=(html?"<br>":"")+'<span style="color:var(--accent)">&#128172; '+organelleGroups.length+' '+(organelleGroups.length>1?"users have":"user has")+' logged organelle locations for this cell'+(parts.length?" &mdash; "+parts.join(", "):"")+(comments.length?" ("+comments.join("; ")+")":"")+'.</span>';
        organRowsHtml=organelleStructRowsHtml(allStructs);
      }
      /* Entry point for proposing a centriole/cilium location from the CELL PANEL. Until now the
         only way in was to run the guided identification through to a result screen, which meant
         anyone who merely disagreed with where an existing centriole/cilium had been placed had to
         re-identify the cell first just to say so. Per Søren, suggesting a different location has
         to be possible on its own. Every submission is stored as its own group server-side and
         they are all listed above with their coordinates, so a second opinion sits alongside the
         first rather than overwriting it -- nothing here has to change for a disagreement to be
         recorded, only the way in.

         Its own ids (commOrganelle*) rather than the guided-ID screen's idfOrganelleToggle /
         organelleInlineBody: both panels can be in the DOM at once, and duplicate ids would leave
         only one of them correctly wired -- the same trap already documented for
         organReporterInput vs reporterInput. */
      const already=organelleGroups.length;
      html+=(html?'<br>':'')+'<span class="hint">'
        +(already?'Think an organelle sits somewhere else? ':'Know where an organelle sits on this cell? ')
        +'<span class="idf-back" id="commOrganelleToggle" style="margin:0">'
        +(already?'Suggest a different location':'Report an organelle')+' &rarr;</span></span>'
        +'<div id="commOrganelleBody" style="display:none;margin-top:10px;border-top:1px dashed var(--line);padding-top:10px"></div>';
      el.innerHTML=html+organRowsHtml;
      const cTog=el.querySelector("#commOrganelleToggle"),cBody=el.querySelector("#commOrganelleBody");
      if(cTog&&cBody){
        let cWired=false;
        cTog.addEventListener("click",()=>{
          const showing=cBody.style.display!=="none";
          if(showing){cBody.style.display="none";cTog.innerHTML=(already?"Suggest a different location":"Report an organelle")+" &rarr;";return;}
          cBody.style.display="";cTog.innerHTML="Hide organelle form &uarr;";
          if(!cWired){
            /* The form reads ID_CTX for the nucleus/root/coordinate it should file against. Coming
               from here there has been no guided-ID run to populate it, so it is seeded from the
               cell currently on screen -- and with no leaf slug, since viewing a cell is not a
               claim about its type. */
            ID_CTX={nucId:((typeof CUR_NUCID!=="undefined"&&CUR_NUCID)||nid||""),root:((typeof CUR_ROOT!=="undefined"&&CUR_ROOT)||""),pos:cellPos||null};
            cBody.innerHTML=organelleFormHtml(null);wireOrganelleForm(cBody,null);cWired=true;
          }
        });
      }
      /* .jumpview buttons here (from organelleStructRowsHtml) are wired globally via delegation
         (see the document-level ".jumpview" listener near neuroglancerLinkForPos()), so nothing
         extra is needed for them even though this fetch resolves asynchronously. Coordinate
         copy-pills (.idval) aren't delegated, though, since a duplicate click-to-copy binding
         from a later, unrelated .idval pass elsewhere wouldn't be harmless the way a jump binding
         is -- so those still need wiring here, scoped to just this div. */
      el.querySelectorAll(".idval").forEach(sp=>sp.addEventListener("click",()=>{navigator.clipboard&&navigator.clipboard.writeText(sp.dataset.c);const o=sp.textContent;sp.textContent="copied";setTimeout(()=>sp.textContent=o,900);}));
    })
    .catch(()=>{});
}

/* ==== organelle report form (inline, repeatable rows)  (was ujump.html lines 7709-7921) ==== */
/* ---------- Organelle reporting (centriole, cilium, and 14 other single-point structures) ----------
   Used to be its own full-screen replacement of #idfpanel (renderOrganelleReport), which meant
   "back one step" was needed to return to the cell-type result -- Søren asked for this to stay
   inline instead, so the identification never leaves the screen while logging organelle
   locations. Now organelleFlagHtml() renders an expand/collapse toggle plus an initially-empty,
   hidden container right inside renderResult()'s own HTML; the form itself (organelleFormHtml)
   is only built and wired (wireOrganelleForm) the first time it's expanded, and simply
   shows/hides on later clicks rather than re-rendering.
   Because this form can now be open AT THE SAME TIME as the result screen's own "want credit
   for this ID" identity block (see renderResult()), its reporter-identity field/button/thanks
   note use their OWN ids (organReporterInput/organGsiButton/organThanks) instead of reusing
   reporterInput/gsiButton/idfThanks -- those are already taken by the result screen when it's
   showing its own identity block, and duplicate ids would mean only one of the two ever gets
   wired correctly. */
function organelleFlagHtml(){
  return '<div class="idf-organelle" style="margin-top:10px"><span class="hint">Also want to log an organelle\'s location on this cell? <span class="idf-back" id="idfOrganelleToggle" style="margin:0">Report an organelle &rarr;</span></span>'
    +'<div id="organelleInlineBody" style="display:none;margin-top:10px;border-top:1px dashed var(--line);padding-top:10px"></div></div>';
}
function wireOrganelleFlag(slug){
  const toggle=document.getElementById("idfOrganelleToggle"),body=document.getElementById("organelleInlineBody");
  if(!toggle||!body)return;
  let wired=false;
  toggle.addEventListener("click",()=>{
    const showing=body.style.display!=="none";
    if(showing){
      body.style.display="none";
      toggle.innerHTML="Report an organelle &rarr;";
      return;
    }
    body.style.display="";
    toggle.innerHTML="Hide organelle form &uarr;";
    if(!wired){body.innerHTML=organelleFormHtml(slug);wireOrganelleForm(body,slug);wired=true;}
  });
}
function organelleFormHtml(slug){
  const name=(slug&&typeof LEAF_NAMES!=="undefined")?LEAF_NAMES[slug]:null;
  let h='<p class="hint">Mark where an organelle or extracellular structure sits on this cell — centriole, primary cilium, or any of the others in the topic-organized list below. Add one row per structure — mix and match freely, and log more than one of the same kind if the cell has more than one (e.g. two centrioles, or several mitochondria).</p>';
  h+='<div class="meta">'+(name?"Identified as: <b>"+name+"</b> &middot; ":"")+(ID_CTX.nucId?"nucleus "+ID_CTX.nucId:"no nucleus ID on file")+(ID_CTX.root?" &middot; root "+ID_CTX.root:"")+(ID_CTX.pos?" &middot; voxel ("+coordSpan(ID_CTX.pos[0],ID_CTX.pos[1],ID_CTX.pos[2])+")":"")+'</div>';
  h+='<div id="organRows"></div>';
  h+='<button type="button" class="idbtn" id="organAddRow" style="margin-top:8px;padding:6px 10px;font-size:13px;width:auto">+ Add another structure</button>';
  h+='<label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin-top:14px">Comments (optional)</label>'
    +'<textarea id="organComment" placeholder="e.g. cilium is short / hard to trace to a clear tip..."></textarea>';
  if(!GOOGLE_VERIFIED){
  h+='<div class="idf-identity" style="margin-top:10px"><label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin-bottom:4px">Want credit for this report, or a heads-up if it&rsquo;s confirmed? <span class="gate-note" style="text-transform:none;letter-spacing:normal;color:var(--accent)">— Google sign-in required to submit</span></label>'
    +'<input type="text" id="organReporterInput" placeholder="name or email" value="'+(REPORTER_EMAIL||REPORTER_NAME||"").replace(/"/g,'&quot;')+'" style="width:100%;margin-bottom:6px">'
    +'<div id="organGsiButton"></div></div>';
  } else {
    h+='<div class="meta" style="margin-top:8px;color:var(--accent)">Submitting as '+escHtml(REPORTER_EMAIL||REPORTER_NAME)+' &mdash; signed in with Google.</div>';
  }
  h+='<div class="idf-actions"><button class="idbtn idbtn-submit" id="organSubmit">Submit organelle report</button></div>'
    +'<div id="organThanks"></div>';
  return h;
}
function wireOrganelleForm(container,slug){
  const name=(slug&&typeof LEAF_NAMES!=="undefined")?LEAF_NAMES[slug]:null;
  const rin=container.querySelector("#organReporterInput");
  if(rin){rin.addEventListener("change",()=>{if(typeof saveReporterFromInput==="function")saveReporterFromInput(rin.value.trim());});if(typeof initGSI==="function")initGSI(10,"organGsiButton");}
  const rowsEl=container.querySelector("#organRows");
  function renumberRows(){
    [...rowsEl.children].forEach((row,i)=>{const n=row.querySelector(".organ-row-num");if(n)n.textContent=String(i+1);});
  }
  /* focusAfter (optional) is only passed for the cilium base row's x field: pasting a full
     "x, y, z" string there fills all three base fields in one go, so the next thing worth typing
     is almost always the tip, not tabbing through the now-already-filled base y/z fields --
     jumping focus straight to the tip's x field means either pasting the tip coordinate
     immediately, or pressing Tab from there naturally walks tip x -> y -> z -> Jump, instead of
     back through the base fields. Left unset everywhere else (centriole row, tip row itself),
     so their tab order is untouched. */
  function wirePasteSplit(xEl,yEl,zEl,focusAfter){
    xEl.addEventListener("input",e=>{
      const p=e.target.value.split(/[\s,]+/).filter(s=>s!=="");
      if(p.length>=3){e.target.value=p[0];yEl.value=p[1];zEl.value=p[2];if(focusAfter)focusAfter.focus();}
    });
  }
  // These rows are draft centriole/cilium points on the SAME cell already on screen -- opens
  // Neuroglancer directly at the row's coordinate (see the ".jumpview" comment near
  // neuroglancerLinkForPos()), keeping CUR_ROOT/CUR_NUCID as they are rather than re-running the
  // search and losing the in-progress report form.
  function wireJump(btn,xEl,yEl,zEl){
    btn.addEventListener("click",()=>{
      const x=xEl.value,y=yEl.value,z=zEl.value;
      if(x===""||y===""||z===""){alert("Fill in x, y and z first.");return;}
      const url=(typeof neuroglancerLinkForPos==="function")?neuroglancerLinkForPos([+x,+y,+z]):null;
      if(url)window.open(url,"_blank","noopener");
    });
  }
  function addRow(){
    // The very first row defaults to "Centriole / centrosome" (the more common starting point).
    // Every row added afterward via "+ Add another structure" defaults to "Primary cilium"
    // instead -- in practice a centriole is annotated first and the cilium right after (they're
    // the same organelle system, base of a cilium sits at a centriole), so this saves a manual
    // dropdown change on the row that's added second almost every time. Still just a default --
    // the dropdown itself is unrestricted, so a second centriole or a third structure can always
    // be switched back.
    const isFirstRow=rowsEl.children.length===0;
    const row=document.createElement("div");
    row.className="merged-row";
    row.style.cssText="border:1px solid var(--line);border-radius:6px;padding:10px;margin-top:8px";
    row.innerHTML=
      '<div class="row" style="justify-content:space-between;align-items:center">'
      +'<span style="font-size:12px;color:var(--mut)">Structure <span class="organ-row-num"></span></span>'
      +'<button type="button" class="organ-row-remove" style="background:none;border:none;color:var(--mut);cursor:pointer;font-size:16px;line-height:1;padding:0 4px" title="Remove this structure">&times;</button>'
      +'</div>'
      +'<label style="display:block;font-size:11px;color:var(--mut);margin-top:6px">What is this?</label>'
      +'<select class="organ-row-kind" style="width:100%">'+ORGANELLE_KIND_OPTIONS_HTML+'</select>'
      +'<div class="organ-centriole-fields" style="margin-top:6px">'
      +'<label style="display:block;font-size:11px;color:var(--mut)">Approx. location (voxel)</label>'
      +'<div class="row" style="gap:8px;margin-top:2px">'
      +'<div class="coord"><input type="text" class="orx" inputmode="decimal" placeholder="x"></div>'
      +'<div class="coord"><input type="text" class="ory" inputmode="decimal" placeholder="y"></div>'
      +'<div class="coord"><input type="text" class="orz" inputmode="decimal" placeholder="z"></div>'
      +'<button type="button" class="idbtn organ-jump-c" style="padding:4px 10px;font-size:12px;width:auto">Jump &#8599;</button>'
      +'</div></div>'
      +'<div class="organ-cilium-fields" style="margin-top:6px;display:none">'
      +'<label class="organ-point-label-a" style="display:block;font-size:11px;color:var(--mut)">Base (voxel)</label>'
      +'<div class="row" style="gap:8px;margin-top:2px">'
      +'<div class="coord"><input type="text" class="orbx" inputmode="decimal" placeholder="x"></div>'
      +'<div class="coord"><input type="text" class="orby" inputmode="decimal" placeholder="y"></div>'
      +'<div class="coord"><input type="text" class="orbz" inputmode="decimal" placeholder="z"></div>'
      +'<button type="button" class="idbtn organ-jump-base" style="padding:4px 10px;font-size:12px;width:auto">Jump &#8599;</button>'
      +'</div>'
      +'<label class="organ-point-label-b" style="display:block;font-size:11px;color:var(--mut);margin-top:6px">Tip (voxel)</label>'
      +'<div class="row" style="gap:8px;margin-top:2px">'
      +'<div class="coord"><input type="text" class="ortx" inputmode="decimal" placeholder="x"></div>'
      +'<div class="coord"><input type="text" class="orty" inputmode="decimal" placeholder="y"></div>'
      +'<div class="coord"><input type="text" class="ortz" inputmode="decimal" placeholder="z"></div>'
      +'<button type="button" class="idbtn organ-jump-tip" style="padding:4px 10px;font-size:12px;width:auto">Jump &#8599;</button>'
      +'</div></div>'
      +'<p class="hint" style="margin-top:2px">Paste "x, y, z" into an x field — it splits automatically.</p>';
    rowsEl.appendChild(row);
    row.querySelector(".organ-row-remove").addEventListener("click",()=>{
      if(rowsEl.children.length<=1){alert("At least one structure is needed — remove the whole report by collapsing this section instead if that’s not what you meant to report.");return;}
      row.remove();renumberRows();
    });
    const kindEl=row.querySelector(".organ-row-kind");
    const centrioleFields=row.querySelector(".organ-centriole-fields"),ciliumFields=row.querySelector(".organ-cilium-fields");
    const pointLabelA=row.querySelector(".organ-point-label-a"),pointLabelB=row.querySelector(".organ-point-label-b");
    // isCilium really means "is this kind the vector (two-point) shape" -- checked via
    // ORGANELLE_KIND_BY_VALUE[...].vector rather than a hardcoded ==="cilium" so a future vector
    // kind (if one's ever added to ORGANELLE_KINDS) automatically gets the two-point fields too,
    // with zero changes needed here. Cilium was the only vector kind for a long time; since
    // 2026-08-07 nucleoplasmic_reticulum_2 is the 2nd, which is exactly why the two field labels
    // are no longer hardcoded "Base"/"Tip" -- organReportPointLabels() reads each kind's own
    // pointLabels (cilium: Base/Tip, NR type II: Coordinate 1/Coordinate 2).
    kindEl.addEventListener("change",()=>{
      const info=ORGANELLE_KIND_BY_VALUE[kindEl.value];
      const isCilium=!!(info&&info.vector);
      centrioleFields.style.display=isCilium?"none":"";
      ciliumFields.style.display=isCilium?"":"none";
      const pl=organReportPointLabels(kindEl.value);
      if(pointLabelA)pointLabelA.textContent=pl[0]+" (voxel)";
      if(pointLabelB)pointLabelB.textContent=pl[1]+" (voxel)";
    });
    /* First row defaults to Centriole, every row added after that defaults to Primary cilium, per
       Søren's explicit request -- previously relied on "centriole" simply being the browser's
       default first <option>, which broke silently once "ask_expert" became the true first entry
       in ORGANELLE_KINDS (2026-08-06). Now set explicitly on BOTH branches so this default no
       longer depends on list ordering at all. */
    if(isFirstRow){
      kindEl.value="centriole";
    }else{
      kindEl.value="cilium";
      centrioleFields.style.display="none";
      ciliumFields.style.display="";
    }
    const cx=row.querySelector(".orx"),cy=row.querySelector(".ory"),cz=row.querySelector(".orz");
    const bx=row.querySelector(".orbx"),by=row.querySelector(".orby"),bz=row.querySelector(".orbz");
    const tx=row.querySelector(".ortx"),ty=row.querySelector(".orty"),tz=row.querySelector(".ortz");
    wirePasteSplit(cx,cy,cz);wireJump(row.querySelector(".organ-jump-c"),cx,cy,cz);
    wirePasteSplit(bx,by,bz,tx);wireJump(row.querySelector(".organ-jump-base"),bx,by,bz);
    wirePasteSplit(tx,ty,tz);wireJump(row.querySelector(".organ-jump-tip"),tx,ty,tz);
    renumberRows();
  }
  addRow();
  container.querySelector("#organAddRow").addEventListener("click",()=>addRow());
  const submitBtn=container.querySelector("#organSubmit");
  submitBtn.addEventListener("click",()=>{
    if(!REPORT_ENDPOINT){alert("Reporting isn't wired up yet — set REPORT_ENDPOINT near the top of the script (see the comment above it) to a Google Apps Script web app URL.");return;}
    const rows=[...rowsEl.children];
    let allFilled=true;
    const subs=rows.map(row=>{
      const kind=row.querySelector(".organ-row-kind").value;
      const info=ORGANELLE_KIND_BY_VALUE[kind];
      if(info&&info.vector){
        const bx=row.querySelector(".orbx").value.trim(),by=row.querySelector(".orby").value.trim(),bz=row.querySelector(".orbz").value.trim();
        const tx=row.querySelector(".ortx").value.trim(),ty=row.querySelector(".orty").value.trim(),tz=row.querySelector(".ortz").value.trim();
        if(bx===""||by===""||bz===""||tx===""||ty===""||tz==="")allFilled=false;
        return{kind,pointA:bx+","+by+","+bz,pointB:tx+","+ty+","+tz};
      }
      const x=row.querySelector(".orx").value.trim(),y=row.querySelector(".ory").value.trim(),z=row.querySelector(".orz").value.trim();
      if(x===""||y===""||z==="")allFilled=false;
      return{kind,pointA:x+","+y+","+z,pointB:""};
    });
    if(!allFilled){alert("Please fill in every coordinate field for each structure listed (both points for a cilium or NR type II).");return;}
    const commentEl=container.querySelector("#organComment");
    const comment=commentEl?commentEl.value.trim():"";
    const path=((typeof ID_PATH!=="undefined"&&ID_PATH)||[]).map(n=>((typeof TREE!=="undefined"&&TREE[n])?TREE[n].q:n)).join(" > ");
    const groupId=(ID_CTX.nucId||"nonuc")+"_"+Date.now()+"_org";
    submitBtn.disabled=true;submitBtn.textContent="submitting…";
    subs.forEach((s,i)=>postReport({
      type:"organelle_location",
      timestamp:new Date().toISOString(),
      nucleusId:ID_CTX.nucId||"",rootId:ID_CTX.root||"",
      coord:ID_CTX.pos?ID_CTX.pos.join(","):"",
      groupId,subIndex:i+1,subCount:subs.length,
      kind:s.kind,pointA:s.pointA,pointB:s.pointB,
      identified:(typeof canonSubmitName==="function"?canonSubmitName(name):name)||"",
      comment,path
    }));
    submitBtn.textContent="submitted";
    container.querySelector("#organThanks").innerHTML='<div class="idf-flag" style="border-color:var(--accent);color:var(--accent);margin-top:10px">Thanks — '+subs.length+' structure'+(subs.length>1?"s":"")+' logged against this cell.</div>';
  });
}
