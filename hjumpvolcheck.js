/* ηJump keeps what it computes: the volume, and the contacts run.               2026-09-03

   Søren: "In the hJump master cell list, there is a computed_volume_um3 column, however, when I
   press compute volume in the tool, nothing appears in the master cell list. I also don't see
   anywhere else it is saved."

   It was not saved: the button fetched the meshes, decoded them, integrated the geometry, printed
   the number and posted nothing. Which is a failure no check could have caught, because every
   check there was asked whether the NUMBER appeared.

   So this one asks what was POSTED, and what the sheet will do with it — the fields are not
   decoration:

     rootId      is what Code.gs upserts on, so a recalculation overwrites one row
     nucleusId   is the CELL BODY id, which is what MasterList.gs turns into the "N:<id>" row in
                 the master cell list Søren is reading. Send the c3 id here instead and the write
                 succeeds, the sheet fills, and his column stays empty — the exact failure that
                 would look fixed
     cellType    is what the page is calling the cell, community identity first
     nucVolumeUm3 is H01's own precomputed soma volume for the same cell

   UJ.mesh is stubbed rather than loaded: what is under test is the write, and decoding real Draco
   meshes over the network in jsdom would be testing core/mesh.js's decoder for the third time.

   Run: node hjumpvolcheck.js */
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const core = require("./corepath.js");
const page = require("./pagepath.js");

