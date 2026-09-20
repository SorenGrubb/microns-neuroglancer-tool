# -*- coding: utf-8 -*-
u"""The list of cells comes first.                                               2026-09-20

Søren, with a mock-up made by cutting the card up and reordering it: *"I want to change the
Coordinate card. Instead of the main thing being the coordinates, the list of cells should be the
main thing. I imagine something like this, but if the different cell types could have different
colors to make them easier to discern, then that would also be nice."*

Asked which shape the list should take, he chose to keep the dropdown and colour it. And, a minute
later: *"Now, the cell should be always visible, but the coordinate should be expandable and hidden
by default."* So the two swapped disclosure states as well as places.

WHAT THE ORDER WAS SAYING. A coordinate box at the top says: you have a coordinate, paste it. That
is true on the day you are reading somebody's figure and false on every other day -- browsing a
type, drawing a random example, reviewing somebody's call are the reasons to open this tool at all,
and all three were folded away under "Or browse a random cell" at the bottom. His mock-up simply
reads the card back in the order the work happens in, so that is the order it is in now: the type
picker first, the two random buttons under it, and the coordinate box below with "Or" in front of
it.

THE PICKER MOVES TO THE TOP OF ITS OWN BLOCK TOO. In his mock the dropdown is above the two random
buttons, not below them. It is the control that answers "which kind of cell" -- the buttons are two
ways of not choosing -- and the choosing one goes first.

COLOURED BY CATEGORY, NOT BY TYPE. There are about forty types and nine categories, and the
categories are the axis that tells them apart: a 23P and a 4P are both excitatory neurons and being
told they are different colours would be noise. The optgroups already carry the categories, so this
colours those, and every option inherits its group's colour -- the closed picker shows it too, so
the current choice is placed at a glance without opening anything.

THE PALETTE IS THE PAGE'S OWN. --exc, --inh, --ok, --danger and the rest are already defined for
every theme (dark, light, high contrast), so referring to them costs nothing and keeps the dropdown
agreeing with the dots in the neighbours list. Leptomeninges is the one category with no existing
token; mixing two is still themed, where a literal hex would be right in one theme and wrong in the
other two.

Run: python3 src/the_list_of_cells_comes_first.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PANEL = u'''<!-- 2026-09-20 (S\u00f8ren: "Instead of the main thing being the coordinates, the list of cells
     should be the main thing" and "the cell should be always visible") -- moved above the
     coordinate box and no longer a <details>: a thing you do every time should not cost a click.
     The type picker sits above the two random buttons, as his mock-up had it -- the picker is the
     control that answers "which kind of cell", and the buttons are two ways of not choosing.
     The id is kept so nothing that refers to this block has to be found and changed. -->
<div id="randomCellPanel">
<label>Browse a cell <span style="font-weight:400;text-transform:none;letter-spacing:normal;color:var(--mut);font-size:12px">&mdash; pick a type and draw an example, or take a random one</span></label>
<div class="row" style="gap:8px;margin-top:2px">
<select id="randomTypeSelect" style="flex:1 1 auto"></select>
<!-- 2026-09-18 (S\u00f8ren: "This could be a mouse-over for the random button instead of taking
     space.") -- the sentence described what pressing THIS button is for, which is what a title on
     this button is, and it ran to three lines at narrow widths. -->
<button class="idbtn" id="randomOfType" title="Great for learning what a cell type looks like (a new random example loads each click), or for quickly finding a cell that still needs a first identification.">Random example</button>
</div>
<button class="idbtn" id="randomUnclassified" style="width:100%;margin-bottom:8px;margin-top:10px">Random unassigned cell &mdash; help identify one</button>
<p class="hint" id="unclCount" style="margin-top:-4px;margin-bottom:8px"></p>
<button class="idbtn" id="randomCommunityId" style="width:100%;margin-bottom:2px" title="Jump to a random cell that MICrONS never predicted but the community has since identified \u2014 useful for reviewing, confirming or challenging other people\'s calls">Random community-identified cell &mdash; review someone\'s call</button>
</div>
'''

OLD_PANEL = u'''<!-- 2026-08-10 (Søren: "'Or browse a random cell' can also be collapsed by default and remembered
     if expanded by user") -- same <details>/toggle-persistence pattern as the Root/Nucleus ID
     search panel above (see its own comment); wiring is in the same place. -->
<details class="rv-panel" id="randomCellPanel" style="margin-top:14px">
<summary>Or browse a random cell</summary>
<button class="idbtn" id="randomUnclassified" style="width:100%;margin-bottom:8px;margin-top:8px">Random unassigned cell &mdash; help identify one</button>
<p class="hint" id="unclCount" style="margin-top:-4px;margin-bottom:8px"></p>
<button class="idbtn" id="randomCommunityId" style="width:100%;margin-bottom:8px" title="Jump to a random cell that MICrONS never predicted but the community has since identified — useful for reviewing, confirming or challenging other people's calls">Random community-identified cell &mdash; review someone's call</button>
<div class="row" style="gap:8px">
<select id="randomTypeSelect" style="flex:1 1 auto"></select>
<!-- 2026-09-18 (Søren: "This could be a mouse-over for the random button instead of taking
     space.") -- the sentence described what pressing THIS button is for, which is what a title on
     this button is, and it ran to three lines at narrow widths. -->
<button class="idbtn" id="randomOfType" title="Great for learning what a cell type looks like (a new random example loads each click), or for quickly finding a cell that still needs a first identification.">Random example</button>
</div>
</details>
'''

COORD_LABEL = u'''<label>Coordinate <span style="font-weight:400;text-transform:none;letter-spacing:normal;color:var(--mut);font-size:12px">&mdash; paste one from Neuroglancer to see what cell type you are looking at</span></label>'''

MOVE = [
    # 1. Lift the browse block out of the bottom of the card...
    # The replacement leaves a marker behind. Without one, the "already there" test cannot tell a
    # deletion that has happened from one that has not: what is left after the cut is a substring of
    # what was there before it, so both halves of the test are true at once.
    (OLD_PANEL + u'''<!-- 2026-09-18 (S\u00f8ren: "these layer options could go under the advanced viewer, just beneath''',
     u'''<!-- "Or browse a random cell" lived here until 2026-09-20; it is the first thing in this
     card now, always visible. See the block above the coordinate box. -->
<!-- 2026-09-18 (S\u00f8ren: "these layer options could go under the advanced viewer, just beneath''',
     "the browse block leaves the bottom of the card"),

    # ...and 2. put it at the top, with the coordinate box folded shut underneath it. The label the
    # coordinate box used to carry becomes the summary: two lines saying the same thing, one above
    # the other, is what wrapping it naively would have produced.
    (COORD_LABEL,
     PANEL + u'''<!-- SHUT BY DEFAULT, since 2026-09-20 (S\u00f8ren: "the coordinate should be expandable and
     hidden by default"). Its old <label> is the summary now -- wrapping it and keeping the label
     would have put the same sentence on two lines, one above the other. Remembered by the same
     persistDetailsOpen the panels below it use, so opening it once keeps it open.
     NOTHING MOVED IN THE JAVASCRIPT: #x, #y, #z, #go and #nearestLine keep their ids, and
     getElementById reaches into a closed <details> exactly as it reaches anywhere else. -->
<details class="rv-panel" id="coordPanel">
<summary>Or jump to a coordinate <span style="font-weight:400;color:var(--mut);font-size:12px">&mdash; paste one from Neuroglancer to see what cell type you are looking at</span></summary>''',
     "...and the coordinate box goes under it, folded shut"),

    # 3. Close the new <details> after the nearest-nucleus receipt, which is the last thing that
    #    belongs to typing a coordinate; the Root/Nucleus search below has always been its own.
    (u'''<div class="meta" id="nearestLine" style="display:none;margin-top:6px"></div>''',
     u'''<div class="meta" id="nearestLine" style="display:none;margin-top:6px"></div>
</details>''',
     "...and closes after the receipt for the lookup"),

    # 4. The browse block is no longer a <details>, so it has no open state to remember; the
    #    coordinate box now has one.
    (u'''persistDetailsOpen("randomCellPanel","ujump_random_panel_open");''',
     u'''/* #randomCellPanel stopped being a <details> on 2026-09-20 (S\u00f8ren: "the cell should be always
   visible"), so there is nothing left to remember about it. The coordinate box took its place as
   the collapsible one and takes its own key -- not the old one, whose stored value means the
   opposite of what it would now be read as. */
persistDetailsOpen("coordPanel","ujump_coord_panel_open");''',
     "the remembered-open state follows the fold"),
]

CSS = [
    (u'''.dot{width:9px;height:9px;border-radius:50%;flex:none}.dot.exc{background:var(--exc)}.dot.inh{background:var(--inh)}.dot.non{background:var(--non)}.dot.none{background:var(--mut)}''',
     u'''.dot{width:9px;height:9px;border-radius:50%;flex:none}.dot.exc{background:var(--exc)}.dot.inh{background:var(--inh)}.dot.non{background:var(--non)}.dot.none{background:var(--mut)}
/* ── A COLOUR PER CELL-TYPE CATEGORY ────────────────────────────────  2026-09-20
   Søren: *"if the different cell types could have different colors to make them easier to discern,
   then that would also be nice."*

   By CATEGORY, not by type: there are about forty types and nine categories, and the categories are
   what tells them apart. Two excitatory subtypes being different colours would be noise.

   DEFINED ONCE, THEMED THREE TIMES FOR FREE. These are references, not values, and var() resolves
   where it is USED -- so a light-theme --exc reaches --cat-exc without this block being repeated in
   the light and high-contrast :root blocks below. Leptomeninges is the one category with no
   existing token of its own; mixing two keeps it themed, where a literal hex would be right in one
   theme and wrong in the other two. */
:root{
  --cat-exc:var(--exc); --cat-inh:var(--inh); --cat-neu:var(--accent);
  --cat-glia:var(--ok); --cat-vasc:var(--warn); --cat-blood:var(--danger);
  --cat-immune:var(--non);
  --cat-lepto:color-mix(in srgb,var(--non) 55%,var(--danger));
  --cat-other:var(--mut);
}
/* Each option inherits its optgroup's colour, and the CLOSED picker shows the chosen one too, so
   the current category is placed without opening anything. Chrome and Firefox colour options;
   where a platform refuses, the list is exactly what it was before. */
#randomTypeSelect optgroup{font-weight:600}''',
     "the categories have colours of their own"),
]

PAINT = [
    # Painted at the end of every paint, not only on change: the control is repainted twice per
    # call (see "THE CHOSEN TYPE SURVIVES THE REBUILD"), and a colour set only by the change event
    # would be lost the moment the second paint lands.
    (u'''  window.RAND_POOLS=RP;
  };''',
     u'''  window.RAND_POOLS=RP;
  syncTypeColour();
  };''',
     "...and the closed control is repainted with it"),

    (u'''    opts+='<optgroup label="'+cat+'">'+items.map(p=>{let c=0;p.picks.forEach(pk=>c+=pickCount(pk));c-=(RECLASS_OUT[p.k]||0);if(c<0)c=0;
      const lab=(typeof escHtml==="function")?escHtml(p.label):p.label;
      return '<option value="'+p.k+'"'+(c?"":' disabled title="No cell of this type has been identified in this dataset yet — identify one and it appears here."')+'>'+lab+' ('+c+')</option>';}).join("")+'</optgroup>';''',
     u'''    /* THE GROUP CARRIES THE COLOUR AND THE OPTIONS INHERIT IT, 2026-09-20 (Søren: "if the
       different cell types could have different colors to make them easier to discern"). Per
       CATEGORY rather than per type -- see the --cat-* block in the stylesheet for why -- and set
       inline because the category is decided here, at paint time, and a stylesheet cannot know
       which optgroup is which. */
    const catCol=CAT_COLOUR[cat]||"var(--cat-other)";
    opts+='<optgroup label="'+cat+'" style="color:'+catCol+'">'+items.map(p=>{let c=0;p.picks.forEach(pk=>c+=pickCount(pk));c-=(RECLASS_OUT[p.k]||0);if(c<0)c=0;
      const lab=(typeof escHtml==="function")?escHtml(p.label):p.label;
      return '<option value="'+p.k+'" style="color:'+catCol+'"'+(c?"":' disabled title="No cell of this type has been identified in this dataset yet — identify one and it appears here."')+'>'+lab+' ('+c+')</option>';}).join("")+'</optgroup>';''',
     "each group is painted in its own colour"),

    (u'''  const CAT_SEQ=["Excitatory neurons","Inhibitory neurons","Neurons","Glia","Vascular cells","Blood cells","Immune & perivascular cells","Leptomeninges","Other"];''',
     u'''  const CAT_SEQ=["Excitatory neurons","Inhibitory neurons","Neurons","Glia","Vascular cells","Blood cells","Immune & perivascular cells","Leptomeninges","Other"];
  /* One entry per CAT_SEQ name, pointing at the tokens defined beside .dot in the stylesheet. Kept
     next to the sequence it mirrors so a category added to one and not the other is visible rather
     than silently grey. */
  /* THE CLOSED CONTROL TAKES THE COLOUR OF WHAT IS IN IT. Without this the list is coloured and
     the thing you are actually looking at is not, which is the half you see most of the time. */
  const syncTypeColour=function(){
    const o=randomTypeSelect.selectedOptions&&randomTypeSelect.selectedOptions[0];
    randomTypeSelect.style.color=(o&&o.style.color)||"";
  };
  window.__syncTypeColour=syncTypeColour;
  randomTypeSelect.addEventListener("change",syncTypeColour);
  const CAT_COLOUR={
    "Excitatory neurons":"var(--cat-exc)", "Inhibitory neurons":"var(--cat-inh)",
    "Neurons":"var(--cat-neu)", "Glia":"var(--cat-glia)", "Vascular cells":"var(--cat-vasc)",
    "Blood cells":"var(--cat-blood)", "Immune & perivascular cells":"var(--cat-immune)",
    "Leptomeninges":"var(--cat-lepto)", "Other":"var(--cat-other)"
  };''',
     "...from one table beside the order it follows"),
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


edit("ujump.html", MOVE + CSS + PAINT)
print("\nnow: node jumpcardcheck.js && node jumplayoutcheck.js && node randomtypecheck.js "
      "&& python3 src/build_stamps.py")
