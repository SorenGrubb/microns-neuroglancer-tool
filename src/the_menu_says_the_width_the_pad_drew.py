# -*- coding: utf-8 -*-
u"""The zoom menu and the pad's own caption stop disagreeing.                    2026-09-20

Measured on δJump in a 1280 px window:

    the menu's selected option  "11 µm — 19.4 nm data, a whole cell"
    the pad's caption           "z 10196 · 13.9 µm across · 19.4 nm data"

Both describe the same picture and they differ by 26%.

── WHY ────────────────────────────────────────────────────────────────────────

`padRelabelMips()` computes each label from the canvas's width, and it runs at MOUNT time, when
the pad is still `display:none` and the canvas still has the 560 it was given in the markup. The
pad then sizes its canvas to the card when it opens:

    const wide = Math.max(320, Math.min(880, host.clientWidth - 2))

— 718 px in that window. So the menu described a 560 px pad and the caption described the real one.

This predates the relabelling: the six labels were hand-written for 560 px in 2026-09-17, and
`padRelabelMips` reproduced them faithfully, including the assumption. It is only visible now
because the caption beside it has always been computed from the draw.

── THE FIX, AND WHAT IT CHANGES ON µJUMP ──────────────────────────────────────

Relabel after a draw, when the canvas is the size it will actually be. The menu then agrees with
the caption on every page and at every window width.

**This does move µJump's numbers.** They read 18 / 9 / 4.5 / 2.2 / 1.1 / 0.6 µm for a 560 px pad,
and on a wide window they will read about 23 / 11.5 / 5.8 and so on — because that is how much
tissue is on the pad. The old numbers were right only when the window was narrow enough to pin the
canvas at 560, and the caption has been contradicting them the whole time.

The MOUNT-time relabel stays: before the pad has ever been opened there is no drawn width to use,
and a menu labelled for 560 is better than one labelled for minnie65.

Run: python3 src/the_menu_says_the_width_the_pad_drew.py
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


DRAW_OLD = u'''      onProgress: function(d, n){ if (d < n) padSay("Loading the section\\u2026 " + d + "/" + n); }
    });'''

DRAW_NEW = u'''      onProgress: function(d, n){ if (d < n) padSay("Loading the section\\u2026 " + d + "/" + n); }
    });
    /* ── THE MENU NOW DESCRIBES THIS PAD, NOT A 560 px ONE ────────  2026-09-20
       padRelabelMips also runs at mount, where the canvas still has the 560 the markup gives it
       because the pad is display:none and has no width to measure. The pad then sizes itself to
       the card — 718 px in a 1280 px window — so the menu read "11 µm" beside a caption reading
       "13.9 µm across", both about the same picture. drawSection has just set cv.width to the
       width it really used, so this is the first moment the two can agree. Not awaited: the
       labels are not what the reader is waiting for. */
    try { padRelabelMips(); } catch (_e){}'''

print("core/tracingcard.js")
edit("core/tracingcard.js", [
    (u"the menu is relabelled from the width actually drawn", DRAW_OLD, DRAW_NEW),
], marker=u"THE MENU NOW DESCRIBES THIS PAD")


# ── and padRelabelMips says which width it is using and why ───────────────────────────────────
W_OLD = u'''  var cv = document.getElementById("tracePad");
  var w = (cv && cv.width) || 560;'''

W_NEW = u'''  /* THE CANVAS'S OWN WIDTH, which is the number of voxels drawn across it. At mount that is the
     560 the markup carries, because the pad is display:none and has nothing to measure; after the
     first draw it is what the pad actually used, and padOpen calls this again then. The six
     hand-written labels this reproduces were written for 560, so before a draw the menu says what
     they said and after one it says what is on screen. */
  var cv = document.getElementById("tracePad");
  var w = (cv && cv.width) || 560;'''

edit("core/tracingcard.js", [
    (u"...and says which width it is describing", W_OLD, W_NEW),
])

print(u"\nnow: node tracingcardhtmlcheck.js && node emdjumpcheck.js && node emljumpcheck.js")


# ── and the relabel is idempotent on a volume with fractional nanometres ──────────────────────
# Found by this change rather than by reading: after the fix above, δJump's menu still said 11 µm
# beside a caption saying 13.9. The regex matched `\d+ nm data`, which matches "16" and "32" and
# NOT "19.4" — so on V1DD the very first relabel rewrote "16 nm data" to "19.4 nm data" and every
# relabel after that found nothing to replace and did nothing. It worked once and then stopped,
# which is why the mount-time labels looked right and the after-draw ones never arrived.
RX_OLD = u'''      /^[\\d.]+ \\u00b5m( across)? \\u2014 \\d+ nm data/, head);'''
RX_NEW = u'''      /* [\\d.]+ FOR THE NANOMETRES TOO. `\\d+` matches minnie65's 16 and 32 and Lee16's 4 and 8,
         and not V1DD's 19.4 — so on V1DD this replaced once, put a decimal into the string, and
         then never matched again. A relabel that runs on every draw has to be idempotent. */
      /^[\\d.]+ \\u00b5m( across)? \\u2014 [\\d.]+ nm data/, head);'''

edit("core/tracingcard.js", [
    (u"...and the relabel keeps working on a volume with fractional nm", RX_OLD, RX_NEW),
])
