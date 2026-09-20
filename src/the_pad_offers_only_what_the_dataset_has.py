# -*- coding: utf-8 -*-
u"""core/tracingcard.js: the card trims itself to the dataset it is on.          2026-09-20

Stage C gave the module the card's markup, so any tool can now call UJ.tracingcard.mount() and get
a tracing card. ONE piece of markup, five datasets — and the markup was written for minnie65.

Two things in it are minnie65 facts rather than card facts:

  1. TWO TICKS THAT NEED VOLUMES NOT EVERY DATASET HAS.
     #tracePadSeg paints the cell's own segmentation under the contours; #tracePadGhosts fetches
     the cell and nucleus meshes and draws them see-through. Lee16 is IMAGE ONLY — no
     segmentation, no meshes — so on λJump both ticks are controls that can only fail. They are
     REMOVED rather than disabled: a greyed tick is a promise it will work later.

  2. THE PAD'S SIX ZOOM LEVELS ARE LABELLED WITH minnie65's RESOLUTIONS.
     "18 µm across — 32 nm data" is a mip index and a page width turned into nanometres, and it is
     right for exactly one volume. Lee16's scale list is one step finer, so the same mip 2 is
     16 nm and 9 µm — and the page was saying 32 nm and 18 µm while drawing 16 nm and 9 µm.

The labels are not hand-written per tool. padRelabelMips() asks core/emtiles.js what each mip
actually is and rewrites the head of each option from the answer, which is why µJump's labels come
out byte-identical to the ones a person typed: the arithmetic reproduces them.

── THE TAIL THAT WAS ALSO A minnie65 FACT ──────────────────────────────────────

The widest option ends ", slower to load", and the tooltip explains why: at 32 nm minnie65's chunks
are 64 px wide where at 16 nm they are 128, so the widest view costs about three times as many
fetches. That is a statement about ONE volume's chunk geometry. Lee16 chunks 512×512×16 at every
scale, so its widest view is not slower at all. Measured, not assumed: the tail is kept only when
the coarsest option's chunk really is narrower than the next one's.

Run: python3 src/the_pad_offers_only_what_the_dataset_has.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


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


# ── the two helpers, in front of the mount/wire block that calls them ─────────────────────────
ANCHOR = u'''UJ.tracingcard = UJ.tracingcard || {};'''

HELPERS = u'''/* ── A CONTROL THE DATASET CANNOT HONOUR IS REMOVED, NOT DISABLED ──────  2026-09-20
   The card is one piece of markup now shared by five datasets, and two of its ticks need volumes
   only some of them have:

     #tracePadSeg     paints this cell's own segmentation under the contours. It needs a
                      segmentation. Lee16 is image only, and tracingSources().seg is "".
     #tracePadGhosts  fetches the cell mesh and the nucleus mesh and draws them see-through around
                      the tracing. It needs meshes. λJump says it has none by having no
                      UJ.cfg.mesh at all, which is a statement in its config, not an omission.

   THE GHOST TICK IS TWO TICKS AND A SENTENCE, which the first version of this missed and the
   check caught: #tracingPasteGhosts is the same control on the pasted-contours side of the card,
   and the help table has a line describing both. Removing one of three leaves a page that offers
   the feature twice and explains it once.

   REMOVED RATHER THAN DISABLED, because a greyed tick is a promise that it will work later and a
   tooltip nobody opens is the only place the truth could live. What a dataset does not have is
   not offered. µJump has both volumes and keeps both ticks.

   THE LABEL GOES, NOT JUST THE INPUT. Each tick is an <input> inside its own <label>; removing
   only the input would leave the words "show the segmentation" with nothing to tick.

   ONLY ON MARKUP THIS MODULE BUILT. mount() calls this in the branch that filled an empty
   wrapper, so a page carrying its own copy of the card keeps every control it wrote. */
function padTrimForHost(el){
  el = el || document.getElementById("tracingCard") || document;
  var gone = [];
  function drop(id, alsoId){
    var n = el.querySelector("#" + id);
    if (!n) return;
    var lab = (n.closest && n.closest("label")) || n;
    if (lab.parentNode) lab.parentNode.removeChild(lab);
    gone.push(id);
    if (alsoId){
      var s = el.querySelector("#" + alsoId);
      if (s && s.parentNode){ s.parentNode.removeChild(s); gone.push(alsoId); }
    }
  }
  var seg = "";
  try { seg = tracingSources().seg || ""; } catch (_e){ seg = ""; }
  if (!seg) drop("tracePadSeg", "tracePadSegSay");   // its own status line goes with it
  var mesh = null;
  try { mesh = (UJ && UJ.cfg && UJ.cfg.mesh) || null; } catch (_e){ mesh = null; }
  if (!(mesh && (mesh.meshBase || mesh.meshBaseAlt))){
    drop("tracePadGhosts");        // beside the pad's own 3D window
    drop("tracingPasteGhosts");    // the same control on the pasted-contours side
    drop("tracePadHelpGhosts");    // and the line in the help table that describes them
  }
  return gone;
}

/* ── THE ZOOM MENU SAYS WHAT THIS VOLUME ACTUALLY IS ────────────  2026-09-20
   Each option's value is "mip:zoom" and its text begins with a width in µm and the data's own
   resolution in nm — "18 µm across — 32 nm data". Both numbers were typed for minnie65, whose
   finest scale is 8 nm. Lee16's finest is 4 nm, so mip 2 there is 16 nm and half as wide, and the
   menu was describing a volume the pad was not drawing.

   Computed from core/emtiles.js's own scale list rather than tabulated per tool:

       width µm = canvas px × (nm per voxel at this mip) ÷ zoom ÷ 1000

   µJump's six labels come out of this BYTE-IDENTICAL to the ones a person typed in 2026-09-17,
   which is the evidence that the arithmetic is the same arithmetic and not a second opinion.

   Only the head is rewritten. The tails — "a whole cell", "full detail", "drawn 2×" — say what
   the level is FOR, and that is true of any volume. The one exception is ", slower to load" on the
   widest option: see below, it is a fact about chunk geometry and is checked rather than kept.

   Silent when emtiles cannot answer. A menu with minnie65's numbers on it is wrong; a page that
   refuses to open the pad because a label could not be computed is worse. */
async function padRelabelMips(){
  var sel = document.getElementById("tracePadMip");
  if (!sel || typeof UJ === "undefined" || !UJ.emtiles) return false;
  try { if (!UJ.emtiles.configured()) UJ.emtiles.configure(tracingSources()); } catch (_e){}
  try { if (!UJ.emtiles.configured()) return false; } catch (_e){ return false; }
  var cv = document.getElementById("tracePad");
  var w = (cv && cv.width) || 560;
  var chunk0 = 0, chunk1 = 0;
  for (var i = 0; i < sel.options.length; i++){
    var o = sel.options[i], parts = String(o.value).split(":");
    var mip = parseInt(parts[0], 10) || 0, zoom = Math.max(1, parseInt(parts[1], 10) || 1);
    var got;
    try { got = await UJ.emtiles.scaleAt(mip); } catch (_e){ return false; }
    if (!got || !got.scale) return false;
    var nm = got.scale.resolution[0], um = w * nm / zoom / 1000;
    /* 18, 9, 4.5, 2.2, 1.1, 0.6 — whole numbers stay whole, the rest keep one decimal, which is
       exactly how the hand-written labels were written. */
    var head = (um >= 10 ? Math.round(um) : Math.round(um * 10) / 10) + " \\u00b5m"
             + (i === 0 ? " across" : "") + " \\u2014 " + nm + " nm data";
    o.textContent = o.textContent.replace(
      /^[\\d.]+ \\u00b5m( across)? \\u2014 \\d+ nm data/, head);
    try {
      var cs = got.scale.chunk_sizes && got.scale.chunk_sizes[0];
      if (i === 0) chunk0 = (cs && cs[0]) || 0;
      if (i === 1) chunk1 = (cs && cs[0]) || 0;
    } catch (_e){}
  }
  /* ", slower to load" IS A minnie65 FACT, AND IT IS CHECKED.
     There it is true: at 32 nm the chunks are 64 px wide where at 16 nm they are 128, so the
     widest view costs about three times as many fetches. Lee16 chunks 512 px at every scale, so
     its widest view is no slower than the next one and the warning would be a lie. */
  if (sel.options.length && chunk0 && chunk1 && chunk0 >= chunk1)
    sel.options[0].textContent =
      sel.options[0].textContent.replace(/, slower to load$/, "");
  return true;
}

'''

print("core/tracingcard.js")
edit("core/tracingcard.js", [
    (u"padTrimForHost and padRelabelMips land above the mount block",
     ANCHOR, HELPERS + ANCHOR),
], marker=u"A CONTROL THE DATASET CANNOT HONOUR IS REMOVED")


# ── and mount() calls them ────────────────────────────────────────────────────────────────────
MOUNT_OLD = u'''UJ.tracingcard.mount = function(el){
  el = el || document.getElementById("tracingCard");
  if (el && !el.firstElementChild) {
    try { el.innerHTML = tracingCardHtml(); }
    catch (e){ try { console.warn("tracingcard: mount", e); } catch (_c){} return false; }
  }
  return UJ.tracingcard.wire();
};'''

MOUNT_NEW = u'''UJ.tracingcard.mount = function(el){
  el = el || document.getElementById("tracingCard");
  if (el && !el.firstElementChild) {
    try { el.innerHTML = tracingCardHtml(); }
    catch (e){ try { console.warn("tracingcard: mount", e); } catch (_c){} return false; }
    /* Only what this module built is trimmed — see padTrimForHost's header. */
    try { padTrimForHost(el); } catch (_e){}
  }
  var ok = UJ.tracingcard.wire();
  /* AFTER wiring, and not awaited. The menu's listener is already on by then, so a relabel cannot
     race it, and the first scale fetch must not hold up a card that is otherwise ready. */
  try { padRelabelMips(); } catch (_e){}
  return ok;
};'''

edit("core/tracingcard.js", [
    (u"mount trims the card and relabels the zoom menu", MOUNT_OLD, MOUNT_NEW),
])


# ── the header's own list of what is still µJump-shaped ───────────────────────────────────────
HDR_OLD = u'''     - the card's MARKUP is still in ujump.html's body; this file wires it but does not build it.'''
HDR_NEW = u'''     - (fixed 2026-09-20, stage C) the card's MARKUP is built by tracingCardHtml(); a host
       supplies an empty <div class="card" id="tracingCard"></div> and calls UJ.tracingcard.mount().
     - (fixed 2026-09-20) the two ticks that need a segmentation and meshes are removed on a
       dataset that has neither, and the pad's six zoom labels are computed from the volume's own
       scale list instead of carrying minnie65's numbers — padTrimForHost, padRelabelMips.'''

edit("core/tracingcard.js", [
    (u"the header stops claiming the markup is still in ujump.html", HDR_OLD, HDR_NEW),
])


# ── the help table's sentence about the ghosts gets something to be removed by ────────────────
# It is one sentence in the middle of a <td>, so there was nothing to take hold of. A span with an
# id is the smallest thing that makes it removable, and it changes nothing on a page that keeps it.
HELP_OLD = u'''The shape so far, rebuilt after every contour. With the checkbox, the cell&rsquo;s own mesh and the nucleus are drawn see-through around it. Drag to turn, scroll to zoom.'''
HELP_NEW = u'''The shape so far, rebuilt after every contour. <span id=\\"tracePadHelpGhosts\\">With the checkbox, the cell&rsquo;s own mesh and the nucleus are drawn see-through around it.</span> Drag to turn, scroll to zoom.'''

edit("core/tracingcard.js", [
    (u"the help line about the see-through cell can be removed with the tick", HELP_OLD, HELP_NEW),
])

print(u"\nnow: node tracingcardhtmlcheck.js && node emljumpcheck.js")
