/* core/jxl.js — JPEG XL chunks, decoded off the main thread.                         2026-10-03

   Eyewire II's mouse retina (ωJump's `ew2-stroeh-retina`) serves its finest three levels as `jxl`
   and only its coarsest two as jpeg. Chrome has no JPEG XL decoder, so core/emtiles.js drops the
   levels it cannot read and the pad lands on 128 nm — where a lysosome is FOUR PIXELS across. A
   whole cell can be outlined there. An organelle cannot.

   Søren, given the measurements below: *"Lazy + opt-in, in a Worker"*. All three words are load-
   bearing, and each one is answering a measured number rather than a preference.

   MEASURED FIRST, in Chromium, on real JPEG XL encoded at this volume's own settings
   (128×2048 grey chunks, which is what a 128×128×16 chunk is):

       jxl-oxide-wasm   1.70 MB wasm   45 ms  lossless (its 16 nm)   110 ms  q75 (its 32/64 nm)
       @jsquash/jxl     0.85 MB wasm   75 ms                          97 ms
       the browser's own JPEG                                           8 ms

   jxl-oxide wins where it matters — the 16 nm level is the one you trace on, and it is lossless —
   so that is what is vendored. Note that the LOSSY levels are the slow ones: jxl-oxide's modular
   path beats its VarDCT path. Nothing about that is obvious, which is why it was measured.

   LAZY, because 1.7 MB is a real download and 62 of ωJump's 63 volumes will never want it. Nothing
   is fetched, no worker is spawned, until someone asks for a finer level on a volume that needs
   one. A page that never opens the retina is byte for byte the page it was.

   OPT-IN, because 45 ms against 8 ms is not a free upgrade: a pad view is about twenty chunks, so
   the finest level costs about a second where the jpeg level costs a sixth of one. That is a trade
   the person tracing should make, on the tick beside the pad, not one made for them at mount.

   IN A WORKER, because the alternative is a second of frozen page per section. Measured on the
   same ten chunks: 466 ms in a worker with the main thread ticking 46 times out of a possible 47 —
   that is, not blocked at all. The decode cost does not go away; the page stops wearing it.

   WHY A MODULE WORKER FROM A BLOB. The vendored decoder is an ES module whose wasm sits beside it
   and is found through import.meta.url, so it has to be imported rather than script-loaded, and a
   worker that imports needs type:"module". Building it from a Blob rather than a file of its own
   keeps the whole thing inside this file — which ωJump needs, since ωJump inlines core/ and has no
   second file to serve. The glue's URL is passed in ABSOLUTE, because a blob: URL has no base for
   a relative one to resolve against.

   WHAT COMES BACK is {data, width, height}, one byte per pixel — the contract core/emtiles.js's
   CFG.decoders asks for, which is the contract CFG.decodeJpeg has had since H01. The worker does
   the PNG round trip (jxl-oxide hands out a PNG, not raw pixels) and the greyscale extraction on
   its own thread, so what crosses back is the finished plane and nothing else.

   ONE WORKER, ONE DECODE AT A TIME. core/emtiles.js already runs six chunk fetches at once; the
   decodes queue behind each other in the worker, which is what keeps peak memory to one decoded
   plane rather than six. The fetches are the part worth overlapping and they still are.

   Run: node jxlcheck.js */
