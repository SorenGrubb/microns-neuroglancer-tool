# -*- coding: utf-8 -*-
u"""Browse by community identity.                                                2026-09-20

Søren: *"λJump and βJump have no browse block and no type picker — we need to implement that."*
Asked what it should list, given they have no MICrONS prediction layer: *"yes, we need λJump and
βJump community identified type picker."*

THEY CANNOT HAVE µJUMP'S PICKER, AND THE REASON IS IN THE DATA. Neither page carries `CT_NAMES`,
`CT_CLASS`, `IDX_BY_TYPE`, `OWN_POS_BY_TYPE` or `longName` -- the whole automated-prediction layer
µJump's picker is built from is simply absent. What they do have is the community's own work:
`fetchLjumpIdentities()` / `fetchBjumpIdentities()` already pull `?bjumpIdentities=1&ds=…` into a
map keyed by nucleus id, and `ljumpIdentityOf(i)` / `bjumpIdentityOf(i)` already answer "what does
the community call cell i". Both dashboards already aggregate the result as "Community identity →
Nuclei".

So the picker is the same control over a different source: the identities people have actually
reported on that dataset, counted, plus the cells nobody has named yet.

ONE BUTTON FEWER THAN µJUMP, deliberately. µJump has "Random unassigned cell" AND "Random
community-identified cell", because there its second button means "a cell MICrONS never predicted
but a person has since named" -- a distinction worth drawing. Here every named cell is
community-named, so that button would be the picker with extra steps. The two that remain are the
two that mean something.

GROUPED BY FAMILY, WITH ONE OVERRIDE SAID OUT LOUD. `familyOf()` in core/ontology.js already sorts a
free-text identity into neuron / glial / vascular / perivascular / blood / immune, which is exactly
the axis a reader needs and the project's own vocabulary for it. It puts microglia under "resident
immune"; µJump's CATEGORY_OF puts Microglia under Glia. Søren asked for these tools to look like
µJump, so microglia is overridden into Glia here -- written as a table with its reason rather than
folded silently into the mapping, because the taxonomy and the screen genuinely disagree and the
next person should see which one won.

Run: python3 src/browse_by_community_identity.py
"""
import io
import os
import re

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Per page: the prefix its own identity helpers were written with.
TOOLS = {"ljump.html": {"fn": "Ljump", "id": "ljumpIdentityOf", "sentinel": "LJUMP_UNCLASSIFIED_SENTINEL"},
         "bjump.html": {"fn": "Bjump", "id": "bjumpIdentityOf", "sentinel": "BJUMP_UNCLASSIFIED_SENTINEL"}}

# ── the palette, as µJump and δ/π carry it ────────────────────────────────────────────────────
# Re-declared rather than imported: each generator is the record of one change, and importing
# another would run its edits. The text is µJump's, so the three stylesheets stay in step.
DOT = u'''.dot{width:9px;height:9px;border-radius:50%;flex:none}.dot.exc{background:var(--exc)}.dot.inh{background:var(--inh)}.dot.non{background:var(--non)}.dot.none{background:var(--mut)}'''

PALETTE = u'''
/* ── A COLOUR PER CELL-TYPE CATEGORY ────────────────────────────────  2026-09-20
   Søren: *"if the different cell types could have different colors to make them easier to discern,
   then that would also be nice."* µJump's palette, so the family reads the same on every tool.

   DEFINED ONCE, THEMED THREE TIMES FOR FREE. These are references, not values, and var() resolves
   where it is USED -- so a light-theme --exc reaches --cat-exc without this block being repeated in
   the light and high-contrast :root blocks below. */
:root{
  --cat-exc:var(--exc); --cat-inh:var(--inh); --cat-neu:var(--accent);
  --cat-glia:var(--ok); --cat-vasc:var(--warn); --cat-blood:var(--danger);
  --cat-immune:var(--non);
  --cat-lepto:color-mix(in srgb,var(--non) 55%,var(--danger));
  --cat-other:var(--mut);
}
#randomTypeSelect optgroup{font-weight:600}'''

