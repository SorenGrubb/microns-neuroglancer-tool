# -*- coding: utf-8 -*-
u"""ηJump's "Restore this version" stops confirming and doing nothing.          2026-09-20

`core/panel.js` draws a restore button in the cell-history panel and calls the host's
`restoreClassification` behind a `typeof` guard. Where the host has not got one, the button asks
*"Restore the cell to this earlier classification?"*, the user says yes, it disables itself, prints
"Submitting…" — and nothing is submitted. A confirmation dialogue for an action that cannot happen
is worse than no button.

── THE NOTE THIS CAME FROM WAS OUT OF DATE, AND MEASURING SAID SO ──────────────

The carried note said λJump, βJump and ηJump. Checked on the running pages rather than believed:

    βJump    core/report.js loaded, restoreClassification: function    → fine
    λJump    core/report.js loaded                                     → fine
    ηJump    core/report.js NOT loaded, restoreClassification: undefined

So it is **one page, not three**, and ηJump is also missing `showUndoToast` (which
restoreClassification calls) and `neuroglancerLinkForPos`.

── ONE SCRIPT TAG, AND THE CHECKING THAT SAYS IT IS SAFE ───────────────────────

Read off the running ηJump before adding anything:

  * **Nothing collides.** None of the ten functions core/report.js defines — showSubmitToast,
    restoreClassification, showUndoToast, the merged-nucleus form, the not-a-nucleus form — exists
    on ηJump already. That mattered: ηJump keeps its own `postReport`, and core/report.js's header
    says postReport was *deliberately* NOT moved into it for exactly that reason.
  * **Every required host global is present**: postReport, escHtml, coordSpan, REPORT_ENDPOINT,
    REPORTER_NAME, REPORTER_EMAIL, GOOGLE_VERIFIED, GOOGLE_CLIENT_ID.
  * **Every from-core global is present too**, including the core/tree.js names ηJump supplies from
    its own guided-identification code rather than by loading that file.
  * **The file has ZERO top-level executable statements and no reference to `UJ.cfg.tree`.**
    Parsed, it declares ten functions and does nothing. So a page that never calls the merged or
    not-a-nucleus forms is not changed by having them defined — which is what makes this one line
    rather than a port. (`UJ.cfg.tree` is null on ηJump; the file's header mentions that config,
    the code does not touch it.)

Same shape as core/mesh3d.js on δJump three hours ago: a module written to reach several tools,
and one tool that never got the tag.

── STILL MISSING, AND SAID RATHER THAN QUIETLY LEFT ────────────────────────────

`neuroglancerLinkForPos` is a different gap: core/panel.js uses it for the ".jumpview" link on a
coordinate, also behind a `typeof` guard, and ηJump builds its viewer links under another name.
That link does nothing on ηJump before this change and after it. Its own edit.

Run: python3 src/restore_this_version_actually_restores.py
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


TAG_OLD = u'''<script src="core/panel.js"></script>'''

TAG_NEW = u'''<script src="core/panel.js"></script>
<!-- ── THE SHARED REPORTING SURFACE ───────────────────────  2026-09-20
     core/panel.js's cell-history panel draws a "Restore this version" button and calls
     restoreClassification() behind a typeof guard. Without this file that guard was always false
     here: the button confirmed, disabled itself, said "Submitting…" and submitted nothing.

     SAFE TO ADD, CHECKED ON THE RUNNING PAGE RATHER THAN ASSUMED. None of the ten functions this
     file declares already exists here — including showSubmitToast, which matters, because
     ηJump keeps its own postReport and core/report.js's header records that postReport was
     deliberately left out of it for that reason. Every global its host contract requires is
     already present. And the file has no top-level statements at all: parsed, it declares ten
     functions and does nothing, so the merged-nucleus and not-a-nucleus forms it also carries are
     inert on a page that never opens them. -->
<script src="core/report.js"></script>'''

print("hjump.html")
edit("hjump.html", [
    (u"ηJump loads the file that defines restoreClassification", TAG_OLD, TAG_NEW),
], marker=u'<script src="core/report.js"></script>')

print(u"\nnow: node hjumpvolcheck.js && node organcardcheck.js")
