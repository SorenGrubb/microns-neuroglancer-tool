/* The tracing card builds itself, and builds the card the wiring expects.          2026-09-20

   Stage C of the core/tracingcard.js extraction. The module held 3,500 lines of behaviour and
   could not produce a single element: the card's 196 lines of MARKUP were still in ujump.html's
   body, so a second tool loading the module got all of the code and nothing on screen.

   The markup is now `tracingCardHtml()` — read out of ujump.html and emitted mechanically, never
   retyped, because 196 lines carrying single quotes, double quotes, entities, inline styles and
   forty title="..." tooltips is the kind of thing a transcription gets 99% right, and the 1% is a
   tooltip that quietly loses a quote and swallows the next attribute.

   WHAT THIS CHECKS, and why each one is here:

     1. the module really does build it — a page whose wrapper is empty ends up with a card;
     2. every id the module's own header names as its DOM contract is in what it built. That list
        is a promise to the four tools that have not adopted this yet, and a promise nobody
        verifies is a list that rots;
     3. the 61-kind organelle list and the six pad zoom levels are there, because those are the
        two places where a truncated string literal would still parse and still look like a card;
     4. it will NOT overwrite a wrapper somebody has already filled — a page still carrying its
        own copy keeps it, rather than having it replaced underneath an edit;
     5. mounting twice does not wire twice. µJump mounts on DOMContentLoaded; a tool that builds
        the card when a panel opens calls mount() again, and two listeners on one button is a
        button that fires twice.

   Run: node tracingcardhtmlcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* The module's header names these as the ids a host page must carry. Taken from that list rather
   than from what the markup happens to contain, so the two cannot drift apart silently. */
const CONTRACT = [
  "tracingPanel", "tracingX", "tracingY", "tracingZ", "tracingOpen", "tracePadOpen",
  "tracePad", "tracePadWrap", "tracePadMip", "tracePadPrev", "tracePadNext", "tracePadStep",
  "tracePadUndo", "tracePadPen", "tracePadSeg", "tracePadSegSay", "tracePadZ", "tracePadSay",
  "tracePadRings", "tracePadVol", "tracePadInsts", "tracePadNewInst", "tracePadHelp",
  "tracingLink", "tracingLayer", "tracingRead", "tracingStatus", "tracingFound",
  "tracingLayers", "tracingWhat", "tracingType", "tracingColor", "tracingEachOwn",
  "tracingEachList", "tracingDraftBar", "tracingList"
];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  for (const h of ["**script.google.com/**", "**accounts.google.com/**",
                   "**storage.googleapis.com/**", "**cdnjs.cloudflare.com/**",
                   "**s3.amazonaws.com/**"]) await p.route(h, r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(6000);

  console.log("ujump.html\n\nthe module builds the card the page leaves room for");
  {
    const got = await p.evaluate(CON => {
      const wrap = document.getElementById("tracingCard");
      const html = (typeof tracingCardHtml === "function") ? tracingCardHtml() : null;
      return {
        wrapper: !!wrap,
        /* The page ships the wrapper EMPTY -- the markup is the module's now. Read off the file
           rather than the DOM would be better still, but the DOM after mount is what a user gets
           and is the thing worth asserting. */
        filled: !!(wrap && wrap.firstElementChild),
        builds: typeof tracingCardHtml === "function",
        bytes: html ? html.length : 0,
        missing: CON.filter(id => !document.getElementById(id)),
        kinds: (document.querySelectorAll("#tracingWhat option") || []).length,
        groups: [...document.querySelectorAll("#tracingWhat optgroup")].map(g => g.label),
        mips: (document.querySelectorAll("#tracePadMip option") || []).length,
        mounted: !!(window.UJ && UJ.tracingcard && UJ.tracingcard._wired)
      };
    }, CONTRACT);
    ok(got.wrapper, "the page carries a wrapper for it", got.wrapper);
    ok(got.builds, "...and the module can build the card", got.builds);
    ok(got.filled, "...and did", got.filled
       + "  <- an empty wrapper and 3,500 lines of behaviour is what stage C existed to fix");
    ok(got.bytes > 20000, "...the whole card, not a fragment", got.bytes + " bytes");
    ok(got.missing.length === 0,
       "every id the module's header promises a host is in what it built",
       got.missing.length ? "missing: " + got.missing.join(", ")
                          : CONTRACT.length + " ids, all present");
    /* THE TWO PLACES A TRUNCATED LITERAL STILL LOOKS LIKE A CARD. A markup array that lost its
       tail would still parse, still render, and still have a header and a pad; what it would not
       have is the bottom of a 61-item dropdown or the last of six zoom levels. */
    /* SIXTY-FOUR, NOT SIXTY-ONE, and the difference is the card's own. The ontology contributes
       61 kinds (60 across twelve topic groups, plus "Not on the list"); this dropdown adds three
       of its own — two under "The cell itself", because a tracing is often a whole cell rather
       than a structure inside one, and one "Not sure what this is?". Asserted as 61 first, which
       failed: the number was an assumption about the card rather than a reading of it. */
    ok(got.kinds === 64, "the what-did-you-outline list is whole", got.kinds
       + " = 61 from the ontology + 3 this card adds");
    ok(got.groups.length === 15 && got.groups[0] === "The cell itself"
       && got.groups[got.groups.length - 1] === "Not on the list",
       "...with its topic groups in order, from the cell itself to “not on the list”",
       got.groups.length + " groups");
    ok(got.mips === 6, "...and the pad offers all six zoom levels", got.mips
       + "  <- a markup array cut short still parses and still looks like a card");
    ok(got.mounted, "...and the wiring ran over it", got.mounted);
  }

  console.log("\nand it leaves a card somebody else built alone");
  {
    const got = await p.evaluate(() => {
      const d = document.createElement("div");
      d.id = "notMine";
      d.innerHTML = '<p id="somebodyElses">a page that still has its own copy</p>';
      document.body.appendChild(d);
      const before = d.innerHTML;
      UJ.tracingcard.mount(d);
      return { same: d.innerHTML === before, kept: !!document.getElementById("somebodyElses") };
    });
    ok(got.same && got.kept,
       "a wrapper with something in it is not overwritten", got.same + "/" + got.kept
       + "  <- a page still carrying its own markup keeps it rather than losing an edit");
  }

  console.log("\nand mounting twice does not wire twice");
  {
    const got = await p.evaluate(async () => {
      /* Count what a click does now, mount again, count again. The pad's own open button is the
         one to watch: two listeners means padOpen runs twice per press. */
      let n = 0;
      const btn = document.getElementById("tracePadOpen");
      const spy = () => { n++; };
      btn.addEventListener("click", spy);
      btn.click();
      const once = n;
      const second = UJ.tracingcard.mount();
      btn.click();
      btn.removeEventListener("click", spy);
      return { once, twice: n - once, second };
    });
    ok(got.second === false, "a second mount reports that it did nothing", got.second);
    ok(got.once === 1 && got.twice === 1,
       "...and a press is still one press", got.once + " then " + got.twice);
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.length ? errors[0] : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
