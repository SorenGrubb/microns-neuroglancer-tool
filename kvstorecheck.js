/* The store that has no ceiling, and does not lie while it is filling.               2026-10-05

   Søren's browser, measured: `ujump_tracings_v1` held 4,141,977 characters — about 8 MB in UTF-16 —
   against a per-origin localStorage budget of roughly 5–10 MB shared by all eight tools. His drafts
   had nowhere to go. core/kvstore.js moves the card's keys to IndexedDB, which is granted against
   free disk instead.

   THE DANGEROUS PART IS NOT THE CEILING, IT IS THE MIRROR. The store is read synchronously from an
   in-memory copy so the card's sixteen call sites did not have to change. An in-memory copy that
   answers "no tracings" while it is still hydrating, and is then written back, would destroy more
   than the bug did. So the assertions that matter here are the ones about the window before ready:
   that a write throws rather than lands, and that a migration deletes nothing it has not read back.

   Run: node kvstorecheck.js [page.html]      (default ujump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ujump.html";
let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());

  /* A browser that already holds work in localStorage, which is every browser that has used this
     card before today. Seeded BEFORE the page's scripts run, so the migration meets it. */
  await p.addInitScript(() => {
    try {
      localStorage.setItem("ujump_tracings_v1", JSON.stringify([{ id: "kept1", name: "Lysosome 1" }]));
      localStorage.setItem("ujump_tracing_drafts_v2",
        JSON.stringify({ v: 2, drafts: [{ id: "old", title: "Nucleus", at: "2026-10-01T00:00:00Z",
                                          rings: [{ z: 1, inst: 0, points: [[1, 2], [3, 4]] }] }] }));
      localStorage.setItem("ujump_theme", "dark");          // not the card's: must be left alone
      localStorage.setItem("djump_nav_history", "[1,2,3]"); // likewise
    } catch (_e){}
  });
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(3500);
  void 0;

  const r = await p.evaluate(async () => {
    const out = {};
    out.has = !!(window.UJ && UJ.kv);
    if (!out.has) return out;
    await UJ.kv.ready();
    out.backend = UJ.kv.backend();
    out.hydrated = UJ.kv.hydrated();

    /* MIGRATED, AND THE ORIGINALS GONE — which is the half that gives space back. */
    out.inStore = [UJ.kv.getItem("ujump_tracings_v1"), UJ.kv.getItem("ujump_tracing_drafts_v2")]
                    .map(v => (v || "").length);
    out.leftInLocal = ["ujump_tracings_v1", "ujump_tracing_drafts_v2"]
                        .map(k => { try { return localStorage.getItem(k); } catch (_e){ return "?"; } })
                        .filter(v => v !== null).length;
    out.notMine = ["ujump_theme", "djump_nav_history"]
                    .map(k => { try { return localStorage.getItem(k); } catch (_e){ return null; } })
                    .filter(Boolean).length;

    /* THE CARD READ THE MIGRATED LIST, not an empty mirror. */
    out.kept = (typeof TRACINGS_KEPT !== "undefined" && TRACINGS_KEPT || []).length;
    out.keptId = (TRACINGS_KEPT && TRACINGS_KEPT[0] && TRACINGS_KEPT[0].id) || "";

    /* A WRITE, AND IT SURVIVES A RELOAD. */
    const big = { v: 2, drafts: [{ id: "big", title: "Whole cell", at: new Date().toISOString(),
                                   rings: [] }] };
    for (let z = 0; z < 1500; z++){
      const pts = [];
      for (let k = 0; k < 90; k++) pts.push([100000 + z * 7 + k, 200000 + z * 11 - k]);
      big.drafts[0].rings.push({ z: z, inst: 0, points: pts });
    }
    const s = JSON.stringify(big);
    out.wroteChars = s.length;
    try { UJ.kv.setItem("ujump_tracing_drafts_v2", s); out.wrote = true; }
    catch (e){ out.wrote = false; out.wroteErr = String(e.message || e); }
    await UJ.kv.flush();
    out.bytesNow = UJ.kv.bytes();
    return out;
  });

  if (!r.has){ console.log("  (core/kvstore.js is not on this page)"); await b.close(); process.exit(1); }

  console.log("the store");
  ok(r.backend === "idb" && r.hydrated, "is IndexedDB, hydrated", r.backend);
  ok(r.inStore[0] > 10 && r.inStore[1] > 10,
     "and it holds what localStorage held", r.inStore.join(" / ") + " chars");
  ok(r.leftInLocal === 0,
     "...with the originals REMOVED, which is how a full browser gets room back rather than using "
     + "twice as much", r.leftInLocal + " still in localStorage");
  ok(r.notMine === 2,
     "...and nothing that is not the card's was touched — the theme and the nav history are read "
     + "straight from localStorage by other code", r.notMine + " of 2 left alone");
  ok(r.kept === 1 && r.keptId === "kept1",
     "the card read the MIGRATED list, not an empty mirror — reading [] here is how this change "
     + "could have destroyed every kept tracing at the next save",
     r.kept + " kept, id " + r.keptId);

  console.log("\nand a draft far past what localStorage would take");
  ok(r.wrote === true, "writes", r.wroteErr || "ok");
  ok(r.wroteChars > 1000000,
     "...and it really is past it — localStorage counts UTF-16, so this is about "
     + (r.wroteChars * 2 / 1048576).toFixed(1) + " MB against a ~5 MB origin budget",
     r.wroteChars.toLocaleString() + " characters");

  await p.reload();
  await p.waitForTimeout(3000);
  const after = await p.evaluate(async () => {
    await UJ.kv.ready();
    const v = UJ.kv.getItem("ujump_tracing_drafts_v2") || "";
    let rings = -1;
    try { rings = JSON.parse(v).drafts[0].rings.length; } catch (_e){}
    return { chars: v.length, rings: rings, backend: UJ.kv.backend(),
             kept: (TRACINGS_KEPT || []).length };
  });
  ok(after.chars > 1000000 && after.rings === 1500,
     "...and it is all still there after a reload", after.rings + " contours, "
     + after.chars.toLocaleString() + " characters");
  ok(after.kept === 1, "...and so are the kept tracings", after.kept);

  /* THE REFUSAL, in a SECOND store built from the file this page is serving — so what is asserted
     is the shipped code's own guard and not a description of it. Given no indexedDB and no
     localStorage it cannot hydrate, which is the window the card would meet on a slow machine. */
  const core = require("fs").readFileSync(require("./corepath.js")("kvstore.js"), "utf8");
  const refuse = await p.evaluate(async (src) => {
    const win = { UJ: {} };
    try {
      new Function("window", "indexedDB", "localStorage", "setTimeout", "clearTimeout", src)
        (win, undefined, undefined, setTimeout, clearTimeout);
    } catch (e){ return { got: "build: " + String(e.message || e) }; }
    /* IMMEDIATELY, without awaiting ready(). This is the real window: the module has been
       constructed and hydration is in flight, which is exactly where the card would be if it read
       on a slow machine. */
    let got = "";
    try { win.UJ.kv.setItem("x", "y"); got = "WROTE"; }
    catch (e){ got = String(e.message || e); }
    const before = { got: got, hydrated: win.UJ.kv.hydrated() };
    /* And afterwards it works, in memory, which is the old no-storage behaviour rather than a
       broken card. */
    try { await win.UJ.kv.ready(); } catch (_e){}
    let later = "";
    try { win.UJ.kv.setItem("x", "y"); later = win.UJ.kv.getItem("x"); }
    catch (e){ later = "threw: " + String(e.message || e); }
    return { got: before.got, hydrated: before.hydrated,
             later: later, backend: win.UJ.kv.backend() };
  }, core);
  ok(/not ready/.test(refuse.got) && refuse.hydrated === false,
     "a write before the store has hydrated THROWS rather than landing — an empty mirror written "
     + "back over real work is the one way this change could have been worse than the bug",
     refuse.got);
  ok(refuse.later === "y" && refuse.backend === "memory",
     "...and once it has settled with no storage at all it still works, in memory, which is the "
     + "behaviour a private window has always had rather than a broken card",
     refuse.backend + ", read back " + JSON.stringify(refuse.later));

  /* ── AND A DATABASE THAT NEVER ANSWERS MUST NOT LEAVE THE CARD EMPTY FOR EVER ────────────
     This page replaces indexedDB.open with one whose success event never reaches the handler --
     which is what a blocked upgrade, a corrupt profile or another tab holding the version looks
     like from here. Written to prove the card waits for hydration before its first read; what it
     actually found was that hydration never finished, the card's init waited on it for ever, and
     the tracings list sat empty with no error anywhere. The same silent emptiness this whole
     change exists to remove, newly introduced by the fix for it, and only a test that refused to
     answer could have shown it. core/kvstore.js now races the open against a four-second clock. */
  const slow = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  await slow.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await slow.addInitScript(() => {
    try {
      localStorage.setItem("ujump_tracings_v1",
        JSON.stringify([{ id: "slow1", name: "Lysosome 1" }, { id: "slow2", name: "Lysosome 2" }]));
      const realOpen = indexedDB.open.bind(indexedDB);
      indexedDB.open = function(){
        const rq = realOpen.apply(null, arguments);
        let h = null;
        Object.defineProperty(rq, "onsuccess", {
          configurable: true,
          get: function(){ return h; },
          set: function(fn){ h = function(e){ const self = this; setTimeout(function(){ fn.call(self, e); }, 2000); }; }
        });
        return rq;
      };
    } catch (_e){}
  });
  await slow.goto("file://" + page_(PAGE));
  await slow.waitForTimeout(1200);
  const mid = await slow.evaluate(() => ({ hydrated: UJ.kv.hydrated(),
                                           kept: (typeof TRACINGS_KEPT !== "undefined" && TRACINGS_KEPT || []).length }));
  await slow.waitForTimeout(5000);
  const done = await slow.evaluate(() => ({ hydrated: UJ.kv.hydrated(),
                                            backend: UJ.kv.backend(),
                                            kept: (TRACINGS_KEPT || []).length,
                                            ids: (TRACINGS_KEPT || []).map(t => t.id).join(",") }));
  console.log("\nand when the database never answers");
  ok(mid.hydrated === false,
     "the card is running before the store has hydrated — the window this is all about",
     "hydrated=" + mid.hydrated + " at 1.2 s");
  ok(done.hydrated === true && done.backend === "local",
     "...it gives up on IndexedDB rather than waiting for ever, and falls back to localStorage — "
     + "the old behaviour with the old ceiling, which is a working card",
     "hydrated=" + done.hydrated + ", backend " + done.backend);
  ok(done.kept === 2 && done.ids === "slow1,slow2",
     "...and the card then holds the REAL list, not the empty one it would otherwise have read "
     + "and written back at the next save", done.kept + " kept: " + done.ids);
  await slow.close();

  ok(errors.length === 0, "no page errors", errors.slice(0, 2).join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
