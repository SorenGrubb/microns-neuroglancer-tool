# -*- coding: utf-8 -*-
u"""core/tracingcard.js, stage B1: whose storage this is.                        2026-09-20

Four localStorage keys moved into core/tracingcard.js in stage A as literal "ujump_..." strings.
Nothing else loads that file yet, so nothing is broken today — but the moment λJump does, both
tools read and write ONE list of tracings and ONE set of drafts. That is exactly the bug
storagekeycheck.js exists for, written after πJump and µJump spent a week overwriting each other's
dashboard cache and navigation history.

── THE NEAR MISS, AND WHY THE OBVIOUS FIX WAS WRONG ────────────────────────────

The plan was to build each key from UJ.cfg.id — `UJ.cfg.id + "_tracings_v1"` — on the stated
grounds that µJump's keys would come out unchanged because its id IS "ujump".

IT IS NOT. µJump's UJ.cfg.id is **"microns"**. Every key would have been renamed to
`microns_tracings_v1`, and every tracing and every draft anybody has saved in µJump would have
silently stopped existing — not lost, worse: still in localStorage, under a name nothing reads any
more. Found by opening the file rather than by trusting the plan.

── SO: THE STEPTHROUGH PRECEDENT, WHICH IS ALREADY IN THIS REPO ──────────────────

core/stepthrough.js had the identical problem and solved it without arithmetic: the key is a
LITERAL in each page, handed over through UJ.cfg, and the module reads it with µJump's own value as
the fallback (`stepCfg().lsKey || "ujump_stepthrough_v1"`).

Two things that buys, and the second is the reason to copy it rather than invent:

  1. no id arithmetic, so no page can have its keys renamed by a change to what its dataset is
     called — which is what nearly happened here;
  2. the key stays a literal string IN THE PAGE, where storagekeycheck.js can read it. That check
     resolves `SOME_KEY = "literal"` and `function someKey(){ return "literal"; }` and nothing
     else; a computed key is reported as "an expression nobody can read", and it says so precisely
     because a computed key escapes both of its other two rules.

Run: python3 src/tracingcard_stage_b_keys.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# A MARKER, NOT THE INSERTED TEXT, IS THE "already there" TEST.        2026-09-20
# The usual guard asks whether `new` is in the file. That fails here as soon as ANOTHER generator
# inserts something inside the block this one added: stage B3 puts tracingSources() immediately
# before `function tracingCfg(){`, which is the last line of this generator's own replacement, and
# the replacement stops being contiguous. The guard then says "not there", the anchor is gone, and
# the run dies on an assertion instead of saying it has nothing to do.
#
# Third time this shape of bug has appeared in two days -- see src/one_way_to_log_an_organelle.py,
# where two generators shared an anchor and re-running the first duplicated a 37-line function. A
# short marker that no later edit lands inside is the fix.
def edit(rel, pairs, marker=None):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    if marker and marker in s:
        for name, _o, _n in pairs:
            print("  already there: " + name)
        return
    before = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name)
            continue
        n = s.count(old)
        assert n == 1, "%s / %s: anchor found %d times" % (rel, name, n)
        s = s.replace(old, new, 1)
        print("  ok: " + name)
    if s != before:
        io.open(p, "w", encoding="utf-8").write(s)


# ── the module asks the page ──────────────────────────────────────────────────────────────────
KEY_OLD = u'''const TRACING_KEY="ujump_tracings_v1";'''
KEY_NEW = u'''/* ── WHOSE STORAGE THIS IS ──────────────────────────────────  2026-09-20
   localStorage is ONE store shared by every page on grubblab.com, so a key written into a shared
   module is a key every tool that loads it takes turns overwriting. µJump and πJump spent a week
   doing exactly that to each other's dashboard cache and navigation history; storagekeycheck.js
   is what came out of it.

   EACH PAGE NAMES ITS OWN, as literals, through UJ.cfg.tracing — the shape core/stepthrough.js
   already uses (`stepCfg().lsKey || "ujump_stepthrough_v1"`). The fallbacks below are µJump's
   real keys, so µJump is unchanged whether or not it configures them.

   NOT BUILT FROM UJ.cfg.id, which was the first plan and would have been a quiet disaster:
   µJump's id is "microns", not "ujump", so every key would have been renamed and every tracing
   and draft anybody had saved would still be in their browser under a name nothing reads.

   AND NOT COMPUTED AT ALL, for a second reason: storagekeycheck.js resolves a key only when it is
   a literal it can read in the page. A computed key is reported as an expression nobody can
   audit, and it says so because a computed key escapes both of its other rules. */
function tracingCfg(){
  try { return (UJ && UJ.cfg && UJ.cfg.tracing) || {}; } catch (_e){ return {}; }
}
const TRACING_KEY = tracingCfg().lsKey || "ujump_tracings_v1";'''

DRAFTS_OLD = u'''const TRACING_DRAFTS_KEY = "ujump_tracing_drafts_v2";
const TRACING_DRAFT_KEY = "ujump_tracing_draft_v1";     // the old single slot: read, never written'''
DRAFTS_NEW = u'''const TRACING_DRAFTS_KEY = tracingCfg().draftsKey || "ujump_tracing_drafts_v2";
const TRACING_DRAFT_KEY = tracingCfg().draftKey || "ujump_tracing_draft_v1";  // old single slot: read, never written
/* The pen tick's own preference. It was three copies of one literal in the wiring below, which is
   three places to forget when a second tool loads this file. */
const TRACING_PEN_KEY = tracingCfg().penKey || "ujump_tracing_pen_v1";'''

PEN_GET = (u'''    try { pen.checked = localStorage.getItem("ujump_tracing_pen_v1") === "1"; } catch (_e){}''',
           u'''    try { pen.checked = localStorage.getItem(TRACING_PEN_KEY) === "1"; } catch (_e){}''')
PEN_SET = (u'''      try { localStorage.setItem("ujump_tracing_pen_v1", pen.checked ? "1" : "0"); } catch (_e){}''',
           u'''      try { localStorage.setItem(TRACING_PEN_KEY, pen.checked ? "1" : "0"); } catch (_e){}''')
PEN_ON = (u'''        try { localStorage.setItem("ujump_tracing_pen_v1", "1"); } catch (_e){}''',
          u'''        try { localStorage.setItem(TRACING_PEN_KEY, "1"); } catch (_e){}''')

print("core/tracingcard.js")
edit("core/tracingcard.js", [
    (u"the page names its own tracing store", KEY_OLD, KEY_NEW),
    (u"...its own drafts, and the pen tick", DRAFTS_OLD, DRAFTS_NEW),
    (u"...the pen tick is read through it", PEN_GET[0], PEN_GET[1]),
    (u"...and written through it", PEN_SET[0], PEN_SET[1]),
    (u"...including when the pad turns it on for you", PEN_ON[0], PEN_ON[1]),
], marker=u"WHOSE STORAGE THIS IS")

# ── and µJump names them, as literals, where the check can read them ──────────────────────────
CFG_OLD = u'''  res: [4, 4, 40]           // nm per voxel, x/y/z
};'''
CFG_NEW = u'''  res: [4, 4, 40],          // nm per voxel, x/y/z
  /* THE TRACING CARD'S FOUR STORAGE KEYS, named here rather than in core/tracingcard.js, for the
     reason core/stepthrough.js names its own here: localStorage is one store shared by every page
     on this domain, and a key that lives in a shared module is a key every tool that loads it
     takes turns overwriting. Literals, not built from `id` — partly because storagekeycheck.js
     can only audit a key it can read, and partly because `id` here is "microns", so arithmetic on
     it would have renamed all four and orphaned every tracing and draft already saved. */
  tracing: {
    lsKey:     "ujump_tracings_v1",
    draftsKey: "ujump_tracing_drafts_v2",
    draftKey:  "ujump_tracing_draft_v1",
    penKey:    "ujump_tracing_pen_v1"
  }
};'''

print("ujump.html")
edit("ujump.html", [
    (u"µJump names its four keys where they can be audited", CFG_OLD, CFG_NEW),
])

print(u"\nnow: node storagekeycheck.js && ./baseline_tracing.sh > /tmp/after.txt "
      u"&& diff /tmp/before.txt /tmp/after.txt")
