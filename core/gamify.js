/* core/gamify.js -- extracted from ujump.html, stage 2 of the shared-core refactor (2026-08-16).
   Sign-in chip, profile/stats, favourites, leaderboard, dashboard, "Download your work".
   Dataset-agnostic: the backend URL and OAuth client live in UJ.cfg.backend, set by the page
   before this file loads. hJump loads this same file and supplies its own UJ.cfg.backend.ds so
   points can be pooled per dataset and summed across pages.

   Everything here stays a TOP-LEVEL function declaration on purpose: call sites include inline
   HTML handlers (openDashboard, closeDashboard, downloadMyWork), which only resolve globals.
   UJ.gamify below is a convenience handle, not the call path.

   Resolved at CALL time from the main tool script, which loads after this file:
   escHtml, postReport, GOOGLE_VERIFIED, GOOGLE_CREDENTIAL, GOOGLE_CLIENT_ID, REPORT_ENDPOINT,
   handleGoogleCred (plus the `google` and `XLSX` third-party globals).

   NOT moved here, deliberately:
   - `function escHtml(x)` -- a SECOND, weaker escaper that shadowed the main script's 5-char
     one. Leaving it in the page preserves exactly today's behaviour; see the note at its
     declaration site.
   - `if(GOOGLE_CLIENT_ID){gamifyInit(12);}` -- GOOGLE_CLIENT_ID is a top-level const in the
     main script, so it is in the temporal dead zone while this file runs. The call has to stay
     where the constant is already initialised. */
window.UJ = window.UJ || {};
/* ── Gamification: One Tap login, account chip, dashboard, favourites, leaderboard ── */
window.FAV_SET=window.FAV_SET||new Set();
var MYSTATS=null;
function gamifyStyle(){
  if(document.getElementById("gameStyle"))return;
  var st=document.createElement("style");st.id="gameStyle";
  st.textContent=
    /* 2026-08-17 -- was position:fixed;top:10px;right:12px;z-index:9000, independently pinned to
       the same corner as #themeToggleBtn's own old fixed position; see that button's CSS comment
       for the mobile overlap bug this caused. Now placed in normal flow via #gameChipSlot inside
       .topbar-right (see gamifyInjectUI() below and the HTML near the logo). */
    "#gameChip{font:13px/1.3 -apple-system,Segoe UI,sans-serif}"
   +"#gameChip .chipbtn{display:inline-flex;align-items:center;gap:8px;background:var(--panel,#161b22);color:var(--ink,#e6edf3);border:1px solid var(--accent,#27e0b3);border-radius:20px;padding:6px 13px;cursor:pointer;box-shadow:0 2px 12px color-mix(in srgb,var(--accent,#27e0b3) 25%,transparent)}"
   +"#gameChip .lvl{font-weight:600;color:var(--accent,#3d6f92)}"
   +"#gameChip .pts{color:var(--mut,#8b949e)}"
   +"#gameDash{position:fixed;inset:0;z-index:9500;background:var(--scrim,rgba(0,0,0,.45));display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:32px 12px}"
   +"#gameDash .card{background:var(--panel,#161b22);color:var(--ink,#e6edf3);max-width:640px;width:100%;border-radius:14px;padding:22px 22px 26px;box-shadow:0 12px 40px var(--shadow,rgba(0,0,0,.3))}"
   +"#gameDash h2{margin:0 0 2px;font-size:20px}#gameDash h3{margin:18px 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut,#8b949e)}"
   +"#gameDash .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}"
   +"#gameDash .stat{background:var(--panel,#161b22);border:1px solid var(--line,#2a313c);border-radius:10px;padding:10px 12px}"
   +"#gameDash .stat b{display:block;font-size:22px;line-height:1.1;color:var(--ink,#e6edf3)}#gameDash .stat span{font-size:11px;color:var(--mut,#8b949e)}"
   +"#gameDash .bar{height:8px;background:var(--line,#2a313c);border-radius:6px;overflow:hidden;margin:6px 0}"
   +"#gameDash .bar>i{display:block;height:100%;background:var(--accent,#3d6f92)}"
   +"#gameDash .lbrow{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--line,#2a313c);font-size:14px}"
   +"#gameDash .favrow{display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--line,#2a313c);font-size:13px;flex-wrap:wrap}"
   +"#gameDash .x{position:absolute;top:14px;right:16px;cursor:pointer;font-size:22px;color:var(--mut,#8b949e)}"
   +"#gameDash .dbtn{background:var(--accent,#3d6f92);color:var(--on-accent,#06231c);border:none;border-radius:7px;padding:5px 12px;cursor:pointer}";
  document.head.appendChild(st);
}
function gamifyInjectUI(){
  gamifyStyle();
  // 2026-08-17 -- appended into #gameChipSlot (inside .topbar-right, next to the theme toggle) so
  // it lays out in normal flow instead of floating as its own fixed overlay; falls back to
  // document.body only in the unexpected case that slot isn't present (keeps this function safe to
  // call even if the surrounding HTML ever changes).
  if(!document.getElementById("gameChip")){
    var c=document.createElement("div");c.id="gameChip";
    var slot=document.getElementById("gameChipSlot");
    (slot||document.body).appendChild(c);
  }
  if(!document.getElementById("gameDash")){var d=document.createElement("div");d.id="gameDash";
    d.addEventListener("click",function(e){if(e.target===d)closeDashboard();});document.body.appendChild(d);}
}
/* Combined points, live. Søren, 2026-08-16: opening ηJump showed "1 pts" when µJump showed
   hundreds, which reads as data loss even though it is the per-dataset figure behaving exactly as
   designed. The chip is the always-visible number, so it must show the thing that is CONTINUOUS
   across pages, not the per-sheet one.

   Not simply t.combinedPoints: that snapshot is rebuilt nightly, so a report submitted five
   minutes ago would not appear and the chip would look stuck. Instead take the OTHER datasets
   from the nightly snapshot and this dataset LIVE from myStats -- correct immediately after a
   submission, and still correct across pages. */
