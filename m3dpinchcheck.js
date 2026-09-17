/* Two fingers zoom the 3D panel. One still turns it.                                2026-09-17

   Søren, from a phone: *"It works well on mobile phone, however I want to have the option to zoom
   in or our in the 3D window by using 2 fingers."* The panel's only zoom was the wheel, and a phone
   has no wheel — so on a phone the model could be turned and never approached.

   Driven in a real browser against the real core/mesh3d.js, because everything that matters here is
   pointer-event bookkeeping that no fixture can stand in for: which pointer is which, what happens
   when a second one arrives mid-drag, and what happens when one of two leaves. The camera is
   observable because draw() takes a `view` object and mutates it in place — the same hook the
   tracing preview uses to keep its angle across redraws.

   WHAT WOULD BE WRONG IF THIS DID NOT EXIST
     - a second finger arriving mid-drag keeps rotating, so every zoom spins the model;
     - lifting one finger of a pinch snaps the model round by however far that finger travelled;
     - a pinch drifts the camera past where the wheel can reach, or the wheel past the pinch;
     - touch-action goes missing from the canvas and the browser takes the gesture for page zoom,
       which is invisible in code and total on a phone.

   Run: node m3dpinchcheck.js */
const { chromium } = require("playwright");
const fs = require("fs");
const core = require("./corepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

(async () => {
  const b = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"]
  });
  const p = await b.newPage();
  const errors = [];
  p.on("pageerror", e => errors.push(e.message));
  await p.setContent("<!doctype html><html><body><div id='host'></div></body></html>");
  await p.addScriptTag({ content: fs.readFileSync(core("mesh3d.js"), "utf8") });

  /* A cube, because the shape is irrelevant and the camera is not. */
  const drawn = await p.evaluate(() => {
    const s = 1000;
    const pos = [], idx = [];
    const c = [[0,0,0],[s,0,0],[s,s,0],[0,s,0],[0,0,s],[s,0,s],[s,s,s],[0,s,s]];
    c.forEach(v => pos.push(v[0], v[1], v[2]));
    [[0,1,2],[0,2,3],[4,5,6],[4,6,7],[0,1,5],[0,5,4],
     [2,3,7],[2,7,6],[1,2,6],[1,6,5],[0,3,7],[0,7,4]].forEach(t => idx.push(t[0], t[1], t[2]));
    const geo = UJ.mesh3d.prepare(pos, idx, { unitNm: 1 });
    window.__view = { yaw: 0.6, pitch: 0.3, dist: 1.9 };
    UJ.mesh3d.show(document.getElementById("host"), geo, { view: window.__view });
    const cv = document.querySelector(".m3d-canvas");
    return { canvas: !!cv, touch: cv ? getComputedStyle(cv).touchAction : "",
             dist: window.__view.dist };
  });
  ok(drawn.canvas, "the panel drew");
  ok(drawn.touch === "none",
     "the canvas takes the gesture rather than leaving it to the browser's own page zoom",
     "touch-action: " + drawn.touch);

  /* The gesture, as a phone delivers it: two pointerIds, down then moving apart. */
  const pinch = await p.evaluate(() => {
    const cv = document.querySelector(".m3d-canvas");
    const r = cv.getBoundingClientRect();
    const at = (type, id, x, y) => cv.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: id, pointerType: "touch",
      isPrimary: id === 1, clientX: r.left + x, clientY: r.top + y }));
    const out = { start: window.__view.dist };

    /* Apart is closer, the way every map behaves. */
    at("pointerdown", 1, 100, 100);
    at("pointerdown", 2, 140, 100);          // 40 px apart
    at("pointermove", 1, 60, 100);
    at("pointermove", 2, 180, 100);          // 120 px apart: three times
    out.spread = window.__view.dist;
    out.yawDuringPinch = window.__view.yaw;

    /* ...and together is further away. */
    at("pointermove", 1, 110, 100);
    at("pointermove", 2, 130, 100);          // 20 px
    out.squeeze = window.__view.dist;

    /* One finger leaves. The model must not jump, and the remaining finger must rotate from where
       it is rather than from where it started the pinch. */
    at("pointerup", 2, 130, 100);
    out.afterLift = window.__view.dist;
    const yaw0 = window.__view.yaw;
    at("pointermove", 1, 150, 100);
    out.turned = window.__view.yaw - yaw0;
    out.distWhileTurning = window.__view.dist;
    at("pointerup", 1, 150, 100);

    /* And one finger on its own still turns it, which is what worked before any of this. */
    const yaw1 = window.__view.yaw;
    at("pointerdown", 1, 100, 100);
    at("pointermove", 1, 160, 100);
    out.oneFinger = window.__view.yaw - yaw1;
    at("pointerup", 1, 160, 100);

    /* The wheel still reaches the same places -- neither way of zooming may go where the other
       cannot, or the panel behaves differently depending on which one you used last. */
    const beforeWheel = window.__view.dist;
    for (let i = 0; i < 40; i++) cv.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));
    out.wheelFar = window.__view.dist;
    for (let i = 0; i < 80; i++) cv.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true }));
    out.wheelNear = window.__view.dist;
    out.beforeWheel = beforeWheel;
    return out;
  });

  ok(pinch.spread < pinch.start * 0.5,
     "fingers apart moves the camera IN, by the ratio of the gap",
     pinch.start.toFixed(2) + " -> " + pinch.spread.toFixed(2));
  ok(Math.abs(pinch.spread - pinch.start * 40 / 120) < 0.01,
     "...exactly that ratio, not a guessed step", pinch.spread.toFixed(3));
  ok(pinch.yawDuringPinch === 0.6,
     "...and the model does not TURN while being pinched, however the fingers moved",
     "yaw " + pinch.yawDuringPinch);
  ok(pinch.squeeze > pinch.spread,
     "fingers together moves it out again", pinch.squeeze.toFixed(2));
  ok(pinch.afterLift === pinch.squeeze,
     "lifting one finger changes nothing by itself", pinch.afterLift.toFixed(2));
  ok(Math.abs(pinch.turned) > 0.1 && Math.abs(pinch.turned) < 0.5,
     "...and the one left rotates from where it IS, not from where the pinch began",
     "yaw moved " + pinch.turned.toFixed(2) + " for 20 px");
  ok(pinch.distWhileTurning === pinch.afterLift,
     "...without the zoom drifting while it turns", pinch.distWhileTurning.toFixed(2));
  ok(Math.abs(pinch.oneFinger) > 0.4,
     "one finger on its own still turns it, which is what already worked",
     "yaw moved " + pinch.oneFinger.toFixed(2) + " for 60 px");
  ok(Math.abs(pinch.wheelFar - 12) < 0.001 && Math.abs(pinch.wheelNear - 0.6) < 0.001,
     "and the wheel still reaches both ends of the same range the pinch is clamped to",
     pinch.wheelNear.toFixed(2) + " .. " + pinch.wheelFar.toFixed(2));

  ok(errors.length === 0, "no page errors", errors.join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
