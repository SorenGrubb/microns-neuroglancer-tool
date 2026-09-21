# -*- coding: utf-8 -*-
u"""seedannotcheck.js finds ωJump's build inputs from either folder.                    2026-09-21

It gave no verdict at all from the tool folder -- it threw before its first check. Its inputs
(wjump_config.js, wjump_logic.js, wjump_seed_cells.json, wjump_seed_post.html) are ωJump's BUILD
files and live in wjump-build/, and pagepath.js only looks in the served repo and beside the check.
From wjump-build/ it has always passed (25 of 25). Now it also looks in ../wjump-build, so the
copy in the tool folder -- which baseline_tracing.sh runs -- gives the same answer.

The two copies are kept identical; this edits both.

Run: python3 src/seedannotcheck_finds_its_build_inputs.py   (from the tool folder)
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OLD = u'''const page = require("./pagepath.js");'''
NEW = u'''const pagepath = require("./pagepath.js"), pathM = require("path");
/* ωJump's BUILD inputs live in wjump-build/, which pagepath.js does not search; this check is run
   from there and from the tool folder alike. 2026-09-21. */
const page = (name) => {
  const here = [pathM.join(__dirname, name), pathM.join(__dirname, "..", "wjump-build", name),
                pathM.join(process.cwd(), "..", "wjump-build", name)]
                 .filter(fs.existsSync)[0];
  return here || pagepath(name);
};'''
for p in [os.path.join(HERE, "seedannotcheck.js"),
          os.path.join(HERE, "..", "wjump-build", "seedannotcheck.js")]:
    if not os.path.exists(p): print(p + ": not here, skipped"); continue
    s = io.open(p, encoding="utf-8").read()
    if NEW in s: print(p + ": already there"); continue
    assert s.count(OLD) == 1, p
    io.open(p, "w", encoding="utf-8").write(s.replace(OLD, NEW, 1)); print(p + ": ok")
