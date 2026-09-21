/* Søren's annotation payload, checked against the volumes it claims to be in.     2026-09-03

   191 cells are about to be written into a shared sheet through the live backend, and the two ways
   this can be quietly wrong are both invisible afterwards:

     - THE WRONG DATASET. "Mouse liver" matched three volumes on the roster and "Mouse Kidney"
       three. A cell filed against the wrong one sits at a plausible coordinate in a volume it was
       never seen in, and nothing about the row says so.
     - THE WRONG FRAME. The OpenOrganelle sheets are in nanometres and the WEBKNOSSOS ones in
       voxels, and his spreadsheet does not say which. Read a macaque block as nanometres and every
       cell lands in a 17 x 18 x 3 µm corner of a 168 x 220 x 101 µm volume -- inside it, so no
       error, and wrong by two orders of magnitude.

   So this does not check that the generator ran. It checks the ANSWER: every coordinate inside the
   volume it is filed against, and the cloud spanning enough of that volume to be a set of cells
   scattered through a block rather than a speck in its corner. The span test is the one that would
   have caught the frame mistake, and it is the reason it is here.

   Run: node seedannotcheck.js */
const fs = require("fs"), vm = require("vm");
const pagepath = require("./pagepath.js"), pathM = require("path");
/* ωJump's BUILD inputs live in wjump-build/, which pagepath.js does not search; this check is run
   from there and from the tool folder alike. 2026-09-21. */
const page = (name) => {
  const here = [pathM.join(__dirname, name), pathM.join(__dirname, "..", "wjump-build", name),
                pathM.join(process.cwd(), "..", "wjump-build", name)]
                 .filter(fs.existsSync)[0];
  return here || pagepath(name);
};

const R = [];
const ok = (n, c, d) => { R.push(!!c); console.log((c ? "PASS " : "*** FAIL *** ") + n
                                                   + (d !== undefined ? "  <- " + d : "")); };

/* The roster through its own logic, for the reason the generator does the same: res_nm can be a
   scalar or a vector and the origin can be non-zero, and both rules live in wjump_logic.js. */
const ctx = { console }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
["wjump_config.js", "wjump_logic.js"].forEach(f =>
  vm.runInContext(fs.readFileSync(page(f), "utf8"), ctx));
const W = ctx.UJ.wjump;

const SEED = JSON.parse(fs.readFileSync(page("wjump_seed_cells.json"), "utf8"));
const cells = SEED.cells;

console.log("--- the payload ---");
ok("it carries cells", cells.length > 0, cells.length + " cells");
ok("...and the backend's own address", !!(SEED.backend && /script\.google\.com/.test(SEED.backend.endpoint))
   && SEED.backend.ds === "wjump" && !!SEED.backend.clientId,
   "  <- read from wjump_config.js, not typed into the poster");
ok("every cell names a dataset the roster has",
   cells.every(c => W.byId(c.dataset) && W.usable(W.byId(c.dataset))),
   [...new Set(cells.filter(c => !W.byId(c.dataset)).map(c => c.dataset))].join() || "all 12");
ok("...an identity", cells.every(c => c.identity && c.identity.length > 1),
   [...new Set(cells.map(c => c.identity))].join(", "));
ok("...and an integer voxel position",
   cells.every(c => Array.isArray(c.nucleus) && c.nucleus.length === 3
                    && c.nucleus.every(v => Number.isInteger(v))),
   "  <- the sheet stores voxels; a fractional one would be a nanometre that escaped conversion");