const R = [];
const ok = (n, c, d) => { R.push(!!c); console.log((c ? "PASS " : "*** FAIL *** ") + n
                                                   + (d !== undefined ? "  <- " + d : "")); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let html = fs.readFileSync(page("hjump.html"), "utf8");
  html = html.replace(/<script src="(core\/[A-Za-z0-9_.\-]+\.js)"><\/script>/g, (m, rel) => {
    try { return "<script>\n" + fs.readFileSync(core(rel.slice(5)), "utf8") + "\n</script>"; }
    catch (e) { return m; }
  });

  const posts = [], gets = [];
  const vc = new VirtualConsole(); const errs = [];
  vc.on("jsdomError", e => errs.push(String(e.message).slice(0, 160)));
  /* One volume already on the sheet, for a cell this run does not touch, so the read-back can be
     asked whether it arrives without the click. */
  let roster = { ok: true, computedVolumes: [] };
  const dom = new JSDOM(html, { runScripts:"dangerously", url:"https://grubblab.com/hjump.html",
    virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(w){
      w.open = () => null; w.alert = () => {};
      w.fetch = (url, opt) => {
        const u = String(url);
        if (!opt || opt.method !== "POST"){
          gets.push(u);
          if (/computedVolumes=/.test(u))
            return w.Promise.resolve({ ok:true, status:200,
              json: () => w.Promise.resolve(roster),
              text: () => w.Promise.resolve(JSON.stringify(roster)) });
          /* Everything else this page reads at load: empty is a real answer for all of them. */
          return w.Promise.resolve({ ok:true, status:200,
            json: () => w.Promise.resolve({ ok:true }),
            text: () => w.Promise.resolve("{\"ok\":true}") });
        }
        posts.push(JSON.parse(opt.body));
        return w.Promise.resolve({ ok:true, status:200,
          json: () => w.Promise.resolve({ ok:true }),
          text: () => w.Promise.resolve("{\"ok\":true}") });
      };
    } });
  const w = dom.window, D = w.document;
  /* Kept by name: the refused-save section below deliberately replaces w.fetch with one that
     answers ok:false, and later sections need the recording one back. */
  const recordingFetch = w.fetch;
  await sleep(700);

  /* The mesh half, stubbed at the boundary the button calls. rootIds of length 3 is a cell with
     two community-proposed segment ids folded in, which is the case the fragment count exists
     for. */
  w.UJ.mesh = w.UJ.mesh || {};
  w.UJ.mesh.computeVolume = () => w.Promise.resolve({
    volumeUm3: 4321.55, vertices: 120345, rootIds: ["1", "2", "3"] });

  console.log("--- before anybody clicks ---");
  w.showCell(0, 0, false);
  await sleep(200);
  ok("the page reads the saved volumes", gets.some(u => /computedVolumes=1/.test(u))
     && gets.some(u => /computedVolumes=1.*ds=hjump/.test(u)),
     "public read, ds-scoped — H01's own sheet, not µJump's");

  console.log("\n--- signed out ---");
  D.querySelector(".meshvol").click();
  await sleep(200);
  ok("the volume is still computed and shown",
     /4,?322/.test(D.getElementById("meshvolResult").textContent),
     D.getElementById("meshvolResult").textContent.slice(0, 60));
  ok("...and nothing is posted", posts.length === 0,
     "reading is public; writing is not — the same rule as every other tool here");
  ok("...but it says so, rather than looking saved",
     /sign in with Google to save it/.test(D.getElementById("meshvolResult").textContent),
     "a measurement that reached nothing must not look like one that did");

  console.log("\n--- signed in ---");
  /* THROUGH THE PAGE'S OWN CALLBACK. hjump.html declares GOOGLE_VERIFIED and friends with `let`
     at script top level, so they are NOT window properties -- assigning w.GOOGLE_VERIFIED makes a
     new global the page never reads, and the check would be testing the harness. handleGoogleCred
     is a function declaration, so it IS on the window, and it is exactly what Google's callback
     calls. */
  const fakeJwt = "x." + Buffer.from(JSON.stringify({ name:"Søren Grubb",
    email:"soren@grubb.dk" })).toString("base64").replace(/=+$/, "") + ".y";
  w.handleGoogleCred({ credential: fakeJwt });
  D.querySelector(".meshvol").click();
  await sleep(250);
  const p = posts.filter(x => x.type === "save_computed_volume")[0];
  ok("it posts the volume", !!p, p ? "one save_computed_volume" : "nothing was posted");
  ok("...carrying the credential and ds", !!p && p.credential === fakeJwt
     && p.ds === "hjump", p ? p.ds : "");
  /* THE TWO IDS, and which is which is the whole point. rootId is what the sheet upserts on;
     nucleusId is what the master cell list keys its row by. */
  /* READ OFF THE RENDERED CARD, for the same reason the sign-in goes through the callback: HSB
     and HVB are page-scoped `let`s. The card prints both ids, and what it prints is the claim
     worth checking anyway. */
  const idVal = k => {
    const row = [...D.querySelectorAll("#nucpanel .idrow")]
      .find(r => (r.querySelector(".k") || {}).textContent === k);
    return row ? row.querySelector(".idval").getAttribute("data-c") : "";
  };
  /* Number(x || [0,0])[1] indexes a NUMBER and is always undefined -- the parentheses go round
     the match, not round the Number(). Caught by this check printing "undefined" for a soma
     volume the page had rendered correctly. */
  /* THE .meta THAT SAYS "Soma", not the first one on the card.        2026-09-20
     This used to be querySelector("#nucpanel .meta"), which worked only while the soma line
     happened to be the first of its class in the panel. #commReports arrived above it that
     afternoon -- also a .meta, and empty until the backend answers -- and this read 0 off it and
     reported a real posted volume as a mismatch. The line being checked identifies itself. */
  const somaText = [...D.querySelectorAll("#nucpanel .meta")]
    .map(el => (el.textContent || "").replace(/,/g, ""))
    .find(t => /Soma\s+[\d.]+/.test(t)) || "";
  const somaUm3 = Number((somaText.match(/Soma\s+([\d.]+)/) || [0, 0])[1]);
  ok("...keyed on the c3 segment for the sheet", !!p && p.rootId === idVal("c3 segment"),
     (p ? p.rootId : "") + " vs card " + idVal("c3 segment"));
  ok("...and on the CELL BODY for the master cell list",
     !!p && p.nucleusId === idVal("cell body"),
     (p ? p.nucleusId : "") + " vs body " + idVal("cell body")
       + "  <- MasterList.gs writes N:<nucleusId>; the c3 id here would fill the sheet and leave "
       + "his column empty");
  ok("...with the number, the vertices and the fragment count",
     !!p && p.volumeUm3 === 4321.55 && p.vertices === 120345 && p.fragmentCount === 3,
     p ? [p.volumeUm3, p.vertices, p.fragmentCount].join(" · ") : "");
  ok("...and H01's own soma volume beside it",
     !!p && Number(p.nucVolumeUm3) > 0
     && Math.abs(Number(p.nucVolumeUm3) - somaUm3) < 1,
     (p ? p.nucVolumeUm3 : "") + " µm³ against the panel's own " + somaUm3
       + "  <- one paired measurement beats two unrelated averages");
  ok("...and the type the page is showing", !!p && typeof p.cellType === "string" && !!p.cellType,
     p ? p.cellType : "");
  ok("the page says it was saved",
     /saved to the master cell list/.test(D.getElementById("meshvolResult").textContent),
     D.getElementById("meshvolResult").textContent.slice(-40));
  ok("...and the button becomes Recalculate",
     /Recalculate/.test(D.querySelector(".meshvol").textContent),
     "a second click is then deliberate, not an accidental duplicate");

  console.log("\n--- a refused save ---");
  const before = D.getElementById("meshvolResult").textContent;
  w.fetch = (url, opt) => {
    if (opt && opt.method === "POST")
      return w.Promise.resolve({ ok:true, status:200,
        json: () => w.Promise.resolve({ ok:false, error:"unauthenticated" }),
        text: () => w.Promise.resolve("{\"ok\":false,\"error\":\"unauthenticated\"}") });
    return w.Promise.resolve({ ok:true, status:200,
      json: () => w.Promise.resolve({ ok:true }), text: () => w.Promise.resolve("{}") });
  };
  D.querySelector(".meshvol").click();
  await sleep(250);
  const after = D.getElementById("meshvolResult").textContent;
  /* THE SERVER'S WORD IS TRANSLATED NOW (2026-09-03): postReport turns an "unauthenticated"
     refusal into the sentence about the hour-long token, so what the line must contain is the
     failure and the reason a person can act on -- not the backend's vocabulary. */
  ok("keeps the number and says what failed",
     /4,?322/.test(after) && /saving it failed/.test(after)
     && /expired/.test(after) && !/unauthenticated/.test(after),
     after.slice(0, 110) + "  <- three mesh fetches went into that number either way");

  console.log("\n--- a cell somebody else measured ---");
  /* A SECOND PAGE, because the roster has to be there BEFORE the load: HJUMP_VOLS is a page-scoped
     `let`, so a check cannot reach in and clear it -- and the case worth testing is the real one
     anyway, somebody opening a cell that was measured before they arrived. */
  {
    const roster2 = { ok:true, computedVolumes: [
      { rootId:"1", nucleusId:"1", cellType:"Pyramidal neuron",
        volumeUm3: 7777.7, vertices: 1, fragmentCount: 1 } ] };
    const vc2 = new VirtualConsole(); const errs2 = [];
    vc2.on("jsdomError", e => errs2.push(String(e.message).slice(0, 160)));
    const dom2 = new JSDOM(html, { runScripts:"dangerously",
      url:"https://grubblab.com/hjump.html", virtualConsole: vc2, pretendToBeVisual: true,
      beforeParse(w2){
        w2.open = () => null; w2.alert = () => {};
        w2.fetch = (url, opt) => w2.Promise.resolve({ ok:true, status:200,
          json: () => w2.Promise.resolve(/computedVolumes=/.test(String(url))
            ? roster2 : { ok:true }),
          text: () => w2.Promise.resolve("{\"ok\":true}") });
      } });
    const w2 = dom2.window, D2 = dom2.window.document;
    await sleep(700);
    /* Cell 0's own cell-body id is 1 in the embedded data, which is what the roster row above is
       keyed by -- asserted rather than assumed, since the whole point is the key matching. */
    w2.showCell(0, 0, false);
    await sleep(250);
    const body2 = [...D2.querySelectorAll("#nucpanel .idrow")]
      .find(r => (r.querySelector(".k") || {}).textContent === "cell body");
    ok("the fixture matches the cell's own body id",
       !!body2 && body2.querySelector(".idval").getAttribute("data-c") === "1",
       body2 ? body2.querySelector(".idval").getAttribute("data-c") : "no row");
    ok("arrives with the volume already printed",
       /7,?778|7,?777/.test(D2.getElementById("meshvolResult").textContent),
       D2.getElementById("meshvolResult").textContent.slice(0, 70));
    ok("...and its button already reads Recalculate",
       /Recalculate/.test(D2.querySelector(".meshvol").textContent),
       "which is how somebody can see it was saved without opening the spreadsheet");
  }

  /* ── THE CONTACTS RUN ──────────────────────────────────────────────────────────  2026-09-03
     The write audit's other ηJump finding: "Find cell contacts" fetched and decoded every
     neighbour's mesh, measured real contact points, and kept them in a Map that dies with the tab
     — while `cell_contacts_batch` had been in the backend since August and four other tools sent
     it. hjumpSaveContacts is called with the rows the run produced; driven directly, because
     driving the button would mean decoding real Draco meshes over a network jsdom does not have. */
  console.log("\n--- the contacts run ---");
  {
    /* SIGNED IN AGAIN. The refused-save section above made the backend answer "unauthenticated",
       and postReport now treats that as proof the token is dead — so the page is correctly
       refusing to write until somebody signs in again. That is the behaviour under test there;
       here it just has to be undone first. */
    w.fetch = recordingFetch;
    w.handleGoogleCred({ credential: fakeJwt });
    /* Two neighbours: one touching at 25 nm with three patches, one that found nothing. The rows
       are exactly the shape runContacts() returns — {i, dist, points:[{point,dist}]} in µm. */
    const ROWS = [
      { i: 1, dist: 8.2, points: [ { point:[10,20,30], dist:0.040 },
                                   { point:[11,21,31], dist:0.025 },
                                   { point:[12,22,32], dist:0.031 } ] },
      { i: 2, dist: 31.0, points: [] } ];
    const before = posts.length;
    const note = w.hjumpSaveContacts(0, ROWS, 0.04, 1);
    await sleep(60);
    const cc = posts.filter(x => x.type === "cell_contacts_batch").slice(-1)[0];
    ok("a finished run posts the batch", !!cc && posts.length === before + 1,
       cc ? "one cell_contacts_batch" : "nothing was posted");
    ok("...and nothing was withheld from the person", note === "", "\"" + note + "\"");
    ok("...keyed on this cell's body id and c3 segment",
       !!cc && cc.nucleusId === idVal("cell body") && cc.rootId === idVal("c3 segment"),
       cc ? cc.nucleusId + " · " + cc.rootId : "-");
    ok("...one pair, not two: the row that found nothing is left out",
       !!cc && cc.pairs.length === 1,
       (cc ? cc.pairs.length : 0) + "  <- this run measures no nearest approach, and a missing "
       + "minDistanceNm would be stored as 0, which in that sheet means touching perfectly");
    ok("...with the CLOSEST patch, not the first one",
       !!cc && cc.pairs[0].minDistanceNm === 25,
       cc ? cc.pairs[0].minDistanceNm + " nm of 40 · 25 · 31" : "-");
    ok("...the touch-point count the graphs need", !!cc && cc.pairs[0].touchPointCount === 3);
    ok("...a voxel coordinate in this page's own frame",
       !!cc && Number(cc.pairs[0].contactVoxelX) > 0 && Number(cc.pairs[0].contactVoxelZ) > 0,
       cc ? [cc.pairs[0].contactVoxelX, cc.pairs[0].contactVoxelY,
             cc.pairs[0].contactVoxelZ].join(", ") : "-");
    ok("...and flagged as a default-settings run", !!cc && cc.usedDefaultSettings === true,
       "only comparable runs are averaged by ?meshContactTypeStats=1");

    ok("a run that found nothing posts nothing",
       w.hjumpSaveContacts(0, [{ i:2, dist:31, points:[] }], 0.04, 1) === ""
       && posts.filter(x => x.type === "cell_contacts_batch").length === 1,
       "nothing found is not a refusal, and not a row either");
  }

  ok("no page errors", errs.length === 0, errs[0] || "none");

  const bad = R.filter(x => !x).length;
  console.log(bad ? `\n*** ${bad} of ${R.length} FAILED ***`
                  : `\nRESULT: ALL ${R.length} CHECKS PASSED`);
  process.exit(bad ? 1 : 0);
})();
