/* No two tools may write to the same browser-storage key.                          2026-09-05

   Søren: "For some reason the refresh live data in pJump makes uJump show the pJump data, and vice
   versa. These dashboards should only show their own data."

   pjump.html was derived from ujump.html and kept four of its localStorage keys verbatim. Every
   tool is served from grubblab.com, so localStorage is ONE store shared by all nine pages: the
   dashboard bundle, the navigation history, and two panel-open flags were each a single entry that
   two different volumes took turns overwriting. The dashboard one is what he saw. The navigation
   one is worse and nobody had noticed: it stores nucleus ids, pinky100's (4809-7570) are also valid
   minnie65 ids, so a cell visited in πJump appeared in µJump's "Recently viewed" list and jumped to
   a DIFFERENT REAL CELL when clicked.

   Fixing the four keys fixes today. This file is what stops the fifth, because the next page
   derived from an existing one will inherit exactly the same way:

     1. every storage key a page uses is found -- literals, the *_KEY constants, and the second
        argument of persistDetailsOpen();
     2. no key may be used by two pages, except a NAMED list of deliberately shared ones, each with
        its reason;
     3. every other key must begin with its own page's prefix;
     4. and no page may build a key the extractor cannot see -- a computed key would silently
        escape rules 2 and 3, so an unrecognised argument expression is itself a failure.

   Rule 4 is the one that keeps this check honest as the pages change. Reading the shipped HTML
   directly, no browser needed.

   Run from this folder:  node storagekeycheck.js */
const fs = require("fs");
const page_ = require("./pagepath.js");

const R = [];
const ok = (n, c, d) => { R.push(!!c); console.log((c ? "PASS " : "*** FAIL *** ") + n
                                                   + (d !== undefined ? "  <- " + d : "")); };

const PAGES = ["ujump.html", "djump.html", "pjump.html", "hjump.html", "bjump.html",
               "ljump.html", "wjump.html", "xjump.html", "index.html"];

/* Each page's own namespace. A page not listed here has no keys of its own -- it may still use the
   shared ones below. */
const PREFIX = { "ujump.html": "ujump_", "djump.html": "djump_", "pjump.html": "pjump_",
                 "hjump.html": "hjump_", "xjump.html": "xjump_",
                 /* λJump gained one of its own on 2026-09-10 with the "Recently viewed cells"
                    panel (ljump_recent_v1). Listed here so the prefix rule applies to it rather
                    than reading it as a page borrowing somebody else's namespace. */
                 "ljump.html": "ljump_",
                 /* The index is not a tool and has no Greek letter, so its namespace is the site's
                    own name -- grubblab_lb_pooled_v1, the pooled leaderboard cache added the same
                    day. Anything it stores has to be as clearly its own as a tool's is. */
                 "index.html": "grubblab_" };

/* DELIBERATELY SHARED, each with the reason it is shared. Anything not on this list that appears
   on two pages is the bug this file exists for. */
const SHARED = {
  "ujump_theme":   "one light/dark preference across the family (δJump is the odd one out with its own)",
  "reporterName":  "the same person is reporting on every tool",
  "reporterEmail": "likewise",
  "cave_token":    "µJump and πJump only — minnie65 and pinky100 are both CAVE datastacks one token reaches"
};

/* Which pages each shared key is allowed on, where that is narrower than "anywhere". */
const SHARED_ONLY_ON = { "cave_token": ["ujump.html", "pjump.html"] };

