"""Paste a viewer link and log many organelles of one kind, on every tool.

Søren, 2026-09-03: "I also wanted the option to paste url, like in xJump where you can log a lot of
organelles of the same type quickly."

WHAT EXISTED WHERE. Three organelle forms, three states:

  χJump  paste box, one row per marker -- but every row came out `centriole` and had to be
         re-labelled by hand, which is the very thing he asked ωJump to stop doing.
  ωJump  paste box AND a kind picker, since this morning. The thing he is pointing at.
  the µJump family (µ, δ, π, λ, β through core/panel.js) and ηJump: typing only. Three fields per
         structure, "+ Add another structure", repeat. Logging twelve mitochondria that way is
         thirty-six numbers typed by hand off a screen.

All three get the same callout now: pick the kind once, paste the link, get a row per marker
already labelled.

── ONE PARSER, IN THE ONTOLOGY MODULE ─────────────────────────────────────────────────────────

markersFromLink(text, layerName) joins rowsFromPoints() in core/organelles.js. Pulling point
annotations out of a pasted Neuroglancer state is not page-specific: decode `#!<json>`, walk the
annotation layers, keep the three-number points. χJump has had its own copy as X.parsePoints since
it was written and keeps it -- it does more (it also reads the position, and its callers need the
"markers, but in the wrong layer" distinction) -- but the µJump family had NO copy at all, and
writing a second one into core/panel.js and a third into hjump.html is how this family gets three
implementations of one idea that drift.

WHY IT TAKES A LAYER NAME even though the µJump family passes null: χJump filters to its
`organelles` layer, because its own "open this cell" button arms exactly that layer and a marker
dropped elsewhere means something different. The µJump family has no such convention yet, so it
accepts markers from any annotation layer -- being fussy about a layer name nobody was told to use
would reject the very links people actually paste.

── WHAT THE CALLOUT DOES NOT DO HERE ──────────────────────────────────────────────────────────

No "open this cell with the organelle layer" button, which χJump has. That button builds a viewer
state with an annotation layer armed and the existing organelles drawn beside it, out of χJump's
own viewerUrl(). The µJump family builds its links through five different page-local functions and
ηJump through a sixth; wiring that up is a real piece of work per tool and not what he asked for.
The instruction says to Ctrl+click in the viewer link the cell card already offers, which is a link
every one of these pages does have.

VECTOR KINDS PAIR UP, exactly as in ωJump -- rowsFromPoints is the shared rule and this is now its
third caller. A cilium is base + tip, so six markers make three rows, not six half-filled ones.
"""
import io, os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(path, pairs):
    """Apply each replacement once, and say so if it is already there."""
    p = os.path.join(HERE, path)
    s = io.open(p, encoding="utf-8").read()
    for old, new, why in pairs:
        if new in s:
            print(path + ": already done: " + why)
            continue
        assert old in s, path + ": not found: " + why
        assert s.count(old) == 1, path + ": ambiguous (%d): %s" % (s.count(old), why)
        s = s.replace(old, new, 1)
    io.open(p, "w", encoding="utf-8").write(s)
    print(path + ": ok")


