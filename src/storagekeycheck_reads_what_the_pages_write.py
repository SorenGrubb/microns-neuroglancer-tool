# -*- coding: utf-8 -*-
u"""storagekeycheck.js: its two standing failures were the check's, not the pages'.       2026-09-21

  1. "no page builds a storage key from an expression" flagged three shapes it could not read:
       var EM_PLANE_KEY="…",EM_PLANE_SEG_KEY="…"   -- the second constant of one declaration
       t.id==="emPlaneSeg"?EM_PLANE_SEG_KEY:EM_PLANE_KEY   -- a choice between two such constants
       UJ.cfg.mesh.caveTokenKey   -- a key the page hands its config, as `caveTokenKey:"…"`
     All three are literals a person can read and audit, which is the rule. They are resolved now,
     and the literal behind each is held to the other rules like any key.
  2. "the random panel state is per-tool" looked for a key that no longer exists: #randomCellPanel
     stopped being a <details> on 2026-09-20 (Søren: "the cell should be always visible"), so there
     is nothing to remember. The assertion is now that no page still WRITES the retired key.

Run: python3 src/storagekeycheck_reads_what_the_pages_write.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    p = os.path.join(HERE, rel); s = io.open(p, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s / %s: %d" % (rel, name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(p, "w", encoding="utf-8").write(s)


edit("storagekeycheck.js", [
 (u"every constant of a declaration",
  u'''  const cre = /(?:const|let|var)\\s+([A-Z][A-Z0-9_]*_KEY)\\s*=\\s*"([^"]*)"/g;
  let m;
  while ((m = cre.exec(src))) { consts[m[1]] = m[2]; keys.add(m[2]); }''',
  u'''  const cre = /(?:const|let|var)\\s+([A-Z][A-Z0-9_]*_KEY)\\s*=\\s*"([^"]*)"/g;
  let m;
  while ((m = cre.exec(src))) { consts[m[1]] = m[2]; keys.add(m[2]); }
  /* ...and the ones after a comma in the same declaration: var EM_PLANE_KEY="…",EM_PLANE_SEG_KEY="…".
     2026-09-21 -- the second was reported as an expression nobody could read. */
  const cre2 = /,\\s*([A-Z][A-Z0-9_]*_KEY)\\s*=\\s*"([^"]*)"/g;
  while ((m = cre2.exec(src))) { if (!(m[1] in consts)) consts[m[1]] = m[2]; }
  /* Recorded to RESOLVE a call, not counted as keys here: not every *_KEY is a storage key
     (ωJump's OFFSET_KEY and PAD3D_KEY are in-memory), so one counts when a storage call uses it. */'''),
 (u"config keys are remembered by name",
  u'''  const cfgre = /\\b([a-z][A-Za-z0-9]*Key)\\s*:\\s*"([^"]+)"/g;
  while ((m = cfgre.exec(src))) keys.add(m[2]);''',
  u'''  const cfgre = /\\b([a-z][A-Za-z0-9]*Key)\\s*:\\s*"([^"]+)"/g;
  const cfgNamed = {};
  while ((m = cfgre.exec(src))) { keys.add(m[2]); cfgNamed[m[1]] = m[2]; }'''),
 (u"a choice between constants, and a key read back off the config",
  u'''    if (consts[arg] !== undefined) continue;                 /* a const resolved above */''',
  u'''    if (consts[arg] !== undefined){ keys.add(consts[arg]); continue; }   /* a const resolved above */
    /* cond ? A_KEY : B_KEY -- both sides readable constants, 2026-09-21. */
    const tern = /\\?\\s*([A-Z][A-Z0-9_]*_KEY)\\s*:\\s*([A-Z][A-Z0-9_]*_KEY)\\s*$/.exec(arg);
    if (tern && consts[tern[1]] !== undefined && consts[tern[2]] !== undefined){
      keys.add(consts[tern[1]]); keys.add(consts[tern[2]]); continue; }
    /* UJ.cfg.<something>.someKey -- the literal this page gave the config as `someKey:"…"`. */
    const viaCfg = /^UJ\\.cfg(?:\\.\\w+)*\\.([a-z][A-Za-z0-9]*Key)$/.exec(arg);
    if (viaCfg && cfgNamed[viaCfg[1]] !== undefined) continue;'''),
 (u"the retired random-panel key is not written",
  u''' ["search panel state",   "_rootnuc_search_open"],
 ["random panel state",   "_random_panel_open"]].forEach(function(pair){''',
  u''' ["search panel state",   "_rootnuc_search_open"]].forEach(function(pair){'''),
 (u"...asserted instead",
  u'''/* ── 3: everything else carries its own prefix ────────────────────────────────────────────────*/''',
  u'''/* The random panel stopped being a <details> on 2026-09-20 ("the cell should be always visible"),
   so there is no open/closed state left to keep per tool. What can still go wrong is a page that
   goes on WRITING the retired key; that is the assertion now. */
{
  const still = PAGES.filter(f => USED[f].keys.some(k => k.indexOf("_random_panel_open") >= 0));
  ok("  the retired random-panel key is written by no page", still.length === 0,
     still.join(", ") || "#randomCellPanel is always open since 2026-09-20");
}

/* ── 3: everything else carries its own prefix ────────────────────────────────────────────────*/'''),
])
