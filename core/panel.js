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
/* ── ONE LOGGED POINT PER ORGANELLE, NOT ONE PER ROW ────────────────  2026-09-19
   Søren: *"it has not been fixed that it says there are 6x lysosomes, when there are only really
   3."* Three outlines, each of which had registered its centre twice, counted as six organelles.

   `fromStructureId` names the outline a centre was computed from, so two rows carrying the same one
   are the same organelle written down twice and the later supersedes -- which is the rule the
   backend now enforces on new writes. Applied here as well, the old rows in the sheet stop being
   counted twice without anybody having to tidy them first.

   BLANK IS NOT A KEY. Hand-placed annotations and everything written before 2026-09-18 carry no
   fromStructureId, and they are all kept: two people pointing at the same lysosome by eye are two
   opinions, and agreeing is the measurement. Only rows this one feature wrote can collapse.

   THE LAST ONE WINS, because the sheet is append-only and the newest row is the current answer --
   the same rule as centreRowFor_ at the other end. */
/* ── WHICH OUTLINE A LOGGED POINT CAME FROM ────────────────────────  2026-09-19
   Two columns have carried this, and Søren's own six rows are in the older one. `source` held the
   outline's id when the feature was first written; it was then repurposed to say what KIND of
   source a point has -- "segmentation" as against somebody's eye -- and `fromStructureId` was added
   for the id. Rows written in between keep the id in `source` and nothing in `fromStructureId`.

   A SHAPE, NOT A GUESS. Our ids are a slug, an underscore, a millisecond timestamp and optionally
   `__iN` suffixes. "segmentation" and "hand" cannot match that, and neither can a blank. So a
   `source` that looks like an id is read as one, and anything else is left alone. */
function organelleFromId(s){
  var f = String((s && s.fromStructureId) || "");
  if (f) return f;
  var src = String((s && s.source) || "");
  return /^[A-Za-z0-9-]+_\d{6,}(__i\d+)*$/.test(src) ? src : "";
}
/* And a point whose source is an id came FROM an outline, whatever the word in the column says --
   which is what decides whether an outline supersedes it or the panel lists them side by side. */
function organelleIsFromOutline(s){
  var src = String((s && s.source) || "");
  return !!(/segment/i.test(src) || organelleFromId(s));
}
function organelleOwnStructs(groups){
  var out = [], at = {};
  (groups || []).forEach(function(g){
    ((g && g.structures) || []).forEach(function(s){
      if (!s) return;
      var one = { kind: s.kind, pointA: s.pointA || "", pointB: s.pointB || "",
                  comment: s.comment || (g && g.comment) || "",
                  source: s.source || "",
                  fromStructureId: organelleFromId(s),
                  by: s.by || (g && g.by) || "" };
      var key = one.fromStructureId;
      if (key && at[key] !== undefined){ out[at[key]] = one; return; }
      if (key) at[key] = out.length;
      out.push(one);
    });
  });
  return out;
}
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
/* ── WHAT AN OUTLINE'S CENTRE ROW SAYS ─────────────────────────────────────────  2026-09-19
   Søren: *"We need to have the details in an expandable menu, where they are written in a more
   organised manner."*

   The size and the name it was outlined under live only in the comment -- the row's own columns
   never carried them -- and that comment is written by tracingRegisterCentre in this project, so
   this is reading back our own sentence rather than somebody else's prose. Anything it cannot read
   is left out: a shorter row is a row, an invented one is a bug. */
