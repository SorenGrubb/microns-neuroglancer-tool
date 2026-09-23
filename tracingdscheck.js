/* The tracing card reads and writes its own dataset's sheet.                       2026-09-21

   The backend answers a request that names no dataset from µJump's spreadsheet. λJump, βJump and
   ηJump add their dataset inside their own call sites rather than by wrapping fetch, so a request
   made from core/tracingcard.js carried none there: their tracing lists, their numbering and their
   account drafts were µJump's. See src/every_read_names_its_dataset.py.

   This records every request the card sends to the backend on each page and asserts that each one
   names that page's dataset — the reads by `&ds=`, the POST by a `ds` in its body — and that a
   POST goes out at all on a page with no postAndRead.

   Run: node tracingdscheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  for (const [page, ds] of [["ljump.html", "ljump"], ["bjump.html", "bjump"], ["hjump.html", "hjump"],
                            ["djump.html", "djump"], ["ujump.html", "ujump"]]){
    const p = await b.newPage();
    const errors = [];
    p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
    const seen = [];
    await p.route("**script.google.com/**", route => {
      const rq = route.request();
      seen.push({ url: rq.url(), method: rq.method(), body: rq.postData() || "" });
      return route.fulfill({ status: 200, contentType: "application/json",
                             body: JSON.stringify({ ok: true, tracings: [], drafts: [] }) });
    });
    for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**storage.googleapis.com/**",
                     "**s3.amazonaws.com/**", "**gstatic.com/**", "**allentech.org/**"])
      await p.route(h, r => r.abort());
    await p.goto("file://" + page_(page));
    await p.waitForTimeout(5000);
    const before = seen.length;
    const got = await p.evaluate(async () => {
      TRACING_INDEX_AT = 0;
      tracingIndexSoon();
      await tracingBrowse();
      /* An account draft save, the write that needs postAndRead. Signed in for the length of it. */
      let r;
      try { r = await tracingPost({ type: "tracing_draft", action: "save", draftId: "t1" }); }
      catch (e){ r = { ok: false, threw: String(e && e.message || e) }; }
      return { post: r, hasPAR: typeof postAndRead === "function" };
    });
    await p.waitForTimeout(500);
    const mine = seen.slice(before);
    const reads = mine.filter(r => r.method === "GET" && /[?&](tracings|drafts)=/.test(r.url));
    const posts = mine.filter(r => r.method === "POST");
    console.log("\n" + page + (got.hasPAR ? "  (has postAndRead)" : "  (no postAndRead)"));
    /* ── ONE READ IS THE POINT NOW, NOT TWO ─────────────────────────────────────────  2026-09-23
       This asked for >= 2, because tracingIndexSoon() and tracingBrowse() each fetched ?tracings=1
       and the two calls above made two identical requests. That WAS the "really slow" Søren
       reported: measured at 3.6 s warm and 27.7 s cold each, for one answer. They share one
       in-flight promise now, so this sequence makes exactly one request -- see
       src/the_dataset_list_does_not_wait_for_what_it_has.py, and datasetlistcheck.js, which owns
       the counting.
       What THIS check is for is the dataset name on every read, which is asserted below and is
       unaffected. So: at least one read, and no two of them identical. */
    ok(reads.length >= 1, "the card read its tracings", reads.length + " read(s)");
    const dupe = reads.map(r => r.url).filter((u, i, a) => a.indexOf(u) !== i);
    ok(!dupe.length, "...and no two reads are the same request",
       dupe.length ? dupe.length + " duplicate(s): " + dupe[0].replace(/^.*\/exec/, "") : "none");
    const bad = reads.filter(r => !new RegExp("[?&]ds=" + ds + "(&|$)").test(r.url));
    ok(!bad.length, "...every read names this dataset, " + ds,
       bad.length ? bad[0].url.replace(/^.*\/exec/, "") : reads.map(r => (r.url.match(/[?&]ds=[^&]*/) || ["(none)"])[0]).join(" "));
    ok(posts.length === 1, "a draft save goes out", posts.length + " POST(s)");
    if (posts.length){
      let body = {}; try { body = JSON.parse(posts[0].body); } catch (_e){}
      /* µJump IS the backend's default, and its postAndRead has never added one. */
      ok(body.ds === ds || (ds === "ujump" && !body.ds) || /[?&]ds=/.test(posts[0].url),
         "...naming this dataset", "body.ds=" + body.ds);
    }
    ok(got.post && got.post.ok, "...and its answer is read in postAndRead's shape", JSON.stringify(got.post));
    ok(errors.length === 0, "no page errors", errors.join(" | ") || "none");
    await p.close();
  }
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
