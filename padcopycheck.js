/* The pad says it is loading, zooms from the keyboard, and lends a contour.           2026-10-06

   Søren, three asks in one breath: *"When the tracing pad is loading there should be a loading
   icon, or else it is difficult to know whether to wait or draw. We should also be able to zoom in
   or out with + or -. Also, if there is a tracing already and we want to copy that to the layer we
   are tracing, it should be added with ctrl+shift+left click."*

   THE WAIT WAS SAID AND NOT SHOWN. The pad deliberately keeps the PREVIOUS section on the canvas
   while the next one fetches, so while it loads the picture is of somewhere you are not — and the
   only thing that said so was one line in a status row that also carries the contour count, the
   last move and every error.

   THE COPY GOES BEFORE padErase IN pointerdown, which on a PC is ctrl alone: without that ordering
   the gesture would delete the contour it was asking for a copy of. That ordering is what the third
   section here is really about.

   Run: node padcopycheck.js [page.html]      (default ujump.html) */
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
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(3500);

  console.log("while the section is loading");
  {
    const r = await p.evaluate(() => {
      const out = {};
      document.getElementById("tracingPanel").open = true;
      document.getElementById("tracePadWrap").style.display = "";
      const el = document.getElementById("tracePadBusy");
      out.exists = !!el;
      if (!el) return out;
      /* OVER THE CANVAS, not beside it: the pad's parent is already position:relative because the
         pan buttons live in its corner, so this is inset:0 on the same box. */
      const cv = document.getElementById("tracePad");
      out.sameBox = el.parentElement === cv.parentElement;
      out.hiddenAtRest = getComputedStyle(el).display === "none";
      padBusy(true, "Loading the section… 12/40");
      out.shown = getComputedStyle(el).display !== "none";
      out.says = el.textContent.trim();
      out.cursor = cv.style.cursor;
      /* A cover that swallowed clicks would be a cover that loses the first vertex of every
         contour drawn the moment a section lands. */
      out.clickThrough = getComputedStyle(el).pointerEvents === "none";
      out.spins = !!el.querySelector("span[style*='padspin']");
      padBusy(false);
      out.gone = getComputedStyle(el).display === "none";
      out.cursorBack = cv.style.cursor;
      return out;
    });
    ok(r.exists && r.sameBox, "there is a cover over the pad, in the canvas' own box", String(r.sameBox));
    ok(r.hiddenAtRest, "...down when there is nothing to wait for");
    ok(r.shown && /12\/40/.test(r.says || ""),
       "...up while it loads, carrying the tile count padDraw was already computing", r.says);
    ok(r.spins, "...with something that turns, so it reads as waiting rather than as an error");
    ok(r.cursor === "progress" && r.cursorBack === "crosshair",
       "...and the cursor over the pad says the same thing", r.cursor + " -> " + r.cursorBack);
    ok(r.clickThrough,
       "...but it does not eat the pointer — a cover that swallowed clicks would lose the first "
       + "vertex of every contour drawn the moment a section lands",
       "pointer-events: none");
    ok(r.gone, "...and it comes down again");
  }

  console.log("\nand + and - step the zoom");
  {
    const r = await p.evaluate(() => {
      const out = {};
      const sel = document.getElementById("tracePadMip");
      out.n = sel.options.length;
      let drew = 0;
      const real = window.padDraw;
      window.padDraw = function(){ drew++; };          // the fetch is not what is under test
      sel.selectedIndex = 2;
      padZoomStep(1);  out.inAt = sel.selectedIndex;
      padZoomStep(-1); out.outAt = sel.selectedIndex;
      out.drew = drew;
      /* THE ENDS HOLD. A key that walked off the end of the menu would be a key that silently did
         nothing on the view somebody uses most. */
      sel.selectedIndex = 0;            padZoomStep(-1); out.widest = sel.selectedIndex;
      out.saidWide = (document.getElementById("tracePadSay") || {}).textContent || "";
      sel.selectedIndex = out.n - 1;    padZoomStep(1);  out.closest = sel.selectedIndex;
      out.saidClose = (document.getElementById("tracePadSay") || {}).textContent || "";
      window.padDraw = real;
      return out;
    });
    ok(r.n > 2 && r.inAt === 3 && r.outAt === 2,
       "+ goes one step in, - one step back out — the menu runs widest-first, so + is down it",
       "2 -> " + r.inAt + " -> " + r.outAt + " of " + r.n);
    ok(r.drew === 2,
       "...each through the menu's OWN change event, so the one place that redraws stays one place",
       r.drew + " redraws for 2 presses");
    ok(r.widest === 0 && /as wide as/i.test(r.saidWide),
       "...and it stops at the widest rather than walking off the end, out loud",
       JSON.stringify((r.saidWide || "").slice(0, 60)));
    ok(r.closest === r.n - 1 && /as close as/i.test(r.saidClose),
       "...and at the closest", JSON.stringify((r.saidClose || "").slice(0, 60)));
  }

  /* AND THE KEYS THEMSELVES, not just the function behind them. The first version of this check
     called padZoomStep() directly and went green in a red run with the binding removed — which
     is a check that cannot see the thing it is for. 2026-10-06. */
  {
    const r = await p.evaluate(() => {
      const out = {};
      const sel = document.getElementById("tracePadMip");
      let drew = 0;
      const real = window.padDraw; window.padDraw = function(){ drew++; };
      sel.selectedIndex = 2;
      const key = (k) => document.dispatchEvent(
        new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
      key("+"); out.plus = sel.selectedIndex;
      key("-"); out.minus = sel.selectedIndex;
      key("="); out.eq = sel.selectedIndex;
      /* AND NOT WHILE SOMEBODY IS TYPING. The zoom menu is a SELECT, and a - typed into the
         structure's name box must reach the box. */
      const nm = document.getElementById("tracingName");
      nm.focus();
      nm.dispatchEvent(new KeyboardEvent("keydown", { key: "-", bubbles: true, cancelable: true }));
      out.whileTyping = sel.selectedIndex;
      nm.blur();
      out.drew = drew;
      window.padDraw = real;
      return out;
    });
    ok(r.plus === 3 && r.minus === 2 && r.eq === 3,
       "...and the KEYS are bound, + and - and the unshifted = under +",
       "2 -> " + r.plus + " -> " + r.minus + " -> " + r.eq);
    ok(r.whileTyping === 3,
       "...but not while somebody is typing in a box — a - in the structure's name must reach "
       + "the name", "still " + r.whileTyping);
  }

  console.log("\nand a contour can be lent to the structure you are drawing");
  {
    const r = await p.evaluate(() => {
      const out = {};
      /* His pad: a nucleus opened from the dataset at number 1, a whole cell being drawn at
         number 2, both on the same section. */
      PAD = UJ.tracepad.create();
      const ring = (z, inst, d) => ({ z: z, inst: inst,
        points: [[9000-d, 9000-d], [9000+d, 9000-d], [9000+d, 9000+d], [9000-d, 9000+d]] });
      PAD.rings = [ring(1941, 0, 200), ring(1941, 1, 900)];
      PAD.z = 1941; PAD.inst = 1;
      /* A view that maps pixels to tool voxels one-for-one, so a click at (9000, 8800) lands on
         the nucleus' top edge. The real one comes from emtiles, which needs the network. */
      PAD_VIEW = { w: 560, h: 460, pxPerToolVoxel: 1,
                   toolAt: function(x, y){ return [x, y]; },
                   pxAt: function(t){ return [t[0], t[1]]; } };
      const at = (x, y, mods) => Object.assign({ offsetX: x, offsetY: y, button: 0,
        ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }, mods || {});

      padCopyContourAt(at(9000, 8800));          // the nucleus' top edge
      out.after = PAD.rings.length;
      const made = PAD.rings[PAD.rings.length - 1];
      out.mineNow = made.inst;
      out.z = made.z;
      out.points = JSON.stringify(made.points);
      out.sameAsSource = JSON.stringify(made.points) === JSON.stringify(PAD.rings[0].points);
      /* AND NOT THE SAME ARRAY. A copy sharing its points with the contour it came from is one
         contour wearing two labels: drag a vertex of either and both move. */
      made.points[0][0] += 7;
      out.sourceUnmoved = PAD.rings[0].points[0][0] === 8800;
      made.points[0][0] -= 7;
      out.said = (document.getElementById("tracePadSay") || {}).textContent || "";

      /* Its own contour is refused: a duplicate ring in one structure is two identical outlines
         the volume integrates twice. */
      const n0 = PAD.rings.length;
      padCopyContourAt(at(8100, 9000));          // number 2's own left edge
      out.refusedSelf = PAD.rings.length === n0;
      out.saidSelf = (document.getElementById("tracePadSay") || {}).textContent || "";

      /* And empty canvas says what the gesture is for rather than doing nothing. */
      padCopyContourAt(at(100, 100));
      out.refusedEmpty = PAD.rings.length === n0;
      out.saidEmpty = (document.getElementById("tracePadSay") || {}).textContent || "";
      return out;
    });
    ok(r.after === 3 && r.mineNow === 1 && r.z === 1941,
       "ctrl+shift+click on another number's contour puts a copy on the one you are drawing, on "
       + "this section",
       r.after + " contours, the new one on number " + (r.mineNow + 1) + " at z " + r.z);
    ok(r.sameAsSource, "...with its points, not an approximation of them", r.points);
    ok(r.sourceUnmoved,
       "...and its OWN points — a copy sharing an array with its source is one contour wearing two "
       + "labels, and dragging either moves both",
       String(r.sourceUnmoved));
    ok(/Copied/.test(r.said) && /number 1/.test(r.said) && /number 2/.test(r.said),
       "...and says which number it came from and which it went to", r.said.slice(0, 110));
    ok(r.refusedSelf && /already part of number 2/.test(r.saidSelf),
       "...while its own contour is refused, because a duplicate ring is one outline integrated "
       + "twice", r.saidSelf.slice(0, 90));
    ok(r.refusedEmpty && /Nothing to copy/.test(r.saidEmpty),
       "...and empty canvas says what the gesture is for rather than doing nothing",
       r.saidEmpty.slice(0, 90));
  }

  console.log("\nand the gesture reaches it");
  {
    /* THROUGH REAL POINTER EVENTS, because the ordering inside pointerdown is the whole point:
       padErase is ctrl alone on a PC and would delete the contour instead of copying it. */
    const r = await p.evaluate(() => {
      const out = {};
      PAD = UJ.tracepad.create();
      const ring = (z, inst, d) => ({ z: z, inst: inst,
        points: [[9000-d, 9000-d], [9000+d, 9000-d], [9000+d, 9000+d], [9000-d, 9000+d]] });
      PAD.rings = [ring(1941, 0, 200), ring(1941, 1, 900)];
      PAD.z = 1941; PAD.inst = 1;
      PAD_VIEW = { w: 560, h: 460, pxPerToolVoxel: 1,
                   toolAt: function(x, y){ return [x, y]; },
                   pxAt: function(t){ return [t[0], t[1]]; } };
      const cv = document.getElementById("tracePad");
      const fire = (mods) => {
        const ev = new PointerEvent("pointerdown", Object.assign({ bubbles: true, button: 0,
          buttons: 1, pointerId: 1, pointerType: "mouse" }, mods));
        Object.defineProperty(ev, "offsetX", { value: 9000 });
        Object.defineProperty(ev, "offsetY", { value: 8800 });
        cv.dispatchEvent(ev);
      };
      const n0 = PAD.rings.length;
      fire({ ctrlKey: true, shiftKey: true, metaKey: true });   // one gesture, either platform
      out.copied = PAD.rings.length - n0;
      out.onMine = (PAD.rings[PAD.rings.length - 1] || {}).inst;

      /* AND THE ERASE IT SITS IN FRONT OF STILL WORKS. Without shift, the same modifier still
         takes the whole contour away — which is what it has always done. */
      const n1 = PAD.rings.length;
      fire({ ctrlKey: true, metaKey: true });
      out.erased = n1 - PAD.rings.length;
      return out;
    });
    ok(r.copied === 1 && r.onMine === 1,
       "a real ctrl+shift+pointerdown copies, rather than being eaten by the whole-contour remove "
       + "it sits in front of",
       r.copied + " copied, onto number " + (r.onMine + 1));
    ok(r.erased === 1,
       "...and without shift the same modifier still removes the whole contour, as it always has",
       r.erased + " removed");
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.slice(0, 2).join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
