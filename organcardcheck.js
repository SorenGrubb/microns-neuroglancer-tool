/* Can you log an organelle without first identifying the cell?                      2026-09-03

   Søren: "I like this 'Also log an organelle here'. I want the same function on the identity cards
   of all the other tools, so that you don't have to run through the guided identification before
   you can report organelles."

   THE BUG THIS EXISTS TO STOP COMING BACK is not a missing feature -- the identity card has
   carried a "Report an organelle" link since the community-reports block was written. It is that
   the link lived inside a block whose first line was

       if(!reports.length && !mergedGroups.length && !notNucleusReports.length
          && !organelleGroups.length) return;

   so it appeared only on cells somebody had already written about, and was absent on every fresh
   one -- which is exactly the cell you are looking at when you want to log the first organelle on
   it. A check that only ever exercised a cell WITH reports would have passed throughout. So the
   empty-payload case is the first thing here and the populated one is second.

   TWO SUBJECTS, because the family has two implementations and always has:

     - core/panel.js, driven directly with a stubbed backend. µJump, δJump, πJump, λJump and βJump
       all call loadCommunityReports(), so testing the function tests all five -- and testing it in
       isolation means the check does not have to drive five different cell-search UIs to reach the
       same twenty lines.
     - hjump.html, loaded whole, because ηJump deliberately does NOT load core/panel.js (see
       hjump-architecture-correction-2026-08-19) and has its own hand-written pair. Its card is
       driven for real: show a cell, find the toggle, open it, look for the form.

   Run: node organcardcheck.js */
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const core = require("./corepath.js");
const page = require("./pagepath.js");

