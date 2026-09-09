/* Every tool offers exactly what its dataset can do, and nothing else.            2026-09-08

   Søren: "I would like to implement in the other tools, where relevant. Make sure not to offer
   things that are not available for the respective tools."

   The second half of that sentence is what this file is for. It is easy to add a tick to a shared
   module and quietly give it to a dataset that has no data behind it -- the tick works, the
   notebook runs, and the failure is an empty scene an hour later. So the capability MATRIX is
   written out here, once, and every page is measured against it.

   THE REAL PAGE IN A REAL BROWSER. The first version of this check mounted core/regionbox.js in
   jsdom against a hand-written UJ.cfg stub, and that is exactly the mistake that has already cost
   this project twice today: the wordmark check passed because its stub said label:"µJump" while
   the page's said "MICrONS minnie65". A stub is a second copy of the config that agrees with the
   check by construction. So every page here is LOADED, its own row is read out of its own DOM,
   and the only literal is the matrix -- which is a statement about the DATASETS, and is meant to
   disagree with the code when the code is wrong.

   Run: node blendereverywherecheck.js
*/
const { chromium } = require("playwright");
const fs = require("fs");
const page_ = require("./pagepath.js");

let bad = 0;
const ok = (n, c, d) => { if (!c) bad++; console.log((c ? "PASS " : "*** FAIL *** ") + n
                                                     + (d !== undefined ? "  <- " + d : "")); };

/* ── THE MATRIX ────────────────────────────────────────────────────────────────────────────────
   blender  can this tool write a Blender-scene notebook at all
   seg      is there a segmentation to cut out
   meshes   are there cell 3D models to fetch
   nuclei   is there a SEPARATE nucleus segmentation (minnie65 alone)
   vasc     are Wan & Wei's TriSAM vessels this dataset's volume (minnie65 alone)
   why      the reason, for the ones that are false -- kept here so this file reads as a statement
            about the datasets rather than as a list of booleans */
const MATRIX = {
  "ujump.html": { label: "µJump",
                  blender: true,  seg: true,  meshes: true,  nuclei: true,  vasc: true },
  /* nuclei went true on 2026-09-09, the SECOND time that day and the fourth time in this family:
     the panel sent nucSource:"" with the comment "pinky100 publishes no nucleus segmentation",
     and the page's own SRC.nuc -- td.princeton.edu/sseung-archive/pinky100-nuclei/seg, whose
     /info reads uint32, 64x64x40 nm, and "mesh": "mesh_mip_0_err_40" -- says otherwise. Public,
     with meshes, and πJump's nucleus ids are segment ids in it. Søren found this one too. */
  "pjump.html": { label: "πJump",
                  blender: true,  seg: true,  meshes: true,  nuclei: true,  vasc: false,
                  why: "the TriSAM vessels are minnie65's volume" },
  "ljump.html": { label: "λJump",
                  blender: true,  seg: false, meshes: false, nuclei: false, vasc: false,
                  why: "Lee16's public release is image only -- no segmentation, so no models" },
  "bjump.html": { label: "βJump",
                  blender: true,  seg: true,  meshes: true,  nuclei: false, vasc: false,
                  why: "a vCLEM hippocampus: real segmentation and meshes, no nucleus volume" },
  "xjump.html": { label: "χJump",
                  blender: true,  seg: true,  meshes: true,  nuclei: false, vasc: false,
                  why: "cb2 is ordinary precomputed, but its mesh vertices are METRES on permuted axes" },
  /* BOTH OF THESE WERE WRONG UNTIL 2026-09-08, and Søren found them, not this file:
     "I don't see any Blender file option for dJump and hJump."

     ηJump's stated reason -- "no bounding-box panel on this page at all" -- was written from
     memory rather than from the page, which has one. δJump's reason was true (V1DD's segmentation
     really is a CAVE service with no anonymous access) and the conclusion drawn from it was not:
     the EM/segmentation notebook has written a CAVE-token cell since 2026-08-29, and the Blender
     notebook now does too.

     The old check could not catch either, because for an excluded tool it only asserted that the
     tick was ABSENT -- and it was. A capability matrix is a claim about the world, and the half
     that says "this cannot be done" is the half nothing tests. It stays a literal for that
     reason, but the reasons are now checked against the page: hasPanel and needsCave are read
     from the page rather than declared here, so a tool that grows a box panel or loses its auth
     wall fails this file. */
  /* nuclei went true on 2026-09-09. The panel sent nucSource:"" with the comment "V1DD
     publishes no nucleus segmentation", and the page's own SRC.nuc -- verified against the
     bucket on 2026-08-20 and painted by its viewer -- says otherwise. Public, unlike the
     segmentation: the nucleus needs no token. */
  "djump.html": { label: "δJump",
                  blender: true,  seg: true,  meshes: true,  nuclei: true,  vasc: false,
                  cave: true,
                  why: "V1DD's segmentation is a live CAVE service, so the notebook writes a token cell; the imagery and the nucleus volume are public" },
  "hjump.html": { label: "ηJump",
                  blender: true,  seg: true,  meshes: true,  nuclei: false, vasc: false,
                  why: "H01 is public precomputed on GCS, EM and c3 both; no nucleus volume" },
  "wjump.html": { label: "ωJump", blender: false,
                  why: "OME-Zarr through core/colabzarr.js, and its own inlined copy of the region-box module" },
};

