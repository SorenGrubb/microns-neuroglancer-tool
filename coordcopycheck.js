/* Every coordinate pill copies itself, wherever it is.                             2026-10-03

   Søren, with a screenshot of the coordinate search: *"This nearest nucleus coordinate should be
   copied when clicking it"*.

   It already said it would — coordSpan() writes title="click to copy" and .idval is styled with a
   pointer cursor and a hover border — and on that line it did nothing, because the handler was
   wired five times, each over one container's own elements, and that line is built elsewhere.

   THE ASSERTION THAT MATTERS is not "a listener exists" but "a pill that was never on screen when
   any wiring ran still copies". So this makes one in a container of its own, after load, attached
   to nothing that renders panels — the situation the nearest-nucleus line was in — and clicks it.

   Run: node coordcopycheck.js */
const { chromium } = require("playwright");
const fs = require("fs");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what
                             + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const src = fs.readFileSync(page_("ujump.html"), "utf8");
  console.log("\nujump.html, as a file");
  ok(!/querySelectorAll\("\.idval"\)/.test(src),
     "no per-container .idval wiring is left — one rule, not five");
  ok(/closest\(".idval"\)/.test(src), "...replaced by one delegated listener");

  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await b.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**script.google.com/**", r => r.fulfill({ status: 200,
    contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ ok: true, identities: [], organelles: [], tracings: [], reports: [],
                           rows: [], newCells: [], posts: [] }) }));
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**googleapis.com/**",
                   "**s3.amazonaws.com/**", "**gstatic.com/**", "**raw.githubusercontent.com/**"])
    await p.route(h, r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(4500);

  console.log("\na pill nothing wired still copies");
  const r = await p.evaluate(async () => {
    /* A container that no panel renderer has ever seen — which is exactly the position the
       nearest-nucleus line was in, and why it was dead. */
    const host = document.createElement("div");
    host.id = "copytest";
    document.body.appendChild(host);
    host.innerHTML = coordSpan(226880, 130944, 15523);
    const pill = host.querySelector(".idval");
    const before = pill.textContent;
    pill.click();
    await new Promise(x => setTimeout(x, 60));
    const during = pill.textContent;
    let wrote = "";
    try { wrote = await navigator.clipboard.readText(); } catch (e){ wrote = "(denied: " + e.message + ")"; }
    await new Promise(x => setTimeout(x, 1100));
    return { before: before, during: during, after: pill.textContent, wrote: wrote,
             title: pill.getAttribute("title") };
  });
  ok(r.before === "226880, 130944, 15523", "the pill holds the coordinate", r.before);
  ok(r.title === "click to copy", "...and says what clicking does", r.title);
  ok(r.wrote === "226880, 130944, 15523",
     "CLICKING IT PUTS THAT ON THE CLIPBOARD", JSON.stringify(r.wrote));
  ok(r.during === "copied", "...and the pill says so itself", r.during);
  ok(r.after === r.before, "...then puts the coordinate back", r.after);

  console.log("\nand so does a pill in a panel, which already worked");
  const panel = await p.evaluate(async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    host.innerHTML = '<span class="idval" title="click to copy" data-c="864691135570733037">'
                   + "864691135570733037</span>";
    const pill = host.querySelector(".idval");
    pill.click();
    await new Promise(x => setTimeout(x, 60));
    let wrote = "";
    try { wrote = await navigator.clipboard.readText(); } catch (e){ wrote = "(denied)"; }
    return { wrote: wrote, during: pill.textContent };
  });
  ok(panel.wrote === "864691135570733037", "a root-id pill copies too", panel.wrote);
  ok(panel.during === "copied", "...with the same confirmation");

  console.log("\nand a click on something that is not a pill is left alone");
  const other = await p.evaluate(async () => {
    const before = document.body.textContent.indexOf("copied");
    document.querySelector("h1, header, .wrap").click();
    await new Promise(x => setTimeout(x, 60));
    return { changed: document.body.textContent.indexOf("copied") !== before };
  });
  ok(!other.changed, "nothing else on the page reacts to being clicked");

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await p.close();
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
