/* core/synmesh.js — Stage 1 of the βJump "synapse contacts" feasibility work (2026-08-19).

   WHAT THIS IS: a minimal, self-contained fetch+decode pipeline for ONE synapse mesh at a
   time, given its segment ID. It proves "given a synapse segment ID, can we fetch and
   render its mesh" end to end -- nothing more. It does NOT do candidate discovery (finding
   which synapse IDs exist near a given cell); that needs a compressed_segmentation chunk
   decoder for the raw sharded volume, which is Stage 2 and is not attempted here.

   WHY IT WORKS AT ALL: the synapse layer (gs://vclem-xh/alzheimers/wei_synapses/syn_20241121)
   publishes its mesh at .../mesh/info as neuroglancer_multilod_draco with
   sharding hash "murmurhash3_x86_128" -- the EXACT same format core/mesh.js already
   implements for cell meshes (confirmed by fetching that info file directly, 2026-08-19).
   So the fetch/decode algorithm itself is not new; only the bucket/CFG target is.

   WHY THIS IS A SEPARATE FILE, NOT A CHANGE TO core/mesh.js: core/mesh.js's
   CFG=UJ.cfg.mesh is a single page-wide singleton -- loadInfo() mutates it in place, so
   that module can only ever serve ONE mesh source per page load today. Reusing it for a
   second, simultaneous mesh source (cell meshes AND synapse meshes open at once) would mean
   either refactoring that shared, tested module (also used unchanged by µJump/ηJump -- a
   riskier change than this feasibility check calls for) or instantiating it twice, which its
   current closure-over-module-scope design does not support either. This file duplicates the
   small amount of logic needed (murmur hash, shard/minishard math, gzip, manifest parsing,
   Draco decode, GLB assembly) against its OWN independent CFG object (UJ.cfg.synMesh), with
   zero shared state with core/mesh.js. If/when synapse contacts become a real shipped
   feature, promoting this to be the one shared implementation both cell and synapse meshes
   call into (factory-style: UJ.mesh.createSource(cfg) instead of a closed-over singleton) is
   the natural next refactor -- deliberately deferred until Stage 2/3 prove the feature is
   worth building, rather than done blind now.

   HOST CONTRACT: set UJ.cfg.synMesh (see synmesh_test.html for the exact shape) before this
   file loads. No other page state is required -- this module touches no DOM.

   Public surface:
     UJ.synMesh.fetchSynapseMesh(segmentIdStr, onProgress) -> Promise<{positions, indices,
       lod, numLods, bytes}>   (positions are µm, dataset-absolute coordinates, same
       convention core/mesh.js's fetchMesh() uses)
     UJ.synMesh.downloadSynapseGLB(segmentIdStr, onProgress) -> Promise<{lod, numLods, bytes,
       vertices, filename}>   (fetch + save a .glb, one click, mirrors core/mesh.js's
       downloadRoot() for manual browser testing)
*/
window.UJ = window.UJ || {};
UJ.synMesh = (() => {
  const CFG = UJ.cfg.synMesh;
  function mb(n){return (n/1048576).toFixed(n>10485760?0:1)+" MB";}

  /* ---------- murmurhash3_x86_128, shard/minishard math (identical algorithm to
     core/mesh.js -- see that file's comments for the spec reference) ---------- */
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
  function shardAndMinishard(segIdBig){
    const hashed=murmur64(segIdBig>>BigInt(CFG.preshiftBits));
    const mask=(1n<<BigInt(CFG.minishardBits+CFG.shardBits))-1n;
    const sm=hashed&mask;
    const minishard=Number(sm&((1n<<BigInt(CFG.minishardBits))-1n));
    const shard=Number((sm>>BigInt(CFG.minishardBits))&((1n<<BigInt(CFG.shardBits))-1n));
    const width=Math.max(1,Math.ceil(CFG.shardBits/4));
    return {shard:shard.toString(16).padStart(width,"0"),minishard};
  }
  let useAlt=!!CFG.preferAlt;
  function shardUrl(shard){return useAlt?(CFG.meshBaseAlt+shard+CFG.meshBaseAltSuffix):(CFG.meshBase+shard+".shard");}

  async function rangeGet(url,start,end,onProgress){
    const res=await fetch(url,{headers:{Range:"bytes="+start+"-"+end}});
    if(res.status!==206)throw new Error("expected HTTP 206 for byte range, got "+res.status+" ("+url+")");
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
    const direct=CFG.meshBase+"info", alt=CFG.meshBaseAlt+"info?alt=media";
    const order=useAlt?[alt,direct]:[direct,alt];
    let res=null;
    for(let k=0;k<order.length;k++){
      try{ res=await fetch(order[k]); useAlt=(order[k]===alt); break; }
      catch(_e){ res=null; }
    }
    if(!res||!res.ok){ infoLoaded=true; return; } // fall back to CFG's built-in defaults
    const j=await res.json();
    if(j["@type"]!=="neuroglancer_multilod_draco")throw new Error('unexpected mesh format "'+j["@type"]+'"');
    if(Array.isArray(j.transform)&&j.transform.length===12)CFG.transform=j.transform;
    if(j.vertex_quantization_bits)CFG.vertexQuantizationBits=j.vertex_quantization_bits;
    const sh=j.sharding||{};
    if(sh.preshift_bits!=null)CFG.preshiftBits=sh.preshift_bits;
    if(sh.minishard_bits!=null)CFG.minishardBits=sh.minishard_bits;
    if(sh.shard_bits!=null)CFG.shardBits=sh.shard_bits;
    if(sh.hash&&sh.hash!=="murmurhash3_x86_128")throw new Error('unsupported sharding hash "'+sh.hash+'"');
    infoLoaded=true;
  }

  async function findManifest(segIdBig){
    const {shard,minishard}=shardAndMinishard(segIdBig);
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
    if(startOffset===endOffset)throw new Error("minishard "+minishard+" is empty — segment ID "+segIdBig+" not in this shard index. Not every synapse in the raw segmentation necessarily has a meshed representation (same caveat as βJump's own cell meshes).");
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
    for(let i=0;i<n;i++)if(ids[i]===segIdBig){idx=i;break;}
    if(idx<0)throw new Error("segment ID "+segIdBig+" not found in minishard "+minishard+" ("+n+" entries).");
    return {shard,minishard,manifestStart:Number(starts[idx]),manifestSize:Number(sizes[idx]),url};
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

  /* Core fetch+decode pipeline -- same algorithm as core/mesh.js's fetchMesh(), against
     this module's own CFG/state instead. Always takes the finest LOD under ~8MB, same
     default as cell meshes; synapses are small (a bouton/spine-head scale object), so this
     will almost always just mean "the finest LOD available". */
  async function fetchSynapseMesh(segmentIdStr,onProgress){
    const segId=BigInt(segmentIdStr);
    onProgress&&onProgress(0,"reading manifest…");
    await loadInfo();
    const info=await findManifest(segId);
    const manifest=await gunzip(await rangeGet(info.url,info.manifestStart,info.manifestStart+info.manifestSize-1));
    const parsed=parseManifest(manifest);
    const layout=fragmentLayout(parsed,info.manifestStart);
    let lod=parsed.numLods-1;
    for(let l=parsed.numLods-1;l>=0;l--){if(layout[l].bytes<8*1048576)lod=l;}
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
    onProgress&&onProgress(1,"done");
    return {positions,indices,lod,numLods:parsed.numLods,bytes:L.bytes};
  }

  /* Same Y-flip rationale as core/mesh.js's flipYForGLTF -- Neuroglancer's Y increases
     downward, glTF assumes Y-up. */
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
      asset:{version:"2.0",generator:"bJump synapse mesh downloader (Stage 1 test)"},
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
  async function downloadSynapseGLB(segmentIdStr,onProgress){
    const {positions:rawPositions,indices:rawIndices,lod,numLods,bytes}=await fetchSynapseMesh(segmentIdStr,onProgress);
    const {positions,indices}=flipYForGLTF(rawPositions,rawIndices);
    const glb=buildGLB(positions,indices,"synapse_"+segmentIdStr+"_lod"+lod);
    onProgress&&onProgress(1,"saving…");
    const filename="synapse_"+segmentIdStr+"_lod"+lod+"_um.glb";
    const url=URL.createObjectURL(new Blob([glb],{type:"model/gltf-binary"}));
    const a=document.createElement("a");
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    return {lod,numLods,bytes,vertices:positions.length/3,filename};
  }

  return {fetchSynapseMesh,downloadSynapseGLB};
})();