/* perDataset arrives as an ARRAY of {ds,label,points,...}. It used to arrive as an OBJECT keyed
   by ds, because Datasets.gs built one shape and this file consumed another -- two files each
   correct alone, never run together. `{}.forEach` is not a function, so this threw, renderChip()
   died mid-call, and the chip sat on "loading…" for ever. That is what "the points never finish
   loading" was: not slow, broken.

   perList() accepts both shapes, so the page is correct whichever side of the backend deploy it
   is on -- this family has been bitten twice by a page that assumed a redeploy had happened. */
function perList(t){
  var p=t&&t.perDataset;
  if(!p) return [];
  /* Falsy entries dropped here, not guarded at each use site: a null does not throw in the loop
     that sums points, it throws in the tooltip that maps over labels. One filter is the fix. */
  if(Object.prototype.toString.call(p)==="[object Array]") return p.filter(function(e){return !!e;});
  var out=[]; for(var k in p){ if(p.hasOwnProperty(k)&&p[k]){ var e=p[k]; if(e.ds==null) e.ds=k; out.push(e); } }
  return out;
}
/* Name the level for the number actually on screen. MYSTATS.level is computed server-side from
   THIS tool's points alone, so showing it next to the pooled total made βJump read "Contributor"
   (>=100 points there) while every other tool read "Novice" for the same person -- two numbers on
   one chip disagreeing about the same account. The ladder now comes down with ?profileTotals=;
   falling back to MYSTATS.level keeps a not-yet-redeployed backend working. */
