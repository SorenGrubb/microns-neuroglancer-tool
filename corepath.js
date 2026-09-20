/* WHERE core/ IS, from wherever a check happens to be run.                        2026-09-02

   Søren, after the build folder was finally synced to his machine: every check that reads a
   shared module died with ENOENT on `core/mesh.js`. It is a file he has -- one directory over.

   core/ lives NEXT TO the build in a working copy and INSIDE the served repo
   (../microns-neuroglancer-tool/core/) in his tree, so a hard-coded relative path is right in one
   layout and a crash in the other. build_wjump.py has had a `shared()` helper for exactly this
   since ωJump was written, and build_xjump.py grew one the same day this did; the check files
   were the third place the same trap was waiting, because they were only ever run from the one
   layout that happened to work.

   Resolved against THIS FILE's directory rather than the process's cwd: a check run as
   `node xjump-build/cccheck.js` from the folder above must find the same core/ as one run from
   inside it, and cwd would quietly answer differently.

   Usage:  const core = require("./corepath.js");
           eval(fs.readFileSync(core("mesh.js"), "utf8"));   */
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const CANDIDATES = [
  path.join(HERE, "core"),
  path.join(HERE, "..", "microns-neuroglancer-tool", "core"),
  path.join(HERE, "..", "core")
];

module.exports = function core(name) {
  const tried = CANDIDATES.map(d => path.join(d, name));
  for (const p of tried) if (fs.existsSync(p)) return p;
  /* Naming every candidate, not just the first. "cannot find core/mesh.js" sends somebody looking
     for a file they have; a list of the three places it was not sends them to the right answer. */
  throw new Error(
    "cannot find core/" + name + " -- looked in:\n  " +
    tried.map(p => path.normalize(p)).join("\n  ") +
    "\ncore/ is the shared module folder: it lives in the served repo " +
    "(microns-neuroglancer-tool/core/) or beside this build.");
};
