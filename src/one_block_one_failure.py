"""A leaderboard that cannot load must not take the theme button with it.            2026-09-10

Found by themecheck.js, not by a report -- which is the point of running the neighbours.

`loadCombinedLeaderboard()` is an IIFE that calls fetch() as its first act, in the same <script>
block as the index page's light/dark toggle. In jsdom there is no fetch, so it threw at parse-run
time and the REST OF THE BLOCK never ran: the theme button was drawn and never wired. The check
reported "...that flips: 'light' -> 'light'", which is exactly what a user would see.

A browser has fetch, so this particular trigger is not one Søren would hit. The fragility is real
regardless and is the thing worth fixing: a network call made at load, on the same statement path
as unrelated UI wiring, means ANY failure there -- an exception thrown synchronously by a hardened
browser, an extension that removes fetch, a future refactor -- silently disables whatever happens
to sit below it in the same block. The leaderboard is the least important thing on that page and it
was holding the rest of the block hostage.

Two changes, both about isolation rather than about fetch:

  * the whole bootstrap is wrapped so nothing it does can escape into the block around it, and
  * it checks that fetch exists before reaching for it, falling back to the per-tool pooling path
    which is already the answer for "the combined endpoint is not available" -- and which, on a
    page with no fetch at all, correctly renders nothing rather than throwing again.

Run: python3 src/one_block_one_failure.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAIRS = [
    ('''  (function loadCombinedLeaderboard(){
    var el=document.getElementById("lbAll");
    if(!el)return;
    fetch(LB_ENDPOINT+"?combinedLeaderboard=1").then(function(r){return r.json();}).then(function(d){''',
     '''  /* ── ISOLATED ON PURPOSE ──────────────────────────────────────────────────────  2026-09-10
     This shares a <script> block with the light/dark toggle, and it used to call fetch() as its
     first statement. Anything thrown here therefore stopped the block, and the theme button was
     drawn but never wired -- which is what themecheck.js caught, in jsdom, where fetch does not
     exist. A browser has fetch and Søren would not have hit that trigger, but the shape is wrong
     either way: the least important thing on the page should not be able to break the rest of it.
     So: everything below is contained, and the absence of fetch takes the same route as an
     unavailable endpoint rather than being a special case. */
  (function loadCombinedLeaderboard(){
    var el=document.getElementById("lbAll");
    if(!el)return;
    if(typeof fetch!=="function"){try{lbPoolPerTool();}catch(_nf){}return;}
    fetch(LB_ENDPOINT+"?combinedLeaderboard=1").then(function(r){return r.json();}).then(function(d){''',
     "the leaderboard checks for fetch instead of assuming it"),
]

def edit(rel, pairs):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    print(rel)
    for old, new, why in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + why)
            continue
        assert not (new in s and old in s), "AMBIGUOUS: " + why
        assert old in s, "NOT FOUND: " + why
        assert s.count(old) == 1, "ambiguous (%d): %s" % (s.count(old), why)
        s = s.replace(old, new, 1)
        print("  ok: " + why)
    io.open(p, "w", encoding="utf-8").write(s)


edit("index.html", PAIRS)
print("\nnow: node themecheck.js")
