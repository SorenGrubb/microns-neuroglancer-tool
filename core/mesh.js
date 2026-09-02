/* core/mesh.js -- extracted from ujump.html, stage 1 of the shared-core refactor (2026-08-16).
   Dataset-agnostic: the only per-dataset values (bucket URLs, sharding parameters, model->nm
   transform) now live in UJ.cfg.mesh, set by the page before this file loads. H01/hJump reuses
   this file unchanged and only supplies a different UJ.cfg.mesh.
   Loaded as a classic <script src>, so it must appear BEFORE the main tool script; it publishes
   UJ.mesh, and the main script keeps its old name via `const MeshDL = UJ.mesh;`.
   Public surface: downloadRoot, downloadRootPptx, computeVolume, clearMeshNotFoundCache,
   currentFragmentCount, fetchCombinedMesh.
   External references: CUR_EXTRA_ROOTS (typeof-guarded; a top-level `let` in the main script,
   resolved at call time -- see the scope note above ORGANELLE_GROUPS in ujump.html). */
window.UJ = window.UJ || {};
/* ============================================================================
   Mesh download: root ID -> .glb, entirely client-side (no backend, no CAVE
   token -- the seg_m1300 mesh bucket is public). Ported from Søren's
   mesh_download_prototype.html / MICrONS_downloader.ipynb reverse-engineering.
   Per Søren: attach only to this cell's own root ID row(s) (not every partner
   in the connectivity table), and download immediately at a sensible default
   resolution rather than opening a picker -- one click, no extra UI unless it
   fails. See mesh-download-browser memory for the LOD/transform validation.

   Pipeline: root_id --murmurhash3_x86_128--> shard+minishard --Range GET-->
   shard index --Range GET+gunzip--> minishard index --lookup--> manifest
   byte range --Range GET+gunzip--> neuroglancer_multilod_draco manifest
   --Range GET (one call per LOD)--> Draco fragments --draco wasm--> verts+
   indices --assemble--> GLB. Format spec:
   https://github.com/google/neuroglancer/blob/master/src/datasource/precomputed/meshes.md
   ============================================================================ */