console.log("\n--- inside the volume it is filed against ---");
function box(id){
  const d = W.byId(id), o = d.origin || [0, 0, 0];
  return { lo: [o[2], o[1], o[0]],
           hi: [o[2] + d.shape[2], o[1] + d.shape[1], o[0] + d.shape[0]] };
}
const outside = [];
cells.forEach(c => {
  const b = box(c.dataset);
  const pts = [c.nucleus].concat(c.organelles.flatMap(o =>
    [o.pointA, o.pointB].filter(Boolean).map(s => s.split(",").map(Number))));
  pts.forEach(p => { if (!p.every((v, i) => v >= b.lo[i] && v <= b.hi[i]))
                       outside.push(c.dataset + " row " + c.row + " " + p.join(",")); });
});
ok("every nucleus, centriole and cilium point is inside", outside.length === 0,
   outside.slice(0, 3).join(" | ") || "all "
   + cells.reduce((a,c)=>a+1+c.organelles.reduce((x,o)=>x+(o.pointB?2:1),0), 0) + " points");
/* THE ORIGIN IS PART OF THE BOX and this is where that was learned: wk-mk1-f6-l23 starts at
   (3308, 3352, 21) voxels, and a bounds test against 0..shape drops a real macaque cell at
   x = 17,361 for being "outside" a volume that runs to 18,250. */
const withOrigin = cells.filter(c => { const d = W.byId(c.dataset);
  return (d.origin || [0,0,0]).some(v => v !== 0); });
ok("...including the volumes whose array does not start at zero", withOrigin.length > 0,
   [...new Set(withOrigin.map(c => c.dataset))].join() + "  <- " + withOrigin.length + " cells");

console.log("\n--- and spanning it, not sitting in one corner ---");
/* THE LARGEST SPAN, NOT THE SMALLEST, and the difference is the whole point of the test.

   A frame error is a SCALE error: reading nanometres as voxels, or the reverse, divides all three
   axes by the same factor, so the cloud collapses in every direction at once -- the macaque blocks
   read as nanometres span 1-16% in x, y AND z. A SINGLE tight axis means something else entirely:
   four Meissner cells span 24% / 13% / 63%, which is four cells that happen to sit at similar
   depths in a corpuscle, not a unit mistake. Requiring every axis to be wide would fail that
   honest row; requiring the WIDEST to be wide catches the mistake and lets the biology alone.

   40% sits between the two populations with room on both sides: every dataset here reaches at
   least 63% on its best axis, and a frame error tops out at 16%. Datasets with fewer than three
   cells are exempt -- one Pacinian cell spans nothing, which is not evidence of anything. */
const byds = {};
cells.forEach(c => { (byds[c.dataset] = byds[c.dataset] || []).push(c); });
const thin = [];
Object.keys(byds).sort().forEach(id => {
  const cs = byds[id], b = box(id);
  const span = [0,1,2].map(i => {
    const v = cs.map(c => c.nucleus[i]);
    return (Math.max(...v) - Math.min(...v)) / (b.hi[i] - b.lo[i]);
  });
  const widest = Math.max(...span);
  const line = "   " + id.padEnd(30) + String(cs.length).padStart(3) + " cells   span "
             + span.map(v => (v*100).toFixed(0).padStart(3) + "%").join(" ");
  if (cs.length >= 3 && widest < 0.40){ thin.push(id + " " + (widest*100).toFixed(0) + "%");
                                        console.log(line + "   <-- a speck"); }
  else console.log(line + (cs.length < 3 ? "   (too few to judge)" : ""));
});
ok("every dataset's cells reach across it on at least one axis", thin.length === 0,
   thin.join(", ") || "the tightest widest axis is 63% — a frame error tops out at 16%");

console.log("\n--- the organelles ---");
const orgs = cells.flatMap(c => c.organelles);
ok("a centriole is one point, a cilium is two",
   orgs.every(o => o.kind === "centriole" ? (o.pointA && !o.pointB)
                                          : (o.kind === "cilium" && o.pointA && o.pointB)),
   orgs.length + " records  <- a half-filled cilium is refused by buildSubs and must not be sent");
ok("...and no cell claims more than one of each",
   cells.every(c => new Set(c.organelles.map(o => o.kind)).size === c.organelles.length),
   "  <- one centriole and one cilium per row is the shape of his sheet");

console.log("\n--- what was left out, on purpose ---");
/* The generator reports these; the check asserts they are ABSENT from the payload, because
   "skipped" and "silently dropped" look identical in a log nobody re-reads. */
