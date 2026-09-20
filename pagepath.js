/* WHERE THE TOOL PAGES ARE, from wherever a check happens to be run.               2026-09-02

   corepath.js's sibling, and it exists for the same reason and the same tree. `index.html`,
   `ujump.html` and the rest live in the SERVED REPO (microns-neuroglancer-tool/) on Søren's
   machine, while the checks that read them live in a build folder beside it — because that is
   where node_modules is. A check that says `fs.readFileSync("index.html")` is correct in the one
   layout it was written in and an ENOENT in his, which is how every playwright check in this
   project died the first time he ran one.

   Resolved against THIS FILE's directory rather than the process's cwd, for corepath.js's own
   reason: `node xjump-build/volboxcheck.js` run from the folder above must find the same pages as
   one run from inside it.

   Usage:  const page = require("./pagepath.js");
           fs.readFileSync(page("index.html"), "utf8");
           await browser.goto("file://" + page("index.html"));  */
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const CANDIDATES = [
  HERE,
  path.join(HERE, "..", "microns-neuroglancer-tool"),
  path.join(HERE, "..")
];

module.exports = function page(name) {
  const tried = CANDIDATES.map(d => path.join(d, name));
  for (const p of tried) if (fs.existsSync(p)) return p;
  throw new Error(
    "cannot find " + name + " -- looked in:\n  " +
    tried.map(p => path.normalize(p)).join("\n  ") +
    "\nThe tool pages live in the served repo (microns-neuroglancer-tool/) or beside this build.");
};
/* The folder the pages were found in, for anything that needs to write beside them (the build
   stamper's ledger, for one). Falls back to HERE so a caller never gets undefined. */
module.exports.dir = function pagesDir() {
  for (const d of CANDIDATES) if (fs.existsSync(path.join(d, "index.html"))) return d;
  return HERE;
};