function organelleCentreBits(comment){
  var s = String(comment || "");
  if (!/registered from the segmentation/i.test(s)) return null;
  var out = { name: "", size: "", sections: "" };
  var m = /outlined\s+[\u201c"]([^\u201d"]+)[\u201d"]/.exec(s);
  if (m) out.name = m[1];
  var v = /\(([\d.eE+-]+)\s*\u00b5m\u00b3(?:,\s*(\d+)\s*sections?)?\)/.exec(s);
  if (v){ out.size = v[1]; out.sections = v[2] || ""; }
  return out;
}
function organelleStructRowsHtml(structs){
  const parsePt=s=>{const p=(s||"").split(",").map(Number);return(p.length===3&&p.every(n=>!isNaN(n)))?p:null;};
  /* The second argument is the organelle the row is about, when there is one: organJump's
     reasons, one file-section up, and the same dataset attributes so the one capture listener
     picks up both kinds of row. */
  const jumpBtn=(p,t)=>'<button type="button" class="jumpview" data-x="'+p[0]+'" data-y="'+p[1]+'" data-z="'+p[2]+'"'
    +((t&&t.structureId)?' data-sid="'+escHtml(String(t.structureId))+'"':"")
    +((t&&!t.structureId&&t.name)?' data-mark="1"':"")
    +((t&&t.name)?' data-name="'+escHtml(String(t.name))+'"':"")
    +' style="margin-left:6px;padding:2px 8px;font-size:11px">Jump</button>';
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
    if(!pa)return"";
    /* ONE ROW, IN COLUMNS: what it is, how big it is, where it is. The paragraph this replaces had
       all three and no shape; six of them had three shapes and no paragraph anybody could read. */
    const bits=organelleCentreBits(s.comment);
    const named=(bits&&bits.name)?bits.name:capLabel;
    const size=(bits&&bits.size)
      ?('<span class="hint" style="margin-left:8px">'+bits.size+' \u00b5m\u00b3'
        +(bits.sections?(' \u00b7 '+bits.sections+' sections'):'')+'</span>')
      :'';
    /* Where it came from, once, quietly. A centre computed from an outline is a different KIND of
       claim from a point somebody placed by eye, and the panel already prefers the first. */
    const from=(bits||/segment/i.test(String(s.source||"")))
      ?'<span class="hint" style="margin-left:8px">from the outline</span>'
      :(s.by?'<span class="hint" style="margin-left:8px">by '+escHtml(String(s.by))+'</span>':'');
    return '<div class="meta" style="margin-top:4px;display:flex;align-items:baseline;gap:4px;'
      +'flex-wrap:wrap"><span>'+escHtml(named)+'</span>'+size+from
      +'<span style="flex:1 1 auto"></span><span>('+coordSpan(pa[0],pa[1],pa[2])+')</span>'
      +jumpBtn(pa,{structureId:s.fromStructureId||"",name:named})+'</div>';
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
/* RETIRED, 2026-08-20 (6th pass on the step-through-identity thread). This used to render a
   read-only summary + a simplified up/down vote widget into #stepVotePanel under the step-through
   card. Søren, after seeing it: "I just want a copy... it should just show the same there as in
   Jump ... We should not make something parallel." That #stepVotePanel div no longer exists in
   any host page (µJump/βJump/δJump all removed it -- see each build's own note) -- instead the
   REAL cell panel (#nucpanel or βJump's #panel) is physically relocated under the step-through
   card while stepping (core/stepthrough.js's "3. Full-panel relocation"), so there's exactly one
   identity/voting/correction UI to keep working, not two. This function is left defined, unused
   and uncalled, only so a stray external reference doesn't throw -- delete it outright once
   nothing in any host page mentions it any more. Do not add new calls to it. */
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
/* ── WHAT HAS BEEN TRACED ON THIS CELL ─────────────────────────────────────────  2026-09-17
   Søren, asking for organelle numbers: *"...also when shown on the cell identity page."*

   A number distinguishes things only where they are listed together, so this is where the numbers
   earn their keep: every hand-traced structure filed against this cell, in its own colour, with its
   number, its volume and who drew it.

   MATCHED BY EITHER ID. A tracing carries the nucleus id and the root id it was drawn on, and which
   of them is known depends on where the tracer started -- a coordinate inside a process reads a root
   id and nothing in the nucleus volume. Matching on either is the only way to find both.

   NOTHING HERE FETCHES GEOMETRY. The index says the name, the number, the size and the link; the
   contours stay in Drive until somebody opens one in the pad. */
var PANEL_TRACINGS = null, PANEL_TRACINGS_AT = 0;
function tracedOnCellBox(){
  var host = document.getElementById("tracedOnCell");
  if (host) return host;
  var after = document.getElementById("commReports");
  if (!after || !after.parentNode) return null;
  host = document.createElement("div");
  host.id = "tracedOnCell";
  host.style.marginTop = "10px";
  after.parentNode.insertBefore(host, after.nextSibling);
  return host;
}
function loadTracedStructures(nid, root){
  var host = tracedOnCellBox();
  if (!host) return;
  host.innerHTML = "";
  if (typeof REPORT_ENDPOINT === "undefined" || !REPORT_ENDPOINT) return;
  if (!nid && !root) return;
  var render = function(list){
    var mine = (list || []).filter(function(t){
      if (!t) return false;
      /* ORGANELLES MOVED OUT, 2026-09-18. They are listed in the Organelles section below, beside
         the logged points they pair with; listing them here as well would be the same object twice
         on one panel in two vocabularies, which is what that section exists to end. The cell and
         its nucleus stay, because they are the cell rather than something inside it. */
      if (typeof organIsOrganelle === "function" && organIsOrganelle(t)) return false;
      return (nid && String(t.nucleusId || "") === String(nid))
          || (root && String(t.rootId || "") === String(root));
    });
    if (!mine.length){ host.innerHTML = ""; return; }
    /* By kind, then by number: the point of a number is that 1, 2 and 3 of a kind read as a set. */
    mine.sort(function(a, b){
      var ka = String(a.instanceOf || a.kind || ""), kb = String(b.instanceOf || b.kind || "");
      if (ka !== kb) return ka < kb ? -1 : 1;
      return (Number(a.instanceIndex) || 0) - (Number(b.instanceIndex) || 0);
    });
    var vol = function(v){
      if (!(Number(v) > 0)) return "";
      var n = Number(v);
      return " \u00b7 " + (n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toFixed(4))
           + " \u00b5m\u00b3";
    };
    host.innerHTML = '<div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;'
      + 'color:var(--mut);font-weight:600;margin-bottom:4px">Traced on this cell</div>'
      + mine.map(function(t){
          var who = (t.contributors && t.contributors.length) ? t.contributors.join(", ")
                                                              : (t.tracedBy || "");
          return '<div style="display:flex;align-items:center;gap:8px;font-size:12px;'
            + 'border-top:1px solid var(--line);padding:4px 0;flex-wrap:wrap">'
            + '<span style="width:10px;height:10px;border-radius:2px;flex:0 0 auto;background:'
              + panelEsc(t.color || "#3a6b5a") + '"></span>'
            + '<span style="flex:1 1 140px;min-width:0"><b>' + panelEsc(t.name || t.structureId)
              + '</b>' + panelEsc(vol(t.volumeUm3)) + '</span>'
            + '<span style="opacity:.7;flex:0 0 auto">' + (t.contours || 0) + " contour"
              + ((t.contours === 1) ? "" : "s") + " on " + (t.sections || 0) + " section"
              + ((t.sections === 1) ? "" : "s") + '</span>'
            + '<span style="opacity:.7;flex:1 1 100px;min-width:0">' + panelEsc(who) + '</span>'
            + (t.fileUrl ? ' <a href="' + panelEsc(t.fileUrl) + '" target="_blank" rel="noopener" '
                + 'style="opacity:.7">file</a>' : "")
            + '</div>';
        }).join("")
      + '<p class="hint" style="margin-top:4px">Hand-traced, not from the segmentation. Open one in '
      + '\u00b5Jump\u2019s tracing card to add to it or correct it.</p>';
  };
  if (PANEL_TRACINGS && Date.now() - PANEL_TRACINGS_AT < 60000){
    render(PANEL_TRACINGS);
    try { renderOrganelleSection(nid, root); } catch (_e){}
    return;
  }
  fetch(REPORT_ENDPOINT + "?tracings=1" + (typeof panelDsQS === "function" ? panelDsQS() : ""))
    .then(function(r){ return r.json(); })
    .then(function(d){
      PANEL_TRACINGS = (d && d.tracings) || [];
      PANEL_TRACINGS_AT = Date.now();
      render(PANEL_TRACINGS);
      try { renderOrganelleSection(nid, root); } catch (_e){}
    })
    /* Silently. A cell with no tracings and a backend that does not answer this question yet look
       the same from here, and they should: in both cases there is nothing to show. */
    .catch(function(){});
}
function panelEsc(s){ return String(s == null ? "" : s)
  .replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }

/* ── ORGANELLES: WHERE IT IS AND WHAT SHAPE IT IS, IN ONE PLACE ─────────────────  2026-09-18
   Søren: *"Now we have 2 features regarding organelles. First is to annotate their location, second
   is to segment their 3D structure. I would like that the organelles are featured in the cell
   identity as an expandable section where the annotations are coupled with the segmentations where
   the annotation coordinate is within the 3D volume of the segmentation."*

   The two features grew up apart and have never met, which means one cell's mitochondria are listed
   twice on this panel, in two different vocabularies, with no way to tell that the point and the
   outline are the same object. The pairing rule is core/organellelink.js -- written once, so this
   panel, the tracing card and the viewer cannot disagree about it.

   THE TRACED CENTRE IS THE CELL'S ANSWER where there is one. Søren, asked whether a segmentation's
   centre should replace a manual point: *"this should be more precise than the manually annotated,
   so it should replace it."* Nothing is deleted -- the record is append-only and somebody's
   observation is not ours to erase -- so "replace" is a statement about which coordinate this panel
   gives: the traced centre, with the points it supersedes still listed under it, dimmed, with who
   placed them. An observation that turned out to be a little off is still evidence that somebody
   looked.

   TWO FETCHES, ONE SECTION. The annotations arrive with the community reports and the segmentations
   with ?tracings=1, and neither waits for the other. Both call this; it renders with whatever has
   arrived and again when the rest does, so a slow one costs the other nothing. */
var PANEL_ORGAN_ANNS = null, PANEL_ORGAN_NID = "", PANEL_ORGAN_RINGS = {}, PANEL_ORGAN_BUSY = false;
/* ── WHAT THE NEXT JUMP SHOULD SHOW ────────────────────────────────  2026-09-19
   Søren: *"For the jump button here, it would make sense that it shows the organelle."*

   A Jump wrote a coordinate and rebuilt the viewer link for it, with the cell on it and no sign of
   WHICH thing at that coordinate the row was about. The outline is in hand -- the row's volume and
   centre were computed from it -- so it rides along, and the page that builds the link picks it up
   from here.

   ONE CAPTURE-PHASE LISTENER, because .jumpview buttons are wired by three separate handlers in
   this project and a copy of this in each of them is the drift this file keeps warning about. It
   runs before any of them, and a jump button with no organelle on it CLEARS the slot rather than
   leaving the last one armed -- which is what makes it one-shot for every jump, not only ours.

   The rings are copied in HERE rather than looked up later: by the time the link is built the panel
   has been told to render a different cell, and reading a cache mid-rebuild is how an outline ends
   up drawn on the wrong coordinate. */
var ORGAN_SHOW_NEXT = null;
if (typeof document !== "undefined" && !window.__organJumpArmed){
  window.__organJumpArmed = 1;
  document.addEventListener("click", function(ev){
    var b = null;
    try { b = ev.target && ev.target.closest ? ev.target.closest(".jumpview") : null; }
    catch (_e){ b = null; }
    if (!b){ return; }                       // not a jump at all: leave whatever is armed alone
    var sid = (b.dataset && b.dataset.sid) || "";
    /* data-mark: a row that has a logged point and no outline. It still marks the thing, with a
       point annotation, because "which of these blobs" is the question either way -- it just does
       not pretend to a shape nobody has drawn. */
    var mark = !!(b.dataset && b.dataset.mark);
    if (!sid && !mark){ ORGAN_SHOW_NEXT = null; return; }
    var rings = sid ? PANEL_ORGAN_RINGS[sid] : null;
    var pt = [b.dataset.x, b.dataset.y, b.dataset.z].map(Number);
    ORGAN_SHOW_NEXT = { sid: sid, name: b.dataset.name || "", color: b.dataset.color || "",
                        rings: (rings && rings.length) ? rings : null,
                        point: pt.every(function(n){ return isFinite(n); }) ? pt : null };
  }, true);
}
/* ── THE CONTOURS ARE FETCHED WHEN THE SECTION IS OPENED, AND NOT BEFORE ─────────  2026-09-18
   ?tracings=1 is one sheet scan and opens no Drive files -- that is what makes listing every
   tracing in the dataset cheap enough to do on a panel. The price is that the index carries no
   CONTOURS, and "is this point inside that outline" cannot be answered without them.

   So the section draws immediately from the index -- names, volumes, how many contours on how many
   sections -- and fetches the geometry of THIS CELL's organelles only when somebody opens it. A few
   Drive files, on a press, for the cell being looked at. Cached by structureId for the session,
   because contours do not change: a new version of a tracing is a new groupId and the index says so.
   Søren asked for an expandable section; this is the half of that which is not decoration. */
function organFetchRings(nid, root, trs){
  if (PANEL_ORGAN_BUSY || typeof REPORT_ENDPOINT === "undefined" || !REPORT_ENDPOINT) return;
  var want = trs.filter(function(t){
    return t && t.structureId && !t.rings && !PANEL_ORGAN_RINGS[t.structureId];
  });
  if (!want.length) return;
  PANEL_ORGAN_BUSY = true;
  var left = want.length;
  var done = function(){
    if (--left > 0) return;
    PANEL_ORGAN_BUSY = false;
    try { renderOrganelleSection(nid, root); } catch (_e){}
  };
  want.forEach(function(t){
    fetch(REPORT_ENDPOINT + "?tracings=1&structureId=" + encodeURIComponent(t.structureId)
          + (typeof panelDsQS === "function" ? panelDsQS() : ""))
      .then(function(r){ return r.json(); })
      .then(function(d){
        var one = ((d && d.tracings) || [])[0];
        var st = (one && !one.error && window.UJ && UJ.tracing)
               ? (UJ.tracing.rowsToStructures(one.rows || [])[0] || null) : null;
        /* [] rather than null for a tracing whose file could not be read: null would ask again on
           every re-render, and the honest answer is "this one has no contours here". */
        PANEL_ORGAN_RINGS[t.structureId] = (st && st.rings) ? st.rings : [];
      })
      .catch(function(){ PANEL_ORGAN_RINGS[t.structureId] = []; })
      .then(done, done);
  });
}
function organelleSectionBox(){
  var host = document.getElementById("cellOrganelles");
  if (host) return host;
  var after = document.getElementById("tracedOnCell") || document.getElementById("commReports");
  if (!after || !after.parentNode) return null;
  host = document.createElement("div");
  host.id = "cellOrganelles";
  host.style.marginTop = "10px";
  after.parentNode.insertBefore(host, after.nextSibling);
  return host;
}
/* The label a person reads for a kind, from whichever vocabulary this page carries. */
function organKindLabel(k){
  var v = String(k || "");
  if (typeof ORGANELLE_KIND_BY_VALUE !== "undefined" && ORGANELLE_KIND_BY_VALUE[v])
    return ORGANELLE_KIND_BY_VALUE[v].short || ORGANELLE_KIND_BY_VALUE[v].label || v;
  if (window.UJ && UJ.organelles && UJ.organelles.labelOf) { try { return UJ.organelles.labelOf(v); } catch (_e){} }
  return v || "structure";
}
function organCap(s){ return String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1); }
/* `t` is the thing the row is about, when the row is about something: a tracing (structureId,
   name, colour) whose outline should go on the link, or a bare {name} for a logged point that has
   no outline and takes a marker instead. Left out entirely, this is the plain coordinate jump it
   always was -- and such a jump CLEARS the slot, which is what keeps one organelle's contours from
   being drawn at the next place you navigate to. */
