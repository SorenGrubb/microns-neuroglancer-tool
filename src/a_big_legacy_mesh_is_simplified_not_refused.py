"""A big pinky100 mesh is simplified, not refused.                                   2026-09-09

Søren: *"Yes, maybe the fragments are large for pJump, please fix it."*

The message he is seeing is the new one working -- "1 proposed root ID is not drawn here.
648518346349532924 — mesh is larger than 192 MB (145 fragments)". Saying so out loud was the
previous fix. This is the actual remedy.

WHY IT REFUSED. pinky100 publishes `neuroglancer_legacy_mesh`: one manifest, N fragments, raw
float32 vertices and uint32 indices, and NO level-of-detail pyramid at all. The other two mesh
paths in this file answer "too big" by picking a coarser LOD. This one had nothing to pick, so it
refused at 192 MB with a readable sentence, on the reasoning that every fragment is part of the
surface and dropping one leaves a hole. That reasoning is still right. What it missed is that
detail can be thrown away WITHIN a fragment instead of throwing the fragment away.

WHAT IT DOES NOW. Above 64 MB of downloaded fragment data the path switches on vertex-cluster
decimation (Rossignac & Borrel 1993, the standard cheap simplifier) and keeps going:

  * one global grid in absolute nanometres, and the representative for a cell is the CELL CENTRE,
    not the first vertex that landed in it. That matters here specifically: fragments are decoded
    independently, so a first-vertex representative would let two fragments choose different points
    for the same shared boundary cell and open a crack along every chunk boundary. A centre is a
    function of the cell alone, so every fragment agrees by construction.
  * triangles whose corners collapse into one cell are dropped -- they have no area left.
  * fragments already in memory when the threshold is crossed are re-decimated on the spot, so the
    result is uniform rather than half fine and half coarse.
  * if it crosses the budget again the grid doubles and everything is re-decimated at the coarser
    size. A merged object spanning the whole volume coarsens itself a few times and still arrives.

The hard ceiling moves from 192 MB to 1.5 GB and is now a genuine "this is not a cell" limit rather
than a routine one -- 145 fragments of pinky100 is a large merged segment, and at some size the
honest answer really is Neuroglancer.

WHAT IT COSTS, said out loud. A simplified mesh is not the published geometry: the result carries
`simplified:{gridUm,fromVertices,toVertices}`, fetchCombinedMesh passes it up, the 3D panel prints
it under the cell, and the computed volume's tooltip says the number came from a simplified surface
and is an estimate. A volume that quietly changed by a few percent because a mesh happened to be
large would be the worst outcome of this whole change.

Run: python3 src/a_big_legacy_mesh_is_simplified_not_refused.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MESH = [
    # ── the header stops promising a refusal ─────────────────────────────────────────────────────
    ('''     There are no LODs here, so there is nothing to trade detail against size with: every
     fragment is part of the surface and dropping one leaves a hole. The size guard is therefore
     a hard refusal with a readable message rather than a silent downgrade. */
  const LEGACY_MAX_BYTES=192*1048576;
  const LEGACY_PARALLEL=6;''',
     '''     There are no LODs here, so there is nothing to trade detail against size with: every
     fragment is part of the surface and dropping one leaves a hole. That was the whole argument
     for a hard refusal at 192 MB, and it was right about fragments and wrong about detail --
     detail can be thrown away WITHIN a fragment instead. Søren, 2026-09-09, on a 145-fragment
     pinky100 segment: "maybe the fragments are large for pJump, please fix it."

     So: above LEGACY_SIMPLIFY_ABOVE the path switches on vertex clustering and keeps going, and
     the refusal moves out to a size that means "this is not a cell" rather than "this is a big
     cell". Everything that comes back from a simplified fetch says so -- see `simplified` on the
     return, and its readers in fetchCombinedMesh, core/mesh3d.js and the volume tooltip. */
  const LEGACY_MAX_BYTES=1536*1048576;      // the honest "open it in Neuroglancer" ceiling
  const LEGACY_SIMPLIFY_ABOVE=64*1048576;   // past here, detail is traded for arrival
  const LEGACY_GRID_START_NM=200;           // 0.2 µm cells; doubles if the budget is passed again
  const LEGACY_PARALLEL=6;
  /* ── vertex clustering (Rossignac & Borrel 1993) ────────────────────────────────────────────
     Snap every vertex to a cell of a fixed global grid, keep one representative per cell, drop the
     triangles whose three corners end up in the same one. Cheap, single pass, and -- the reason it
     is the right algorithm HERE rather than something that preserves curvature better -- it is
     PURELY LOCAL: no fragment needs to know what any other fragment did.

     The representative is the cell CENTRE, deliberately. Rossignac & Borrel keep the most
     "important" vertex of the cell, which is better-looking on a single mesh and wrong for this
     one: these fragments are decoded independently, so two fragments sharing a boundary vertex
     would each pick from their own set and could choose different points for the same cell,
     opening a crack along every chunk boundary. A centre depends on the cell alone, so every
     fragment agrees without communicating. The cost is a faint blockiness at the grid size, which
     is what "simplified" means and what the panel now says.

     Units are the caller's: this runs on raw fragment vertices, which are absolute nanometres. */
  function clusterDecimate(verts,idx,gridNm){
    const n=verts.length/3;
    const cellOf=new Map();
    const remap=new Int32Array(n);
    const out=[];
    for(let v=0;v<n;v++){
      const cx=Math.floor(verts[v*3]/gridNm),cy=Math.floor(verts[v*3+1]/gridNm),cz=Math.floor(verts[v*3+2]/gridNm);
      const key=cx+"|"+cy+"|"+cz;
      let ni=cellOf.get(key);
      if(ni===undefined){
        ni=out.length/3;cellOf.set(key,ni);
        out.push((cx+0.5)*gridNm,(cy+0.5)*gridNm,(cz+0.5)*gridNm);
      }
      remap[v]=ni;
    }
    const oi=[];
    for(let t=0;t+2<idx.length;t+=3){
      const a=remap[idx[t]],b=remap[idx[t+1]],c=remap[idx[t+2]];
      if(a===b||b===c||a===c)continue;   // no area left after the snap
      oi.push(a,b,c);
    }
    return {verts:new Float32Array(out),idx:new Uint32Array(oi)};
  }''',
     "the grid, the ceiling and the simplifier"),

    # ── the fetch loop simplifies instead of throwing ────────────────────────────────────────────
    ('''    const parts=new Array(frags.length);
    let done=0,bytes=0,failed=0;
    async function one(i){
      let r=null;
      try{ r=await fetch(objUrl(frags[i])); }catch(_e){ r=null; }
      if(!r||!r.ok){ failed++; return; }
      const u8=new Uint8Array(await r.arrayBuffer());
      bytes+=u8.length;
      if(bytes>LEGACY_MAX_BYTES)throw new Error("mesh is larger than "+mb(LEGACY_MAX_BYTES)+
        " ("+frags.length+" fragments). This format has no coarser level to fall back to, so it "+
        "cannot be downgraded — open the cell in Neuroglancer instead.");
      try{ parts[i]=decodeLegacyFragment(u8); }catch(e){ failed++; }
      done++;
      if(done%4===0)onProgress&&onProgress(0.05+0.9*(done/frags.length),"fetching "+done+"/"+frags.length+"…");
    }''',
     '''    const parts=new Array(frags.length);
    let done=0,bytes=0,failed=0,grid=0,rawVerts=0;
    /* Crossing the budget sets (or doubles) the grid and brings everything already in memory to
       the new size, so the finished surface is uniform rather than fine where it started and
       coarse where it ran out of room. Synchronous on purpose: several fetches are in flight, and
       a pass that awaited nothing cannot be interleaved with another fragment arriving. */
    function coarsen(){
      grid=grid?grid*2:LEGACY_GRID_START_NM;
      for(let k=0;k<parts.length;k++)
        if(parts[k])parts[k]=clusterDecimate(parts[k].verts,parts[k].idx,grid);
      onProgress&&onProgress(0.05+0.9*(done/frags.length),
        "simplifying to "+(grid/1000).toFixed(2)+" µm…");
    }
    async function one(i){
      let r=null;
      try{ r=await fetch(objUrl(frags[i])); }catch(_e){ r=null; }
      if(!r||!r.ok){ failed++; return; }
      const u8=new Uint8Array(await r.arrayBuffer());
      bytes+=u8.length;
      if(bytes>LEGACY_MAX_BYTES)throw new Error("mesh is over "+mb(LEGACY_MAX_BYTES)+
        " ("+frags.length+" fragments, still arriving). At this size it is a large merged segment "+
        "rather than one cell — open it in Neuroglancer, which streams instead of downloading.");
      let d=null;
      try{ d=decodeLegacyFragment(u8); }catch(e){ failed++; }
      if(d){
        rawVerts+=d.verts.length/3;
        if(!grid&&bytes>LEGACY_SIMPLIFY_ABOVE){parts[i]=d;coarsen();}
        else parts[i]=grid?clusterDecimate(d.verts,d.idx,grid):d;
        /* Past twice the budget the grid is not paying for itself yet. Doubling re-decimates what
           is already here at the coarser size, which is cheap because it is already small. */
        if(grid&&bytes>LEGACY_SIMPLIFY_ABOVE*2*(grid/LEGACY_GRID_START_NM))coarsen();
      }
      done++;
      if(done%4===0)onProgress&&onProgress(0.05+0.9*(done/frags.length),
        (grid?"simplifying ":"fetching ")+done+"/"+frags.length+"…");
    }''',
     "a large mesh is decimated on the way in"),

    # ── the result says whether it was simplified ────────────────────────────────────────────────
    ('''    return {positions,indices,lod:0,numLods:1,bytes,legacyFragments:frags.length,legacyFailed:failed};''',
     '''    /* A simplified mesh is not the published geometry, and nothing downstream can tell by
       looking. Said here so the 3D panel can print it and the volume tooltip can call its own
       number an estimate -- a volume that quietly moved a few percent because the mesh happened to
       be large would be the worst thing this change could do. */
    const simplified=grid?{gridUm:grid/1000,fromVertices:rawVerts,toVertices:positions.length/3}:null;
    return {positions,indices,lod:0,numLods:1,bytes,legacyFragments:frags.length,legacyFailed:failed,simplified};''',
     "the legacy result carries its simplification"),

    # ── fetchCombinedMesh passes it up ───────────────────────────────────────────────────────────
    ('''    const skipped=failures.map(function(e){
      return {rootId:(e&&e.rootId)||"",message:(e&&e.message)||"unavailable",meshCached:!!(e&&e.meshCached)};
    });''',
     '''    const skipped=failures.map(function(e){
      return {rootId:(e&&e.rootId)||"",message:(e&&e.message)||"unavailable",meshCached:!!(e&&e.meshCached)};
    });
    /* Which of the combined root IDs came back simplified, and how coarsely. Null when none were,
       which is every ordinary cell -- so a caller that ignores it is unchanged. */
    const simplified=[];
    meshes.forEach(function(m,k){ if(m&&m.simplified)simplified.push(Object.assign({rootId:usedIds[k]},m.simplified)); });''',
     "the combined result collects them"),

    ('''      return {positions:m.positions,indices:m.indices,lod:m.lod,numLods:m.numLods,bytes:m.bytes,fragmentCount:1,rootIds:usedIds,mainUnavailable,skipped};''',
     '''      return {positions:m.positions,indices:m.indices,lod:m.lod,numLods:m.numLods,bytes:m.bytes,fragmentCount:1,rootIds:usedIds,mainUnavailable,skipped,simplified};''',
     "...on the single-mesh path"),

    ('''    return {positions,indices,lod:null,numLods:null,bytes,fragmentCount:meshes.length,rootIds:usedIds,mainUnavailable,skipped};''',
     '''    return {positions,indices,lod:null,numLods:null,bytes,fragmentCount:meshes.length,rootIds:usedIds,mainUnavailable,skipped,simplified};''',
     "...and on the combined path"),

    # ── computeVolume was dropping both of them on the floor ─────────────────────────────────────
    # Found by writing this generator rather than by running anything: the volume tooltip added
    # earlier today reads info.skipped, and computeVolume destructures a fixed list of fields and
    # rebuilds the object, so `skipped` never reached the page and the sentence could never appear.
    # `simplified` would have gone the same way. A destructure that names its fields is exactly the
    # kind of place a new field goes to die.
    ('''    const {positions,indices,fragmentCount,rootIds,mainUnavailable}=await fetchCombinedMesh(rootIdStr,onProgress,forceRecheck);
    onProgress&&onProgress(0.98,"computing volume…");
    const v=volumeOf({positions,indices});
    return {volumeUm3:v.volumeUm3,vertices:v.vertices,fragmentCount,rootIds,mainUnavailable};''',
     '''    /* skipped/simplified travel with the number, and the page prints both -- a root ID that
       could not be fetched, and a surface that was decimated to fit, each change what the volume
       means. They were dropped here at first, which made the tooltip that reads them unreachable:
       this destructure names its fields, so a field added upstream reaches the caller only if it
       is named here too. */
    const {positions,indices,fragmentCount,rootIds,mainUnavailable,skipped,simplified}=await fetchCombinedMesh(rootIdStr,onProgress,forceRecheck);
    onProgress&&onProgress(0.98,"computing volume…");
    const v=volumeOf({positions,indices});
    return {volumeUm3:v.volumeUm3,vertices:v.vertices,fragmentCount,rootIds,mainUnavailable,skipped,simplified};''',
     "computeVolume carries them to the page"),

    # ── and the .glb says it in the one place that outlives the page: its own name ───────────────
    ('''    const {positions:rawPositions,indices:rawIndices,lod,numLods,bytes,fragmentCount,rootIds,mainUnavailable}=await fetchCombinedMesh(rootIdStr,onProgress,forceRecheck);
    /* When there's no main root ID (community-only combine), fall back to the first combined ID
       so the filename is still a real, traceable segmentation ID rather than a blank/underscore. */
    const idForName=rootIdStr||rootIds[0];
    const tag=fragmentCount>1?"_combined"+fragmentCount:"_lod"+lod;
    onProgress&&onProgress(1,"saving…");
    const saved=saveGlb({positions:rawPositions,indices:rawIndices},
      {name:"microns_"+idForName+tag,filename:"microns_"+idForName+tag+"_um"});
    return {lod,numLods,bytes,vertices:saved.vertices,filename:saved.filename,
            fragmentCount,rootIds,mainUnavailable};''',
     '''    const {positions:rawPositions,indices:rawIndices,lod,numLods,bytes,fragmentCount,rootIds,mainUnavailable,skipped,simplified}=await fetchCombinedMesh(rootIdStr,onProgress,forceRecheck);
    /* When there's no main root ID (community-only combine), fall back to the first combined ID
       so the filename is still a real, traceable segmentation ID rather than a blank/underscore. */
    const idForName=rootIdStr||rootIds[0];
    /* A decimated mesh says so IN ITS FILENAME. A toast is read once and a .glb is opened for
       years; somebody measuring this file in Blender next spring has no other way to know its
       vertices were merged onto a grid because the published mesh was too large to download
       whole. The grid size is in the name for the same reason. */
    const simpTag=(simplified&&simplified.length)
      ?("_simplified"+String(Math.max.apply(null,simplified.map(function(s){return s.gridUm;}))).replace(".","p")+"um")
      :"";
    const tag=(fragmentCount>1?"_combined"+fragmentCount:"_lod"+lod)+simpTag;
    onProgress&&onProgress(1,"saving…");
    const saved=saveGlb({positions:rawPositions,indices:rawIndices},
      {name:"microns_"+idForName+tag,filename:"microns_"+idForName+tag+"_um"});
    return {lod,numLods,bytes,vertices:saved.vertices,filename:saved.filename,
            fragmentCount,rootIds,mainUnavailable,skipped,simplified};''',
     "a simplified .glb is named as one"),
]

MESH3D = [
    ('''          if (m.skipped && m.skipped.length){''',
     '''          /* A cell that arrived only because it was decimated says so, in the same place the
             size line is -- the panel is where somebody decides whether to trust what they see. */
          if (m.simplified && m.simplified.length){
            var g = Math.max.apply(null, m.simplified.map(function(s){ return s.gridUm; }));
            var kept = m.simplified.reduce(function(a,s){ return a + (s.toVertices||0); }, 0);
            var from = m.simplified.reduce(function(a,s){ return a + (s.fromVertices||0); }, 0);
            lead = (lead ? lead + "<br>" : "")
              + "<b>Simplified to fit.</b> <span class='hint'>This mesh was too large to download "
              + "whole, so vertices were merged onto a " + g.toFixed(2) + " µm grid ("
              + from.toLocaleString() + " → " + kept.toLocaleString()
              + " vertices). The shape is right; fine detail is not. Open it in Neuroglancer for "
              + "the published geometry.</span>";
          }
          if (m.skipped && m.skipped.length){''',
     "the 3D panel says the mesh was simplified"),
]

PAGES = ["ujump.html", "djump.html", "pjump.html"]
PAGE = [
    ('''          const skippedN=(info.skipped&&info.skipped.length)||0;''',
     '''          /* A volume measured on a decimated surface is not the volume of the published mesh.
             Vertex clustering keeps the shape and moves the number by a little, so the tooltip
             says which surface it came from rather than letting a few percent pass unremarked. */
          const simpN=(info.simplified&&info.simplified.length)||0;
          const simpStr=simpN?(" Computed from a SIMPLIFIED surface (vertices merged onto a "
            +Math.max.apply(null,info.simplified.map(function(s){return s.gridUm;})).toFixed(2)
            +" µm grid because the published mesh was too large to download whole), so treat it as "
            +"approximate rather than as this cell's measured volume."):"";
          const skippedN=(info.skipped&&info.skipped.length)||0;''',
     "the volume knows it may be measuring a simplified surface"),

    ('''            valSpan.textContent="≈ "+Math.round(info.volumeUm3).toLocaleString()+" µm³"
              +(skippedN?" — "+skippedN+" fragment"+(skippedN>1?"s":"")+" missing":"")
              +(volGate?" — not saved":"");''',
     '''            valSpan.textContent="≈ "+Math.round(info.volumeUm3).toLocaleString()+" µm³"
              +(simpN?" — simplified mesh":"")
              +(skippedN?" — "+skippedN+" fragment"+(skippedN>1?"s":"")+" missing":"")
              +(volGate?" — not saved":"");''',
     "...and says so beside the number"),

    ('''+fallbackStr+skippedStr+" "+(volGate||"Saved to the shared dashboard just now.")+" Click to copy.";''',
     '''+fallbackStr+simpStr+skippedStr+" "+(volGate||"Saved to the shared dashboard just now.")+" Click to copy.";''',
     "...and in the tooltip"),
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
    edit(page, PAGE)
print("\nnow: node bigmeshcheck.js")
