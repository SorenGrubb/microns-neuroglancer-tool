# -*- coding: utf-8 -*-
u"""The stamp moves when core/ moves.                                            2026-09-19

Søren, twice in one evening: *"It seems like nothing happened?"* and *"I have pressed ctrl+shift+R
many times, it does not update"*. Both times his page showed a fresh build stamp while the thing he
was looking at came from `core/panel.js`, which the stamp says nothing about.

THIS IS build_stamps.py's OWN ARGUMENT, ONE LEVEL DOWN. Its docstring: *"There was no way to tell a
stale browser cache from a stale file by looking."* So every page carries a stamp, and its tooltip
promises exactly that. But it stamps the seven PAGES, and the ~14 `core/*.js` files they load are
separate requests with their own cache lifetimes and no stamp at all. Three of today's fixes live
entirely in core/panel.js, so every page was byte-identical, nothing re-stamped, and the page went
on displaying a time that had nothing to do with the code running on it.

WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT. The stamp now moves when any core file a page
loads has changed. That makes it TRUE again -- a stamp older than the build you were told about
means the page or something it loads is stale -- and it costs nothing: the version is recorded
beside the hash in .build_stamps.json and never appears in the markup.

It does NOT put a version in the script URLs, which is what would actually stop a stale core file
being served. That was written, checked, and backed out the same evening: roughly sixteen
generators anchor on the exact string `<script src="core/x.js"></script>` and would all fail
NOT FOUND on a re-run, and organcardcheck inlines core files by the same literal and died outright.
Worth doing, worth doing deliberately, and not worth doing by surprise. See the project note
"the stamp does not cover what the page loads".

A WIDER CLAIM, SAID OUT LOUD. The stamp used to mean "when this file last changed" and now means
"when this page or anything it loads last changed". The second is what the tooltip always promised
and what somebody reading it actually wants to know.

Run: python3 src/the_stamp_moves_when_core_moves.py
     python3 src/build_stamps.py && node stampcheck.js
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAIRS = [
    (u'''STAMP_RE = re.compile(r'<span class="build"[^>]*>build [^<]*</span>')''',
     u'''STAMP_RE = re.compile(r'<span class="build"[^>]*>build [^<]*</span>')

# ── THE FILES THE PAGE LOADS COUNT AS THE PAGE ──────────────────────  2026-09-19
#
# Søren, twice: "It seems like nothing happened?" and "I have pressed ctrl+shift+R many times, it
# does not update." Both times the page showed a fresh stamp and ran an old core/panel.js. Three
# fixes that day lived entirely in core/, so every page was byte-identical, nothing re-stamped, and
# the stamp displayed a time with no relation to the code running underneath it.
#
# Everything this module's docstring says about telling a stale cache from a stale file is true of
# a core file, and none of it covered them. So the stamp now moves when they do. It says nothing
# about WHICH file changed -- one number for "and everything it loads" is enough to answer the only
# question anybody asks the stamp.
CORE_TAG = re.compile(r'<script src="core/[A-Za-z0-9_.\\-]+\\.js"')

def core_version():
    """One short hash over every core/*.js, so a change to any of them moves every page's stamp."""
    d = os.path.join(HERE, "core")
    if not os.path.isdir(d):
        return ""
    h = hashlib.sha256()
    for name in sorted(os.listdir(d)):
        if not name.endswith(".js"):
            continue
        h.update(name.encode("utf-8"))
        h.update(io.open(os.path.join(d, name), "rb").read())
    return h.hexdigest()[:10]''',
     "the stamper knows what the core files hash to"),

    (u'''    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    state, changed, kept = {}, [], []''',
     u'''    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    corever = core_version()
    state, changed, kept = {}, [], []''',
     "...and computes it once per run"),

    (u'''        h = content_hash(s)
        old = prev.get(page) or {}
        if old.get("hash") == h and STAMP_RE.search(s) and old.get("stamp"):''',
     u'''        h = content_hash(s)
        old = prev.get(page) or {}
        # Recorded beside the hash and never written into the markup: what changed is what the page
        # SERVES, and a page that loads no core files (index.html) is unaffected by any of it.
        mine = corever if CORE_TAG.search(s) else ""
        if old.get("hash") == h and old.get("core", "") == mine \\
                and STAMP_RE.search(s) and old.get("stamp"):''',
     "...and a page re-stamps when what it loads has changed"),

    (u'''        state[page] = {"hash": content_hash(s), "stamp": when}''',
     u'''        state[page] = {"hash": content_hash(s), "stamp": when,
                       "core": corever if CORE_TAG.search(s) else ""}''',
     "...which is written down so it can be compared next time"),
]

CHECK = [
    (u'''try { state = JSON.parse(fs.readFileSync(path.join(page.dir(), ".build_stamps.json"), "utf8")); }''',
     u'''/* The same hash over core/*.js the stamper takes, recomputed rather than trusted -- a recorded
   number that nothing recomputes is a number that can quietly stop being true. */
const coreVersion = () => {
  const d = path.join(page.dir(), "core");
  if (!fs.existsSync(d)) return "";
  const h = crypto.createHash("sha256");
  fs.readdirSync(d).filter(n => n.endsWith(".js")).sort().forEach(n => {
    h.update(n, "utf8"); h.update(fs.readFileSync(path.join(d, n)));
  });
  return h.digest("hex").slice(0, 10);
};
try { state = JSON.parse(fs.readFileSync(path.join(page.dir(), ".build_stamps.json"), "utf8")); }''',
     "the check can recompute the core version too"),
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


TAIL = u'''
/* ── AND THE FILES THE PAGES LOAD ──────────────────────────────  2026-09-19
   Søren, twice in one evening, looking at a page whose stamp was fresh and whose core/panel.js was
   not. A stamp that covers only the HTML answers "is this page current?" while the question being
   asked is "is what I am looking at current?", and those came apart the moment a fix lived entirely
   in core/. The stamper records the core hash per page; this recomputes it and fails if any page
   was stamped against a different one. */
console.log("\\n--- and the stamp covers what the page loads ---");
{
  const want = coreVersion();
  ok("core/ hashes to something", /^[0-9a-f]{10}$/.test(want), want);
  const behind = STAMPED.filter(function(f){
    if (!/<script src="core\\//.test(read(f))) return false;   // index.html loads none
    return !state[f] || state[f].core !== want;
  });
  ok("no page is stamped against an older core/", behind.length === 0,
     behind.length ? behind.join(", ") + "  <- run python3 src/build_stamps.py"
                   : STAMPED.length + " hand-maintained pages, one core version");
}
'''


def append_tail(rel, marker, block):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    print(rel)
    if marker in s:
        print("  already there: the core-version assertion")
        return
    # Before the file's own verdict, which must stay last.
    anchor = u'''const bad = R.filter'''
    assert s.count(anchor) == 1, "anchor found %d times" % s.count(anchor)
    s = s.replace(anchor, block + u"\n" + anchor, 1)
    io.open(p, "w", encoding="utf-8").write(s)
    print("  ok: the core-version assertion")


edit("src/build_stamps.py", PAIRS)
edit("stampcheck.js", CHECK)
append_tail("stampcheck.js", "the stamp covers what the page loads", TAIL)
print("\nnow: python3 src/build_stamps.py && node stampcheck.js")
