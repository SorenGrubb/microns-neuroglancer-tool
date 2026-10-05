/* ── A STORE WITH NO CEILING, READ THE WAY THE CARD ALREADY READS ───────────────  2026-10-05

   Søren, after two hours of a whole-cell tracing went: *"It had complained some times that it did
   not have enough space in the browser to save my draft."*

   WHAT WAS ACTUALLY FULL, measured in his own browser: `ujump_tracings_v1` held 4,141,977
   characters. localStorage counts UTF-16, so that one key was about 8 MB against a per-origin
   budget of roughly 5–10 MB for everything the eight tools write between them. Every other key on
   the origin put together was under 300 KB. The drafts had nowhere to go, and the card was told so
   and carried on.

   CAPPING THE CACHE WAS THE OBVIOUS ANSWER AND IT IS THE WRONG ONE. Evicting contours from kept
   tracings means every consumer of `t.rings` must learn to cope with a tracing whose rings are
   gone — the Blender export, the 3D preview, the ZIP, the re-share — and the failure mode of
   getting that wrong is an export that silently contains nothing. Trading a storage bug for a
   silent-export bug is not a trade worth making the week after this one.

   SO THE CEILING GOES INSTEAD. IndexedDB has no practical limit for this kind of data — hundreds of
   megabytes, granted against free disk rather than a fixed 5 MB — and it is what the platform
   offers for structured data that matters. Nothing then needs capping, evicting or explaining.

   AND IT IS READ SYNCHRONOUSLY, which is the only reason this is a small change. IndexedDB is
   async and the card's sixteen call sites are not; rewriting them all would be the risk, not the
   store. But the page ALREADY keeps its tracings in memory — TRACINGS_KEPT is the working copy and
   localStorage was only ever where it was written down. So this is a mirror in memory, hydrated
   once at startup, read synchronously, written through to IndexedDB in the background. The call
   sites keep `getItem`/`setItem`/`removeItem` and do not know anything changed.

   NOTHING IS WRITTEN BEFORE IT IS READ. The one way a mirror can destroy data is to answer "empty"
   while hydration is still in flight and then have that emptiness written back over the real thing.
   So setItem REFUSES until hydrated, loudly, and the card waits on ready() before it renders. A
   store that is not ready says so rather than lying.

   THE MIGRATION DELETES ONLY WHAT IT HAS CONFIRMED. Copy each localStorage key in, read it back out
   of IndexedDB, compare, and only then remove the localStorage copy — so a browser that was full
   before is emptier afterwards, and a migration that half-worked leaves the original where it is.

   FALLBACK IS THE OLD BEHAVIOUR, NOT AN ERROR. Private windows, old browsers and blocked storage
   all end up on localStorage exactly as before, and bytes()/backend() say which one is in use so
   the card can tell somebody the truth about where their work is.                                */
