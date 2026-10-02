# -*- coding: utf-8 -*-
u"""The Discussion panel lives in the page, and the credit stays at the foot of it.      2026-10-03

Søren, with a screenshot of the Discussion tab showing the "This tool was made by Søren Grubb"
card at the top of it: *"This part should be moved to the bottom"*.

He is right about what he can see, and what he can see is the symptom of something worse.

THE PANEL WAS OUTSIDE THE PAGE. src/a_place_to_say_what_you_found.py anchored the new tab panel on
`</div></div><script type="application/json" id="nucdata">` -- two closing divs before the data
block. Those two divs are the credit CARD's and `.wrap`'S, not the dashboard panel's and the
card's, so the Discussion panel was inserted as a sibling of `.wrap`, with `<body>` for a parent.
Measured, not guessed: `document.querySelector('[data-tabpanel="forum"]').parentElement` was BODY.

It still worked, which is why nothing caught it: the tab engine switches panels by toggling a class
on `[data-tabpanel]` and does not care where they are, and a div outside `.wrap` still renders. It
just renders OUTSIDE the page's column -- full-bleed, past the margins every other panel sits in --
and it renders after the credit card, which is `.wrap`'s last child and therefore the page's footer.
So opening Discussion showed the footer first and the discussion somewhere underneath it.

MOVED TO WHERE IT BELONGS: inside `.wrap`, before the credit card, after every other panel. That is
one edit for both halves of the problem -- the panel gains the page's column and its position in the
tab order, and the credit card goes back to being the last thing on the page, which is what Søren
asked for and what it has always been on every other tab.

THE LESSON, WHICH THIS PROJECT KEEPS PAYING FOR: an anchor made of closing tags says nothing about
what it closes. `</div></div>` matched exactly once, so edit()'s uniqueness assertion passed and the
generator reported "ok" -- a unique anchor in the wrong place is still the wrong place. The check now
asserts the nesting rather than the markup's presence: forumcheck.js compares parents and sibling
order, which no amount of matching the right string can fake.

Check: forumcheck.js.
Run: python3 src/the_discussion_panel_lives_in_the_page.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

P = os.path.join(HERE, "ujump.html")
s = io.open(P, encoding="utf-8").read()

# The block as src/a_place_to_say_what_you_found.py left it: the comment, the panel, and the script
# that fills it the first time the tab is opened.
START = u'<!-- ── DISCUSSION ── 2026-10-01.'
END = u'<script type="application/json" id="nucdata">'

CARD = u'<div class="card">\n<p class="hint" style="margin:0">This tool was made by'

if s.index(START) < s.index(CARD):
    print("already there: the panel is before the credit card")
else:
    a = s.index(START)
    b = s.index(END, a)
    block = s[a:b]
    assert u'data-tabpanel="forum"' in block, "the block to move is not the Discussion panel"
    print("  moving %d characters" % len(block))
    s = s[:a] + s[b:]

    # Back in, immediately before the credit card -- which is .wrap's last child, so this lands
    # inside .wrap and after every other tab panel.
    n = s.count(CARD); assert n == 1, "credit card anchor: %d" % n
    s = s.replace(CARD, block + CARD, 1)

    # The two blank-ish lines the removal leaves where the block used to be.
    s = s.replace(u"</div>\n</div>\n\n" + END, u"</div>\n</div>\n" + END, 1)

    io.open(P, "w", encoding="utf-8").write(s)
    print("  ok: the Discussion panel is inside .wrap, above the credit card")

print("\nNow: node forumcheck.js, then python3 src/build_stamps.py")
