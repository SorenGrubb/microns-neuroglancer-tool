# -*- coding: utf-8 -*-
u"""core/tracingcard.js, stage A: the move, and nothing else.                    2026-09-20

Søren: *"Start extracting it into core/tracingcard.js the way panel.js was extracted... We need to
have the pad fixed so that it can be easily implemented into new tools."*

WHAT THIS STAGE DOES, AND WHAT IT DELIBERATELY DOES NOT. It moves 3,509 lines out of ujump.html
into core/tracingcard.js and changes NOTHING about them except the one thing that stops them
working from a separate file. No renaming, no hooks, no new parameters, no storage-key namespacing
— those are stage B, and they are changes that have to be argued for one at a time.

The reason for that split is the whole method: after this stage every tracing check must give the
SAME ANSWER IT GAVE BEFORE, including volrowcheck's three known reds. A stage that both moves code
and changes it cannot be verified that way, because a failure has two possible causes.

── THE RANGE, AND HOW BOTH ENDS ARE PINNED ─────────────────────────────────

Lines 8465-11973 as the file stands today: the block's own header comment through the closing
`})();` of wireTracing. Surveyed first, declaration by declaration — the subsystem is very nearly
contiguous, and the only non-tracing names inside it are four helpers that belong to it anyway
(volFmt, hexA, organOverlayInto, organShowAllInViewer).

NEITHER END IS MATCHED BY LINE NUMBER, because line numbers move. The start is found by a PREFIX of
its header comment — not the whole line, because that line ends in a run of box-drawing characters
whose length cannot be reproduced by counting, a trap this project has now hit three times. The end
is found by searching forward for the exact `})();` that closes wireTracing, and then CHECKED: the
next non-blank line must be the BULK ORGANELLE ANNOTATION comment. If anything has been inserted
between them, the assertion fires rather than the cut silently taking somebody else's code.

── THE ONE THING THAT HAD TO CHANGE ────────────────────────────────────

Two of the three top-level statements in the block are IIFEs that wire DOM elements:

    (function wirePad(){ const cv = document.getElementById("tracePad"); if (!cv) return; ... })();
    (function wireTracing(){ const sel = document.getElementById("tracingType"); if(!sel)return; ...})();

Inside ujump.html they run at the bottom of the body, where those elements exist. From a <script
src> in the head they run BEFORE the body is parsed — and because both already guard on finding
their element, they would return quietly and the pad would simply be dead, with no error anywhere.
That is the worst failure this move could have: silent, and indistinguishable from a page that
never had the feature.

So they become named declarations and are called from one place, `UJ.tracingcard.wire()`, which
runs on DOMContentLoaded if the document is still loading and immediately if it is not — and which
is idempotent, because a host that builds the card later will call it again and two sets of
listeners on one button is a click that fires twice.

The third top-level statement, watchCurPos, is left exactly as it is: it wraps window.CUR_POS in a
property, touches no DOM, and is entirely inside a try/catch. It MUST run before the first CUR_POS
assignment, and from the head it does.

Run: python3 src/tracingcard_stage_a_the_move.py
"""
import io
import os
import re

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(HERE, "ujump.html")
MOD = os.path.join(HERE, "core", "tracingcard.js")

START_PREFIX = u"/* ── TRACING A CELL THE SEGMENTATION DOES NOT HAVE"
END_LINE = u"})();"
AFTER_PREFIX = u"/* ── BULK ORGANELLE ANNOTATION"

# The four names that are not called "tracing" anything but belong to the block. Asserted present
# so a future re-run that finds a shorter range fails instead of leaving them behind.
MUST_CONTAIN = ["function tracingRead(", "function padOpen(", "function draftSave(",
                "function tracingKeep(", "function volFmt(", "function hexA(",
                "function organOverlayInto(", "function organShowAllInViewer(",
                "function tracingResolveAt(", "function pad3DDraw("]
