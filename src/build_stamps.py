"""Every tool carries a build stamp, the way χJump does.

Søren, 2026-09-02, with a screenshot of χJump's header: "For all of the tools, we should have a
build date and time, like for xJump."

WHY χJUMP HAS ONE, and why the rest need it. 2026-09-01 he asked "why is it not saving in the
folder?" about a file that was on his disk, current, and byte-identical to the one built here.
There was no way to tell a stale browser cache from a stale file by looking; checking meant a
checksum. A stamp turns that into a glance — and this family is delivered by copying files into a
served repo by hand, so "am I looking at the version we just made?" is a question that comes up
every single session.

THE HONEST VERSION OF A STAMP IS THE HARD PART. χJump and ωJump are generated, so their build
script writes the time and the stamp is true by construction. The other six pages and the index are
hand-maintained: a stamp written by a script that somebody forgets to re-run is worse than no stamp
at all, because it states a falsehood with a monospace font and a tooltip.

So this does not stamp with "now". It stamps with "now, IF THE FILE CHANGED", decided by hashing
the file with its own stamp removed and comparing against `.build_stamps.json`. Re-running it a
hundred times moves nothing. Edit one byte of ηJump and only ηJump's stamp moves. The stamp
therefore means what it says — when this file last changed — rather than when somebody last
happened to run a script.

WHAT IT DOES NOT SOLVE. A hand edit made without running this leaves the stamp behind, and nothing
here can know that. `stampcheck.js` closes that: it recomputes the hashes and fails if any page's
content has moved since its stamp, so the check suite catches a stale stamp the same way it catches
a stale count.

Run: python3 src/build_stamps.py            (from the build folder)
"""
import io, os, re, json, hashlib, datetime

# The pages live in the served repo and this script may sit in a build folder beside it, or in
# that repo's own src/. Both layouts, named -- the same trap corepath.js and build_xjump.py's
# core_path() exist for, and the third place it was waiting.
_HERE = os.path.dirname(os.path.abspath(__file__))
for _c in (_HERE, os.path.dirname(_HERE),
           os.path.join(os.path.dirname(_HERE), "..", "microns-neuroglancer-tool"),
           os.path.join(_HERE, "..", "microns-neuroglancer-tool")):
    if os.path.exists(os.path.join(_c, "index.html")):
        HERE = os.path.normpath(_c)
        break
else:
    raise SystemExit("cannot find index.html -- looked beside this script, one folder up, and in "
                     "microns-neuroglancer-tool/. The tool pages live in the served repo.")
STATE = os.path.join(HERE, ".build_stamps.json")

TITLE = ("When this file was built. If it does not match the file you think you are looking at, "
         "your browser is showing you a cached copy — reload with ctrl-shift-R.")

# ── the pages this script owns ───────────────────────────────────────────────────────────────
# NOT xjump.html or wjump.html: those are generated, their build scripts write the stamp as they
# write the page, and a second writer for one fact is how two writers disagree.
PAGES = ["ujump.html", "djump.html", "pjump.html", "ljump.html", "hjump.html", "bjump.html",
         "index.html"]

STAMP_RE = re.compile(r'<span class="build"[^>]*>build [^<]*</span>')

def stamp_html(when):
    return ('<span class="build" title="' + TITLE + '">build ' + when + '</span>')

# The CSS the stamp needs, added once per page if it is not already there. Same rule the rest of
# this family follows: a class used in markup and defined nowhere renders as unstyled text, which
# reads as a bug rather than as a missing stylesheet.
CSS = (" /* WHEN THIS FILE WAS BUILT. See src/build_stamps.py for why the date is the date the\n"
       "    file last CHANGED rather than the last time a script ran over it. */\n"
       " .build{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;\n"
       "   opacity:.75;color:var(--mut,var(--muted,inherit))}\n"
       " .buildline{margin:2px 0 14px}\n")


def content_hash(s):
    """The file with its stamp blanked, so re-stamping is not itself a change."""
    return hashlib.sha256(STAMP_RE.sub("<span class=\"build\"></span>", s)
                          .encode("utf-8")).hexdigest()


LINE_RE = re.compile(r'[ \t]*<p class="buildline">.*?</p>\n', re.S)

def close_of(s, i):
    """The index just past the </div> that closes the <div ...> starting at i.

    A regex cannot do this: `</div>\\n</div>\\n` matched the end of `<div id="gameChipSlot">
    </div>` plus the topbar-right close, and the stamp landed INSIDE the header row, sitting
    beside the theme button. Counting is three lines and cannot be fooled by a one-line div."""
    depth, j = 0, i
    for m in re.finditer(r"<div\b|</div>", s[i:]):
        depth += 1 if m.group(0) == "<div" else -1
        j = i + m.end()
        if depth == 0:
            return j
    raise AssertionError("unclosed <div> at " + str(i))


def insert_line(s, page):
    """Put the stamp under the header, once, in the right place.

    Any existing buildline is REMOVED first rather than left alone, so a stamp this script once
    put in the wrong place is corrected by re-running it instead of by hand."""
    s = LINE_RE.sub("", s)
    line = '<p class="buildline">' + stamp_html("0000-00-00 00:00") + '</p>\n'
    if page == "index.html":
        # No tool header here. At the END of the hero block, where the page has finished
        # introducing itself.
        #
        # This used to anchor on the lede's own "</p>" -- which stopped existing on 2026-09-10
        # when the index gained a section nav, and the whole run then died on an assert. Anchoring
        # on the hero's CLOSE instead is the thing that is actually being described ("after the
        # page introduces itself"), and it survives anything added inside the hero.
        anchor = "  </div>\n</header>"
        assert s.count(anchor) == 1, page + ": the hero"
        return s.replace(anchor, "    " + line + "  </div>\n</header>", 1)
    # The six tools: under the whole header row, not inside it. Every one of them has the same
    # shape -- the logo link, then <div class="topbar-right">, then the row's own close.
    i = s.index('<div class="topbar-right">')
    k = close_of(s, i)                    # past </div> of topbar-right
    k = s.index("</div>", k) + len("</div>\n")   # past the row's own close
    return s[:k] + line + s[k:]


def ensure_css(s, page):
    if ".build{" in s:
        return s
    # Before the first </style>, so it inherits whatever variables the page already defines.
    i = s.index("</style>")
    return s[:i] + CSS + s[i:]


def main():
    try:
        prev = json.load(io.open(STATE, encoding="utf-8"))
    except Exception:
        prev = {}
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    state, changed, kept = {}, [], []
    for page in PAGES:
        p = os.path.join(HERE, page)
        if not os.path.exists(p):
            print("  " + page + ": not here, skipped")
            continue
        s = io.open(p, encoding="utf-8").read()
        s = ensure_css(s, page)
        s = insert_line(s, page)
        h = content_hash(s)
        old = prev.get(page) or {}
        if old.get("hash") == h and STAMP_RE.search(s) and old.get("stamp"):
            when = old["stamp"]                      # unchanged: the stamp must not move
            kept.append(page)
        else:
            when = now
            changed.append(page)
        s = STAMP_RE.sub(lambda _m: stamp_html(when), s, count=1)
        io.open(p, "w", encoding="utf-8").write(s)
        state[page] = {"hash": content_hash(s), "stamp": when}
    json.dump(state, io.open(STATE, "w", encoding="utf-8"), indent=1, sort_keys=True)
    print("stamped " + str(len(changed)) + ": " + (", ".join(changed) or "none"))
    print("unchanged " + str(len(kept)) + ": " + (", ".join(kept) or "none"))


if __name__ == "__main__":
    main()
