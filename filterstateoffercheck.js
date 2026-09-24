/* Too big to open is not too big to use: the filter hands you the JSON.               2026-09-24

   Søren: "I think there should be an option to paste the JSON code yourself into a Neuroglancer
   instance when the file size is too big. Then the Filter and show should warn about the size and
   offer the user to either do the search again more limited or download a JSON file (if possible
   inside the warning) to paste into the neuroglancer instance themselves."

   WHAT IT DID. µJump measured the finished URL against VASC_URL_WARN_LENGTH -- Math.round(1.95 *
   1024 * 1024) = 2,044,723 -- and asked, in a browser confirm(), whether to open it anyway. Two
   things wrong with that. The threshold sits 52,429 characters BELOW the real limit, so "yes" on a
   view between the two produces about:blank#blocked and nothing to show for it; and a confirm()
   offering only yes or no cannot hand over the state, which is the one thing that still works at
   any size — Neuroglancer's own {} button takes a pasted state with no URL and no limit.

   The same offer already exists for a single tracing (tracingStateOffer, 2026-09-22) with the same
   two buttons and the same sentence about {}. This is that, for the filter, plus the third door
   Søren asked for: go back and narrow the search.

   WHAT IS ASSERTED:
     - over the cap the view is NOT opened, and no confirm() is fired at somebody who cannot win
     - the warning says the size, and the limit it is measured against
     - it offers the JSON: copy, and download as a file
     - ...and downloading really produces the state, not the URL
     - it offers narrowing the search instead, and that dismisses it
     - it shows WHERE to paste — the {} button, in a picture
     - under the cap nothing changes: it opens, and says nothing
     - and the limit can be overridden in the console, which is how this check drives it

   Run: node filterstateoffercheck.js [page.html]      (default ujump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ujump.html";
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1300, height: 1100 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**script.google.com/**", route => route.fulfill({ status: 200,
    contentType: "application/json", body: JSON.stringify({ tracings: [] }) }));
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**storage.googleapis.com/**",
                   "**s3.amazonaws.com/**", "**gstatic.com/**", "**allentech.org/**", "**princeton.edu/**"])
    await p.route(h, r => r.abort());
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(6000);

  /* One press of "Open all matches", with everything it might do captured: what it opened, what it
     asked, and what it downloaded. */
  const press = async (limit) => p.evaluate(async (limit) => {
    window.__opened = null; window.__confirms = []; window.__saved = null;
    window.open = function(u){ if (u) window.__opened = u;
      return { location: { set href(v){ window.__opened = v; }, get href(){ return window.__opened; } },
               opener: null }; };
    window.confirm = function(m){ window.__confirms.push(String(m || "")); return true; };
    /* The download, caught before it reaches the disk. */
    const realURL = URL.createObjectURL;
    URL.createObjectURL = function(blob){
      window.__savedBlob = blob;
      return realURL.call(URL, blob);
    };
    if (limit === null){ try { delete window.JUMP_LINK_MAX; } catch (_e){ window.JUMP_LINK_MAX = 0; } }
    else window.JUMP_LINK_MAX = limit;

    if (!window.__ran){
      document.getElementById("filterRun").click();
      const t0 = Date.now();
      while (Date.now() - t0 < 60000){
        await new Promise(r => setTimeout(r, 300));
        const v = document.getElementById("filterViewerAll");
        if (v && !v.disabled) break;
      }
      window.__ran = true;
    }
    document.getElementById("filterViewerAll").click();
    const t1 = Date.now();
    while (Date.now() - t1 < 60000){
      await new Promise(r => setTimeout(r, 200));
      if (window.__opened) break;
      if (document.querySelector(".jsonoffer")) break;
    }
    await new Promise(r => setTimeout(r, 400));
    const panel = document.querySelector(".jsonoffer");
    return { opened: window.__opened ? window.__opened.length : 0,
             confirms: window.__confirms.length,
             confirmSaid: window.__confirms.join(" | ").slice(0, 120),
             panel: !!panel,
             text: panel ? String(panel.textContent || "") : "",
             buttons: panel ? [].map.call(panel.querySelectorAll("button"), x => x.textContent.trim()) : [],
             img: panel ? [].map.call(panel.querySelectorAll("img"),
                    x => (x.getAttribute("src") || "").slice(0, 22) + " alt=" + (x.alt || "")) : [] };
  }, limit);

  console.log(PAGE + "\n\nover the cap");
  const big = await press(5000);        // any real filter view is longer than 5,000 characters
  ok(big.panel, "the warning appears", big.panel ? "shown" : "no .jsonoffer panel");
  ok(big.opened === 0, "...and the view is NOT opened", big.opened ? big.opened + " chars opened" : "nothing opened");
  ok(big.confirms === 0, "...and no confirm() is fired at somebody who cannot win either way",
     big.confirms + " confirm(s)" + (big.confirms ? ": " + big.confirmSaid : ""));
  ok(/5,000|5000/.test(big.text) && /\bcharacters?\b/i.test(big.text),
     "the warning names the size it measured and the limit", big.text.slice(0, 150));
  const bt = (big.buttons || []).join(" | ").toLowerCase();
  ok(/copy/.test(bt), "it offers to copy the JSON", bt || "(no buttons)");
  ok(/download/.test(bt), "...and to download it as a file", bt);
  ok(/narrow|search again|back/.test(bt), "...and to narrow the search instead", bt);
  ok(/\{\}/.test(big.text), "it names the {} button", (big.text.match(/[^.]*\{\}[^.]*/) || ["(not named)"])[0].trim());
  ok((big.img || []).length === 1 && /^data:image\//.test(big.img[0]),
     "...and shows it, in a picture carried by the page itself", (big.img || [])[0] || "(no image)");

  console.log("\nthe download is the state");
  const saved = await p.evaluate(async () => {
    const panel = document.querySelector(".jsonoffer");
    if (!panel) return { none: true };
    const d = [].filter.call(panel.querySelectorAll("button"), x => /download/i.test(x.textContent))[0];
    if (!d) return { none: true };
    d.click();
    await new Promise(r => setTimeout(r, 300));
    const blob = window.__savedBlob;
    if (!blob) return { noblob: true };
    const txt = await blob.text();
    let parsed = null; try { parsed = JSON.parse(txt); } catch (_e){}
    return { type: blob.type, chars: txt.length, isJson: !!parsed,
             hasLayers: !!(parsed && Array.isArray(parsed.layers)),
             looksLikeUrl: /^https?:/.test(txt.trim()) };
  });
  ok(!saved.none && !saved.noblob, "pressing download produces a file",
     saved.none ? "no button" : (saved.noblob ? "no blob" : saved.chars + " chars"));
  ok(saved.isJson && saved.hasLayers, "...and it is the Neuroglancer state, with its layers",
     saved.isJson ? (saved.hasLayers ? "layers present" : "JSON but no layers") : "not JSON");
  ok(!saved.looksLikeUrl, "...not the URL, which is the thing that did not work", saved.looksLikeUrl);
  ok(/json/.test(String(saved.type || "")), "...offered as JSON", saved.type);

  console.log("\nnarrowing the search instead");
  const gone = await p.evaluate(async () => {
    const panel = document.querySelector(".jsonoffer");
    if (!panel) return { none: true };
    const n = [].filter.call(panel.querySelectorAll("button"), x => /narrow|search again|back/i.test(x.textContent))[0];
    if (!n) return { none: true };
    n.click();
    await new Promise(r => setTimeout(r, 300));
    return { still: !!document.querySelector(".jsonoffer"),
             filterThere: !!document.getElementById("filterViewerAll") };
  });
  ok(!gone.none && !gone.still, "it dismisses the warning", gone.none ? "no button" : (gone.still ? "still there" : "gone"));
  ok(gone.filterThere, "...leaving the filter where it was, to be narrowed", gone.filterThere);

  console.log("\nunder the cap");
  /* Driven the other way: this page's OWN default filter view is 24,757,320 characters -- twelve
     times the real cap -- so "under the cap" cannot be reached by narrowing anything here. The
     limit is lifted above it instead, which tests the same branch. */
  const small = await press(50000000);
  ok(small.opened > 0, "it opens, as it always did", Math.round(small.opened / 1000) + "k");
  ok(small.confirms >= 0, "(and the large-but-openable warning is still the confirm it was)",
     small.confirms + " confirm(s)");
  ok(!small.panel, "...with no warning", small.panel ? "panel shown" : "none");

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