function organJump(p, t){
  var sid = (t && t.structureId) ? String(t.structureId) : "";
  var nm = t ? String(t.name || "") : "";
  var col = t ? String(t.color || "") : "";
  return '<button type="button" class="jumpview" data-x="' + p[0] + '" data-y="' + p[1]
       + '" data-z="' + p[2] + '"'
       + (sid ? ' data-sid="' + panelEsc(sid) + '"' : "")
       + ((!sid && nm) ? ' data-mark="1"' : "")
       + (nm ? ' data-name="' + panelEsc(nm) + '"' : "")
       + (col ? ' data-color="' + panelEsc(col) + '"' : "")
       + ' title="' + (sid
           ? 'Jumps here and puts this organelle&#39;s outline on the viewer link, so opening it '
             + 'shows the organelle rather than only the place it is in.'
           : nm
             ? 'Jumps here and marks this logged point on the viewer link. Nobody has outlined it, '
               + 'so there is no shape to show.'
             : 'Jumps to this coordinate.')
       + '" style="margin-left:6px;padding:1px 7px;font-size:11px">Jump</button>';
}
function organVol(v){
  if (!(Number(v) > 0)) return "";
  var n = Number(v);
  return n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toFixed(4);
}
/* A tracing of a CELL or a NUCLEUS is not an organelle and does not belong in this section -- it is
   the cell itself, and it is listed with the cell. */
