/* ── core/report.js ─ shared reporting surface ─────────────────────────────────
   Extracted from ujump.html on 2026-08-18 (stage P5, after core/panel.js and core/tree.js).

   Four things moved, and they belong together because they are all about a report that is NOT a
   cell-type call:
     - showSubmitToast()                     — the "submitted / failed" confirmation
     - restoreClassification() / showUndoToast() — undo an identification, or restore an earlier one
     - the merged-nucleus report            — "this ONE detection is actually N nuclei"
     - the not-a-nucleus report             — "this detection is not a nucleus at all"

   The last two are deliberately shared rather than reinvented for βJump: an automatic nucleus
   detector oversplits and false-positives on ANY dataset, and βJump's outstanding
   position-correction work (bjump-spec §6: Merge and Reject) is exactly these two forms.

   NOT MOVED — postReport() itself. µJump's posts no-cors, returns a boolean, and fires the
   Google sign-in prompt when the user is not verified; βJump's posts JSON, returns a Promise and
   carries ds=bjump so the shared backend routes the row to the right spreadsheet. That is a real
   per-tool difference, not an accident, so it stays part of the host contract below rather than
   being forced into one shape.

   HOST CONTRACT
     required : postReport, escHtml, coordSpan, REPORT_ENDPOINT, REPORTER_NAME, REPORTER_EMAIL,
                GOOGLE_VERIFIED, GOOGLE_CLIENT_ID
     from core: ID_CTX / ID_PATH / ID_NODE, startNodeFor, closeIdentify, renderIdentify,
                leafSearchHtml, wireLeafSearch (core/tree.js);
                TREE / LEAF_NAMES / canonSubmitName (core/ontology.js);
                ORGANELLE_KIND_BY_VALUE / ORGANELLE_KIND_OPTIONS_HTML / organReportPointLabels
                (core/panel.js); gamifyInit (core/gamify.js)
     optional : mergedInfo, loadRootIdPanel, initGSI, saveReporterFromInput,
                loadClassificationHistory, unit / unitsEl — all behind `typeof …` guards

   Both forms render into the guided-identification panel (core/tree.js's UJ.cfg.tree.panelId),
   via renderIdentify()/closeIdentify(), so a page that configures an inline panel gets them
   inline too with no extra work. */
window.UJ = window.UJ || {};
UJ.report = UJ.report || {};
UJ.report.BUILD = "2026-08-18 stage-P5";

/* ==== submit toast  (was ujump.html lines 4375-4388) ==== */
function showSubmitToast(ok,msg){
  var t=document.getElementById("submitToast");
  if(!t){t=document.createElement("div");t.id="submitToast";
    t.style.cssText="position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;max-width:90vw;padding:12px 18px;border-radius:10px;font:14px/1.4 -apple-system,Segoe UI,sans-serif;color:#fff;box-shadow:0 6px 24px var(--shadow);opacity:0;transition:opacity .2s";
    document.body.appendChild(t);}
  // var(--ok)/var(--danger) rather than a fixed hex -- both stay dark/saturated enough in EITHER
  // theme for the toast's always-white text to stay readable (see the "THEME ARCHITECTURE" note
  // above :root for why the light-theme status colors are deliberately darker, not just faded).
  t.style.background=ok?"var(--ok)":"var(--danger)";
  t.textContent=(ok?"✓ ":"✗ ")+msg;
  t.style.opacity="1";
  clearTimeout(showSubmitToast._h);
  showSubmitToast._h=setTimeout(function(){t.style.opacity="0";},ok?4500:8000);
}

/* ==== undo + restore a classification  (was ujump.html lines 4389-4439) ==== */
/* Fire-and-forget "restore_classification" submission -- the shared plumbing behind the Undo
   toast below, the "Correct this" button on a reporter's OWN classification-history rows, and the
   admin-only "Restore this version" button (see renderCellHistory() in the cell-history panel
   code further down). Just a thin postReport() wrapper: the actual self-vs-admin / time-window
   authorization all happens server-side (see Code.gs.txt's restore_classification doPost branch
   and RESTORE_UNDO_WINDOW_MS's own comment) since postReport() is mode:"no-cors" and this client
   can never read whether a given restore actually succeeded. opts: {undoLast, targetTimestamp,
   reason, rootId, coord}. */
