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
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**googleapis.com/**",
                   "**s3.amazonaws.com/**", "**gstatic.com/**", "**raw.githubusercontent.com/**"])
    await p.route(h, r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

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
  const shown = await p.evaluate(() =>
    document.querySelector('[data-tabpanel="forum"]').className);
  ok(/active/.test(shown), "the panel is the one on screen", shown);

  console.log("\ntwo streams, on one screen");
  const streams = await p.evaluate(() => {
    const t = document.getElementById("forumCard").textContent;
    return { volume: /About this volume/.test(t), tools: /About the tools/.test(t),
             shared: /shared across every/i.test(t) };
  });
  ok(streams.volume, "one for what is in the data");
  ok(streams.tools, "...and one for the tools");
  ok(streams.shared, "...which says out loud that it is shared, so nobody reports a bug eight times");

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
    UJ.forum.render();
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

  console.log("\none place needs no open-all button");
  const single = await p.evaluate(() => {
    UJ.forum._set([{ postId: "p2", scope: "volume", kind: "bug", title: "One thing",
                     body: "Just segment 864691135570733037, nothing else.",
                     authorName: "Somebody", timestamp: new Date().toISOString(),
                     replyTo: "", isMine: false }], false);
    UJ.forum.render();
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

  console.log("\nand posting sends what the box holds");
  const posted = await p.evaluate(async () => {
    GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "tok";
    UJ.forum._set([], false);
    UJ.forum.render();
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