# And what must NOT be in it, which is how a range that has run on too far announces itself.
MUST_NOT_CONTAIN = ["BULK_ORGAN_ENVELOPE", "function bulkOrganCellName(", "function showNucleus("]

HEADER = u'''/* ── core/tracingcard.js ─ trace a cell or organelle ────────────────────────────
   Extracted verbatim from ujump.html on 2026-09-20 (stage A of the tracing extraction in
   claude/the-tracing-card-has-to-be-extracted.md) so µJump, λJump, δJump, βJump and ηJump can share
   ONE tracing card instead of growing five that drift.

   Søren: *"We need to have the pad fixed so that it can be easily implemented into new tools."*

   WHY THIS FILE EXISTS AT ALL. The subsystem is 96 top-level functions and ~3,500 lines. Porting
   it by hand to four more pages would be a fork four times the size of the ηJump organelle form
   that cost a day to undo in September, and it would drift the same way for the same reason.

   NOTHING WAS RENAMED. Every function is still a plain global, so no call site in ujump.html
   changed — the same convention core/mesh.js, core/gamify.js and core/panel.js already use.

   WHAT IS IN HERE:
     - the tracing store and its list (tracingRead/Write, tracingRenderList, tracingGroups)
     - reading contours out of a pasted Neuroglancer link (tracingReadLink, tracingWhat)
     - structure ids, numbering and publishing (tracingNextIndex, tracingKeep, tracingPublish)
     - putting contours BACK into a viewer (tracingRingLines, tracingShowCellIn, tracingViewerOpen,
       organOverlayInto, organShowAllInViewer)
     - the 3D preview beside the pad (pad3D*)
     - volumes (tracingVolumeOf, padVolume, tracingVolShow)
     - drafts, local and server-side (draft*)
     - THE PAD itself: one section of EM with a real polygon tool on it (padOpen, padDraw,
       padPaint, padRings, padStep, and the wirePad listeners)

   ── HOST CONTRACT ─ what the page must provide ───────────────────────────────────

   required : escHtml, postReport, REPORT_ENDPOINT, REPORTER_NAME, REPORTER_EMAIL,
              GOOGLE_VERIFIED, GOOGLE_CREDENTIAL, buildState(pos), SRC (with .em/.seg/.nuc),
              UJ.cfg (.id, .res)
   from core: core/segread.js, core/segpaint.js, core/emtiles.js, core/tracepad.js,
              core/traceloft.js, core/tracing.js, core/organellelink.js, core/nucmesh.js,
              core/ontology.js (LEAF_NAMES), core/organelles.js, core/gamify.js
   optional : CUR_POS, CUR_ROOT, CUR_NUCID, NID, NT, OWN_TYPE, OWN_TYPE_NAMES, CT_NAMES,
              rootId, rootIdToIndex, showSubmitToast, refreshFavStars — every one reached
              through a `typeof` guard, so a page with none of them still runs the card

   STILL µJUMP-SHAPED, AND KNOWN TO BE (stage B fixes each, deliberately not in the same edit as
   the move):
     - four localStorage keys are literal "ujump_..." strings. A second tool loading this file
       TODAY would share µJump's tracings and drafts — exactly the bug storagekeycheck.js was
       written for. Nothing else loads it yet.
     - SRC.em / SRC.seg / SRC.nuc are read directly in six places.
     - tracingIdentityFor reads NID/NT/OWN_TYPE/CT_NAMES, which are µJump's own tables.
     - the card's MARKUP is still in ujump.html's body; this file wires it but does not build it.

   DOM IDS THIS MODULE READS/WRITES — a host page must use these names:
     #tracingCard #tracingPanel #tracingX/Y/Z #tracingOpen #tracePadOpen #tracePad #tracePadWrap
     #tracePadMip #tracePadPrev #tracePadNext #tracePadStep #tracePadUndo #tracePadPen
     #tracePadSeg #tracePadSegSay #tracePadZ #tracePadSay #tracePadRings #tracePadVol
     #tracePadInsts #tracePadNewInst #tracePadHelp #tracingLink #tracingLayer #tracingRead
     #tracingStatus #tracingFound #tracingLayers #tracingWhat #tracingType #tracingColor
     #tracingEachOwn #tracingEachList #tracingDraftBar #tracingList

   CAUTION when editing: this file declares 318 top-level names, many with `const`/`let`. Top-level
   const DOES cross <script> boundaries but is NOT on window, and a second declaration of the same
   name anywhere on the page is a SyntaxError that silently kills that whole block. Before wiring a
   new tool to this file, check the page for its own TRACING_*, PAD_*, DRAFT_* declarations. */
'''