# ══ 1. the parser, beside the rule it feeds ═══════════════════════════════════════════════════
edit("core/organelles.js", [

(  """  /* ONE PASTE OF MARKERS, ONE KIND""",
   """  /* THE MARKERS IN A PASTED VIEWER LINK.                                          2026-09-03

     Søren: "I also wanted the option to paste url, like in xJump where you can log a lot of
     organelles of the same type quickly."

     Decoding a Neuroglancer state and pulling the point annotations out of it is not page
     knowledge -- it is the same six lines wherever it happens -- and the µJump family had no copy
     of it at all, so the alternative to putting it here was writing one into core/panel.js and a
     second into hjump.html. χJump keeps its own X.parsePoints, which does more (it reads the
     position too, and its callers need to tell "no markers" from "markers in the wrong layer"
     apart); this is the smaller shared thing the other forms need.

     THE LAYER NAME IS OPTIONAL and the µJump family passes nothing. χJump filters to its
     `organelles` layer because its own button arms exactly that layer, so a marker dropped
     elsewhere means something else. No other tool has that convention, and being fussy about a
     layer name nobody was told to use would reject the links people actually paste.

     A point is kept only if it is three finite numbers. Neuroglancer's annotation list also holds
     lines, boxes and ellipsoids, and a half-written point annotation can carry nulls. */
  function markersFromLink(text, layerName){
    if (!text || !String(text).trim()) return { ok:false, error:"nothing pasted", points:[] };
    var t = String(text).trim();
    var hash = t.indexOf("#!");
    if (hash >= 0) t = t.slice(hash + 2);
    if (/%7B|%22/i.test(t)){ try { t = decodeURIComponent(t); } catch (e){} }
    t = t.trim();
    if (t.charAt(0) !== "{")
      return { ok:false, error:"that does not look like a Neuroglancer link", points:[] };
    var st;
    try { st = JSON.parse(t); }
    catch (e){ return { ok:false, points:[],
      error:"that link's state is not valid JSON \\u2014 copy the whole address bar, not part of it" }; }
    var pts = [];
    (st.layers || []).forEach(function(l){
      if (!l || l.type !== "annotation") return;
      if (layerName && l.name !== layerName) return;
      (l.annotations || []).forEach(function(a){
        if (a && a.point && a.point.length === 3
            && a.point.every(function(v){ return isFinite(Number(v)); }))
          pts.push(a.point.map(Number));
      });
    });
    return { ok:true, points: pts };
  }

  /* ONE PASTE OF MARKERS, ONE KIND""",
   "markersFromLink"),

(  """           rowsFromPoints:rowsFromPoints };""",
   """           rowsFromPoints:rowsFromPoints, markersFromLink:markersFromLink };""",
   "export it"),
])