# ── the picker ────────────────────────────────────────────────────────────────────────────────
PICKER = u'''
/* ── BROWSE BY COMMUNITY IDENTITY ───────────────────────────────  2026-09-20
   Søren: *"λJump and βJump have no browse block and no type picker — we need to implement that"*,
   and, asked what it should list: *"yes, we need λJump and βJump community identified type
   picker."*

   This tool has no automated prediction layer -- no CT_NAMES, no IDX_BY_TYPE -- so the pools come
   from the community's own identifications, which %(ID)s() already answers per cell and
   fetch%(FN)sIdentities() already fetches. Nothing new is read from the backend.

   COUNTED FROM THE CELLS, NOT FROM THE REPORTS. A cell can be reported several times and renamed;
   %(ID)s() is the consensus after all of that, so walking the cell list once gives each cell to
   exactly one pool and the counts add up to the dataset. Counting report rows instead would
   double-count every argued-over cell, which is the same fault µJump's organelle line had.

   GROUPED BY FAMILY. familyOf() in core/ontology.js sorts a free-text identity into neuron /
   glial / vascular / perivascular / blood / immune -- the project's own vocabulary, and the axis
   worth colouring by. */
var RAND_POOLS_BY_ID = null;
/* familyOf() calls microglia "resident immune"; µJump's CATEGORY_OF files Microglia under Glia.
   Søren asked for these tools to look like µJump, so the screen wins -- written here, with its
   reason, rather than folded silently into the mapping, because the two genuinely disagree. */
var IDENTITY_GROUP_OVERRIDE = { microglia: "Glia" };
var FAMILY_GROUP = { neuron: "Neurons", glial: "Glia", vascular: "Vascular cells",
                     perivascular: "Immune & perivascular cells",
                     "resident immune": "Immune & perivascular cells",
                     "circulating immune": "Immune & perivascular cells",
                     blood: "Blood cells" };
var GROUP_SEQ = ["Neurons", "Glia", "Vascular cells", "Blood cells",
                 "Immune & perivascular cells", "Other"];
var GROUP_COLOUR = { "Neurons":"var(--cat-neu)", "Glia":"var(--cat-glia)",
                     "Vascular cells":"var(--cat-vasc)", "Blood cells":"var(--cat-blood)",
                     "Immune & perivascular cells":"var(--cat-immune)", "Other":"var(--cat-other)" };
function identityGroupOf(name){
  var key = String(name || "").trim().toLowerCase();
  if (IDENTITY_GROUP_OVERRIDE[key]) return IDENTITY_GROUP_OVERRIDE[key];
  var fam = (typeof familyOf === "function") ? familyOf(name) : null;
  return FAMILY_GROUP[fam] || "Other";
}
/* The closed control takes the colour of what is in it, so the family is placed at a glance
   without opening the list -- the half you see most of the time. */
function syncTypeColour(){
  var s = document.getElementById("randomTypeSelect");
  if (!s) return;
  var o = s.selectedOptions && s.selectedOptions[0];
  s.style.color = (o && o.style.color) || "";
}
async function populateRandomTypeSelect(){
  var sel = document.getElementById("randomTypeSelect");
  if (!sel) return;
  try { await fetch%(FN)sIdentities(); } catch (_e){}
  var pools = {}, unid = [];
  for (var i = 0; i < BID.length; i++){
    var nm = "";
    try { nm = %(ID)s(i) || ""; } catch (_e){ nm = ""; }
    if (!nm){ unid.push(i); continue; }
    (pools[nm] = pools[nm] || []).push(i);
  }
  /* A COPY, NOT THE SAME OBJECT. The first version assigned `pools` straight across and then put
     the unidentified pool on it under the sentinel -- which added the sentinel to `pools` too, and
     the picker listed "__unclassified__ (488)" as though it were a community identity. The pools a
     person picks from and the pools the buttons draw from are two different lists that happen to
     share most of their members. */
  RAND_POOLS_BY_ID = Object.assign({}, pools);
  RAND_POOLS_BY_ID[%(SENT)s] = unid;
  var groups = {};
  Object.keys(pools).forEach(function(nm){
    var g = identityGroupOf(nm);
    (groups[g] = groups[g] || []).push(nm);
  });
  /* The chosen identity survives the rebuild: this runs again when the identities land, and
     assigning innerHTML to a <select> discards every option, so the browser would otherwise fall
     back to the first one under somebody mid-choice. Same reason µJump reads it here. */
  var was = sel.value;
  var opts = "";
  GROUP_SEQ.forEach(function(g){
    if (!groups[g] || !groups[g].length) return;
    var col = GROUP_COLOUR[g] || "var(--cat-other)";
    opts += '<optgroup label="' + g + '" style="color:' + col + '">'
      + groups[g].sort(function(a, b){ return a.localeCompare(b); }).map(function(nm){
          return '<option value="' + escHtml(nm) + '" style="color:' + col + '">'
            + escHtml(nm) + ' (' + pools[nm].length + ')</option>';
        }).join("") + '</optgroup>';
  });
  if (!opts)
    opts = '<option value="" disabled>No community identifications on this dataset yet</option>';
  sel.innerHTML = opts;
  if (was)
    for (var oi = 0; oi < sel.options.length; oi++)
      if (sel.options[oi].value === was){ sel.selectedIndex = oi; break; }
  syncTypeColour();
  var note = document.getElementById("unclCount");
  if (note)
    note.textContent = unid.length
      ? (unid.length.toLocaleString() + " cell" + (unid.length === 1 ? "" : "s")
         + " nobody has identified yet.")
      : "Every cell in this dataset has been identified.";
}
/* One draw, shared by both buttons: a pool, a cell, and the tool's own way of showing one. */
function randomFromPool(pool, what){
  if (!pool || !pool.length){
    alert("No cell to show for " + what + " yet.");
    return;
  }
  var i = pool[Math.floor(Math.random() * pool.length)];
  showCell(i, 0);
}
'''

