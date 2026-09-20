# -*- coding: utf-8 -*-
u"""The tracing card's first sentence is about the host's dataset.              2026-09-20

The card opens with:

    For a cell the segmentation does not have.

That is minnie65's situation, and a precise one: the top of that volume has nuclei segmented and
cells not, so an astrocyte at the glia limitans has a nucleus, a name, and nothing for the 3D
export to fetch. µJump's own wrapper comment says exactly that.

It is wrong on both of the other hosts, in opposite directions:

  λJump   Lee16's public release is IMAGE ONLY. There is no segmentation to be missing from, and
          "a cell the segmentation does not have" is every cell in the volume.
  δJump   V1DD has a segmentation and it is behind a CAVE login. A visitor without a token is in
          the same position for every cell; a visitor with one is in µJump's position.

The ticks beside it already read from the host (`padTrimForHost`), and so does the zoom menu
(`padRelabelMips`). The sentence that says what the card is FOR did not — so a card that had
correctly removed its segmentation tick still opened by talking about a segmentation.

── A STRING, NOT A HOOK WITH LOGIC ─────────────────────────────────────────────

`UJ.cfg.tracing.intro`, defaulting to µJump's sentence, so µJump is unchanged whether or not it
sets one and a page that sets nothing gets today's text. A function is accepted too, for a host
whose answer depends on whether somebody is signed in — δJump's does, and it uses it.

Run: python3 src/the_card_says_why_this_dataset_needs_it.py
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


# ── 1. the module asks the host what the card is for here ─────────────────────────────────────
FN_OLD = u'''function tracingCfg(){'''

FN_NEW = u'''/* ── WHY THIS DATASET NEEDS THE CARD ────────────────────  2026-09-20
   The card's first sentence was "For a cell the segmentation does not have." That is minnie65's
   situation and a precise one — the top of that volume has nuclei segmented and cells not. It is
   wrong on Lee16, which has no segmentation at all so that is EVERY cell, and wrong on V1DD,
   whose segmentation is behind a CAVE login so it depends who is asking.

   The ticks beside it already read from the host and so does the zoom menu; the sentence saying
   what the card is FOR did not, so a card that had correctly removed its segmentation tick still
   opened by talking about a segmentation.

   A plain string, or a function for a host whose answer depends on who is signed in. µJump's
   sentence is the default, so a page that sets nothing is unchanged. */
function tracingIntro(){
  try {
    var s = (UJ && UJ.cfg && UJ.cfg.tracing) ? UJ.cfg.tracing.intro : null;
    if (typeof s === "function") s = s();
    if (s) return String(s);
  } catch (_e){}
  return "For a cell the segmentation does not have.";
}
function tracingCfg(){'''

P_OLD = u'''    "<p class=\\"hint\\" style=\\"margin-top:8px\\">For a cell the segmentation does not have. The button below opens'''
P_NEW = u'''    "<p class=\\"hint\\" style=\\"margin-top:8px\\">" + tracingIntro() + " The button below opens'''

print("core/tracingcard.js")
edit("core/tracingcard.js", [
    (u"the module asks the host why the card is here", FN_OLD, FN_NEW),
    (u"...and opens with the answer", P_OLD, P_NEW),
], marker=u"WHY THIS DATASET NEEDS THE CARD")


# ── 2. the two hosts that are not minnie65 answer ─────────────────────────────────────────────
LJ_OLD = u'''    penKey:    "ljump_tracing_pen_v1",'''
LJ_NEW = u'''    penKey:    "ljump_tracing_pen_v1",
    /* Not "a cell the segmentation does not have" — there is no segmentation, so that is every
       cell in the volume, and saying it µJump's way would imply this dataset has one. */
    intro:     "The Lee16 release is image only, so every cell here is one you outline yourself.",'''

print("\nljump.html")
edit("ljump.html", [
    (u"λJump says why every cell here is traced by hand", LJ_OLD, LJ_NEW),
])

DJ_OLD = u'''    penKey:    "djump_tracing_pen_v1",'''
DJ_NEW = u'''    penKey:    "djump_tracing_pen_v1",
    /* A FUNCTION, because on this page the answer depends on who is asking. V1DD's segmentation
       is CAVE-authenticated: with a token you are in µJump's position, where the card is for the
       cells the segmentation missed; without one you are in λJump's, where it is for all of them.
       Reads the same key the Connectivity panel and the mesh downloads read. */
    intro:     function(){
                 var tok = "";
                 try { tok = (localStorage.getItem(UJ.cfg.mesh.caveTokenKey) || "").trim(); }
                 catch (_e){ tok = ""; }
                 return tok
                   ? "For a cell the segmentation does not have."
                   : "V1DD\\u2019s segmentation needs a CAVE token, so without one every cell here is "
                     + "one you outline yourself — and with one, this is for the cells it missed.";
               },'''

print("\ndjump.html")
edit("djump.html", [
    (u"δJump's answer depends on whether there is a token", DJ_OLD, DJ_NEW),
])

print(u"\nnow: node tracingcardhtmlcheck.js && node emljumpcheck.js && node emdjumpcheck.js")
