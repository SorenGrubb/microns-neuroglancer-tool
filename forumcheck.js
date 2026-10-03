/* The Discussion tab: two streams, and a post that is prose.                       2026-10-01

   Gary: *"a separate space where users can make suggestions for new features, log bug reports, or
   even discuss interesting findings they've noticed."*  Søren: *"one forum for each jump."*

   The backend end of this contract is backend/gs_harness_forum.js. This is the page: that the tab
   exists and is wired, that the forum is NOT fetched until somebody opens it, that a post's body is
   rendered through the linkifier rather than as raw markup, that several places in one post get one
   button rather than several tabs, and that the compose box says what it recognised before anything
   is sent.

   THE ESCAPING ASSERTION IS THE ONE THAT MATTERS. A forum is the first thing on Jump that renders
   text written by someone else, on a page holding a Google credential.

   Run: node forumcheck.js */
const { chromium } = require("playwright");
const fs = require("fs");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what
                             + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const src = fs.readFileSync(page_("ujump.html"), "utf8");
  console.log("\nujump.html, as a file");
  ok(/data-tab="forum"/.test(src), "there is a Discussion tab button");
  ok(/data-tabpanel="forum"/.test(src), "...and a panel behind it, which is the point of checking");
  ok(/id="forumCard"/.test(src), "...with the card core/forum.js fills");
  ok(/<script src="core\/forum\.js"><\/script>/.test(src), "...and the module is loaded");
  ok(src.indexOf('src="core/jumplink.js"') < src.indexOf('src="core/forum.js"'),
     "...after the linkifier it renders bodies with");

  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });

  /* Every forum request this page makes, so "it does not read the forum until you open the tab"
     can be asserted rather than hoped for. */
  const forumGets = [];
  const forumPosts = [];
  /* The EM chunks are answered locally, the same way empreviewcheck.js does it: a preview opened
     by a click must not depend on Google being reachable from a test machine. */
  await p.route("**storage.googleapis.com/**", async r => {
    const url = r.request().url();
    if (/\/info$/.test(url))
      return r.fulfill({ status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ type: "image", data_type: "uint8", num_channels: 1,
          scales: [8, 16, 32, 64].map(nm => ({ key: nm + "_" + nm + "_40", resolution: [nm, nm, 40],
            size: [800000 / nm, 800000 / nm, 30000], voxel_offset: [0, 0, 0],
            chunk_sizes: [[512, 512, 16]], encoding: "raw" })) }) });
    return r.fulfill({ status: 200, contentType: "application/octet-stream",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: Buffer.alloc(512 * 512 * 16, 128) });
  });
  await p.route("**script.google.com/**", async r => {
    const req = r.request();
    const url = req.url();
    if (req.method() === "POST"){
      let d = null; try { d = JSON.parse(req.postData() || "null"); } catch (_e){}
      if (d && d.type === "forum_post"){
        forumPosts.push(d);
        return r.fulfill({ status: 200, contentType: "application/json",
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ ok: true, postId: "p_new", edited: !!d.postId }) });
      }
    }
    if (/forum=1/.test(url)){
      forumGets.push(url);
      return r.fulfill({ status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ ok: true, canModerate: false, signedIn: true, posts: [] }) });
    }
    return r.fulfill({ status: 200, contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ ok: true, identities: [], organelles: [], tracings: [], reports: [],
                             rows: [], newCells: [] }) });
  });
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", /* NARROWED, not removed: "**googleapis.com/**" also matches storage.googleapis.com, where the
                       EM lives -- and routes added later win, so the blanket abort below was
                       cancelling the EM fixture registered above it. */
                   "**googleapis.com/oauth**",
                   "**s3.amazonaws.com/**", "**gstatic.com/**", "**raw.githubusercontent.com/**"])
    await p.route(h, r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  /* ── WHERE THE PANEL ACTUALLY IS ────────────────────────────────────────────────────────
     Søren, with a screenshot of the Discussion tab showing the credit card at the top of it:
     "This part should be moved to the bottom."

     The card was not misplaced; the PANEL was. It had been inserted as a sibling of .wrap, with
     BODY for a parent, because its anchor was `</div></div>` before the data block — two closing
     tags that turned out to be the credit card's and .wrap's. It matched exactly once, so the
     generator reported ok. A unique anchor in the wrong place is still the wrong place.

     So this asserts the NESTING, which no amount of matching the right string can fake. */
  console.log("\nthe panel is a panel of this page");
  const place = await p.evaluate(() => {
    const panel = document.querySelector('[data-tabpanel="forum"]');
    const wrap = document.querySelector(".wrap");
    const credit = [].slice.call(document.querySelectorAll(".card"))
      .filter(c => /This tool was made by/.test(c.textContent))[0];
    const kids = wrap ? [].slice.call(wrap.children) : [];
    return { parent: panel ? panel.parentElement.className || panel.parentElement.tagName : "none",
             inWrap: !!(wrap && panel && panel.parentElement === wrap),
             panels: kids.filter(k => k.hasAttribute && k.hasAttribute("data-tabpanel")).length,
             panelIdx: kids.indexOf(panel),
             creditIdx: kids.indexOf(credit),
             creditLast: !!(credit && wrap && credit === kids[kids.length - 1]),
             width: panel ? Math.round(panel.getBoundingClientRect().width) : 0,
             wrapWidth: wrap ? Math.round(wrap.getBoundingClientRect().width) : 0 };
  });
  ok(place.inWrap, "the Discussion panel is inside the page column, like every other panel",
     "its parent is " + place.parent);
  ok(place.panels === 5, "there are five tab panels in the page", place.panels);
  ok(place.creditIdx > place.panelIdx,
     "AND THE CREDIT CARD COMES AFTER IT — which is what he asked for, and what it had always been "
     + "on every other tab", "panel at " + place.panelIdx + ", credit at " + place.creditIdx);
  ok(place.creditLast, "...as the last thing on the page");

  console.log("\nnothing is read until somebody asks for it");
  ok(forumGets.length === 0, "the forum is not fetched on page load",
     forumGets.length + " request(s)");
  ok(await p.evaluate(() => !!(window.UJ && UJ.forum)), "but the module is there, ready");

  console.log("\nthe tab opens it, once");
  await p.click('#mainTabs .tabbtn[data-tab="forum"]');
  await p.waitForTimeout(800);
  ok(forumGets.length === 1, "opening the tab reads the forum", forumGets.length);
  ok(/tool=ujump/.test(forumGets[0] || ""), "...saying which tool is asking",
     (forumGets[0] || "").slice(-40));
  await p.click('#mainTabs .tabbtn[data-tab="jump"]');
  await p.click('#mainTabs .tabbtn[data-tab="forum"]');
  await p.waitForTimeout(500);
  ok(forumGets.length === 1, "...and going back and forth does not read it again",
     forumGets.length + " request(s)");
  const shown = await p.evaluate(() => {
    const panel = document.querySelector('[data-tabpanel="forum"]');
    const wrap = document.querySelector(".wrap");
    return { cls: panel.className,
             /* MEASURED WITH THE TAB OPEN. A hidden panel has no box at all, so asking this before
                the click reads 0 and says nothing about the layout. */
             w: Math.round(panel.getBoundingClientRect().width),
             wrapW: Math.round(wrap.getBoundingClientRect().width) };
  });
  ok(/active/.test(shown.cls), "the panel is the one on screen", shown.cls);
  ok(shown.w > 0 && shown.w <= shown.wrapW,
     "...and it is the page's width, not the window's", shown.w + " of " + shown.wrapW);

  /* ── THE INDEX, THE THREAD, THE BOX UNDERNEATH ──────────────────────────────────────────
     Søren: "the index should be on the left side of the screen and then the window to show the
     thread on the right and the input field below the thread." */
  console.log("\nan index on the left and a view on the right");
  const layout = await p.evaluate(() => {
    const idx = document.querySelector("#forumCard .forum-index");
    const view = document.querySelector("#forumCard .forum-view");
    const a = idx ? idx.getBoundingClientRect() : null;
    const b2 = view ? view.getBoundingClientRect() : null;
    return { idx: !!idx, view: !!view,
             leftOf: !!(a && b2 && a.left < b2.left),
             chips: document.querySelectorAll("#forumCard .fscope").length,
             text: document.getElementById("forumCard").textContent };
  });
  ok(layout.idx && layout.view, "there is an index and a view",
     "index " + layout.idx + ", view " + layout.view);
  ok(layout.leftOf, "...and the index really is the left-hand one");
  ok(layout.chips === 2, "two streams, as two chips rather than two stacked cards", layout.chips);
  ok(/This volume/.test(layout.text) && /The tools/.test(layout.text),
     "...named for what they are about");
  ok(/shared across every/i.test(layout.text) || /This volume/.test(layout.text),
     "...and the blurb belongs to the one you are looking at");

  /* ── CATEGORISED, COLLAPSED, AND OPENED IN THE VIEW ─────────────────────────────────────
     Søren: "it is fine to categorise them in questions, bugs, etc. but they should be collapsed by
     default and then open in a view." */
  console.log("\nthreads are grouped by kind and listed, not splayed out");
  const idx = await p.evaluate(() => {
    const t = (n, k, ts) => ({ postId: n, scope: "volume", kind: k, title: "T" + n,
                               body: "body " + n, authorName: "A", timestamp: ts, replyTo: "",
                               isMine: false });
    UJ.forum._set([
      t("q1", "question", "2026-09-01T00:00:00Z"),
      t("q2", "question", "2026-09-02T00:00:00Z"),
      t("b1", "bug",      "2026-09-03T00:00:00Z"),
      t("f1", "finding",  "2026-10-02T00:00:00Z"),          /* the newest */
      { postId: "r1", scope: "volume", kind: "reply", body: "me too", authorName: "B",
        timestamp: "2026-09-04T00:00:00Z", replyTo: "q1", isMine: false }
    ], false);
    UJ.forum._scope("volume"); UJ.forum.render();
    const cats = [].slice.call(document.querySelectorAll("#forumCard .fcat"));
    return { cats: cats.map(c => c.dataset.kind),
             open: cats.filter(c => c.open).map(c => c.dataset.kind),
             heads: cats.map(c => c.querySelector("summary").textContent.trim()),
             rows: document.querySelectorAll("#forumCard .fthread").length,
             bodies: document.querySelectorAll("#forumCard .forum-index .forumbody").length,
             q1row: (document.querySelector("#forumCard .fthread[data-pid='q1']") || {}).textContent || "" };
  });
  ok(idx.cats.length === 3, "one group per kind that has threads, and none for the kinds that do not",
     idx.cats.join(", "));
  ok(idx.rows === 4, "every thread is listed once", idx.rows + " rows");
  ok(idx.bodies === 0,
     "...as a row, not as its text: the index lists, it does not splay the posts out", idx.bodies);
  ok(/Questions · 2/.test(idx.heads.join(" | ")), "...under a heading that counts them",
     idx.heads.join(" | "));
  ok(idx.open.length === 1 && idx.open[0] === "finding",
     "COLLAPSED BY DEFAULT — except the one holding the newest thread, because a panel of four "
     + "closed headings looks broken", "open: " + (idx.open.join(",") || "none"));
  ok(/1 reply/.test(idx.q1row), "a thread's row says how many replies it has", idx.q1row.trim());

  console.log("\nand clicking one opens it in the view, with the box below it");
  const opened = await p.evaluate(() => {
    document.querySelector("#forumCard .fthread[data-pid='q1']").click();
    const view = document.querySelector("#forumCard .forum-view");
    const posts = [].slice.call(view.querySelectorAll(".forumpost")).map(x => x.dataset.pid);
    const box = view.querySelector(".forumcompose");
    /* NOT ":last-of-type" -- that means the last DIV among its siblings, and the compose box is a
       div too, so the selector matched nothing and the assertion failed on its own wording. */
    const all = view.querySelectorAll(".forumpost");
    const last = all[all.length - 1];
    const cats = [].slice.call(document.querySelectorAll("#forumCard .fcat"));
    return { posts: posts,
             hasBox: !!box,
             boxBelow: !!(box && last && box.getBoundingClientRect().top
                                        >= last.getBoundingClientRect().top),
             reply: !!document.getElementById("forum_reply_body"),
             openCats: cats.filter(c => c.open).map(c => c.dataset.kind),
             marked: (document.querySelector("#forumCard .fthread[data-pid='q1']").className || "") };
  });
  ok(opened.posts.join(",") === "q1,r1", "the thread is the root and its replies, in order",
     opened.posts.join(","));
  ok(opened.hasBox && opened.reply, "...with an input field");
  ok(opened.boxBelow, "...BELOW the thread, which is where he asked for it");
  ok(opened.openCats.indexOf("question") >= 0,
     "...and the group holding it is open, so you can see where you are",
     opened.openCats.join(","));
  ok(/\bon\b/.test(opened.marked), "...and the row is marked as the one you are reading",
     opened.marked);

  console.log("\nthe two streams are separate indexes");
  const scoped = await p.evaluate(() => {
    UJ.forum._set([
      { postId: "v1", scope: "volume", kind: "finding", title: "In the data", body: "x",
        authorName: "A", timestamp: "2026-10-01T00:00:00Z", replyTo: "", isMine: false },
      { postId: "t1", scope: "tools", kind: "bug", title: "In the pad", body: "y", tool: "wjump",
        authorName: "B", timestamp: "2026-10-01T00:00:00Z", replyTo: "", isMine: false }
    ], false);
    UJ.forum._scope("volume"); UJ.forum.render();
    const vol = [].slice.call(document.querySelectorAll("#forumCard .fthread"))
                  .map(x => x.dataset.pid);
    document.querySelector("#forumCard .fscope[data-scope='tools']").click();
    const tools = [].slice.call(document.querySelectorAll("#forumCard .fthread"))
                    .map(x => x.dataset.pid);
    return { vol: vol, tools: tools,
             says: document.getElementById("forumCard").textContent };
  });
  ok(scoped.vol.join(",") === "v1", "this volume's index holds only its own", scoped.vol.join(","));
  ok(scoped.tools.join(",") === "t1", "...and the tools index only the tools' ones",
     scoped.tools.join(","));
  ok(/wjump/.test(scoped.says),
     "...which still say which tool they were written from, read from any Jump");

  /* ── A POST IS PROSE, AND THE PROSE IS THE ANCHOR ────────────────────────────────────────── */
  console.log("\na post's body is rendered through the linkifier");
  const rendered = await p.evaluate(() => {
    const r = [UJ_RX, UJ_RY, UJ_RZ], bb = window.MINNIE65_EM_BB;
    const mid = (a, b2) => (a + b2) / 2;
    const v = [Math.round(mid(bb.xmin, bb.xmax) / r[0]), Math.round(mid(bb.ymin, bb.ymax) / r[1]),
               Math.round(mid(bb.zmin, bb.zmax) / r[2])];
    const body = "Look at " + v.join(", ") + " and at " + (v[0] + 400) + ", " + (v[1] + 400)
               + ", " + (v[2] + 4) + " — also segment 864691135570733037. "
               + "<script>alert(1)</scr" + "ipt> & it's 2026.";
    UJ.forum._set([{ postId: "p1", scope: "volume", kind: "finding", title: "Two capillaries",
                     body: body, authorName: "Gary Someone", timestamp: new Date().toISOString(),
                     replyTo: "", isMine: false }], false);
    /* A thread is read in the view now, so the body is only on screen once one is open. */
    UJ.forum._open("p1");
    const el = document.querySelector("#forumCard .forumbody");
    return { html: el ? el.innerHTML : "", text: el ? el.textContent : "",
             links: el ? el.querySelectorAll("a[data-jl]").length : -1,
             openAll: document.querySelectorAll("#forumCard .forumopenall").length,
             openAllText: (document.querySelector("#forumCard .forumopenall") || {}).textContent || "" };
  });
  ok(rendered.links === 3, "the two coordinates and the segment are links",
     rendered.links);
  ok(rendered.html.indexOf("<script") < 0,
     "a script tag somebody typed is NOT a script tag", rendered.html.slice(0, 70));
  ok(rendered.text.indexOf("<script>alert(1)</script>") >= 0,
     "...it is shown as the text it was, not swallowed");
  ok(!/<a[^>]*>2026</.test(rendered.html),
     "and the year is still not a cell, in a real post this time");
  ok(rendered.openAll === 1, "several places get ONE open-all button, not one tab each",
     rendered.openAll);
  ok(/Open all 3 of them/.test(rendered.openAllText), "...which says how many", rendered.openAllText);

  /* ── AND CLICKING ONE OPENS ITS PICTURE ─────────────────────────────────────────────────
     Søren: "when pasting a coordinate, the EM view ... shows for that coordinate." On click, which
     is his own answer: a forum of thirty posts must open instantly. */
  console.log("\nclicking a coordinate in a post opens the tissue under it");
  const prev = await p.evaluate(async () => {
    const slot = document.querySelector("#forumCard .forumprev");
    const links = document.querySelectorAll("#forumCard .forumbody a[data-jl]");
    const before = slot ? slot.innerHTML.length : -1;
    /* The first link is the first coordinate in that fixture's body. */
    links[0].click();
    await new Promise(r => setTimeout(r, 1500));
    const open1 = !!(slot && slot.querySelector(".emp"));
    const coord1 = (slot.querySelector(".emp-cv") || {}).dataset
                 ? slot.querySelector(".emp-cv").dataset.coord : "";
    /* A second click on the SAME one puts it away. */
    links[0].click();
    await new Promise(r => setTimeout(r, 400));
    const open2 = !!(slot && slot.querySelector(".emp"));
    /* And the OTHER coordinate moves the picture rather than adding a second. */
    links[0].click();
    await new Promise(r => setTimeout(r, 900));
    links[1].click();
    await new Promise(r => setTimeout(r, 1500));
    return { hadSlot: !!slot, before: before, open1: open1, coord1: coord1, open2: open2,
             say: (document.querySelector("#forumCard .emp-say") || {}).textContent || "",
             count: document.querySelectorAll("#forumCard .emp").length,
             coord2: (document.querySelector("#forumCard .emp-cv") || {}).dataset
                      ? document.querySelector("#forumCard .emp-cv").dataset.coord : "" };
  });
  ok(prev.hadSlot, "a post has somewhere for its picture to go");
  ok(prev.before === 0, "...and nothing is in it until somebody clicks", prev.before);
  ok(prev.open1, "clicking a coordinate draws it");
  ok(!!prev.coord1, "...stamped with that coordinate", prev.coord1 || ("nothing drawn: " + prev.say));
  ok(!prev.open2, "...and clicking it again puts it away");
  ok(prev.count === 1, "a second coordinate MOVES the picture rather than adding one",
     prev.count + " picture(s)");
  ok(!!prev.coord2 && prev.coord2 !== prev.coord1,
     "...and it is the second one now", prev.coord1 + " -> " + prev.coord2);

  /* ── AND A ROOT ID IS A LINK YOU CAN CLICK ───────────────────────────────────────────────
     Søren, on a phone, with a post whose root id was purple and inert: *"Clicking the root ID does
     nothing at all. I think clicking it or the nucleus ID should show it in Neuroglancer or as a 2D
     and 3d window."*

     The handler took the coordinate from THE LINK, and a root id has none -- so it returned, and a
     link that returns is indistinguishable from a link that is broken. A nucleus id had already
     been given a fallback for exactly this reason ("its link used to do nothing, which looks
     exactly like a broken link"); the root id never got one.

     TWO SEPARATE CASES, and the first needs nothing from the page at all: a post that names a place
     AND a cell is one picture of the two -- idsOf() has been gathering both since it was written,
     so the root link should open what the coordinate link opens. */
  console.log("\nclicking a root id in a post that also names a place");
  const rootWith = await p.evaluate(async () => {
    const slot = document.querySelector("#forumCard .forumprev");
    const links = document.querySelectorAll("#forumCard .forumbody a[data-jl]");
    /* PUT THE PREVIOUS PICTURE AWAY FIRST. The section above leaves one open, and "is there an
       .emp in the slot" would then be answered by it -- this assertion passed before the fix was
       written, which is the oldest way for a check to be worthless. */
    links[1].click();
    await new Promise(r => setTimeout(r, 400));
    const cleared = !slot.querySelector(".emp");
    /* p1's body is two coordinates and then the segment id, so the LAST link is the root. */
    const a2 = links[links.length - 1];
    const was = cleared;
    a2.click();
    await new Promise(r => setTimeout(r, 1600));
    const cv = document.querySelector("#forumCard .emp-cv");
    return { text: a2.textContent, drew: !!slot.querySelector(".emp"),
             coord: cv && cv.dataset ? cv.dataset.coord : "",
             was: was,
             say: (document.querySelector("#forumCard .emp-say") || {}).textContent || "" };
  });
  ok(/864691135570733037/.test(rootWith.text), "the last link is the root id", rootWith.text);
  ok(rootWith.was, "the previous picture is away, so this one is the root id's", rootWith.was);
  ok(rootWith.drew,
     "clicking it draws the picture — the post names a place, and a sentence naming a place and a "
     + "cell is asking for one picture of the two",
     rootWith.drew ? rootWith.coord : "nothing drawn: " + rootWith.say);
  ok(!!rootWith.coord, "...at a coordinate from the post", rootWith.coord);

  /* ── AND A POST THAT NAMES ONLY A CELL ───────────────────────────────────────────────────
     There is no coordinate to fall back on, so the page has to place the cell: µJump already holds
     the nucleus table and already has rootIdToIndex() for its own root-id search box. Where it
     cannot -- a community-proposed root, another volume's cell, or this harness, whose table is
     empty -- the link SAYS so. The one thing it must not do is what it did: nothing. */
  console.log("\nand one that names only a cell");
  const rootOnly = await p.evaluate(async () => {
    UJ.forum._set([{ postId: "p3", scope: "volume", kind: "question", title: "Only a root",
                     body: "What if I only post rootID: 864691135194795306",
                     authorName: "S\u00f8ren Grubb", timestamp: new Date().toISOString(),
                     replyTo: "", isMine: true }], false);
    UJ.forum._open("p3");
    const slot = document.querySelector("#forumCard .forumprev");
    const a2 = document.querySelector("#forumCard .forumbody a[data-jl]");
    const before = slot ? slot.innerHTML.length : -1;
    a2.click();
    await new Promise(r => setTimeout(r, 1600));
    return { before: before, after: slot ? slot.innerHTML.length : -1,
             text: (slot || {}).textContent || "",
             drew: !!(slot && slot.querySelector(".emp")) };
  });
  ok(rootOnly.before === 0, "nothing is in the slot before the click", rootOnly.before);
  ok(rootOnly.after > 0,
     "clicking a root id with no place in the post leaves something behind — a picture where the "
     + "page can place the cell, and a sentence where it cannot. Not nothing.",
     rootOnly.drew ? "drew the picture" : rootOnly.text.replace(/\s+/g, " ").slice(0, 90));
  ok(rootOnly.drew || /864691135194795306/.test(rootOnly.text),
     "...and the sentence names the id it could not place, so it reads as an answer rather than a "
     + "failure", rootOnly.text.replace(/\s+/g, " ").slice(0, 90));

  /* ── AND ONE IT CANNOT PLACE AT ALL ──────────────────────────────────────────────────────
     rootIdToIndex() knows only this tool's OWN resolved root ids -- a community-proposed root, or
     a cell in another volume, is not in it, and the search box says so about itself. That case
     used to be silence, which is the whole fault; it has to be a sentence. Asserted separately
     because the post above happens to name a cell this page CAN place, so it never reaches here. */
  console.log("\nand one it cannot place at all");
  const stranger = await p.evaluate(async () => {
    UJ.forum._set([{ postId: "p4", scope: "volume", kind: "question", title: "A stranger",
                     body: "Has anyone seen 864691100000000001 before?",
                     authorName: "Somebody", timestamp: new Date().toISOString(),
                     replyTo: "", isMine: false }], false);
    UJ.forum._open("p4");
    const slot = document.querySelector("#forumCard .forumprev");
    const a2 = document.querySelector("#forumCard .forumbody a[data-jl]");
    if (!a2) return { noLink: true };
    a2.click();
    await new Promise(r => setTimeout(r, 900));
    return { text: (slot || {}).textContent || "",
             drew: !!(slot && slot.querySelector(".emp")),
             said: !!(slot && slot.querySelector(".forumnoplace")),
             viewer: !!(slot && slot.querySelector(".forumnoplace a[href]")) };
  });
  ok(!stranger.noLink && !stranger.drew && stranger.said,
     "a root id this page has never resolved gets a sentence rather than silence",
     stranger.noLink ? "it was not even a link"
       : (stranger.text || "").replace(/\s+/g, " ").slice(0, 100));
  ok(stranger.viewer,
     "...with a Neuroglancer link in it, which is the one answer that works for any id at all",
     stranger.viewer ? "offered" : "no link");

  /* The page's half of the contract. nucleusAt() has been there since a post could name a nucleus;
     this is the same thing for the root id, and µJump already has the reverse map behind it. */
  const host = await p.evaluate(() => {
    const h = (typeof window.emPreviewHost === "function") ? window.emPreviewHost() : null;
    return { has: !!(h && typeof h.cellAt === "function"),
             nuc: !!(h && typeof h.nucleusAt === "function") };
  });
  ok(host.nuc, "the page can place a nucleus, as it always could");
  ok(host.has, "...and now a root id too, through the reverse map its own search box uses",
     host.has ? "cellAt is there" : "no cellAt on emPreviewHost()");

  console.log("\none place needs no open-all button");
  const single = await p.evaluate(() => {
    UJ.forum._set([{ postId: "p2", scope: "volume", kind: "bug", title: "One thing",
                     body: "Just segment 864691135570733037, nothing else.",
                     authorName: "Somebody", timestamp: new Date().toISOString(),
                     replyTo: "", isMine: false }], false);
    UJ.forum._open("p2");
    return { links: document.querySelectorAll("#forumCard .forumbody a[data-jl]").length,
             openAll: document.querySelectorAll("#forumCard .forumopenall").length };
  });
  ok(single.links === 1, "the link in the sentence is there", single.links);
  ok(single.openAll === 0, "...and is itself the button, so no second one is offered",
     single.openAll);

  console.log("\nthe compose box says what it recognised, before anything is sent");
  const says = await p.evaluate(() => {
    const r = [UJ_RX, UJ_RY, UJ_RZ], bb = window.MINNIE65_EM_BB;
    const mid = (a, b2) => (a + b2) / 2;
    const v = [Math.round(mid(bb.xmin, bb.xmax) / r[0]), Math.round(mid(bb.ymin, bb.ymax) / r[1]),
               Math.round(mid(bb.zmin, bb.zmax) / r[2])];
    return { empty: UJ.forum._foundSay(""),
             one: UJ.forum._foundSay("at " + v.join(", ")),
             bare: UJ.forum._foundSay("I counted 2026 of them"),
             cued: UJ.forum._foundSay("cell " + NID[0] + " is odd") };
  });
  ok(/No places recognised/.test(says.empty), "an empty box says so plainly", says.empty.slice(0, 40));
  ok(/1 coordinate/.test(says.one) && /minnie65/.test(says.one),
     "...a coordinate is counted and its volume named", says.one);
  ok(/No places recognised/.test(says.bare),
     "A BARE NUMBER IS REPORTED AS NOT RECOGNISED — which is how an author finds out "
     + "while they can still fix it", says.bare);
  ok(/1 cell/.test(says.cued), "...and the cued version is", says.cued);

  /* ── THE BUG SØREN HIT ──────────────────────────────────────────────────────────────────
     "sometimes the discussion does not show the fields to write anything. I think it depends on
     whether you are logged in when it loads." It did: composeHtml decided once, when the tab was
     first opened, and nothing looked again. Google's One Tap arrives when it arrives, so which
     answer you got was a race. */
  console.log("\nthe fields are there whether or not Google has answered yet");
  const out = await p.evaluate(() => {
    GOOGLE_VERIFIED = false; GOOGLE_CREDENTIAL = "";
    UJ.forum._set([], false);
    /* BACK TO THE VOLUME STREAM. The section above left the panel on "The tools", and the compose
       box is named for the stream it is in -- so without this these assertions would be about
       forum_tools_* while looking for forum_volume_*. */
    UJ.forum._scope("volume");
    UJ.forum._new();
    const go = document.getElementById("forum_volume_go");
    return { body: !!document.getElementById("forum_volume_body"),
             title: !!document.getElementById("forum_volume_title"),
             btn: go ? go.textContent : "(no button)" };
  });
  ok(out.body && out.title, "signed OUT, the box and the title are still there",
     "body " + out.body + ", title " + out.title);
  ok(/sign in/i.test(out.btn), "...and the BUTTON is what knows", out.btn);

  console.log("\nand what you typed survives signing in");
  const kept = await p.evaluate(async () => {
    document.getElementById("forum_volume_body").value = "Half a sentence about ";
    document.getElementById("forum_volume_title").value = "My title";
    /* Google answers, the way it does: the variables flip and nothing is dispatched. */
    GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "tok";
    window.dispatchEvent(new Event("focus"));
    await new Promise(r => setTimeout(r, 900));
    const go = document.getElementById("forum_volume_go");
    return { btn: go ? go.textContent : "",
             body: (document.getElementById("forum_volume_body") || {}).value,
             title: (document.getElementById("forum_volume_title") || {}).value };
  });
  ok(/post it/i.test(kept.btn),
     "the button becomes Post it WITHOUT a reload, which is the whole bug", kept.btn);
  ok(kept.body === "Half a sentence about ",
     "...and the half-written sentence is still in the box", JSON.stringify(kept.body));
  ok(kept.title === "My title", "...and the title", JSON.stringify(kept.title));

  console.log("\nand it goes back when the sign-in lapses");
  const lapsed = await p.evaluate(async () => {
    GOOGLE_VERIFIED = false; GOOGLE_CREDENTIAL = "";
    window.dispatchEvent(new Event("focus"));
    await new Promise(r => setTimeout(r, 900));
    const go = document.getElementById("forum_volume_go");
    return go ? go.textContent : "";
  });
  ok(/sign in/i.test(lapsed),
     "an expired token puts the button back rather than failing silently on the next post", lapsed);

  console.log("\nand posting sends what the box holds");
  const posted = await p.evaluate(async () => {
    GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "tok";
    UJ.forum._set([], false);
    UJ.forum._scope("volume");
    UJ.forum._new();
    document.getElementById("forum_volume_body").value = "A thing I saw.";
    document.getElementById("forum_volume_title").value = "A title";
    document.getElementById("forum_volume_kind").value = "idea";
    document.getElementById("forum_volume_go").click();
    await new Promise(r => setTimeout(r, 600));
    return true;
  });
  ok(posted && forumPosts.length === 1, "one post was sent", forumPosts.length);
  const d = forumPosts[0] || {};
  ok(d.type === "forum_post", "...of the right type", d.type);
  ok(d.scope === "volume", "...in the stream it was written in", d.scope);
  ok(d.kind === "idea" && d.title === "A title" && d.body === "A thing I saw.",
     "...carrying what the box held", [d.kind, d.title, d.body].join(" | "));
  ok(d.tool === "ujump", "...and which tool it came from", d.tool);
  ok(!!d.credential, "...signed", !!d.credential);
  ok(!("authorName" in d),
     "and it does NOT name its own author — that is the backend's to decide",
     Object.keys(d).join(","));

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await p.close();
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
