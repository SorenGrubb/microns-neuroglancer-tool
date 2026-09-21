# -*- coding: utf-8 -*-
u"""core/tracingcard.js can keep nothing in the browser.                               2026-09-21

ωJump's build has a rule, enforced on every build: nothing but the theme lives in browser storage.
Its own words: "a half-remembered state that disagrees with what you think you did is a debugging
trap" -- work lives in the sheet or it does not exist. The tracing card keeps its tracings, drafts
and pen preference in localStorage, so that it works signed out; on ωJump that is exactly what the
rule forbids.

So one host setting, UJ.cfg.tracing.keepLocal (absent = true = today's behaviour everywhere):

  false  the card's store is a plain object in memory for the life of the page. Tracings go to the
         dataset when published; drafts go to the account when signed in (they did already); the
         pen tick is remembered for the session. Signed out, closing the page loses an unsaved
         draft -- and the card SAYS so where it used to say "saved in this browser".

Every storage call in the card now goes through tracingStore(), so the choice is made in one place
-- and a page that inlines the card has no literal localStorage calls to explain to its own guard.

Run: python3 src/the_card_can_keep_nothing_in_the_browser.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def edit(rel, pairs):
    p = os.path.join(HERE, rel); s = io.open(p, encoding="utf-8").read(); b = s
    for name, old, new, n_expected in pairs:
        if new in s and old not in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == n_expected, "%s / %s: %d" % (rel, name, n)
        s = s.replace(old, new); print("  ok: %s (x%d)" % (name, n))
    if s != b: io.open(p, "w", encoding="utf-8").write(s)

print("core/tracingcard.js")
edit("core/tracingcard.js", [
 (u"the one store",
  u'''function tracingScopedKey(k){''',
  u'''/* THE ONE STORE, 2026-09-21. localStorage, unless the host says keepLocal: false -- then an object
   in memory for the life of the page. See src/the_card_can_keep_nothing_in_the_browser.py. */
var TRACING_MEM = {};
var TRACING_MEM_STORE = {
  getItem: function(k){ return Object.prototype.hasOwnProperty.call(TRACING_MEM, k) ? TRACING_MEM[k] : null; },
  setItem: function(k, v){ TRACING_MEM[k] = String(v); },
  removeItem: function(k){ delete TRACING_MEM[k]; }
};
function tracingKeepsLocal(){
  try { var v = tracingCfg().keepLocal; return v === undefined ? true : !!v; } catch (_e){ return true; }
}
function tracingStore(){
  if (!tracingKeepsLocal()) return TRACING_MEM_STORE;
  try { return window.localStorage || TRACING_MEM_STORE; } catch (_e){ return TRACING_MEM_STORE; }
}
function tracingScopedKey(k){''', 1),
 (u"every read through it", u"localStorage.getItem(", u"tracingStore().getItem(", 4),
 (u"every write through it", u"localStorage.setItem(", u"tracingStore().setItem(", 4),
 (u"the draft message says where it went",
  u'''  if (explicit) padSay(draftSignedIn()
    ? "Draft saved \\u2014 in this browser and on your account, so you can carry on from another "
      + "machine. The pad reopens where you left it, on the same section."
    : "Draft saved in this browser. Close the page if you like \\u2014 the pad reopens where you "
      + "left it, on the same section. Sign in and it is kept on your account too.");''',
  u'''  if (explicit) padSay(!tracingKeepsLocal()
    ? (draftSignedIn()
       ? "Draft saved on your account, so you can carry on later or from another machine. This "
         + "tool keeps no work in the browser itself."
       : "Draft kept on this page only \\u2014 this tool keeps no work in the browser. Sign in and "
         + "it is saved to your account; close the page without signing in and it is gone.")
    : draftSignedIn()
    ? "Draft saved \\u2014 in this browser and on your account, so you can carry on from another "
      + "machine. The pad reopens where you left it, on the same section."
    : "Draft saved in this browser. Close the page if you like \\u2014 the pad reopens where you "
      + "left it, on the same section. Sign in and it is kept on your account too.");''', 1),
])
import re
s = io.open(os.path.join(HERE, "core", "tracingcard.js"), encoding="utf-8").read()
code = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
left = re.findall(r"localStorage\.(get|set|remove)Item", code)
assert not left, "a storage call still bypasses tracingStore(): %d" % len(left)
print("  no storage call bypasses tracingStore()")
