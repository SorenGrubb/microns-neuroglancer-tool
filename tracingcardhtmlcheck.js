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

  /* ── WHAT THE HOST'S DATASET CAN AND CANNOT HONOUR ───────────────────────  2026-09-20
     One piece of markup now serves five datasets, and two of its ticks need volumes only some of
     them have: #tracePadSeg paints a segmentation, #tracePadGhosts fetches meshes. minnie65 has
     both and µJump must keep both — this is the half of the rule that a "remove it" edit gets
     wrong by removing too much. The λJump half (both gone, because Lee16 is image only) is in
     emljumpcheck.js, against the real page. */
  console.log("\nand it keeps the controls minnie65 can honour");
  {
    const got = await p.evaluate(() => ({
      seg: !!document.getElementById("tracePadSeg"),
      say: !!document.getElementById("tracePadSegSay"),
      ghosts: !!document.getElementById("tracePadGhosts"),
      hasSeg: !!(tracingSources() || {}).seg,
      hasMesh: !!(window.UJ && UJ.cfg && UJ.cfg.mesh &&
                  (UJ.cfg.mesh.meshBase || UJ.cfg.mesh.meshBaseAlt))
    }));
    ok(got.hasSeg && got.seg && got.say,
       "µJump has a segmentation, so the tick that paints it stays",
       "source " + got.hasSeg + ", tick " + got.seg + ", its status line " + got.say);
    ok(got.hasMesh && got.ghosts,
       "...and it has meshes, so the see-through cell stays too",
       "meshBase " + got.hasMesh + ", tick " + got.ghosts);
  }

  /* ── µJUMP'S OWN CONTRAST, NOW BY INSTRUCTION RATHER THAN BY LUCK ────  2026-09-20
     Søren, on λJump: *"The contrast of the lJump tracing window is totally off."* The pad's
     drawSection call passed no window at all, so every dataset got emtiles' default — 86/172,
     minnie65's numbers. µJump's own EM_WINDOW IS 86/172, so its pad had always been right for the
     wrong reason, and nothing on this page could ever have revealed the fault.

     What is asserted here is that µJump's picture did not move: the card reads 86/172 off this
     page, and the pad asks for the same two numbers it was silently getting before. */
  console.log("\nand µJump's own window is what µJump's pad asks for");
  {
    const got = await p.evaluate(() => ({
      fn: (typeof tracingWindow === "function") ? tracingWindow() : null,
      page: (typeof EM_WINDOW !== "undefined") ? EM_WINDOW : null,
      dflt: { lo: 86, hi: 172 }
    }));
    ok(got.fn && got.page && got.fn.lo === got.page.lo && got.fn.hi === got.page.hi,
       "the card reads this page's window", JSON.stringify(got.fn));
    ok(got.fn && got.fn.lo === 86 && got.fn.hi === 172,
       "...which for minnie65 is emtiles' own default, unchanged",
       JSON.stringify(got.fn)
       + "  <- which is why the missing window was invisible here for three days");
  }

  console.log("\nand a host with neither gets neither");
  {
    /* The same module, the same markup, a host that has less. Built into a DETACHED wrapper: it is
       never appended, so its ids do not collide with the page's own card. Appending it first was
       the first attempt and it silently measured the wrong card — `d.querySelectorAll("#x y")`
       resolves `#x` against the document and then filters to descendants of d, so a duplicated id
       returns nothing at all rather than the copy inside d. The config is put back either way. */
    const got = await p.evaluate(() => {
      const keepMesh = UJ.cfg.mesh, keepTracing = UJ.cfg.tracing;
      UJ.cfg.mesh = null;
      UJ.cfg.tracing = Object.assign({}, keepTracing,
                                     { sources: function(){ return { em: "precomputed://x" }; } });
      const d = document.createElement("div");
      let r;
      try {
        UJ.tracingcard.mount(d);
        r = {
          seg: !!d.querySelector("#tracePadSeg"),
          say: !!d.querySelector("#tracePadSegSay"),
          ghosts: !!d.querySelector("#tracePadGhosts"),
          /* THE SAME TICK EXISTS TWICE. #tracingPasteGhosts is the pasted-contours side of the
             card and needs the same meshes; removing only the pad's leaves the page offering a
             feature it cannot perform. Found by this assertion, not by reading. */
          pasteGhosts: !!d.querySelector("#tracingPasteGhosts"),
          /* the words, not only the box: each tick is an <input> inside its own <label>, and the
             help table has a sentence describing the ghosts as well */
          segWords: /show the segmentation/.test(d.textContent),
          ghostWords: /see-through/.test(d.textContent),
          pen: !!d.querySelector("#tracePadPen"),
          pad: !!d.querySelector("#tracePad"),
          /* THE DROPDOWN IS PRESENT AND EMPTY, AND THAT IS CORRECT. Its 64 kinds are put in by
             wireTracing() from the ontology, not by the markup — and wire() runs once per page,
             so this second, throwaway card is never filled. Asserted as "the select survived the
             trim", which is what this section is about; the 64 kinds are asserted further up,
             on the real card. Counting options here failed twice before the reason was read. */
          whatSelect: [...d.getElementsByTagName("select")].some(s => s.id === "tracingWhat"),
          mipSelect: [...d.getElementsByTagName("select")].some(s => s.id === "tracePadMip")
        };
      } finally {
        UJ.cfg.mesh = keepMesh; UJ.cfg.tracing = keepTracing;
      }
      return r;
    });
    ok(!got.seg && !got.say && !got.segWords,
       "no segmentation means no tick and no words for it",
       "tick " + got.seg + ", status line " + got.say + ", label text " + got.segWords
       + "  <- the input is inside its label; removing only the box leaves the words behind");
    ok(!got.ghosts && !got.pasteGhosts && !got.ghostWords,
       "no meshes means no see-through cell, on either side of the card",
       "pad tick " + got.ghosts + ", paste tick " + got.pasteGhosts
       + ", any wording left " + got.ghostWords
       + "  <- the ghost control is two ticks and a line of help, not one tick");
    ok(got.pen && got.pad && got.whatSelect && got.mipSelect,
       "...and nothing else was taken with them",
       "pen " + got.pen + ", pad " + got.pad + ", what-is-it " + got.whatSelect
       + ", zoom menu " + got.mipSelect);
  }

  /* ── THE ZOOM MENU IS ARITHMETIC, AND HERE IS THE ARITHMETIC ──────────────  2026-09-20
     The six labels ("18 µm across — 32 nm data") were typed for minnie65 on 2026-09-17. They are
     now computed from whatever volume the host points at. THE EVIDENCE THAT THE CALCULATION IS
     THE SAME CALCULATION is that, fed minnie65's scales, it reproduces the typed strings exactly
     — including the decimals, which were chosen by hand.

     Driven from a stubbed UJ.emtiles rather than the network: the sandbox has no egress, and this
     is arithmetic, not a fetch. Both volumes are the ones measured off the buckets on 2026-09-20
     (claude/which-datasets-can-be-traced-on.md). */
  console.log("\nand the pad's zoom levels are computed, not tabulated");
  {
    const TYPED = [
      "18 µm — 32 nm data, slower to load",
      "9 µm — 16 nm data, a whole cell",
      "4.5 µm — 8 nm data, full detail",
      "2.2 µm — 8 nm data, drawn 2×",
      "1.1 µm — 8 nm data, drawn 4×",
      "0.6 µm — 8 nm data, drawn 8× (an organelle)"
    ];
    const got = await p.evaluate(async () => {
      const real = UJ.emtiles;
      const stub = list => ({
        configured: () => true, configure: () => {},
        scaleAt: async m => ({ scale: list[Math.min(list.length - 1, m)] })
      });
      /* minnie65: three scales keep 40 nm z, and the chunk halves in width at the coarsest —
         which is the whole reason the widest level is slower. */
      const MINNIE = [
        { resolution: [8, 8, 40],   chunk_sizes: [[128, 128, 32]] },
        { resolution: [16, 16, 40], chunk_sizes: [[128, 128, 32]] },
        { resolution: [32, 32, 40], chunk_sizes: [[64, 64, 64]] }
      ];
      /* Lee16: ten scales, all 40 nm z, all chunked 512×512×16 — nothing gets slower. */
      const LEE = [0, 1, 2, 3].map(i => ({ resolution: [4 << i, 4 << i, 40],
                                           chunk_sizes: [[512, 512, 16]] }));
      /* The 1:1-and-closer levels. Above them since 2026-09-22 sits the widest drawn at half size
         (src/the_pad_can_draw_half_size.py), checked on its own below. */
      const read = () => [...document.querySelectorAll("#tracePadMip option")]
                           .filter(o => !/:0\.5$/.test(o.value)).map(o => o.textContent);
      const top = () => { const o = document.querySelector("#tracePadMip option"); return o.value + " " + o.textContent; };
      UJ.emtiles = stub(MINNIE);
      await padRelabelMips();
      const minnie = read(), minnieTop = top();
      UJ.emtiles = stub(LEE);
      await padRelabelMips();
      const lee = read(), leeTop = top();
      UJ.emtiles = real;
      return { minnie, lee, minnieTop, leeTop };
    });
    const same = got.minnie.every((s, i) => s === TYPED[i]);
    ok(same, "fed minnie65's scales it reproduces the hand-written labels exactly",
       same ? "all six" : got.minnie.find((s, i) => s !== TYPED[i]) + "  <- expected "
              + TYPED[got.minnie.findIndex((s, i) => s !== TYPED[i])]);
    ok(got.minnieTop === "2:0.5 36 µm across — 32 nm data, drawn half size",
       "above them, the widest level drawn at half size", got.minnieTop);
    ok(got.lee[0] === "9 µm — 16 nm data" && got.lee[1] === "4.5 µm — 8 nm data, a whole cell"
       && got.lee[2] === "2.2 µm — 4 nm data, full detail",
       "...and fed Lee16's it says Lee16's numbers", got.lee.slice(0, 3).join(" | ")
       + "  <- one scale finer, so the same mip is half the width and half the nanometres");
    ok(!/slower to load/.test(got.lee[0]) && /slower to load/.test(got.minnie[0]),
       "...and the warning about chunk counts goes only where it is true",
       "minnie65 chunks 64 px at 32 nm against 128 at 16; Lee16 chunks 512 at every scale");
    ok(got.lee.every(s => /µm/.test(s)) && got.lee.length === 6,
       "...with the tails that say what a level is FOR left alone", got.lee[5]);
  }

  /* ── AND IT SURVIVES BEING RUN AGAIN ──────────────────────  2026-09-20
     Since 2026-09-20 padRelabelMips runs on every draw, not only at mount, so the menu can
     describe the pad's real width rather than the 560 the markup gives it. That makes idempotency
     a requirement rather than a nicety — and it was not true: the regex matched `\d+ nm data`,
     which matches minnie65's 16 and 32 and NOT V1DD's 19.4. On V1DD it replaced once, put a
     decimal in the string, and then silently never matched again. The menu kept saying 11 µm
     beside a caption saying 13.9. */
  console.log("\nand relabelling twice says the same thing twice");
  {
    const got = await p.evaluate(async () => {
      const real = UJ.emtiles;
      const stub = list => ({ configured: () => true, configure: () => {},
        scaleAt: async m => ({ scale: list[Math.min(list.length - 1, m)] }) });
      /* V1DD: fractional nanometres, which is the case that broke it. */
      const V1DD = [9.7, 19.4, 38.8, 77.6].map(r => ({ resolution: [r, r, 45],
                                                       chunk_sizes: [[64, 64, 64]] }));
      const read = () => [...document.querySelectorAll("#tracePadMip option")]
                           .filter(o => !/:0\.5$/.test(o.value)).map(o => o.textContent);
      UJ.emtiles = stub(V1DD);
      await padRelabelMips(); const once = read();
      await padRelabelMips(); const twice = read();
      await padRelabelMips(); const thrice = read();
      UJ.emtiles = real;
      return { once, twice, thrice };
    });
    ok(got.once.join("|") === got.twice.join("|") && got.twice.join("|") === got.thrice.join("|"),
       "three relabels of a fractional-nm volume give one answer",
       got.once[1] + "  →  " + got.twice[1] + "  →  " + got.thrice[1]);
    ok(/19\.4 nm data/.test(got.thrice[1] || ""),
       "...and it is still the volume's own number after all three", got.thrice[1]);
  }

  /* ── WHAT THE CARD SAYS IT IS FOR ───────────────────────  2026-09-20
     "For a cell the segmentation does not have" is minnie65's situation, and a precise one. The
     ticks beside it already read from the host; this sentence did not, so a card that had
     correctly removed its segmentation tick still opened by talking about a segmentation. */
  console.log("\nand µJump's opening sentence is unchanged");
  {
    const got = await p.evaluate(() => ({
      fn: typeof tracingIntro === "function" ? tracingIntro() : null,
      shown: (document.querySelector("#tracingCard p.hint") || {}).textContent || ""
    }));
    ok(got.fn === "For a cell the segmentation does not have.",
       "the default is minnie65's sentence, because minnie65 is what it describes", got.fn);
    ok(got.shown.indexOf(got.fn) === 0, "...and it is what the card opens with",
       got.shown.slice(0, 60));
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.length ? errors[0] : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