/* ── what keys does a page use? ───────────────────────────────────────────────────────────────*/
function keysOf(file){
  const src = fs.readFileSync(page_(file), "utf8");
  const keys = new Set(), unresolved = [];

  /* SOME_KEY="literal" — the indirection the four broken keys hid behind. const, let or var: the
     rule this file enforces is that a key is a LITERAL somebody can read and audit, and how it was
     declared has nothing to do with that. index.html's own LB_CACHE_KEY is a `var` (it lives in an
     IIFE alongside code that wants function scope) and was reported as an unreadable expression
     until this said so. */
  const consts = {};
  const cre = /(?:const|let|var)\s+([A-Z][A-Z0-9_]*_KEY)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = cre.exec(src))) { consts[m[1]] = m[2]; keys.add(m[2]); }

  /* function someKey(){ return "literal"; } — a third indirection, and a legitimate one: ηJump's
     hjumpStepLsKey() is exactly this. Resolved rather than merely tolerated, so the key it returns
     is held to the same two rules as any other. */
  const fns = {};
  const fre = /function\s+(\w+)\s*\(\s*\)\s*\{\s*return\s+"([^"]*)"\s*;?\s*\}/g;
  while ((m = fre.exec(src))) fns[m[1] + "()"] = m[2];

  /* persistDetailsOpen(elementId, storageKey) — a second indirection, through a parameter. */
  const pre = /persistDetailsOpen\(\s*"[^"]*"\s*,\s*"([^"]*)"\s*\)/g;
  while ((m = pre.exec(src))) keys.add(m[1]);

  /* Every actual call, so nothing can be reached by a route this file does not model. */
  const call = /(?:local|session)Storage\.(?:getItem|setItem|removeItem)\(\s*([^,)]+)/g;
  while ((m = call.exec(src))) {
    /* The capture stops at the first ")", so a zero-argument call arrives as "someKey(" — put its
       parenthesis back rather than reporting it as an expression nobody can read. */
    let arg = m[1].trim();
    if (arg.slice(-1) === "(") arg += ")";
    const lit = /^"([^"]*)"$/.exec(arg);
    if (lit) { keys.add(lit[1]); continue; }
    if (consts[arg] !== undefined) continue;                 /* a const resolved above */
    if (fns[arg] !== undefined) { keys.add(fns[arg]); continue; }   /* a key behind a function */
    if (arg === "storageKey") continue;                      /* persistDetailsOpen's parameter */
    unresolved.push(arg);
  }
  return { keys: Array.from(keys).sort(), unresolved: unresolved };
}

const USED = {};
PAGES.forEach(f => { USED[f] = keysOf(f); });

console.log("--- what each page stores ---");
PAGES.forEach(function(f){
  const u = USED[f];
  console.log("    " + f.replace(".html", "").padEnd(7) + " "
              + (u.keys.length ? u.keys.join(", ") : "(none)"));
});

/* ── 4: nothing is computed out of sight ──────────────────────────────────────────────────────*/
console.log("\n--- every key is one this check can see ---");
const computed = PAGES.filter(f => USED[f].unresolved.length);
ok("no page builds a storage key from an expression",
   computed.length === 0,
   computed.length ? computed.map(f => f + ": " + USED[f].unresolved.join(" | ")).join("; ")
                   : "literals, *_KEY constants and persistDetailsOpen only"
                     + "  <- a computed key would escape both rules below");

/* ── 2: no accidental sharing ─────────────────────────────────────────────────────────────────*/
console.log("\n--- no two tools write to the same key ---");
const owners = {};
PAGES.forEach(f => USED[f].keys.forEach(k => { (owners[k] = owners[k] || []).push(f); }));
const collisions = Object.keys(owners).filter(k => owners[k].length > 1 && !SHARED[k]);
ok("nothing is shared by accident", collisions.length === 0,
   collisions.length
     ? collisions.map(k => k + " (" + owners[k].map(f => f.replace(".html", "")).join(" + ") + ")").join("; ")
     : "the only shared keys are the four named ones");

/* THE FOUR THAT WERE BROKEN, named individually so a regression says which. The dashboard cache
   is read through its LIVE_CACHE_KEY constant rather than by matching the name, because µJump also
   MENTIONS its retired _v1 key in the one-time removeItem cleanup — a key it deletes, never one it
   uses, and counting it as a second cache would be this check misreading its own subject. */
