/* No file exists twice with two different contents.                                   2026-10-03

   Søren, on finding χJump's 3D panel had none of the shared renderer's features: *"I don't see the
   function in xJump"*. The cause was a fork — χJump carrying its own copy of a file that also
   lived in core/. Clearing that turned up the same shape three folders wide, so this is the guard
   that was missing.

   THE FAULT IS NOT HAVING TWO COPIES. It is having two copies that no longer say the same thing.
   Some duplication here is deliberate and maintained: corepath.js and pagepath.js resolve paths
   relative to their own directory and have to sit beside their callers, and seedannotcheck.js is
   kept in both ωJump folders ON PURPOSE by src/seedannotcheck_finds_its_build_inputs.py, whose
   title is exactly that. None of those is a problem while the copies agree. So the rule asserted
   here is the narrow one, and it needs no judgement about which folder owns what:

       a file name that appears in more than one of these folders must have the same bytes
       in every one of them.

   WHAT IT FOUND ON ITS FIRST RUN, all of it silently wrong for weeks:

     volrowcheck.js    the xjump-build copy predated 2026-09-09, when an unsaved compute started
                       keeping its button. It failed three assertions about behaviour the tool had
                       deliberately changed, and read as a broken page.
     pagefn.js         the xjump-build copy could not find a function assigned to window, which the
                       tool-folder one learned to do. Nothing in that folder requires it.
     wjump_app.js      the SERVED folder held ωJump's build inputs, 57, 66 and 2 lines behind the
     wjump_config.js   real ones in wjump-build/. seedannotcheck.js looks in its own directory
     wjump_logic.js    FIRST and in wjump-build/ second, so it had been asserting against a
                       two-month-old roster and passing. wjcfg.js says the same thing about itself
                       in its own first paragraph -- "a check that reads a copy is not checking
                       anything" -- and was reading one.
     wjump_demo.html   build artefacts left in the served folder from before the builds stopped
     xjump_demo.html   copying them there. χJump's own README tells this story about xjump.html:
                       a leftover named exactly like the thing you would copy, 44 code lines behind
                       the served page.

   Run: node onecopycheck.js */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* The served repo and the two build folders beside it. Resolved from THIS file rather than from
   the cwd, for the reason corepath.js gives: a check run from the folder above must find the same
   tree as one run from inside it. */
const HERE = __dirname;
/* A CANDIDATE LIST, for the reason corepath.js gives about core/: the build folders sit BESIDE the
   served one in Søren's tree and one level over in the working copy, and a single hard-coded
   relative path is right in exactly one of those and silently finds nothing in the other --
   which, for a check that compares folders, means passing. */
const build = name => [path.join(HERE, "..", name), path.join(HERE, "..", "xw", name)]
                        .filter(fs.existsSync)[0];
const FOLDERS = [
  { name: "tool folder", dir: HERE },
  { name: "wjump-build", dir: build("wjump-build") },
  { name: "xjump-build", dir: build("xjump-build") }
].filter(f => f.dir && fs.existsSync(f.dir));

const hash = p => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex").slice(0, 8);

(async () => {
  console.log("the folders this compares");
  ok(FOLDERS.length >= 2,
     "at least two of the three folders are here — with one, this check cannot say anything and "
     + "should say so rather than passing",
     FOLDERS.map(f => f.name).join(", "));

  /* Everything at the top level of each folder. Not recursive: src/ holds generators named for the
     tool they edit and node_modules is a symlink, and neither is where this fault has ever lived. */
  const byName = {};
  FOLDERS.forEach(f => {
    fs.readdirSync(f.dir).forEach(n => {
      const p = path.join(f.dir, n);
      let st;
      try { st = fs.lstatSync(p); } catch (e){ return; }
      if (!st.isFile()) return;                       // skips node_modules, src/, __pycache__
      (byName[n] = byName[n] || []).push({ folder: f.name, path: p, hash: hash(p) });
    });
  });

  const shared = Object.keys(byName).filter(n => byName[n].length > 1).sort();
  const split = shared.filter(n => new Set(byName[n].map(c => c.hash)).size > 1);

  console.log("\nwhat is in more than one place");
  console.log("  " + (shared.length ? shared.map(n =>
    n + " (" + byName[n].length + (split.indexOf(n) < 0 ? ", agreeing)" : ", DIFFERENT)")
  ).join("\n  ") : "nothing"));

  console.log("\nand whether the copies agree");
  ok(split.length === 0,
     "every file that exists in more than one folder has the same bytes in all of them — a copy "
     + "that has drifted is a check asserting about a page nobody serves, or a build reading an "
     + "input nobody edits, and both of those pass",
     split.length
       ? split.map(n => n + ": " + byName[n].map(c => c.folder + " " + c.hash).join(" vs ")).join("; ")
       : shared.length + " name(s) shared, all agreeing");

  /* ── AND THE DELIBERATE ONES ARE STILL DELIBERATE ─────────────────────────────────────────
     Three files are copied on purpose and there is a reason in each. If one stops being shared --
     because somebody tidied it away -- the entry here is what says the reason has gone with it,
     rather than the list quietly describing a world that no longer exists. */
  const MEANT = {
    "corepath.js": "resolves core/ from its own directory, so it has to sit beside its callers",
    "pagepath.js": "the same, for the served pages",
    "seedannotcheck.js": "kept in both ωJump folders by "
      + "src/seedannotcheck_finds_its_build_inputs.py, which edits both copies in one run"
  };
  Object.keys(MEANT).forEach(n => {
    ok((byName[n] || []).length > 1,
       "still copied on purpose: " + n + " — " + MEANT[n],
       (byName[n] || []).length + " cop" + ((byName[n] || []).length === 1 ? "y" : "ies"));
  });

  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