function organIsOrganelle(t){
  var k = String((t && (t.instanceOf || t.kind)) || "").toLowerCase();
  return !!k && k !== "cell" && k !== "nucleus";
}
function renderOrganelleSection(nid, root){
  var host = organelleSectionBox();
  if (!host) return;
  if (!window.UJ || !UJ.organellelink){ host.innerHTML = ""; return; }
  var anns = (PANEL_ORGAN_ANNS && PANEL_ORGAN_NID === String(nid)) ? PANEL_ORGAN_ANNS : [];
  var trs = (PANEL_TRACINGS || []).filter(function(t){
    if (!t || !organIsOrganelle(t)) return false;
    return (nid && String(t.nucleusId || "") === String(nid))
        || (root && String(t.rootId || "") === String(root));
  });
  if (!anns.length && !trs.length){ host.innerHTML = ""; return; }

  /* The index (?tracings=1) carries no contours -- it is one sheet scan and opens no Drive files,
     which is what makes listing cheap. So a segmentation whose geometry has not been fetched cannot
     be paired by geometry, and this says so rather than pairing on hope. Rows with contours pair;
     the rest are listed as segmentations whose outline has not been read here. */
  /* By kind, then by number. The point of a number is that Mitochondrion 1 and Mitochondrion 2
     read as a set rather than as two unrelated things, and that only works if they are adjacent and
     in order -- the index returns them newest-first, which is the wrong order for exactly this. */
  trs.sort(function(a, b){
    var ka = String(a.instanceOf || a.kind || ""), kb = String(b.instanceOf || b.kind || "");
    if (ka !== kb) return ka < kb ? -1 : 1;
    return (Number(a.instanceIndex) || 0) - (Number(b.instanceIndex) || 0);
  });
  trs.forEach(function(t){
    if (!t.rings && t.structureId && PANEL_ORGAN_RINGS[t.structureId])
      t.rings = PANEL_ORGAN_RINGS[t.structureId];
  });
  var withRings = trs.filter(function(t){ return t.rings && t.rings.length; });
  var noRings = trs.filter(function(t){ return !(t.rings && t.rings.length); });
  var r = UJ.organellelink.pair(anns, withRings);

  var rows = [];
  /* 1. PAIRED: the shape, and the point it now answers for. */
  r.paired.forEach(function(p){
    var t = p.tracing;
    var c = UJ.organellelink.centre(t.rings);
    var best = c && c.point;
    var who = (t.contributors && t.contributors.length) ? t.contributors.join(", ") : (t.tracedBy || "");
    var sup = p.annotations.filter(function(a){ return !a.fromSegmentation; });
    rows.push('<div class="organrow" style="border-top:1px solid var(--line);padding:5px 0;font-size:12px">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      + '<span style="width:10px;height:10px;border-radius:2px;flex:0 0 auto;background:'
        + panelEsc(t.color || "#3a6b5a") + '"></span>'
      + '<b style="flex:0 0 auto">' + panelEsc(t.name || organKindLabel(t.instanceOf || t.kind)) + '</b>'
      + (organVol(t.volumeUm3) ? '<span style="flex:0 0 auto">' + organVol(t.volumeUm3)
          + ' µm³</span>' : "")
      + '<span style="opacity:.7;flex:0 0 auto">' + (t.contours || 0) + " contour"
        + ((t.contours === 1) ? "" : "s") + " on " + (t.sections || 0) + " section"
        + ((t.sections === 1) ? "" : "s") + '</span>'
      + (best ? '<span style="flex:0 0 auto">centre (' + best.join(", ") + ')' + organJump(best, t) + '</span>' : "")
      + '<span style="opacity:.7;flex:1 1 90px;min-width:0">' + panelEsc(who) + '</span>'
      + (t.fileUrl ? '<a href="' + panelEsc(t.fileUrl) + '" target="_blank" rel="noopener" '
          + 'style="opacity:.7;flex:0 0 auto">file</a>' : "")
      + '</div>'
      + (sup.length ? '<div class="hint" style="margin-left:18px;opacity:.65">'
          + 'the traced centre replaces ' + sup.length + ' logged point'
          + (sup.length === 1 ? "" : "s") + ': '
          + sup.map(function(a){
              var pt = UJ.organellelink.parsePoint(a.point || a.pointA);
              return (pt ? pt.join(", ") : "?") + (a.by ? " (" + panelEsc(a.by) + ")" : ""); }).join("; ")
          + ' — kept in the record, and more precise is what the outline is for.</div>' : "")
      + '</div>');
  });
  /* 2. AN ANNOTATION WITH NO SEGMENTATION: the offer to draw one. Søren: "Where there is an
        annotation without a segmentation, there should be an option to start segmenting it." */
  r.untracedAnnotations.forEach(function(a){
    var pt = UJ.organellelink.parsePoint(a.point || a.pointA);
    if (!pt) return;
    rows.push('<div class="organrow" style="border-top:1px solid var(--line);padding:5px 0;'
      + 'font-size:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      + '<span style="width:10px;height:10px;border-radius:2px;flex:0 0 auto;border:1px solid var(--line)"></span>'
      + '<b style="flex:0 0 auto">' + panelEsc(organCap(organKindLabel(a.kind))) + '</b>'
      + '<span style="opacity:.7;flex:0 0 auto">logged, not outlined</span>'
      /* No outline exists for this one, so the jump carries a point and says so rather than
         pretending to a shape nobody has drawn. */
      + '<span style="flex:0 0 auto">(' + pt.join(", ") + ')'
        + organJump(pt, { name: organCap(organKindLabel(a.kind)) }) + '</span>'
      + '<span style="opacity:.7;flex:1 1 80px;min-width:0">' + panelEsc(a.by || "") + '</span>'
      + '<button type="button" class="organtrace" data-pt="' + pt.join(",") + '" '
        + 'data-kind="' + panelEsc(a.kind || "") + '" style="flex:0 0 auto;padding:1px 8px;'
        + 'font-size:11px" title="Opens the tracing pad here, with this organelle already chosen. '
        + 'Its outline gives it a volume, a 3D shape and a more precise centre than a point can.">'
        + 'Segment it</button></div>');
  });
  /* 3. A SEGMENTATION WITH NO ANNOTATION. After today a new one registers its own centre, so this
        is older work -- and the centre is computed here anyway, so it can be said. */
  r.unannotatedTracings.concat(noRings).forEach(function(t){
    var c = t.rings ? UJ.organellelink.centre(t.rings) : null;
    var best = c && c.point;
    rows.push('<div class="organrow" style="border-top:1px solid var(--line);padding:5px 0;'
      + 'font-size:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      + '<span style="width:10px;height:10px;border-radius:2px;flex:0 0 auto;background:'
        + panelEsc(t.color || "#3a6b5a") + '"></span>'
      + '<b style="flex:0 0 auto">' + panelEsc(t.name || organKindLabel(t.instanceOf || t.kind)) + '</b>'
      + (organVol(t.volumeUm3) ? '<span style="flex:0 0 auto">' + organVol(t.volumeUm3)
          + ' µm³</span>' : "")
      + '<span style="opacity:.7;flex:0 0 auto">outlined, not logged</span>'
      + (best ? '<span style="flex:0 0 auto">centre (' + best.join(", ") + ')' + organJump(best, t) + '</span>' : "")
      + (t.fileUrl ? '<a href="' + panelEsc(t.fileUrl) + '" target="_blank" rel="noopener" '
          + 'style="opacity:.7;flex:0 0 auto">file</a>' : "")
      + '</div>');
  });

  var nSeg = trs.length, nAnn = anns.length;
  host.innerHTML = '<details id="cellOrganDetails"' + (window.__organOpen ? " open" : "") + '>'
    + '<summary style="cursor:pointer;font-size:12px;text-transform:uppercase;letter-spacing:.06em;'
    + 'color:var(--mut);font-weight:600">Organelles — ' + nSeg + ' outlined, ' + nAnn
    + ' logged' + (r.paired.length ? ", " + r.paired.length + " paired" : "") + '</summary>'
    + '<div style="margin-top:4px">' + rows.join("")
    + (noRings.length ? '<p class="hint" style="margin-top:4px">'
        + (PANEL_ORGAN_BUSY ? "Reading " + noRings.length + " outline(s)\u2026"
           : noRings.length + " outline(s) not read here, so nothing is paired against them.")
        + '</p>' : "")
    + '<p class="hint" style="margin-top:4px">A logged point says where; an outline says what shape, '
    + 'how big, and where more precisely. A point inside an outline is the same organelle — '
    + 'within half a section step of the outermost contour, with a contour drawn inside another '
    + 'counting as a hole.</p></div></details>';
  var det = host.querySelector("#cellOrganDetails");
  if (det) det.addEventListener("toggle", function(){
    window.__organOpen = det.open;
    if (det.open) organFetchRings(nid, root, trs);
  });
  /* Already open -- a second cell looked at with the section left open should pair without being
     opened again. */
  if (det && det.open) organFetchRings(nid, root, trs);
  /* The same jump the rest of the panel uses, wired here because this block is rebuilt on its own. */
  [].slice.call(host.querySelectorAll(".jumpview")).forEach(function(b){
    b.addEventListener("click", function(){
      try {
        document.getElementById("x").value = b.dataset.x;
        document.getElementById("y").value = b.dataset.y;
        document.getElementById("z").value = b.dataset.z;
        document.getElementById("go").click();
      } catch (_e){}
    });
  });
  [].slice.call(host.querySelectorAll(".organtrace")).forEach(function(b){
    b.addEventListener("click", function(){
      var pt = String(b.dataset.pt || "").split(",").map(Number);
      /* Defined by the tracing card, which is not on every page this panel serves. */
      if (typeof openTracingAt === "function") openTracingAt(pt, b.dataset.kind || "");
      else alert("The tracing card is not on this page.");
    });
  });
}

