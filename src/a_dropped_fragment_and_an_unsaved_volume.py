"""A dropped fragment says so, and a volume that was not saved keeps its button.     2026-09-09

Søren, on πJump, three things in one message:

  1. *"When I found that this glia was missing a root ID i first pasted it in and submitted, then
     nothing happened, when I did it again, it did work."*
  2. *"But, then I tried Show in 3D and it had not included the root ID I submitted."*
  3. *"I clicked calculate volume, and it did that without me being signed in. But, there was no
     option to recalculate when I was signed in."*

and the observation that settles (2): *"I can see that the Neuroglancer instance does have the root
ID I proposed included."*

MEASURED ON THE LIVE PAGE FIRST, nucleus 7986, main root 648518346347452280, proposed
648518346341354380:

    ?rootIds=7986                       -> ONE row, segType "img65", by Søren Grubb
    MeshDL.currentFragmentCount(main)   -> 2          (so the panel and the count are fine)
    UJ.mesh.fetchCombinedMesh(main)     -> frags 1, rootIds ["648518346347452280"]
    fetchCombinedMesh(proposed) alone   -> "mesh is larger than 192 MB (128 fragments). This format
                                           has no coarser level to fall back to..."

So the proposed ID was never ignored by the page. Its mesh is refused by the size guard, and
`fetchCombinedMesh` drops a root ID it cannot fetch and returns the rest -- which is right, one bad
fragment should not cost the whole cell -- but it drops it SILENTLY. Neuroglancer includes the ID
because Neuroglancer streams it; this page has to fetch and decode the whole thing to draw it.

(Worth Søren knowing separately: 128 fragments and >192 MB is not a fragment of one glia. That ID
is almost certainly a large merged object in pinky100, not a piece of this cell.)

THE THREE FIXES

1. THE PANEL WAITED A FIXED 1500 ms. Apps Script had not appended the row yet, so the re-read
   returned the old list and the panel redrew unchanged -- indistinguishable from a submit that did
   nothing. The second click "worked" because by then the FIRST one's row was visible; the backend
   upserts by root ID, which is why the sheet holds one row after two clicks. Replaced by a poll
   that re-reads until the change is actually there (or ~9 s), so the wait matches the backend
   rather than a guess about it. Propose, vote and remove each say what "there" means for them.

2. A SKIPPED ROOT ID IS NOW NAMED. fetchCombinedMesh returns `skipped:[{rootId,message,meshCached}]`;
   Show in 3D prints it above the size line, and the volume row shows "— N fragments missing" with
   the reason in its tooltip.

3. A COMPUTE THAT WAS NOT SAVED NO LONGER LOCKS THE BUTTON. Computing signed out is deliberate (see
   maybeSaveComputedVolume) -- the number is for you. What was not deliberate: the button then hid
   itself for the session (`volFresh`) and the result went into the shared map as if saved, so
   signing in afterwards left no way to record it, on that cell, ever. The save gate is now asked
   BEFORE the button's state is decided; when it refuses, the button stays as "Save volume".

   And `stale` now compares against how many root IDs were ATTEMPTED (`combinedFrom`), not how many
   produced geometry -- otherwise this very cell, whose proposed fragment can never be fetched,
   would offer a recalculate forever that could never change the answer.

Run: python3 src/a_dropped_fragment_and_an_unsaved_volume.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ["ujump.html", "djump.html", "pjump.html"]

# ── core/mesh.js: a failure remembers which id it was, and travels back with the result ─────────
MESH = [
    ('''      }catch(err){
        console.warn("[uJump mesh] root ID "+rootIds[i]+" unavailable, skipping:",err&&err.message);
        failures.push(err);
      }''',
     '''      }catch(err){
        console.warn("[uJump mesh] root ID "+rootIds[i]+" unavailable, skipping:",err&&err.message);
        /* WHICH id failed, not just that one did. Dropping a root ID and carrying on is right --
           one unfetchable fragment should not cost the whole cell -- but doing it silently is how
           Søren concluded (2026-09-09, πJump) that his proposed root ID had been ignored, when in
           fact its mesh is 128 fragments and over 192 MB and the size guard refuses it. */
        try{err.rootId=rootIds[i];}catch(_e){}
        failures.push(err);
      }''',
     "a failure knows its root ID"),

    ('''    const mainUnavailable=usedIds.indexOf(String(mainRootIdStr))<0;''',
     '''    const mainUnavailable=usedIds.indexOf(String(mainRootIdStr))<0;
    /* Every candidate that was asked for and did not arrive, in the caller's hands rather than only
       in the console. Empty on the ordinary path, so a caller that ignores it is unchanged. */
    const skipped=failures.map(function(e){
      return {rootId:(e&&e.rootId)||"",message:(e&&e.message)||"unavailable",meshCached:!!(e&&e.meshCached)};
    });''',
     "the skipped list is built"),

    ('''      return {positions:m.positions,indices:m.indices,lod:m.lod,numLods:m.numLods,bytes:m.bytes,fragmentCount:1,rootIds:usedIds,mainUnavailable};''',
     '''      return {positions:m.positions,indices:m.indices,lod:m.lod,numLods:m.numLods,bytes:m.bytes,fragmentCount:1,rootIds:usedIds,mainUnavailable,skipped};''',
     "...and returned on the single-mesh path"),

    ('''    return {positions,indices,lod:null,numLods:null,bytes,fragmentCount:meshes.length,rootIds:usedIds,mainUnavailable};''',
     '''    return {positions,indices,lod:null,numLods:null,bytes,fragmentCount:meshes.length,rootIds:usedIds,mainUnavailable,skipped};''',
     "...and on the combined path"),
]

# ── core/mesh3d.js: the panel says what it could not draw ────────────────────────────────────────
MESH3D = [
    ('''        }).then(function(m){
          var geo = prepare(m.positions, m.indices,
            { unitNm: o.unitNm === undefined ? 1000 : o.unitNm, extentNm: o.extentNm });
          show(host, geo, { lead: o.lead ? o.lead(root, m, geo) : null,
                            emptyMessage: "This cell has no mesh geometry to draw." });''',
     '''        }).then(function(m){
          var geo = prepare(m.positions, m.indices,
            { unitNm: o.unitNm === undefined ? 1000 : o.unitNm, extentNm: o.extentNm });
          var lead = o.lead ? o.lead(root, m, geo) : null;
          /* A fragment that did not load is not a footnote. Søren, 2026-09-09, on πJump: "I tried
             Show in 3D and it had not included the root ID I submitted." It had tried; the mesh
             behind that ID is 128 fragments and over 192 MB, and fetchCombinedMesh dropped it and
             drew the rest without a word. Drawing one of two fragments and saying nothing is the
             one outcome that reads as the proposal having been ignored. */
          if (m.skipped && m.skipped.length){
            lead = (lead ? lead + "<br>" : "")
              + "<b style='color:var(--bad)'>" + m.skipped.length + " proposed root ID"
              + (m.skipped.length > 1 ? "s are" : " is") + " not drawn here.</b> <span class='hint'>"
              + m.skipped.map(function(s){
                  return esc(s.rootId || "(unknown)") + " — " + esc(s.message); }).join("; ")
              + "</span>";
          }
          show(host, geo, { lead: lead,
                            emptyMessage: "This cell has no mesh geometry to draw." });''',
     "the 3D panel names a fragment it could not fetch"),
]

# ── the pages: the propose panel waits for the row rather than for a stopwatch ───────────────────
PANEL = [
    ('''function loadRootIdPanel(nid,containerEl){''',
     '''/* ── THE ROW IS NOT THERE YET ────────────────────────────────────────────────────  2026-09-09
   Søren, on πJump: "When I found that this glia was missing a root ID i first pasted it in and
   submitted, then nothing happened, when I did it again, it did work."

   Nothing was wrong with the submit. The panel re-read itself 1500 ms later, Apps Script had not
   finished appending the row, the re-read returned the OLD list, and the panel redrew unchanged --
   which is indistinguishable from a submit that did nothing. The second click "worked" because by
   then the FIRST one's row was visible. The backend upserts by root ID, so two clicks left one row:
   the sheet looked fine and the page looked broken.

   A longer fixed delay only moves the line. This polls until the change is actually there, and the
   caller says what "there" means -- an ID that has appeared, one that has gone, a vote count that
   has moved -- so the same helper serves propose, remove and vote without any of them guessing.
   Gives up after ~9 s with one last render, so a write that genuinely failed still ends in a
   truthful panel rather than a spinner. */
function reloadRootIdPanelWhen(nid,containerEl,ready){
  var tries=0;
  (function again(){
    tries++;
    fetch(REPORT_ENDPOINT+"?rootIds="+encodeURIComponent(nid))
      .then(function(r){return r.json();})
      .then(function(d){
        var list=(d&&d.rootIds)||[];
        var done=false;
        try{done=!ready||!!ready(list);}catch(_e){done=true;}
        if(done||tries>=10){loadRootIdPanel(nid,containerEl);return;}
        setTimeout(again,900);
      })
      .catch(function(){loadRootIdPanel(nid,containerEl);});
  })();
}
function loadRootIdPanel(nid,containerEl){''',
     "the panel can wait for the backend"),

    ('''      if(postReport({type:"vote_root_id",timestamp:new Date().toISOString(),nucleusId:nid,rootId:b.dataset.rid,vote:Number(b.dataset.v)},"Vote recorded — thank you.")){if(!containerEl)window.__ridOpen=true;setTimeout(()=>loadRootIdPanel(nid,containerEl),1500);}''',
     '''      const wasRow=list.filter(function(x){return String(x.rootId)===String(b.dataset.rid);})[0];
      const wasNet=wasRow?Number(wasRow.net):null;
      if(postReport({type:"vote_root_id",timestamp:new Date().toISOString(),nucleusId:nid,rootId:b.dataset.rid,vote:Number(b.dataset.v)},"Vote recorded — thank you.")){if(!containerEl)window.__ridOpen=true;
        reloadRootIdPanelWhen(nid,containerEl,function(l){
          var r=l.filter(function(x){return String(x.rootId)===String(b.dataset.rid);})[0];
          return !r||wasNet===null||Number(r.net)!==wasNet;});}''',
     "a vote waits for the tally to move"),

    ('''      if(postReport({type:"remove_root_id",timestamp:new Date().toISOString(),nucleusId:nid,rootId:b.dataset.rid},"Removed.")){if(!containerEl)window.__ridOpen=true;setTimeout(()=>loadRootIdPanel(nid,containerEl),1500);}''',
     '''      if(postReport({type:"remove_root_id",timestamp:new Date().toISOString(),nucleusId:nid,rootId:b.dataset.rid},"Removed.")){if(!containerEl)window.__ridOpen=true;
        reloadRootIdPanelWhen(nid,containerEl,function(l){
          return !l.some(function(x){return String(x.rootId)===String(b.dataset.rid);});});}''',
     "a removal waits for the row to go"),

    ('''      if(postReport({type:"propose_root_id",timestamp:new Date().toISOString(),nucleusId:nid,rootId:v,segType:stv},"Proposed — thank you.")){if(!containerEl)window.__ridOpen=true;setTimeout(()=>loadRootIdPanel(nid,containerEl),1500);}''',
     '''      if(postReport({type:"propose_root_id",timestamp:new Date().toISOString(),nucleusId:nid,rootId:v,segType:stv},"Proposed — thank you.")){if(!containerEl)window.__ridOpen=true;
        reloadRootIdPanelWhen(nid,containerEl,function(l){
          return l.some(function(x){return String(x.rootId)===String(v);});});}''',
     "a proposal waits for its own row to appear"),
]

# ── the pages: the volume button ────────────────────────────────────────────────────────────────
VOLUME = [
    ('''        const effectiveRootId=rootId||(info.rootIds&&info.rootIds[0])||"";
        volBtn.dataset.volFresh="1";
        volBtn.dataset.origLabel="Compute volume";
        volBtn.style.display="none";
        if(window._computedVolumesMap){
          const freshEntry={volumeUm3:info.volumeUm3||0,nucVolumeUm3:volNucVolUm3||0,cellType:volLiveCellType||"",
            fragmentCount:info.fragmentCount||1,timestamp:new Date().toISOString()};
          computedVolCacheKeys(effectiveRootId,volNucleusId).forEach(function(key){window._computedVolumesMap[key]=freshEntry;});
        }''',
     '''        const effectiveRootId=rootId||(info.rootIds&&info.rootIds[0])||"";
        /* ── A COMPUTE THAT WAS NOT SAVED MUST NOT LOCK THE BUTTON ──────────────────  2026-09-09
           Søren, on πJump: "I clicked calculate volume, and it did that without me being signed in.
           But, there was no option to recalculate when I was signed in."

           Computing signed out is deliberate (see maybeSaveComputedVolume): the number is for you,
           and most people trying it are not signed in. What was NOT deliberate is what followed --
           the button hid itself for the rest of the session (data-vol-fresh) and the result went
           into _computedVolumesMap as though it had been saved, so signing in afterwards left no
           way to record it, on this cell, ever. The gate is asked here, BEFORE the button's state
           is decided, and when it refuses the button stays and says what it is now for. */
        const volGate=saveGateNote();
        volBtn.dataset.volFresh="1";
        volBtn.dataset.origLabel=volGate?"Save volume":"Compute volume";
        volBtn.textContent=volBtn.dataset.origLabel;
        volBtn.style.display=volGate?"":"none";
        if(window._computedVolumesMap){
          const freshEntry={volumeUm3:info.volumeUm3||0,nucVolumeUm3:volNucVolUm3||0,cellType:volLiveCellType||"",
            fragmentCount:info.fragmentCount||1,
            /* How many root IDs were ATTEMPTED, not how many produced geometry -- what "stale"
               has to compare against. πJump's proposed 648518346341354380 is 128 fragments and
               over 192 MB, refused by the size guard every single time, so counting only what
               arrived would leave this cell permanently "out of date", offering a recalculate that
               could never change its answer. Session-only: the sheet has no column for it, and a
               row read back without one falls through to fragmentCount, which is today's
               behaviour unchanged. */
            combinedFrom:(info.fragmentCount||1)+((info.skipped&&info.skipped.length)||0),
            skipped:(info.skipped||[]).slice(),
            unsaved:!!volGate, unsavedWhy:volGate||"",
            timestamp:new Date().toISOString()};
          computedVolCacheKeys(effectiveRootId,volNucleusId).forEach(function(key){window._computedVolumesMap[key]=freshEntry;});
        }''',
     "the gate decides the button, and the entry remembers what was skipped"),

    ('''          const combinedStr=info.fragmentCount>1?" ("+info.fragmentCount+" fragments combined)":"";
          /* ASKED BEFORE THE SAVE, so the tooltip written below states what is about to
             happen rather than repeating a hope. The call itself is still made further down. */
          const volGate=saveGateNote();
          if(valSpan){
            valSpan.textContent="≈ "+Math.round(info.volumeUm3).toLocaleString()+" µm³"
              +(volGate?" — not saved":"");''',
     '''          const combinedStr=info.fragmentCount>1?" ("+info.fragmentCount+" fragments combined)":"";
          /* volGate was asked above, before the button's state was decided -- so the tooltip states
             what is about to happen rather than repeating a hope, and the button and the sentence
             cannot disagree. */
          const skippedN=(info.skipped&&info.skipped.length)||0;
          const skippedStr=skippedN?(" "+skippedN+" proposed root ID"+(skippedN>1?"s were":" was")
            +" NOT included: "+info.skipped.map(function(s){return s.rootId+" ("+s.message+")";}).join("; ")+"."):"";
          if(valSpan){
            valSpan.textContent="≈ "+Math.round(info.volumeUm3).toLocaleString()+" µm³"
              +(skippedN?" — "+skippedN+" fragment"+(skippedN>1?"s":"")+" missing":"")
              +(volGate?" — not saved":"");''',
     "the number says a fragment is missing"),

    ('''            valSpan.title="Estimated from the decoded mesh geometry ("+info.vertices.toLocaleString()+" vertices)"+combinedStr+" — small gaps at fragment boundaries in the raw MICrONS mesh mean this is an estimate, not an exact figure."+fallbackStr+" "+(volGate||"Saved to the shared dashboard just now.")+" Click to copy.";''',
     '''            valSpan.title="Estimated from the decoded mesh geometry ("+info.vertices.toLocaleString()+" vertices)"+combinedStr+" — small gaps at fragment boundaries in the raw MICrONS mesh mean this is an estimate, not an exact figure."+fallbackStr+skippedStr+" "+(volGate||"Saved to the shared dashboard just now.")+" Click to copy.";''',
     "...and the tooltip says which one and why"),

    ('''    const savedFragCount=known.fragmentCount||1;''',
     '''    /* combinedFrom, when a compute in THIS session set it, is how many root IDs were attempted;
       fragmentCount is how many produced geometry. Comparing against the attempted count is what
       stops a cell with a permanently-unfetchable proposed fragment from reading as out of date
       forever. A row read back from the sheet has no combinedFrom and falls through unchanged. */
    const savedFragCount=known.combinedFrom||known.fragmentCount||1;''',
     "staleness counts what was attempted"),

    ('''      const volStr="≈ "+Math.round(known.volumeUm3).toLocaleString()+" µm³";''',
     '''      const volStr="≈ "+Math.round(known.volumeUm3).toLocaleString()+" µm³"
        +((known.skipped&&known.skipped.length)?" — "+known.skipped.length+" fragment"+(known.skipped.length>1?"s":"")+" missing":"")
        +(known.unsaved?" — not saved":"");''',
     "the volume row keeps saying it was not saved"),

    ('''    if(btn.dataset.volFresh==="1")return; // the click handler already set the button's final state itself
    if(!stale){''',
     '''    /* data-vol-fresh means the click handler owns this button's state. It stops being true the
       moment the world moves under it: another root ID proposed since (stale), or a result the save
       gate refused and that still needs signing in (unsaved). Until 2026-09-09 this was an
       unconditional return, which is exactly how a volume computed while signed out hid its own
       button for the rest of the session with nothing left to click. */
    if(btn.dataset.volFresh==="1"&&!stale&&!known.unsaved)return;
    if(stale||known.unsaved)btn.dataset.volFresh="";
    if(known.unsaved){
      if(btn.style.display!=="")btn.style.display="";
      const uTitle="This volume was computed but not saved. "+(known.unsavedWhy
        ||"Sign in with Google (top right) and run it again.")+" Clicking recomputes it and saves it.";
      if(btn.dataset.origLabel!=="Save volume"||btn.title!==uTitle){
        btn.textContent="Save volume";btn.dataset.origLabel="Save volume";btn.title=uTitle;}
      return;
    }
    if(!stale){''',
     "an unsaved volume keeps a button to save it with"),
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


edit("core/mesh.js", MESH)
edit("core/mesh3d.js", MESH3D)
for page in PAGES:
    edit(page, PANEL + VOLUME)
print("\nnow: node --check on each, then node rootidpanelcheck.js")