function liveCacheKeyOf(f){
  const m = /const\s+LIVE_CACHE_KEY\s*=\s*"([^"]*)"/.exec(fs.readFileSync(page_(f), "utf8"));
  return m ? m[1] : null;
}
const THREE = ["ujump.html", "djump.html", "pjump.html"];
const caches = THREE.map(liveCacheKeyOf);
ok("  the dashboard live cache is per-tool",
   caches.every(Boolean) && new Set(caches).size === 3
   && caches[2].indexOf("pjump_") === 0,
   caches.join(" | ") + "  <- the one Søren reported");

[["navigation history",   "_nav_history"],
 ["search panel state",   "_rootnuc_search_open"],
 ["random panel state",   "_random_panel_open"]].forEach(function(pair){
  const [what, suffix] = pair;
  const per = {};
  THREE.forEach(function(f){ per[f] = USED[f].keys.filter(k => k.indexOf(suffix) >= 0); });
  const all = [].concat(per["ujump.html"], per["djump.html"], per["pjump.html"]);
  ok("  the " + what + " is per-tool",
     all.length === 3 && new Set(all).size === 3
     && per["pjump.html"].every(k => k.indexOf("pjump_") === 0),
     all.join(" | "));
});

/* ── 3: everything else carries its own prefix ────────────────────────────────────────────────*/
console.log("\n--- and a key belongs to the page that uses it ---");
const misprefixed = [];
PAGES.forEach(function(f){
  const p = PREFIX[f];
  USED[f].keys.forEach(function(k){
    if (SHARED[k]) return;
    if (!p) { misprefixed.push(f + ": " + k + " (page has no namespace of its own)"); return; }
    if (k.indexOf(p) !== 0) misprefixed.push(f + ": " + k + " (expected " + p + "…)");
  });
});
ok("every private key is prefixed with its own page", misprefixed.length === 0,
   misprefixed.length ? misprefixed.join("; ") : "nothing borrows another tool's namespace");

console.log("\n--- the shared ones are shared on purpose ---");
Object.keys(SHARED).forEach(function(k){
  const on = owners[k] || [];
  const allowed = SHARED_ONLY_ON[k];
  ok("  " + k, on.length > 0 && (!allowed || on.every(f => allowed.indexOf(f) >= 0)),
     on.map(f => f.replace(".html", "")).join(", ") + "  <- " + SHARED[k]);
});

/* ── and the two one-time cleanups ────────────────────────────────────────────────────────────*/
console.log("\n--- the entries πJump already poisoned are cleaned up ---");
const uj = fs.readFileSync(page_("ujump.html"), "utf8");
ok("µJump abandons the old cache key",
   /LIVE_CACHE_KEY="ujump_dashboard_live_cache_v2"/.test(uj)
   && /removeItem\("ujump_dashboard_live_cache_v1"\)/.test(uj),
   "_v2, and _v1 deleted  <- renaming πJump's key cannot empty the entry already in a browser, "
   + "and a fresh cache renders with no fetch at all");
const dj = fs.readFileSync(page_("djump.html"), "utf8");
ok("...while δJump, never shared, is left at _v1",
   /LIVE_CACHE_KEY="djump_dashboard_live_cache_v1"/.test(dj),
   "an asymmetry on purpose, not an oversight");

console.log("\n--- and the history says which volume it is of ---");
["ujump.html", "djump.html", "pjump.html"].forEach(function(f){
  const s = fs.readFileSync(page_(f), "utf8");
  ok("  " + f.replace(".html", "") + " stamps and checks it",
     /JSON\.stringify\(\{ds:/.test(s) && /d\.ds!==\(\(typeof UJ/.test(s),
     "a blob with no stamp, or the wrong one, is dropped — µJump's list provably contains "
     + "pinky100 cells and there is no way to tell which");
});

const bad = R.filter(x => !x).length;
console.log(bad ? `\n*** ${bad} of ${R.length} FAILED ***`
                : `\nRESULT: ALL ${R.length} CHECKS PASSED`);
process.exit(bad ? 1 : 0);