function levelName(points, levels){
  if(!levels||!levels.length) return null;
  var name=null;
  for(var i=0;i<levels.length;i++){ if(points>=levels[i][0]) name=levels[i][1]; }
  return name;
}
/* POINTS ARE SHOWN AS WHOLE NUMBERS -- 2026-08-31, Søren: "Please don't show such a ridiculous
   number, limit it to whole numbers." The chip read "1786.5000000000002 pts".

   Two separate things went wrong and both are fixed here rather than only the visible one.

   FIRST, the points really are fractional. Code.gs awards 0.1 for a computed volume (see
   REPORT_SHEETS_POINTS), so a total genuinely can be x.5 -- this was never an integer quantity
   that had been corrupted. SECOND, binary floating point cannot hold 0.1, so a few hundred of
   them accumulate an error around 1e-13, and combinedPoints() then adds a live figure to a
   snapshot figure and subtracts a third, which is three more chances to expose it.

   pointsExact() rounds the arithmetic to two decimals, which is finer than any award and kills
   the noise at the source rather than only where it happens to be printed -- otherwise the same
   digits would surface again in the leaderboard, the dashboard, or the next thing that prints a
   total. pointsText() then rounds to whole numbers for DISPLAY, which is what was asked for.

   The two are separate on purpose: the level thresholds and the "N pts to the next level"
   arithmetic run on the exact value, so rounding for display can never nudge somebody over or
   under a threshold they have not actually reached. */
function pointsExact(n){ var v=Number(n); return isFinite(v)?Math.round(v*100)/100:0; }
function pointsText(n){ var v=Number(n); return isFinite(v)?String(Math.round(v)):"0"; }

function combinedPoints(){
  var live=(MYSTATS&&MYSTATS.points)||0, t=window.__PROFILE_TOTALS;
  if(!t||t.combinedPoints==null) return {points:pointsExact(live),combined:false,per:null};
  var ds="";
  try{ ds=(UJ&&UJ.cfg&&UJ.cfg.backend&&UJ.cfg.backend.ds)||""; }catch(_c){}
  var per=perList(t), mine=0;
  /* Subtract THIS tool's snapshot figure and add its live one: the current page is right the
     instant you submit, the others come from the rebuild. Without a `ds` on each entry this
     subtraction never matched and the current tool was counted twice. */
  per.forEach(function(p){ if(p&&p.ds===ds) mine=p.points||0; });
  var pts=pointsExact(Math.max(live,(t.combinedPoints-mine)+live));
  return {points:pts,combined:true,per:per,level:levelName(pts,t.levels)};
}
/* Nothing in here may throw. A chip stuck on "loading…" is indistinguishable from a backend that
   never answered, and that is exactly how the perDataset shape mismatch presented for weeks --
   as a performance problem. If the combined figure cannot be computed, show this page's own
   points rather than nothing. */