# ══ 2. the µJump family's form, in the shared panel ═══════════════════════════════════════════
edit("core/panel.js", [

(  """function organelleFormHtml(slug){""",
   """/* PICK THE KIND, PASTE THE LINK, GET A ROW PER MARKER.                            2026-09-03

   Søren: "I also wanted the option to paste url, like in xJump where you can log a lot of
   organelles of the same type quickly."

   Typing was the only way in here: three fields per structure, "+ Add another structure", repeat.
   Twelve mitochondria is thirty-six numbers read off a screen and typed back, and the numbers are
   already in the address bar of the viewer tab you Ctrl+clicked them in.

   THE KIND IS CHOSEN BEFORE THE PASTE, which is the half ωJump learned this morning: a bulk action
   that fills in the coordinates and leaves you to open twelve dropdowns has handed most of the
   work back. Rows arrive labelled and submittable.

   The parsing and the marker-to-row arithmetic are both core/organelles.js's -- markersFromLink
   and rowsFromPoints. Nothing about how many markers a cilium takes is decided here. */
function organellePasteHtml(){
  return '<div class="organ-paste-box" style="border:1px dashed var(--line);border-radius:8px;'
    +'padding:10px;margin:0 0 10px">'
    +'<div class="hint" style="margin:0">Or point at them instead: Ctrl+click each structure in the '
    +'viewer, then paste that link here &mdash; every marker becomes a row of the kind you pick.</div>'
    +'<div style="margin-top:8px"><label for="organPasteKind">What are these?</label>'
    +'<select id="organPasteKind">'+ORGANELLE_KIND_OPTIONS_HTML+'</select></div>'
    +'<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">'
    +'<input type="text" id="organPasteLink" placeholder="paste a Neuroglancer link" style="flex:1 1 240px">'
    +'<button type="button" class="idbtn" id="organPasteGo" style="width:auto">Add a row per marker</button>'
    +'</div><div class="hint" id="organPasteNote" style="margin:6px 0 0"></div></div>';
}
function organelleFormHtml(slug){""",
   "the paste callout markup"),

(  """  h+='<div id="organRows"></div>';""",
   """  h+=organellePasteHtml();
  h+='<div id="organRows"></div>';""",
   "mount it above the rows"),

# ── addRow learns to arrive filled in ────────────────────────────────────────────────────────
# It took no arguments and always produced an empty row of a default kind. A paste needs it to
# produce a row that is already the right kind with its coordinates in place -- and for a vector
# kind, with the two-point fields showing, which is what the change listener did and nothing else.
# So that listener's body becomes syncFields(), called from both.
(  """  function addRow(){""",
   """  function addRow(kindValue,ptA,ptB){""",
   "addRow takes a kind and points"),

(  """    kindEl.addEventListener("change",()=>{
      const info=ORGANELLE_KIND_BY_VALUE[kindEl.value];
      const isCilium=!!(info&&info.vector);
      centrioleFields.style.display=isCilium?"none":"";
      ciliumFields.style.display=isCilium?"":"none";
      const pl=organReportPointLabels(kindEl.value);
      if(pointLabelA)pointLabelA.textContent=pl[0]+" (voxel)";
      if(pointLabelB)pointLabelB.textContent=pl[1]+" (voxel)";
    });""",
   """    /* Extracted from the change listener so a row created BY A PASTE can be brought into the
       same state without faking an event. Which fields a row shows is asked of the kind's own
       `vector` flag, never of its name -- the reason is two comments up and cost this family a
       real bug once. */
    function syncFields(){
      const info=ORGANELLE_KIND_BY_VALUE[kindEl.value];
      const isCilium=!!(info&&info.vector);
      centrioleFields.style.display=isCilium?"none":"";
      ciliumFields.style.display=isCilium?"":"none";
      const pl=organReportPointLabels(kindEl.value);
      if(pointLabelA)pointLabelA.textContent=pl[0]+" (voxel)";
      if(pointLabelB)pointLabelB.textContent=pl[1]+" (voxel)";
    }
    kindEl.addEventListener("change",syncFields);""",
   "syncFields"),

(  """    const cx=row.querySelector(".orx"),cy=row.querySelector(".ory"),cz=row.querySelector(".orz");
    const bx=row.querySelector(".orbx"),by=row.querySelector(".orby"),bz=row.querySelector(".orbz");
    const tx=row.querySelector(".ortx"),ty=row.querySelector(".orty"),tz=row.querySelector(".ortz");""",
   """    const cx=row.querySelector(".orx"),cy=row.querySelector(".ory"),cz=row.querySelector(".orz");
    const bx=row.querySelector(".orbx"),by=row.querySelector(".orby"),bz=row.querySelector(".orbz");
    const tx=row.querySelector(".ortx"),ty=row.querySelector(".orty"),tz=row.querySelector(".ortz");
    /* A row asked for by name overrides the positional default above, and a row asked for WITH
       coordinates arrives filled. ptB is a vector kind's second point and is ignored by a point
       kind, whose second set of fields is hidden anyway -- the same rule buildSubs applies when
       it refuses to write a stale hidden coordinate. */
    if(kindValue){kindEl.value=kindValue;syncFields();}
    const fill=(p,a,b,c)=>{if(!p)return;a.value=p[0];b.value=p[1];c.value=p[2];};
    if(ptA){
      const info=ORGANELLE_KIND_BY_VALUE[kindEl.value];
      if(info&&info.vector){fill(ptA,bx,by,bz);fill(ptB,tx,ty,tz);}
      else fill(ptA,cx,cy,cz);
    }""",
   "fill a pasted row"),

# ── and the paste button itself ──────────────────────────────────────────────────────────────
(  """  addRow();
  container.querySelector("#organAddRow").addEventListener("click",()=>addRow());""",
   """  addRow();
  container.querySelector("#organAddRow").addEventListener("click",()=>addRow());
  wireOrganellePaste(container,rowsEl,addRow);""",
   "wire the paste"),
])