function restoreClassification(nucleusId,opts){
  opts=opts||{};
  postReport({
    type:"restore_classification",
    timestamp:new Date().toISOString(),
    nucleusId:nucleusId||"",rootId:opts.rootId||"",
    coord:opts.coord||"",
    undoLast:opts.undoLast===true,
    targetTimestamp:opts.targetTimestamp||"",
    reason:opts.reason||""
  },opts.undoLast===true?"Undo submitted.":"Restore submitted.");
}
/* "Undo" toast -- 2026-08-09 (Søren: "add Undo after submission... ensure accidental changes do
   not permanently overwrite existing classifications"). Shown right after every successful
   idfreport/idfcontribute submission (see those handlers above), separate from the plain
   ok/fail showSubmitToast() above so the two never fight over the same DOM node or clobber each
   other's countdown -- this one persists longer and carries an actionable button, that one is a
   quick pass/fail flash. Client-side visibility window (UNDO_TOAST_MS) is deliberately SHORTER
   than the server's own RESTORE_UNDO_WINDOW_MS enforcement (20 min) so that as long as the button
   is still on screen, clicking it is guaranteed to still be inside the server's own window --
   the toast disappearing is not the real deadline, it's just good UX (an undo button that's been
   sitting there for 20 minutes stops being about THIS submission and starts being confusing). */
const UNDO_TOAST_MS=45000;
function showUndoToast(nucleusId,rootId,pos){
  if(!nucleusId)return;
  var t=document.getElementById("undoToast");
  if(!t){
    t=document.createElement("div");t.id="undoToast";
    t.style.cssText="position:fixed;left:50%;bottom:76px;transform:translateX(-50%);z-index:99999;max-width:90vw;padding:10px 14px;border-radius:10px;font:13px/1.4 -apple-system,Segoe UI,sans-serif;color:var(--ink);background:var(--panel);border:1px solid var(--line);box-shadow:0 6px 24px var(--shadow);opacity:0;transition:opacity .2s;display:flex;align-items:center;gap:10px";
    document.body.appendChild(t);
  }
  var coord=pos?pos.join(","):"";
  t.innerHTML='<span>Submitted.</span><button id="undoToastBtn" class="idbtn" style="padding:3px 10px;font-size:12px">Undo</button>';
  t.style.opacity="1";
  document.getElementById("undoToastBtn").onclick=function(){
    restoreClassification(nucleusId,{undoLast:true,rootId:rootId,coord:coord,reason:"Undo (misclick) via the post-submission Undo toast."});
    t.innerHTML='<span>Undo submitted — refreshing history…</span>';
    setTimeout(()=>{t.style.opacity="0";},2000);
    setTimeout(()=>{if(typeof loadClassificationHistory==="function")loadClassificationHistory(nucleusId);},2500);
  };
  clearTimeout(showUndoToast._h);
  showUndoToast._h=setTimeout(function(){t.style.opacity="0";},UNDO_TOAST_MS);
}

/* ==== merged-nucleus reporting (one detection is actually N nuclei)  (was ujump.html lines 6551-6840) ==== */
/* ---------- Merged-nucleus reporting ----------
   Escape hatch from the guided-ID tree for when a single MICrONS nucleus detection is
   actually 2+ real nuclei fused together -- a known failure mode of the automatic detector
   (see the "merged nucleus segmentation" display in showNucleus()/renderStandalone() for
   Søren's own pre-verified examples of this, surfaced via MERGED/mergedInfo()). Rather than
   forcing one (necessarily wrong) identification through the tree, this lets a user flag the
   detection and roughly report each sub-nucleus's center + individual identity.
   Each sub-nucleus is posted as its own report row (type:"merged_split"), tied together by a
   shared groupId and subIndex/subCount, so multiple users' reports on the same detection can
   be compared later (both on how many nuclei they saw AND what they called each one) -- see
   the Apps Script reference doPost/doGet above (REPORT_ENDPOINT) for the sheet-side handling,
   which needs a "Merged splits" sheet and a few extra columns; the reference snippet has been
   updated to match. */
/* Compact, repeatable centriole/cilium mini-list embedded inside ONE merged-nucleus sub-row (see
   addRow() in renderMergedReport() below). Deliberately NOT reusing organelleFormHtml()/
   wireOrganelleForm() (the standalone "Report centriole / cilium location" flow further down)
   directly -- those come bundled with their own submit button, comment field and reporter-
   identity block, which would fire independently of (and out of sync with) the merged report's
   single "Submit merged-nucleus report" button. This is the same kind-dropdown/centriole-vs-
   cilium-fields pattern, just returning its collected rows to the CALLER instead of posting them
   itself -- getStructures() is read by the merged report's own submit handler once the whole
   form (all sub-nuclei) is ready to go, and returns null if any row here is left incomplete so
   the caller can alert and abort exactly like every other validation in that submit handler. */