BROWSE = u'''<!-- 2026-09-20 (Søren: "λJump and βJump have no browse block and no type picker — we need
     to implement that") -- µJump's card, over this tool's own source: the identities the community
     has reported here, since there is no automated prediction layer to list. Always visible, and
     the picker above the button, the same way µJump has it. -->
<div id="randomCellPanel">
<label>Browse a cell <span style="font-weight:400;text-transform:none;letter-spacing:normal;color:var(--mut);font-size:12px">&mdash; pick an identity the community has given, or take one nobody has named</span></label>
<div class="row" style="gap:8px;margin-top:2px">
<select id="randomTypeSelect" style="flex:1 1 auto"></select>
<button class="idbtn" id="randomOfType" title="Great for learning what an identity looks like on this dataset — a new random example loads each click.">Random example</button>
</div>
<button class="idbtn" id="randomUnclassified" style="width:100%;margin-bottom:8px;margin-top:10px">Random unidentified cell &mdash; help identify one</button>
<p class="hint" id="unclCount" style="margin-top:-4px;margin-bottom:2px"></p>
<!-- The tool's own "Show me a random nucleus", moved up from inside the paste hint. It was a
     browsing control living in the coordinate box, and once that box folds shut it was a browsing
     control you could not see. Three ways to draw a cell now sit together: one of this identity,
     one nobody has named, or any at all. The element is moved, not rewritten -- same id, same
     listener, wherever that is wired. -->
@@RAND@@
</div>
'''

WIRING = u'''
/* The two buttons, and the first paint. populateRandomTypeSelect() is awaited nowhere on purpose:
   the list appears from what the page already knows and repaints when the identities land, rather
   than leaving an empty control while a fetch is in flight. */
(function(){
  /* THE PICKER RECOLOURS WHEN YOU PICK. populateRandomTypeSelect() calls syncTypeColour() at the
     end of every paint, which covers the list arriving and the repaint when the identities land --
     but not a person choosing. Without this listener the closed control keeps the colour of
     whatever was selected when the list was last built, which is the first option, which is
     usually a neuron: pick Microglia and the control stays blue. */
  var sel = document.getElementById("randomTypeSelect");
  if (sel) sel.addEventListener("change", syncTypeColour);
  var ofType = document.getElementById("randomOfType");
  if (ofType) ofType.addEventListener("click", function(){
    var sel = document.getElementById("randomTypeSelect");
    var nm = sel && sel.value;
    if (!nm){ alert("Pick an identity first."); return; }
    randomFromPool(RAND_POOLS_BY_ID && RAND_POOLS_BY_ID[nm], nm);
  });
  var uncl = document.getElementById("randomUnclassified");
  if (uncl) uncl.addEventListener("click", function(){
    randomFromPool(RAND_POOLS_BY_ID && RAND_POOLS_BY_ID[%(SENT)s], "an unidentified cell");
  });
  try { populateRandomTypeSelect(); } catch (_e){}
})();
'''

