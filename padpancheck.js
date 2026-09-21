/* The pad's four move buttons, on every tool that has the tracing pad.              2026-09-21

   Søren: "For all of the tracing panels, we need to have some buttons to move the image up, down,
   left or right. It should move half a screen every time the button is clicked."

   The EM is not fetched: drawSection is replaced by one that takes 300 ms and returns a view of a
   known size, so what is measured is the pad -- where each button moves the centre, by how much,
   and that presses made while a section is still loading are not lost.

   Run: node padpancheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  for (const page of ["ujump.html", "djump.html", "ljump.html", "bjump.html", "hjump.html"]){
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });     // a phone
    const errors = [];
    p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
    for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**storage.googleapis.com/**",
                     "**s3.amazonaws.com/**", "**gstatic.com/**", "**script.google.com/**", "**allentech.org/**"])
      await p.route(h, r => r.abort());
    await p.goto("file://" + page_(page));
    await p.waitForTimeout(4000);
    console.log("\n" + page);
    const r = await p.evaluate(async () => {
      const out = {};
      window.__draws = [];
      /* 1 px = 2 tool voxels in x and 3 in y, 300 x 200 px: half a screen is 300 x 300 voxels. */
      UJ.emtiles.configured = () => true;
      UJ.emtiles.drawSection = async function(cv, o){
        window.__draws.push(o.centre.slice());
        await new Promise(r => setTimeout(r, 300));
        const c = o.centre, w = 300, h = 200;
        return { w, h, z: c[2], effNmPerPx: 8, pxPerToolVoxel: 0.5,
                 toolAt: (px, py) => [c[0] + (px - w / 2) * 2, c[1] + (py - h / 2) * 3, c[2]] };
      };
      document.getElementById("tracingX").value = "10000";
      document.getElementById("tracingY").value = "20000";
      document.getElementById("tracingZ").value = "100";
      const panel = document.getElementById("tracingPanel"); if (panel) panel.open = true;
      document.getElementById("tracePadOpen").click();
      await new Promise(r => setTimeout(r, 700));
      const btns = [...document.querySelectorAll("#tracePadPan .padpan")];
      out.n = btns.length;
      const cv = document.getElementById("tracePad").getBoundingClientRect();
      out.inside = btns.every(x => { const q = x.getBoundingClientRect();
        return q.width >= 36 && q.left >= cv.left && q.right <= cv.right + 1 && q.top >= cv.top && q.bottom <= cv.bottom + 1; });
      out.start = PAD_CENTRE.slice();
      const press = async (dir) => {
        document.querySelector('#tracePadPan .padpan[aria-label="Move ' + dir + '"]').click();
        await new Promise(r => setTimeout(r, 450));
        return PAD_CENTRE.slice();
      };
      out.right = await press("right");
      out.down = await press("down");
      out.left = await press("left");
      out.up = await press("up");
      /* Two presses while the first move is still loading. */
      window.__draws.length = 0;
      const R = document.querySelector('#tracePadPan .padpan[aria-label="Move right"]');
      R.click(); await new Promise(r => setTimeout(r, 50)); R.click(); R.click();
      await new Promise(r => setTimeout(r, 1200));
      out.burst = PAD_CENTRE.slice();
      out.lastDraw = window.__draws[window.__draws.length - 1];
      out.draws = window.__draws.length;
      out.said = document.getElementById("tracePadSay").textContent;
      return out;
    });
    ok(r.n === 4, "four move buttons", r.n);
    ok(r.inside, "...over the picture, finger-sized, on a phone-width screen");
    const [x0, y0] = r.start;
    ok(r.right[0] === x0 + 300 && r.right[1] === y0, "right moves half a screen right", r.right.join(","));
    ok(r.down[0] === x0 + 300 && r.down[1] === y0 + 300, "down moves half a screen down", r.down.join(","));
    ok(r.left[0] === x0 && r.left[1] === y0 + 300, "left comes back", r.left.join(","));
    ok(r.up[0] === x0 && r.up[1] === y0, "up comes back to where it started", r.up.join(","));
    ok(r.burst[0] === x0 + 900, "three quick presses move three half-screens, none lost", r.burst.join(","));
    ok(r.lastDraw && r.lastDraw[0] === x0 + 900 && r.draws <= 3,
       "...and the last section drawn is the one they arrived at, without one draw per press",
       r.draws + " draw(s), last at " + (r.lastDraw || []).join(","));
    ok(/Moved to/.test(r.said), "the status line says where", r.said);
    ok(errors.length === 0, "no page errors", errors.join(" | ") || "none");
    await p.close();
  }
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