function buildMergedRowOrganelleWidget(container){
  container.innerHTML='<div class="mrOrganRows"></div><button type="button" class="idbtn mrOrganAdd" style="margin-top:6px;padding:4px 10px;font-size:12px;width:auto">+ Add an organelle</button>';
  const rowsEl=container.querySelector(".mrOrganRows");
  function wirePasteSplit(xEl,yEl,zEl,focusAfter){
    xEl.addEventListener("input",e=>{
      const p=e.target.value.split(/[\s,]+/).filter(s=>s!=="");
      if(p.length>=3){e.target.value=p[0];yEl.value=p[1];zEl.value=p[2];if(focusAfter)focusAfter.focus();}
    });
  }
  function addRow(){
    // Same default convention as the main organelle-report form's addRow() (organReporterInput
    // et al. further down) -- first row defaults to Centriole, every row added after that
    // defaults to Primary cilium, per Søren's explicit request. Kept in sync by hand since this
    // is a genuinely separate widget (see the big comment above buildMergedRowOrganelleWidget for
    // why it isn't just a call into the main form).
    const isFirstRow=rowsEl.children.length===0;
    const row=document.createElement("div");
    row.style.cssText="border:1px dashed var(--line);border-radius:6px;padding:8px;margin-top:6px";
    row.innerHTML=
      '<div class="row" style="justify-content:space-between;align-items:center">'
      +'<span style="font-size:11px;color:var(--mut)">Structure</span>'
      +'<button type="button" class="mrOrganRemove" style="background:none;border:none;color:var(--mut);cursor:pointer;font-size:15px;line-height:1;padding:0 4px" title="Remove">&times;</button>'
      +'</div>'
      +'<select class="mrOrganKind" style="width:100%;margin-top:4px">'+ORGANELLE_KIND_OPTIONS_HTML+'</select>'
      +'<div class="mrOrganCentriole" style="margin-top:4px">'
      +'<div class="row" style="gap:6px"><div class="coord"><input type="text" class="mrocx" inputmode="decimal" placeholder="x"></div><div class="coord"><input type="text" class="mrocy" inputmode="decimal" placeholder="y"></div><div class="coord"><input type="text" class="mrocz" inputmode="decimal" placeholder="z"></div></div></div>'
      +'<div class="mrOrganCilium" style="margin-top:4px;display:none">'
      +'<label class="mrOrganLabelA" style="display:block;font-size:11px;color:var(--mut)">Base</label>'
      +'<div class="row" style="gap:6px"><div class="coord"><input type="text" class="mrobx" inputmode="decimal" placeholder="x"></div><div class="coord"><input type="text" class="mroby" inputmode="decimal" placeholder="y"></div><div class="coord"><input type="text" class="mrobz" inputmode="decimal" placeholder="z"></div></div>'
      +'<label class="mrOrganLabelB" style="display:block;font-size:11px;color:var(--mut);margin-top:4px">Tip</label>'
      +'<div class="row" style="gap:6px"><div class="coord"><input type="text" class="mrotx" inputmode="decimal" placeholder="x"></div><div class="coord"><input type="text" class="mroty" inputmode="decimal" placeholder="y"></div><div class="coord"><input type="text" class="mrotz" inputmode="decimal" placeholder="z"></div></div></div>';
    rowsEl.appendChild(row);
    row.querySelector(".mrOrganRemove").addEventListener("click",()=>row.remove());
    const kindEl=row.querySelector(".mrOrganKind");
    const cFields=row.querySelector(".mrOrganCentriole"),ciFields=row.querySelector(".mrOrganCilium");
    const labelA=row.querySelector(".mrOrganLabelA"),labelB=row.querySelector(".mrOrganLabelB");
    // isC means "is this kind the vector (two-point) shape" -- see the matching comment in the
    // main form's addRow() above for why this checks .vector rather than a hardcoded ==="cilium".
    kindEl.addEventListener("change",()=>{
      const info=ORGANELLE_KIND_BY_VALUE[kindEl.value];const isC=!!(info&&info.vector);
      cFields.style.display=isC?"none":"";ciFields.style.display=isC?"":"none";
      const pl=organReportPointLabels(kindEl.value);
      if(labelA)labelA.textContent=pl[0];if(labelB)labelB.textContent=pl[1];
    });
    /* First row defaults to Centriole, every row added after that defaults to Primary cilium, per
       Søren's explicit request -- previously relied on "centriole" simply being the browser's
       default first <option>, which broke silently once "ask_expert" became the true first entry
       in ORGANELLE_KINDS (2026-08-06). Now set explicitly on BOTH branches so this default no
       longer depends on list ordering at all. */
    if(isFirstRow){kindEl.value="centriole";}
    else{kindEl.value="cilium";cFields.style.display="none";ciFields.style.display="";}
    const cx=row.querySelector(".mrocx"),cy=row.querySelector(".mrocy"),cz=row.querySelector(".mrocz");
    const bx=row.querySelector(".mrobx"),by=row.querySelector(".mroby"),bz=row.querySelector(".mrobz");
    const tx=row.querySelector(".mrotx"),ty=row.querySelector(".mroty"),tz=row.querySelector(".mrotz");
    wirePasteSplit(cx,cy,cz);wirePasteSplit(bx,by,bz,tx);wirePasteSplit(tx,ty,tz);
  }
  container.querySelector(".mrOrganAdd").addEventListener("click",()=>addRow());
  return{
    getStructures(){
      const rows=[...rowsEl.children];
      const out=[];
      for(const row of rows){
        const kind=row.querySelector(".mrOrganKind").value;
        const info=ORGANELLE_KIND_BY_VALUE[kind];
        if(info&&info.vector){
          const bx=row.querySelector(".mrobx").value.trim(),by=row.querySelector(".mroby").value.trim(),bz=row.querySelector(".mrobz").value.trim();
          const tx=row.querySelector(".mrotx").value.trim(),ty=row.querySelector(".mroty").value.trim(),tz=row.querySelector(".mrotz").value.trim();
          if(bx===""||by===""||bz===""||tx===""||ty===""||tz==="")return null;
          out.push({kind,pointA:bx+","+by+","+bz,pointB:tx+","+ty+","+tz});
        } else {
          const x=row.querySelector(".mrocx").value.trim(),y=row.querySelector(".mrocy").value.trim(),z=row.querySelector(".mrocz").value.trim();
          if(x===""||y===""||z==="")return null;
          out.push({kind,pointA:x+","+y+","+z,pointB:""});
        }
      }
      return out;
    }
  };
}
function mergedFlagHtml(lead){
  return '<div style="margin-top:10px"><span class="hint">&#9888; '+(lead||"Looks like more than one nucleus fused into this one detection?")+' <span class="idf-back" id="idfMergedFlag" style="margin:0">Report a merged nucleus instead &rarr;</span></span></div>';
}
function wireMergedFlag(returnFn){
  const b=document.getElementById("idfMergedFlag");
  if(b)b.addEventListener("click",()=>renderMergedReport(returnFn));
}
function renderMergedReport(returnFn){
  /* The guided-ID panel, via core/tree.js's UJ.cfg.tree.panelId rather than a hardcoded
     "idfpanel" -- βJump renders the tree INLINE into #idbox, so a literal id here would make
     both of these forms silently do nothing there (panel === null, then a thrown TypeError
     inside a click handler). Found by reportcheck.js's minimal host, 2026-08-18. */
  const panel=(typeof treePanel==="function")?treePanel():document.getElementById("idfpanel");
  if(!panel)return;
  let h='<div class="idf-head"><div><div class="idf-title">Report a merged nucleus</div></div><button class="idf-close" id="idfclose" title="close">&times;</button></div>';
  h+='<span class="idf-back" id="idfback">&larr; back to guided identification</span>';
  h+='<p class="hint">MICrONS&rsquo;s automatic nucleus detector sometimes fuses 2+ real, distinct nuclei into a single detection. If that looks like what&rsquo;s happening here, report roughly where each real nucleus sits and, if you can tell, what each one is &mdash; rather than forcing one identification onto the whole blob.</p>';
  h+='<div class="meta">Parent detection: '+(ID_CTX.nucId?"nucleus "+ID_CTX.nucId:"no nucleus ID on file")+(ID_CTX.root?" &middot; root "+ID_CTX.root:"")+(ID_CTX.pos?" &middot; voxel ("+coordSpan(ID_CTX.pos[0],ID_CTX.pos[1],ID_CTX.pos[2])+")":"")+'</div>';
  h+='<div id="mergedRows"></div>';
  h+='<button type="button" class="idbtn" id="mergedAddRow" style="margin-top:8px;padding:6px 10px;font-size:13px;width:auto">+ Add another nucleus</button>';
  h+='<label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin-top:14px">Comments (optional)</label>'
    +'<textarea id="mergedComment" placeholder="e.g. hard to tell exactly where the boundary between them is..."></textarea>';
  if(!GOOGLE_VERIFIED){
  h+='<div class="idf-identity" style="margin-top:10px"><label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin-bottom:4px">Want credit for this report, or a heads-up if it&rsquo;s confirmed? <span class="gate-note" style="text-transform:none;letter-spacing:normal;color:var(--accent)">— Google sign-in required to submit</span></label>'
    +'<input type="text" id="reporterInput" placeholder="name or email" value="'+(REPORTER_EMAIL||REPORTER_NAME||"").replace(/"/g,'&quot;')+'" style="width:100%;margin-bottom:6px">'
    +'<div id="gsiButton"></div></div>';
  } else {
    h+='<div class="meta" style="margin-top:8px;color:var(--accent)">Submitting as '+escHtml(REPORTER_EMAIL||REPORTER_NAME)+' &mdash; signed in with Google.</div>';
  }
  h+='<div class="idf-actions"><button class="idbtn idbtn-submit" id="mergedSubmit">Submit merged-nucleus report</button>'
    +'<button class="idbtn" id="idfrestart">Start over</button></div>'
    +'<div id="idfThanks"></div>';
  panel.innerHTML=h;
  document.getElementById("idfclose").addEventListener("click",closeIdentify);
  document.getElementById("idfback").addEventListener("click",()=>{if(returnFn)returnFn();else renderIdentify();});
  document.getElementById("idfrestart").addEventListener("click",()=>{ID_PATH=[];ID_NODE=startNodeFor(ID_CTX);renderIdentify();});
  const rin=document.getElementById("reporterInput");
  if(rin){rin.addEventListener("change",()=>{if(typeof saveReporterFromInput==="function")saveReporterFromInput(rin.value.trim());});if(typeof initGSI==="function")initGSI(10);}
  const rowsEl=document.getElementById("mergedRows");
  let rowCounter=0; // monotonic -- children.length would collide after a remove+re-add
  function renumberRows(){
    [...rowsEl.children].forEach((row,i)=>{const n=row.querySelector(".merged-row-num");if(n)n.textContent=String(i+1);});
  }
  function addRow(prefill){
    const pfx="mergedRow"+(rowCounter++);
    const row=document.createElement("div");
    row.className="merged-row";
    row.style.cssText="border:1px solid var(--line);border-radius:6px;padding:10px;margin-top:8px";
    row.innerHTML=
      '<div class="row" style="justify-content:space-between;align-items:center">'
      +'<span style="font-size:12px;color:var(--mut)">Nucleus <span class="merged-row-num"></span></span>'
      +'<button type="button" class="merged-row-remove" style="background:none;border:none;color:var(--mut);cursor:pointer;font-size:16px;line-height:1;padding:0 4px" title="Remove this nucleus">&times;</button>'
      +'</div>'
      +(prefill&&prefill.knownType?'<div class="meta" style="margin-top:2px">known from Søren’s own verified data: <b>'+prefill.knownType+'</b> (confirm below rather than assuming it carries over)</div>':'')
      +'<label style="display:block;font-size:11px;color:var(--mut);margin-top:6px">Approx. center (voxel)</label>'
      +'<div class="row" style="gap:8px;margin-top:2px">'
      +'<div class="coord"><input type="text" class="mrx" inputmode="decimal" placeholder="x"></div>'
      +'<div class="coord"><input type="text" class="mry" inputmode="decimal" placeholder="y"></div>'
      +'<div class="coord"><input type="text" class="mrz" inputmode="decimal" placeholder="z"></div>'
      +'<button type="button" class="idbtn merged-row-jump" style="padding:4px 10px;font-size:12px;width:auto">Jump &#8599;</button>'
      +'</div>'
      +'<p class="hint" style="margin-top:2px">Paste "x, y, z" into the x field &mdash; it splits automatically.</p>'
      +'<div style="margin-top:6px">'+leafSearchHtml(pfx,"Identity — click a suggestion to select (optional; leave blank if unsure)")+'</div>'
      +'<label style="display:block;font-size:11px;color:var(--mut);margin-top:8px">Certainty (optional)</label>'
      +'<select class="merged-row-cert" style="width:100%"><option value="">not sure</option><option value="1">1 — not sure</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5 — certain</option></select>'
      /* Root ID + additional root/nucleus IDs + centriole/cilium, added 2026-07-30 per Søren's
         request: since the nucleus DETECTOR merged these into one detection but the underlying
         cell SEGMENTATION is a separate process, each sub-nucleus almost certainly has its own
         real, distinct root ID -- capturing it here (plus organelle locations) is what makes a
         reported sub-cell independently findable later (random-example picker, bulk filter/
         Excel export, and jumping straight back to its own coordinate) instead of forever being
         a footnote buried in the parent nucleus's report thread. See renderMergedSubCell() and
         MERGED_SUB_REPORTS_CACHE for the read side of this. */
      +'<label style="display:block;font-size:11px;color:var(--mut);margin-top:8px">Root ID (if known)</label>'
      +'<input type="text" class="merged-row-rootid" inputmode="numeric" placeholder="numeric root ID, if you found one">'
      +'<div class="merged-row-ridpanel" style="margin-top:6px"></div>'
      +'<label style="display:block;font-size:11px;color:var(--mut);margin-top:10px">Centriole / primary cilium (optional)</label>'
      +'<div class="merged-row-organ" style="margin-top:2px"></div>';
    rowsEl.appendChild(row);
    row.querySelector(".merged-row-remove").addEventListener("click",()=>{
      if(rowsEl.children.length<=2){alert("At least 2 nuclei are needed to report a merge — use “Start over” instead if that’s not what you meant to report.");return;}
      row.remove();renumberRows();
    });
    row.querySelector(".merged-row-jump").addEventListener("click",()=>{
      const x=row.querySelector(".mrx").value,y=row.querySelector(".mry").value,z=row.querySelector(".mrz").value;
      if(x===""||y===""||z===""){alert("Fill in x, y and z first.");return;}
      if(typeof unitsEl!=="undefined"&&unitsEl){unit="voxel";[...unitsEl.children].forEach(c=>c.classList.toggle("on",c.dataset.u==="voxel"));}
      document.getElementById("x").value=x;document.getElementById("y").value=y;document.getElementById("z").value=z;document.getElementById("go").click();
    });
    const xEl=row.querySelector(".mrx"),yEl=row.querySelector(".mry"),zEl=row.querySelector(".mrz");
    /* The "+ additional root/nucleus IDs" propose/vote panel is keyed by this row's OWN
       coordinate string (same convention as the existing no-nucleus-point call to
       loadRootIdPanel() elsewhere in the file) -- refreshed on blur so it always reflects
       whatever x/y/z is currently filled in, and left blank/inert until all three are set. */
    const ridPanel=row.querySelector(".merged-row-ridpanel");
    function refreshRidPanel(){
      const x=xEl.value.trim(),y=yEl.value.trim(),z=zEl.value.trim();
      if(x===""||y===""||z===""){ridPanel.innerHTML='<span class="hint">Fill in x/y/z above to propose additional root or nucleus IDs for this sub-cell.</span>';return;}
      if(typeof loadRootIdPanel==="function")loadRootIdPanel(x+","+y+","+z,ridPanel);
    }
    xEl.addEventListener("input",e=>{
      const p=e.target.value.split(/[\s,]+/).filter(s=>s!=="");
      if(p.length>=3){e.target.value=p[0];yEl.value=p[1];zEl.value=p[2];}
    });
    [xEl,yEl,zEl].forEach(el=>el.addEventListener("blur",refreshRidPanel));
    if(prefill&&prefill.pos){xEl.value=prefill.pos[0];yEl.value=prefill.pos[1];zEl.value=prefill.pos[2];}
    refreshRidPanel();
    row.__organWidget=buildMergedRowOrganelleWidget(row.querySelector(".merged-row-organ"));
    wireLeafSearch(pfx,slug=>{
      const input=document.getElementById(pfx+"Input");
      if(input)input.value=LEAF_NAMES[slug];
      row.dataset.slug=slug;
      const results=document.getElementById(pfx+"Results");if(results)results.classList.remove("show");
    });
    renumberRows();
  }
  /* Pre-fill from Søren's own MERGED data when this parent nucleus already has a known split
     on file -- position only carries over when a real per-cell centriole coordinate exists
     (sub-cells otherwise all share the single parent nucleus centroid, which isn't useful to
     copy in); the identity is shown as a hint, not auto-selected, so the reporter is
     confirming it independently rather than the tool silently pre-answering. */
  const known=(ID_CTX.nucId&&typeof mergedInfo==="function")?mergedInfo(parseInt(ID_CTX.nucId,10)):null;
  if(known&&known.length>=2){
    for(const m of known)addRow({pos:m.centriole||null,knownType:m.type});
  } else {
    addRow();addRow();
  }
  document.getElementById("mergedAddRow").addEventListener("click",()=>addRow());
  const submitBtn=document.getElementById("mergedSubmit");
  submitBtn.addEventListener("click",()=>{
    if(!REPORT_ENDPOINT){alert("Reporting isn't wired up yet — set REPORT_ENDPOINT near the top of the script (see the comment above it) to a Google Apps Script web app URL.");return;}
    const rows=[...rowsEl.children];
    if(rows.length<2){alert("Add at least 2 nuclei.");return;}
    let allFilled=true,organIncomplete=false;
    const subs=rows.map(row=>{
      const x=row.querySelector(".mrx").value.trim(),y=row.querySelector(".mry").value.trim(),z=row.querySelector(".mrz").value.trim();
      if(x===""||y===""||z==="")allFilled=false;
      const slug=row.dataset.slug;
      const subRootId=row.querySelector(".merged-row-rootid").value.trim();
      const structures=row.__organWidget?row.__organWidget.getStructures():[];
      if(structures===null)organIncomplete=true;
      return{coord:x+","+y+","+z,identified:slug?canonSubmitName(LEAF_NAMES[slug]):"",certainty:row.querySelector(".merged-row-cert").value,subRootId,structures:structures||[]};
    });
    if(!allFilled){alert("Please fill in an approximate x/y/z center for every nucleus listed.");return;}
    if(organIncomplete){alert("Please fill in every coordinate field for each organelle/structure listed (or remove the incomplete row).");return;}
    const commentEl=document.getElementById("mergedComment");
    const comment=commentEl?commentEl.value.trim():"";
    const path=ID_PATH.map(n=>(TREE[n]?TREE[n].q:n)).join(" > ");
    const groupId=(ID_CTX.nucId||"nonuc")+"_"+Date.now();
    submitBtn.disabled=true;submitBtn.textContent="submitting…";
    subs.forEach((s,i)=>postReport({
      type:"merged_split",
      timestamp:new Date().toISOString(),
      nucleusId:ID_CTX.nucId||"",rootId:ID_CTX.root||"",
      coord:s.coord,
      groupId,subIndex:i+1,subCount:subs.length,
      identified:s.identified,certainty:s.certainty,
      /* subRootId is this SUB-CELL's own reported root ID -- deliberately a different field
         from rootId above, which stays the PARENT/whole-detection's root ID for traceability.
         See the "Merged splits" sheet schema note in the Apps Script reference (REPORT_ENDPOINT)
         -- this needs its own column, added 2026-07-30 alongside this feature. */
      subRootId:s.subRootId,
      comment,path
    }));
    /* Centriole/cilium structures collected per sub-row are posted as ordinary
       organelle_location reports (same type/shape as the standalone "Report centriole / cilium
       location" flow below), keyed by the SUB-CELL's own coordinate rather than the parent
       nucleus's, since that's what organellesNearPos() actually matches against for display.
       nucleusId is deliberately left BLANK here, NOT the parent's -- the existing
       ?newCellOrganelles=1 bulk endpoint that feeds organellesNearPos() only returns rows with
       a blank nucleusId (see its doPost/doGet comments above), on the reasoning that a row with
       a real nucleusId belongs to the ordinary per-nucleus lookup instead. A merged sub-cell has
       no independent nucleus detection of its own -- same underlying situation as a "new cell,
       no nucleus" report -- so blank is actually the more correct value here, not just a
       workaround. rootId is kept as the PARENT's, for whatever traceability that still offers. */
    subs.forEach((s,i)=>{
      if(!s.structures.length)return;
      const organGroupId=groupId+"_sub"+(i+1)+"_org";
      s.structures.forEach((st,j)=>postReport({
        type:"organelle_location",
        timestamp:new Date().toISOString(),
        nucleusId:"",rootId:ID_CTX.root||"",
        coord:s.coord,
        groupId:organGroupId,subIndex:j+1,subCount:s.structures.length,
        kind:st.kind,pointA:st.pointA,pointB:st.pointB,
        identified:s.identified||"",
        comment,path
      }));
    });
    submitBtn.textContent="submitted";
    document.getElementById("idfThanks").innerHTML='<div class="idf-flag" style="border-color:var(--accent);color:var(--accent);margin-top:10px">Thanks — your merged-nucleus report ('+subs.length+' nuclei) has been logged against this detection. Once it&rsquo;s re-segmented, these sub-identities help confirm the split. Any sub-cell you gave a root ID and an identity for should now be findable on its own — jump to its coordinate again, or look for it via the random-example picker or the bulk cell-type filter.</div>';
  });
}

/* ==== not-a-nucleus reporting (false detection)  (was ujump.html lines 6855-6916) ==== */
/* ---------- "Not a nucleus" (segmentation artifact) reporting ----------
   Escape hatch for when a MICrONS nucleus detection isn't a real nucleus at all -- a myelin
   swirl, a vessel-wall fragment, a stray segmentation glitch, etc. -- so it can be flagged
   without forcing a cell-type identification onto a false positive. Deliberately only offered
   on the FIRST guided-ID screen (see the `if(first)` gate in renderIdentify()), since this is a
   front-loaded decision, unlike the merged-nucleus flag which stays available at every tree
   step. Unlike the merged-nucleus and organelle reports above, this posts a single row per
   submission (no repeatable sub-rows) -- but per Søren's explicit choice, these reports are
   fully integrated back into the tool exactly like merged-nucleus reports are: they count as
   "reported" for the needs-attention filter tiers, show a community warning on the main nucleus
   panel, and appear (tagged) in the Excel "Community report details" column -- see the doPost/
   doGet reference code above (REPORT_ENDPOINT), which needs a "Not a nucleus" sheet; the
   reference snippet has been updated to match. */
function notNucleusFlagHtml(){
  return '<div style="margin-top:10px"><span class="hint">&#9888; Doesn&rsquo;t look like a real nucleus at all &mdash; could be a segmentation artifact? <span class="idf-back" id="idfNotNucleusFlag" style="margin:0">Flag as not a nucleus &rarr;</span></span></div>';
}
function wireNotNucleusFlag(returnFn){
  const b=document.getElementById("idfNotNucleusFlag");
  if(b)b.addEventListener("click",()=>renderNotNucleusReport(returnFn));
}
function renderNotNucleusReport(returnFn){
  /* The guided-ID panel, via core/tree.js's UJ.cfg.tree.panelId rather than a hardcoded
     "idfpanel" -- βJump renders the tree INLINE into #idbox, so a literal id here would make
     both of these forms silently do nothing there (panel === null, then a thrown TypeError
     inside a click handler). Found by reportcheck.js's minimal host, 2026-08-18. */
  const panel=(typeof treePanel==="function")?treePanel():document.getElementById("idfpanel");
  if(!panel)return;
  let h='<div class="idf-head"><div><div class="idf-title">Flag as not a nucleus</div></div><button class="idf-close" id="idfclose" title="close">&times;</button></div>';
  h+='<span class="idf-back" id="idfback">&larr; back to guided identification</span>';
  h+='<p class="hint">MICrONS&rsquo;s automatic nucleus detector sometimes fires on something that isn&rsquo;t actually a nucleus &mdash; a myelin swirl, a vessel-wall fragment, a segmentation glitch, etc. Use this instead of forcing a cell-type identification onto a false detection.</p>';
  h+='<div class="meta">Detection: '+(ID_CTX.nucId?"nucleus "+ID_CTX.nucId:"no nucleus ID on file")+(ID_CTX.root?" &middot; root "+ID_CTX.root:"")+(ID_CTX.pos?" &middot; voxel ("+coordSpan(ID_CTX.pos[0],ID_CTX.pos[1],ID_CTX.pos[2])+")":"")+'</div>';
  h+='<label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin-top:12px">What does it actually look like? <span style="text-transform:none;letter-spacing:normal">(optional, but helpful)</span></label>'
    +'<textarea id="nnComment" placeholder="e.g. myelin swirl, vessel wall fragment, segmentation glitch..."></textarea>';
  if(!GOOGLE_VERIFIED){
  h+='<div class="idf-identity" style="margin-top:10px"><label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin-bottom:4px">Want credit for this report, or a heads-up if it&rsquo;s confirmed? <span class="gate-note" style="text-transform:none;letter-spacing:normal;color:var(--accent)">— Google sign-in required to submit</span></label>'
    +'<input type="text" id="reporterInput" placeholder="name or email" value="'+(REPORTER_EMAIL||REPORTER_NAME||"").replace(/"/g,'&quot;')+'" style="width:100%;margin-bottom:6px">'
    +'<div id="gsiButton"></div></div>';
  } else {
    h+='<div class="meta" style="margin-top:8px;color:var(--accent)">Submitting as '+escHtml(REPORTER_EMAIL||REPORTER_NAME)+' &mdash; signed in with Google.</div>';
  }
  h+='<div class="idf-actions"><button class="idbtn idbtn-submit" id="nnSubmit">Submit flag</button>'
    +'<button class="idbtn" id="idfrestart">Start over</button></div>'
    +'<div id="idfThanks"></div>';
  panel.innerHTML=h;
  document.getElementById("idfclose").addEventListener("click",closeIdentify);
  document.getElementById("idfback").addEventListener("click",()=>{if(returnFn)returnFn();else renderIdentify();});
  document.getElementById("idfrestart").addEventListener("click",()=>{ID_PATH=[];ID_NODE=startNodeFor(ID_CTX);renderIdentify();});
  const rin=document.getElementById("reporterInput");
  if(rin){rin.addEventListener("change",()=>{if(typeof saveReporterFromInput==="function")saveReporterFromInput(rin.value.trim());});if(typeof initGSI==="function")initGSI(10);}
  const submitBtn=document.getElementById("nnSubmit");
  submitBtn.addEventListener("click",()=>{
    if(!REPORT_ENDPOINT){alert("Reporting isn't wired up yet — set REPORT_ENDPOINT near the top of the script (see the comment above it) to a Google Apps Script web app URL.");return;}
    const commentEl=document.getElementById("nnComment");
    const comment=commentEl?commentEl.value.trim():"";
    const path=ID_PATH.map(n=>(TREE[n]?TREE[n].q:n)).join(" > ");
    submitBtn.disabled=true;submitBtn.textContent="submitting…";
    postReport({
      type:"not_a_nucleus",
      timestamp:new Date().toISOString(),
      nucleusId:ID_CTX.nucId||"",rootId:ID_CTX.root||"",
      coord:ID_CTX.pos?ID_CTX.pos.join(","):"",
      comment,path
    });
    submitBtn.textContent="submitted";
    document.getElementById("idfThanks").innerHTML='<div class="idf-flag" style="border-color:var(--accent);color:var(--accent);margin-top:10px">Thanks — this detection has been flagged for review.</div>';
  });
}