UJ.mesh=(()=>{
  const CFG=UJ.cfg.mesh;   // per-dataset; see the config block in the page
  function mb(n){return (n/1048576).toFixed(n>10485760?0:1)+" MB";}
  function rotl32(x,r){return ((x<<r)|(x>>>(32-r)))>>>0;}
  function fmix32(h){h=(h^(h>>>16))>>>0;h=Math.imul(h,0x85ebca6b)>>>0;h=(h^(h>>>13))>>>0;h=Math.imul(h,0xc2b2ae35)>>>0;return (h^(h>>>16))>>>0;}
  function murmur64(valBig){
    const c1=0x239b961b,c2=0xab0e9789,c3=0x38b34ae5;
    const high32=Number((valBig>>32n)&0xffffffffn),low32=Number(valBig&0xffffffffn);
    let h1=0,h2=0,h3=0,h4=0;
    let k2=Math.imul(high32,c2)>>>0;k2=rotl32(k2,16);k2=Math.imul(k2,c3)>>>0;h2=(h2^k2)>>>0;
    let k1=Math.imul(low32,c1)>>>0;k1=rotl32(k1,15);k1=Math.imul(k1,c2)>>>0;h1=(h1^k1)>>>0;
    const len=8;h1=(h1^len)>>>0;h2=(h2^len)>>>0;h3=(h3^len)>>>0;h4=(h4^len)>>>0;
    h1=(h1+h2+h3+h4)>>>0;h2=(h2+h1)>>>0;h3=(h3+h1)>>>0;h4=(h4+h1)>>>0;
    h1=fmix32(h1);h2=fmix32(h2);h3=fmix32(h3);h4=fmix32(h4);
    h1=(h1+h2+h3+h4)>>>0;h2=(h2+h1)>>>0;
    return (BigInt(h1)|(BigInt(h2)<<32n));
  }
  function shardAndMinishard(rootIdBig){
    const hashed=murmur64(rootIdBig>>BigInt(CFG.preshiftBits));
    const mask=(1n<<BigInt(CFG.minishardBits+CFG.shardBits))-1n;
    const sm=hashed&mask;
    const minishard=Number(sm&((1n<<BigInt(CFG.minishardBits))-1n));
    const shard=Number((sm>>BigInt(CFG.minishardBits))&((1n<<BigInt(CFG.shardBits))-1n));
    /* Shard file names are the shard number in lowercase hex, zero-padded to ceil(shard_bits/4)
       characters -- the neuroglancer precomputed sharded-format rule, not a fixed width. This was
       hardcoded padStart(4,"0"), which is right for MICrONS (shard_bits 13 -> 4 chars,
       "0000.shard") and silently WRONG for H01 (shard_bits 10 -> 3 chars, shards 000..3ff): every
       ηJump request asked for 0123.shard when the object is 123.shard, so all of them 404'd and
       both download buttons failed. CFG.shardBits is authoritative here -- loadInfo() has already
       overwritten it from the dataset's own mesh info file, awaited before this runs. */
    const width=Math.max(1,Math.ceil(CFG.shardBits/4));
    return {shard:shard.toString(16).padStart(width,"0"),minishard};
  }
  /* Start on whichever host the dataset's bucket actually allows cross-origin.
     Confirmed from grubblab.com, 2026-08-16:
       storage.googleapis.com/h01-release/...        -> served 200/206 but NO
                                                        Access-Control-Allow-Origin, so the
                                                        browser rejects it ("Failed to fetch")
       storage.googleapis.com/storage/v1/b/h01-...   -> 200 on the info file, 206 on a ranged
                                                        shard read: fully usable
     MICrONS's iarpa_microns bucket allows "*", so µJump keeps starting on the direct path and
     nothing about its behaviour changes. Setting preferAlt skips a request that is guaranteed to
     fail rather than relying on the catch below to notice -- one less round trip per download,
     and no red CORS error in the console on every single click. */
  let useAlt=!!CFG.preferAlt;
  function shardUrl(shard){return useAlt?(CFG.meshBaseAlt+shard+CFG.meshBaseAltSuffix):(CFG.meshBase+shard+".shard");}
  /* UNSHARDED datasets address objects by name rather than by shard, so they need a URL builder
     that does not bake in the ".shard" extension. Kept separate from shardUrl() rather than
     generalising it, so the sharded path µJump and ηJump depend on is byte-for-byte unchanged.
     CFG.meshBaseAlt already ends in the URL-encoded object prefix, and a bare id or "id.index"
     needs no further escaping (only "/" would). */
  function objUrl(name){return useAlt?(CFG.meshBaseAlt+name+(CFG.meshBaseAltQuery||"?alt=media"))
                                     :(CFG.meshBase+name);}
  /* An unsharded .index file is stored raw; a sharded manifest is gzipped. Sniff rather than
     assume, so neither layout needs a separate code path here. */
  async function maybeGunzip(u8){
    return (u8.length>1&&u8[0]===0x1f&&u8[1]===0x8b)?await gunzip(u8):u8;
  }
  /* seg_m1300 is a FROZEN precomputed snapshot (see the CAVE_SEG_SOURCE comment near
     loadConnectivityPanel) -- a root ID that isn't in its shard index today will never suddenly
     appear there, so there's no point re-running the same network round-trip on every click. Most
     common cause: the ID came from a CAVE query at a version other than 1300, or the cell has
     since been further proofread (see findManifest()'s own error text). Cache is keyed by root ID
     string, persisted to localStorage so it survives reloads; Shift-click on the download/compute
     button bypasses it for one attempt (genuine recheck, not a fake "click again"). */
  /* Namespaced per dataset: βJump meshes only ~half its segments, so its not-found set is large
     and completely unrelated to µJump's. Sharing one key would have hJump and βJump each
     poisoning the other's cache. Default keeps µJump's existing key, so no user loses theirs. */
  const MESH_NOT_FOUND_KEY=CFG.notFoundKey||"microns_mesh_notfound_roots_v1";
  let notFoundCache=null;
  function loadNotFoundCache(){
    if(notFoundCache)return notFoundCache;
    try{notFoundCache=new Map(JSON.parse(localStorage.getItem(MESH_NOT_FOUND_KEY)||"[]"));}
    catch(_e){notFoundCache=new Map();}
    return notFoundCache;
  }
  function saveNotFoundCache(){
    try{localStorage.setItem(MESH_NOT_FOUND_KEY,JSON.stringify([...loadNotFoundCache().entries()]));}catch(_e){}
  }
  function markRootNotFound(rootIdStr){loadNotFoundCache().set(String(rootIdStr),Date.now());saveNotFoundCache();}
  function isRootKnownNotFound(rootIdStr){return loadNotFoundCache().has(String(rootIdStr));}
  /* Exposed for manual use from the browser console if the cache ever needs a full reset (e.g. if
     this tool later adds a fallback source for non-v1300 IDs and old "not found" entries should
     be re-checked) -- not wired to any UI button since that's not something Søren asked for. */
  function clearMeshNotFoundCache(){notFoundCache=new Map();try{localStorage.removeItem(MESH_NOT_FOUND_KEY);}catch(_e){}}
  async function rangeGet(url,start,end,onProgress){
    const res=await fetch(url,{headers:{Range:"bytes="+start+"-"+end}});
    if(res.status!==206)throw new Error("expected HTTP 206 for byte range, got "+res.status);
    const total=end-start+1;
    if(!onProgress||!res.body)return new Uint8Array(await res.arrayBuffer());
    const reader=res.body.getReader();
    const out=new Uint8Array(total);
    let got=0;
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      out.set(value,got);got+=value.length;
      onProgress(got/total);
    }
    return got===total?out:out.subarray(0,got);
  }
  async function gunzip(u8){
    const ds=new DecompressionStream("gzip");
    const stream=new Blob([u8]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  let infoLoaded=false;
  async function loadInfo(){
    if(infoLoaded)return;
    /* Two ways to reach the info file, same pair the shard reads already use. The direct
       storage.googleapis.com path is fine when the bucket sends CORS headers; when it does not,
       fetch REJECTS (it does not return !res.ok), which used to abort the whole download before
       the shard fetch ever got to try its own fallback. The JSON API path below is CORS-enabled
       by Google for public objects, so try it before giving up -- and remember the choice in
       useAlt so the range requests that follow go straight there too. */
    const direct=CFG.meshBase+"info", alt=CFG.meshBaseAlt+"info?alt=media";
    const order=useAlt?[alt,direct]:[direct,alt];
    let res=null;
    for(let k=0;k<order.length;k++){
      try{ res=await fetch(order[k]); useAlt=(order[k]===alt); break; }
      catch(_e){ res=null; }
    }
    if(!res){ infoLoaded=true; return; }   // both blocked -- use the built-in defaults
    if(!res.ok){infoLoaded=true;return;} // fall back to the built-in defaults above
    const j=await res.json();
    /* THREE formats now, not one. "neuroglancer_legacy_mesh" is the ORIGINAL precomputed mesh
       layout: a per-segment JSON manifest listing fragment files, each fragment a flat binary
       blob of float32 vertices in nm plus uint32 triangle indices. No Draco, no LODs, no
       quantization, no transform -- so it shares nothing with the multi-LOD path below except
       the GLB/PPTX/volume code that consumes the result. MICrONS pinky100 (πJump) uses it, and
       until this was added every 3D model / PowerPoint / Compute volume click there died on the
       throw below with a correct root ID in hand (Søren, 2026-08-27). Verified against the real
       bucket the same day: manifest at "<id>:0", 60 fragments for root 648518346349527116, the
       first one 63,904 bytes = 4 + 1907*12 + 3418*12 exactly, indices all < numVertices, and
       vertex coordinates already in absolute nm (x 398516..401408, inside pinky100's
       140000..500000 nm extent). */
    if(j["@type"]==="neuroglancer_legacy_mesh"){
      CFG.legacy=true; CFG.unsharded=false; infoLoaded=true; return;
    }
    CFG.legacy=false;
    if(j["@type"]!=="neuroglancer_multilod_draco")throw new Error('unexpected mesh format "'+j["@type"]+'"');
    if(Array.isArray(j.transform)&&j.transform.length===12)CFG.transform=j.transform;
    if(j.vertex_quantization_bits)CFG.vertexQuantizationBits=j.vertex_quantization_bits;
    /* Per the precomputed spec, a mesh info with NO "sharding" key is the unsharded multi-LOD
       layout: one object per segment holding the fragments, plus "<id>.index" holding the
       manifest. That is what gs://vclem-xh/alzheimers/segmentation_secgan_16nm/mesh uses.
       The info file is authoritative -- it overrides whatever the page's config guessed. */
    if(!j.sharding){ CFG.unsharded=true; infoLoaded=true; return; }
    CFG.unsharded=false;
    const sh=j.sharding;
    if(sh.preshift_bits!=null)CFG.preshiftBits=sh.preshift_bits;
    if(sh.minishard_bits!=null)CFG.minishardBits=sh.minishard_bits;
    if(sh.shard_bits!=null)CFG.shardBits=sh.shard_bits;
    if(sh.hash&&sh.hash!=="murmurhash3_x86_128")throw new Error('unsupported sharding hash "'+sh.hash+'"');
    infoLoaded=true;
  }
  async function findManifest(rootIdBig,forceRecheck){
    const rootIdStr=String(rootIdBig);
    if(!forceRecheck&&isRootKnownNotFound(rootIdStr)){
      const err=new Error("root ID "+rootIdStr+" is cached as unavailable in "+(CFG.snapshotName||"the seg_m1300 mesh snapshot")+" (an earlier lookup found it wasn't indexed there) \u2014 skipped the network check. Shift-click to force a fresh check.");
      err.meshCached=true;throw err;
    }
    /* Unsharded: there is nothing to locate. The manifest is its own object, so skip the
       murmur hash, the shard index and the minishard index entirely and hand readManifest()
       the two URLs. Everything downstream -- manifest parsing, LOD choice, Draco decode, GLB,
       PPTX -- is shared with the sharded path unchanged. */
    if(CFG.unsharded){
      return {unsharded:true,rootIdStr,url:objUrl(rootIdStr),indexUrl:objUrl(rootIdStr+".index")};
    }
    const {shard,minishard}=shardAndMinishard(rootIdBig);
    let url=shardUrl(shard);
    const shardIndexSize=(1<<CFG.minishardBits)*16;
    const off=minishard*16;
    let entry;
    try{entry=await rangeGet(url,off,off+15);}
    catch(e){
      if(!useAlt){useAlt=true;url=shardUrl(shard);entry=await rangeGet(url,off,off+15);}
      else throw e;
    }
    const ev=new DataView(entry.buffer,entry.byteOffset,entry.byteLength);
    const startOffset=ev.getBigUint64(0,true),endOffset=ev.getBigUint64(8,true);
    if(startOffset===endOffset){
      markRootNotFound(rootIdStr);
      throw new Error("minishard "+minishard+" is empty — root ID not in this dataset (or was later merged/split away)? Cached — future attempts will skip the network check; Shift-click to force a recheck.");
    }
    const msStart=BigInt(shardIndexSize)+startOffset,msEnd=BigInt(shardIndexSize)+endOffset;
    const idxRaw=await gunzip(await rangeGet(url,Number(msStart),Number(msEnd-1n)));
    const aligned=new Uint8Array(idxRaw.length);aligned.set(idxRaw);
    const arr=new BigUint64Array(aligned.buffer);
    const n=arr.length/3;
    const ids=arr.slice(0,n),starts=arr.slice(n,2*n),sizes=arr.slice(2*n);
    for(let i=1;i<n;i++)ids[i]+=ids[i-1];
    let prev=BigInt(shardIndexSize);
    for(let i=0;i<n;i++){starts[i]+=prev;prev=starts[i]+sizes[i];}
    let idx=-1;
    for(let i=0;i<n;i++)if(ids[i]===rootIdBig){idx=i;break;}
    if(idx<0){
      markRootNotFound(rootIdStr);
      throw new Error("root ID "+rootIdStr+" not found in minishard "+minishard+" ("+n+" entries) — wrong dataset, or this ID predates/postdates the seg_m1300 snapshot? Cached — future attempts will skip the network check; Shift-click to force a recheck.");
    }
    return {shard,minishard,manifestStart:Number(starts[idx]),manifestSize:Number(sizes[idx]),url};
  }
  /* The one place the two layouts differ after location. Sharded: the manifest sits AFTER its
     fragments inside the shard, so fragmentLayout() walks backwards from manifestStart.
     Unsharded: the fragments are a separate object starting at byte 0, which is exactly
     fragmentLayout(parsed, totalBytes) -- so the same function serves both and there is no
     second offset calculation to keep in step. */
  async function readManifest(info,onProgress){
    if(!info.unsharded){
      const raw=await rangeGet(info.url,info.manifestStart,info.manifestStart+info.manifestSize-1);
      const parsed=parseManifest(await maybeGunzip(raw));
      return {parsed,layout:fragmentLayout(parsed,info.manifestStart)};
    }
    let res=null;
    try{ res=await fetch(info.indexUrl); }catch(_e){ res=null; }
    if((!res||!res.ok)&&!useAlt){        // same CORS fallback the sharded reads use
      useAlt=true;
      info.indexUrl=objUrl(info.rootIdStr+".index"); info.url=objUrl(info.rootIdStr);
      try{ res=await fetch(info.indexUrl); }catch(_e2){ res=null; }
    }
    if(!res||!res.ok){
      markRootNotFound(info.rootIdStr);
      throw new Error("no mesh for segment "+info.rootIdStr+" ("+(res?("HTTP "+res.status):"fetch blocked")+
        ") \u2014 this segmentation does not mesh every segment. Cached; Shift-click to force a recheck.");
    }
    const parsed=parseManifest(await maybeGunzip(new Uint8Array(await res.arrayBuffer())));
    let total=0;
    for(const lod of parsed.lods)for(const sz of lod.sizes)total+=sz;
    return {parsed,layout:fragmentLayout(parsed,total)};
  }
  function parseManifest(u8){
    const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
    let p=0;
    const chunkShape=[dv.getFloat32(p,true),dv.getFloat32(p+4,true),dv.getFloat32(p+8,true)];p+=12;
    const gridOrigin=[dv.getFloat32(p,true),dv.getFloat32(p+4,true),dv.getFloat32(p+8,true)];p+=12;
    const numLods=dv.getUint32(p,true);p+=4;
    const lodScales=[];for(let i=0;i<numLods;i++){lodScales.push(dv.getFloat32(p,true));p+=4;}
    const vertexOffsets=[];
    for(let i=0;i<numLods;i++){vertexOffsets.push([dv.getFloat32(p,true),dv.getFloat32(p+4,true),dv.getFloat32(p+8,true)]);p+=12;}
    const numFragsPerLod=[];for(let i=0;i<numLods;i++){numFragsPerLod.push(dv.getUint32(p,true));p+=4;}
    const lods=[];
    for(let l=0;l<numLods;l++){
      const n=numFragsPerLod[l];
      const pos=new Uint32Array(3*n);
      for(let i=0;i<3*n;i++){pos[i]=dv.getUint32(p,true);p+=4;}
      const sizes=new Uint32Array(n);
      for(let i=0;i<n;i++){sizes[i]=dv.getUint32(p,true);p+=4;}
      lods.push({n,pos,sizes});
    }
    return {chunkShape,gridOrigin,numLods,lodScales,vertexOffsets,numFragsPerLod,lods};
  }
  function fragmentLayout(parsed,manifestStart){
    let totalBytes=0;
    for(const lod of parsed.lods)for(const s of lod.sizes)totalBytes+=s;
    let offset=manifestStart-totalBytes;
    const perLod=[];
    for(const lod of parsed.lods){
      const start=offset,frags=[];
      for(const s of lod.sizes){frags.push([offset,s]);offset+=s;}
      perLod.push({start,end:offset-1,bytes:offset-start,frags});
    }
    return perLod;
  }
  let dracoPromise=null;
  function loadDraco(){
    if(dracoPromise)return dracoPromise;
    dracoPromise=(async()=>{
      const [wrapperSrc,wasmBinary]=await Promise.all([
        fetch(CFG.dracoWrapper).then(r=>{if(!r.ok)throw new Error("draco wrapper "+r.status);return r.text();}),
        fetch(CFG.dracoWasm).then(r=>{if(!r.ok)throw new Error("draco wasm "+r.status);return r.arrayBuffer();})
      ]);
      const factory=new Function(wrapperSrc+"\nreturn DracoDecoderModule;")();
      return await factory({wasmBinary});
    })();
    return dracoPromise;
  }
  function decodeDracoFragment(draco,decoder,bytes){
    const buf=new draco.DecoderBuffer();
    buf.Init(new Int8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength),bytes.byteLength);
    const mesh=new draco.Mesh();
    const status=decoder.DecodeBufferToMesh(buf,mesh);
    if(!status.ok()){draco.destroy(mesh);draco.destroy(buf);throw new Error("draco decode failed: "+status.error_msg());}
    const numPoints=mesh.num_points(),numFaces=mesh.num_faces();
    const attId=decoder.GetAttributeId(mesh,draco.POSITION);
    const att=decoder.GetAttribute(mesh,attId);
    const nVals=numPoints*3;
    const pPtr=draco._malloc(nVals*4);
    decoder.GetAttributeDataArrayForAllPoints(mesh,att,draco.DT_FLOAT32,nVals*4,pPtr);
    const verts=new Float32Array(draco.HEAPF32.buffer,pPtr,nVals).slice();
    draco._free(pPtr);
    const nIdx=numFaces*3;
    const iPtr=draco._malloc(nIdx*4);
    decoder.GetTrianglesUInt32Array(mesh,nIdx*4,iPtr);
    const idx=new Uint32Array(draco.HEAPF32.buffer,iPtr,nIdx).slice();
    draco._free(iPtr);
    draco.destroy(mesh);draco.destroy(buf);
    return {verts,idx};
  }
  /* MICrONS/Neuroglancer's Y axis increases DOWNWARD (image-row convention: y=0 is the pia
     surface, larger y is deeper/more ventral) but glTF/GLB assumes Y-UP, so feeding raw Y
     straight through renders the mesh upside down in any standard glTF viewer (Blender, the
     am3d PowerPoint camera, etc.). The PowerPoint export already negates Y (see the long
     comment inline in downloadRootPptx() below, confirmed live 2026-07-28); the plain .glb
     download was deliberately left un-mirrored at the time on the assumption that whatever
     opened it already accounted for the convention -- Søren reported otherwise (2026-08), so
     the SAME fix now applies here too. Mirroring one axis also flips triangle winding, so each
     triangle's last two indices are swapped to restore correct front-face orientation/lighting. */
  function flipYForGLTF(rawPositions,rawIndices){
    const positions=new Float32Array(rawPositions.length);
    for(let k=0;k<rawPositions.length;k+=3){
      positions[k]=rawPositions[k];positions[k+1]=-rawPositions[k+1];positions[k+2]=rawPositions[k+2];
    }
    const indices=new Uint32Array(rawIndices.length);
    for(let t=0;t<rawIndices.length;t+=3){
      indices[t]=rawIndices[t];indices[t+1]=rawIndices[t+2];indices[t+2]=rawIndices[t+1];
    }
    return {positions,indices};
  }
  function buildGLB(positions,indices,name){
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(let i=0;i<positions.length;i+=3){
      const x=positions[i],y=positions[i+1],z=positions[i+2];
      if(x<minX)minX=x;if(y<minY)minY=y;if(z<minZ)minZ=z;
      if(x>maxX)maxX=x;if(y>maxY)maxY=y;if(z>maxZ)maxZ=z;
    }
    const idxBytes=indices.byteLength;
    const idxPad=(4-(idxBytes%4))%4;
    const posOffset=idxBytes+idxPad;
    const binLength=posOffset+positions.byteLength;
    const json={
      asset:{version:"2.0",generator:"uJump MICrONS mesh downloader"},
      scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name}],
      meshes:[{name,primitives:[{attributes:{POSITION:1},indices:0,mode:4}]}],
      accessors:[
        {bufferView:0,componentType:5125,count:indices.length,type:"SCALAR"},
        {bufferView:1,componentType:5126,count:positions.length/3,type:"VEC3",min:[minX,minY,minZ],max:[maxX,maxY,maxZ]}
      ],
      bufferViews:[
        {buffer:0,byteOffset:0,byteLength:idxBytes,target:34963},
        {buffer:0,byteOffset:posOffset,byteLength:positions.byteLength,target:34962}
      ],
      buffers:[{byteLength:binLength}]
    };
    let jsonBytes=new TextEncoder().encode(JSON.stringify(json));
    const jsonPad=(4-(jsonBytes.length%4))%4;
    if(jsonPad){const padded=new Uint8Array(jsonBytes.length+jsonPad);padded.set(jsonBytes);padded.fill(0x20,jsonBytes.length);jsonBytes=padded;}
    const binPadded=binLength+((4-(binLength%4))%4);
    const total=12+8+jsonBytes.length+8+binPadded;
    const out=new Uint8Array(total);
    const dv=new DataView(out.buffer);
    let o=0;
    dv.setUint32(o,0x46546C67,true);o+=4;
    dv.setUint32(o,2,true);o+=4;
    dv.setUint32(o,total,true);o+=4;
    dv.setUint32(o,jsonBytes.length,true);o+=4;
    dv.setUint32(o,0x4E4F534A,true);o+=4;
    out.set(jsonBytes,o);o+=jsonBytes.length;
    dv.setUint32(o,binPadded,true);o+=4;
    dv.setUint32(o,0x004E4942,true);o+=4;
    out.set(new Uint8Array(indices.buffer,indices.byteOffset,idxBytes),o);
    out.set(new Uint8Array(positions.buffer,positions.byteOffset,positions.byteLength),o+posOffset);
    return out;
  }
  /* Core fetch+decode pipeline, shared by the .glb download and the .pptx builder below so
     neither duplicates the shard/manifest/Draco logic. One click, no picker: pick the coarsest
     LOD still under ~8MB (falling back to the coarsest LOD available), absolute dataset
     coordinates in micrometres so multiple downloaded meshes stay spatially aligned with each
     other and with Neuroglancer/Blender imports of MICrONS data -- same default as
     mesh_download_prototype.html's LOD table. */
  /* ── neuroglancer_legacy_mesh ──────────────────────────────────────────────────────────
     Manifest: <meshBase><id>:0  ->  {"fragments":[name, ...]}
     Fragment: <meshBase><name>  ->  uint32 numVertices
                                     float32[numVertices*3] vertex xyz, ABSOLUTE nm
                                     uint32[...]            triangle indices, to EOF
     Returns the same shape as fetchMesh's multi-LOD path -- positions in MICROMETRES, indices
     0-based into them -- so buildGLB, the PPTX exporter, computeVolume and the contact-grid
     code all consume it unchanged.

     There are no LODs here, so there is nothing to trade detail against size with: every
     fragment is part of the surface and dropping one leaves a hole. The size guard is therefore
     a hard refusal with a readable message rather than a silent downgrade. */
  const LEGACY_MAX_BYTES=192*1048576;
  const LEGACY_PARALLEL=6;
  function decodeLegacyFragment(u8){
    if(u8.length<4)throw new Error("fragment shorter than its own header");
    const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
    const nv=dv.getUint32(0,true);
    const vBytes=nv*12;
    if(4+vBytes>u8.length)throw new Error("fragment claims "+nv+" vertices but holds "+u8.length+" bytes");
    const rest=u8.length-4-vBytes;
    if(rest%12)throw new Error("index block is "+rest+" bytes, not a whole number of triangles");
    /* .slice(), not a view: the byte offset is not guaranteed to be 4-aligned, and a
       Float32Array view on an unaligned offset throws in every browser. */
    const verts=new Float32Array(u8.buffer.slice(u8.byteOffset+4,u8.byteOffset+4+vBytes));
    const idx=new Uint32Array(u8.buffer.slice(u8.byteOffset+4+vBytes,u8.byteOffset+u8.length));
    for(let k=0;k<idx.length;k++)if(idx[k]>=nv)throw new Error("index "+idx[k]+" out of range for "+nv+" vertices");
    return {verts,idx};
  }
  async function fetchLegacyMesh(rootIdStr,onProgress,forceRecheck){
    if(!forceRecheck&&isRootKnownNotFound(rootIdStr)){
      const err=new Error("root ID "+rootIdStr+" is cached as having no mesh in this dataset (an earlier lookup found none) — skipped the network check. Shift-click to force a fresh check.");
      err.meshCached=true;throw err;
    }
    onProgress&&onProgress(0,"reading manifest…");
    let res=null,url=objUrl(rootIdStr+":0");
    try{ res=await fetch(url); }catch(_e){ res=null; }
    if((!res||!res.ok)&&!useAlt){            // same CORS fallback the other layouts use
      useAlt=true; url=objUrl(rootIdStr+":0");
      try{ res=await fetch(url); }catch(_e2){ res=null; }
    }
    if(!res||!res.ok){
      markRootNotFound(rootIdStr);
      throw new Error("no mesh for segment "+rootIdStr+" ("+(res?("HTTP "+res.status):"fetch blocked")+
        ") — this segmentation does not mesh every segment. Cached; Shift-click to force a recheck.");
    }
    let man;
    try{ man=JSON.parse(await res.text()); }
    catch(_e){ throw new Error("mesh manifest for "+rootIdStr+" is not JSON — wrong mesh directory?"); }
    const frags=(man&&man.fragments)||[];
    if(!frags.length)throw new Error("mesh manifest for "+rootIdStr+" lists no fragments");
    onProgress&&onProgress(0.05,frags.length+" fragments…");
    const parts=new Array(frags.length);
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
    }
    for(let i=0;i<frags.length;i+=LEGACY_PARALLEL){
      const batch=[];
      for(let k=i;k<Math.min(i+LEGACY_PARALLEL,frags.length);k++)batch.push(one(k));
      await Promise.all(batch);
    }
    const got=parts.filter(Boolean);
    if(!got.length)throw new Error("no fragments decoded ("+frags.length+" in the manifest, "+failed+" failed)");
    let totalV=0,totalI=0;
    for(const g of got){totalV+=g.verts.length;totalI+=g.idx.length;}
    const positions=new Float32Array(totalV),indices=new Uint32Array(totalI);
    let vo=0,io=0;
    for(const g of got){
      /* nm -> micrometres, the frame every consumer of this function expects (see the
         "scale=1000 // micrometres" line in the multi-LOD path). No affine transform: these
         vertices are already absolute dataset nm, confirmed against the volume's own extent. */
      for(let k=0;k<g.verts.length;k++)positions[vo+k]=g.verts[k]/1000;
      const base=vo/3;
      for(let k=0;k<g.idx.length;k++)indices[io+k]=g.idx[k]+base;
      vo+=g.verts.length;io+=g.idx.length;
    }
    return {positions,indices,lod:0,numLods:1,bytes,legacyFragments:frags.length,legacyFailed:failed};
  }
  /* ── graphene (chunked-graph) meshes, e.g. V1DD's CAVE-served segmentation ──────────────────
     Verified 2026-08-30 against seung-lab/cloud-volume's public source (datasource/graphene/mesh/
     {un,}sharded.py) and cross-checked against the fact that V1DD's own Neuroglancer/Spelunker
     viewer -- itself browser JS -- already renders these meshes live today (Søren: "Spelunker
     needs the same login to render V1DD segmentation at all"). A graphene mesh is NOT one object
     with LODs to choose between like the two paths above -- it is assembled by concatenating
     EVERY fragment the manifest lists (a segment spans multiple chunked-graph layers/chunks), and
     locating those fragments needs a CAVE-token-authenticated manifest call first:
       1. GET manifestBase + rootId + ":0" (+ ?verify=true&return_seg_ids=1), header
          Authorization: Bearer <token> -> JSON {fragments:[...], seg_ids:[...]}.
       2. Each fragment string self-describes its location -- no murmur-hash shard/minishard
          lookup needed at all, unlike the sharded path above. A tilde prefix means "initial"
          (already-sharded): "~2/344239114-0.shard:224659:442" is layer 2, shard file
          "344239114-0.shard", byte range [224659, 224659+442). No tilde means "dynamic" (meshed
          since the last shard build, e.g. a very recent proofreading edit) -- these live at a
          different, unsharded location this tool does not have a URL for yet, so they are
          skipped with a count surfaced to the user rather than silently dropped.
     cloud-volume's Python client also sends a "start_layer" hint as a JSON body on that GET
     request (fetch_manifest_remote) -- browsers cannot do that (the Fetch spec forbids a body on
     GET/HEAD), so it is omitted here. That has to be fine: Neuroglancer is under the exact same
     browser restriction and already gets working manifests from this same service, so the
     server's default (no start_layer) must be a valid request shape on its own.
     NOT YET LIVE-VERIFIED (needs Søren's own CAVE token, which this tool cannot obtain or hold on
     his behalf -- see the "Need a CAVE token?" box in the Connectivity panel): whether the
     Draco-decoded vertex positions that come back are already absolute nanometres (assumed here,
     the documented CAVE/PCG convention) or need the chunk-shape/grid-origin quantization math the
     sharded neuroglancer_multilod_draco path above applies. If a downloaded V1DD mesh looks
     offset, squashed, or wrongly scaled, that assumption is the first thing to revisit. */
  function caveToken(){
    try{return localStorage.getItem(CFG.caveTokenKey||"djump_cave_token")||"";}catch(_e){return "";}
  }
  function parseGrapheneManifest(manifest){
    const frags=(manifest&&manifest.fragments)||[],segids=(manifest&&manifest.seg_ids)||[];
    const initial=[],dynamic=[];
    const re=/^~(\d+)\/([\d\-]+\.shard):(\d+):(\d+)$/;
    for(let i=0;i<frags.length;i++){
      const f=frags[i];
      if(!f)continue;
      if(f[0]==="~"){
        const m=re.exec(f);
        if(!m)continue;
        initial.push({layer:m[1],shard:m[2],start:Number(m[3]),size:Number(m[4]),segid:segids[i]});
      }else dynamic.push(f);
    }
    return {initial,dynamic};
  }
  async function fetchGrapheneMesh(rootIdStr,onProgress,forceRecheck){
    if(!forceRecheck&&isRootKnownNotFound(rootIdStr)){
      const err=new Error("root ID "+rootIdStr+" is cached as unavailable (an earlier lookup found no mesh manifest) — skipped the network check. Shift-click to force a fresh check.");
      err.meshCached=true;throw err;
    }
    const token=caveToken();
    if(!token)throw new Error("This cell's mesh needs a free CAVE token (V1DD's segmentation is token-gated, same as viewing it in Spelunker). Open the “Need a CAVE token?” link in the Connectivity panel, paste the token there once, then retry.");
    onProgress&&onProgress(0,"reading manifest…");
    const url=CFG.manifestBase+rootIdStr+":0?verify=true&return_seg_ids=1";
    let res;
    try{res=await fetch(url,{headers:{"Authorization":"Bearer "+token}});}
    catch(e){throw new Error("could not reach the mesh manifest service (network error) — "+(e&&e.message||e));}
    if(res.status===401||res.status===403)throw new Error("CAVE token was rejected (HTTP "+res.status+") — it may have expired. Get a fresh one from the “Need a CAVE token?” link and try again.");
    if(!res.ok){
      markRootNotFound(rootIdStr);
      throw new Error("no mesh manifest for segment "+rootIdStr+" (HTTP "+res.status+") — this ID may not be meshed, or predates/postdates the current segmentation. Cached; Shift-click to force a recheck.");
    }
    let manifest;
    try{manifest=await res.json();}
    catch(_e){throw new Error("mesh manifest for "+rootIdStr+" was not valid JSON.");}
    const {initial,dynamic}=parseGrapheneManifest(manifest);
    if(!initial.length&&!dynamic.length){
      markRootNotFound(rootIdStr);
      throw new Error("mesh manifest for "+rootIdStr+" lists no fragments.");
    }
    onProgress&&onProgress(0.05,initial.length+" fragment(s)…"+(dynamic.length?(" ("+dynamic.length+" too freshly edited to fetch yet)"):""));
    const draco=await loadDraco();
    const decoder=new draco.Decoder();
    const vertChunks=[],idxChunks=[];
    let totalVerts=0,totalIdx=0,decoded=0,failed=dynamic.length,bytes=0;
    for(let i=0;i<initial.length;i++){
      const fr=initial[i];
      const fragUrl=CFG.meshBase+fr.layer+"/"+fr.shard;
      let blob;
      try{ blob=await rangeGet(fragUrl,fr.start,fr.start+fr.size-1); }
      catch(_e){ failed++; continue; }
      bytes+=blob.length;
      let r;
      try{ r=decodeDracoFragment(draco,decoder,blob); }catch(_e){ failed++; continue; }
      const base=totalVerts/3;
      if(base)for(let k=0;k<r.idx.length;k++)r.idx[k]+=base;
      for(let k=0;k<r.verts.length;k++)r.verts[k]=r.verts[k]/1000;   // nm -> µm, this file's usual frame
      vertChunks.push(r.verts);idxChunks.push(r.idx);
      totalVerts+=r.verts.length;totalIdx+=r.idx.length;decoded++;
      if(i%8===0){onProgress&&onProgress(0.1+0.85*(i/initial.length),"fetching+decoding "+(i+1)+"/"+initial.length+"…");await new Promise(requestAnimationFrame);}
    }
    draco.destroy(decoder);
    if(!decoded)throw new Error("no fragments decoded ("+initial.length+" in the manifest, "+failed+" failed)");
    const positions=new Float32Array(totalVerts),indices=new Uint32Array(totalIdx);
    let vo=0,io=0;
    for(let i=0;i<vertChunks.length;i++){
      positions.set(vertChunks[i],vo);vo+=vertChunks[i].length;
      indices.set(idxChunks[i],io);io+=idxChunks[i].length;
    }
    return {positions,indices,lod:0,numLods:1,bytes,grapheneFragments:initial.length,grapheneFailed:failed};
  }
  async function fetchMesh(rootIdStr,onProgress,forceRecheck,forceCoarsestLod){
    /* Graphene datasets are known statically from config (CFG.manifestBase), not discovered from
       an info file -- check this FIRST and skip loadInfo() entirely for them. loadInfo() fetches
       CFG.meshBase+"info", and for V1DD that base has no meaning as a directory listing (it's the
       sharded fragment bucket root); calling it would waste a round trip at best and at worst trip
       the "unexpected mesh format" throw below if that URL ever returns unrelated JSON. */
    if(CFG.manifestBase)return await fetchGrapheneMesh(rootIdStr,onProgress,forceRecheck);
    /* The legacy layout has no shards, no minishards, no manifest byte ranges and no LOD choice,
       so it branches out before any of that -- right after loadInfo(), which is what decides
       which layout this dataset uses. */
    await loadInfo();
    if(CFG.legacy)return await fetchLegacyMesh(rootIdStr,onProgress,forceRecheck);
    const rootId=BigInt(rootIdStr);
    onProgress&&onProgress(0,"reading manifest…");
    const info=await findManifest(rootId,forceRecheck);
    const {parsed,layout}=await readManifest(info,onProgress);
    let lod=parsed.numLods-1;
    /* forceCoarsestLod (2026-08-16, Soren: "it does not load any astrocytes. All astrocyte meshes
       are too large to load") -- root cause of that was NOT a bug in the vertex-count safety cap
       itself, it was that astrocytes are so large and sprawling that even their finest LOD under
       the normal 8MB-byte search below routinely decodes to WAY more than 400k vertices (draco
       compression ratios mean an 8MB compressed fragment set can unpack into millions of vertices).
       Tripartite synapse proximity only needs a coarse approximation of "is there astrocyte
       membrane near this synapse" at a threshold on the order of hundreds of nm, not fine surface
       detail -- so for that one caller, skip the byte-size search entirely and always take the
       COARSEST available LOD (numLods-1), which is both far smaller and correctly decoded (multi-
       resolution meshes are built exactly for this kind of "good enough, cheap" use). Every other
       caller (Cell contacts, mesh downloads, PowerPoint export, volume computation) omits this
       param and keeps the original finest-under-8MB behaviour unchanged. */
    if(!forceCoarsestLod){
      for(let l=parsed.numLods-1;l>=0;l--){if(layout[l].bytes<8*1048576)lod=l;}
    }
    const L=layout[lod];
    onProgress&&onProgress(0.05,"fetching "+mb(L.bytes)+"…");
    const blob=await rangeGet(info.url,L.start,L.end,f=>onProgress&&onProgress(0.05+f*0.55,"fetching…"));
    const draco=await loadDraco();
    const decoder=new draco.Decoder();
    const quant=Math.pow(2,CFG.vertexQuantizationBits)-1;
    const cs=parsed.chunkShape,go=parsed.gridOrigin,vo=parsed.vertexOffsets[lod];
    const lodScale=Math.pow(2,lod);
    const T=CFG.transform;
    const P=parsed.lods[lod].pos,nF=parsed.lods[lod].n;
    const vertChunks=[],idxChunks=[];
    let totalVerts=0,totalIdx=0,decoded=0;
    for(let i=0;i<nF;i++){
      const [off,size]=L.frags[i];
      if(size===0)continue;
      const slice=blob.subarray(off-L.start,off-L.start+size);
      let r;
      try{r=decodeDracoFragment(draco,decoder,slice);}catch(_e){continue;}
      const fx=P[i],fy=P[nF+i],fz=P[2*nF+i];
      const v=r.verts;
      const scale=1000; // micrometres
      for(let k=0;k<v.length;k+=3){
        const sx=go[0]+vo[0]+cs[0]*lodScale*(fx+v[k]/quant);
        const sy=go[1]+vo[1]+cs[1]*lodScale*(fy+v[k+1]/quant);
        const sz=go[2]+vo[2]+cs[2]*lodScale*(fz+v[k+2]/quant);
        v[k]=(T[0]*sx+T[1]*sy+T[2]*sz+T[3])/scale;
        v[k+1]=(T[4]*sx+T[5]*sy+T[6]*sz+T[7])/scale;
        v[k+2]=(T[8]*sx+T[9]*sy+T[10]*sz+T[11])/scale;
      }
      const base=totalVerts/3;
      if(base)for(let k=0;k<r.idx.length;k++)r.idx[k]+=base;
      vertChunks.push(v);idxChunks.push(r.idx);
      totalVerts+=v.length;totalIdx+=r.idx.length;decoded++;
      if(i%8===0){onProgress&&onProgress(0.6+0.35*(i/nF),"decoding…");await new Promise(requestAnimationFrame);}
    }
    draco.destroy(decoder);
    if(!decoded)throw new Error("no fragments decoded (LOD "+lod+", "+nF+" fragments in manifest)");
    const positions=new Float32Array(totalVerts),indices=new Uint32Array(totalIdx);
    let vo2=0,io2=0;
    for(let i=0;i<vertChunks.length;i++){
      positions.set(vertChunks[i],vo2);vo2+=vertChunks[i].length;
      indices.set(idxChunks[i],io2);io2+=idxChunks[i].length;
    }
    return {positions,indices,lod,numLods:parsed.numLods,bytes:L.bytes};
  }
  /* Additional root IDs proposed for the CURRENT nucleus (CUR_EXTRA_ROOTS, populated by
     loadRootIdPanel()) are usually fragments of the SAME cell that a patchy automatic
     segmentation split apart, not separate cells -- so the main root ID's downloads (both the
     .glb and the PowerPoint) fold them in automatically, added 2026-07-28 at Søren's request.
     Only img65-segType extras qualify: Seg35 lives in a different bucket/format fetchMesh() can't
     read, and a bare nucleus ID has no mesh at all (see mesh-download-browser memory) -- same
     restriction the old per-row mesh button used to enforce, now centralised here since those
     per-row buttons were removed (extra root IDs are no longer individually downloadable). */
  function extraImg65RootIds(mainRootIdStr){
    /* 2026-08-19 (βJump: "also add the ability for the community to propose extra/alternate root
       IDs... like µJump already has") -- the qualifying segType used to be hardcoded "img65"
       (µJump's own main segmentation name), which silently excluded every other dataset's own
       root-ID proposals from ever being folded in. CFG.extraRootSegType lets each page's own
       UJ.cfg.mesh say which segType name its OWN proposals use (βJump sets "secgan16", its only
       segmentation) -- defaulting to "img65" when unset keeps µJump's existing behaviour
       byte-for-byte unchanged. */
    const qualifyingType=CFG.extraRootSegType||"img65";
    const seen={};seen[String(mainRootIdStr)]=1;
    const out=[];
    /* Array.isArray, not typeof!=="undefined": the latter passes for null and then .forEach
       throws, killing every mesh download. Found by the unsharded harness, 2026-08-18. */
    (typeof CUR_EXTRA_ROOTS!=="undefined"&&Array.isArray(CUR_EXTRA_ROOTS)?CUR_EXTRA_ROOTS:[]).forEach(function(r){
      const id=r&&r.id;
      if(!id||seen[String(id)])return;
      if(r.segType&&r.segType!==qualifyingType)return;
      seen[String(id)]=1;out.push(String(id));
    });
    return out;
  }
  /* Merges the main root ID's mesh with any qualifying extra root IDs into one vertex/index
     buffer. Safe to do naively -- fetchMesh() already returns absolute dataset coordinates
     specifically so multiple downloaded meshes stay spatially aligned (see the comment on
     fetchMesh above) -- so these fragments land in their true positions relative to each other,
     not stacked on top of one another.
     2026-08 (S\u00f8ren: "I had tried to compute a neuron's root ID volume but it was not
     available, then I identified its root ID and wanted to compute it, but now it says cached
     unavailable... if it is unavailable, then the user reported root ID should replace it and the
     volume can be computed based on the user reported root ID") -- each candidate root ID
     (main + extras) is now fetched independently and a failure on ONE (e.g. the main MICrONS root
     ID has since been re-segmented away and is no longer in the seg_m1300 shard index) no longer
     aborts the whole combine. Only throws when EVERY candidate fails; still throws immediately
     (before trying anything) when there are no candidates at all. meshCached on the thrown error
     is only set true when ALL failures were "known not found" cache hits, so a genuine network
     failure on one ID doesn't get silently mislabelled as a cache hit. mainUnavailable on the
     returned object flags the "main root ID's own mesh didn't resolve, this used one or more
     proposed/community root IDs instead" case so callers can tell the user what happened. */
  async function fetchCombinedMesh(mainRootIdStr,onProgress,forceRecheck,extraRootIdsOverride,forceCoarsestLod){
    /* extraRootIdsOverride (2026-08-14, Soren: "In cases where root IDs have been suggested by the
       user, the contact points should be calculated for all root IDs combined") -- every existing
       caller omits this and keeps the old behaviour (extraImg65RootIds(mainRootIdStr), which reads
       the CUR_EXTRA_ROOTS global -- only ever populated for whichever cell's own panel is currently
       open on screen). The Cell contacts feature needs this for CANDIDATE cells too, not just the
       one currently displayed, so it passes an explicitly-fetched list here instead (see
       fetchExtraRootIdsFor() in the Cell contacts script block) rather than relying on that global,
       which would silently stay empty for every cell except the one on screen.
       forceCoarsestLod (2026-08-16) -- passed straight through to every fetchMesh() call below; see
       fetchMesh's own comment. Only the Tripartite synapse feature's astrocyte lookups set this. */
    const rootIds=[String(mainRootIdStr)].concat(extraRootIdsOverride!==undefined?extraRootIdsOverride:extraImg65RootIds(mainRootIdStr)).filter(function(id){return id&&id!=="";});
    if(!rootIds.length)throw new Error("No root IDs available for this cell yet \u2014 propose one below, then try again.");
    const n=rootIds.length,meshes=[],usedIds=[],failures=[];
    for(let i=0;i<n;i++){
      const idx=i;
      try{
        const m=await fetchMesh(rootIds[i],(frac,msg)=>onProgress&&onProgress((idx+frac)/n,(msg||"")+(n>1?" (fragment "+(idx+1)+"/"+n+")":"")),forceRecheck,forceCoarsestLod);
        meshes.push(m);usedIds.push(rootIds[i]);
      }catch(err){
        console.warn("[uJump mesh] root ID "+rootIds[i]+" unavailable, skipping:",err&&err.message);
        failures.push(err);
      }
    }
    if(!meshes.length){
      const allCached=failures.length>0&&failures.every(function(e){return e&&e.meshCached;});
      const err=new Error(n>1
        ?"None of the "+n+" root IDs for this cell (main + proposed) were found in the seg_m1300 mesh snapshot."
        :((failures[0]&&failures[0].message)||"Mesh not found."));
      err.meshCached=allCached;throw err;
    }
    const mainUnavailable=usedIds.indexOf(String(mainRootIdStr))<0;
    if(meshes.length===1){
      const m=meshes[0];
      return {positions:m.positions,indices:m.indices,lod:m.lod,numLods:m.numLods,bytes:m.bytes,fragmentCount:1,rootIds:usedIds,mainUnavailable};
    }
    let totalV=0,totalI=0,bytes=0;
    meshes.forEach(m=>{totalV+=m.positions.length;totalI+=m.indices.length;bytes+=m.bytes||0;});
    const positions=new Float32Array(totalV),indices=new Uint32Array(totalI);
    let vOff=0,vCount=0,iOff=0;
    meshes.forEach(m=>{
      positions.set(m.positions,vOff);
      for(let k=0;k<m.indices.length;k++)indices[iOff+k]=m.indices[k]+vCount;
      vOff+=m.positions.length;iOff+=m.indices.length;vCount+=m.positions.length/3;
    });
    return {positions,indices,lod:null,numLods:null,bytes,fragmentCount:meshes.length,rootIds:usedIds,mainUnavailable};
  }
  /* ---------- the EXPORT half, split out from the FETCH half (2026-09-01) ----------
     Søren asked for χJump's cb2 cells to get the same three buttons these tools have: a .glb, a
     PowerPoint and a computed volume. χJump cannot use downloadRoot() to get them -- cb2 publishes
     unsharded legacy meshes with their own manifest format, decoded by xjump_mesh.js, not by the
     graphene/Draco pipeline above.

     What it CAN use is everything that happens after the geometry exists: the Y-flip, the GLB
     writer, the scale bar, the PowerPoint skeleton, the thumbnail, the volume sum. So those are
     now three functions that take geometry and know nothing about where it came from, and the
     three entry points below are fetch + call. One implementation of the .glb format, one of the
     .pptx, one of the volume -- reached from two different fetchers.

     Geometry in, here and everywhere in this file, is MICROMETRES: {positions, indices}. */
  function saveBlob(blob,filename){
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function saveGlb(geo,opts){
    const o=opts||{};
    const {positions,indices}=flipYForGLTF(geo.positions,geo.indices);
    const glb=buildGLB(positions,indices,o.name||"mesh");
    const filename=(o.filename||o.name||"mesh")+".glb";
    saveBlob(new Blob([glb],{type:"model/gltf-binary"}),filename);
    return {filename,vertices:positions.length/3};
  }
  /* Signed-tetrahedron sum (divergence theorem) -- see computeVolume()'s own comment below for why
     this is reported as an estimate rather than an exact figure. Translation-invariant, so it does
     not care whether the caller's geometry is centred. */
  function volumeOf(geo){
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
  }
  async function downloadRoot(rootIdStr,onProgress,forceRecheck){
    const {positions:rawPositions,indices:rawIndices,lod,numLods,bytes,fragmentCount,rootIds,mainUnavailable}=await fetchCombinedMesh(rootIdStr,onProgress,forceRecheck);
    /* When there's no main root ID (community-only combine), fall back to the first combined ID
       so the filename is still a real, traceable segmentation ID rather than a blank/underscore. */
    const idForName=rootIdStr||rootIds[0];
    const tag=fragmentCount>1?"_combined"+fragmentCount:"_lod"+lod;
    onProgress&&onProgress(1,"saving…");
    const saved=saveGlb({positions:rawPositions,indices:rawIndices},
      {name:"microns_"+idForName+tag,filename:"microns_"+idForName+tag+"_um"});
    return {lod,numLods,bytes,vertices:saved.vertices,filename:saved.filename,
            fragmentCount,rootIds,mainUnavailable};
  }
  /* ---------- Mesh volume (on-demand, per Søren's request 2026-07-30) ----------
     Nucleus volume (see NV/nucVolumeStr near the top of the file) is precomputed and free to
     show everywhere -- but the volume of the whole CELL BODY isn't a column in any CAVE table,
     so the only way to get it is to fetch and decode the full mesh (same fetchCombinedMesh() the
     download buttons already use) and compute it directly from the triangle geometry. Søren
     explicitly chose this be an on-demand click (not automatic on every nucleus lookup), since it
     costs a real mesh fetch+decode -- the same cost as clicking "3D model" -- rather than being
     free like the other data on this panel.
     Signed-tetrahedron-sum (divergence theorem): summing the signed volume of the tetrahedron
     formed by each triangle and the origin gives the mesh's enclosed volume exactly, for a
     CLOSED, consistently-wound mesh, regardless of where the mesh sits relative to the origin.
     MICrONS meshes are decoded straight from Draco-compressed segmentation fragments and can have
     small gaps or non-manifold spots at fragment boundaries (worse when several root-ID fragments
     are combined) -- small gaps mostly cancel out in this sum but aren't corrected for, so this is
     reported to the user as an ESTIMATE, not an exact figure. Positions are already in this tool's
     usual µm mesh-download units, so no extra scaling is needed. */
  async function computeVolume(rootIdStr,onProgress,forceRecheck){
    const {positions,indices,fragmentCount,rootIds,mainUnavailable}=await fetchCombinedMesh(rootIdStr,onProgress,forceRecheck);
    onProgress&&onProgress(0.98,"computing volume…");
    const v=volumeOf({positions,indices});
    return {volumeUm3:v.volumeUm3,vertices:v.vertices,fragmentCount,rootIds,mainUnavailable};
  }
  /* ---------- PowerPoint (.pptx) with a live, auto-spinning 3D model ----------
     PPTXSK is a ~32KB skeleton .pptx -- ONE slide holding a 3D-model placeholder with the
     Turntable animation already applied -- captured by literally doing Insert > 3D Model >
     Animations > Turntable in real PowerPoint and saving, NOT hand-written, because the am3d:*
     3D-model XML extension is undocumented (not part of ECMA-376/ISO 29500) and reverse-
     engineering it blind would risk silently-corrupt files. On top of that captured skeleton,
     three ONE-TIME structural edits were made directly to the skeleton's XML (not per-download):
       1. The original title slide (no 3D content) was deleted -- sldIdLst/rels/Content_Types
          all trimmed to the single model slide, renumbered so PowerPoint doesn't see a gap.
       2. The graphicFrame (both the live am3d:model3d branch AND its mc:Fallback picture) was
          resized to the slide's full height (off y=0, cy=slide cy), centred horizontally,
          aspect ratio preserved -- "as big as it can be" per Søren's request on 2026-07-28. This
          box size is now KEPT FIXED even when shrinking the model (see FILL_BOOST note below) --
          testing showed the graphicFrame's own EMU size does not rescale the live 3D render the
          way it rescales the mc:Fallback picture; the render's on-screen size is governed entirely
          by the am3d camera/FOV math against the mesh's transformed size, so shrinking the frame
          box alone would crop the same-sized render rather than shrink it, and was reverted.
       3. The Turntable effect's timing was changed from click-triggered to autoplay: the
          wrapping cTn's stCondLst delay flipped from "indefinite" (wait for a click) to "0",
          and the effect cTn's nodeType flipped from "clickEffect" to "afterEffect" -- both are
          standard ECMA-376 animation-timing vocabulary (NOT part of the undocumented am3d
          extension), so this edit carries none of the am3d reverse-engineering risk. Confirmed
          live in PowerPoint: the spin now starts the moment the slide is reached in the
          slideshow, no click needed.
       Two plain (non-3D) text-box shapes were also added to the skeleton, stacked in the shape
       tree AFTER the model so they draw on top of it: a large bold yellow headline (cell type)
       and a smaller grey subtitle (root ID + nucleus centre coordinates, as raw VOXEL integers
       -- not µm -- specifically so they can be pasted straight back into Neuroglancer's own
       position box), both top-centred, with a subtle drop shadow for legibility over the render.
       Their run text is the literal string CELL_TYPE_PLACEHOLDER / SUBTITLE_PLACEHOLDER, swapped
       for the real values below.
     Per download, four things get replaced in slide2.xml: the embedded model3d1.glb itself,
     three numbers (meterPerModelUnit, preTrans, rot) that re-centre/re-scale the SAME fixed
     camera+lighting rig around whatever mesh is embedded, and the two text placeholders above.
     Camera, lighting, FOV etc. are copied verbatim from the reference file and are independent
     of which mesh is embedded, since preTrans/scale is exactly what normalises an arbitrary mesh
     into that fixed camera's frame.
     The mesh's Y axis is negated before any of this (see the comment inline in
     downloadRootPptx() below) -- MICrONS/Neuroglancer's Y increases downward (image-row
     convention) but glTF and this camera rig assume Y-up, so feeding raw coordinates through
     renders every cell upside down. Confirmed live and fixed 2026-07-28. Triangle winding is
     flipped in lockstep so the mirror doesn't back-face-cull or invert lighting. Only this pptx
     path is mirrored -- the plain .glb download is untouched.
     Formula reverse-engineered from the reference file's own am3d:trans block by comparing it
     against that file's actual mesh bounding box (see mesh-download-browser memory for the
     project's mesh-format validation approach) and confirmed with a synthetic off-centre test
     mesh, live, in PowerPoint, on 2026-07-28:
       longest = max(spanX, spanY, spanZ)                    // mesh bounding-box span, µm
       n = round(FILL_BOOST * 1e6 / longest); d = 1e6         // meterPerModelUnit = n/d
       preTrans.{x,y,z} = round(-center.{x,y,z} * n * 36)      // EMU (36e6 EMU/m, d fixed at 1e6)
     Base formula scales the model so its longest dimension is exactly 1 metre and centres it at
     the origin -- matching the fixed camera, which sits ~1.6m back with a 45° FOV regardless of
     which mesh is loaded. FILL_BOOST (=3, added 2026-07-28) exists because that 1-metre-object
     render turned out to occupy only ~25-35% of the NEW full-height frame -- PowerPoint's 3D
     viewport does not auto-zoom a small object to fill a bigger frame, it only scales an
     over-sized one DOWN to fit. Verified live against a cube-shaped test mesh: boosting the
     target size to 3m makes the render cross that "fit to frame" threshold so it fills the frame
     nicely, and 2.5x/5x boosts looked visually identical (both already past the threshold),
     suggesting real headroom either side of 3x. Empirically tuned, not a documented am3d
     property -- and it has a known limit: a VERY elongated, thin object (e.g. a lone dendrite
     fragment, ~40:1 length:cross-section in testing) can still look small, because it's the
     narrower on-screen cross-section, not the longest dimension, that has to cross the fill
     threshold. No universal fix for that without per-mesh-shape camera adjustment, which would
     mean touching the undocumented am3d camera math itself -- left as a known caveat rather than
     guessed at, same principle as the pericyte-subtype TBD flag elsewhere in this project.
     When Søren later asked to shrink the render ("a little too large... 2/3 of the size",
     2026-07-28, same day), the graphicFrame box was tried first but reverted: it turned out the
     frame's own EMU size does NOT rescale the live am3d render (confirmed by testing synthetic
     cube/tetrahedron meshes at both the original full-height frame and a shrunk one -- both
     rendered identically, meaning the frame only crops/positions the viewport, it doesn't zoom
     it). The correct, and only confirmed, lever for the render's own apparent size is FILL_BOOST
     itself, so it was lowered from 3 to 2 (=3*2/3) instead -- a literal 2/3 linear-size reduction
     of the same "longest dimension in metres" formula, frame box left untouched at full height.
     CAVEAT -- not re-verified against a real MICrONS mesh: this session's sandbox could not reach
     storage.googleapis.com (network egress restricted) or open ujump.html's own file:// URL in
     Chrome (extension blocks local files) to re-run the live end-to-end check rounds 1-3 used.
     The synthetic test meshes available here are compact (cube/tetrahedron: all three bounding-box
     axes comparable in length), and at FILL_BOOST=3 they overflow the camera's view badly regardless
     of frame size -- a real dendritic/axonal cell mesh is normally elongated along one axis instead,
     which is presumably why rounds 1-3's real-data testing never surfaced this. FILL_BOOST=2 could
     not be confirmed to look right on a real cell in this session -- Søren should do one live check
     after this change and report back if the model now looks too small (raise toward 2.5) or still
     too large (lower toward 1.5).
     rot is reset to 0,0,0 (a neutral start pose; Turntable spins it either way). Needs JSZip
     (loaded from cdnjs, same trust tier as the SheetJS/PptxGenJS-equivalent libraries already
     used elsewhere in this file for Excel export).
     Scale bar (added 2026-07-29, per Søren's request): a thin rod, sized to a "nice" 1-2-5x10^n
     micrometre value close to 28% of the cell's own longest bounding-box span, is concatenated
     onto the cell's raw vertex/index buffers BEFORE the Y-flip step above, positioned centred
     under the cell (offset only along the vertical axis) so it goes through the exact same
     flip/winding correction as the cell and needs no separate geometry-orientation logic. Because
     it's real geometry sharing the model's own transform, it spins correctly with the Turntable at
     every angle (unlike a flat 2D overlay, which would misrepresent scale the moment the object
     rotates) -- the tradeoff, accepted deliberately over a text-label alternative, is that being a
     horizontal rod centred on the vertical rotation axis, it appears edge-on/full-length at 0°/180°
     and foreshortens to a point at 90°/270°, same as any real elongated feature of the cell would.
     Its length is deliberately excluded from the meterPerModelUnit/preTrans normalisation (that
     math uses the cell-only bounding box, computed before the bar is added) so adding the bar can
     never change how big the cell itself renders. The chosen length in µm is surfaced to Søren only
     via the on-page button's success text ("scale bar 50 µm"), not as on-slide text -- he explicitly
     chose the embedded-rod-only option over a text label or both, when asked. */
  const PPTXSK_B64="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";
  const PPTXSK_URL="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
  let jszipPromise=null;
  function loadJSZip(){
    if(window.JSZip)return Promise.resolve(window.JSZip);
    if(jszipPromise)return jszipPromise;
    jszipPromise=new Promise((resolve,reject)=>{
      const s=document.createElement("script");
      s.src=PPTXSK_URL;s.onload=()=>resolve(window.JSZip);s.onerror=()=>reject(new Error("could not load JSZip from cdnjs"));
      document.head.appendChild(s);
    });
    return jszipPromise;
  }
  /* Cheap orthographic point-cloud snapshot (front view, X across/Y up) rendered to a small PNG
     via <canvas> -- used only as the fallback/cached-thumbnail image (am3d:raster + the
     mc:Fallback picture for non-3D viewers); PowerPoint's own live 3D engine renders the actual
     interactive/spinning view from the .glb, so this only needs to be recognisable, not exact. */
  function renderThumbnailPNG(positions,minX,maxX,minY,maxY){
    const W=512,H=512,pad=40;
    const cnv=document.createElement("canvas");cnv.width=W;cnv.height=H;
    const ctx=cnv.getContext("2d");
    ctx.fillStyle="#000";ctx.fillRect(0,0,W,H);
    const spanX=Math.max(maxX-minX,1e-6),spanY=Math.max(maxY-minY,1e-6);
    const s=Math.min((W-2*pad)/spanX,(H-2*pad)/spanY);
    ctx.fillStyle="#fff";
    const step=positions.length>60000?9:3; // subsample dense meshes so this stays fast
    for(let k=0;k<positions.length;k+=step*3){
      const px=pad+(positions[k]-minX)*s;
      const py=H-(pad+(positions[k+1]-minY)*s);
      ctx.fillRect(px,py,1.4,1.4);
    }
    const dataUrl=cnv.toDataURL("image/png");
    return dataUrl.slice(dataUrl.indexOf(",")+1); // base64 payload only
  }
  const PPTX_FILL_BOOST=2; // see the big comment above -- 2/3 of the original 3 (Søren's "a little too large, 2/3 size" request, 2026-07-28)
  function escXmlText(s){return String(s==null?"":s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));}
  /* Scale bar length, µm: nearest "nice" 1-2-5x10^n value to ~28% of the mesh's longest span --
     the standard visual-scale-bar convention (round number, clearly smaller than the subject).
     Falls back to 1µm for a degenerate/zero-size span. */
  function niceScaleBarLength(span){
    const target=Math.max(span*0.28,1e-6);
    const exp=Math.floor(Math.log10(target));
    let best=1,bestDiff=Infinity;
    for(let e=exp-1;e<=exp+1;e++){
      for(const b of [1,2,5]){
        const v=b*Math.pow(10,e);
        const diff=Math.abs(Math.log(v)-Math.log(target)); // compare on log scale so e.g. 1 vs 2 and 50 vs 100 are weighed the same way
        if(diff<bestDiff){bestDiff=diff;best=v;}
      }
    }
    return best;
  }
  /* Builds a thin rectangular rod (box, same 8-vertex/12-triangle topology as the test cubes used
     to validate this pipeline) representing barLenUm micrometres, in the SAME raw (pre-Y-flip)
     coordinate convention as fetchCombinedMesh() output -- so it can be concatenated onto the
     cell's own raw positions/indices BEFORE the existing Y-flip+winding-swap loop runs, and come
     out through that loop with correct orientation/lighting for free, no separate winding logic
     needed. Positioned centred under the cell in X/Z, offset further down the RAW Y axis (dataset
     convention: bigger Y = deeper/more ventral) so after the pipeline's Y-negation it lands BELOW
     the cell in the final Y-up render -- and, being offset only along the vertical axis from the
     cell's own centre, it spins in place with the turntable exactly like any real part of the
     scene would (edge-on/full-length at 0°/180°, foreshortened to a point at 90°/270°). */
  function buildScaleBarGeometry(rawCenterX,rawMaxY,rawCenterZ,barLenUm,gapUm){
    const half=barLenUm/2,thick=barLenUm/12;
    const y0=rawMaxY+gapUm,y1=y0+thick;
    const verts=[];
    for(const sx of [-1,1])for(const sy of [0,1])for(const sz of [-1,1]){
      verts.push(rawCenterX+sx*half, sy?y1:y0, rawCenterZ+sz*(thick/2));
    }
    const positions=new Float32Array(verts);
    const idx=[0,1,3,0,3,2,4,6,7,4,7,5,0,4,5,0,5,1,2,3,7,2,7,6,0,2,6,0,6,4,1,5,7,1,7,3];
    return {positions,indices:new Uint32Array(idx),barLenUm};
  }
  /* The PowerPoint, from geometry alone (2026-09-01 -- see the "EXPORT half" comment above). Takes
     {positions,indices} in µm plus the three strings that appear on the slide, and knows nothing
     about root IDs, CAVE or which volume this came from. downloadRootPptx() below is now this plus
     a fetch and MICrONS' own naming. */
  async function savePptx(geo,opts){
    const o=opts||{};
    const JSZip=await loadJSZip();
    const cellRawPositions=geo.positions,cellRawIndices=geo.indices;
    const onProgress=o.onProgress;
    onProgress&&onProgress(0.96,"building PowerPoint…");
    /* Cell-only raw bbox -- used to size the scale bar ITSELF (its length stays 28% of the CELL's
       own longest span, not the whole assembly's, so it stays a sensible, comparable size). The
       final am3d framing further down now uses the FULL (cell+bar) bbox instead -- see the comment
       near `longest` below for why that changed from the original cell-only design. */
    let rMinX=Infinity,rMinY=Infinity,rMinZ=Infinity,rMaxX=-Infinity,rMaxY=-Infinity,rMaxZ=-Infinity;
    for(let k=0;k<cellRawPositions.length;k+=3){
      const x=cellRawPositions[k],y=cellRawPositions[k+1],z=cellRawPositions[k+2];
      if(x<rMinX)rMinX=x;if(x>rMaxX)rMaxX=x;
      if(y<rMinY)rMinY=y;if(y>rMaxY)rMaxY=y;
      if(z<rMinZ)rMinZ=z;if(z>rMaxZ)rMaxZ=z;
    }
    const cellLongest=Math.max(rMaxX-rMinX,rMaxY-rMinY,rMaxZ-rMinZ,1e-6);
    const barLen=niceScaleBarLength(cellLongest);
    const bar=buildScaleBarGeometry((rMinX+rMaxX)/2,rMaxY,(rMinZ+rMaxZ)/2,barLen,Math.max((rMaxY-rMinY)*0.12,barLen*0.35));
    const rawPositions=new Float32Array(cellRawPositions.length+bar.positions.length);
    rawPositions.set(cellRawPositions,0);rawPositions.set(bar.positions,cellRawPositions.length);
    const cellVertCount=cellRawPositions.length/3;
    const rawIndices=new Uint32Array(cellRawIndices.length+bar.indices.length);
    rawIndices.set(cellRawIndices,0);
    for(let t=0;t<bar.indices.length;t++)rawIndices[cellRawIndices.length+t]=bar.indices[t]+cellVertCount;
    /* Same Y-flip + winding-swap as the plain .glb download (downloadRoot() above) -- see
       flipYForGLTF()'s comment for the full axis-convention explanation. Both paths used to
       apply this independently (this one only, historically -- the plain .glb was left
       un-mirrored on the assumption viewers already accounted for the convention, which turned
       out not to hold, so it now gets the same treatment too, 2026-08); now shared through one
       function so the two can't drift apart. Applied to rawPositions/rawIndices AFTER the scale
       bar is concatenated in, above, so the bar gets the exact same treatment as the cell and
       needs no separate winding logic. */
    const flipped=flipYForGLTF(rawPositions,rawIndices);
    const positions=flipped.positions,indices=flipped.indices;
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(let k=0;k<positions.length;k+=3){
      const x=positions[k],y=positions[k+1],z=positions[k+2];
      if(x<minX)minX=x;if(x>maxX)maxX=x;
      if(y<minY)minY=y;if(y>maxY)maxY=y;
      if(z<minZ)minZ=z;if(z>maxZ)maxZ=z;
    }
    /* Normalisation now frames the FULL (cell+bar) post-flip bbox -- minX..maxZ, already computed
       just above for the thumbnail. This used to frame the CELL-ONLY bbox so the bar's geometry
       could never shrink the cell's own render -- but Søren found the bar then landed OUTSIDE the
       visible frame whenever the cell filled it (reported 2026-07-30): the am3d camera has a FIXED
       frustum, so anything placed beyond the framed region simply never shows, no matter how
       correct its geometry is. Framing on the combined bbox guarantees the bar is always inside
       view, at the cost of the cell rendering very slightly smaller whenever the bar's Y-extent
       (cell height + gap + bar thickness) exceeds the cell's own longest dimension -- a small,
       acceptable trade-off since making the bar visible is the entire point of this feature. */
    const fullSpanX=maxX-minX,fullSpanY=maxY-minY,fullSpanZ=maxZ-minZ;
    const longest=Math.max(fullSpanX,fullSpanY,fullSpanZ,1e-6);
    const cx=(minX+maxX)/2,cy=(minY+maxY)/2,cz=(minZ+maxZ)/2;
    const n=Math.round(PPTX_FILL_BOOST*1000000/longest),d=1000000;
    const pre=[Math.round(-cx*n*36),Math.round(-cy*n*36),Math.round(-cz*n*36)];
    const glb=buildGLB(positions,indices,o.name||"cell");
    const zip=await JSZip.loadAsync(PPTXSK_B64,{base64:true});
    zip.file("ppt/media/model3d1.glb",glb);
    const pngB64=renderThumbnailPNG(positions,minX,maxX,minY,maxY);
    zip.file("ppt/media/image1.png",pngB64,{base64:true});
    let slideXml=await zip.file("ppt/slides/slide2.xml").async("string");
    slideXml=slideXml.replace(/<am3d:meterPerModelUnit n="\d+" d="\d+"\/>/,'<am3d:meterPerModelUnit n="'+n+'" d="'+d+'"/>');
    slideXml=slideXml.replace(/<am3d:preTrans dx="-?\d+" dy="-?\d+" dz="-?\d+"\/>/,'<am3d:preTrans dx="'+pre[0]+'" dy="'+pre[1]+'" dz="'+pre[2]+'"/>');
    slideXml=slideXml.replace(/<am3d:rot ax="-?\d+" ay="-?\d+" az="-?\d+"\/>/,'<am3d:rot ax="0" ay="0" az="0"/>');
    /* Bar length written into the subtitle text itself -- Søren asked for the size to be visible on
       the slide, not just in the download button's success message (the button text remains too,
       for a quick check before opening the file). Reuses the SUBTITLE_PLACEHOLDER text box rather
       than adding a new one to the skeleton, since that box already sits right under the model. */
    const barDisplay=barLen>=1000?(barLen/1000)+" mm":barLen+" µm";
    /* The caller supplies the subtitle's own text; the scale bar is appended here because only
       this function knows how long it decided to make it. */
    const subtitle=(o.subtitle||"")+(o.subtitle?"   ·   ":"")+"scale bar "+barDisplay;
    slideXml=slideXml.replace("CELL_TYPE_PLACEHOLDER",escXmlText(o.title||"Unclassified cell"));
    slideXml=slideXml.replace("SUBTITLE_PLACEHOLDER",escXmlText(subtitle));
    zip.file("ppt/slides/slide2.xml",slideXml);
    const blob=await zip.generateAsync({type:"blob",mimeType:"application/vnd.openxmlformats-officedocument.presentationml.presentation"});
    onProgress&&onProgress(1,"saving…");
    const filename=(o.filename||o.name||"cell")+"_turntable.pptx";
    saveBlob(blob,filename);
    return {filename,vertices:positions.length/3,barLenUm:barLen};
  }
  async function downloadRootPptx(rootIdStr,cellTypeName,coordStr,onProgress,forceRecheck){
    const geo=await fetchCombinedMesh(rootIdStr,onProgress,forceRecheck);
    const {fragmentCount,rootIds,mainUnavailable}=geo;
    /* Same "no main root ID -- community-only combine" fallback as downloadRoot() above. */
    const idForName=rootIdStr||rootIds[0];
    const base="microns_"+idForName+(fragmentCount>1?"_combined"+fragmentCount:"");
    const out=await savePptx(geo,{
      name:base, filename:base, onProgress:onProgress,
      title:cellTypeName||"Unclassified cell",
      subtitle:"Root ID "+rootIdStr+(fragmentCount>1?" (+"+(fragmentCount-1)+" more, combined)":"")
               +(coordStr?"   ·   voxel "+coordStr:"")});
    return {filename:out.filename,vertices:out.vertices,fragmentCount,
            barLenUm:out.barLenUm,rootIds,mainUnavailable};
  }
  /* 2026-08-05 (Sören: recalculate should only be offered once MORE root IDs exist than the
     saved computation used) -- exposes the exact "main + qualifying extras" count
     fetchCombinedMesh() would use, so decorateMeshVolButtons() can compare against it without
     duplicating extraImg65RootIds()'s own filter logic. */
  function currentFragmentCount(mainRootIdStr){
    const n=extraImg65RootIds(mainRootIdStr).length;
    return mainRootIdStr?1+n:n;
  }
  /* fetchCombinedMesh exposed (2026-08-10) for the new "Find cell contacts" feature -- returns
     {positions,indices,...} with positions already in real-world micrometres, same absolute
     coordinate frame as the rest of this file's nm-based NX/NY/NZ (µm*1000=nm, see fetchMesh's
     own "scale=1000 // micrometres" line above), just not yet Y-flipped for glTF -- exactly what
     a mesh-to-mesh distance computation needs, and NOT what downloadRoot()'s glTF-oriented output
     is for, so this is the right function to expose rather than reusing downloadRoot(). */
  /* ── contact geometry ───────────────────────────────────────────────────────────────────
     Pure geometry on two vertex clouds -- no dataset knowledge at all, which is why it belongs
     here rather than in either page. Ported verbatim from µJump's own implementation (the
     algorithm and its constants were tuned with Søren against real astrocyte contacts); µJump
     still runs its own copy, so nothing about its behaviour changes today. Worth switching it
     over to these in a later pass so there is one implementation rather than two. */
  function buildContactGrid(positions,cellSize){
    const map=new Map(), n=positions.length/3;
    for(let v=0;v<n;v++){
      const k=Math.floor(positions[v*3]/cellSize)+","+Math.floor(positions[v*3+1]/cellSize)
             +","+Math.floor(positions[v*3+2]/cellSize);
      let arr=map.get(k); if(!arr){arr=[];map.set(k,arr);}
      arr.push(v);
    }
    return {map,cellSize,positions};
  }
  function nearestInContactGrid(grid,qx,qy,qz){
    const cx=Math.floor(qx/grid.cellSize),cy=Math.floor(qy/grid.cellSize),cz=Math.floor(qz/grid.cellSize);
    let bestD2=Infinity,bestV=-1;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
      const arr=grid.map.get((cx+dx)+","+(cy+dy)+","+(cz+dz));
      if(!arr)continue;
      for(const v of arr){
        const ddx=qx-grid.positions[v*3],ddy=qy-grid.positions[v*3+1],ddz=qz-grid.positions[v*3+2];
        const d2=ddx*ddx+ddy*ddy+ddz*ddz;
        if(d2<bestD2){bestD2=d2;bestV=v;}
      }
    }
    return bestV<0?null:{dist:Math.sqrt(bestD2),vertexIdx:bestV};
  }
  /* Every contact patch between two meshes, not just the single closest point. Mutual-nearest
     (reciprocity) filtering discards one-sided matches; midpoints are then bucketed on a
     clusterUm grid so one broad contact patch yields ONE representative point rather than
     hundreds of near-duplicates. The reported position is the bucket's medoid -- a real observed
     point -- while the reported distance is the bucket's TIGHTEST gap, so sorting by "closest
     touch" stays meaningful.

     THE THRESHOLD IS ENFORCED, and until 2026-09-02 it was not. `threshold` was used for one
     thing only -- the grid's cell size -- and nothing ever compared a pair's distance against it.
     Since nearestInContactGrid searches a 3x3x3 neighbourhood, the effective reach was between
     one and about two cell widths, so a pair 30 nm apart came back for a threshold of 20 nm.
     Found by cccheck.js, which asked the one question the name makes a promise about: raise the
     threshold and more should be found, lower it and less. Nothing changed either way.

     It matters because every caller puts that number in front of a person as "max gap counted as
     touching" and then prints what comes back as contacts. Over-reporting apposition is the worst
     direction for this particular error: a contact that is not there is a claim about the tissue,
     where a missed one is only a gap in the search. µJump is unaffected -- it still runs its own
     inline copy of this function -- but βJump, ηJump and χJump read this one, and their contact
     counts will fall for any pair that was being found beyond the gap that was asked for. */
  function allContactPointsWithinThreshold(posA,gridA,posB,threshold,clusterUm,minHits){
    const gridB=buildContactGrid(posB,threshold);
    const buckets=new Map(), nA=posA.length/3, tol=threshold*0.5, revCache=new Map();
    for(let v=0;v<nA;v++){
      const ax=posA[v*3],ay=posA[v*3+1],az=posA[v*3+2];
      const r=nearestInContactGrid(gridB,ax,ay,az);
      if(!r)continue;
      if(r.dist>threshold)continue;                 // the gap that was asked for, actually applied
      let rev=revCache.get(r.vertexIdx);
      if(rev===undefined){
        rev=nearestInContactGrid(gridA,posB[r.vertexIdx*3],posB[r.vertexIdx*3+1],posB[r.vertexIdx*3+2]);
        revCache.set(r.vertexIdx,rev);
      }
      if(!rev)continue;
      if(Math.hypot(posA[rev.vertexIdx*3]-ax,posA[rev.vertexIdx*3+1]-ay,posA[rev.vertexIdx*3+2]-az)>tol)
        continue;                                   // one-sided match -- not a genuinely local pair
      const mx=(ax+posB[r.vertexIdx*3])/2, my=(ay+posB[r.vertexIdx*3+1])/2, mz=(az+posB[r.vertexIdx*3+2])/2;
      const key=Math.floor(mx/clusterUm)+","+Math.floor(my/clusterUm)+","+Math.floor(mz/clusterUm);
      let arr=buckets.get(key); if(!arr){arr=[];buckets.set(key,arr);}
      arr.push({mx,my,mz,dist:r.dist});
    }
    const out=[];
    for(const arr of buckets.values()){
      if(arr.length<(minHits||3))continue;           // too few hits to be anything but noise
      let cx=0,cy=0,cz=0;
      for(const p of arr){cx+=p.mx;cy+=p.my;cz+=p.mz;}
      cx/=arr.length;cy/=arr.length;cz/=arr.length;
      let best=arr[0],bestD2=Infinity,minDist=Infinity;
      for(const p of arr){
        const dx=p.mx-cx,dy=p.my-cy,dz=p.mz-cz,d2=dx*dx+dy*dy+dz*dz;
        if(d2<bestD2){bestD2=d2;best=p;}
        if(p.dist<minDist)minDist=p.dist;
      }
      out.push({dist:minDist,point:[best.mx,best.my,best.mz]});
    }
    out.sort((a,b)=>a.dist-b.dist);
    return out;
  }

  return {downloadRoot,downloadRootPptx,computeVolume,clearMeshNotFoundCache,currentFragmentCount,
          fetchCombinedMesh,buildContactGrid,nearestInContactGrid,allContactPointsWithinThreshold,
          /* The export half, for a tool that fetches its own geometry -- see its comment above. */
          saveGlb,savePptx,volumeOf,buildGLB};
})();