function renderChip(){ try{ renderChipInner(); }catch(err){ try{ renderChipFallback(err); }catch(_f){} } }
function renderChipFallback(err){
  var c=document.getElementById("gameChip");if(!c)return;
  if(!(GOOGLE_VERIFIED&&MYSTATS)) return;
  c.innerHTML='<div class="chipbtn" id="chipOpen" title="Showing this page\u2019s points only \u2014 '
    +'the combined total could not be read ('+escHtml(String(err&&err.message||err))+')."><span>'
    +escHtml(MYSTATS.handle||"you")+'</span><span class="lvl">'+escHtml(MYSTATS.level||"")
    +'</span><span class="pts">'+pointsText(MYSTATS.points)+' pts</span></div>';
  var o=document.getElementById("chipOpen");if(o)o.addEventListener("click",openDashboard);
}
function renderChipInner(){
  var c=document.getElementById("gameChip");if(!c)return;
  if(GOOGLE_VERIFIED&&MYSTATS){
    var cp=combinedPoints();
    var tip=cp.combined
      ? ("Points across every dataset: "
         +cp.per.map(function(p){return (p.label||p.ds)+" "+pointsText(p.points);}).join(" · ")
         +". This page's own "+pointsText(MYSTATS.points)+" update immediately; the others come from the 4-hourly rebuild.")
      : "Points on this dataset only. The combined cross-tool total appears once rebuildProfileTotals() has run — see installProfileTotalsTrigger() in Datasets.gs.";
    c.innerHTML='<div class="chipbtn" id="chipOpen" title="'+escHtml(tip)+'"><span>'+escHtml(MYSTATS.handle||"you")+'</span>'
      +'<span class="lvl">'+escHtml(cp.level||MYSTATS.level||"")+'</span><span class="pts">'+pointsText(cp.points)+' pts</span>'+((MYSTATS.downvoted>0)?'<span style="color:#e3b341" title="You have '+MYSTATS.downvoted+' down-voted report(s) to review">⚠ '+MYSTATS.downvoted+'</span>':'')+'</div>';
    var o=document.getElementById("chipOpen");if(o)o.addEventListener("click",openDashboard);
  } else if(GOOGLE_VERIFIED){
    c.innerHTML='<div class="chipbtn" id="chipOpen"><span>signed in</span><span class="pts">loading…</span></div>';
    var o2=document.getElementById("chipOpen");if(o2)o2.addEventListener("click",openDashboard);
  } else {
    c.innerHTML='<div class="chipbtn"><span>Sign in to track progress</span></div><div id="chipGsi" style="margin-top:6px"></div>';
    if(window.google&&google.accounts&&google.accounts.id){try{google.accounts.id.renderButton(document.getElementById("chipGsi"),{theme:"outline",size:"small",type:"standard"});}catch(_){}}
  }
}
function gamifyGet(param,cb){
  if(!REPORT_ENDPOINT)return;
  var q=(param==="leaderboard")?"?leaderboard=1":("?"+param+"="+encodeURIComponent(GOOGLE_CREDENTIAL||""));
  /* Every READ carries ds too, not just writes. Without this, hJump's leaderboard and stats come
     back from µJump's spreadsheet -- the backend's dsCache() namespacing keeps the two apart
     server-side, but only if the request actually says which dataset it is about. A missing or
     unknown ds falls back to ujump in setDsFromRequest(), so this is safe to ship either side of
     the backend deploy. */
  try{ if(UJ&&UJ.cfg&&UJ.cfg.backend&&UJ.cfg.backend.ds) q+="&ds="+encodeURIComponent(UJ.cfg.backend.ds); }catch(_e){}
  fetch(REPORT_ENDPOINT+q).then(function(r){return r.json();}).then(cb).catch(function(){});
}
/* Cross-page totals (?profileTotals=) -- points follow the user between µJump and ηJump, rebuilt
   nightly by Datasets.gs's trigger rather than recomputed on every profile open. Deliberately a
   SEPARATE call rather than folded into ?myStats=: this page's own numbers must keep updating
   instantly on submit, and only the combined figure lags a day. That difference is stated to the
   user with an explicit "as of" timestamp instead of being left to guess. */
function loadProfileTotals(cb){
  gamifyGet("profileTotals",function(d){
    window.__PROFILE_TOTALS=(d&&!d.error)?d:null;
    renderChip();                       // the chip shows the combined figure -- repaint once it lands
    if(cb)cb(window.__PROFILE_TOTALS);
  });
}
function profileTotalsHtml(t){
  if(!t) return "";
  var per=perList(t).map(function(p){
    return '<span style="display:inline-block;min-width:150px">'+escHtml(p.label||p.ds)+' <b>'+pointsText(p.points)+'</b></span>';
  }).join("");
  var when=t.updated?new Date(t.updated):null;
  return '<h3>Across all datasets</h3>'
    +'<div style="font-size:13px"><b>'+pointsText(t.combinedPoints)+'</b> points in total</div>'
    +'<div style="font-size:12px;color:var(--mut,#8b949e);margin-top:4px">'+per+'</div>'
    +'<div style="font-size:11px;color:var(--mut,#8b949e);margin-top:4px">Combined total as of '
    +escHtml(when&&!isNaN(when.getTime())?when.toLocaleString("en-GB"):"the last rebuild")
    +' &mdash; this page&rsquo;s own numbers above update immediately.</div>';
}
function loadMyStats(cb){gamifyGet("myStats",function(d){if(d&&!d.error){MYSTATS=d;}renderChip();if(cb)cb(d);});}
function loadFavourites(cb){gamifyGet("favourites",function(d){window.FAV_SET=new Set();((d&&d.favourites)||[]).forEach(function(f){if(f.nucleusId)window.FAV_SET.add(String(f.nucleusId));if(f.coord)window.FAV_SET.add(String(f.coord));});refreshFavStars();if(cb)cb(d);});}
function refreshFavStars(){
  document.querySelectorAll(".favstar").forEach(function(b){
    var on=window.FAV_SET.has(String(b.dataset.nid||""))||(b.dataset.coord&&window.FAV_SET.has(String(b.dataset.coord)));b.textContent=on?"★":"☆";b.style.color=on?"var(--accent)":"var(--mut)";b.title=on?"In favourites":"Save to favourites";});
}
function gamifyOnSignIn(){renderChip();loadMyStats();loadFavourites();loadProfileTotals(function(){});}
/* "Download your work" (2026-08-02) -- Søren: "I want the user to be able to download all the
   annotation that they have made themselves, when looking at their profile below the 'Reports
   needing review' as a button that says 'Download your work'." Pulls every report/annotation the
   signed-in user has ever submitted via the new ?myReports= backend endpoint (see myReportsList()
   in Code.gs.txt) and writes it out as one multi-sheet Excel workbook, one tab per report type --
   same SheetJS pattern (XLSX.utils.aoa_to_sheet/book_new/book_append_sheet/writeFile) the
   "Download as Excel" filter export already uses (dlBtn's click handler above). Deliberately does
   NOT reuse gamifyGet() for this call: gamifyGet() silently swallows fetch errors (.catch(function(){}))
   which is fine for a background stats refresh but wrong for an explicit download action -- the
   user needs to actually be told if it failed, not see nothing happen. */