WIRE_TAIL = u'''
/* ── WHERE THE TWO WIRING PASSES ARE CALLED FROM ─────────────────────  2026-09-20
   wirePad and wireTracing were IIFEs, run where they sat at the bottom of ujump.html's body. From
   a <script src> in the head they would run before the body exists — and since both guard on
   finding their element, they would return quietly and the pad would be dead with nothing in the
   console to say so. That is the one failure this extraction could have made invisible.

   IDEMPOTENT ON PURPOSE. µJump has the card in its markup and is wired once, on DOMContentLoaded.
   A tool that BUILDS the card when a panel opens calls UJ.tracingcard.wire() again afterwards, and
   two sets of listeners on one button is a button that fires twice. */
UJ.tracingcard = UJ.tracingcard || {};
UJ.tracingcard.wire = function(){
  if (UJ.tracingcard._wired) return false;
  var padEl = document.getElementById("tracePad"),
      typeEl = document.getElementById("tracingType");
  if (!padEl && !typeEl) return false;        // the card is not on the page (yet)
  UJ.tracingcard._wired = true;
  try { wirePad(); } catch (e){ try { console.warn("tracingcard: wirePad", e); } catch (_c){} }
  try { wireTracing(); } catch (e){ try { console.warn("tracingcard: wireTracing", e); } catch (_c){} }
  return true;
};
if (typeof document !== "undefined"){
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", function(){ UJ.tracingcard.wire(); });
  else UJ.tracingcard.wire();
}
'''

LEFT_BEHIND = u'''/* the tracing card (the pad, the link reader, lofts, volumes, drafts, publishing) moved to
   core/tracingcard.js on 2026-09-20 — see the header there. The card's MARKUP is still in the
   body of this file; the module wires it by id. */
'''


