/* The shape a pasted link makes, before it is committed.                            2026-09-19

   Søren: *"I think the neuroglancer link paste function needs to have a 3D rendering also, so you
   can see the 3D mesh before committing."*

   WHAT WAS ACTUALLY WRONG IS WORTH STATING, because it decides what is worth asserting.
   `pad3DRings()` has fallen back to a pasted tracing since the preview was written — the feature
   worked. But the button, the ghosts tick and the canvas all live inside `#tracePadWrap`, which is
   `display:none` unless the pad is open, so on the paste route there was nowhere to draw and no way
   to ask. A feature that exists and cannot be reached looks exactly like one nobody built, and no
   unit test of `loft()` would ever have noticed.

   So this check is about REACHABILITY, and it has to be the real page: paste a link, press the
   button, and look for a canvas in the card the link was pasted into — with the pad shut, which is
   the state the old code could not draw in.

   The rest is the rule that decides WHICH card gets the picture. It must be the same rule that
   decides whose contours are in it, or the tool shows one tracing under a card about another:
     - pad closed, link pasted        -> the paste card draws, the pad's host stays empty
     - pad open with contours on it   -> the pad draws, and the paste card's host is EMPTIED
   The second half is the one that rots quietly, so the emptying is asserted rather than assumed.

   Nothing here touches the network: no root ID and no nucleus ID are filled in, so no mesh is
   fetched, and the ghosts tick is off by default — which is itself asserted, because a tick that
   arrived checked would pull megabytes the moment anybody pasted a link.

   Run: node tracingpreviewcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* A tracing as Spelunker writes one: one polyline per section, points in the tool's own voxels,
   closed (the last point repeats the first, which ringFrom strips). Three sections, because two is
   the least that has a surface and three is the least that has a MIDDLE — a band at each end and a
   cap at each end is the shape the preview is actually for. */