function downloadMyWork(){
  var btn=document.getElementById("downloadMyWorkBtn");
  if(!REPORT_ENDPOINT){alert("No report backend is configured — nothing to download.");return;}
  if(!GOOGLE_VERIFIED||!GOOGLE_CREDENTIAL){alert("Please sign in with Google first.");return;}
  var origText=btn?btn.textContent:"";
  if(btn){btn.disabled=true;btn.textContent="Preparing…";}
  fetch(REPORT_ENDPOINT+"?myReports="+encodeURIComponent(GOOGLE_CREDENTIAL))
    .then(function(r){return r.json();})
    .then(function(d){
      if(!d||d.error){alert("Couldn't load your work"+(d&&d.error?(": "+d.error):"")+". Try signing in again.");return;}
      var sheets=d.sheets||{};
      var names=Object.keys(sheets);
      if(!names.length){alert("No annotations found for your account yet — nothing to download.");return;}
      var wb=XLSX.utils.book_new();
      names.forEach(function(name){
        var s=sheets[name];
        var data=[s.headers].concat(s.rows);
        var ws=XLSX.utils.aoa_to_sheet(data);
        // Sheet tab names are capped at 31 characters and can't contain []:*?/\ -- Excel enforces
        // this, so sanitize before appending rather than letting book_append_sheet throw.
        var tabName=name.replace(/[\[\]\*\?\/\\:]/g,"").slice(0,31);
        XLSX.utils.book_append_sheet(wb,ws,tabName);
      });
      XLSX.writeFile(wb,"my_microns_work_"+(d.email||"me").replace(/[^a-z0-9]+/gi,"_")+".xlsx");
    })
    .catch(function(err){alert("Couldn't download your work — network error. Please try again.");})
    .finally(function(){if(btn){btn.disabled=false;btn.textContent=origText;}});
}
function openDashboard(){
  var d=document.getElementById("gameDash");if(!d)return;
  d.style.display="flex";
  d.innerHTML='<div class="card" style="position:relative"><span class="x" id="dashX">×</span><div id="dashBody">Loading…</div></div>';
  document.getElementById("dashX").addEventListener("click",closeDashboard);
  var body=document.getElementById("dashBody");
  loadMyStats(function(s){
    if(!s||s.error){body.innerHTML="Could not load your stats. Are you signed in?";return;}
    var pct=s.totalUsers?Math.round(100*(s.rank||s.totalUsers)/s.totalUsers):0;
    var prog=(s.nextLevelAt&&s.points!=null)?Math.min(100,Math.round(100*s.points/s.nextLevelAt)):100;
    var h='<h2>'+escHtml(s.handle||"You")+'</h2>'
      +'<div style="color:var(--mut,#8b949e);font-size:13px">'+escHtml(s.level||"")+' &middot; '+pointsText(s.points)+' points'
      +(s.rank?(' &middot; rank #'+s.rank+' of '+s.totalUsers+' (top '+pct+'%)'):'')+'</div>';
    if(s.nextLevel){h+='<div class="bar"><i style="width:'+prog+'%"></i></div><div style="font-size:11px;color:var(--mut,#8b949e)">'+pointsText(s.nextLevelAt-s.points)+' pts to '+escHtml(s.nextLevel)+'</div>';}
    h+='<h3>Your activity</h3><div class="grid">'
      +stat(s.reports,"total reports","Reported or confirmed cell identities only (New identification / Discrepancy / Confirmation reports, plus identified new cells and merged-nucleus sub-cell splits). Computed volumes, root ID proposals, votes, and \"not a nucleus\" flags are real contributions too, but aren't cell-identity reports — see the separate stats below for those.")+stat(s.daysActive,"days active")+stat(s.streak,"day streak")
      +stat(s.longestStreak,"longest streak")+stat(s.newCells,"new cells found")+stat(s.organelles,"organelles","Every centriole, primary cilium, microglia plug, astrocyte hole, and other logged organelle/extracellular structure counts here — cilia and centrioles just earn more points per report (see the point-system notes), they're not the only thing tallied.")
      +stat(s.rootProposals,"root IDs proposed")+stat(s.computedVolumes,"volumes computed")+stat(s.votesGiven,"votes given","Identity or root-ID votes you've cast on other people's reports — distinct from \"upvotes received\" below, which counts votes cast BY OTHERS on your own reports.")+stat(s.notNucleusFlags,"\"not a nucleus\" flags","Detections you flagged as segmentation artifacts rather than real cells — no cell identity is given for these, so they aren't counted in \"total reports\".")
      +stat(s.meshContactsComputed,"cell contacts computed","Cell-pairs you've checked with “Find cell contacts” — mesh proximity (touching membranes), not synapses. Not counted in “total reports”.")
      +stat(s.upvotesReceived,"upvotes received")+stat(s.favourites,"favourites")+'</div>';
    if(s.cellTypes&&s.cellTypes.length){h+='<h3>Cell types you identify most</h3><div style="font-size:13px">'
      +s.cellTypes.map(function(c){return escHtml(c[0])+' <b>'+c[1]+'</b>';}).join(' &nbsp; ')+'</div>';}
    /* Placeholder filled asynchronously by loadProfileTotals() below -- the combined figure comes
       from a second endpoint, and blocking the whole profile on it would make the panel feel
       broken whenever that call is slow or the backend predates the change. */
    h+='<div id="profileTotals"></div>';
    // handle setter
    h+='<h3>Display name on leaderboard</h3><div style="display:flex;gap:6px;flex-wrap:wrap">'
      +'<input type="text" id="handleInput" value="'+escHtml(s.handle||"")+'" style="flex:1;min-width:160px" maxlength="40">'
      +'<button class="dbtn" id="handleSave">Save</button></div>';
    h+='<h3>Favourites</h3><div id="favList" style="font-size:13px">Loading…</div>';
    h+='<h3>Leaderboard — top 10</h3><div id="lbList">Loading…</div>';h+='<h3>Reports needing review</h3><div style="font-size:12px;color:var(--mut);margin-bottom:4px">Cells where your identification has received down-votes — worth a second look. Re-identifying a cell updates your earlier report.</div><div id="dvList">Loading…</div>';
    h+='<div style="margin-top:10px"><button class="dbtn" id="downloadMyWorkBtn">Download your work</button><div style="font-size:11px;color:var(--mut);margin-top:4px">Every identification, confirmation, organelle report, and other annotation you\'ve submitted, as an Excel file (one tab per report type).</div></div>';
    h+='<div style="margin-top:16px;font-size:11px;color:var(--mut,#8b949e)">We store your Google name, email and contribution activity to power these stats and the public leaderboard, which shows your chosen display name. Contact soren@grubb.dk to remove your data.</div>';
    body.innerHTML=h;
    loadProfileTotals(function(t){
      var slot=document.getElementById("profileTotals");
      if(slot&&t) slot.innerHTML=profileTotalsHtml(t);   // silently absent if the backend has no such endpoint yet
    });
    document.getElementById("handleSave").addEventListener("click",function(){
      var v=(document.getElementById("handleInput").value||"").trim();if(!v)return;
      if(postReport({type:"set_handle",timestamp:new Date().toISOString(),handle:v},"Display name saved.")){setTimeout(function(){loadMyStats();openDashboard();},1400);}
    });
    var dmwBtn=document.getElementById("downloadMyWorkBtn");
    if(dmwBtn)dmwBtn.addEventListener("click",downloadMyWork);
    loadFavourites(function(fd){
      var favs=(fd&&fd.favourites)||[],fl=document.getElementById("favList");if(!fl)return;
      fl.innerHTML=favs.length?favs.map(function(f){
        return '<div class="favrow"><code>'+escHtml(f.nucleusId||f.coord)+'</code>'
          +(f.coord?'<button class="dbtn favjump" data-coord="'+escHtml(f.coord)+'" style="padding:2px 8px">jump</button>':'')
          +'<button class="favdel" data-nid="'+escHtml(f.nucleusId)+'" data-coord="'+escHtml(f.coord)+'" style="padding:2px 8px;color:var(--danger);background:none;border:1px solid var(--line,#ccc);border-radius:6px;cursor:pointer">remove</button></div>';
      }).join(''):'<div style="color:var(--mut,#8b949e)">No favourites yet — use ☆ Save to favourites on a cell.</div>';
      fl.querySelectorAll(".favdel").forEach(function(b){b.addEventListener("click",function(){
        if(postReport({type:"remove_favourite",timestamp:new Date().toISOString(),nucleusId:b.dataset.nid,coord:b.dataset.coord},"Removed from favourites.")){
          window.FAV_SET.delete(String(b.dataset.nid));refreshFavStars();setTimeout(function(){openDashboard();},1200);}});});
      fl.querySelectorAll(".favjump").forEach(function(b){b.addEventListener("click",function(){
        var p=(b.dataset.coord||"").split(",");if(p.length===3){var xEl=document.getElementById("x"),yEl=document.getElementById("y"),zEl=document.getElementById("z");
          if(xEl&&yEl&&zEl){xEl.value=p[0];yEl.value=p[1];zEl.value=p[2];closeDashboard();var go=document.querySelector(".goarrow,#go,button.go");if(go)go.click();}}});});
    });
    gamifyGet("myDownvoted",function(dd){
      var dv=(dd&&dd.downvoted)||[],el=document.getElementById("dvList");if(!el)return;
      el.innerHTML=dv.length?dv.map(function(x){
        return '<div class="favrow"><span>'+escHtml(x.identity)+'</span><span style="color:var(--mut);font-size:12px">▲'+x.up+' ▼'+x.down+'</span>'
          +(x.coord?'<button class="dbtn dvjump" data-coord="'+escHtml(x.coord)+'" style="padding:2px 8px">review ↗</button>':'')+'</div>';
      }).join(''):'<div style="color:var(--mut)">None — no one has down-voted your identifications.</div>';
      el.querySelectorAll(".dvjump").forEach(function(b){b.addEventListener("click",function(){
        var p=(b.dataset.coord||"").split(",");if(p.length===3){var xEl=document.getElementById("x"),yEl=document.getElementById("y"),zEl=document.getElementById("z");
          if(xEl&&yEl&&zEl){xEl.value=p[0];yEl.value=p[1];zEl.value=p[2];closeDashboard();var go=document.querySelector(".goarrow,#go,button.go");if(go)go.click();}}});});
    });
    gamifyGet("leaderboard",function(ld){
      var lb=(ld&&ld.leaderboard)||[],el=document.getElementById("lbList");if(!el)return;
      el.innerHTML=lb.length?lb.map(function(u,i){return '<div class="lbrow"><span>'+(i+1)+'. '+escHtml(u.handle)+'</span><span>'+pointsText(u.points)+' pts &middot; '+u.reports+' reports</span></div>';}).join(''):'<div style="color:var(--mut,#8b949e)">No entries yet.</div>';
    });
  });
}
/* title (optional) -- 2026-08-09, renamed the organelle-count stat from "centrioles/cilia" to
   "organelles" (Søren: label was undersellling what it actually counts -- see the tooltip below
   and u.organelles++ in Code.gs.txt's myStats aggregation, which increments for EVERY row in
   "Organelle locations", not just centriole/cilium; centriole and primary cilium reports just
   happen to be weighted higher toward points, see the 2pt-for-cilium comment there). */
