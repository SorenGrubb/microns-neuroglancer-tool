/* core/synvol.js — Stage 2 of the βJump "synapse contacts" feasibility work (2026-08-19).

   WHAT THIS IS: a decoder for the RAW synapse SEGMENTATION VOLUME (not the mesh — see
   core/synmesh.js for that, Stage 1, confirmed working live 2026-08-19). This is the piece
   that does candidate discovery: given a voxel position or a bounding box (e.g. around a
   cell), which synapse segment IDs actually appear there. There is no CAVE table or
   annotation list for this dataset's synapses (confirmed by bucket listing, see
   bjump-synapse-stage1-meshfetch.md project memory) — the raw volume is the ONLY source of
   that information, so this decoder is unavoidable if candidate discovery is going to work
   at all.

   FORMAT: neuroglancer precomputed "compressed_segmentation" encoding, stored in
   neuroglancer_uint64_sharded_v1 shards with hash:"identity" (confirmed from this dataset's
   own info JSON, pasted by Søren 2026-08-19 — see that file's exact scale/sharding numbers
   below). This is NOT the same shard hashing as the mesh (which uses murmurhash3_x86_128) —
   volumes here use "identity", i.e. no hash function at all, just the shifted chunk ID
   directly. The chunk ID itself is a "compressed Morton code" of the chunk's grid position —
   confirmed against neuroglancer's own doc (sharded.md via GitHub, fetched 2026-08-19). The
   compressed_segmentation bit-level format (block header layout, lookup table, packed
   per-voxel indices) is reimplemented directly from neuroglancer's own reference decoder
   (src/sliceview/compressed_segmentation/decode_common.ts, fetched from GitHub 2026-08-19)
   rather than from memory of the spec — this is the single most error-prone part of the
   whole synapse-contacts project (wrong bit offsets silently produce wrong segment IDs, not
   an error), so it is a near-verbatim, field-by-field port of that reference implementation,
   not a reconstruction from the human-readable docs alone.

   WHY A SEPARATE MODULE, NOT PART OF core/synmesh.js: different data (volume chunks, not
   mesh fragments), different shard hashing (identity, not murmur), different chunk-id scheme
   (compressed Morton code of a grid position, not a raw segment ID) and no Draco involved at
   all. The only thing shared with synmesh.js is the general shard-index / minishard-index
   parsing shape (also duplicated here rather than factored out, for the same "keep every
   dataset-shaped fetch path independent and simple" reasoning as synmesh.js's own header
   comment).

   CANNOT BE VERIFIED AGAINST REAL DATA IN THIS SANDBOX (no network at all) — only against
   self-constructed synthetic bytes matching my own best-effort re-encoding of the spec above.
   Needs Søren's browser to confirm the segment IDs this returns for a KNOWN synapse (one
   already fetched successfully via synmesh_test.html in Stage 1) actually match that
   synapse's own segment ID — see synvol_test.html.

   Public surface:
     UJ.synVol.chunkGridShape(scaleIdx) -> [gx,gy,gz]
     UJ.synVol.voxelToChunkGridPos(scaleIdx, [vx,vy,vz]) -> [cx,cy,cz]
     UJ.synVol.compressedMortonCode([cx,cy,cz], [gx,gy,gz]) -> BigInt
     UJ.synVol.shardAndMinishard(chunkIdBigInt, scaleIdx) -> {shard, minishard}
     UJ.synVol.fetchChunk(scaleIdx, [cx,cy,cz]) -> Promise<ChunkView|null>  (null = chunk has
       no data in the shard index at all — almost certainly means "fully background/empty",
       not an error; a sparse dataset like synapses is expected to omit most chunks)
     UJ.synVol.segmentIdAt(scaleIdx, [vx,vy,vz]) -> Promise<string|null>  ("0"/null = no
       segment at that voxel)
     UJ.synVol.segmentIdsInBox(scaleIdx, voxelMin, voxelMax, opts) -> Promise<{ids:string[],
       chunksFetched:number, chunksEmpty:number, voxelsSampled:number}>  opts.stride (default
       1) subsamples the box on a grid of that voxel spacing per axis, since scanning every
       voxel in anything but a small box is prohibitively slow in a browser tab.
*/
window.UJ = window.UJ || {};
UJ.synVol = (() => {
  const CFG = UJ.cfg.synVol;   // { volumeBase, volumeBaseAlt, scales: [...] } — see synvol_test.html

  function scaleCfg(scaleIdx){
    const s = CFG.scales[scaleIdx];
    if(!s) throw new Error("no such scale index "+scaleIdx+" (have "+CFG.scales.length+")");
    return s;
  }
  function chunkGridShape(scaleIdx){
    const s = scaleCfg(scaleIdx);
    const cs = s.chunk_sizes[0];
    return [0,1,2].map(i => Math.ceil(s.size[i]/cs[i]));
  }
  function voxelToChunkGridPos(scaleIdx, voxel){
    const cs = scaleCfg(scaleIdx).chunk_sizes[0];
    return [0,1,2].map(i => Math.floor(voxel[i]/cs[i]));
  }
  /* Chunk's OWN voxel extent, clipped at the volume boundary (the last chunk along any axis
     is usually partial -- e.g. this dataset's scale 0 is 849 voxels deep with a 32-voxel
     chunk depth: 26 full chunks + one 17-voxel partial chunk). Getting this wrong shifts
     every block-grid computation in decodeValueOffset for boundary chunks. */
  function chunkVoxelShape(scaleIdx, gridPos){
    const s = scaleCfg(scaleIdx), cs = s.chunk_sizes[0];
    return [0,1,2].map(i => Math.min(cs[i], s.size[i]-gridPos[i]*cs[i]));
  }

  /* Compressed Morton code -- verbatim from neuroglancer's own sharded-chunk-storage doc
     (src/datasource/precomputed/sharded.md, fetched via GitHub 2026-08-19): walk bit
     position i upward; for each of x,y,z, if 2**i is still within that dimension's grid
     size, that dimension contributes its bit i to the next output bit. Dimensions with a
     smaller grid extent stop contributing once their bits are exhausted, which is what makes
     this "compressed" rather than a fixed interleave. */
  function compressedMortonCode(gridPos, gridShape){
    let j=0, code=0n;
    for(let i=0;;i++){
      const p=1<<i;
      let any=false;
      for(let dim=0; dim<3; dim++){
        if(p < gridShape[dim]){
          any=true;
          const bit = (gridPos[dim] >> i) & 1;
          code |= BigInt(bit) << BigInt(j);
          j++;
        }
      }
      if(!any) break;
      if(i>40) throw new Error("compressedMortonCode did not terminate (grid shape "+gridShape+")");
    }
    return code;
  }

  /* Shard/minishard resolution -- same general scheme as core/synmesh.js's mesh sharding,
     EXCEPT this dataset's volume sharding uses hash:"identity" (confirmed in the info JSON),
     i.e. no murmurhash3 step at all -- the shifted chunk ID is used directly. */
  function shardAndMinishard(chunkIdBig, scaleIdx){
    const s = scaleCfg(scaleIdx).sharding;
    if(s.hash!=="identity") throw new Error('unsupported volume sharding hash "'+s.hash+'" (only "identity" is implemented)');
    const hashed = chunkIdBig >> BigInt(s.preshift_bits);
    const mask = (1n<<BigInt(s.minishard_bits+s.shard_bits))-1n;
    const sm = hashed & mask;
    const minishard = Number(sm & ((1n<<BigInt(s.minishard_bits))-1n));
    const shard = Number((sm>>BigInt(s.minishard_bits)) & ((1n<<BigInt(s.shard_bits))-1n));
    const width = Math.max(1, Math.ceil(s.shard_bits/4));
    return {shard: shard.toString(16).padStart(width,"0"), minishard};
  }

  function scaleDir(scaleIdx){ return scaleCfg(scaleIdx).key+"/"; }
  let useAlt = !!CFG.preferAlt;
  /* CFG.volumeBaseAlt is expected already URL-encoded up through the dataset directory, e.g.
     ".../o/alzheimers%2Fwei_synapses%2Fsyn_20241121%2F" (trailing %2F) -- same convention
     core/synmesh.js's CFG.meshBaseAlt uses. The per-scale key still needs its own encoding
     since it's a fresh path segment. */
  function shardUrl(scaleIdx, shard){
    return useAlt
      ? (CFG.volumeBaseAlt + encodeURIComponent(scaleCfg(scaleIdx).key) + "%2F" + shard + ".shard?alt=media")
      : (CFG.volumeBase + scaleDir(scaleIdx) + shard + ".shard");
  }

  async function rangeGet(url,start,end){
    const res=await fetch(url,{headers:{Range:"bytes="+start+"-"+end}});
    if(res.status!==206) throw new Error("expected HTTP 206 for byte range, got "+res.status+" ("+url+")");
    return new Uint8Array(await res.arrayBuffer());
  }
  async function gunzip(u8){
    const ds=new DecompressionStream("gzip");
    const stream=new Blob([u8]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /* Find this chunk's (offset,size) within its shard file -- same minishard-index shape as
     core/synmesh.js's findManifest (ids/starts/sizes triple, delta-encoded, gzip-compressed
     on disk per this dataset's minishard_index_encoding:"gzip"), just keyed by chunk ID
     (compressed Morton code) instead of a mesh segment ID. Returns null (not a throw) when
     the chunk simply isn't in the shard index -- expected and common for a sparse volume
     like synapses, where most chunks have nothing in them and are omitted entirely by
     whatever wrote this dataset. */
  async function findChunkLocation(scaleIdx, chunkIdBig){
    const sc = scaleCfg(scaleIdx);
    const {shard, minishard} = shardAndMinishard(chunkIdBig, scaleIdx);
    let url = shardUrl(scaleIdx, shard);
    const shardIndexSize = (1<<sc.sharding.minishard_bits)*16;
    const off = minishard*16;
    let entry;
    try{ entry = await rangeGet(url, off, off+15); }
    catch(e){
      if(!useAlt){ useAlt=true; url=shardUrl(scaleIdx,shard); entry=await rangeGet(url,off,off+15); }
      else throw e;
    }
    const ev = new DataView(entry.buffer, entry.byteOffset, entry.byteLength);
    const startOffset=ev.getBigUint64(0,true), endOffset=ev.getBigUint64(8,true);
    if(startOffset===endOffset) return null;   // whole minishard slot empty -> chunk not present
    const msStart=BigInt(shardIndexSize)+startOffset, msEnd=BigInt(shardIndexSize)+endOffset;
    const idxRaw = await gunzip(await rangeGet(url, Number(msStart), Number(msEnd-1n)));
    const aligned = new Uint8Array(idxRaw.length); aligned.set(idxRaw);
    const arr = new BigUint64Array(aligned.buffer);
    const n = arr.length/3;
    const ids=arr.slice(0,n), starts=arr.slice(n,2*n), sizes=arr.slice(2*n);
    for(let i=1;i<n;i++) ids[i]+=ids[i-1];
    let prev=BigInt(shardIndexSize);
    for(let i=0;i<n;i++){ starts[i]+=prev; prev=starts[i]+sizes[i]; }
    let idx=-1;
    for(let i=0;i<n;i++) if(ids[i]===chunkIdBig){ idx=i; break; }
    if(idx<0) return null;   // minishard has entries, but not this one -> chunk not present
    return {url, start:Number(starts[idx]), size:Number(sizes[idx])};
  }

  /* ---------- compressed_segmentation decode -- ported field-for-field from
     neuroglancer's src/sliceview/compressed_segmentation/decode_common.ts (decodeValueOffset
     + readSingleChannelValueUint64), fetched from GitHub 2026-08-19. `data` is the WHOLE
     gunzipped chunk reinterpreted as a little-endian Uint32Array (safe on all real hardware,
     which is little-endian). `baseOffset` is the word offset of channel 0's data, i.e.
     data[0] itself for a single-channel volume (this dataset has num_channels:1) -- the
     leading word is always a 1-entry channel-offset table per the format, even for a single
     channel. ---------- */
  function decodeValueOffset(data, baseOffset, chunkVoxelShapeArr, blockSize, pos){
    let gridOffset=0, subOffset=0, gridStride=1, subStride=1;
    for(let i=0;i<3;i++){
      const p=pos[i], bs=blockSize[i];
      const gridSub=Math.floor(p/bs), subSub=p%bs;
      gridOffset += gridSub*gridStride;
      gridStride *= Math.ceil(chunkVoxelShapeArr[i]/bs);
      subOffset += subSub*subStride;
      subStride *= bs;
    }
    const hdrOff = baseOffset + gridOffset*2;
    const h0 = data[hdrOff], h1 = data[hdrOff+1];
    let outOffset = h0 & 0xffffff;
    const encodingBits = (h0>>>24) & 0xff;
    if(encodingBits>0){
      const encBase = (baseOffset + h1) & 0xffffff;
      const encOffset = encBase + Math.floor((subOffset*encodingBits)/32);
      const encWord = data[encOffset];
      const wordBit = (subOffset*encodingBits) % 32;
      const decoded = (encWord >>> wordBit) & ((1<<encodingBits)-1);
      outOffset += 2*decoded;   // uint64 -> 2 words per table entry
    }
    return outOffset;
  }
  function readTableUint64(data, offset){
    return BigInt(data[offset]) | (BigInt(data[offset+1])<<32n);
  }

  /* Wraps one fetched+gunzipped+decompressed_segmentation-decoded chunk. readAt(x,y,z) is a
     point lookup within THIS chunk's local voxel coordinates (0..chunkVoxelShape[i]-1), O(1)
     per call -- no full-chunk materialization, matching what segmentIdsInBox actually needs
     (a handful of point samples, not every voxel). */
  function makeChunkView(rawBytes, cVoxelShape, blockSize){
    const padded = rawBytes.length%4===0 ? rawBytes : (() => {
      const p=new Uint8Array(Math.ceil(rawBytes.length/4)*4); p.set(rawBytes); return p;
    })();
    const data = new Uint32Array(padded.buffer, padded.byteOffset, padded.length/4);
    const baseOffset = data[0];   // single channel -> data[0] is channel 0's word offset
    return {
      chunkVoxelShape: cVoxelShape,
      readAt(x,y,z){
        const off = decodeValueOffset(data, baseOffset, cVoxelShape, blockSize, [x,y,z]);
        return readTableUint64(data, off + baseOffset);
      }
    };
  }

  const chunkCache = new Map();   // "scaleIdx:cx,cy,cz" -> Promise<ChunkView|null>
  function fetchChunk(scaleIdx, gridPos){
    const key = scaleIdx+":"+gridPos.join(",");
    if(chunkCache.has(key)) return chunkCache.get(key);
    const p = (async () => {
      const sc = scaleCfg(scaleIdx);
      const gridShape = chunkGridShape(scaleIdx);
      const chunkId = compressedMortonCode(gridPos, gridShape);
      const loc = await findChunkLocation(scaleIdx, chunkId);
      if(!loc) return null;
      const raw = await gunzip(await rangeGet(loc.url, loc.start, loc.start+loc.size-1));
      const cVoxelShape = chunkVoxelShape(scaleIdx, gridPos);
      return makeChunkView(raw, cVoxelShape, sc.compressed_segmentation_block_size);
    })();
    chunkCache.set(key, p);
    return p;
  }

  async function segmentIdAt(scaleIdx, voxel){
    const gridPos = voxelToChunkGridPos(scaleIdx, voxel);
    const chunk = await fetchChunk(scaleIdx, gridPos);
    if(!chunk) return null;
    const cs = scaleCfg(scaleIdx).chunk_sizes[0];
    const local = [0,1,2].map(i => voxel[i] - gridPos[i]*cs[i]);
    const v = chunk.readAt(local[0], local[1], local[2]);
    return v===0n ? null : v.toString();
  }

  /* opts.stride: voxel spacing sampled per axis (default 1 = every voxel -- fine for a small
     box, prohibitive for a large one; a synapse is a small structure, tens of voxels across
     at most, so a modest box with stride 1-2 is the expected use, not a whole-cell sweep). */
  async function segmentIdsInBox(scaleIdx, voxelMin, voxelMax, opts){
    opts = opts||{};
    const stride = opts.stride||1;
    const ids = new Set();
    let chunksFetched=0, chunksEmpty=0, voxelsSampled=0;
    const seenChunks = new Set();
    for(let z=voxelMin[2]; z<=voxelMax[2]; z+=stride){
      for(let y=voxelMin[1]; y<=voxelMax[1]; y+=stride){
        for(let x=voxelMin[0]; x<=voxelMax[0]; x+=stride){
          voxelsSampled++;
          const gridPos = voxelToChunkGridPos(scaleIdx, [x,y,z]);
          const key = gridPos.join(",");
          if(!seenChunks.has(key)) seenChunks.add(key);
          const chunk = await fetchChunk(scaleIdx, gridPos);
          if(!chunk){ continue; }
          const cs = scaleCfg(scaleIdx).chunk_sizes[0];
          const local = [x-gridPos[0]*cs[0], y-gridPos[1]*cs[1], z-gridPos[2]*cs[2]];
          const v = chunk.readAt(local[0], local[1], local[2]);
          if(v!==0n) ids.add(v.toString());
        }
      }
    }
    for(const key of seenChunks){
      const [cx,cy,cz]=key.split(",").map(Number);
      const v = await fetchChunk(scaleIdx,[cx,cy,cz]);
      if(v) chunksFetched++; else chunksEmpty++;
    }
    return {ids:[...ids], chunksFetched, chunksEmpty, voxelsSampled};
  }

  return {
    chunkGridShape, voxelToChunkGridPos, compressedMortonCode, shardAndMinishard,
    fetchChunk, segmentIdAt, segmentIdsInBox
  };
})();
