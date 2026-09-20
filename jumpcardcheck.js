/* The list of cells comes first, and the coordinate box is the second way in.       2026-09-20

   Søren, with a mock-up made by cutting the card up and reordering it: *"I want to change the
   Coordinate card. Instead of the main thing being the coordinates, the list of cells should be the
   main thing. I imagine something like this, but if the different cell types could have different
   colors to make them easier to discern, then that would also be nice."* And a minute later: *"Now,
   the cell should be always visible, but the coordinate should be expandable and hidden by
   default."*

   WHAT THE OLD ORDER WAS SAYING. A coordinate box at the top says: you have a coordinate, paste it.
   True on the day you are reading somebody's figure, false on every other day — browsing a type,
   drawing a random example and reviewing somebody's call are the reasons to open this tool, and all
   three were folded away at the bottom.

   THE TRAP THIS EXISTS TO CATCH is not the order, which is visible, but the wiring: #x, #y, #z,
   #go, #nearestLine and the three random controls all moved inside or out of a <details>, and every
   one of them is reached by getElementById from code that was not touched. A card that looks right
   and has lost its Jump button is the failure worth a check.

   Run: node jumpcardcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 900, height: 1100 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**script.google.com/**", r => r.abort());
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**storage.googleapis.com/**", r => r.abort());
  await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  console.log("browsing is the first thing, and it never has to be opened");
  {
    const got = await p.evaluate(() => {
      const rp = document.getElementById("randomCellPanel");
      const cp = document.getElementById("coordPanel");
      return { tag: rp && rp.tagName, cpTag: cp && cp.tagName,
               before: !!(rp && cp && (rp.compareDocumentPosition(cp) & 4)),
               /* Visible without a click is the whole of "always visible". */
               shown: !!(rp && rp.getClientRects().length),
               selShown: !!document.getElementById("randomTypeSelect").getClientRects().length,
               btnShown: !!document.getElementById("randomOfType").getClientRects().length,
               unclShown: !!document.getElementById("randomUnclassified").getClientRects().length,
               commShown: !!document.getElementById("randomCommunityId").getClientRects().length,
               /* His mock put the picker above the two buttons. */
               pickerFirst: !!(document.getElementById("randomTypeSelect")
                 .compareDocumentPosition(document.getElementById("randomUnclassified")) & 4) };
    });
    ok(got.tag === "DIV", "the browse block is not a fold at all", got.tag);
    ok(got.shown && got.selShown && got.btnShown && got.unclShown && got.commShown,
       "...so every control in it is on screen with nothing clicked",
       [got.shown, got.selShown, got.btnShown, got.unclShown, got.commShown].join("/"));
    ok(got.pickerFirst, "...the type picker above the two random buttons", got.pickerFirst);
    ok(got.before, "...and the whole block above the coordinate box", got.before);
  }

  console.log("\nand the coordinate box is a fold, shut");
  {
    const got = await p.evaluate(() => {
      const cp = document.getElementById("coordPanel");
      return { tag: cp.tagName, open: cp.open,
               summary: cp.querySelector("summary").textContent.trim(),
               /* Shut, so the boxes are off screen — but still reachable by id, which is what
                  every untouched getElementById in this file depends on. */
               /* checkVisibility(), not getClientRects(): Chromium keeps rects for the children
                  of a closed <details>, so the naive probe reports a hidden box as on screen. */
               xShown: document.getElementById("x").checkVisibility(),
               xFound: !!document.getElementById("x"),
               goFound: !!document.getElementById("go"),
               holds: cp.contains(document.getElementById("x"))
                      && cp.contains(document.getElementById("go"))
                      && cp.contains(document.getElementById("nearestLine")),
               /* What must NOT have been swallowed by the new fold. */
               keptOut: !cp.contains(document.getElementById("rootNucSearchPanel"))
                        && !cp.contains(document.getElementById("recentlyViewedPanel"))
                        && !cp.contains(document.getElementById("navBackBtn")) };
    });
    ok(got.tag === "DETAILS", "it is a fold", got.tag);
    ok(got.open === false, "...shut by default, as he asked", got.open);
    ok(/^Or jump to a coordinate/.test(got.summary),
       "...saying it is the other way in", got.summary.slice(0, 50));
    ok(got.xShown === false, "...with the boxes out of the way", got.xShown);
    ok(got.xFound && got.goFound, "...but still reachable by id", got.xFound && got.goFound);
    ok(got.holds, "...holding the boxes, the arrow and the nearest-nucleus receipt", got.holds);
    ok(got.keptOut,
       "...and NOT the Root/Nucleus search, the history or Back — they stay visible", got.keptOut);
  }

  console.log("\nthe Jump still jumps, with the box shut");
  {
    /* The real risk of moving controls into a <details>: code that was not touched still finds
       them. Driven through the DOM rather than by reading it. */
    const got = await p.evaluate(async () => {
      document.getElementById("x").value = "295857";
      document.getElementById("y").value = "151338";
      document.getElementById("z").value = "17852";
      document.getElementById("go").click();
      await new Promise(r => setTimeout(r, 1200));
      return { url: (document.getElementById("url").textContent || "").slice(0, 40),
               shown: document.getElementById("out").className,
               err: document.getElementById("err").style.display };
    });
    ok(/#!|http/.test(got.url), "a viewer link is built from a shut box", got.url || "(none)");
    ok(/show/.test(got.shown), "...and shown", got.shown);
    ok(got.err !== "block", "...with no error", got.err || "none");
  }

  console.log("\nthe types are coloured by category, not by type");
  {
    const got = await p.evaluate(async () => {
      const sel = document.getElementById("randomTypeSelect");
      for (let i = 0; i < 60 && !sel.querySelector("optgroup"); i++)
        await new Promise(r => setTimeout(r, 100));
      const gs = [].slice.call(sel.querySelectorAll("optgroup"));
      return { groups: gs.map(g => ({ label: g.label,
                 colour: g.style.color,
                 computed: getComputedStyle(g).color,
                 opts: g.querySelectorAll("option").length,
                 optColours: Array.from(new Set([].slice.call(g.querySelectorAll("option"))
                   .map(o => o.style.color))) })) };
    });
    ok(got.groups.length >= 3, "the picker has its categories", got.groups.length + " groups");
    ok(got.groups.every(g => /^var\(--cat-/.test(g.colour)),
       "...each painted from the category palette",
       got.groups.map(g => g.label + "=" + g.colour).join("  ").slice(0, 110));
    /* Resolved to a real colour, not left as an unknown custom property — the tokens have to
       actually exist in the stylesheet for any of this to show. */
    /* `color(srgb ...)` as well as `rgb(...)`: Leptomeninges is a color-mix of two tokens — the
       one category with no token of its own — and Chromium computes a mix to a color() value. */
    ok(got.groups.every(g => /^(rgba?|color)\(/.test(g.computed)),
       "...and the tokens resolve to real colours, mixed ones included",
       got.groups.map(g => g.computed).join(", ").slice(0, 120));
    const cols = got.groups.map(g => g.colour);
    ok(new Set(cols).size >= 3, "...with distinct colours between categories",
       Array.from(new Set(cols)).join(", ").slice(0, 110));
    ok(got.groups.every(g => g.optColours.length === 1 && g.optColours[0] === g.colour),
       "every option takes its own group's colour, so a subtype is never a colour of its own",
       got.groups.map(g => g.optColours.length).join("/"));
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.length ? errors[0] : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