function stat(v,label,title){return '<div class="stat"'+(title?' title="'+escHtml(title)+'"':'')+'><b>'+(v==null?0:v)+'</b><span>'+label+'</span></div>';}
function closeDashboard(){var d=document.getElementById("gameDash");if(d)d.style.display="none";}
function favStarHtml(nid,root,x,y,z){
  var on=window.FAV_SET&&(window.FAV_SET.has(String(nid))||window.FAV_SET.has(x+','+y+','+z));
  return '<span class="favstar" data-nid="'+nid+'" data-root="'+(root||"")+'" data-coord="'+x+','+y+','+z+'" title="'+(on?"In favourites":"Save to favourites")+'" style="cursor:pointer;margin-left:6px;font-size:15px;color:'+(on?"var(--accent)":"var(--mut)")+'">'+(on?"★":"☆")+'</span>';
}
// favourite star (event delegation)
document.addEventListener("click",function(e){
  var b=e.target&&e.target.closest?e.target.closest(".favstar"):null;if(!b)return;
  var nid=String(b.dataset.nid||"");
  if(!GOOGLE_VERIFIED){alert("Please sign in with Google to save favourites.");return;}
  var coord=String(b.dataset.coord||"");var on=window.FAV_SET.has(nid)||(coord&&window.FAV_SET.has(coord));
  if(on){window.FAV_SET.delete(nid);if(coord)window.FAV_SET.delete(coord);b.textContent="☆";b.style.color="var(--mut)";b.title="Save to favourites";
    postReport({type:"remove_favourite",timestamp:new Date().toISOString(),nucleusId:nid,coord:b.dataset.coord},"Removed from favourites.");}
  else{window.FAV_SET.add(nid);if(coord)window.FAV_SET.add(coord);b.textContent="★";b.style.color="var(--accent)";b.title="In favourites";
    postReport({type:"add_favourite",timestamp:new Date().toISOString(),nucleusId:nid,rootId:b.dataset.root,coord:b.dataset.coord},"Saved to favourites.");}
});
function gamifyInit(retries){
  gamifyInjectUI();
  if(!(window.google&&google.accounts&&google.accounts.id)){if(retries>0)setTimeout(function(){gamifyInit(retries-1);},350);else renderChip();return;}
  try{google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:handleGoogleCred,auto_select:true});}catch(_){}
  renderChip();
  if(GOOGLE_CLIENT_ID){try{google.accounts.id.prompt();}catch(_){}}
  if(GOOGLE_VERIFIED)gamifyOnSignIn();
}

UJ.gamify = {
  init: gamifyInit, onSignIn: gamifyOnSignIn, get: gamifyGet,
  loadMyStats: loadMyStats, loadFavourites: loadFavourites, refreshFavStars: refreshFavStars,
  renderChip: renderChip, openDashboard: openDashboard, closeDashboard: closeDashboard,
  downloadMyWork: downloadMyWork, favStarHtml: favStarHtml,
  loadProfileTotals: loadProfileTotals, profileTotalsHtml: profileTotalsHtml,
  combinedPoints: combinedPoints, perList: perList
};