# ══ 3. the paste's own behaviour, next to the form it belongs to ══════════════════════════════
edit("core/panel.js", [

(  """function wireOrganelleForm(container,slug){""",
   """/* WHAT THE PASTE DOES.                                                            2026-09-03

   Reads the markers out of the pasted state (UJ.organelles.markersFromLink), turns them into rows
   of the chosen kind (UJ.organelles.rowsFromPoints -- which pairs them up for a vector kind, so a
   cilium's six markers make three rows and not six half-filled ones), and appends.

   ONLY EVER ADDS. A paste that replaced the rows would throw away whatever was already typed. The
   one exception is the single untouched default row the form opens with: replacing that is not
   losing anything, and leaving it would put an empty centriole row above every pasted one.

   THE NOTE UNDER THE PICKER is written before the pasting, not after, because for a vector kind
   the click ORDER carries meaning -- base then tip -- and somebody who learns that from an error
   message has already clicked in the wrong order. The names are the kind's own pointLabels.

   DEGRADES QUIETLY. core/organelles.js is loaded by the tools that have this form; if a page ever
   carries panel.js without it, the callout is removed rather than left as a button that does
   nothing. */
function wireOrganellePaste(container,rowsEl,addRow){
  const O=(window.UJ&&UJ.organelles)||null;
  const box=container.querySelector("#organPasteLink");
  const kindSel=container.querySelector("#organPasteKind");
  const go=container.querySelector("#organPasteGo");
  const note=container.querySelector("#organPasteNote");
  if(!box||!kindSel||!go)return;
  if(!O||!O.markersFromLink||!O.rowsFromPoints){
    const wrap=go.closest(".organ-paste-box"); if(wrap)wrap.remove();
    return;
  }
  kindSel.value="centriole";
  function syncNote(){
    const k=kindSel.value,info=ORGANELLE_KIND_BY_VALUE[k],lbl=organReportPointLabels(k);
    const nm=escHtml((info&&info.label)||k);
    note.innerHTML=(info&&info.vector)
      ? "<b>"+nm+"</b> takes two markers per structure &mdash; Ctrl+click them in pairs, "
        +escHtml(lbl[0]).toLowerCase()+" then "+escHtml(lbl[1]).toLowerCase()
        +", and each pair becomes one row."
      : "Each marker becomes one <b>"+nm+"</b> row. Anything you mis-labelled can still be "
        +"changed row by row below.";
  }
  kindSel.addEventListener("change",syncNote);
  syncNote();
  go.addEventListener("click",()=>{
    const r=O.markersFromLink(box.value,null);
    if(!r.ok){note.innerHTML='<span style="color:var(--bad)">'+escHtml(r.error)+'</span>';return;}
    if(!r.points.length){
      note.innerHTML='<span style="color:var(--bad)">That link has no markers on it. '
        +'Ctrl+click the structures in the viewer first, then copy the whole address bar.</span>';
      return;
    }
    const kind=kindSel.value;
    const first=rowsEl.children[0];
    const untouched=rowsEl.children.length===1&&first
      &&![...first.querySelectorAll("input")].some(i=>i.value.trim()!=="");
    if(untouched)rowsEl.innerHTML="";
    const made=O.rowsFromPoints(kind,r.points);
    made.rows.forEach(row=>addRow(kind,row.a,row.b));
    box.value="";
    const info=ORGANELLE_KIND_BY_VALUE[kind];
    const n=made.rows.length;
    note.innerHTML=n+" "+escHtml((info&&info.label)||kind)+" row"+(n===1?"":"s")
      +" added from "+r.points.length+" marker"+(r.points.length===1?"":"s")
      +(made.odd
         ? '. <span style="color:var(--warn)">The last one is missing its second point &mdash; '
           +'there was an odd marker, so fill it in or delete the row.</span>'
         : ". Check them and submit.");
  });
}
function wireOrganelleForm(container,slug){""",
   "the paste behaviour"),

# One label across the family: the guided-result toggle said something else, and both now read
# the way χJump reads. Søren named that wording.
(  """  return '<div class="idf-organelle" style="margin-top:10px"><span class="hint">Also want to log an organelle\\'s location on this cell? <span class="idf-back" id="idfOrganelleToggle" style="margin:0">Report an organelle &rarr;</span></span>'""",
   """  return '<div class="idf-organelle" style="margin-top:10px"><span class="hint">Log an organelle here <span class="idf-back" id="idfOrganelleToggle" style="margin:0">Log one &rarr;</span></span>'""",
   "the guided toggle's label"),

(  """      toggle.innerHTML="Report an organelle &rarr;";""",
   """      toggle.innerHTML="Log one &rarr;";""",
   "the guided toggle's collapse label"),
])