/* Each tool's own accent, read off its pages on 2026-09-09 -- the LAST plain `:root` rule that
   declares --accent, which is what the browser shows. Written out rather than derived: the check
   above walks the same stylesheet the code does, so without these literals the two could agree
   with each other and be wrong together, which is exactly what happened for a month of βJump,
   λJump and ηJump renders signed in µJump's teal. */
const ACCENTS = {
  "ujump.html": "#27e0b3", "pjump.html": "#f78ad4", "ljump.html": "#7aa2ff",
  "bjump.html": "#ff6b81", "xjump.html": "#4ade80", "djump.html": "#b388ff",
  "hjump.html": "#ffb454", "wjump.html": "#fbbf24",
};

const WITH_PANEL = ["ujump.html", "pjump.html", "ljump.html", "bjump.html", "xjump.html",
                    "djump.html", "hjump.html"];
const WITHOUT    = ["wjump.html"];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

  for (const file of WITH_PANEL) {
    const want = MATRIX[file];
    console.log("\n=== " + want.label + " (" + file + ") ===");
    const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
    /* µJump throws one load-time error that has nothing to do with any of this: its `vascdata11`
       blob's OV_FINE_IDX field is corrupt (two characters short of a multiple of 4, with padding,
       so atob refuses), and the live site at grubblab.com carries the identical bytes. It is
       tracked in dashsayscheck.js the same way and in the project note
       "ujump-vascdata11-blob-is-corrupt". Separated rather than tolerated: a suite that quietly
       widened what it accepts is how it got buried the first time. */
    const KNOWN_VASCDATA11 = /vascdata11|atob/;
    const errs = [], known = [];
    p.on("pageerror", e => {
      const t = String((e && e.stack) || e).slice(0, 300);
      (KNOWN_VASCDATA11.test(t) ? known : errs).push(t);
    });
    /* Blocked so a check run never depends on Google Apps Script being up, and so a network
       failure cannot be read as a code fault. */
    await p.route("**script.google.com/**", r => r.abort());
    await p.route("**accounts.google.com/**", r => r.abort());
    await p.goto("file://" + page_(file));
    await p.waitForTimeout(1500);
    ok("page loads with no JS error", errs.length === 0,
       errs.slice(0, 2).join(" | ").split("\n")[0] || "clean");
    if (file === "ujump.html") {
      /* Asserted PRESENT, so that regenerating the blob fails this line and takes both it and the
         filter above with it -- rather than the filter silently starting to hide a new fault. */
      ok("...apart from the known-broken vascdata11 blob, which is still there", known.length > 0,
         "OV_FINE_IDX is corrupt on the live site too; fix the blob and this line goes");
    }

    const seen = await p.evaluate(() => {
      const row = document.querySelector("#regionBoxes .rbox-row");
      if (!row) return { row: false };
      const one = cls => {
        const el = row.querySelector("." + cls);
        return { present: !!el, disabled: !!(el && el.disabled), checked: !!(el && el.checked),
                 title: (el && el.closest("label") && el.closest("label").title) || "" };
      };
      const help = row.querySelector(".rbox-blender-help");
      return { row: true,
               module: !!(window.UJ && UJ.blender && UJ.blender.downloadNotebook),
               em: one("colab-em"), seg: one("colab-seg"), meshes: one("colab-meshes"),
               blender: one("colab-blender"), nuclei: one("colab-nuclei"), vasc: one("colab-vasc"),
               help: !!help, helpHidden: !!help && help.style.display === "none",
               steps: help ? help.querySelectorAll("li").length : 0,
               /* THE PAGE'S OWN ANSWER to "does this dataset have nuclei", read from the constant
                  its VIEWER uses, not from the export config the matrix is checking. Added
                  2026-09-09 after the fourth "publishes no nucleus segmentation" written from
                  memory (ηJump's box panel, δJump's Blender notebook, V1DD's nuclei, pinky100's
                  nuclei). A matrix is a claim about the world and the half that says "this cannot
                  be done" is the half nothing tested -- so now a false row has to survive a
                  second, independent source saying otherwise. */
               srcNuc: (typeof SRC !== "undefined" && SRC && SRC.nuc) || "",
               cfgNuc: (window.UJ && UJ.cfg && UJ.cfg.em && UJ.cfg.em.nucSource) || "" };
    });
    ok("the box row is there", seen.row);
    if (!seen.row) { await p.close(); continue; }

    /* Both directions, because both have been wrong. */
    ok("the page's own viewer " + (want.nuclei ? "has" : "has no") + " nucleus volume",
       (!!seen.srcNuc) === !!want.nuclei,
       seen.srcNuc || "SRC.nuc is empty"
       + (want.nuclei ? "" : "  — if this fails, the matrix says no and the page says yes"));
    ok("...and the exporter points at the same one",
       want.nuclei ? (seen.cfgNuc === seen.srcNuc) : (seen.cfgNuc === ""),
       want.nuclei ? (seen.cfgNuc === seen.srcNuc ? "same volume" : seen.cfgNuc + " ≠ " + seen.srcNuc)
                   : (seen.cfgNuc || "nothing to export"));

    ok("Blender file is offered", seen.blender.present === want.blender,
       want.blender ? "" : want.why);
    ok("core/blenderexport.js is loaded exactly when the tick is",
       seen.module === want.blender,
       "a loaded module with no button is a thing that gets wired up by accident");
    ok("Blender starts unticked", !seen.blender.checked,
       "the EM/segmentation notebook stays the default");

    ok("Segmentation is " + (want.seg ? "offered" : "disabled with a reason"),
       seen.seg.present && seen.seg.disabled === !want.seg,
       want.seg ? "" : JSON.stringify(seen.seg.title.slice(0, 70)));
    ok("Cell 3D model is " + (want.meshes ? "offered" : "disabled with a reason"),
       seen.meshes.present && seen.meshes.disabled === !want.meshes,
       want.meshes ? "" : JSON.stringify(seen.meshes.title.slice(0, 70)));
    if (!want.seg) ok("...and the reason is readable", seen.seg.title.length > 20);

    /* Absent, not disabled. Five dimmed ticks on every non-minnie65 page is noise: a capability
       no dataset in this family but one was ever going to have is a fact about the dataset, not a
       gap in the tool. */
    ok("Nuclei tick " + (want.nuclei ? "present" : "absent (not disabled)"),
       seen.nuclei.present === want.nuclei, want.nuclei ? "" : want.why);
    ok("Vasculature tick " + (want.vasc ? "present" : "absent (not disabled)"),
       seen.vasc.present === want.vasc);
    if (want.vasc) ok("...and it starts unticked, because it is the slow one",
                      !seen.vasc.checked);

    ok("the explainer is in the row", seen.help);
    ok("...with all seven of Søren's steps", seen.steps === 7, seen.steps + " steps");
    ok("...hidden until the tick", seen.helpHidden);
    const shown = await p.evaluate(() => {
      const row = document.querySelector("#regionBoxes .rbox-row");
      const bl = row.querySelector(".colab-blender");
      bl.checked = true; bl.dispatchEvent(new Event("change"));
      const help = row.querySelector(".rbox-blender-help");
      const vasc = row.querySelector(".colab-vasc");
      const ext  = row.querySelector(".colab-vasc-extent");
      return { help: help.style.display !== "none",
               extentHidden: !ext || ext.offsetParent === null || ext.style.display === "none",
               hasVasc: !!vasc };
    });
    ok("...and shown when it is", shown.help);
    if (want.vasc) {
      /* Søren: "the dropdown should appear next to the Vasculature text of the tickbox only if
         the tick is clicked" -- so it is hidden while the vasculature tick is off, even with the
         Blender tick on. */
      ok("the extent dropdown stays hidden until Vasculature is ticked", shown.extentHidden);
      const after = await p.evaluate(() => {
        const row = document.querySelector("#regionBoxes .rbox-row");
        const v = row.querySelector(".colab-vasc");
        v.checked = true; v.dispatchEvent(new Event("change"));
        const ext = row.querySelector(".colab-vasc-extent");
        return !!ext && ext.style.display !== "none";
      });
      ok("...and appears when it is", after);
    }

    /* ── the button calls the right module, with the right sources ──────────────────────────
       Stubbed rather than downloaded: what matters is the options object, and a headless
       download saves a file for no added confidence.

       THE FILTER IS RUN FIRST, on a box round the whole volume. The button refuses to write a
       notebook with "Cell 3D model" ticked and no current "Filter and show" result -- deliberately
       (a notebook with an empty MESH_ROOT_IDS runs, downloads nothing and reports success), and
       rbcheck asserts that refusal. Here the refusal is in the way, so the check does what a user
       does: previews first. That also means the cells list below is real cells rather than [].

       AND IT PREVIEWS LAST, after every tick has been set. βJump wires the box's onChange to
       invalidatePreview(), so toggling a tick throws the preview away -- previewing first and
       ticking afterwards refused, which is correct behaviour and a wrongly ordered check. */
    const preview = async () => {
      await p.evaluate(() => {
        const t = document.querySelector('[data-tab="filter"]');
        if (t) t.click();
        const on = document.getElementById("filterRegionOn");
        if (on) { on.checked = true; on.dispatchEvent(new Event("change")); }
        const set = (c, v) => { const el = document.querySelector("#regionBoxes ." + c);
                                if (el) el.value = String(v); };
        // both dialects: µ/π/δ and the shared module use rx1.., ηJump uses rb-x1..
        ["rx1", "ry1", "rz1", "rb-x1", "rb-y1", "rb-z1"].forEach(c => set(c, 0));
        ["rx2", "ry2", "rz2", "rb-x2", "rb-y2", "rb-z2"].forEach(c => set(c, 99999999));
        const x = document.querySelector("#regionBoxes .rx1, #regionBoxes .rb-x1");
        if (x) x.dispatchEvent(new Event("input"));
        const run = document.getElementById("filterRun");
        if (run) run.click();
      });
      await p.waitForTimeout(900);
    };
    await preview();

    const sent = await p.evaluate(() => {
      const out = [];
      UJ.blender.downloadNotebook = o => out.push({ which: "blender", o });
      if (UJ.colab) UJ.colab.downloadNotebook = o => out.push({ which: "colab", o });
      window.alert = m => out.push({ which: "alert", o: { m } });
      const row = document.querySelector("#regionBoxes .rbox-row");
      /* Already ticked by the explainer test above, and left ticked: re-dispatching "change" is
         what invalidated βJump's preview. */
      /* ηJump's button is .rb-colab; every other page's is .rbox-colab. Its box fields are
         .rb-x1.. in VOXELS too -- a different dialect for the same row, which is why this reads
         the DOM rather than assuming one shape. */
      const btn = row.querySelector(".rbox-colab") || row.querySelector(".rb-colab");
      btn.click();
      return new Promise(r => setTimeout(() => r(out), 900));   // the µJump handler is async
    });
    const call = sent.find(s => s.which === "blender");
    ok("ticking Blender file calls UJ.blender.downloadNotebook", !!call,
       JSON.stringify(sent.map(s => s.which + (s.o && s.o.m ? ":" + s.o.m.slice(0, 60) : ""))));
    if (call) {
      const O = call.o;
      /* CELLS, not bare root ids -- the Blender notebook colours by type and puts a nucleus
         inside a cell where the dataset has one, and a list of ids cannot say either. The filter
         was previewed over the whole volume above, so an empty list here means the collection
         loop never ran, which is the failure that looks like a working button. */
      ok("...with cells carrying a type and a root id, not bare ids",
         Array.isArray(O.cells) && (!want.meshes
                                    || (O.cells.length > 0 && !!O.cells[0].root_id
                                        && !!O.cells[0].type)),
         (O.cells || []).length + " cells, e.g. " + JSON.stringify((O.cells || [])[0] || null));
      ok("...naming this page's own EM source", !!O.emSource && !/^precomputed:/.test(O.emSource),
         O.emSource);
      ok("...with a nucleus source only where there is one",
         (!!O.nucSource) === want.nuclei, JSON.stringify(O.nucSource || ""));
      ok("...and a vasculature source only where there is one",
         (!!O.vascSource || !!O.canVasc) === want.vasc, JSON.stringify(O.vascSource || ""));
      ok("...and a brand block naming the tool and crediting the dataset",
         !!O.brand && !!O.brand.name && !!O.brand.url && !!O.brand.dataset,
         JSON.stringify(O.brand || null));
      /* ── SIGNED IN THE TOOL'S OWN COLOUR ──────────────────────────────────────────────
         Søren, 2026-09-08: "the segmentation looks like it is colored after µJump instead of
         xJump." Five callers had hand-built this block with accent "#27e0b3" -- µJump's teal --
         so a χJump video (#4ade80) and a δJump one (#b388ff) were both signed in the wrong
         tool's colour. Read from the page's own :root now, so this compares the brand against
         the stylesheet rather than against a literal here. */
      /* THE CASCADE, not the first hit -- and this walk had the same bug as the code it
         checks, which is why it passed while every βJump render came out µJump teal. A page
         opens with the inherited palette and overrides it hundreds of lines later with its own;
         the LAST declaration of each property is the one the browser shows. 2026-09-09. */
      const css = await p.evaluate(() => {
        const out = {};
        for (const sh of document.styleSheets) {
          let rules; try { rules = sh.cssRules; } catch (e) { continue; }
          for (const r of rules)
            if (r.selectorText === ":root" && r.style)
              for (const k of ["accent", "ink", "mut"]) {
                const v = r.style.getPropertyValue("--" + k).trim();
                if (v) out[k] = v;                 // later rules overwrite earlier ones
              }
        }
        return out.accent ? out : null;
      });
      ok("the brand's accent is this tool's own, from its :root", !!css
         && call.o.brand.accent === css.accent,
         (call.o.brand || {}).accent + " vs the page's " + (css || {}).accent);
      /* AND THE LITERAL, because the line above compares the code against a walk of the same
         stylesheet and would agree with it however wrong both were. These eight were read off
         the pages by hand on 2026-09-09; a tool that changes its accent changes this line too,
         which is the point -- it is a statement about the design, not a derivation from it. */
      ok("...and it is the colour this tool is actually drawn in",
         call.o.brand.accent === ACCENTS[file],
         call.o.brand.accent + " vs the expected " + ACCENTS[file]);
      ok("...and so are its ink and muted colours",
         !!css && call.o.brand.ink === css.ink && call.o.brand.mut === css.mut,
         JSON.stringify([(call.o.brand || {}).ink, (call.o.brand || {}).mut]));
      ok("...whose name is the TOOL, not the dataset label",
         !!O.brand && O.brand.name !== O.datasetLabel,
         (O.brand || {}).name + " vs " + O.datasetLabel);
      /* THE AUTH WALL, read from the page rather than declared here. V1DD's segmentation is a
         live CAVE service and the notebook must write its token cell; every other dataset in the
         family is anonymous, and passing the flag there would make Colab install caveclient and
         ask for credentials nobody needs. */
      ok("CAVE token is asked for exactly where the dataset needs one",
         (call.o.segCaveAuth === true) === (want.cave === true),
         want.cave ? "V1DD: graphene://middleauth, no anonymous access"
                   : "anonymous precomputed, no token cell");
      /* ── THE TOKEN GOES IN WHEN THERE IS ONE, AND NEVER OTHERWISE ────────────────────────
         The tick writes a live credential into a .ipynb that then sits in Downloads, so what it
         is gated on matters more than its default (which is ON since 2026-09-09, per Søren: the
         alternative is every δJump run stopping to ask Colab for a token he has already saved).
         Gated on two things, both asserted: a saved token in THIS browser, and a dataset whose
         segmentation is actually behind CAVE. With no token saved -- the state of this headless
         run -- nothing is sent whatever the box says. */
      ok("...and no token is sent when none is saved in this browser", !call.o.caveToken,
         JSON.stringify(call.o.caveToken || "") + "  <- nothing to include, so nothing included");
      const cav = await p.evaluate(() => {
        const row = document.querySelector("#regionBoxes .rbox-row");
        const el = row.querySelector(".colab-cave"), lab = row.querySelector(".colab-cave-lab");
        return { present: !!el, checked: !!(el && el.checked),
                 shown: !!lab && lab.style.display !== "none" };
      });
      ok("the 'include my CAVE token' tick exists only where a token is needed",
         cav.present === (want.cave === true), JSON.stringify(cav));
      ok("...and with no token saved it is cleared, so nothing can be sent",
         !cav.checked, "hidden and unticked -- what is sent matches what is on screen");
      /* Hidden here because this headless run has no saved token: an option that cannot do
         anything is not rendered, the same rule the Nuclei and Vasculature ticks follow. */
      ok("...and stays hidden while no token is saved in this browser", !cav.shown,
         "the Connectivity panel is where a token is entered");
      ok("...and whose include block asks for nothing the dataset lacks",
         !!O.include && (O.include.nuclei === true) === want.nuclei
                     && (O.include.vasc === true) === want.vasc,
         JSON.stringify(O.include));
    }

    await p.evaluate(() => {
      const row = document.querySelector("#regionBoxes .rbox-row");
      const bl = row.querySelector(".colab-blender");
      bl.checked = false; bl.dispatchEvent(new Event("change"));
    });
    await preview();                        // the untick threw βJump's preview away again
    const back = await p.evaluate(() => {
      const out = [];
      UJ.blender.downloadNotebook = o => out.push("blender");
      UJ.colab.downloadNotebook = o => out.push("colab");
      window.alert = m => out.push("alert:" + String(m).slice(0, 60));
      const r2 = document.querySelector("#regionBoxes .rbox-row");
      (r2.querySelector(".rbox-colab") || r2.querySelector(".rb-colab")).click();
      return new Promise(r => setTimeout(() => r(out), 900));
    });
    ok("unticking it goes back to the EM/segmentation notebook",
       back.length === 1 && back[0] === "colab", JSON.stringify(back));

    /* ── AND WITH A TOKEN SAVED, THE TICK WORKS ────────────────────────────────────────────
       Everything above is the default: no token saved, no tick shown, nothing sent. This is the
       feature Søren asked for -- "Please add it as a tick" -- so it is driven for real: seed the
       key the Connectivity panel writes, build a fresh row, tick the box, and check the token
       reaches the exporter AND that unticking it takes it away again. */
    if (want.cave) {
      const T = await p.evaluate(async () => {
        const out = {};
        localStorage.setItem("djump_cave_token", "TEST-CAVE-TOKEN");
        /* A FRESH ROW THROUGH THE PAGE'S OWN BUTTON. makeRegionBoxRow lives inside the page's
           IIFE and is not reachable from here -- and clicking "add box" is what a person does
           anyway, so this exercises the real path rather than a private function. */
        document.getElementById("regionAddBox").click();
        const rows = document.querySelectorAll("#regionBoxes .rbox-row");
        const row = rows[rows.length - 1];
        const lab = row.querySelector(".colab-cave-lab");
        const bl = row.querySelector(".colab-blender");
        bl.checked = true; bl.dispatchEvent(new Event("change"));
        out.shown = lab.style.display !== "none";
        const set = (c, v) => { const el = row.querySelector("." + c); if (el) el.value = String(v); };
        ["rx1", "ry1", "rz1"].forEach(c => set(c, 0));
        ["rx2", "ry2", "rz2"].forEach(c => set(c, 99999999));
        const sent = [];
        UJ.blender.downloadNotebook = o => sent.push(o);
        window.alert = () => {};
        const cav = row.querySelector(".colab-cave");
        /* NOBODY TICKS IT HERE. Søren, 2026-09-09: "Please make include my cave token by default
           ticked on." The row was built by the page's own "add box" button with a token saved,
           so it must arrive ticked and send the token without being touched. */
        out.defaultChecked = cav.checked;
        row.querySelector(".rbox-colab").click();
        await new Promise(r => setTimeout(r, 500));
        out.ticked = (sent[0] || {}).caveToken;
        cav.checked = false; cav.dispatchEvent(new Event("change"));
        /* AND AN UNTICK STICKS. sync() runs again on every Blender toggle, and re-arming the box
           there would undo this a second later -- which is why the page marks it touched. */
        const bl2 = row.querySelector(".colab-blender");
        bl2.checked = false; bl2.dispatchEvent(new Event("change"));
        bl2.checked = true; bl2.dispatchEvent(new Event("change"));
        out.stillUnticked = !cav.checked;
        sent.length = 0;
        row.querySelector(".rbox-colab").click();
        await new Promise(r => setTimeout(r, 500));
        out.unticked = (sent[0] || {}).caveToken;
        localStorage.removeItem("djump_cave_token");
        return out;
      });
      ok("with a token saved, the tick appears", T.shown === true, JSON.stringify(T));
      ok("...already ticked, so a run does not stop to ask for what is saved",
         T.defaultChecked === true, "on by default since 2026-09-09");
      ok("...and sends the token without anybody touching it",
         T.ticked === "TEST-CAVE-TOKEN", JSON.stringify(T.ticked));
      ok("...and unticking it stays unticked through a re-sync",
         T.stillUnticked === true, "a default may not overrule a decision");
      ok("...and unticking it sends none", !T.unticked, JSON.stringify(T.unticked || ""));
    }

    if (file === "xjump.html") {
      /* THE BOX MEANS THE PREVIEW, and with no preview it means nothing. χJump used to walk its
         whole universe, so a box round one Purkinje cell also swept in every granule cell near it
         (Søren, 2026-09-08: "The preview matches only found 1 cell called pc_1 ... but the code
         shows several cells"). It also meant the "run the filter first" refusal could never fire
         on this page, because the list did not depend on the preview at all. */
      const noPrev = await p.evaluate(() => {
        const out = [];
        window.alert = m => out.push("alert:" + String(m).slice(0, 40));
        UJ.blender.downloadNotebook = () => out.push("blender");
        UJ.colab.downloadNotebook = () => out.push("colab");
        const on = document.getElementById("filterRegionOn");
        if (on) { on.checked = true; on.dispatchEvent(new Event("change")); }
        const row = document.querySelector("#regionBoxes .rbox-row");
        // Editing a corner invalidates the preview, which is what a person would do next.
        row.querySelector(".rx1").dispatchEvent(new Event("input"));
        row.querySelector(".rbox-colab").click();
        return new Promise(r => setTimeout(() => r(out), 600));
      });
      ok("with no current preview, χJump refuses rather than guessing",
         noPrev.some(x => x.startsWith("alert:")) && !noPrev.includes("blender"),
         JSON.stringify(noPrev));

      /* cb2's mesh vertices are in METRES on permuted axes. Read as nanometres a cell arrives
         60,000x too small and the scene builds around nothing.

         Asserted against the page's OWN constant, resolved the way the page's renderer resolves
         it, and not against a literal here: what has to hold is that the exporter is handed the
         same value the drawn 3D view uses, whichever object it lives on. A copy is what failed --
         it went into UJ.cfg.mesh, which this page reassigns to {} forty lines later. The literal
         is checked too, because "both undefined" would satisfy the first half on its own. */
      const M = await p.evaluate(() => (window.UJ && UJ.cfg && UJ.cfg.volume
                                        && UJ.cfg.volume.meshVertexToNm) || null);
      ok("χJump's renderer carries the metre-scale, permuted frame",
         JSON.stringify(M) === JSON.stringify([[0, 0, 1e9], [0, 1e9, 0], [1e9, 0, 0]]),
         JSON.stringify(M));
      /* WHERE THE SEGMENTATION IS. cb2 publishes it 1,216 sections BELOW its EM -- z 0..1200
         against -1280..-32 -- and the notebook assumed the two volumes shared an origin, which is
         true of every other dataset here. Søren's run died on it: "Value 311 (index=2) cannot be
         outside of inclusive range -1280 to -32". The page has carried segTranslateZ since
         2026-08-30; this is the panel passing it on, in nanometres and with the sign flipped
         (the page moves the SOURCE up to the tissue; the notebook reads DOWN from the tissue). */
      const zt = await p.evaluate(() => (UJ.cfg.volume && UJ.cfg.volume.segTranslateZ) || 0);
      ok("χJump still declares its segmentation offset", zt === 1216, zt);
      /* WHERE THE MESHES ARE. cb2's are a separate store, not the segmentation's own mesh dir --
         reading them off SEG returned the handful of ids the two stores share, which is what
         Søren's scatter of fragments was. Both the declared path and its parent are offered
         because cloud-volume reads meshes through the volume whose info names a mesh directory,
         and which of the two that is cannot be checked from here; the notebook probes and prints
         which one answered. */
      ok("χJump offers its own mesh store, and its parent",
         Array.isArray(call.o.meshSources) && call.o.meshSources.length === 2
         && /mesh\/nguyen_thomas2022\/cb2\/mesh$/.test(call.o.meshSources[0])
         && /mesh\/nguyen_thomas2022\/cb2$/.test(call.o.meshSources[1]),
         JSON.stringify(call.o.meshSources));
      ok("...as bare paths cloud-volume can open, with no precomputed:// prefix",
         (call.o.meshSources || []).every(x => !/^precomputed:/.test(x)),
         JSON.stringify(call.o.meshSources));
      ok("...and the exporter is handed it in nanometres, negated",
         JSON.stringify(call.o.segOffsetNm) === JSON.stringify([0, 0, -zt * 40]),
         JSON.stringify(call.o.segOffsetNm) + " for " + zt + " sections at 40 nm");
      ok("...and the exporter is handed that same value, not a copy of it",
         !!call && !!call.o.meshVertexToNm
         && JSON.stringify(call.o.meshVertexToNm) === JSON.stringify(M),
         JSON.stringify(call && call.o.meshVertexToNm));
    } else {
      /* And the nanometre datasets must NOT pick up a frame from somewhere: a matrix applied to
         vertices already in nanometres is the same catastrophe in the other direction. */
      ok("no mesh frame is invented for a nanometre dataset",
         !call || !call.o.meshVertexToNm, JSON.stringify(call && call.o.meshVertexToNm));
      /* And a dataset whose two volumes ARE stacked must get a zero offset, not a guess: a
         non-zero one would sample every section from the wrong tissue and say nothing. */
      ok("...and no segmentation offset either, because these volumes are stacked",
         !call || !call.o.segOffsetNm || call.o.segOffsetNm.every(v => v === 0),
         JSON.stringify(call && call.o.segOffsetNm));
      /* And a dataset whose meshes ARE inside its segmentation must send no candidates: an empty
         list is what tells the notebook to skip the probe entirely, and eight wasted fetches on
         every export is a cost with nothing behind it. */
      ok("...and no mesh sources, because these meshes are in the segmentation volume",
         !call || !call.o.meshSources || call.o.meshSources.length === 0,
         JSON.stringify(call && call.o.meshSources));
    }

    await p.close();
  }
  await b.close();

  /* ── the pages that are deliberately left out ───────────────────────────────────────────── */
  console.log("\n=== the ones that get nothing, on purpose ===");
  WITHOUT.forEach(file => {
    const s = fs.readFileSync(page_(file), "utf8");
    ok(MATRIX[file].label + ": no Blender tick", s.indexOf("colab-blender") < 0, MATRIX[file].why);
    ok("  " + MATRIX[file].label + ": ...and the module is not loaded either",
       s.indexOf("core/blenderexport.js") < 0);
  });

  /* ── AND THE EXCLUSION IS ITSELF CHECKED ──────────────────────────────────────────────────
     This is the line that would have caught ηJump. Its matrix entry said "no bounding-box panel
     on this page at all", which was written from memory and was false; the check asserted only
     that the tick was absent, which it was, so the wrong reason passed for weeks and Søren found
     it instead. A page with a box panel CAN carry this button, so a page with one and no Blender
     tick is now a failure that has to be argued with rather than a silence.

     ωJump has a panel too -- an inlined copy of the module, over OME-Zarr through
     core/colabzarr.js rather than core/colabexport.js -- so it is named here as the one
     deliberate exception, in one place, rather than the reason living only in a comment. */
  const EXCEPT = { "wjump.html": "its panel is an inlined copy over OME-Zarr (core/colabzarr.js), "
                                 + "not the shared module -- a real port, not a one-line tick" };
  Object.keys(MATRIX).forEach(file => {
    const s = fs.readFileSync(page_(file), "utf8");
    const hasPanel = s.indexOf('id="regionBoxes"') >= 0;
    if (!hasPanel) return;                       // nothing to hang a button on; nothing to claim
    ok(MATRIX[file].label + " has a box panel, so it offers the Blender file",
       MATRIX[file].blender === true || !!EXCEPT[file],
       EXCEPT[file] || "");
  });
  Object.keys(MATRIX).forEach(file => {
    const s = fs.readFileSync(page_(file), "utf8");
    if (MATRIX[file].blender) return;
    ok(MATRIX[file].label + "'s exclusion is a fact about the page, not a memory of one",
       s.indexOf('id="regionBoxes"') < 0 || !!EXCEPT[file], MATRIX[file].why);
  });

  console.log("\n" + (bad ? "*** " + bad + " FAILED ***" : "RESULT: ALL CHECKS PASSED"));
  process.exit(bad ? 1 : 0);
})();