function circle(cx, cy, z, r, n){
  const pts = [];
  for (let i = 0; i < n; i++){
    const t = 2 * Math.PI * i / n;
    pts.push([Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), z]);
  }
  pts.push(pts[0].slice());
  return pts;
}
function tracingLink(){
  const anns = [];
  [100, 105, 110].forEach(function(z, i){
    anns.push({ type: "polyline", id: "p" + i, points: circle(1000, 2000, z, 90 - i * 10, 24) });
  });
  const state = { layers: [{ type: "annotation", name: "tracing", annotations: anns }] };
  return "https://spelunker.cave-explorer.org/#!" + encodeURIComponent(JSON.stringify(state));
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 900, height: 1200 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**script.google.com/**", r => r.abort());
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  console.log("the paste card has a preview of its own");
  {
    const has = await p.evaluate(() => ({
      host: !!document.getElementById("tracingPaste3DHost"),
      tick: !!document.getElementById("tracingPasteGhosts"),
      checked: !!(document.getElementById("tracingPasteGhosts") || {}).checked,
      /* IT IS INSIDE THE BLOCK THAT APPEARS WITH THE CONTOURS, not beside the paste box: there is
         nothing to draw until a link has been read, and an empty canvas under an empty textarea is
         a promise the card cannot keep yet. */
      inFound: !!(document.getElementById("tracingFound") || { contains: () => false })
        .contains(document.getElementById("tracingPaste3DHost")),
      /* ...and before the commit button, which is the whole of what was asked for. */
      beforeButton: (function(){
        const h = document.getElementById("tracingPaste3DHost");
        const btn = document.getElementById("tracingAdd") || document.getElementById("tracingKeep");
        if (!h || !btn) return null;
        return !!(h.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING);
      })()
    }));
    ok(has.host, "there is a host for it in the paste card");
    ok(has.inFound, "...inside the block that appears once contours have been read");
    ok(has.beforeButton === true, "...above the button that commits it",
       String(has.beforeButton));
    ok(has.tick, "there is a ghosts tick of its own");
    ok(has.checked === false,
       "...and it starts OFF, so pasting a link never fetches a cell's mesh unasked",
       "checked: " + has.checked);
  }

  console.log("\npasting a link draws the shape, with the pad shut");
  {
    const got = await p.evaluate(async (link) => {
      document.getElementById("tracingPanel").open = true;
      document.getElementById("tracingLink").value = link;
      document.getElementById("tracingRead").click();
      await new Promise(r => setTimeout(r, 900));
      /* NULL-GUARDED ON PURPOSE. Run against a page without the host this has to report a list of
         FAILs, not throw: a check that crashes says "something is wrong somewhere" where a check
         that fails says which four things are wrong. */
      const paste = document.getElementById("tracingPaste3DHost");
      const pad = document.getElementById("tracePad3DHost");
      const cv = paste && paste.querySelector("canvas");
      const res = (window.UJ && UJ.cfg && UJ.cfg.res) || [4, 4, 40];
      const g = UJ.traceloft.loft((TRACING_PENDING || {}).rings || [], res);
      return {
        /* THE STATE THE OLD CODE COULD NOT DRAW IN. The pad's whole wrapper is hidden, which is
           where the button, the tick and the canvas used to be — all of them. */
        padWrapHidden: getComputedStyle(document.getElementById("tracePadWrap")).display === "none",
        target: typeof pad3DTarget === "function" ? pad3DTarget() : "(no chooser)",
        canvas: !!cv,
        w: cv ? cv.width : 0, h: cv ? cv.height : 0,
        text: paste ? paste.innerText.replace(/\s+/g, " ").slice(0, 220) : "",
        padHostEmpty: !!pad && pad.innerHTML === "",
        rings: ((TRACING_PENDING || {}).rings || []).length,
        loftTris: g.indices.length / 3,
        status: (document.getElementById("tracingStatus") || {}).textContent || ""
      };
    }, tracingLink());
    ok(got.padWrapHidden === true,
       "the pad is shut — the state the preview used to be unreachable in",
       "tracePadWrap display:none: " + got.padWrapHidden);
    ok(got.rings === 3, "three contours were read off the link", got.rings + " rings");
    ok(got.target === "paste", "the preview belongs to the paste card", got.target);
    ok(got.canvas === true, "...and there is a canvas in it", "canvas: " + got.canvas);
    ok(got.w > 0 && got.h > 0,
       "...with a size, so it was measured after the block was shown rather than inside display:none",
       got.w + " × " + got.h);
    ok(/3 contours on 3 sections/.test(got.text),
       "...and it says what it is showing", got.text.slice(0, 90));
    ok(got.loftTris > 0 && /contours lofted section to section/.test(got.text),
       "...which is the lofted tracing, not a placeholder", got.loftTris + " triangles lofted");
    ok(got.padHostEmpty, "and the pad's own host is left empty", "'" + got.padHostEmpty + "'");
  }

  console.log("\nthe colour it is drawn in is the colour the card is showing");
  {
    const got = await p.evaluate(async () => {
      const c = document.getElementById("tracingColor");
      c.value = "#c85a28";
      c.dispatchEvent(new Event("change"));
      await new Promise(r => setTimeout(r, 600));
      return { tint: typeof pad3DTint === "function" ? pad3DTint(0) : null, picked: c.value };
    });
    const want = [0xc8 / 255, 0x5a / 255, 0x28 / 255];
    ok(got.tint && got.tint.every((v, i) => Math.abs(v - want[i]) < 1e-6),
       "the surface takes its tint from the card's own colour picker",
       got.picked + " -> [" + (got.tint || []).map(v => v.toFixed(3)).join(", ") + "]");
  }

  console.log("\nand the picture follows the contours, not the card it was born in");
  {
    /* Contours on the pad win, by the same rule pad3DRings() uses to choose them — otherwise the
       tool draws one tracing under a card that is about a different one. The paste card's canvas
       has to be taken down, not just covered: a WebGL context left alive counts against the
       browser's limit, and the oldest one on this page belongs to somebody's cell panel. */
    const got = await p.evaluate(async () => {
      PAD = UJ.tracepad.create(100);
      const circ = (cx, cy, r, n) => { const o = [];
        for (let i = 0; i < n; i++){ const a = 2*Math.PI*i/n; o.push([cx + r*Math.cos(a), cy + r*Math.sin(a)]); }
        return o; };
      PAD.rings = [100, 105, 110].map(z => ({ z: z, inst: 0, points: circ(4000, 5000, 60, 20) }));
      PAD3D_ON = true;
      document.getElementById("tracePadWrap").style.display = "";
      await pad3DDraw();
      const paste = document.getElementById("tracingPaste3DHost");
      const pad = document.getElementById("tracePad3DHost");
      return { target: typeof pad3DTarget === "function" ? pad3DTarget() : "(no chooser)",
               padCanvas: !!(pad && pad.querySelector("canvas")),
               pasteEmpty: !!paste && paste.innerHTML === "",
               ghostsRead: typeof pad3DWantGhosts === "function" ? pad3DWantGhosts() : null };
    });
    ok(got.target === "pad", "contours on the pad take the preview back", got.target);
    ok(got.padCanvas === true, "...and the pad's host has the canvas now");
    ok(got.pasteEmpty === true,
       "...while the paste card's is emptied rather than left holding a dead context",
       "paste host empty: " + got.pasteEmpty);
    ok(got.ghostsRead === true,
       "...and the ghosts tick it reads is the PAD's, which is the one that is checked",
       "wantGhosts: " + got.ghostsRead);
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.length ? errors[0] : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
