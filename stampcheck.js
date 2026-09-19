/* Every page says when it was built, and the date is not a lie.                    2026-09-02

   Søren: "For all of the tools, we should have a build date and time, like for xJump."

   Two failure modes, and the second is the one worth a check file. A page with NO stamp is
   obvious the moment you look at it. A page with a STALE stamp is not: it states a falsehood in a
   monospace font with a tooltip explaining how to trust it, and the only way to catch it is to
   recompute what the script computed.

   So this recomputes the content hashes src/build_stamps.py recorded and fails if a page's content
   has moved since its stamp. Hand-edit ηJump without re-running the stamper and this says so.

   χJump and ωJump are generated -- their build scripts write the stamp as they write the page --
   so for those two the check is only that the stamp is there and filled in. An unreplaced
   __BUILT__ token is a page that says the word "build" and no date.

   Run: node stampcheck.js */
const fs = require("fs"), crypto = require("crypto"), path = require("path");
/* The pages live in the served repo and this check lives in a build folder beside it. See
   pagepath.js -- corepath.js's sibling, for corepath.js's own reason. */
const page = require("./pagepath.js");
const read = f => fs.readFileSync(page(f), "utf8");
const R = [];
const ok = (n, c, d) => { R.push(!!c); console.log((c ? "PASS " : "*** FAIL *** ") + n
                                                   + (d ? "  <- " + d : "")); };

/* The same normalisation build_stamps.py uses: the file with its stamp blanked, so that stamping
   is not itself a change. Kept byte-identical to the Python on purpose -- if the two ever disagree
   the check is worse than useless, because it fails on files that are fine. */
const STAMP_RE = /<span class="build"[^>]*>build [^<]*<\/span>/g;
const hash = s => crypto.createHash("sha256")
  .update(s.replace(STAMP_RE, '<span class="build"></span>'), "utf8").digest("hex");

const STAMPED = ["ujump.html", "djump.html", "pjump.html", "ljump.html", "hjump.html",
                 "bjump.html", "index.html"];
const GENERATED = ["xjump.html", "wjump.html"];

console.log("--- every page carries one ---");
const missing = [];
for (const f of STAMPED.concat(GENERATED)){
  const s = read(f);
  if (!/<span class="build"[^>]*>build \d{4}-\d{2}-\d{2} \d{2}:\d{2}<\/span>/.test(s))
    missing.push(f);
}
ok("all nine pages have a filled stamp", missing.length === 0,
   missing.length ? missing.join(", ") + "  <- no date, or an unreplaced token" : "9 pages");
/* ONE STAMP, not two. The stamper removes any line it wrote before re-inserting; a page that
   accumulated a second one would show two dates and there would be no way to tell which is the
   file's. */
const doubles = STAMPED.concat(GENERATED).filter(f =>
  (read(f).match(/<span class="build"/g) || []).length !== 1);
ok("...and exactly one", doubles.length === 0, doubles.join(", ") || "no page has two");

console.log("\n--- and none of them is stale ---");
let state = {};
/* The same hash over core/*.js the stamper takes, recomputed rather than trusted -- a recorded
   number that nothing recomputes is a number that can quietly stop being true. */
const coreVersion = () => {
  const d = path.join(page.dir(), "core");
  if (!fs.existsSync(d)) return "";
  const h = crypto.createHash("sha256");
  fs.readdirSync(d).filter(n => n.endsWith(".js")).sort().forEach(n => {
    h.update(n, "utf8"); h.update(fs.readFileSync(path.join(d, n)));
  });
  return h.digest("hex").slice(0, 10);
};
try { state = JSON.parse(fs.readFileSync(path.join(page.dir(), ".build_stamps.json"), "utf8")); }
catch (e){ ok("the stamper has run", false, "no .build_stamps.json — run python3 src/build_stamps.py"); }
if (Object.keys(state).length){
  ok("the stamper has run", true, Object.keys(state).length + " pages recorded");
  const stale = [];
  for (const f of STAMPED){
    const rec = state[f];
    if (!rec){ stale.push(f + " (not recorded)"); continue; }
    if (hash(read(f)) !== rec.hash) stale.push(f + " (edited since " + rec.stamp + ")");
  }
  /* THE POINT OF THE WHOLE FILE. A stamp that has fallen behind its own page is worse than no
     stamp, because it is believed. */
  ok("no page has changed since its stamp", stale.length === 0,
     stale.length ? stale.join(", ") + "  <- run python3 src/build_stamps.py"
                  : STAMPED.length + " hand-maintained pages match their recorded content");
  /* And the stamp shown is the stamp recorded -- catching an edit made to the HTML by hand that
     changed the date without changing anything else. */
  const wrong = STAMPED.filter(f => {
    const m = /<span class="build"[^>]*>build ([^<]*)<\/span>/.exec(read(f));
    return !m || !state[f] || m[1] !== state[f].stamp;
  });
  ok("...and shows the date that was recorded for it", wrong.length === 0,
     wrong.join(", ") || "the page and the ledger agree");
}

console.log("\n--- the stamp is styled, so it does not read as stray text ---");
const unstyled = STAMPED.concat(GENERATED).filter(f => !/\.build\{/.test(read(f)));
ok("every page defines .build", unstyled.length === 0,
   unstyled.join(", ") || "a class used in markup and defined nowhere renders as a bug");
/* It has to SAY what it is for. The date alone answers "when"; the tooltip answers "so what",
   which is the question somebody staring at a page that looks out of date is actually asking. */
const untitled = STAMPED.concat(GENERATED).filter(f =>
  !/<span class="build" title="When this file was built/.test(read(f)));
ok("...and explains itself on hover", untitled.length === 0,
   untitled.join(", ") || "cached copy, ctrl-shift-R");


/* ── AND THE FILES THE PAGES LOAD ──────────────────────────────  2026-09-19
   Søren, twice in one evening, looking at a page whose stamp was fresh and whose core/panel.js was
   not. A stamp that covers only the HTML answers "is this page current?" while the question being
   asked is "is what I am looking at current?", and those came apart the moment a fix lived entirely
   in core/. The stamper records the core hash per page; this recomputes it and fails if any page
   was stamped against a different one. */
console.log("\n--- and the stamp covers what the page loads ---");
{
  const want = coreVersion();
  ok("core/ hashes to something", /^[0-9a-f]{10}$/.test(want), want);
  const behind = STAMPED.filter(function(f){
    if (!/<script src="core\//.test(read(f))) return false;   // index.html loads none
    return !state[f] || state[f].core !== want;
  });
  ok("no page is stamped against an older core/", behind.length === 0,
     behind.length ? behind.join(", ") + "  <- run python3 src/build_stamps.py"
                   : STAMPED.length + " hand-maintained pages, one core version");
}

const bad = R.filter(x => !x).length;
console.log("\n" + (bad ? "*** " + bad + " OF " + R.length + " FAILED ***"
                        : "RESULT: ALL " + R.length + " CHECKS PASSED"));
process.exit(bad ? 1 : 0);
