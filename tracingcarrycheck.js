/* Moving to another coordinate must not throw the tracing away.                     2026-09-19

   Søren: *"I saved a draft of 3 lysosomes in a microglia cell. I then moved to another coordinate
   to continue segmenting, but then the drawing number started over and it looks like this. Can I
   append this extra new drawing to the 3 others, or will I lose something? If I click Look at it in
   Neuroglancer now, nothing happens."* — and then: *"add it to the dataset also does nothing."*

   He had already lost them. Reproduced headless before anything was changed:

     after Use:      pending rings = 48, #tracingFound shown = true
     draft saved:    48 contours, used=true
     after padOpen:  TRACING_PENDING = null, PAD.inst = 0, #tracingFound still shown = true
     draft NOW:      0 contours

   THREE FAULTS, AND THIS CHECK IS ORDERED BY HOW MUCH DAMAGE THEY DID.

   1. draftSave's guard against overwriting a kept draft was `!rings && !pending && !used`, and
      `used` only means "the naming block is showing" — which padOpen leaves showing. So an empty
      pad wrote itself over forty-eight contours. The guard belonged on the DRAFT, not the pad, and
      that is what is asserted here: an empty pad never reduces kept work to nothing, automatic save
      or explicit press.
   2. padOpen replaced the pad and nulled TRACING_PENDING unconditionally. With work in hand it now
      moves instead, and starts the next free number — which is the appending he asked for.
   3. Everything the card was showing about that tracing stayed on screen afterwards, three volume
      lines and all, with both buttons under it failing in silence.

   Nothing here touches the network.

   Run: node tracingcarrycheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* His tracing, in shape if not in detail: three structures, 20 / 9 / 19 sections, which are the
   section counts his own card was showing when he asked. */
