# -*- coding: utf-8 -*-
u"""seedannotcheck.js finds wjump-build/ from the working copy too.                      2026-10-03

src/seedannotcheck_finds_its_build_inputs.py taught this check to look for ωJump's build inputs in
its own folder and in `../wjump-build`. Both are right in Søren's tree, where the three folders are
siblings. Neither is right in the working copy, where the served folder and the build folders sit
one level apart -- and until today it did not matter, because a two-month-old copy of
wjump_config.js was sitting in the served folder and the FIRST candidate found it.

That copy has gone (onecopycheck.js, and the note "a check that reads a copy is not checking
anything" which wjcfg.js has carried about itself since August), so the fallback is now the only
way in and it has to work in both layouts. One more candidate, the same shape as the two it joins
and the same shape as corepath.js's list, for the same stated reason: a single relative path is
right in one layout and silently finds nothing in the other.

BOTH COPIES, because seedannotcheck.js is deliberately kept in the tool folder and in wjump-build --
that is what the earlier generator's title means, and onecopycheck.js now holds the two to being
identical.

Run: python3 src/the_build_folder_is_found_from_either_layout.py, then node seedannotcheck.js
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

OLD = u'''  const here = [pathM.join(__dirname, name), pathM.join(__dirname, "..", "wjump-build", name),
                pathM.join(process.cwd(), "..", "wjump-build", name)]
                 .filter(fs.existsSync)[0];'''
NEW = u'''  const here = [pathM.join(__dirname, name), pathM.join(__dirname, "..", "wjump-build", name),
                pathM.join(process.cwd(), "..", "wjump-build", name),
                /* The working copy, where the served folder and the build folders are one level
                   apart rather than siblings. It never mattered while a stale wjump_config.js sat
                   in the served folder and the first candidate found it; that copy has gone.
                   2026-10-03. */
                pathM.join(__dirname, "..", "xw", "wjump-build", name)]
                 .filter(fs.existsSync)[0];'''

n = 0
for p in [os.path.join(HERE, "seedannotcheck.js"),
          os.path.join(HERE, "..", "wjump-build", "seedannotcheck.js"),
          os.path.join(HERE, "..", "xw", "wjump-build", "seedannotcheck.js")]:
    p = os.path.normpath(p)
    if not os.path.exists(p):
        print("  not here: " + p); continue
    s = io.open(p, encoding="utf-8").read()
    if NEW in s:
        print("  already there: " + p); continue
    assert s.count(OLD) == 1, "%s: %d" % (p, s.count(OLD))
    io.open(p, "w", encoding="utf-8").write(s.replace(OLD, NEW, 1))
    print("  ok: " + p); n += 1
print("\n%d cop%s edited. Now: node seedannotcheck.js" % (n, "y" if n == 1 else "ies"))
