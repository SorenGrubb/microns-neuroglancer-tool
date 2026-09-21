# -*- coding: utf-8 -*-
u"""ηJump gets the Jump card the other tools have, and its Random example works.       2026-09-21

Søren: "hJump has not been updated regarding the coordinates card", and a minute later: "why does
nothing happen when I choose a random microglia?"

THE CARD. On 2026-09-20 µJump's Jump card was turned round -- the list of cells first, always
visible, the type picker above the two random buttons; the coordinate box a fold, shut by default
("the cell should be always visible, but the coordinate should be expandable and hidden by
default") -- and ported to δJump, πJump, λJump and βJump. ηJump kept the old order: coordinate box
on top, browsing folded away at the bottom. Now it has the same card, with its own ids kept
(randomUnassigned, randomCommunity, idSearchPanel) so none of the code that reaches them changes,
and the same category colours on the picker (µJump's --cat-* tokens; ηJump's groups mapped onto
them: excitatory, inhibitory, glia, vascular, and "no confident call" as other).

RANDOM EXAMPLE. Its click handler read `(sel||{}).value` -- `sel` was never declared in that scope,
so every click threw "sel is not defined" and nothing happened, for every type, not only microglia.
It reads #randomTypeSelect now. jumpcardcheck.js presses it on every tool.

Run: python3 src/hjump_gets_the_browse_first_card.py, then python3 src/build_stamps.py
"""
import io, os
P = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "hjump.html")
s = io.open(P, encoding="utf-8").read(); b = s


def edit(name, old, new):
    global s
    if new in s and old not in s:
        print("  already there: " + name); return
    assert s.count(old) == 1, "%s: %d" % (name, s.count(old))
    s = s.replace(old, new, 1); print("  ok: " + name)


COORD_OLD = u'''<div class="card">
<label>Coordinate <span style="font-weight:400;text-transform:none;letter-spacing:normal;color:var(--mut);font-size:12px">&mdash; in <span id="unitres"></span> voxels; jump to it in H01, identify the nearest cell body and its neighbours, and load the cell in 3D</span></label>
<div class="row"><div class="coord"><input type="text" id="x" inputmode="decimal" placeholder="x"></div><div class="coord"><input type="text" id="y" inputmode="decimal" placeholder="y"></div><div class="coord"><input type="text" id="z" inputmode="decimal" placeholder="z"></div><button class="go inline" id="go" title="Find the nearest classified cell body">&#8594;</button></div>
<p class="hint">Or paste <code>x, y, z</code> into the x field &mdash; it splits automatically.
  <button id="rand" style="background:none;border:none;color:var(--accent);cursor:pointer;padding:0;font:inherit">Show me a random cell</button></p>
'''
COORD_NEW = u'''<div class="card">
<!-- 2026-09-21 -- µJump's card, as δJump, πJump, λJump and βJump have it. Browsing first and
     always visible, the type picker above the two random buttons; the coordinate box a fold,
     shut. Every id is ηJump's own, so nothing that reaches them had to change. -->
<div id="randomCellPanel">
<label>Browse a cell <span style="font-weight:400;text-transform:none;letter-spacing:normal;color:var(--mut);font-size:12px">&mdash; pick a type and draw an example, or take a random one</span></label>
<div class="row" style="gap:8px;margin-top:2px">
<select id="randomTypeSelect" style="flex:1 1 auto"></select>
<button class="idbtn" id="randomOfType" title="Good for learning what a cell type looks like &mdash; a new random example loads each click.">Random example</button>
</div>
<button class="idbtn" id="randomUnassigned" style="width:100%;margin:10px 0 8px" title="Cells H01 could not confidently type — these are where a community identification is worth most">Random unassigned cell &mdash; help identify one</button>
<p class="hint" id="unassignedCount" style="margin:-4px 0 8px"></p>
<button class="idbtn" id="randomCommunity" style="width:100%;margin-bottom:8px" title="Jump to a cell someone has already identified — useful for reviewing, confirming or challenging another person's call">Random community-identified cell &mdash; review someone&rsquo;s call</button>
</div>
<details class="rv-panel" id="coordPanel">
<summary>Or jump to a coordinate <span style="font-weight:400;color:var(--mut);font-size:12px">&mdash; in <span id="unitres"></span> voxels; jump to it in H01, identify the nearest cell body and its neighbours, and load the cell in 3D</span></summary>
<div class="row"><div class="coord"><input type="text" id="x" inputmode="decimal" placeholder="x"></div><div class="coord"><input type="text" id="y" inputmode="decimal" placeholder="y"></div><div class="coord"><input type="text" id="z" inputmode="decimal" placeholder="z"></div><button class="go inline" id="go" title="Find the nearest classified cell body">&#8594;</button></div>
<p class="hint">Or paste <code>x, y, z</code> into the x field &mdash; it splits automatically.
  <button id="rand" style="background:none;border:none;color:var(--accent);cursor:pointer;padding:0;font:inherit">Show me a random cell</button></p>
</details>
'''
edit(u"browsing first, the coordinate a fold", COORD_OLD, COORD_NEW)