# ══ 4. isVector, when the page carries the ontology the OTHER way ═════════════════════════════
# The µJump family does not define UJ.organelleData -- its 61 kinds arrive as core/ontology.js's
# ORGANELLE_KIND_BY_VALUE. Same vocabulary, same `vector` flag, two delivery mechanisms. Without
# this fallback, loading core/organelles.js on those pages gives an empty table, isVector answers
# false for everything, and a cilium paste quietly makes one row per marker instead of pairing --
# a wrong answer that looks like a right one, which is the failure mode isVector's own comment
# already warns about.
edit("core/organelles.js", [

(  """  function isVector(v){ var k = BY_VALUE[v]; return !!(k && k.vector); }""",
   """  function isVector(v){
    var k = BY_VALUE[v];
    if (k) return !!k.vector;
    /* No UJ.organelleData on this page: the µJump family carries the same ontology as
       core/ontology.js's ORGANELLE_KIND_BY_VALUE. Read rather than assumed false -- answering
       "not a vector" for a cilium would pair nothing and make half-filled rows. */
    var o = (typeof ORGANELLE_KIND_BY_VALUE !== "undefined") ? ORGANELLE_KIND_BY_VALUE[v] : null;
    return !!(o && o.vector);
  }""",
   "isVector reads either ontology"),
])


# ══ 5. the six pages that now need core/organelles.js ═════════════════════════════════════════
# BEFORE core/panel.js, which calls into it. ηJump is in the list even though it does not load
# panel.js: its own form gets the same callout below, and it reads the same two functions.
for _page in ("ujump.html", "djump.html", "pjump.html", "ljump.html", "bjump.html", "hjump.html"):
    edit(_page, [
      ('<script src="core/ontology.js"></script>',
       '<script src="core/organelles.js"></script>\n<script src="core/ontology.js"></script>',
       "load core/organelles.js"),
    ])


