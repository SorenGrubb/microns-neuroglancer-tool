"""λJump remembers where you have been.                                              2026-09-10

Søren: *"We need to show 'Recent' for lJump, like for uJump."*

µJump keeps a full navigation history -- Back/Forward, a persisted list, a "Recently viewed cells"
panel. λJump kept nothing: every cell you looked at was gone the moment you typed the next
coordinate, on the one tool in the family where you are most likely to be walking a list of cells by
hand because its detector finds fewer than half of them.

This is the panel, not the whole history machinery: a collapsible "Recently viewed cells" list under
the coordinate box, newest first, each row a click that goes back there. Back/Forward is a separate
thing and is not in here.

THREE DECISIONS worth writing down.

  * It stores the COORDINATE, not the index. Nucleus ids on this dataset are assigned 1..N in sort
    order, so refitting the detector renumbers every one of them -- the same reason the report rows
    carry a coord. An index would also be meaningless the moment absorbAddedNuclei() changes how
    many cells there are. A coordinate survives both, and jumping by coordinate lands on the right
    cell whether it is a detection or one somebody added.

  * The name shown is resolved WHEN THE PANEL IS DRAWN, not when the cell was visited. So a cell
    that was "Unnamed" when you looked at it and has since been identified reads correctly the next
    time the list is drawn, rather than preserving a stale label forever.

  * localStorage, under λJump's own key. µJump's history once shared a key with πJump and sent
    people to a different real cell in a different volume, because pinky100's ids are also valid
    minnie65 ids (see NAV_HISTORY_KEY's own comment in πJump). This key is prefixed, and the entries
    carry coordinates rather than ids anyway.

Run: python3 src/ljump_remembers_where_you_have_been.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MARKUP = [
    ('''<p class="err" id="err"></p>
</div>

<div id="panel"></div>''',
     '''<p class="err" id="err"></p>
<!-- Recently viewed cells. Native <details> so it remembers nothing but its own open state and
     needs no script to collapse; the list inside is filled by renderRecent(). -->
<details id="recentBox" style="margin-top:10px;display:none">
  <summary style="cursor:pointer">Recently viewed cells</summary>
  <div id="recentList" style="margin-top:6px"></div>
</details>
</div>

<div id="panel"></div>''',
     "the Jump card has a Recent panel"),
]

CODE = [
    ('''function showCell(i, distNm){''',
     '''/* ── RECENTLY VIEWED CELLS ────────────────────────────────────────────────────────────────
   Søren, 2026-09-10: "We need to show 'Recent' for lJump, like for uJump."

   Coordinates, not indices or ids. Nucleus ids here are assigned 1..N in sort order, so refitting
   the detector renumbers all of them -- which is why every report row carries a coord too -- and an
   index stops meaning anything the moment absorbAddedNuclei() changes how many cells there are. A
   coordinate survives both and lands on the right cell whether it was detected or added.

   The NAME is resolved when the list is drawn rather than when the cell was visited, so a cell
   identified since you looked at it reads correctly instead of keeping a stale label. */
const LJ_RECENT_KEY="ljump_recent_v1", LJ_RECENT_MAX=12;
function ljRecentRead(){
  try{ const v=JSON.parse(localStorage.getItem(LJ_RECENT_KEY)||"[]"); return Array.isArray(v)?v:[]; }
  catch(_e){ return []; }
}
function ljRecentWrite(list){
  try{ localStorage.setItem(LJ_RECENT_KEY,JSON.stringify(list.slice(0,LJ_RECENT_MAX))); }catch(_e){}
}
function noteRecent(i){
  const key=[BX[i],BY[i],BZ[i]].join(",");
  const list=ljRecentRead().filter(function(r){return r&&r.coord!==key;});
  list.unshift({coord:key,added:!!BADDED[i],t:Date.now()});
  ljRecentWrite(list);
  renderRecent();
}
/* Resolves each remembered coordinate back to whatever is there NOW -- so a cell that has been
   identified, or a coordinate that has since gained a closer added nucleus, reads as it is today. */
function renderRecent(){
  const box=document.getElementById("recentBox"),host=document.getElementById("recentList");
  if(!box||!host)return;
  const list=ljRecentRead();
  if(!list.length){ box.style.display="none"; return; }
  box.style.display="";
  host.innerHTML=list.map(function(r){
    const p=String(r.coord).split(",").map(Number);
    const hit=nearest(p[0],p[1],p[2]);
    let label="";
    if(hit.i>=0){
      const nm=ljumpIdentityOf(hit.i);
      label=nm?escHtml(nm):(BADDED[hit.i]?"unnamed":("Nucleus "+BID[hit.i]));
      if(BADDED[hit.i])label+=' <span style="opacity:.65">&middot; added</span>';
    }else label='<span style="opacity:.6">not found</span>';
    return '<div style="font-size:12px;padding:2px 0"><a href="#" class="recentjump" '
      +'data-c="'+escHtml(r.coord)+'">'+escHtml(r.coord)+'</a> &mdash; '+label+'</div>';
  }).join("");
  host.querySelectorAll(".recentjump").forEach(function(a){
    a.addEventListener("click",function(ev){
      ev.preventDefault();
      const p=String(a.dataset.c).split(",");
      document.getElementById("x").value=p[0];
      document.getElementById("y").value=p[1];
      document.getElementById("z").value=p[2];
      document.getElementById("go").click();
    });
  });
}
document.addEventListener("DOMContentLoaded",function(){ try{renderRecent();}catch(_e){} });
function showCell(i, distNm){''',
     "λJump remembers the cells you have looked at"),

    ('''  const added=!!(BADDED[i]&&ADDED_REC[i]);
  const rec=added?ADDED_REC[i]:null;
  CUR_IDX=i;''',
     '''  const added=!!(BADDED[i]&&ADDED_REC[i]);
  const rec=added?ADDED_REC[i]:null;
  CUR_IDX=i;
  try{noteRecent(i);}catch(_er){}''',
     "...as you look at them"),
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


edit("ljump.html", MARKUP + CODE)
print("\nnow: node newnucleuscheck.js")
