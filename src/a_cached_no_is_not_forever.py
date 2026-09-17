# -*- coding: utf-8 -*-
"""A cached "no" is not forever, and the propose form never disappears.        2026-09-17

Søren, on µJump, nucleus 264317 (main root 864691135499287571):

  *"I tried to add a root ID to this cell after it failed to compute volume, then after it had
  registered it, it said cached unavailable. We had this problem previously, but we fixed it. Now
  it is back. Also, now the propose root ID option is gone."*

MEASURED FIRST, against the live backend from his own browser:

    ?rootIds=264317  ->  {"rootIds":[{"rootId":"864691135099837472","by":"Søren Grubb",
                                      "up":0,"down":0,"net":0,"segType":"img65"}]}

So the proposal IS registered and the endpoint IS healthy. Driving the shipped page locally, the
panel renders and CUR_EXTRA_ROOTS fills. Nothing is structurally broken -- which is why this fixes
the four things that let the same two sentences be true anyway.

1. A CACHED "NOT FOUND" OUTLIVES THE REASON FOR IT. `markRootNotFound` writes to localStorage and
   nothing ever removes one entry. So: compute -> not in the seg_m1300 snapshot -> cached. Propose
   a root ID -> the cache is untouched. Compute again -> "⊘ cached unavailable", forever, on both
   IDs once each has failed once. Proposing an ID is a person saying the situation changed, so it
   now FORGETS the cached "no" for that ID and for the cell's own main root ID. The next click does
   a real network check. (`UJ.mesh.forgetRootNotFound`, one id, not the whole cache.)

2. THE BUTTON TRUSTED A GLOBAL. `extraImg65RootIds()` reads CUR_EXTRA_ROOTS, which only holds
   whatever `loadRootIdPanel` last resolved for whichever panel is on screen. Every ordering where
   that global is empty or stale at click time -- a slow `?rootIds=` fetch, a second panel rendered
   since, a propose whose re-read is still in flight -- silently computes the cell WITHOUT the ID
   just proposed, and with one candidate left the error is the singular "is cached as unavailable"
   he quoted. The three buttons now ask the backend at click time (`fetchExtraRootIdsFor`, already
   written for Cell contacts) and pass the answer as `extraRootIdsOverride`. An empty or failed
   lookup passes `undefined`, which is the old global path exactly, so nothing regresses.

3. THE PROPOSE FORM DISAPPEARS ON A BAD FETCH. `loadRootIdPanel`'s tail was
   `.catch(()=>{})` over an element it had already emptied -- so any hiccup in `?rootIds=` removes
   the ONLY way to propose a root ID, with no error and nothing left on screen. The form is not
   made of the list; it renders either way now, and says when the list could not be read.

4. AND WHEN IT IS THERE IT DOES NOT SAY "PROPOSE". It was a faint grey "▶ additional root / nucleus
   IDs (1)", collapsed by default on a fresh load. Someone looking for where to propose a root ID
   is looking for the word. It is now in the label, and a mesh/volume failure opens the panel
   instead of leaving a five-second button label as the only hint -- and that label now says what
   to do (shift-click rechecks) rather than only that something is cached.

Run: python3 src/a_cached_no_is_not_forever.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ["ujump.html", "djump.html", "pjump.html"]

# ── core/mesh.js: one id can be forgotten, and a caller can name the extras ──────────────────────
MESH = [
    ("""   Public surface: downloadRoot, downloadRootPptx, computeVolume, clearMeshNotFoundCache,
   currentFragmentCount, fetchCombinedMesh.""",
     """   Public surface: downloadRoot, downloadRootPptx, computeVolume, clearMeshNotFoundCache,
   forgetRootNotFound, currentFragmentCount, fetchCombinedMesh.""",
     "the header lists it too"),

    ('''  function clearMeshNotFoundCache(){notFoundCache=new Map();try{localStorage.removeItem(MESH_NOT_FOUND_KEY);}catch(_e){}}''',
     '''  function clearMeshNotFoundCache(){notFoundCache=new Map();try{localStorage.removeItem(MESH_NOT_FOUND_KEY);}catch(_e){}}
  /* ── A CACHED "NO" IS NOT FOREVER ──────────────────────────────────────────────  2026-09-17
     Søren, µJump nucleus 264317: "I tried to add a root ID to this cell after it failed to compute
     volume, then after it had registered it, it said cached unavailable."

     The cache is right about the snapshot -- seg_m1300 is frozen, and an ID absent from its shard
     index today will be absent tomorrow. It is wrong about the CELL: proposing a root ID is a
     person saying this cell has another ID worth trying, and until now that changed nothing, so
     the pair (main, proposed) stayed a dead end whichever one you clicked. One id at a time, not
     clearMeshNotFoundCache(), so forgetting this cell's verdict costs no other cell its own. */
  function forgetRootNotFound(rootIdStr){
    var c=loadNotFoundCache();
    if(!c.has(String(rootIdStr)))return false;
    c.delete(String(rootIdStr));saveNotFoundCache();return true;
  }''',
     "one root ID can be forgotten without clearing the cache"),

    ('''  async function downloadRoot(rootIdStr,onProgress,forceRecheck){
    const {positions:rawPositions,indices:rawIndices,lod,numLods,bytes,fragmentCount,rootIds,mainUnavailable,skipped,simplified}=await fetchCombinedMesh(rootIdStr,onProgress,forceRecheck);''',
     '''  /* extraRootIds (2026-09-17): the proposals as the BACKEND has them at click time, handed
     straight to fetchCombinedMesh's extraRootIdsOverride. Omitted -- which is every caller that
     existed before -- it stays undefined and the old CUR_EXTRA_ROOTS global path runs unchanged. */
  async function downloadRoot(rootIdStr,onProgress,forceRecheck,extraRootIds){
    const {positions:rawPositions,indices:rawIndices,lod,numLods,bytes,fragmentCount,rootIds,mainUnavailable,skipped,simplified}=await fetchCombinedMesh(rootIdStr,onProgress,forceRecheck,extraRootIds);''',
     "downloadRoot can be told which extras to combine"),

    ('''  async function computeVolume(rootIdStr,onProgress,forceRecheck){''',
     '''  async function computeVolume(rootIdStr,onProgress,forceRecheck,extraRootIds){''',
     "computeVolume takes the same list"),

    ('''    const {positions,indices,fragmentCount,rootIds,mainUnavailable,skipped,simplified}=await fetchCombinedMesh(rootIdStr,onProgress,forceRecheck);''',
     '''    const {positions,indices,fragmentCount,rootIds,mainUnavailable,skipped,simplified}=await fetchCombinedMesh(rootIdStr,onProgress,forceRecheck,extraRootIds);''',
     "...and passes it on"),

    ('''  async function downloadRootPptx(rootIdStr,cellTypeName,coordStr,onProgress,forceRecheck){
    const geo=await fetchCombinedMesh(rootIdStr,onProgress,forceRecheck);''',
     '''  async function downloadRootPptx(rootIdStr,cellTypeName,coordStr,onProgress,forceRecheck,extraRootIds){
    const geo=await fetchCombinedMesh(rootIdStr,onProgress,forceRecheck,extraRootIds);''',
     "...and so does the PowerPoint download"),

    ('''  return {downloadRoot,downloadRootPptx,computeVolume,clearMeshNotFoundCache,currentFragmentCount,''',
     '''  return {downloadRoot,downloadRootPptx,computeVolume,clearMeshNotFoundCache,forgetRootNotFound,currentFragmentCount,''',
     "forgetRootNotFound is exported"),
]

# ── the pages: the form is not made of the list, and proposing forgets the cached "no" ───────────
PANEL = [
    ('''function loadRootIdPanel(nid,containerEl){''',
     '''/* ── THE FORM IS NOT MADE OF THE LIST ────────────────────────────────────────────  2026-09-17
   Søren, on µJump: *"Also, now the propose root ID option is gone."*

   loadRootIdPanel() empties #rootIdPanel, fetches ?rootIds=, and renders. Its tail was
   `.catch(()=>{})`. So one bad response -- an Apps Script hiccup, a redeploy mid-load, anything --
   and the element stays empty: the only way to propose a root ID for a cell vanishes, silently,
   with the page otherwise looking perfectly healthy. The list is a fetch; the FORM is not, and it
   renders whether or not the list arrived. When it did not, the panel says so rather than pretending
   the cell has no proposals.

   Opened on demand too: a mesh or volume failure is exactly the moment somebody needs this, and a
   grey collapsed line is not where they will look for it. */
function offerRootIdProposal(){
  try{
    var el=document.getElementById("rootIdPanel");if(!el)return;
    var bod=el.querySelector("#ridBody"),tog=el.querySelector("#ridToggle");
    window.__ridOpen=true;
    if(bod&&bod.style.display==="none"){
      bod.style.display="block";
      if(tog)tog.textContent="\\u25bc "+tog.textContent.replace(/^[\\u25b6\\u25bc]\\s*/,"");
    }
  }catch(_e){}
}
/* ── PROPOSING IS A REASON TO CHECK AGAIN ────────────────────────────────────────  2026-09-17
   The not-found cache is keyed by root ID and persisted, and nothing removed an entry. Compute a
   volume, find the main root ID isn't in the seg_m1300 snapshot, propose another ID for the same
   cell -- and the very next click still answers "cached unavailable", because the cache was never
   told anything happened. Proposing forgets this cell's cached verdicts (the new ID, and the main
   root ID it is being offered as an alternative to) so the next click does a real network check.
   Only those two: a cache entry for some unrelated cell is still worth keeping. */
function forgetCachedNoFor(proposedId){
  try{
    var f=UJ&&UJ.mesh&&UJ.mesh.forgetRootNotFound;if(!f)return;
    if(proposedId)f(String(proposedId));
    if(typeof CUR_ROOT!=="undefined"&&CUR_ROOT)f(String(CUR_ROOT));
  }catch(_e){}
}
function loadRootIdPanel(nid,containerEl){''',
     "the panel can be opened, and a proposal can clear a cached verdict"),

    ('''  const render=(list)=>{''',
     '''  const render=(list,failed)=>{''',
     "render knows whether the list actually arrived"),

    ('''    let body='<div style="font-size:12px;color:var(--mut);margin-bottom:6px">Segmentation and nucleus detection are often patchy''',
     '''    let body=(failed?'<div style="font-size:12px;color:var(--bad);margin-bottom:6px">The list of already-proposed IDs could not be read just now, so it is not shown \\u2014 proposing still works, and duplicates are merged by ID.</div>':'')
      +'<div style="font-size:12px;color:var(--mut);margin-bottom:6px">Segmentation and nucleus detection are often patchy''',
     "...and says so instead of showing nothing"),

    ('''    const label=()=>"additional root / nucleus IDs"+(n?" ("+n+")":"");''',
     '''    /* The word somebody hunting for this is actually looking for. It used to read "additional
       root / nucleus IDs (1)" -- true, and no help at all to a person who has just been told a
       root ID is unavailable and wants to offer a better one. */
    const label=()=>"propose or vote on a root / nucleus ID for this cell"+(n?" ("+n+" proposed)":"");''',
     "the toggle says what it is for"),

    ('''      if(!/^\\d{5,}$/.test(v)){alert("Enter a numeric ID (the long segment or nucleus ID from Neuroglancer).");return;}''',
     '''      if(!/^\\d{5,}$/.test(v)){alert("Enter a numeric ID (the long segment or nucleus ID from Neuroglancer).");return;}
      /* Before the post, not after it: whether or not the sheet write succeeds, the person has told
         us this cell has another ID worth trying, and a stale cached "not found" must not be what
         answers their next click. See forgetCachedNoFor(). */
      forgetCachedNoFor(v);''',
     "proposing forgets the cached \"not found\" for this cell"),

    ('''  fetch(REPORT_ENDPOINT+"?rootIds="+encodeURIComponent(nid)).then(r=>r.json()).then(d=>render((d&&d.rootIds)||[])).catch(()=>{});''',
     '''  fetch(REPORT_ENDPOINT+"?rootIds="+encodeURIComponent(nid)).then(r=>r.json()).then(d=>render((d&&d.rootIds)||[]))
    /* Renders the form with no list rather than leaving the element empty -- see the comment on
       offerRootIdProposal() above. This one line is the whole of "the propose root ID option is
       gone" whenever the endpoint blinks. */
    .catch(()=>{try{render([],true);}catch(_e){}});''',
     "a failed list still leaves a form"),
]

# ── the pages: the buttons ask the backend which extras to combine, at click time ────────────────
BUTTONS = [
    ('''const MeshDL=UJ.mesh;''',
     '''const MeshDL=UJ.mesh;
/* ── THE BUTTON ASKS, RATHER THAN TRUSTING A GLOBAL ──────────────────────────────  2026-09-17
   extraImg65RootIds() reads CUR_EXTRA_ROOTS, which holds whatever loadRootIdPanel() last resolved
   for whichever #rootIdPanel is on screen. That is right for the cell being looked at and wrong in
   every ordering where the fetch has not landed yet, or a second panel has rendered since, or a
   propose is still being re-read -- and when it is wrong the cell is computed WITHOUT the ID just
   proposed. With one candidate left, the failure is the singular "root ID ... is cached as
   unavailable" Søren quoted, which reads as the proposal having been ignored, because it was.

   fetchExtraRootIdsFor() already does this lookup (written for Cell contacts, which has the same
   problem for every candidate cell). Returning undefined rather than [] on an empty or failed
   lookup matters: undefined means "no override", i.e. the old global path, so a backend that is
   down costs exactly what it cost before rather than stripping a cell of extras it does have. */
function extrasForButton(nucleusId,rootId){
  if(!nucleusId||typeof fetchExtraRootIdsFor!=="function")return Promise.resolve(undefined);
  try{
    return fetchExtraRootIdsFor(nucleusId,rootId)
      .then(function(l){return (l&&l.length)?l:undefined;})
      .catch(function(){return undefined;});
  }catch(_e){return Promise.resolve(undefined);}
}''',
     "the extras are looked up per click"),

    ('''    MeshDL.computeVolume(rootId,(frac,msg)=>{volBtn.textContent=(msg||"")+" "+Math.round(frac*100)+"%";},e.shiftKey)
      .then(info=>{''',
     '''    extrasForButton(volNucleusId,rootId)
      .then(volExtras=>MeshDL.computeVolume(rootId,(frac,msg)=>{volBtn.textContent=(msg||"")+" "+Math.round(frac*100)+"%";},e.shiftKey,volExtras))
      .then(info=>{''',
     "Compute volume combines the proposals as they stand now"),

    ('''  const task=isPptx?MeshDL.downloadRootPptx(rootId,liveCellType,btn.dataset.coords,(frac,msg)=>{btn.textContent=(msg||"")+" "+Math.round(frac*100)+"%";},e.shiftKey)
                   :MeshDL.downloadRoot(rootId,(frac,msg)=>{btn.textContent=(msg||"")+" "+Math.round(frac*100)+"%";},e.shiftKey);''',
     '''  const task=extrasForButton(btn.dataset.nucid||"",rootId).then(function(dlExtras){
    return isPptx?MeshDL.downloadRootPptx(rootId,liveCellType,btn.dataset.coords,(frac,msg)=>{btn.textContent=(msg||"")+" "+Math.round(frac*100)+"%";},e.shiftKey,dlExtras)
                 :MeshDL.downloadRoot(rootId,(frac,msg)=>{btn.textContent=(msg||"")+" "+Math.round(frac*100)+"%";},e.shiftKey,dlExtras);
  });''',
     "...and so do the 3D model and PowerPoint downloads"),

    ('''        volBtn.textContent=(err.meshCached?"⊘ cached unavailable":"✗ failed: "+err.message);
        volBtn.title=String(err.message);''',
     '''        /* "cached unavailable" told him the page's bookkeeping, not what to do about it. The way
           out -- shift-click for a real check, or propose a root ID that does resolve -- was in a
           tooltip and behind a collapsed grey line. Both are now on screen at the moment they are
           needed. */
        volBtn.textContent=(err.meshCached?"⊘ not found \\u2014 shift-click to recheck":"✗ failed: "+err.message);
        volBtn.title=String(err.message);
        offerRootIdProposal();''',
     "a cached failure offers the way out (volume)"),

    ('''      btn.textContent=(err.meshCached?"⊘ cached unavailable":"✗ failed: "+err.message);
      btn.title=String(err.message);''',
     '''      btn.textContent=(err.meshCached?"⊘ not found \\u2014 shift-click to recheck":"✗ failed: "+err.message);
      btn.title=String(err.message);
      offerRootIdProposal();''',
     "a cached failure offers the way out (download)"),
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
for page in PAGES:
    edit(page, PANEL + BUTTONS)
print("\nnow: node rootidbackcheck.js")