const R = [];
const ok = (n, c, d) => { R.push(!!c); console.log((c ? "PASS " : "*** FAIL *** ") + n
                                                   + (d !== undefined ? "  <- " + d : "")); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* A window with just enough of a tool page around core/panel.js for loadCommunityReports to run:
   the div it renders into, the globals it reads, and a fetch that answers with whatever payload
   this case is about. */
function panelWindow(payload){
  const vc = new VirtualConsole(); const errs = [];
  vc.on("jsdomError", e => errs.push(String(e.message).slice(0, 160)));
  /* INLINE <script> TAGS, NOT w.eval().                                              2026-09-03

     The first version eval'd ontology.js and panel.js into the window and every ORGANELLE_* const
     came back undefined at click time. Indirect eval puts `var` and function declarations on the
     global object but discards `let`/`const` into a throwaway lexical environment -- so
     ORGANELLE_KIND_OPTIONS_HTML, which the form's markup is built from, simply did not exist by
     the time anything asked for it. Script tags are how a tool page loads these files, and are
     the only way this harness resembles one. */
  const host =
      '<div id="commReports"></div><div id="cellHistory"></div>'
    + "<script>" + fs.readFileSync(core("ontology.js"), "utf8") + "<" + "/script>"
    /* The host globals panel.js resolves at call time. panel.js was extracted FROM ujump.html and
       reads its page's helpers rather than importing them, so a page must supply these -- they
       are stubbed here at their simplest honest behaviour, because what is under test is which
       markup the panel produces, not how µJump formats a coordinate pill. */
    + "<script>"
    + 'var REPORT_ENDPOINT="https://example.invalid/exec";'
    + 'var GOOGLE_VERIFIED=false, GOOGLE_CREDENTIAL="", REPORTER_NAME="", REPORTER_EMAIL="";'
    + 'var CUR_NUCID="864691135", CUR_ROOT="", DATASET_ID="";'
    /* LEAF_NAMES comes from core/ontology.js, which is loaded above -- declaring it
       again here is a SyntaxError that takes the whole script tag down with it. */
    + 'function escHtml(s){return String(s==null?"":s).replace(/[&<>"]/g,'
    + '  function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c];});}'
    + 'function coordSpan(x,y,z){var c=x+", "+y+", "+z;'
    + '  return "<span class=\'idval\' data-c=\'"+c+"\'>"+c+"</span>";}'
    + 'function neuroglancerLinkForPos(){return "#";}'
    + 'function canonSubmitName(n){return n||"";}'
    + "<" + "/script>"
    /* core/organelles.js too, since 2026-09-03: the paste callout in the form calls its
       markersFromLink and rowsFromPoints, and without it wireOrganellePaste removes the callout
       rather than leaving a dead button -- so a harness missing it would test the degraded page
       and report nothing wrong. The five µJump-family pages load it for the same reason. */
    + "<script>" + fs.readFileSync(core("organelles.js"), "utf8") + "<" + "/script>"
    + "<script>" + fs.readFileSync(core("panel.js"), "utf8") + "<" + "/script>";
  const dom = new JSDOM(host, {
    runScripts: "dangerously", url: "https://grubblab.com/ujump.html",
    virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(w){
      w.fetch = () => w.Promise.resolve({ status:200, ok:true,
        text: () => w.Promise.resolve(JSON.stringify(payload)),
        json: () => w.Promise.resolve(payload) });
    }
  });
  return { w: dom.window, D: dom.window.document, errs };
}

const EMPTY = { ok:true, reports:[], mergedGroups:[], notNucleusReports:[], organelleGroups:[] };
const WITH_ORGANELLES = { ok:true, reports:[], mergedGroups:[], notNucleusReports:[],
  organelleGroups:[
    { groupId:"g1", comment:"", structures:[{ kind:"centriole", pointA:"1,2,3", pointB:"" },
                                            { kind:"centriole", pointA:"4,5,6", pointB:"" }] },
    { groupId:"g2", comment:"", structures:[{ kind:"mitochondria", pointA:"7,8,9", pointB:"" }] }
  ] };


/* A Neuroglancer link carrying markers, built the way one arrives: a state object in the hash.
   The layer is deliberately NOT named "organelles" -- the µJump family has no such convention and
   accepts markers from any annotation layer, which is the thing being checked. */
function linkWith(points){
  const st = { position:[1,2,3], layers:[
    { type:"image", name:"EM", source:"precomputed://x" },
    { type:"annotation", name:"annotation", source:"local://annotations",
      annotations: points.map((p,i) => ({ type:"point", point:p, id:"m"+i })) } ] };
  return "https://neuroglancer-demo.appspot.com/#!" + encodeURIComponent(JSON.stringify(st));
}
const M4 = [[10,20,30],[11,21,31],[12,22,32],[13,23,33]];

(async () => {
  // ── 1. the empty cell: the case that used to render nothing at all ──────────────────────
  console.log("--- a cell nobody has reported anything about ---");
  {
    const { w, D, errs } = panelWindow(EMPTY);
    w.loadCommunityReports("864691135", [100, 200, 300]);
    await sleep(60);
    const el = D.getElementById("commReports");
    ok("the card still offers the organelle form", /Also log an organelle here/.test(el.textContent),
       JSON.stringify(el.textContent.slice(0, 70))
       + "  <- this rendered EMPTY before 2026-09-03: the link was inside the block that "
       + "returned early when a cell had no reports");
    ok("...and says nothing is logged yet", /nothing logged yet/.test(el.textContent),
       "  <- the same 'what is already here' line χJump's summary carries");
    ok("...marked as the empty state", el.getAttribute("data-empty") === "1",
       el.getAttribute("data-empty"));
    ok("...with a toggle to open it", !!D.getElementById("commOrganelleToggle"));
    /* THE FORM ITSELF, opened. A link that expands to nothing is the same failure wearing a
       different shape, and the 61-kind select is the thing being reached for. */
    const body = D.getElementById("commOrganelleBody");
    ok("...that is closed to start with", body && body.style.display === "none",
       "  <- the card is dense enough already; nobody arrived asking to fill in a form");
    D.getElementById("commOrganelleToggle").click();
    await sleep(60);
    /* SCOPED TO THE ROW'S SELECT. The paste callout carries a second copy of the same dropdown,
       so an unscoped count is however many selects the form happens to have. */
    const rowSel = body.querySelector(".organ-row-kind");
    ok("...and opens the real form", body.style.display !== "none" && !!rowSel
       && rowSel.querySelectorAll("option").length === 61
       && rowSel.querySelectorAll("optgroup").length === 13,
       rowSel ? rowSel.querySelectorAll("option").length + " kinds in "
                + rowSel.querySelectorAll("optgroup").length + " groups" : "no row select");
    ok("...filed against the cell on screen, with no cell-type claim",
       w.ID_CTX && w.ID_CTX.nucId === "864691135" && !/Identified as/.test(body.textContent),
       (w.ID_CTX && w.ID_CTX.nucId) + "  <- looking at a cell is not a claim about what it is");
    /* ── THE PASTE, which is what makes it quick ────────────────────────────────────────
       Søren, 2026-09-03: "I also wanted the option to paste url, like in xJump where you can log
       a lot of organelles of the same type quickly." Typing was the only way in here: three
       fields per structure, twelve mitochondria is thirty-six numbers off a screen. */
    const rows = () => body.querySelectorAll(".organ-row-kind").length;
    ok("the form offers a paste box", !!D.getElementById("organPasteLink")
       && !!D.getElementById("organPasteKind") && !!D.getElementById("organPasteGo"),
       "  <- and a KIND picker: filling the coordinates and leaving twelve dropdowns to open "
       + "hands most of the work back");
    D.getElementById("organPasteLink").value = linkWith(M4);
    D.getElementById("organPasteGo").click();
    await sleep(60);
    ok("...four markers become four rows", rows() === 4, rows() + " rows",
       "  <- the single untouched default row is replaced, not left above them");
    ok("...each of the kind that was picked",
       [...body.querySelectorAll(".organ-row-kind")].every(k => k.value === "centriole"),
       "  <- χJump's paste made every row a centriole and left you to relabel; this IS centriole "
       + "because that is what the picker said");
    ok("...with the coordinates in place",
       body.querySelectorAll(".orx")[0].value === "10"
       && body.querySelectorAll(".orz")[3].value === "33",
       [...body.querySelectorAll(".orx")].map(i => i.value).join("/"));
    ok("...and the box cleared, with a count", D.getElementById("organPasteLink").value === ""
       && /4 .*rows added from 4 markers/.test(D.getElementById("organPasteNote").textContent),
       D.getElementById("organPasteNote").textContent.slice(0, 70));

    /* A VECTOR KIND PAIRS THE MARKERS. This is the case that fails at the submit button rather
       than at the paste, so it is the one worth a check: four markers are two cilia, and the
       second point has to reach the second FIELD or buildSubs refuses the row. */
    D.getElementById("organPasteKind").value = "cilium";
    D.getElementById("organPasteKind").dispatchEvent(new w.Event("change"));
    ok("the note names the two points, before the clicking",
       /base/i.test(D.getElementById("organPasteNote").textContent)
       && /tip/i.test(D.getElementById("organPasteNote").textContent),
       D.getElementById("organPasteNote").textContent.slice(0, 80)
       + "  <- learning the click order from an error message is learning it too late");
    const before = rows();
    D.getElementById("organPasteLink").value = linkWith(M4);
    D.getElementById("organPasteGo").click();
    await sleep(60);
    ok("...and four markers become TWO cilia", rows() === before + 2,
       (rows() - before) + " rows from 4 markers");
    const last = [...body.querySelectorAll(".organ-row-kind")].pop().closest("div.merged-row");
    ok("...with base and tip both filled", last.querySelector(".orbx").value === "12"
       && last.querySelector(".ortx").value === "13",
       last.querySelector(".orbx").value + " -> " + last.querySelector(".ortx").value
       + "  <- the second field is the one a half-filled row is refused for");
    ok("...and its two-point fields showing",
       last.querySelector(".organ-cilium-fields").style.display !== "none"
       && last.querySelector(".organ-centriole-fields").style.display === "none",
       "  <- a pasted row must reach the same state a chosen one does");

    /* A LINK WITH NOTHING ON IT is a mistake with its own fix, and must not add a row. */
    const held = rows();
    D.getElementById("organPasteLink").value = linkWith([]);
    D.getElementById("organPasteGo").click();
    await sleep(40);
    /* The WORDING moved on 2026-09-10, when line annotations started counting: "no markers" became
       "no annotations", and the sentence now names a line as one of the gestures. Asserted on the
       two things that must be true — nothing added, and a complaint the user can act on — rather
       than on a sentence, which is the half of this that is allowed to improve. */
    ok("a link with nothing on it adds nothing, and says so", rows() === held
       && /no (markers|annotations) on it/.test(D.getElementById("organPasteNote").textContent),
       D.getElementById("organPasteNote").textContent.slice(0, 60));
    D.getElementById("organPasteLink").value = "not a link";
    D.getElementById("organPasteGo").click();
    await sleep(40);
    ok("...and so does something that is not a link at all", rows() === held
       && /Neuroglancer link/.test(D.getElementById("organPasteNote").textContent),
       D.getElementById("organPasteNote").textContent.slice(0, 60));

    D.getElementById("commOrganelleToggle").click();
    await sleep(40);
    ok("...and closes again", body.style.display === "none");
    ok("no page errors", errs.length === 0, errs[0] || "none");
  }

  // ── 2. the populated cell: the count replaces the old two-way label ─────────────────────
  console.log("\n--- a cell that already has organelles logged ---");
  {
    const { w, D } = panelWindow(WITH_ORGANELLES);
    w.loadCommunityReports("864691135", [100, 200, 300]);
    await sleep(60);
    const el = D.getElementById("commReports");
    ok("the same label, whatever is on file", /Also log an organelle here/.test(el.textContent),
       "  <- one wording across the family; the count carries the difference, not the label");
    /* NOT the tally again. The summary two lines up has just listed it and every structure is
       drawn underneath with its coordinate, so a third statement of "2x centriole" is the same
       sentence three times. What the label says instead is what the old one said: a second
       opinion is welcome. */
    ok("...inviting a second opinion rather than repeating the tally",
       /suggest a different location/.test(el.textContent)
       && !/Also log an organelle here . 2/.test(el.textContent.replace(/\s+/g, " ")),
       (el.textContent.replace(/\s+/g, " ").match(/Also log[^L]*/) || [""])[0].trim().slice(0, 80));
    ok("...not marked empty", el.getAttribute("data-empty") === "0",
       el.getAttribute("data-empty"));
    ok("...and the existing reports are still listed", /logged organelle locations/.test(el.textContent),
       "  <- adding a way in must not remove the read-back");
  }

  // ── 3. ηJump, which has its own implementation ──────────────────────────────────────────
  console.log("\n--- ηJump, which does not load core/panel.js ---");
  {
    let html = fs.readFileSync(page("hjump.html"), "utf8");
    html = html.replace(/<script src="(core\/[A-Za-z0-9_.\-]+\.js)"><\/script>/g, (m, rel) => {
      try { return "<script>\n" + fs.readFileSync(core(rel.slice(5)), "utf8") + "\n</script>"; }
      catch (e) { return m; }
    });
    const vc = new VirtualConsole(); const errs = [];
    vc.on("jsdomError", e => errs.push(String(e.message).slice(0, 160)));
    const dom = new JSDOM(html, { runScripts:"dangerously", url:"https://grubblab.com/hjump.html",
      virtualConsole: vc, pretendToBeVisual: true,
      beforeParse(w){ w.fetch = () => new w.Promise(() => {}); w.open = () => null;
                      w.alert = () => {}; } });
    const w = dom.window, D = w.document;
    await sleep(700);
    w.showCell(0, 0, false);
    await sleep(200);
    const np = D.getElementById("nucpanel");
    ok("the cell card offers it", /Also log an organelle here/.test(np.textContent),
       "  <- mounted under the guided-ID call to action, not inside it");
    /* ITS OWN IDS. #nucpanel and #idfpanel are both in the DOM at once, so the card's toggle and
       the guided result's toggle cannot share an id -- whichever wired last would win and the
       other would be a dead link. */
    ok("...under its own id, not the result screen's", !!D.getElementById("nucOrganelleToggle"),
       "  <- #nucpanel and #idfpanel coexist; a shared id leaves one toggle dead");
    const nb = D.getElementById("nucOrganelleInlineBody");
    ok("...closed to start with", nb && nb.style.display === "none");
    D.getElementById("nucOrganelleToggle").click();
    await sleep(80);
    const hRowSel = nb.querySelector(".organ-row-kind");
    ok("...opening the same 61-kind form", nb.style.display !== "none" && !!hRowSel
       && hRowSel.querySelectorAll("option").length === 61,
       (hRowSel ? hRowSel.querySelectorAll("option").length : 0) + " kinds"
       + "  <- the ontology is shared even though the form markup is hJump's own");
    /* READ OFF THE RENDERED FORM, not off w.ID_CTX. hjump.html declares it with `let` at script
       top level, which does NOT become a window property -- a check that reached for w.ID_CTX
       would read undefined and be testing nothing. The form prints what it will file against,
       which is the claim worth checking anyway. */
    ok("...filed against the cell, with no cell-type claim",
       /cell body \d/.test(nb.textContent) && !/Identified as/.test(nb.textContent),
       (nb.textContent.match(/cell body \d+/) || ["none"])[0]);
    /* THE SAME PASTE, in ηJump's own copy of the form. Its markup mirrors core/panel.js's
       deliberately (see the block comment above organelleFlagHtml in hjump.html) but nothing is
       shared except the ontology and the arithmetic -- so it gets its own check rather than being
       assumed to behave because the shared one does. */
    const hRows = () => nb.querySelectorAll(".organ-row-kind").length;
    ok("ηJump's form offers the same paste box", !!D.getElementById("organPasteLink")
       && !!D.getElementById("organPasteKind"));
    D.getElementById("organPasteKind").value = "mitochondria";
    D.getElementById("organPasteKind").dispatchEvent(new w.Event("change"));
    D.getElementById("organPasteLink").value = linkWith(M4);
    D.getElementById("organPasteGo").click();
    await sleep(80);
    ok("...four markers, four mitochondria rows", hRows() === 4
       && [...nb.querySelectorAll(".organ-row-kind")].every(k => k.value === "mitochondria"),
       hRows() + " rows, kinds "
       + [...new Set([...nb.querySelectorAll(".organ-row-kind")].map(k => k.value))].join());
    ok("...with the coordinates in place", nb.querySelectorAll(".orx")[0].value === "10"
       && nb.querySelectorAll(".ory")[3].value === "23",
       [...nb.querySelectorAll(".orx")].map(i => i.value).join("/"));

    /* AND THE GUIDED SCREEN'S OWN COPY STILL WORKS -- the prefix change touched both call sites. */
    w.openIdentify(0); await sleep(80);
    w.eval("renderResult(Object.keys(LEAF_NAMES)[0])"); await sleep(120);
    ok("the guided result keeps its own", !!D.getElementById("idfOrganelleToggle")
       && D.getElementById("idfOrganelleToggle") !== D.getElementById("nucOrganelleToggle"),
       "  <- two mounts, two toggles, both live");
    ok("no page errors", errs.length === 0, errs[0] || "none");
  }

  const bad = R.filter(x => !x).length;
  console.log("\n" + (bad ? "*** " + bad + " of " + R.length + " FAILED ***"
                          : "RESULT: ALL " + R.length + " CHECKS PASSED"));
  process.exit(bad ? 1 : 0);
})();