ok("no placenta cells", !cells.some(c => /placenta/i.test(c.label)),
   "  <- no placenta volume is on the roster");
ok("no hippocampus cells", !cells.some(c => /hippocampus/i.test(c.label)),
   "  <- βJump's dataset, and the frame is unconfirmed");
ok("...and 191 of his 205 rows are here", cells.length === 191,
   cells.length + " = 205 - 6 placenta - 8 hippocampus");

/* ── AND THE POSTER ITSELF, RUN AGAINST A FAKE BACKEND ───────────────────────────────────────
   Everything above checks the payload. This checks the PAGE that sends it -- driven for real in
   chromium, with the Apps Script endpoint intercepted, so what the handlers would receive can be
   read field by field.

   That is the half a payload check cannot reach. A field name the handler does not read is not an
   error: doPost writes the row, answers ok, and the column is blank for ever. wjumpNucleusFound
   reads x_vox/y_vox/z_vox; wjumpNucleusName reads nucleusKey and identity; the organelle branch
   reads nucleusId, kind, pointA, pointB, groupId, subIndex, subCount. Each of those is asserted
   against a real captured request rather than against the source of the page. */
(async () => {
  const { chromium } = require("./node_modules/playwright");
  const path = require("path");
  console.log("\n--- the poster, against a fake backend ---");
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
                                    args: ["--no-sandbox"] });
  const p = await b.newPage({ viewport: { width: 960, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(String(e.message)));
  const sent = [];
  /* Google's script is not reachable from here and is not the subject; stubbed so the page can
     reach a signed-in state without it. */
  await p.route("**/gsi/client", r => r.fulfill({ status: 200, contentType: "text/javascript",
    body: "window.google={accounts:{id:{initialize(o){window.__cb=o.callback;},renderButton(el){el.textContent='[Google button]';}}}};" }));
  let n = 0;
  await p.route("**/macros/s/**", route => {
    const body = JSON.parse(route.request().postData());
    sent.push(body);
    /* A find answers with a key, the way the real handler does; everything else just says ok. */
    const reply = body.type === "wjump_nucleus_found"
      ? { ok: true, merged: false, nucleusKey: body.dataset + ":" + (++n) }
      : { ok: true };
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reply) });
  });
  /* ── SERVED, NOT OPENED FROM A FOLDER ──────────────────────────────────────────────────
     Søren opened the first build by double-clicking it and got Google's own "Adgangen er
     blokeret: Godkendelsesfejl / Fejl 400: invalid_request", which reads as a broken app. It is
     not: Google Identity Services only runs on an origin registered for the OAuth client, and a
     file:// page has no origin at all. So the page must (a) say that itself rather than leaving
     Google to, and (b) work when it IS served. Both are checked, because fixing the message and
     breaking the served case would look like success. */
  await p.route("https://grubblab.com/wjump_seed_post.html", r => r.fulfill({ status:200,
    contentType:"text/html", body: fs.readFileSync(page("wjump_seed_post.html"), "utf8") }));
  await p.goto("file://" + page("wjump_seed_post.html"));
  await p.waitForTimeout(600);
  ok("opened from a folder, it says why sign-in cannot work", await p.evaluate(() => {
       const b = document.getElementById("origin");
       return b.style.display !== "none" && /not from the website/.test(b.textContent)
              && /grubblab\.com/.test(b.textContent);
     }), "  <- Google's own message blames the app; this one names the actual cause and the fix");
  await p.goto("https://grubblab.com/wjump_seed_post.html");
  await p.waitForTimeout(600);
  ok("...and served, it offers the button instead", await p.evaluate(() =>
       document.getElementById("origin").style.display === "none"
       && document.getElementById("gsi").children.length + document.getElementById("gsi").textContent.length > 0),
     "  <- the warning must not fire on the origin the tools actually sign in from");
  /* A credential shaped like a Google ID token: header.payload.signature, the payload base64url
     JSON, because the page decodes it to show who it is posting as. */
  const jwt = "x." + Buffer.from(JSON.stringify({ name: "Søren Grubb", email: "soren@grubb.dk" }))
    .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") + ".y";
  await p.evaluate(t => window.__cb({ credential: t }), jwt);
  await p.evaluate(() => { window.confirm = () => true; localStorage.removeItem("wjump_seed_done_v1"); });
  await p.click("#go");
  await p.waitForFunction(() => /^finished/.test(document.getElementById("stat").textContent),
                          null, { timeout: 180000 });

  const finds = sent.filter(x => x.type === "wjump_nucleus_found");
  const names = sent.filter(x => x.type === "wjump_nucleus_name");
  const orgs  = sent.filter(x => x.type === "organelle_location");
  ok("it posts one find, one name and the organelles for every cell",
     finds.length === cells.length && names.length === cells.length
     && orgs.length === cells.reduce((a, c) => a + c.organelles.length, 0),
     finds.length + " finds, " + names.length + " names, " + orgs.length + " organelles");
  ok("...every one carrying the credential and the ds", sent.every(x => x.credential && x.ds === "wjump"),
     "  <- doPost rejects anything without a verified token before writing a row");
  ok("a find sends the fields the handler reads",
     finds.every(f => f.dataset && Number.isInteger(f.x_vox) && Number.isInteger(f.y_vox)
                      && Number.isInteger(f.z_vox)),
     JSON.stringify({ dataset: finds[0].dataset, x_vox: finds[0].x_vox, y_vox: finds[0].y_vox,
                      z_vox: finds[0].z_vox })
     + "  <- x_vox/y_vox/z_vox, not x_nm: sending the wrong pair reads as 0 and files every cell "
     + "at the origin");
  ok("a name is attached to the key the find came back with",
     names.every(nm => /^[\w.\-]+:\d+$/.test(nm.nucleusKey) && nm.identity),
     names[0].nucleusKey + " = " + names[0].identity
     + "  <- the backend assigns the key; nothing here guesses one");
  ok("...as his own measurement, not a confirmation of somebody's tally",
     names.every(nm => nm.certainty === 5 && nm.sawTally === false),
     "  <- sawTally records whether the labeller had seen the crowd first, and he had not");
  ok("an organelle carries its group, its kind and its points",
     orgs.every(o => o.nucleusId && o.groupId && o.subIndex >= 1 && o.subCount >= 1
                     && (o.kind === "centriole" || o.kind === "cilium") && o.pointA),
     orgs.length + " records  <- groupId + subIndex/subCount is what makes a centriole and its "
     + "cilium read as one visit");
  ok("...a cilium with both ends, a centriole with one",
     orgs.every(o => o.kind === "cilium" ? !!o.pointB : o.pointB === ""),
     "  <- the sheet's pointB column is what a vector kind means");
  ok("...and every group belongs to its own cell",
     orgs.every(o => o.groupId.indexOf(o.nucleusId) === 0),
     "  <- µJump's convention: <key>_<ms>_org");
  /* RESUMABLE, and this is the property that makes a ten-minute run over a flaky connection
     usable at all. A second run must send nothing. */
  await p.evaluate(() => { document.getElementById("log").innerHTML = ""; });
  const before = sent.length;
  await p.click("#go");
  await p.waitForFunction(() => /^finished/.test(document.getElementById("stat").textContent),
                          null, { timeout: 60000 });
  ok("running it again sends nothing", sent.length === before,
     (sent.length - before) + " further posts  <- every cell that landed is remembered, so a run "
     + "interrupted half way picks up where it stopped");
  ok("no page errors", errs.length === 0, errs[0] || "none");
  await b.close();

  const bad = R.filter(x => !x).length;
  console.log("\n" + (bad ? "*** " + bad + " of " + R.length + " FAILED ***"
                          : "RESULT: ALL " + R.length + " CHECKS PASSED"));
  process.exit(bad ? 1 : 0);
})();