var UJ = UJ || {};
UJ.jxl = (function(){
  "use strict";

  /* Where the vendored decoder lives, as a URL a worker can import. Default: core/vendor/ beside
     the page, which is where every tool in this family serves core/ from. A host that keeps it
     elsewhere says so once. */
  var BASE = "";
  function configure(cfg){ if (cfg && cfg.base) BASE = String(cfg.base); }
  function baseUrl(){
    if (BASE) return BASE;
    try { return new URL("core/vendor/", location.href).href; }
    catch (_e){ return "core/vendor/"; }
  }
  function glueUrl(){
    try { return new URL("jxl_oxide_wasm.js", baseUrl()).href; }
    catch (_e){ return baseUrl() + "jxl_oxide_wasm.js"; }
  }

  /* Everything this needs of the browser. Said as one question so the caller can ask it before
     offering the tick, rather than offering a tick that throws. */
  function supported(){
    return typeof Worker !== "undefined"
        && typeof Blob !== "undefined"
        && typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
        && typeof OffscreenCanvas !== "undefined"
        && typeof createImageBitmap === "function";
  }

  /* ── THE WORKER ──────────────────────────────────────────────────────────────────────────────
     A string, because it is built from a Blob. Kept as an array of lines for the same reason the
     pad's markup is: a 30-line program inside one string literal is a program nobody will read.

     `boot` is separate from a decode so the download can be started — and reported — before the
     first chunk arrives, which is what lets the tick say "loading the decoder" instead of the pad
     simply sitting there for two seconds. */
  var WORKER_SRC = [
    "let M = null;",
    "self.onmessage = async function(e){",
    "  const m = e.data;",
    "  if (m.t === 'boot'){",
    "    try {",
    "      const g = await import(m.glue);",
    "      await g.default();",
    "      M = g;",
    "      self.postMessage({ t: 'ready', v: g.version ? g.version() : '' });",
    "    } catch (err){ self.postMessage({ t: 'boom', m: String((err && err.message) || err) }); }",
    "    return;",
    "  }",
    "  if (!M){ self.postMessage({ t: 'err', id: m.id, m: 'the decoder is not loaded' }); return; }",
    "  try {",
    "    const im = new M.JxlImage();",
    "    im.feedBytes(new Uint8Array(m.buf));",
    "    if (!im.tryInit()) throw new Error('not a complete JPEG XL codestream');",
    "    /* jxl-oxide hands out a PNG rather than raw pixels, so the round trip happens here",
    "       rather than on the page: decode, encode, decode, take one channel. Measured at about",
    "       a fifth of the total; it is the price of this library's API, not of JPEG XL. */",
    "    const png = im.render().encodeToPng();",
    "    const bm = await createImageBitmap(new Blob([png], { type: 'image/png' }));",
    "    const cv = new OffscreenCanvas(bm.width, bm.height), g2 = cv.getContext('2d');",
    "    g2.drawImage(bm, 0, 0);",
    "    const rgba = g2.getImageData(0, 0, bm.width, bm.height).data;",
    "    const out = new Uint8Array(bm.width * bm.height);",
    "    for (let k = 0, j = 0; k < out.length; k++, j += 4) out[k] = rgba[j];",
    "    const w = bm.width, h = bm.height;",
    "    if (bm.close) bm.close();",
    "    self.postMessage({ t: 'ok', id: m.id, data: out, width: w, height: h }, [out.buffer]);",
    "  } catch (err){ self.postMessage({ t: 'err', id: m.id, m: String((err && err.message) || err) }); }",
    "};"
  ].join("\n");

  /* A seam for the check, and for nothing else: node has no Worker, and a check that pulled 1.7 MB
     of wasm over the network would be testing somebody else's library in the dark. What this file
     owns is the PROTOCOL — boot once, queue by id, hand each result to the caller that asked —
     and that is what a stand-in can exercise honestly. */
  var MAKE = null;
  function _workerFactory(f){ MAKE = f || null; }
  function spawn(){
    if (MAKE) return MAKE(WORKER_SRC);
    var url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
    return new Worker(url, { type: "module" });
  }

  var worker = null, booting = null, version = "", seq = 0, waiting = {};

  function ready(){ return !!worker && !!version; }

  /* Boots on the first call and is the same promise thereafter, so twenty chunks arriving at once
     download one decoder rather than twenty. A boot that FAILS clears itself: a page that was
     offline when the user first ticked the box should be able to tick it again. */
  function start(){
    if (booting) return booting;
    /* MAKE, when a check has installed one, IS the support: node has no Worker and no
       OffscreenCanvas, and the protocol this module owns can still be driven honestly there. */
    if (!MAKE && !supported())
      return Promise.reject(new Error("this browser cannot run the JPEG XL decoder "
                                      + "(it needs workers and OffscreenCanvas)"));
    booting = new Promise(function(res, rej){
      var w;
      try { w = spawn(); }
      catch (e){ rej(new Error("could not start the decoder: " + ((e && e.message) || e))); return; }
      w.onmessage = function(e){
        var m = e.data || {};
        if (m.t === "ready"){ worker = w; version = m.v || "unknown"; res(version); return; }
        if (m.t === "boom"){ rej(new Error("the JPEG XL decoder would not load: " + m.m)); return; }
        /* Anything else this early is a reply to nothing; dropped rather than guessed at. */
      };
      w.onerror = function(e){ rej(new Error("the JPEG XL decoder would not load: "
                                             + ((e && e.message) || "worker error"))); };
      w.postMessage({ t: "boot", glue: glueUrl() });
    });
    booting.then(function(){ wire(); }, function(){ booting = null; });
    return booting;
  }

  /* The steady-state handler, installed once the boot reply has been taken. Replies are matched by
     id and nothing else: the worker answers in the order it finishes, which is not necessarily the
     order it was asked, and a queue that assumed otherwise would hand one chunk's pixels to
     another chunk's caller — the kind of mistake that looks like a tracing in the wrong place. */
  function wire(){
    worker.onmessage = function(e){
      var m = e.data || {}, hold = waiting[m.id];
      if (!hold) return;
      delete waiting[m.id];
      if (m.t === "ok") hold.res({ data: m.data, width: m.width, height: m.height });
      else hold.rej(new Error(m.m || "the JPEG XL decoder failed"));
    };
    worker.onerror = function(){
      /* A worker that died takes every outstanding decode with it, and says so to each of them
         rather than leaving twenty promises pending forever. */
      Object.keys(waiting).forEach(function(k){
        waiting[k].rej(new Error("the JPEG XL decoder stopped")); delete waiting[k];
      });
      worker = null; booting = null; version = "";
    };
  }

  /* (ArrayBuffer) -> Promise<{data, width, height}>, one byte per pixel: core/emtiles.js's
     CFG.decoders contract. The buffer is TRANSFERRED, so the caller must not keep it — emtiles
     hands over a copy for exactly this reason (see tracingDecoders in core/tracingcard.js). */
  async function decode(buf){
    await start();
    var id = ++seq;
    return new Promise(function(res, rej){
      waiting[id] = { res: res, rej: rej };
      try { worker.postMessage({ t: "go", id: id, buf: buf }, [buf]); }
      catch (e){ delete waiting[id]; rej(new Error("could not hand the chunk over: "
                                                   + ((e && e.message) || e))); }
    });
  }

  return { configure: configure, supported: supported, ready: ready, start: start,
           decode: decode, version: function(){ return version; },
           _src: WORKER_SRC, _glueUrl: glueUrl, _workerFactory: _workerFactory,
           _reset: function(){ worker = null; booting = null; version = ""; waiting = {}; seq = 0; } };
})();
if (typeof module !== "undefined" && module.exports) module.exports = UJ.jxl;