# ══ 6. ηJump's own form, which mirrors panel.js's rather than sharing it ══════════════════════
# See the block comment above organelleFlagHtml() in hjump.html: this file deliberately keeps its
# own copy of the form MARKUP and WIRING, because it reads hJump's own host state
# (ID_CTX.body/seg/pos rather than nucId/root) and builds its links through viewerUrl(). What it
# does NOT duplicate is the ontology or the arithmetic -- the callout below calls exactly the same
# core/organelles.js functions the shared panel does.
edit("hjump.html", [

(  """  h+='<div id="organRows"></div>';""",
   """  /* PICK THE KIND, PASTE THE LINK, GET A ROW PER MARKER (Søren, 2026-09-03: "I also wanted the
     option to paste url, like in xJump where you can log a lot of organelles of the same type
     quickly"). Markup mirrors core/panel.js's organellePasteHtml() for the reason the whole form
     mirrors it -- so the three read alike if anyone compares them -- while the parsing and the
     marker-to-row arithmetic come from the shared module. */
  h+='<div class="organ-paste-box" style="border:1px dashed var(--line);border-radius:8px;'
    +'padding:10px;margin:0 0 10px">'
    +'<div class="hint" style="margin:0">Or point at them instead: Ctrl+click each structure in the '
    +'viewer, then paste that link here &mdash; every marker becomes a row of the kind you pick.</div>'
    +'<div style="margin-top:8px"><label for="organPasteKind">What are these?</label>'
    +'<select id="organPasteKind">'+ORGANELLE_KIND_OPTIONS_HTML+'</select></div>'
    +'<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">'
    +'<input type="text" id="organPasteLink" placeholder="paste a Neuroglancer link" style="flex:1 1 240px">'
    +'<button type="button" class="idbtn" id="organPasteGo" style="width:auto">Add a row per marker</button>'
    +'</div><div class="hint" id="organPasteNote" style="margin:6px 0 0"></div></div>';
  h+='<div id="organRows"></div>';""",
   "hJump's paste callout"),

(  """  function addRow(){
    const isFirstRow=rowsEl.children.length===0;""",
   """  function addRow(kindValue,ptA,ptB){
    const isFirstRow=rowsEl.children.length===0;""",
   "hJump's addRow takes a kind and points"),

(  """    kindEl.addEventListener("change",()=>{
      const info=ORGANELLE_KIND_BY_VALUE[kindEl.value];
      const isCilium=!!(info&&info.vector);
      centrioleFields.style.display=isCilium?"none":"";
      ciliumFields.style.display=isCilium?"":"none";
      const pl=organReportPointLabels(kindEl.value);
      if(pointLabelA)pointLabelA.textContent=pl[0]+" (voxel)";
      if(pointLabelB)pointLabelB.textContent=pl[1]+" (voxel)";
    });""",
   """    /* Extracted from the change listener so a row created BY A PASTE reaches the same state
       without faking an event. Which fields show is asked of the kind's own `vector` flag. */
    function syncFields(){
      const info=ORGANELLE_KIND_BY_VALUE[kindEl.value];
      const isCilium=!!(info&&info.vector);
      centrioleFields.style.display=isCilium?"none":"";
      ciliumFields.style.display=isCilium?"":"none";
      const pl=organReportPointLabels(kindEl.value);
      if(pointLabelA)pointLabelA.textContent=pl[0]+" (voxel)";
      if(pointLabelB)pointLabelB.textContent=pl[1]+" (voxel)";
    }
    kindEl.addEventListener("change",syncFields);""",
   "hJump's syncFields"),

(  """    const cx=row.querySelector(".orx"),cy=row.querySelector(".ory"),cz=row.querySelector(".orz");
    const bx=row.querySelector(".orbx"),by=row.querySelector(".orby"),bz=row.querySelector(".orbz");
    const tx=row.querySelector(".ortx"),ty=row.querySelector(".orty"),tz=row.querySelector(".ortz");
    wirePasteSplit(cx,cy,cz);""",
   """    const cx=row.querySelector(".orx"),cy=row.querySelector(".ory"),cz=row.querySelector(".orz");
    const bx=row.querySelector(".orbx"),by=row.querySelector(".orby"),bz=row.querySelector(".orbz");
    const tx=row.querySelector(".ortx"),ty=row.querySelector(".orty"),tz=row.querySelector(".ortz");
    if(kindValue){kindEl.value=kindValue;syncFields();}
    const fill=(p,a,b,c)=>{if(!p)return;a.value=p[0];b.value=p[1];c.value=p[2];};
    if(ptA){
      const vinfo=ORGANELLE_KIND_BY_VALUE[kindEl.value];
      if(vinfo&&vinfo.vector){fill(ptA,bx,by,bz);fill(ptB,tx,ty,tz);}
      else fill(ptA,cx,cy,cz);
    }
    wirePasteSplit(cx,cy,cz);""",
   "hJump fills a pasted row"),

(  """  addRow();
  container.querySelector("#organAddRow").addEventListener("click",()=>addRow());""",
   """  addRow();
  container.querySelector("#organAddRow").addEventListener("click",()=>addRow());
  /* The paste, wired the same way and against the same shared functions as core/panel.js's. */
  (function(){
    const O=(window.UJ&&UJ.organelles)||null;
    const box=container.querySelector("#organPasteLink");
    const kindSel=container.querySelector("#organPasteKind");
    const go=container.querySelector("#organPasteGo");
    const note=container.querySelector("#organPasteNote");
    if(!box||!kindSel||!go)return;
    if(!O||!O.markersFromLink||!O.rowsFromPoints){
      const wrap=go.closest(".organ-paste-box"); if(wrap)wrap.remove(); return;
    }
    kindSel.value="centriole";
    function syncNote(){
      const k=kindSel.value,info=ORGANELLE_KIND_BY_VALUE[k],lbl=organReportPointLabels(k);
      const nm=escHtml((info&&info.label)||k);
      note.innerHTML=(info&&info.vector)
        ? "<b>"+nm+"</b> takes two markers per structure &mdash; Ctrl+click them in pairs, "
          +escHtml(lbl[0]).toLowerCase()+" then "+escHtml(lbl[1]).toLowerCase()
          +", and each pair becomes one row."
        : "Each marker becomes one <b>"+nm+"</b> row. Anything you mis-labelled can still be "
          +"changed row by row below.";
    }
    kindSel.addEventListener("change",syncNote); syncNote();
    go.addEventListener("click",()=>{
      const r=O.markersFromLink(box.value,null);
      if(!r.ok){note.innerHTML='<span style="color:var(--bad)">'+escHtml(r.error)+'</span>';return;}
      if(!r.points.length){
        note.innerHTML='<span style="color:var(--bad)">That link has no markers on it. '
          +'Ctrl+click the structures in the viewer first, then copy the whole address bar.</span>';
        return;
      }
      const kind=kindSel.value;
      const first=rowsEl.children[0];
      const untouched=rowsEl.children.length===1&&first
        &&![...first.querySelectorAll("input")].some(i=>i.value.trim()!=="");
      if(untouched)rowsEl.innerHTML="";
      const made=O.rowsFromPoints(kind,r.points);
      made.rows.forEach(row=>addRow(kind,row.a,row.b));
      box.value="";
      const info=ORGANELLE_KIND_BY_VALUE[kind], n=made.rows.length;
      note.innerHTML=n+" "+escHtml((info&&info.label)||kind)+" row"+(n===1?"":"s")
        +" added from "+r.points.length+" marker"+(r.points.length===1?"":"s")
        +(made.odd
           ? '. <span style="color:var(--warn)">The last one is missing its second point &mdash; '
             +'there was an odd marker, so fill it in or delete the row.</span>'
           : ". Check them and submit.");
    });
  })();""",
   "hJump wires the paste"),
])


