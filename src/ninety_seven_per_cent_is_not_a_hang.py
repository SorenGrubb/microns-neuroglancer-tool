# -*- coding: utf-8 -*-
"""97% is not a hang, it is the part of the work nobody was told about.        2026-09-17

Søren, µJump nucleus 264317, immediately after the cached-"no" fix let the cell actually try both
its root IDs: *"Now it is hanging at 97%"*, with the button reading

    decoding… (fragment 2/2) 97%

97% IS AN EXACT NUMBER, and that is what identifies the stall. The combine loop scales each
candidate's own progress into (idx+frac)/n, so with two candidates and the second one's decode loop
at its last tick (0.6+0.35*(i/nF), i.e. just under 0.95) the total is (1+0.95)/2 = 0.975 -> "97%".
So the page reached the END of the second mesh's decode loop and never emitted another update.

Everything after that point is SYNCHRONOUS AND SILENT:

  * the per-mesh assembly -- `new Float32Array(totalVerts)` plus the chunk copies
  * the two-mesh merge in fetchCombinedMesh -- a re-offset loop over every index of every mesh
  * volumeOf() -- one pass over every triangle, after a single onProgress(0.98) that the button
    never gets to render because the loop starts in the same tick

On a cell this size that is many seconds of frozen main thread with a stuck label, which is
indistinguishable from a hang, and is reported as one. Two of those three stages also allocate a
second full copy of the geometry, so it is slowest exactly when the mesh is biggest.

AND THERE IS A REAL HANG IN THE SAME LINES. The decode loops yield with

    await new Promise(requestAnimationFrame)

requestAnimationFrame DOES NOT FIRE IN A BACKGROUND TAB. Switch away from µJump while a big cell
decodes and the loop stops at its next yield -- not slowly, entirely -- until the tab is looked at
again. A progress bar that only advances while it is watched is the other way to read "hanging".

THE FIX

1. `breathe()` replaces the bare rAF yield: it races requestAnimationFrame against a 50 ms timeout
   and takes whichever comes first, so a foreground tab keeps rAF's smoothness and a background tab
   still finishes (setTimeout is throttled to ~1 s there, not stopped).

2. Every stage after the decode loop now says what it is doing and yields between chunks:
   "assembling N vertices…", "combining 2 meshes…", "measuring N triangles…". The volume sum is
   split into million-triangle chunks (`volumeOfRange`, shared with the unchanged synchronous
   `volumeOf` that χJump calls, so the arithmetic has one implementation).

Nothing here changes a single number: the same triangles are summed in the same order, chunked
sums added at the end.

Run: python3 src/ninety_seven_per_cent_is_not_a_hang.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MESH = [
    # ── a yield that survives a background tab ───────────────────────────────────────────────────
    ('''  async function rangeGet(url,start,end,onProgress){''',
     '''  /* ── A YIELD THAT SURVIVES A BACKGROUND TAB ───────────────────────────────────  2026-09-17
     The decode loops used `await new Promise(requestAnimationFrame)` to hand the thread back so the
     button could repaint. rAF does not fire in a background tab, so switching away from the page
     mid-decode stopped the loop dead at its next yield until the tab was looked at again -- one of
     the two ways "hanging at 97%" happens. Racing rAF against a short timeout keeps the foreground
     behaviour exactly as it was (rAF wins at ~16 ms) and lets a hidden tab finish (setTimeout is
     throttled to about a second in the background, which is slow, not stopped). */
  function breathe(){
    return new Promise(function(res){
      var done=false,f=function(){if(done)return;done=true;res();};
      try{requestAnimationFrame(f);}catch(_e){}
      setTimeout(f,50);
    });
  }
  /* Counts in a progress message, so "measuring 8,300,000 triangles" is not a wall of digits. */
  function fmtCount(n){
    n=Math.round(n);
    return n>=1e6?(n/1e6).toFixed(1)+"M":(n>=1e4?Math.round(n/1e3)+"k":n.toLocaleString());
  }
  async function rangeGet(url,start,end,onProgress){''',
     "breathe() and fmtCount()"),

    ('''      if(i%8===0){onProgress&&onProgress(0.1+0.85*(i/initial.length),"fetching+decoding "+(i+1)+"/"+initial.length+"…");await new Promise(requestAnimationFrame);}''',
     '''      if(i%8===0){onProgress&&onProgress(0.1+0.85*(i/initial.length),"fetching+decoding "+(i+1)+"/"+initial.length+"…");await breathe();}''',
     "the legacy decode loop breathes"),

    ('''      if(i%8===0){onProgress&&onProgress(0.6+0.35*(i/nF),"decoding…");await new Promise(requestAnimationFrame);}''',
     '''      if(i%8===0){onProgress&&onProgress(0.6+0.35*(i/nF),"decoding…");await breathe();}''',
     "the Draco decode loop breathes"),

    # ── the silent tail of fetchMesh now says what it is doing ───────────────────────────────────
    ('''    draco.destroy(decoder);
    if(!decoded)throw new Error("no fragments decoded (LOD "+lod+", "+nF+" fragments in manifest)");
    const positions=new Float32Array(totalVerts),indices=new Uint32Array(totalIdx);''',
     '''    draco.destroy(decoder);
    if(!decoded)throw new Error("no fragments decoded (LOD "+lod+", "+nF+" fragments in manifest)");
    /* THE LAST TICK OF THE LOOP ABOVE IS NOT THE END OF THE WORK. Allocating the two flat arrays
       and copying every chunk into them is the first of three silent synchronous stages that used
       to follow, and on a big cell it is seconds of frozen button. Saying so costs one repaint. */
    onProgress&&onProgress(0.95,"assembling "+fmtCount(totalVerts/3)+" vertices…");
    await breathe();
    const positions=new Float32Array(totalVerts),indices=new Uint32Array(totalIdx);''',
     "the assembly says it is assembling"),

    # ── the merge of several meshes ──────────────────────────────────────────────────────────────
    ('''    let totalV=0,totalI=0,bytes=0;
    meshes.forEach(m=>{totalV+=m.positions.length;totalI+=m.indices.length;bytes+=m.bytes||0;});
    const positions=new Float32Array(totalV),indices=new Uint32Array(totalI);
    let vOff=0,vCount=0,iOff=0;
    meshes.forEach(m=>{
      positions.set(m.positions,vOff);
      for(let k=0;k<m.indices.length;k++)indices[iOff+k]=m.indices[k]+vCount;
      vOff+=m.positions.length;iOff+=m.indices.length;vCount+=m.positions.length/3;
    });''',
     '''    let totalV=0,totalI=0,bytes=0;
    meshes.forEach(m=>{totalV+=m.positions.length;totalI+=m.indices.length;bytes+=m.bytes||0;});
    /* The second silent stage: one full extra copy of the geometry, plus a re-offset pass over
       every index of every mesh. It only runs when a cell HAS more than one root ID, which is
       exactly the case Søren hit -- so the stall appeared the moment a proposed root ID started
       being combined instead of being answered from the not-found cache. */
    onProgress&&onProgress(0.96,"combining "+meshes.length+" meshes ("+fmtCount(totalV/3)+" vertices)…");
    await breathe();
    const positions=new Float32Array(totalV),indices=new Uint32Array(totalI);
    let vOff=0,vCount=0,iOff=0;
    for(let mi=0;mi<meshes.length;mi++){
      const m=meshes[mi];
      positions.set(m.positions,vOff);
      for(let k=0;k<m.indices.length;k++){
        indices[iOff+k]=m.indices[k]+vCount;
        /* Every ~2M indices, not every index: the test is cheap next to the work between two of
           them, and a mesh small enough never to reach it is over before anyone could look. */
        if((k&2097151)===2097151){onProgress&&onProgress(0.96+0.01*((iOff+k)/totalI),"combining…");await breathe();}
      }
      vOff+=m.positions.length;iOff+=m.indices.length;vCount+=m.positions.length/3;
    }''',
     "the merge says it is merging, and breathes while it does"),

    # ── the volume sum ───────────────────────────────────────────────────────────────────────────
    ('''  function volumeOf(geo){
    const positions=geo.positions,indices=geo.indices;
    let vol6=0;
    for(let t=0;t<indices.length;t+=3){
      const ia=indices[t]*3,ib=indices[t+1]*3,ic=indices[t+2]*3;
      const ax=positions[ia],ay=positions[ia+1],az=positions[ia+2];
      const bx=positions[ib],by=positions[ib+1],bz=positions[ib+2];
      const cx=positions[ic],cy=positions[ic+1],cz=positions[ic+2];
      vol6+=ax*(by*cz-bz*cy)-ay*(bx*cz-bz*cx)+az*(bx*cy-by*cx);
    }
    return {volumeUm3:Math.abs(vol6)/6,vertices:positions.length/3};
  }''',
     '''  function volumeOfRange(positions,indices,t0,t1){
    let vol6=0;
    for(let t=t0;t<t1;t+=3){
      const ia=indices[t]*3,ib=indices[t+1]*3,ic=indices[t+2]*3;
      const ax=positions[ia],ay=positions[ia+1],az=positions[ia+2];
      const bx=positions[ib],by=positions[ib+1],bz=positions[ib+2];
      const cx=positions[ic],cy=positions[ic+1],cz=positions[ic+2];
      vol6+=ax*(by*cz-bz*cy)-ay*(bx*cz-bz*cx)+az*(bx*cy-by*cx);
    }
    return vol6;
  }
  /* Unchanged for every caller that has geometry in hand and wants a number now -- χJump's cb2
     cells go through this one. The arithmetic lives in volumeOfRange so the chunked version below
     cannot drift from it. */
  function volumeOf(geo){
    const vol6=volumeOfRange(geo.positions,geo.indices,0,geo.indices.length);
    return {volumeUm3:Math.abs(vol6)/6,vertices:geo.positions.length/3};
  }
  /* ── THE THIRD SILENT STAGE ───────────────────────────────────────────────────  2026-09-17
     One pass over every triangle of a combined cell, started in the same tick as the single
     onProgress(0.98) that announced it -- so the button never repainted and the number never
     appeared to be on its way. Chunked into a million triangles at a time with a breath between
     them: the same triangles in the same order, the partial sums added at the end. */
  async function volumeOfProgressive(geo,onProgress){
    const positions=geo.positions,indices=geo.indices,n=indices.length;
    const CHUNK=3*1000000;
    let vol6=0;
    for(let t=0;t<n;t+=CHUNK){
      const end=Math.min(t+CHUNK,n);
      vol6+=volumeOfRange(positions,indices,t,end);
      if(n>CHUNK){
        onProgress&&onProgress(0.97+0.03*(end/n),"measuring "+fmtCount(n/3)+" triangles…");
        await breathe();
      }
    }
    return {volumeUm3:Math.abs(vol6)/6,vertices:positions.length/3};
  }''',
     "the volume sum is chunked, and one implementation of the arithmetic"),

    ('''    onProgress&&onProgress(0.98,"computing volume…");
    const v=volumeOf({positions,indices});''',
     '''    onProgress&&onProgress(0.97,"measuring "+fmtCount(indices.length/3)+" triangles…");
    await breathe();
    const v=await volumeOfProgressive({positions,indices},onProgress);''',
     "computeVolume measures in chunks"),

    # ── exported so it can be measured, and because a big cb2 cell wants it too ──────────────────
    ("""          /* The export half, for a tool that fetches its own geometry -- see its comment above. */
          saveGlb,savePptx,volumeOf,buildGLB};""",
     """          /* The export half, for a tool that fetches its own geometry -- see its comment above. */
          /* volumeOfProgressive: the same sum, chunked and yielding, for geometry big enough that
             doing it in one tick freezes the page. Exported both because it is the only way to
             MEASURE that it agrees with volumeOf, and because χJump's larger cb2 cells have the
             same problem this was written for. */
          saveGlb,savePptx,volumeOf,volumeOfProgressive,buildGLB};""",
     "volumeOfProgressive is exported"),
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
print("\nnow: node meshprogresscheck.js")
