# -*- coding: utf-8 -*-
u"""The community's root IDs reach the viewer on δJump too.                           2026-09-21

Søren: "In dJump, I don't see it including the community reported root IDs in the neuroglancer
instance with the organelles. Please check for all tools that this is corrected. It worked in
uJump."

tracingViewerOpen only read the proposals when the tracing card had a segmentation of its own to
read (tracingSources().seg). δJump's card deliberately has none -- V1DD's cells are graphene behind
a CAVE login, which the card's own reader refuses -- but the VIEWER has one: buildState() puts
v1dd_public in the link, and Neuroglancer signs in to it itself. So the link selected the cell's
root and left out every proposed fragment.

The question is now "is there a cell layer to put them in": the link's own segmentation layer, or
the card's segmentation where the link has none. tracingAddRootsTo() no longer makes a layer with
an empty source when there is neither.

Tool by tool, after this:
  µJump, δJump      the page's fetchExtraRootIdsFor (img65), into the link's cell layer
  βJump, ηJump      their own extraRootsFor (secgan16 / c3)
  πJump             no tracing card, so no organelle view to open
  λJump             no segmentation at all
  ωJump, χJump      nobody can propose a root ID there (no propose_root_id form)

Run: python3 src/the_viewer_uses_its_own_cell_layer.py, then python3 src/build_stamps.py
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


edit("core/tracingcard.js", [
 (u"a cell layer is the link's own, else the card's",
  u'''/* The proposed root IDs onto a state's cell layer, after the root it already selects. */
function tracingAddRootsTo(st, extra){
  if (!extra || !extra.length) return false;
  var isNuc = function(l){ return /nucle/i.test(String(l.name || "") + " " + String(l.source || "")); };
  var cell = (st.layers || []).filter(function(l){ return l && l.type === "segmentation" && !isNuc(l); })[0];
  if (!cell){''',
  u'''/* The state's cell layer: its first segmentation layer that is not the nuclei. */
function tracingCellLayerOf(st){
  var isNuc = function(l){ return /nucle/i.test(String(l.name || "") + " " + String(l.source || "")); };
  return ((st && st.layers) || []).filter(function(l){ return l && l.type === "segmentation" && !isNuc(l); })[0] || null;
}
/* The proposed root IDs onto a state's cell layer, after the root it already selects. The link's
   own cell layer first (δJump's card has no segmentation to read, but its viewer has v1dd_public,
   2026-09-21); a new one from the card's segmentation only where the link has none; else nothing. */
function tracingAddRootsTo(st, extra){
  if (!extra || !extra.length) return false;
  var cell = tracingCellLayerOf(st);
  if (!cell && !tracingSources().seg) return false;
  if (!cell){'''),
 (u"the viewer asks whether there is a cell layer, not whether the card can read one",
  u'''  const canExtra = !!nucId && tracingSources().seg
    && !!((UJ.cfg && UJ.cfg.tracing && UJ.cfg.tracing.extraRootsFor) || typeof fetchExtraRootIdsFor === "function");''',
  u'''  /* A cell layer to put them in: the link's own (δJump's v1dd_public, which the card itself cannot
     read) or the card's segmentation -- 2026-09-21, Søren: "In dJump, I don't see it including the
     community reported root IDs". */
  const canExtra = !!nucId && !!(tracingCellLayerOf(st) || tracingSources().seg)
    && !!((UJ.cfg && UJ.cfg.tracing && UJ.cfg.tracing.extraRootsFor) || typeof fetchExtraRootIdsFor === "function");'''),
])

print("extrarootscheck.js")
edit("extrarootscheck.js", [
 (u"a tool counts if its viewer link has a cell layer",
  u'''  const where = await p.evaluate(() => ({ card: typeof tracingViewerOpen === "function",
    seg: typeof tracingSources === "function" && !!tracingSources().seg,''',
  u'''  /* A cell segmentation in the VIEWER counts, not only one the card can read: δJump's card has none
     (V1DD is behind CAVE) but its links carry v1dd_public, and that is where Søren looked. */
  const where = await p.evaluate(() => ({ card: typeof tracingViewerOpen === "function",
    padSeg: typeof tracingSources === "function" && !!tracingSources().seg,
    seg: (typeof tracingSources === "function" && !!tracingSources().seg)
      || (typeof buildState === "function" && (() => { try {
            return (buildState([1000, 1000, 100]).layers || []).some(l => l && l.type === "segmentation"
              && !/nucle/i.test(String(l.name || "") + " " + String(l.source || ""))); } catch (e){ return false; } })()),'''),
 (u"the pad is asked only where the card reads a segmentation",
  u'''  console.log("\\nthe pad's segmentation");
  const pad = await p.evaluate(async () => {''',
  u'''  console.log("\\nthe pad's segmentation");
  if (!where.padSeg) console.log("  (the card reads no segmentation here -- the pad paints none)");
  const pad = !where.padSeg ? "skip" : await p.evaluate(async () => {'''),
 (u"...and passes where it is not",
  u'''  ok(pad && pad.also.indexOf("864691135000000111") >= 0''',
  u'''  ok(pad === "skip" || pad && pad.also.indexOf("864691135000000111") >= 0'''),
])
