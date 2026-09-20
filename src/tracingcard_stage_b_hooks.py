# -*- coding: utf-8 -*-
u"""core/tracingcard.js, stage B3+B4: the last two things that are µJump's.     2026-09-20

After the move (stage A) and the storage keys (stage B1), two µJump-specific dependencies are left
in the shared file. Both are named in its own header as known and deliberate; this removes them.

── B3: WHERE THIS DATASET'S IMAGERY IS ─────────────────────────────────────

Seven places read `SRC.em`, `SRC.seg` or `SRC.nuc` — the EM to draw a section from, the
segmentation to paint over it, the nuclei to read a nucleus id out of. `SRC` is a µJump global; on
λJump the same three facts live in `UJ.cfg.viewer`, and slice 1 of that port already added
`emConfigure()` as the one place that reads them.

One function, `tracingSources()`, and it FALLS BACK TO `SRC` — so µJump is unchanged and does not
have to declare anything. A host that has no `SRC` sets `UJ.cfg.tracing.sources` instead, as an
object or as a function of no arguments (a function, because λJump's sources are read off a config
that is itself assembled at load time).

It returns `res` as well, which removed a second duplication worth naming: five of the seven sites
carried their own copy of `res: UJ.cfg ? UJ.cfg.res : [4, 4, 40]`. Five copies of a fallback is
five places for a dataset with a different voxel size to be got wrong in.

── B4: WHAT THIS CELL ALREADY IS ─────────────────────────────────────────

`tracingIdentityFor` suggests what you are drawing, by looking the cell up in µJump's own tables:
NID, NT, OWN_TYPE, OWN_TYPE_NAMES, CT_NAMES, plus nidToIndex and rootIdToIndex. Most are already
reached through a `typeof` guard; NID and CT_NAMES are not, and on a page without them this throws
a ReferenceError inside a click handler — the button appears to do nothing, which is the failure
mode core/report.js's own extraction note warns about in capitals.

A hook FIRST, then µJump's existing body behind a guard. A host that knows how to identify its own
cells answers; a host that does not gets null, and the form simply does not pre-select a type.
Nothing here decides what a cell is — it only offers a starting point — so having no answer is a
real and acceptable state, which is why this is a hook rather than a required contract.

Run: python3 src/tracingcard_stage_b_hooks.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOD = os.path.join(HERE, "core", "tracingcard.js")


def sub(s, old, new, name, expect=1):
    n = s.count(old)
    if new in s and (old not in s or old in new):
        print("  already there: " + name)
        return s
    assert n == expect, "%s: anchor found %d times, expected %d" % (name, n, expect)
    print("  ok: %s%s" % (name, "" if expect == 1 else " (%d sites)" % expect))
    return s.replace(old, new)


s = io.open(MOD, encoding="utf-8").read()

# ── B3 ────────────────────────────────────────────────────────────────────────────────────────
SRC_FN = u'''/* ── WHERE THIS DATASET'S IMAGERY IS ─────────────────────────────  2026-09-20
   Three facts and a voxel size: the EM to draw a section from, the segmentation to paint over it,
   the nuclei to read a nucleus id out of, and how big a voxel is. µJump keeps them in a global
   called SRC; λJump keeps the same facts in UJ.cfg.viewer.

   FALLS BACK TO SRC, so µJump declares nothing and is unchanged. A host without one sets
   UJ.cfg.tracing.sources — an object, or a function of no arguments for a host whose sources are
   themselves assembled at load time.

   IT RETURNS res TOO, and that is not tidiness: five of the seven call sites carried their own
   copy of `res: UJ.cfg ? UJ.cfg.res : [4, 4, 40]`, which is five places for a dataset with a
   different voxel size to be got wrong in, and only one of them would be noticed. */
function tracingSources(){
  var o = null;
  try {
    var c = (UJ && UJ.cfg && UJ.cfg.tracing) ? UJ.cfg.tracing.sources : null;
    if (c) o = (typeof c === "function") ? c() : c;
  } catch (_e){ o = null; }
  if (!o) { try { o = SRC; } catch (_e){ o = null; } }   // ReferenceError on a page with no SRC
  o = o || {};
  var res = [4, 4, 40];
  try { if (UJ && UJ.cfg && UJ.cfg.res) res = UJ.cfg.res; } catch (_e){}
  return { em: o.em || "", seg: o.seg || "", nuc: o.nuc || "", res: res };
}
function tracingCfg(){'''
s = sub(s, u"function tracingCfg(){", SRC_FN, u"one place that knows where the imagery is")

s = sub(s, u"UJ.emtiles.configure({ em: SRC.em, res: UJ.cfg ? UJ.cfg.res : [4, 4, 40] });",
        u"UJ.emtiles.configure(tracingSources());",
        u"the EM reader is pointed at this dataset", expect=3)
s = sub(s, u"UJ.segpaint.configure({ seg: SRC.seg, nuc: SRC.nuc, res: UJ.cfg ? UJ.cfg.res : [4, 4, 40] });",
        u"UJ.segpaint.configure(tracingSources());",
        u"...and so is the overlay")
s = sub(s, u"UJ.segread.configure({seg:SRC.seg,nuc:SRC.nuc,res:UJ.cfg.res});",
        u"UJ.segread.configure(tracingSources());",
        u"...and the voxel reader")
s = sub(s, u"if (!UJ.nucmesh.configured()) UJ.nucmesh.configure({ nuc: SRC.nuc });",
        u"if (!UJ.nucmesh.configured()) UJ.nucmesh.configure({ nuc: tracingSources().nuc });",
        u"...and the nucleus mesh")
s = sub(s, u"cellLayer = { type: \"segmentation\", source: SRC.seg, tab: \"source\", name: \"segmentation\",",
        u"cellLayer = { type: \"segmentation\", source: tracingSources().seg, tab: \"source\", name: \"segmentation\",",
        u"...and the layer a viewer link carries")
s = sub(s, u"nucLayer = { type: \"segmentation\", source: SRC.nuc, tab: \"source\", name: \"nuclei\",",
        u"nucLayer = { type: \"segmentation\", source: tracingSources().nuc, tab: \"source\", name: \"nuclei\",",
        u"...and its nucleus layer")

# ── B4 ────────────────────────────────────────────────────────────────────────────────────────
ID_OLD = u'''function tracingIdentityFor(nucIn, rootIn){
  var i = -1, via = "";'''
ID_NEW = u'''function tracingIdentityFor(nucIn, rootIn){
  /* ── WHAT THIS CELL ALREADY IS, IF THE PAGE KNOWS ──────────────────  2026-09-20
     The body below is µJump's, and it reads µJump's tables: NID, NT, OWN_TYPE, OWN_TYPE_NAMES,
     CT_NAMES. Most are behind a `typeof` guard; NID and CT_NAMES were not, and on a page without
     them this throws inside a click handler — which looks like a button that does nothing.

     A host that can identify its own cells answers here. One that cannot gets null, and the form
     simply does not pre-select a type. That is a real state, not a degraded one: this only ever
     OFFERS a starting point, and offering none is better than offering a wrong one. */
  try {
    var hook = (UJ && UJ.cfg && UJ.cfg.tracing) ? UJ.cfg.tracing.identityFor : null;
    if (typeof hook === "function") return hook(nucIn, rootIn) || null;
  } catch (_e){}
  if (typeof NID === "undefined") return null;      // no tables on this page, and none promised
  var i = -1, via = "";'''
s = sub(s, ID_OLD, ID_NEW, u"the page may say what a cell already is")

# CT_NAMES was the other unguarded read in that body.
# THE ESCAPE IS LITERAL IN THE FILE. The source says MICrONS’ -- a backslash, a u, four
# digits -- not the apostrophe those six characters denote. Writing the character here matched
# nothing, which is the same class of mistake as quoting a comment's box-drawing rule: what is on
# disk is bytes, and a Python literal that renders the same glyph is not the same bytes.
CT_OLD = u'''  if (t) return answer(CT_NAMES[t - 1], "MICrONS\\u2019 prediction");'''
CT_NEW = u'''  if (t && typeof CT_NAMES !== "undefined") return answer(CT_NAMES[t - 1], "MICrONS\\u2019 prediction");'''
s = sub(s, CT_OLD, CT_NEW, u"...and the prediction table is asked for only where it exists")

io.open(MOD, "w", encoding="utf-8").write(s)

# ── the header's "still µJump-shaped" list is now two items shorter ───────────────────────────
HDR_OLD = u'''     - SRC.em / SRC.seg / SRC.nuc are read directly in six places.
     - tracingIdentityFor reads NID/NT/OWN_TYPE/CT_NAMES, which are µJump's own tables.'''
HDR_NEW = u'''     - (fixed 2026-09-20) the seven SRC reads now go through tracingSources(), which falls back
       to SRC so µJump is unchanged.
     - (fixed 2026-09-20) tracingIdentityFor asks UJ.cfg.tracing.identityFor first and returns
       null on a page with no tables, instead of throwing inside a click handler.'''
s2 = io.open(MOD, encoding="utf-8").read()
if HDR_OLD in s2:
    io.open(MOD, "w", encoding="utf-8").write(s2.replace(HDR_OLD, HDR_NEW, 1))
    print("  ok: the header's known-µJump-shaped list is two items shorter")
else:
    print("  already there: the header's list is up to date")

print(u"\nnow: node storagekeycheck.js && ./baseline_tracing.sh > /tmp/afterC.txt "
      u"&& diff /tmp/after.txt /tmp/afterC.txt")