# ══ 7. χJump, the tool he was pointing AT, which still relabels every row ═════════════════════
# "like in xJump where you can log a lot of organelles of the same type quickly" -- except χJump's
# paste makes every row a centriole and hands the labelling back, which is exactly the complaint he
# made about ωJump this morning. Same picker, same shared arithmetic. src/organelle_ui.js is the
# scratch copy this block was first written in and is no longer a build input; xjump_app.js is the
# living file.
edit("xjump_app.js", [

(  """      +   "<div class='row' style='margin-top:8px'>"
      +     "<input type='text' class='organ-paste' placeholder='paste the link back here' "
      +       "style='flex:1 1 240px'>"
      +     "<button type='button' class='organ-from-link' style='width:auto'>Add a row per "
      +       "marker</button>"
      +   "</div></div>\"""",
   """      +   "<div class='row' style='margin-top:8px'>"
      /* THE KIND, CHOSEN ONCE, BEFORE THE PASTE (Søren, 2026-09-03). Every pasted row used to
         arrive as a centriole and had to be relabelled one dropdown at a time -- the same
         complaint he made about ωJump, in the tool he was holding up as the example. */
      +     "<label class='hint' style='align-self:center;margin:0'>What are these?</label>"
      +     "<select class='organ-paste-kind' style='flex:1 1 220px;width:auto'>"
      +       organ().optionsHtml() + "</select>"
      +   "</div>"
      +   "<div class='row' style='margin-top:8px'>"
      +     "<input type='text' class='organ-paste' placeholder='paste the link back here' "
      +       "style='flex:1 1 240px'>"
      +     "<button type='button' class='organ-from-link' style='width:auto'>Add a row per "
      +       "marker</button>"
      +   "</div>"
      +   "<p class='hint organ-paste-note' style='margin:6px 0 0'></p>"
      +   "</div>\"""",
   "χJump's kind picker"),

(  """    d.querySelector(".organ-from-link").addEventListener("click", function(){
      rowsFromLink(d, cellKey); });""",
   """    var pk = d.querySelector(".organ-paste-kind");
    if (pk){
      pk.value = "centriole";
      pk.addEventListener("change", function(){ syncPasteNote(d); });
      syncPasteNote(d);
    }
    d.querySelector(".organ-from-link").addEventListener("click", function(){
      rowsFromLink(d, cellKey); });""",
   "χJump wires the picker"),

(  """  function rowsFromLink(d, cellKey){""",
   """  /* What the markers will become, said BEFORE they are pasted. For a vector kind the click
     order carries meaning and an error message teaches it too late. The names are the kind's own
     pointLabels, never a hardcoded base/tip. */
  function syncPasteNote(d){
    var sel = d.querySelector(".organ-paste-kind"), note = d.querySelector(".organ-paste-note");
    if (!sel || !note) return;
    var O = organ(), k = sel.value, lbl = O.pointLabels(k);
    note.innerHTML = O.isVector(k)
      ? "<b>" + esc(O.labelOf(k)) + "</b> takes two markers per structure &mdash; "
        + "<b>Ctrl</b>+click them in pairs, " + esc(lbl[0]).toLowerCase() + " then "
        + esc(lbl[1]).toLowerCase() + ", and each pair becomes one row."
      : "Each marker becomes one <b>" + esc(O.labelOf(k)) + "</b> row. Anything you mis-labelled "
        + "can still be changed row by row below.";
  }

  function rowsFromLink(d, cellKey){""",
   "χJump's paste note"),

(  """    r.points.forEach(function(p){ addOrganRow(d, cellKey, "centriole", p); });
    box.value = "";
    organSay(d, r.points.length + " row" + (r.points.length === 1 ? "" : "s")
      + " added from the link. Set what each one is, then submit.", true);""",
   """    var sel = d.querySelector(".organ-paste-kind");
    var kind = sel ? sel.value : "centriole";
    /* The pairing is the ontology's arithmetic, not this page's -- see rowsFromPoints. */
    var made = organ().rowsFromPoints(kind, r.points);
    made.rows.forEach(function(row){ addOrganRow(d, cellKey, kind, row.a, row.b); });
    box.value = "";
    var n = made.rows.length;
    organSay(d, n + " " + esc(organ().labelOf(kind)) + " row" + (n === 1 ? "" : "s")
      + " added from " + r.points.length + " marker" + (r.points.length === 1 ? "" : "s")
      + (made.odd
          ? ". The last one is missing its second point &mdash; there was an odd marker, so fill "
            + "it in or delete the row."
          : ". Check them and submit."),
      !made.odd);""",
   "χJump uses the chosen kind"),

# ── and a row can arrive with BOTH points, for a paired vector kind ──────────────────────────
(  """  function addOrganRow(d, cellKey, kindValue, posVox){""",
   """  /* posBVox is a vector kind's second point, filled when a paste paired the markers up.
     Ignored by a point kind, whose second field is hidden by syncOrganRow anyway. */
  function addOrganRow(d, cellKey, kindValue, posVox, posBVox){""",
   "χJump's addOrganRow takes a second point"),

(  """    if (posVox) [\"x\",\"y\",\"z\"].forEach(function(ax, i){
      row.querySelector(\".oa\" + ax).value = String(Math.round(posVox[i])); });
    syncOrganRow(row); renumberOrganRows(d);""",
   """    if (posVox) [\"x\",\"y\",\"z\"].forEach(function(ax, i){
      row.querySelector(\".oa\" + ax).value = String(Math.round(posVox[i])); });
    if (posBVox && organ().isVector(kind.value)) [\"x\",\"y\",\"z\"].forEach(function(ax, i){
      row.querySelector(\".ob\" + ax).value = String(Math.round(posBVox[i])); });
    syncOrganRow(row); renumberOrganRows(d);""",
   "χJump fills the second point"),
])

print("done")