const BUILD = `(function(){
  const circ = (cx, cy, r, n) => { const o = [];
    for (let i = 0; i < n; i++){ const a = 2*Math.PI*i/n; o.push([cx + r*Math.cos(a), cy + r*Math.sin(a)]); }
    return o; };
  document.getElementById("tracingPanel").open = true;
  document.getElementById("tracingX").value = "295857";
  document.getElementById("tracingY").value = "151338";
  document.getElementById("tracingZ").value = "17852";
  PAD = UJ.tracepad.create(17852);
  PAD.rings = [];
  [[0, 20, 60], [1, 9, 30], [2, 19, 45]].forEach(function(t){
    for (let k = 0; k < t[1]; k++)
      PAD.rings.push({ z: 17852 + k*3, inst: t[0], points: circ(1000 + t[0]*400, 2000, t[2], 16) });
  });
  PAD.inst = 2;
  document.getElementById("tracePadWrap").style.display = "";
  document.getElementById("tracePadUse").click();
})()`;

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 900, height: 1200 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**script.google.com/**", r => r.abort());
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**storage.googleapis.com/**", r => r.abort());
  await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  console.log("a save never reduces kept work to nothing");
  {
    const got = await p.evaluate(async ([build]) => {
      localStorage.removeItem("ujump_tracing_drafts_v2");
      localStorage.removeItem("ujump_tracing_draft_v1");
      // eslint-disable-next-line no-eval
      eval(build);
      await new Promise(r => setTimeout(r, 200));
      draftSave(true);
      const kept = draftRead();
      /* THE EXACT STATE THAT DID THE DAMAGE: an empty pad with the naming block still showing, so
         `used` is true and the old guard let it through. */
      PAD = UJ.tracepad.create(17900);
      const used = document.getElementById("tracingFound").style.display !== "none";
      const said = document.getElementById("tracePadSay");
      said.textContent = "";
      draftSave(true);                                  // the explicit press
      const afterPress = draftRead();
      const msg = said.textContent;
      draftSoon();                                      // and the automatic one
      await new Promise(r => setTimeout(r, 1800));
      const afterAuto = draftRead();
      return { kept: kept ? kept.rings.length : 0, used: used,
               afterPress: afterPress ? afterPress.rings.length : 0,
               afterAuto: afterAuto ? afterAuto.rings.length : 0, msg: msg };
    }, [BUILD]);
    ok(got.kept === 48, "forty-eight contours are kept as a draft", got.kept);
    ok(got.used === true,
       "...with the naming block showing, which is what made `used` true and let the empty pad in",
       "used: " + got.used);
    ok(got.afterPress === 48,
       "pressing Save draft on an EMPTY pad leaves the kept draft alone", got.afterPress + " kept");
    ok(/left alone/.test(got.msg), "...and says so rather than appearing to have saved",
       JSON.stringify(got.msg.slice(0, 90)));
    ok(got.afterAuto === 48,
       "...and the automatic save does not quietly do it either", got.afterAuto + " kept");
  }

  console.log("\nmoving to another coordinate brings the work with you");
  {
    const got = await p.evaluate(async ([build]) => {
      localStorage.removeItem("ujump_tracing_drafts_v2");
      localStorage.removeItem("ujump_tracing_draft_v1");
      // eslint-disable-next-line no-eval
      eval(build);
      await new Promise(r => setTimeout(r, 200));
      const before = { rings: PAD.rings.length, inst: PAD.inst,
                       pending: (TRACING_PENDING || {}).rings.length };
      document.getElementById("tracingZ").value = "17900";
      const said = document.getElementById("tracePadSay");
      said.textContent = "";
      padOpen();
      await new Promise(r => setTimeout(r, 300));
      return { before: before, rings: PAD.rings.length, inst: PAD.inst, z: PAD.z,
               pending: ((TRACING_PENDING || {}).rings || []).length,
               insts: UJ.tracepad.instances(PAD).map(function(i){ return i.inst; }),
               withContours: UJ.tracepad.instances(PAD)
                 .filter(function(i){ return i.contours; }).map(function(i){ return i.inst; }),
               sayNext: typeof PAD_SAY_NEXT === "string" ? PAD_SAY_NEXT : "(absent)",
               msg: said.textContent };
    }, [BUILD]);
    ok(got.rings === 48, "the forty-eight contours are still on the pad", got.rings);
    ok(got.inst === 3,
       "...and the next thing drawn is number 4, appended to the three — not number 1 again",
       "PAD.inst " + got.before.inst + " -> " + got.inst);
    ok(got.z === 17900, "...at the section that was typed", got.z);
    ok(got.pending === 48,
       "...with the pending tracing intact, which is what the two buttons work from", got.pending);
    /* 0,1,2 have contours and 3 is the empty one the strip now offers — the same shape pressing
       "Another one" has always produced. */
    ok(got.withContours.join(",") === "0,1,2" && got.insts.join(",") === "0,1,2,3",
       "...the three structures are still three, with a fourth standing ready",
       got.insts.join(",") + " (" + got.withContours.join(",") + " have contours)");
    /* The pad's own line, which padDraw writes when the section lands. In this check there is no
       network, so padDraw ends in its error branch and spends the note UNSAID — which is the
       behaviour that matters most here: a note about a move that did not finish must not turn up
       appended to the next section that does. Both halves are asserted. */
    ok(got.msg.indexOf("came with you") < 0 && /Could not read the EM/.test(got.msg),
       "...and with no EM to draw, the move note is spent rather than burying the error",
       JSON.stringify(got.msg.slice(0, 60)));
    ok(got.sayNext === "",
       "...spent, not carried over to the next section that does draw", JSON.stringify(got.sayNext));
  }

  console.log("\n...and when the section does land, the note is said once");
  {
    /* THE OTHER HALF, with drawSection stubbed so padDraw takes its success branch. The stub is the
       check's own and says so: what is under test is that the note reaches padSay's conclusion and
       is spent there, which no amount of reading the source would establish. */
    const got = await p.evaluate(async ([build]) => {
      // eslint-disable-next-line no-eval
      eval(build);
      await new Promise(r => setTimeout(r, 200));
      const real = UJ.emtiles.drawSection;
      UJ.emtiles.drawSection = async function(cv){
        cv.width = 200; cv.height = 120;
        return { pxAt: function(t){ return [t[0] / 40, t[1] / 40]; }, pxPerToolVoxel: 0.025,
                 z: PAD.z, nmPerPx: 8, effNmPerPx: 8, umAcross: 1.6, mip: 0, mips: 1,
                 sectionNm: 40, slab: 1, lo: 86, hi: 172, windowAsked: [86, 172], w: 200, h: 120 };
      };
      document.getElementById("tracingZ").value = "17920";
      padOpen();
      await new Promise(r => setTimeout(r, 500));
      const first = document.getElementById("tracePadSay").textContent;
      /* Draw the same section again: the note must not come back a second time. */
      await padDraw();
      await new Promise(r => setTimeout(r, 200));
      const second = document.getElementById("tracePadSay").textContent;
      UJ.emtiles.drawSection = real;
      return { first: first, second: second,
               sayNext: typeof PAD_SAY_NEXT === "string" ? PAD_SAY_NEXT : "(absent)" };
    }, [BUILD]);
    ok(/came with you/.test(got.first) && /number 4/.test(got.first),
       "the move note arrives with the section, appended to what the pad already reports",
       JSON.stringify(got.first.slice(0, 120)));
    ok(/48 contour/.test(got.first),
       "...without displacing the count the pad has always given", JSON.stringify(got.first.slice(0, 40)));
    ok(got.second.indexOf("came with you") < 0 && got.sayNext === "",
       "...and it is said ONCE, not on every section drawn after it",
       JSON.stringify(got.second.slice(0, 60)));
  }

  console.log("\n...including contours that came off a pasted link");
  {
    const got = await p.evaluate(async () => {
      /* NULL-GUARDED so an old page reports FAILs rather than throwing. */
      PAD = null;
      if (typeof tracingPendingClear === "function") tracingPendingClear(); else TRACING_PENDING = null;
      TRACING_PENDING = { groups: null, rings: [0, 1].map(function(k){
        return { z: 17852 + k * 3, inst: 0,
                 points: [[1000, 2000], [1060, 2000], [1030, 2060]] }; }) };
      document.getElementById("tracingZ").value = "17950";
      padOpen();
      await new Promise(r => setTimeout(r, 300));
      return { rings: PAD ? PAD.rings.length : 0, inst: PAD ? PAD.inst : -1 };
    });
    ok(got.rings === 2 && got.inst === 1,
       "a pasted tracing is adopted by the pad rather than dropped on the floor",
       got.rings + " contours, next number " + (got.inst + 1));
  }

  console.log("\nand with nothing in hand the card stops describing what is gone");
  {
    const got = await p.evaluate(async () => {
      PAD = null;
      TRACING_PENDING = { rings: [{ z: 1, inst: 0, points: [[0, 0], [10, 0], [10, 10]] }] };
      document.getElementById("tracingFound").style.display = "";
      document.getElementById("tracingVolSay").textContent = "Volume 3.44 µm³ (Cavalieri...)";
      TRACING_PENDING = null;                 // as if committed elsewhere
      PAD = null;
      document.getElementById("tracingZ").value = "17990";
      padOpen();
      await new Promise(r => setTimeout(r, 300));
      return { found: document.getElementById("tracingFound").style.display,
               vol: document.getElementById("tracingVolSay").textContent,
               rings: PAD ? PAD.rings.length : -1 };
    });
    ok(got.rings === 0, "a genuinely fresh pad is still fresh", got.rings + " contours");
    ok(got.found === "none", "...the naming block is hidden", JSON.stringify(got.found));
    ok(got.vol === "",
       "...and the volume line goes with it, instead of quoting µm³ for contours that are gone",
       JSON.stringify(got.vol));
  }

  console.log("\nand the two buttons say why, instead of doing nothing at all");
  {
    const got = await p.evaluate(async () => {
      TRACING_PENDING = null;
      const el = document.getElementById("tracingStatus");
      el.textContent = "";
      tracingKeep();
      const onKeep = el.textContent;
      el.textContent = "";
      document.getElementById("tracingViewer").click();
      await new Promise(r => setTimeout(r, 200));
      return { onKeep: onKeep, onView: el.textContent };
    });
    ok(/no contours in hand/.test(got.onKeep),
       "“Add it to the dataset” with nothing in hand explains itself",
       JSON.stringify(got.onKeep.slice(0, 80)));
    ok(got.onView.length > 0, "...and so does “Look at it in Neuroglancer”",
       JSON.stringify(got.onView.slice(0, 80)));
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.length ? errors[0] : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
