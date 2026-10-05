/* A tracing survives the browser saying no.                                           2026-10-04

   Søren, after a two-hour whole-cell tracing was gone: *"It had complained some times that it did
   not have enough space in the browser to save my draft. I just lost 2 hours of work."*

   IT HAD TOLD HIM, AND IT STILL WENT. The card knew localStorage was refusing and said so in a
   status row, and then behaved exactly as if nothing were wrong: the account copy was skipped
   because it was gated behind the local write, no file was offered, nothing stayed on screen, and
   nothing stopped the tab closing.

   SO THIS CHECK FILLS THE STORE UNTIL IT REFUSES and then asks what happened to the work. Filling
   it for real, with a loop that writes until setItem throws, rather than stubbing the store with
   something that pretends to: a stub would also have passed against the code that lost his work,
   because the old code's fault was not in how it detected the failure but in what it did next.

   Run: node draftsafecheck.js [page.html]      (default ujump.html) */
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
  /* ── THIS CHECK IS ABOUT THE DAY THE STORE SAYS NO, AND THAT IS NOW THE FALLBACK ─────────
     core/kvstore.js moved the card's keys to IndexedDB, which has no ceiling worth filling — so
     filling localStorage no longer makes anything refuse. The refusal is still reachable and still
     has to behave: a private window, a blocked database, an old browser all land on localStorage
     with its few megabytes. So IndexedDB is turned off here and the store falls back exactly as it
     would there, and the quota below is filled for real rather than stubbed. 2026-10-05. */
  await p.addInitScript(() => {
    try { Object.defineProperty(window, "indexedDB", { get(){ return undefined; } }); } catch (_e){}
  });
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(3500);

  const r = await p.evaluate(async () => {
    const out = {};
    /* A draft of a size somebody would actually draw: contours of 60 points on 40 sections. */
    const draft = (id, n) => {
      const rings = [];
      for (let z = 0; z < n; z++){
        const pts = [];
        for (let k = 0; k < 60; k++) pts.push([100000 + z * 7 + k, 200000 + z * 11 - k]);
        rings.push({ z: 760 + z, inst: 0, points: pts });
      }
      return { v: 2, id: id, title: "whole cell " + id, at: new Date().toISOString(),
               rings: rings, pending: [], z: 760, used: true };
    };
    out.store = (function(){ try { return !!window.localStorage; } catch (_e){ return false; } })();
    if (!out.store) return out;
    try { localStorage.clear(); } catch (_e){}

    /* The spies. Both are ordinary top-level function declarations on this page, so they can be
       stood in for without touching the file under test. */
    window.__pushes = []; window.__files = [];
    window.__realPush = draftPush;
    draftPush = function(d, force){ window.__pushes.push({ id: d && d.id, force: !!force }); return true; };
    tracingSaveBlob = function(blob, name){ window.__files.push({ name: name, bytes: blob.size }); };

    /* One draft saved while there is room. */
    const a = draft("keepme", 6);
    out.firstPut = draftStore.put(a);
    out.firstBack = !!draftStore.get("keepme");

    /* FILLED FOR REAL, AND THEN TOPPED UP. A loop that stops at the first refusal leaves whatever
       the last write asked for still free -- 128 KB of slack, which is more than a draft needs, so
       the draft would have saved and this check would have passed against the broken code. Coarse,
       then fine, until half a kilobyte will not fit. */
    let i = 0, chunks = [];
    [131072, 8192, 512].forEach(function(sz){
      const pad = new Array(sz).join("x");
      try { for (;;){ localStorage.setItem("__fill" + i, pad); chunks.push("__fill" + i); i++;
                      if (i > 2000) break; } } catch (_e){}
    });
    out.filled = i;
    out.free = (function(){ try { localStorage.setItem("__probe", new Array(512).join("x"));
                                  localStorage.removeItem("__probe"); return true; }
                            catch (_e){ return false; } })();

    /* And now the save that cannot land. */
    window.__pushes.length = 0; window.__files.length = 0;
    const big = draft("lost2hours", 60);
    out.wrote = draftStore.put(big);
    out.pushed = window.__pushes.slice();
    out.files = window.__files.slice();
    const alarm = document.getElementById("tracingDraftAlarm");
    out.alarmShown = !!(alarm && alarm.style.display !== "none" && alarm.textContent.length > 40);
    out.alarmSays = alarm ? alarm.textContent.slice(0, 150) : "";
    out.alarmFor = DRAFT_ALARM_FOR;
    /* THE OTHER DRAFT IS STILL THERE. This is the one-key-each half: under the old single-blob
       store, a draft too big to write took every other draft's copy with it. */
    out.keptStillThere = !!draftStore.get("keepme");
    out.keptRings = (draftStore.get("keepme") || { rings: [] }).rings.length;

    /* A second failing save does not write a second file straight away — an autosave every 1.2 s
       would otherwise be a folder of files a minute — but it does keep asking the account. */
    window.__files.length = 0; window.__pushes.length = 0;
    draftStore.put(big);
    out.filesAgain = window.__files.length;
    out.pushesAgain = window.__pushes.length;

    /* ...and it does write another once the work has moved on. */
    window.__files.length = 0;
    draftStore.put(draft("lost2hours", 100));
    out.filesGrown = window.__files.length;

    /* Room again: the save works, and the banner comes down. */
    chunks.forEach(function(k){ localStorage.removeItem(k); });
    window.__pushes.length = 0;
    out.wroteAfter = draftStore.put(draft("lost2hours", 8));
    out.alarmAfter = (function(){
      const el = document.getElementById("tracingDraftAlarm");
      return !!(el && el.style.display === "none");
    })();
    out.pushedAfter = window.__pushes.slice();

    /* And the way back in from the file it wrote. */
    out.hasFileInput = !!document.getElementById("tracingDraftFileIn");
    out.canOpenFile = typeof draftOpenFile === "function";

    /* THE DRAFTS HE ALREADY HAS. Everything above is about a store written by the new code; this
       is the one he will actually meet on the morning he reloads, with a v2 blob holding every
       draft in one value. Splitting it writes each to its own key and then replaces the blob with
       the small index, so the browser has MORE room afterwards, not less. */
    /* THROUGH THE CARD'S OWN STORE, not through localStorage behind its back. Since core/kvstore.js
       the card reads a mirror, and a raw localStorage write is a write it never sees -- which would
       make this section test nothing at all. The v2-to-v3 split being asserted is draftStore's and
       is the same whichever backend holds the bytes. 2026-10-05. */
    const S = tracingStore();
    const keysOf = function(){
      const a = []; for (let i = 0; i < S.length; i++) a.push(S.key(i)); return a;
    };
    const wipe = function(){ keysOf().forEach(function(k){ try { S.removeItem(k); } catch (_e){} }); };
    wipe();
    const two = [draft("old_a", 4), draft("old_b", 5)];
    const scoped = (function(){
      /* Whatever key this page's scope puts it under -- the card builds it, not this check. */
      draftStore.put(draft("probe", 1));
      const kk = keysOf().filter(function(x){ return x.indexOf("#") < 0 && x.indexOf("draft") >= 0; });
      wipe();
      return kk[0] || "";
    })();
    out.scoped = scoped;
    const before = JSON.stringify({ v: 2, drafts: two });
    S.setItem(scoped, before);
    out.beforeBytes = before.length;
    const listed = draftStore.list();
    out.migrated = listed.length;
    out.migratedBack = listed.map(function(d){ return d.id + ":" + d.rings.length; }).join(" ");
    out.nowIndex = (function(){ try { return !!JSON.parse(S.getItem(scoped)).index; }
                                catch (_e){ return false; } })();
    out.afterBytes = (S.getItem(scoped) || "").length;
    out.perKey = keysOf().filter(function(x){ return x.indexOf("#") > 0; }).length;

    draftPush = window.__realPush;
    return out;
  });

  if (!r.store){
    console.log("  (this page has no localStorage to fill — nothing to check)");
    await b.close(); process.exit(0);
  }

  console.log("while there is room");
  ok(r.firstPut === true && r.firstBack, "a draft saves and reads back", r.firstPut + " / " + r.firstBack);

  console.log("\nand when the browser refuses — " + r.filled + " chunks written first, "
            + "down to half a kilobyte" + (r.free ? " (BUT THERE IS STILL ROOM)" : ""));
  ok(r.wrote === false, "the local write fails, which is the state he was in", String(r.wrote));
  ok(r.pushed.length === 1 && r.pushed[0].force === true,
     "THE ACCOUNT IS STILL ASKED, and forced past the two-minute throttle — the line that cost two "
     + "hours was `if (wrote) draftPush(d, false)`, so this was never even attempted",
     JSON.stringify(r.pushed));
  ok(r.files.length === 1 && /\.json$/.test(r.files[0].name || ""),
     "...and the work goes to a file, which is the one destination with no quota and no sign-in",
     r.files.length ? r.files[0].name + ", " + Math.round(r.files[0].bytes / 1024) + " KB" : "none");
  ok(r.alarmShown && r.alarmFor === "lost2hours",
     "...and a banner stays up rather than one sentence in a status row the next thing overwrites",
     r.alarmSays);
  ok(r.keptStillThere && r.keptRings === 6,
     "...and the OTHER draft is untouched — one key each, so a tracing too big to write no longer "
     + "takes every other draft down with it",
     r.keptRings + " contours still kept");

  console.log("\nand it does not become a folder of files");
  ok(r.filesAgain === 0 && r.pushesAgain === 1,
     "the same draft failing again writes no second file, but still asks the account",
     r.filesAgain + " files, " + r.pushesAgain + " pushes");
  ok(r.filesGrown === 1,
     "...and twenty-five more contours does write another, so the rescue file cannot go stale while "
     + "somebody keeps drawing",
     r.filesGrown + " file");

  console.log("\nand when there is room again");
  ok(r.wroteAfter === true, "the save works", String(r.wroteAfter));
  ok(r.alarmAfter, "...and the banner comes down");
  ok(r.pushedAfter.length === 1 && r.pushedAfter[0].force === false,
     "...and the account goes back to the throttled push, because somebody drawing is not an "
     + "emergency", JSON.stringify(r.pushedAfter));

  console.log("\nand the way back in");
  ok(r.hasFileInput && r.canOpenFile,
     "the card takes a draft file back — a rescue file nobody can reload is a souvenir",
     r.hasFileInput ? "an input and a reader" : "no input");

  console.log("\nand the drafts he already has");
  ok(r.migrated === 2 && /old_a:4/.test(r.migratedBack) && /old_b:5/.test(r.migratedBack),
     "a v2 blob holding every draft in one value comes back whole", r.migratedBack);
  ok(r.nowIndex && r.perKey === 2,
     "...split into one key each, with a small index where the blob was", r.perKey + " draft keys");
  ok(r.afterBytes < r.beforeBytes / 4,
     "...so the browser has MORE room than before the upgrade, not less — the blob is replaced by "
     + "the index rather than joined by it",
     r.beforeBytes + " chars -> " + r.afterBytes);

  ok(errors.length === 0, "no page errors", errors.slice(0, 2).join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