RAND_RE = re.compile(r'\s*<button id="rand"[^>]*>[^<]*</button>')
COORD_RE = re.compile(r'<label>Coordinate <span style="[^"]*">([^<]*)</span></label>\n')
# The fold closes before the error line, which is the first thing after the coordinate box that is
# not about typing a coordinate. λ/β's paste hint runs across two lines and has their "Show me a
# random nucleus" button inside it, so it is a poor anchor; #err is one line and unique.
ERR_RE = re.compile(r'<p class="err" id="err"></p>\n')
FAIL = u'''function fail(m){const e=document.getElementById("err");'''


def one(rx, s, what, page):
    hits = rx.findall(s)
    assert len(hits) == 1, "%s: %s matched %d times" % (page, what, len(hits))
    return hits[0]


def edit(page, cfg):
    p = os.path.join(HERE, page)
    s = io.open(p, encoding="utf-8").read()
    print(page)
    sub = {"FN": cfg["fn"], "ID": cfg["id"], "SENT": cfg["sentinel"]}

    if '<div id="randomCellPanel">' in s:
        print("  already there: the browse block, above a folded coordinate box")
    else:
        rand = RAND_RE.search(s)
        assert rand, page + ": no random-nucleus button to move"
        s = s.replace(rand.group(0), "", 1)
        block = BROWSE.replace("@@RAND@@",
            u'<div style="margin-top:6px">' + rand.group(0).strip() + u'</div>')
        m = COORD_RE.search(s)
        assert m, page + ": no coordinate label"
        inner = m.group(1)
        s = s.replace(m.group(0), block +
            u'<!-- SHUT BY DEFAULT, 2026-09-20 (Søren: "the coordinate should be expandable and\n'
            u'     hidden by default"). Its old <label> is the summary -- keeping both would put the\n'
            u'     same sentence on two lines. NOTHING MOVED IN THE JAVASCRIPT: #x, #y, #z and #go\n'
            u'     keep their ids, and getElementById reaches into a closed <details> exactly as it\n'
            u'     reaches anywhere else. -->\n'
            u'<details class="rv-panel" id="coordPanel">\n'
            u'<summary>Or jump to a coordinate <span style="font-weight:400;color:var(--mut);'
            u'font-size:12px">' + inner + u'</span></summary>\n', 1)
        tail = one(ERR_RE, s, "the error line", page)
        s = s.replace(tail, u'</details>\n' + tail, 1)
        print("  ok: the browse block, above a folded coordinate box")

    for what, old, new in (
            ("the categories have colours", DOT, DOT + PALETTE),
            ("the picker itself", FAIL, (PICKER % sub) + FAIL)):
        if new in s and (old not in s or old in new):
            print("  already there: " + what)
            continue
        assert not (new in s and old in s), "AMBIGUOUS: " + what
        assert old in s, "NOT FOUND: " + what
        assert s.count(old) == 1, "ambiguous (%d): %s" % (s.count(old), what)
        s = s.replace(old, new, 1)
        print("  ok: " + what)

    if "randomFromPool(RAND_POOLS_BY_ID && RAND_POOLS_BY_ID[" + cfg["sentinel"] in s:
        print("  already there: the buttons are wired")
    else:
        s = s.rstrip()
        assert s.endswith("</html>"), page + ": does not end with </html>"
        s = s[:-len("</html>")].rstrip()
        assert s.endswith("</body>"), page + ": does not end with </body>"
        s = s[:-len("</body>")].rstrip() \
            + u"\n<script>" + (WIRING % sub) + u"</script>\n</body>\n</html>\n"
        print("  ok: the buttons are wired")

    io.open(p, "w", encoding="utf-8").write(s)


for page, cfg in TOOLS.items():
    edit(page, cfg)
print("\nnow: node browsecheck.js ljump.html && node browsecheck.js bjump.html "
      "&& python3 src/build_stamps.py")
