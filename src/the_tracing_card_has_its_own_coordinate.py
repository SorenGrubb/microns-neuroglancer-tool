"""The button wanted a coordinate it had no way to be given.                          2026-09-17

Søren, on the new button: *"The button is there, but it doesn't work. I would like if you can also
input coordinates of the cell or organelle you want to trace, so you just straight to it. The
coordinate input should look the same as the other coordinate input for uJump."*

It "doesn't work" is the card's own refusal showing: *"Search a coordinate or a cell first — the
viewer opens where you are."* tracingOpen() read `window.CUR_POS` and nothing else, so on a freshly
loaded page — which is exactly when somebody opens the tracing card to go and trace something — it
had nowhere to open. Making the card depend on a search in a different card, for a coordinate he
already has written down, was the wrong shape.

THE CARD NOW CARRIES ITS OWN x / y / z. Same markup as the main search box (`div.row` of
`div.coord` inputs, `inputmode="decimal"`), same voxels, and the same paste behaviour: drop
`x, y, z` into the x field and it splits itself across the three. It is pre-filled from the cell on
screen whenever all three are empty — on load and every time the card is opened — so the one-click
case for a cell he just searched is unchanged, and the boxes still say where it is about to go.

HALF-FILLED IS AN ERROR, NOT A FALLBACK. Two of three filled in means he meant to type a coordinate
and has not finished; silently opening at CUR_POS instead would be a viewer at the wrong place,
looking exactly like a viewer at the right one — and he would find out two sections into a tracing.
So: all three, or none.

Run: python3 src/the_tracing_card_has_its_own_coordinate.py
     node tracingpanelcheck.js
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HTML = [
    ('''<div class="row" style="gap:8px;margin-top:8px">
<button class="idbtn" id="tracingOpen" style="flex:1 1 auto" title="Opens the viewer chosen at the top of the Jump tab, at the coordinate on screen, with an empty annotation layer called &quot;tracing&quot; already selected and the line tool already active.">Open a viewer to trace in</button>
</div>''',
     '''<label style="margin-top:10px">Where to open it <span style="font-weight:400;text-transform:none;letter-spacing:normal;color:var(--mut);font-size:12px">&mdash; voxels, the same as the coordinate box at the top of this tab</span></label>
<div class="row"><div class="coord"><input type="text" id="tracingX" inputmode="decimal" placeholder="x"></div><div class="coord"><input type="text" id="tracingY" inputmode="decimal" placeholder="y"></div><div class="coord"><input type="text" id="tracingZ" inputmode="decimal" placeholder="z"></div></div>
<p class="hint" style="margin-top:4px">Or paste <code>x, y, z</code> into the x field &mdash; it splits automatically. Filled in from the cell on screen when you have one.</p>
<div class="row" style="gap:8px;margin-top:8px">
<button class="idbtn" id="tracingOpen" style="flex:1 1 auto" title="Opens the viewer chosen at the top of the Jump tab, at the coordinate in the boxes above, with an empty annotation layer called &quot;tracing&quot; already selected and the line tool already active.">Open a viewer to trace in</button>
</div>''',
     "the card has its own coordinate boxes"),
]

JS = [
    ('''function tracingOpen(){
  const pos=(window.CUR_POS&&window.CUR_POS.length===3)?window.CUR_POS.slice():null;
  if(!pos){tracingSay("Search a coordinate or a cell first \\u2014 the viewer opens where you are.",true);return;}''',
     '''/* Where the viewer opens: the card's own boxes, or the cell on screen if they are empty.

   HALF-FILLED IS AN ERROR. Two of three means he is mid-type; falling back to CUR_POS there opens
   a viewer somewhere else that looks exactly like a viewer in the right place, and he finds out two
   sections into a tracing. All three, or none. */
function tracingPos(){
  const val=function(id){const el=document.getElementById(id);return el?String(el.value||"").trim():"";};
  const raw=[val("tracingX"),val("tracingY"),val("tracingZ")];
  const given=raw.filter(function(s){return s!=="";}).length;
  if(given===3){
    const p=raw.map(Number);
    if(!p.every(function(n){return isFinite(n);}))
      return {error:"That coordinate has something in it that is not a number."};
    return {pos:p.map(Math.round)};
  }
  if(given>0)return {error:"All three of x, y and z, or leave them empty to use the cell on screen."};
  if(window.CUR_POS&&window.CUR_POS.length===3)return {pos:window.CUR_POS.slice()};
  return {error:"Type a coordinate above, or search a cell first \\u2014 the viewer has to open somewhere."};
}

/* Pre-fill from the cell on screen, but only when nothing has been typed, so it never overwrites
   him. Runs on load and every time the card is opened, because he may search a cell after opening
   it and the boxes should follow. */
function tracingFillPos(){
  const ids=["tracingX","tracingY","tracingZ"];
  const els=ids.map(function(i){return document.getElementById(i);});
  if(els.some(function(e){return !e;}))return;
  if(els.some(function(e){return String(e.value||"").trim()!=="";}))return;
  if(!(window.CUR_POS&&window.CUR_POS.length===3))return;
  els.forEach(function(e,i){e.value=window.CUR_POS[i];});
}

function tracingOpen(){
  const got=tracingPos();
  if(got.error){tracingSay(got.error,true);return;}
  const pos=got.pos;''',
     "the coordinate comes from the boxes, then the screen"),

    ('''  const openBtn=document.getElementById("tracingOpen");
  if(openBtn)openBtn.addEventListener("click",tracingOpen);''',
     '''  const openBtn=document.getElementById("tracingOpen");
  if(openBtn)openBtn.addEventListener("click",tracingOpen);
  /* The same paste-splitter the main coordinate box has, so "240640, 207872, 21360" copied out of
     Neuroglancer's own readout lands in three fields. */
  const tx=document.getElementById("tracingX");
  if(tx)tx.addEventListener("input",function(e){
    const p=String(e.target.value||"").split(/[\\s,]+/).filter(function(s){return s!=="";});
    if(p.length>=3){e.target.value=p[0];
      document.getElementById("tracingY").value=p[1];
      document.getElementById("tracingZ").value=p[2];}
  });
  const tPanel=document.getElementById("tracingPanel");
  if(tPanel)tPanel.addEventListener("toggle",tracingFillPos);
  tracingFillPos();''',
     "the boxes split a pasted triple and fill themselves"),
]

PANELCHECK = [
    ('''  console.log("\\nthe button that gives him somewhere to draw");
  {
    const v = await p.evaluate(() => {
      window.__opened = [];
      window.open = (u) => { window.__opened.push(u); return null; };
      window.CUR_POS = null;
      document.getElementById("tracingOpen").click();
      const refused = document.getElementById("tracingStatus").innerText;
      window.CUR_POS = [240640, 207872, 21360];
      document.getElementById("tracingOpen").click();''',
     '''  console.log("\\nthe card's own coordinate");
  {
    const c = await p.evaluate(async () => {
      window.__opened = [];
      window.open = (u) => { window.__opened.push(u); return null; };
      const X = document.getElementById("tracingX"), Y = document.getElementById("tracingY"),
            Z = document.getElementById("tracingZ"), S = document.getElementById("tracingStatus");
      const out = {};
      out.fields = !!X && !!Y && !!Z;

      /* Pasting the whole triple into x, the way the main coordinate box does it. */
      X.value = "240700, 207900, 21400";
      X.dispatchEvent(new Event("input", { bubbles: true }));
      out.split = [X.value, Y.value, Z.value].join("/");

      window.CUR_POS = null;
      document.getElementById("tracingOpen").click();
      out.typedOpens = window.__opened.length;
      try { out.typedAt = String(JSON.parse(decodeURIComponent(
        (window.__opened[0] || "").split("#!")[1] || "")).position); } catch (e) { out.typedAt = ""; }

      /* Half-filled: he is mid-type, and opening somewhere else would look identical to opening in
         the right place until two sections into a tracing. */
      window.__opened = [];
      Z.value = "";
      window.CUR_POS = [240640, 207872, 21360];
      document.getElementById("tracingOpen").click();
      out.halfOpens = window.__opened.length;
      out.halfSays = S.innerText;

      /* Cleared, it follows the cell on screen -- and the boxes say so. */
      X.value = Y.value = Z.value = "";
      document.getElementById("tracingPanel").open = false;
      document.getElementById("tracingPanel").open = true;
      await new Promise(r => setTimeout(r, 0));   // <details> fires `toggle` asynchronously
      out.filled = [X.value, Y.value, Z.value].join(",");
      return out;
    });
    ok(c.fields, "the card has x, y and z boxes of its own");
    ok(c.split === "240700/207900/21400",
       "...and pasting x, y, z into x splits it, like the main coordinate box", c.split);
    ok(c.typedOpens === 1 && c.typedAt === "240700,207900,21400",
       "a typed coordinate opens the viewer with no cell on screen at all \\u2014 which is what "
       + "\\u201cthe button doesn\\u2019t work\\u201d was", c.typedAt);
    ok(c.halfOpens === 0 && /all three/i.test(c.halfSays),
       "two boxes of three opens nothing and says so, rather than quietly going somewhere else",
       c.halfSays.slice(0, 60));
    ok(c.filled === "240640,207872,21360",
       "cleared and reopened, the boxes fill from the cell on screen", c.filled);
  }

  console.log("\\nthe button that gives him somewhere to draw");
  {
    const v = await p.evaluate(() => {
      window.__opened = [];
      window.open = (u) => { window.__opened.push(u); return null; };
      window.CUR_POS = null;
      ["tracingX", "tracingY", "tracingZ"].forEach(i => { document.getElementById(i).value = ""; });
      document.getElementById("tracingOpen").click();
      const refused = document.getElementById("tracingStatus").innerText;
      window.CUR_POS = [240640, 207872, 21360];
      document.getElementById("tracingOpen").click();''',
     "the coordinate boxes are driven in a real page"),

    ('''    ok(/coordinate or a cell first/i.test(v.refused) && v.n === 1,''',
     '''    ok(/has to open somewhere/i.test(v.refused) && v.n === 1,''',
     "the refusal it now gives is the one asserted"),
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


edit("ujump.html", HTML + JS)
edit("tracingpanelcheck.js", PANELCHECK)
print("\nnow: node tracingpanelcheck.js")
