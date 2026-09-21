# -*- coding: utf-8 -*-
u"""volrowcheck.js: "the button is gone" stopped being the rule on 2026-09-09.             2026-09-21

Its three standing failures (one per page it runs on) were all this assertion. Søren, on πJump
that day: "I clicked calculate volume, and it did that without me being signed in. But, there was
no option to recalculate when I was signed in." So a compute that was NOT saved keeps its button,
relabelled "Save volume", and only a saved one hides it. The check runs signed out, so its compute
is never saved and the button rightly stays. It now asserts the rule as it is: unsaved -> the
button is there and says "Save volume"; saved -> it is gone.

Run: python3 src/volrowcheck_knows_the_save_button.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(HERE, "volrowcheck.js"); s = io.open(p, encoding="utf-8").read()
OLD = u'''    ok("...and the button is gone, which it always was",
       btn.style.display === "none",
       "hiding the button was never the bug — writing the number nowhere was");'''
NEW = u'''    /* Since 2026-09-09 a compute that was not saved keeps its button, as "Save volume" -- this
       check runs signed out, so that is the case here. A saved one hides it, as it always did. */
    const unsaved = /not saved/.test(volrow.textContent);
    ok(unsaved ? "...and, not saved, the button stays and offers to save it"
               : "...and, saved, the button is gone",
       unsaved ? (btn.style.display !== "none" && /Save volume/.test(btn.textContent))
               : btn.style.display === "none",
       (unsaved ? "not saved" : "saved") + " · button " + (btn.style.display || "shown")
       + " · \\u201c" + btn.textContent.trim() + "\\u201d");'''
if NEW in s: print("already there")
else:
    assert s.count(OLD) == 1; io.open(p, "w", encoding="utf-8").write(s.replace(OLD, NEW, 1)); print("ok")