function loadCommunityReports(nid,cellPos){
  const el=document.getElementById("commReports");
  if(!el)return;
  el.innerHTML="";
  /* Before the guard below, and independent of the community fetch: the two blocks answer different
     questions and one being unavailable is no reason to hide the other. */
  try { loadTracedStructures(nid, (typeof CUR_ROOT !== "undefined" && CUR_ROOT) || ""); }
  catch (_e){}
  if(!REPORT_ENDPOINT||!nid)return;
  PANEL_CUR_NID=String(nid);
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
      /* NO EARLY RETURN ANY MORE.                                                2026-09-03

         Søren: "I want the same function on the identity cards of all the other tools, so that
         you don't have to run through the guided identification before you can report
         organelles."

         This line used to return here when the cell had no reports of any kind -- and it took the
         "Report an organelle" link down with it, because the link is appended to the same html.
         So the one way into organelle reporting that did NOT require finishing a guided cell-type
         identification was available only on cells somebody had already written about, and absent
         on every fresh cell: exactly the cell you are looking at when you want to log the first
         organelle on it.

         `empty` is kept as a flag rather than a return, because the reports block below still has
         nothing to say and should not draw a heading over nothing. What changes is that the
         organelle affordance is no longer part of that block's fate. */
      const empty=!reports.length&&!mergedGroups.length&&!notNucleusReports.length
                  &&!organelleGroups.length;
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
          window.CUR_COMMUNITY_TOP_NAME=win.name; // see CUR_COMMUNITY_TOP_NAME's reset comment in showNucleus()
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
      {
        /* ── THE OTHER HALF OF THE ORGANELLES SECTION ────────────────────────────  2026-09-18
           Flattened here because this is the one fetch that has them, and handed to the section
           whether or not the segmentations have arrived -- see renderOrganelleSection's header.
           Outside the `if` on purpose: a cell with segmentations and NO annotations still has a
           section to draw, and leaving the list unset would let the previous cell's points be
           paired against this cell's outlines. */
        /* Through organelleOwnStructs since 2026-09-19, so the section's "N logged" counts
           organelles and not rows -- the same list, read the same way, as the line above it. */
        PANEL_ORGAN_ANNS=organelleOwnStructs(organelleGroups).map(function(s){
          return {kind:s.kind,pointA:s.pointA,pointB:s.pointB,
          /* fromSegmentation: set on a point the tracing card registered from an outline's own
             centre. Blank on every row written before 2026-09-18 and on every hand-placed one,
             which is exactly what it means. */
                  /* Either column, since 2026-09-19: a point whose `source` is a structure id
                     came from an outline, and reading only the word listed Søren's six centres as
                     hand-placed beside the three outlines they were computed from. */
                  fromSegmentation:organelleIsFromOutline(s),
                  fromStructureId:s.fromStructureId||"",
                  by:s.by||""};
        });
        PANEL_ORGAN_NID=String(nid);
        try{renderOrganelleSection(nid,(typeof CUR_ROOT!=="undefined"&&CUR_ROOT)||"");}catch(_e){}
      }
      if(organelleGroups.length){
        /* The comment travels WITH its structure now rather than being swept into a paragraph
           at the end: it is what the row reads its name and size out of. subCount is 1 for every
           one of these, so a group is a structure. */
        /* The comment travels WITH its structure -- it is what the row reads its name and
           size out of -- and two rows for one outline arrive as one, so "6× lysosome" for three
           lysosomes is no longer sayable. See organelleOwnStructs. */
        const allStructs=organelleOwnStructs(organelleGroups);
        const parts=organelleCountParts(allStructs);
        /* ── SIX SENTENCES BECOME SIX ROWS, BEHIND A FOLD ────────────────────────  2026-09-19
           Søren: *"This is getting out of hand. We need to have the details in an expandable menu,
           where they are written in a more organised manner."*

           And "6 users" was one user: this counted SUBMISSIONS and called them users, so a person
           who had outlined six of their own lysosomes was told six people agreed with them. Named
           reporters are counted when there are any; when there are none the line counts LOCATIONS,
           which is the thing it actually knows. */
        const who={};
        allStructs.forEach(function(s){ if(s.by)who[String(s.by)]=1; });
        const nWho=Object.keys(who).length;
        const head=nWho
          ? (nWho+' '+(nWho>1?'people have':'person has')+' logged organelle locations for this cell')
          : (allStructs.length+' organelle location'+(allStructs.length===1?'':'s')
             +' for this cell');
        html+=(html?"<br>":"")
          +'<details class="rv-panel" style="margin-top:6px"><summary style="color:var(--accent)">'
          +'&#128172; '+head+(parts.length?" &mdash; "+parts.join(", "):"")+'</summary>'
          +'<div style="margin-top:4px">'+organelleStructRowsHtml(allStructs)+'</div></details>';
        /* The rows used to be printed BELOW the paragraph as well, so everything appeared twice in
           two shapes. They are inside the fold now and nowhere else. */
        organRowsHtml="";
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
      /* χJUMP'S WORDING, because Søren named it -- "Also log an organelle here" at the time, and
         "Log an organelle here" since 2026-09-18, when he asked for the "Also" out: it had been
         doing the work of joining this to the identification above it, and the two are not a
         sequence -- logging an organelle is its own thing you can do here. With what is
         already on file beside it. The label used to switch between "Report an organelle" and
         "Suggest a different location" depending on whether anything was logged; the count says
         the same thing and says how much, and one label across the family means somebody who has
         learned χJump recognises this. The second-opinion behaviour is unchanged -- every
         submission is its own group server-side, so a different location sits alongside the
         first rather than overwriting it. */
      /* WHAT GOES BESIDE THE LABEL depends on whether the line above already said it. When the
         cell has organelle reports, the summary two lines up has just listed them ("2 users have
         logged organelle locations for this cell -- 2x centriole, 1x mitochondrion") and every
         one is drawn underneath with its coordinate, so repeating the tally here is the same
         sentence twice. What is worth saying in that case is the thing the old label said: a
         second opinion is welcome and does not overwrite the first. With nothing on file the
         count is the useful half, in χJump's own words. */
      const knownTxt=already?"add another, or suggest a different location"
                            :"nothing logged yet";
      html+=(html?'<br>':'')+'<span class="hint">Log an organelle here'
        +' <span style="opacity:.75">&mdash; '+knownTxt+'</span> '
        +'<span class="idf-back" id="commOrganelleToggle" style="margin:0">Log one &rarr;</span></span>'
        +'<div id="commOrganelleBody" style="display:none;margin-top:10px;border-top:1px dashed var(--line);padding-top:10px"></div>';
      el.innerHTML=html+organRowsHtml;
      /* A card with nothing on file is now one line offering the form, rather than nothing at
         all. Marked so a check can tell the two states apart without parsing prose. */
      el.setAttribute("data-empty",empty?"1":"0");
      const cTog=el.querySelector("#commOrganelleToggle"),cBody=el.querySelector("#commOrganelleBody");
      if(cTog&&cBody){
        let cWired=false;
        cTog.addEventListener("click",()=>{
          const showing=cBody.style.display!=="none";
          if(showing){cBody.style.display="none";cTog.innerHTML="Log one &rarr;";return;}
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
  return '<div class="idf-organelle" style="margin-top:10px"><span class="hint">Log an organelle here <span class="idf-back" id="idfOrganelleToggle" style="margin:0">Log one &rarr;</span></span>'
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
      toggle.innerHTML="Log one &rarr;";
      return;
    }
    body.style.display="";
    toggle.innerHTML="Hide organelle form &uarr;";
    if(!wired){body.innerHTML=organelleFormHtml(slug);wireOrganelleForm(body,slug);wired=true;}
  });
}
/* PICK THE KIND, PASTE THE LINK, GET A ROW PER MARKER.                            2026-09-03

   Søren: "I also wanted the option to paste url, like in xJump where you can log a lot of
   organelles of the same type quickly."

   Typing was the only way in here: three fields per structure, "+ Add another structure", repeat.
   Twelve mitochondria is thirty-six numbers read off a screen and typed back, and the numbers are
   already in the address bar of the viewer tab you Ctrl+clicked them in.

   THE KIND IS CHOSEN BEFORE THE PASTE, which is the half ωJump learned this morning: a bulk action
   that fills in the coordinates and leaves you to open twelve dropdowns has handed most of the
   work back. Rows arrive labelled and submittable.

   The parsing and the marker-to-row arithmetic are both core/organelles.js's -- markersFromLink
   and rowsFromPoints. Nothing about how many markers a cilium takes is decided here. */
function organellePasteHtml(){
  return '<div class="organ-paste-box" style="border:1px dashed var(--line);border-radius:8px;'
    +'padding:10px;margin:0 0 10px">'
    +'<div class="hint" style="margin:0">Or point at them instead: Ctrl+click each structure in the '
    +'viewer, then paste that link here &mdash; every marker becomes a row of the kind you pick.</div>'
    +'<div style="margin-top:8px"><label for="organPasteKind">What are these?</label>'
    +'<select id="organPasteKind">'+ORGANELLE_KIND_OPTIONS_HTML+'</select></div>'
    +'<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">'
    +'<input type="text" id="organPasteLink" placeholder="paste a Neuroglancer link" style="flex:1 1 240px">'
    +'<button type="button" class="idbtn" id="organPasteGo" style="width:auto">Add a row per marker</button>'
    +'</div><div class="hint" id="organPasteNote" style="margin:6px 0 0"></div></div>';
}
function organelleFormHtml(slug){
  const name=(slug&&typeof LEAF_NAMES!=="undefined")?LEAF_NAMES[slug]:null;
  let h='<p class="hint">Mark where an organelle or extracellular structure sits on this cell — centriole, primary cilium, or any of the others in the topic-organized list below. Add one row per structure — mix and match freely, and log more than one of the same kind if the cell has more than one (e.g. two centrioles, or several mitochondria).</p>';
  h+='<div class="meta">'+(name?"Identified as: <b>"+name+"</b> &middot; ":"")+(ID_CTX.nucId?"nucleus "+ID_CTX.nucId:"no nucleus ID on file")+(ID_CTX.root?" &middot; root "+ID_CTX.root:"")+(ID_CTX.pos?" &middot; voxel ("+coordSpan(ID_CTX.pos[0],ID_CTX.pos[1],ID_CTX.pos[2])+")":"")+'</div>';
  h+=organellePasteHtml();
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
/* WHAT THE PASTE DOES.                                                            2026-09-03

   Reads the markers out of the pasted state (UJ.organelles.markersFromLink), turns them into rows
   of the chosen kind (UJ.organelles.rowsFromPoints -- which pairs them up for a vector kind, so a
   cilium's six markers make three rows and not six half-filled ones), and appends.

   ONLY EVER ADDS. A paste that replaced the rows would throw away whatever was already typed. The
   one exception is the single untouched default row the form opens with: replacing that is not
   losing anything, and leaving it would put an empty centriole row above every pasted one.

   THE NOTE UNDER THE PICKER is written before the pasting, not after, because for a vector kind
   the click ORDER carries meaning -- base then tip -- and somebody who learns that from an error
   message has already clicked in the wrong order. The names are the kind's own pointLabels.

   DEGRADES QUIETLY. core/organelles.js is loaded by the tools that have this form; if a page ever
   carries panel.js without it, the callout is removed rather than left as a button that does
   nothing. */
function wireOrganellePaste(container,rowsEl,addRow){
  const O=(window.UJ&&UJ.organelles)||null;
  const box=container.querySelector("#organPasteLink");
  const kindSel=container.querySelector("#organPasteKind");
  const go=container.querySelector("#organPasteGo");
  const note=container.querySelector("#organPasteNote");
  if(!box||!kindSel||!go)return;
  if(!O||!O.markersFromLink||!O.rowsFromPoints){
    const wrap=go.closest(".organ-paste-box"); if(wrap)wrap.remove();
    return;
  }
  kindSel.value="centriole";
  function syncNote(){
    const k=kindSel.value,info=ORGANELLE_KIND_BY_VALUE[k],lbl=organReportPointLabels(k);
    const nm=escHtml((info&&info.label)||k);
    note.innerHTML=(info&&info.vector)
      ? "<b>"+nm+"</b> takes two markers per structure &mdash; Ctrl+click them in pairs, "
        +escHtml(lbl[0]).toLowerCase()+" then "+escHtml(lbl[1]).toLowerCase()
        +", and each pair becomes one row."
      : "Each marker becomes one <b>"+nm+"</b> row. Anything you mis-labelled can still be "
        +"changed row by row below.";
  }
  kindSel.addEventListener("change",syncNote);
  syncNote();
  go.addEventListener("click",()=>{
    const r=O.markersFromLink(box.value,null);
    if(!r.ok){note.innerHTML='<span style="color:var(--bad)">'+escHtml(r.error)+'</span>';return;}
    if(!r.points.length){
      note.innerHTML='<span style="color:var(--bad)">That link has no annotations on it. '
        +'Mark the structures in the viewer first \u2014 a point, or a LINE for anything with two '
        +'ends like a cilium or an NR type II \u2014 then copy the whole address bar.</span>';
      return;
    }
    const kind=kindSel.value;
    const first=rowsEl.children[0];
    const untouched=rowsEl.children.length===1&&first
      &&![...first.querySelectorAll("input")].some(i=>i.value.trim()!=="");
    if(untouched)rowsEl.innerHTML="";
    const made=O.rowsFromPoints(kind,r.points);
    made.rows.forEach(row=>addRow(kind,row.a,row.b));
    box.value="";
    const info=ORGANELLE_KIND_BY_VALUE[kind];
    const n=made.rows.length;
    note.innerHTML=n+" "+escHtml((info&&info.label)||kind)+" row"+(n===1?"":"s")
      +" added from "+r.points.length+" marker"+(r.points.length===1?"":"s")
      +(made.odd
         ? '. <span style="color:var(--warn)">The last one is missing its second point &mdash; '
           +'there was an odd marker, so fill it in or delete the row.</span>'
         : ". Check them and submit.");
  });
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
  function addRow(kindValue,ptA,ptB){
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
    /* Extracted from the change listener so a row created BY A PASTE can be brought into the
       same state without faking an event. Which fields a row shows is asked of the kind's own
       `vector` flag, never of its name -- the reason is two comments up and cost this family a
       real bug once. */
    function syncFields(){
      const info=ORGANELLE_KIND_BY_VALUE[kindEl.value];
      const isCilium=!!(info&&info.vector);
      centrioleFields.style.display=isCilium?"none":"";
      ciliumFields.style.display=isCilium?"":"none";
      const pl=organReportPointLabels(kindEl.value);
      if(pointLabelA)pointLabelA.textContent=pl[0]+" (voxel)";
      if(pointLabelB)pointLabelB.textContent=pl[1]+" (voxel)";
    }
    kindEl.addEventListener("change",syncFields);
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
    /* A row asked for by name overrides the positional default above, and a row asked for WITH
       coordinates arrives filled. ptB is a vector kind's second point and is ignored by a point
       kind, whose second set of fields is hidden anyway -- the same rule buildSubs applies when
       it refuses to write a stale hidden coordinate. */
    if(kindValue){kindEl.value=kindValue;syncFields();}
    const fill=(p,a,b,c)=>{if(!p)return;a.value=p[0];b.value=p[1];c.value=p[2];};
    if(ptA){
      const info=ORGANELLE_KIND_BY_VALUE[kindEl.value];
      if(info&&info.vector){fill(ptA,bx,by,bz);fill(ptB,tx,ty,tz);}
      else fill(ptA,cx,cy,cz);
    }
    wirePasteSplit(cx,cy,cz);wireJump(row.querySelector(".organ-jump-c"),cx,cy,cz);
    wirePasteSplit(bx,by,bz,tx);wireJump(row.querySelector(".organ-jump-base"),bx,by,bz);
    wirePasteSplit(tx,ty,tz);wireJump(row.querySelector(".organ-jump-tip"),tx,ty,tz);
    renumberRows();
  }
  addRow();
  container.querySelector("#organAddRow").addEventListener("click",()=>addRow());
  wireOrganellePaste(container,rowsEl,addRow);
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
    /* One question, before the first post. This form posts a row PER STRUCTURE, so without this
       a signed-out submission raises one modal per row and then disables the button anyway -- the
       exact thing Søren hit in the bulk panel on 2026-09-11. Asked of the page rather than
       assumed: µJump defines reportGateBlock(); the other tools sharing this file do not yet, and
       keep their existing per-call behaviour until their own postReport is hardened. */
    if(typeof reportGateBlock==="function"){
      const blocked=reportGateBlock();
      if(blocked){alert(blocked);return;}
    }
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