def main():
    src = io.open(PAGE, encoding="utf-8").read()
    L = src.split("\n")

    # ── both ends, found rather than counted ──────────────────────────────────────────────────
    starts = [i for i, l in enumerate(L) if l.startswith(START_PREFIX)]
    assert len(starts) == 1, "ujump.html: found %d candidates for the block's first line" % len(starts)
    a = starts[0]

    # the end: the LAST `})();` at column 0 before the bulk-organelle comment
    afters = [i for i, l in enumerate(L) if l.startswith(AFTER_PREFIX)]
    assert len(afters) == 1, "ujump.html: found %d BULK ORGANELLE markers" % len(afters)
    after = afters[0]
    b = max(i for i in range(a, after) if L[i] == END_LINE)
    # nothing but blank lines may sit between the cut and that marker
    between = [l for l in L[b + 1:after] if l.strip()]
    assert not between, \
        "ujump.html: %d non-blank lines between the block's end and BULK ORGANELLE: %r" \
        % (len(between), between[:2])

    block = "\n".join(L[a:b + 1])
    print("  range: lines %d-%d  (%d lines, %d bytes)" % (a + 1, b + 1, b - a + 1, len(block)))

    for m in MUST_CONTAIN:
        assert m in block, "the range does not contain %r — it is too short" % m
    for m in MUST_NOT_CONTAIN:
        assert m not in block, "the range contains %r — it has run on too far" % m
    print("  endpoints pinned, %d must-haves present, %d must-not-haves absent"
          % (len(MUST_CONTAIN), len(MUST_NOT_CONTAIN)))

    # ── the one change: the two DOM-wiring IIFEs become declarations ──────────────────────────
    # POSITIONALLY, NOT BY COUNTING. There are THREE top-level `})();` closers in this block, and
    # only two of them are being changed: watchCurPos is an IIFE as well, comes FIRST, and must
    # keep running at load time. A split-and-rejoin on the closer string rewrites all three and
    # turns watchCurPos into a function nobody calls -- CUR_POS stops being watched, the coordinate
    # boxes stop following the cell, and no check that does not click would notice.
    assert block.count(u"(function watchCurPos(){") == 1, "watchCurPos is not where it was"
    for head, name in [(u"(function wirePad(){", "wirePad"),
                       (u"(function wireTracing(){", "wireTracing")]:
        assert block.count(head) == 1, "expected exactly one %r" % head
        i = block.index(head)
        assert block.index(u"(function watchCurPos(){") < i, \
            "watchCurPos no longer comes before %s; the closer arithmetic below assumes it does" % name
        j = block.index(u"\n})();", i)
        block = block[:j] + u"\n}" + block[j + len(u"\n})();"):]
        block = block.replace(head, head[1:], 1)
        print("  ok: %s is a declaration now, not an IIFE" % name)
    # THREE COLUMN-0 `})();` MUST SURVIVE, and naming them is the assertion. The first version
    # asserted "one", on the belief that watchCurPos was the only other IIFE in the block. It is
    # not: draftStore and PAD_MAC are both initialised by an IIFE whose closer also sits at column
    # 0 -- they are VALUE expressions, not statements, and turning either into a declaration would
    # have left a `var` initialised to a function nobody calls. Caught by the count, which is why
    # the count was worth writing even though it was wrong.
    for owner, head in [("watchCurPos", u"(function watchCurPos(){"),
                        ("draftStore", u"var draftStore = (function(){"),
                        ("PAD_MAC", u"var PAD_MAC = (function(){")]:
        assert block.count(head) == 1, "%s lost its IIFE form" % owner
    assert block.count(u"\n})();") == 3, \
        "expected the three IIFEs that are not DOM wiring to keep their closers, found %d" \
        % block.count(u"\n})();")

    # ── the module ────────────────────────────────────────────────────────────────────────────
    io.open(MOD, "w", encoding="utf-8").write(
        HEADER + u"var UJ = UJ || {};\n" + block + u"\n" + WIRE_TAIL)
    print("  ok: core/tracingcard.js written (%d lines)" % (HEADER + block + WIRE_TAIL).count("\n"))

    # ── the page ──────────────────────────────────────────────────────────────────────────────
    out = L[:a] + [LEFT_BEHIND.rstrip("\n")] + L[b + 1:]
    page = "\n".join(out)
    tag = u'<script src="core/tracing.js"></script>'
    assert page.count(tag) == 1, "ujump.html: core/tracing.js's tag is not unique"
    page = page.replace(tag, tag + u'\n'
        + u'<!-- The tracing card itself, extracted from this file on 2026-09-20. After the eight\n'
        + u'     modules it is built on and before this page\'s own script, which supplies the host\n'
        + u'     contract listed in its header (buildState, SRC, escHtml, postReport). -->\n'
        + u'<script src="core/tracingcard.js"></script>', 1)
    io.open(PAGE, "w", encoding="utf-8").write(page)
    print("  ok: ujump.html now loads it and keeps a marker where the code was "
          "(%d lines shorter)" % (len(L) - len(out)))


if __name__ == "__main__":
    if os.path.exists(MOD) and u"stage A of the tracing extraction" in io.open(
            MOD, encoding="utf-8").read():
        print("  already there: core/tracingcard.js exists and ujump.html has been cut")
    else:
        main()
    print(u"\nnow: ./baseline_tracing.sh > /tmp/after.txt && diff /tmp/before.txt /tmp/after.txt")