(function(){
  "use strict";
  var UJ = window.UJ = window.UJ || {};
  if (UJ.kv) return;

  var DB = "ujump", STORE = "kv", VER = 1;
  var MEM = {}, HYDRATED = false, BACKEND = "memory", READY = null, db = null;
  var PENDING = {}, FLUSH = null, FAILED = 0, ONFAIL = [];

  /* Which keys this store owns. Everything the tracing card writes, on every tool: the kept
     tracings, the drafts old and new, the pen tick, the pad's tip preference. Deliberately NOT the
     theme, the active tab or the nav histories -- those are read directly from localStorage by
     code that is not going through here, and moving them would break it. */
  function mine(k){
    return /tracing/i.test(k) || k === "jump_pad_tips_off_v1";
  }

  function open(){
    return new Promise(function(res, rej){
      var rq;
      try { rq = indexedDB.open(DB, VER); } catch (e){ rej(e); return; }
      rq.onupgradeneeded = function(){
        try { rq.result.createObjectStore(STORE); } catch (_e){}
      };
      rq.onsuccess = function(){ res(rq.result); };
      rq.onerror = function(){ rej(rq.error || new Error("indexedDB refused")); };
      rq.onblocked = function(){ rej(new Error("indexedDB blocked by another tab")); };
    });
  }
  function tx(mode){ return db.transaction(STORE, mode).objectStore(STORE); }
  function idbAll(){
    return new Promise(function(res, rej){
      var out = {}, rq = tx("readonly").openCursor();
      rq.onsuccess = function(){
        var c = rq.result;
        if (!c){ res(out); return; }
        out[c.key] = c.value; c.continue();
      };
      rq.onerror = function(){ rej(rq.error); };
    });
  }
  function idbPut(k, v){
    return new Promise(function(res, rej){
      var rq = v === null ? tx("readwrite").delete(k) : tx("readwrite").put(v, k);
      rq.onsuccess = function(){ res(true); };
      rq.onerror = function(){ rej(rq.error); };
    });
  }
  function idbGet(k){
    return new Promise(function(res, rej){
      var rq = tx("readonly").get(k);
      rq.onsuccess = function(){ res(rq.result === undefined ? null : rq.result); };
      rq.onerror = function(){ rej(rq.error); };
    });
  }

  /* ONE WAY, AND IT CONFIRMS BEFORE IT DELETES. */
  function migrate(){
    var moved = [], failed = [], i, k, keys = [];
    try { for (i = 0; i < localStorage.length; i++){ k = localStorage.key(i); if (mine(k)) keys.push(k); } }
    catch (_e){ return Promise.resolve({ moved: 0, failed: 0 }); }
    if (!keys.length) return Promise.resolve({ moved: 0, failed: 0 });
    return keys.reduce(function(p, key){
      return p.then(function(){
        var v;
        try { v = localStorage.getItem(key); } catch (_e){ return; }
        if (v === null) return;
        /* Not over something already here: a second tab, or a second load, must not push a stale
           localStorage copy over a newer one that this store has been keeping. */
        return idbGet(key).then(function(have){
          if (have !== null){ moved.push(key); return; }
          return idbPut(key, v).then(function(){ return idbGet(key); }).then(function(back){
            if (back === v){ moved.push(key); try { localStorage.removeItem(key); } catch (_e2){} }
            else failed.push(key);
          }, function(){ failed.push(key); });
        }, function(){ failed.push(key); });
      });
    }, Promise.resolve()).then(function(){
      return { moved: moved.length, failed: failed.length };
    });
  }

  /* ── A DATABASE THAT NEVER ANSWERS MUST NOT HOLD THE CARD FOR EVER ───────────────────────
     Found by kvstorecheck.js, not by reasoning: given an indexedDB.open whose success event never
     fires -- a blocked upgrade, a corrupt profile, another tab holding the version -- hydrate()'s
     promise never settles, the card's init is waiting on it, and the tracings list sits empty with
     no error anywhere. That is the same silent-emptiness this whole change exists to remove, newly
     introduced by the fix for it.

     So the open RACES A CLOCK. Four seconds is far longer than an unblocked open takes and short
     enough that nobody sits in front of a blank card wondering; losing the race means falling back
     to localStorage, which is the old behaviour with the old ceiling rather than nothing at all. */
  var OPEN_MS = 4000;
  function openOrGiveUp(){
    return new Promise(function(res, rej){
      var done = false;
      var t = setTimeout(function(){
        if (done) return;
        done = true;
        rej(new Error("indexedDB did not answer in " + (OPEN_MS / 1000) + "s"));
      }, OPEN_MS);
      open().then(function(d){
        if (done){ try { d.close(); } catch (_e){} return; }
        done = true; clearTimeout(t); res(d);
      }, function(e){
        if (done) return;
        done = true; clearTimeout(t); rej(e);
      });
    });
  }

  function hydrate(){
    if (READY) return READY;
    READY = openOrGiveUp().then(function(d){
      db = d;
      return migrate().then(idbAll);
    }).then(function(all){
      MEM = all || {};
      BACKEND = "idb"; HYDRATED = true;
      return { backend: BACKEND, keys: Object.keys(MEM).length };
    }).catch(function(e){
      /* Private windows, blocked storage, an old browser: the old behaviour exactly, which is a
         working card with a 5 MB ceiling rather than a broken one. */
      MEM = {};
      try {
        for (var i = 0; i < localStorage.length; i++){
          var k = localStorage.key(i);
          if (mine(k)) MEM[k] = localStorage.getItem(k);
        }
        BACKEND = "local";
      } catch (_e){ BACKEND = "memory"; }
      HYDRATED = true;
      try { console.warn("[kv] IndexedDB unavailable (" + (e && e.message || e)
                       + "), falling back to " + BACKEND); } catch (_e2){}
      return { backend: BACKEND, keys: Object.keys(MEM).length, error: String(e && e.message || e) };
    });
    return READY;
  }

  function fire(k, e){
    ONFAIL.forEach(function(fn){ try { fn(k, e); } catch (_e){} });
  }
  function flushSoon(){
    if (FLUSH) return;
    FLUSH = setTimeout(function(){
      FLUSH = null;
      var keys = Object.keys(PENDING);
      PENDING = {};
      if (BACKEND !== "idb"){
        keys.forEach(function(k){
          try {
            if (MEM[k] === undefined) localStorage.removeItem(k);
            else localStorage.setItem(k, MEM[k]);
          } catch (_e){ FAILED++; }
        });
        return;
      }
      keys.forEach(function(k){
        idbPut(k, MEM[k] === undefined ? null : MEM[k]).catch(function(e){
          FAILED++; fire(k, e);
          try { console.warn("[kv] could not write " + k + ": " + (e && e.message || e)); } catch (_e){}
        });
      });
    }, 120);
  }

  UJ.kv = {
    ready: hydrate,
    hydrated: function(){ return HYDRATED; },
    backend: function(){ return BACKEND; },
    failures: function(){ return FAILED; },
    /* What this store is holding, in characters -- so a card can say so before anything is full
       rather than after. */
    bytes: function(){
      var n = 0, k;
      for (k in MEM) if (Object.prototype.hasOwnProperty.call(MEM, k)) n += k.length + String(MEM[k] || "").length;
      return n;
    },
    get length(){ return Object.keys(MEM).length; },
    key: function(i){ return Object.keys(MEM)[i] || null; },
    getItem: function(k){
      return Object.prototype.hasOwnProperty.call(MEM, k) ? MEM[k] : null;
    },
    setItem: function(k, v){
      /* THE ONE REFUSAL. Writing before hydration would be writing an empty mirror over real work,
         which is the exact failure this whole store exists because of. */
      if (!HYDRATED) throw new Error("the store is not ready yet — nothing was written");
      MEM[k] = String(v);
      /* ── A MIRROR MUST NOT SWALLOW THE WORD "NO" ───────────────────────────────────────────
         Caught by draftsafecheck.js, which is the check written the day a quota error cost two
         hours. With a mirror in front of it, setItem always succeeded -- the value went into
         memory and the real write happened later, quietly -- so draftStore saw a successful save,
         skipped the rescue file and skipped the forced push to the account. The safety net built
         for exactly this failure was disconnected by the store meant to prevent it.

         ON THE FALLBACK, WRITE THROUGH AND THROW, which is precisely what localStorage did before
         any of this: the caller finds out in the same breath it asked. The value stays in memory
         because the work is not wrong, only unsaved. 2026-10-05. */
      if (BACKEND === "local"){
        try { localStorage.setItem(k, MEM[k]); }
        catch (e){ FAILED++; fire(k, e); throw e; }
        return;
      }
      PENDING[k] = 1; flushSoon();
    },
    /* IndexedDB cannot answer in the same breath, so a caller that needs to know asks to be told.
       draftStore uses this to run the same rescue the synchronous throw triggers. */
    onFail: function(fn){ if (typeof fn === "function") ONFAIL.push(fn); },
    removeItem: function(k){
      if (!HYDRATED) throw new Error("the store is not ready yet — nothing was removed");
      delete MEM[k];
      PENDING[k] = 1; flushSoon();
    },
    /* For checks and for a card that wants to know the write really landed. */
    flush: function(){
      if (FLUSH){ clearTimeout(FLUSH); FLUSH = null; }
      var keys = Object.keys(PENDING); PENDING = {};
      if (BACKEND !== "idb"){
        keys.forEach(function(k){
          try {
            if (MEM[k] === undefined) localStorage.removeItem(k);
            else localStorage.setItem(k, MEM[k]);
          } catch (_e){ FAILED++; }
        });
        return Promise.resolve(true);
      }
      return Promise.all(keys.map(function(k){
        return idbPut(k, MEM[k] === undefined ? null : MEM[k]).catch(function(){ FAILED++; });
      })).then(function(){ return true; });
    }
  };
  hydrate();
})();