OLD_PANEL = u'''<details class="rv-panel" id="randomCellPanel">
<summary>Or browse a random cell</summary>
<button class="idbtn" id="randomUnassigned" style="width:100%;margin:8px 0" title="Cells H01 could not confidently type — these are where a community identification is worth most">Random unassigned cell &mdash; help identify one</button>
<p class="hint" id="unassignedCount" style="margin:-4px 0 8px"></p>
<button class="idbtn" id="randomCommunity" style="width:100%;margin-bottom:8px" title="Jump to a cell someone has already identified — useful for reviewing, confirming or challenging another person's call">Random community-identified cell &mdash; review someone&rsquo;s call</button>
<div class="row" style="gap:8px">
<select id="randomTypeSelect" style="flex:1 1 auto"></select>
<button class="idbtn" id="randomOfType">Random example</button>
</div>
<p class="hint">Good for learning what a cell type looks like &mdash; a new random example loads each click.</p>
</details>
'''
edit(u"...and the old fold at the bottom goes", OLD_PANEL,
     u'''<!-- "Or browse a random cell" lived here until 2026-09-21; it is the first thing in this card now. -->
''')

edit(u"the picker's categories, coloured as on µJump",
     u'''function renderRandomTypeSelect(){
  const sel=document.getElementById("randomTypeSelect"); if(!sel)return;
  const was=sel.value;
  sel.innerHTML=TYPE_GROUPS.map(function(g){
    const opts=g.types.filter(function(t){ return IDX_BY_TYPE[t]&&IDX_BY_TYPE[t].length; })
      .map(function(t){ return '<option value="'+escHtml(t)+'">'+escHtml(longName(t))+' ('+fmt(IDX_BY_TYPE[t].length)+')</option>'; }).join("");
    return opts?'<optgroup label="'+escHtml(g.label)+'">'+opts+'</optgroup>':"";
  }).join("");
  if(was) sel.value=was;
}''',
     u'''/* By CATEGORY, as on µJump (2026-09-21): ηJump's groups onto µJump's --cat-* tokens. */
const TYPE_GROUP_COLOUR={"Neurons — excitatory":"var(--cat-exc)","Neurons — inhibitory":"var(--cat-inh)",
  "Glia":"var(--cat-glia)","Vascular":"var(--cat-vasc)","No confident call":"var(--cat-other)"};
function syncTypeColour(){
  const s=document.getElementById("randomTypeSelect"); if(!s)return;
  const o=s.selectedOptions&&s.selectedOptions[0];
  s.style.color=(o&&o.style.color)||"";
}
function renderRandomTypeSelect(){
  const sel=document.getElementById("randomTypeSelect"); if(!sel)return;
  const was=sel.value;
  sel.innerHTML=TYPE_GROUPS.map(function(g){
    const col=TYPE_GROUP_COLOUR[g.label]||"var(--cat-other)";
    const opts=g.types.filter(function(t){ return IDX_BY_TYPE[t]&&IDX_BY_TYPE[t].length; })
      .map(function(t){ return '<option value="'+escHtml(t)+'" style="color:'+col+'">'+escHtml(longName(t))+' ('+fmt(IDX_BY_TYPE[t].length)+')</option>'; }).join("");
    return opts?'<optgroup label="'+escHtml(g.label)+'" style="color:'+col+'">'+opts+'</optgroup>':"";
  }).join("");
  if(was) sel.value=was;
  syncTypeColour();
  if(!sel.dataset.colourWired){ sel.dataset.colourWired="1"; sel.addEventListener("change",syncTypeColour); }
}''')

edit(u"the category tokens",
     u''':root{--accent:#ffb454;--accent-dim:#4a2f10;--on-accent:#241503}''',
     u''':root{--accent:#ffb454;--accent-dim:#4a2f10;--on-accent:#241503}
/* The category palette the Browse picker is painted from -- µJump's, 2026-09-21. References, so
   every theme resolves them. */
:root{--cat-exc:var(--exc);--cat-inh:var(--inh);--cat-neu:var(--accent);--cat-glia:var(--ok);
  --cat-vasc:var(--warn);--cat-blood:var(--danger);--cat-immune:var(--non);--cat-other:var(--mut)}
#randomTypeSelect optgroup{font-weight:600}''')

edit(u"Random example reads the picker it sits beside",
     u'''    const t=(sel||{}).value; const pool=IDX_BY_TYPE[t]||[];''',
     u'''    /* It read an undeclared `sel` and threw on every click (2026-09-21, Søren: "why does
       nothing happen when I choose a random microglia?"). */
    const t=($("randomTypeSelect")||{}).value; const pool=IDX_BY_TYPE[t]||[];''')

if s != b: io.open(P, "w", encoding="utf-8").write(s)
