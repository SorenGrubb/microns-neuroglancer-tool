"""One panel for both kinds of cell.                                                 2026-09-09

Søren, with the two screenshots side by side: *"Why does this look different, from this? They should
be the same, except the astrocyte is already named by me. You should be able to do the model of the
layer, you know the coordinate."*

He is right and the previous change was half of the job. The added cells went INTO the arrays -- so
nearest(), the filter, the export and the neighbour lists all reach them -- and then showCell()
handed them straight back out to a hand-built card with none of the tool on it: no depth ruler, no
community identifications, no guided identification, no type-ahead. A cell that is in the arrays but
gets a different screen is not a cell with the same rights; it is a cell with the same index.

So showNewNucleus() is gone and showCell() draws both. The layer diagram in particular needs
nothing: renderDepthRuler(i) reads BDEP/BLAY, which absorbAddedNuclei() already fills in from the
coordinate -- exactly his point.

WHAT STILL DIFFERS, and every one of these is a fact about the cell rather than a shortcut:

  headline        the community's name, or "Unnamed cell" -- not "Nucleus 107", because there is
                  no detection number to print
  tags            "added by the community" in place of the detector-pass tag, and the layer tag
                  says (estimated); truncated/damaged are detector flags and are not shown
  size line       no diameter and no volume -- nothing measured this nucleus -- and the depth is
                  labelled estimated
  ruler note      says the depth was fitted from the nearest detections rather than measured
                  against the traced surface
  meta line       "added by <name> on <date> · voxel x, y, z" instead of "nucleus 107 · voxel ..."
  agree/disagree  absent: those pills vote on an identification keyed by a nucleus id
  "is this
  detection
  wrong?"         absent: there is no detection to move, split or reject
  favourite star  absent -- favourites key on a nucleus id, and every added cell would share id 0
                  and therefore share one favourite. Worth fixing properly in the backend; sharing
                  a star between every added cell would be worse than not having one.

THE GUIDED IDENTIFICATION IS THE SAME PANEL, and its submit reroutes: for an added cell it posts
new_cell_no_nucleus with append:true and the row's exact coord, which Code.gs fills into the blank
`identified` on the row already there. Same UI, same tree, same type-ahead, same certainty; only the
destination row differs, because that is the only thing that does differ.

Run: python3 src/one_panel_for_both_kinds.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HEAD = [
    ('''  /* An added cell is in these arrays and can be reached by every path a detection can -- nearest(),
     a neighbour click, the filter's results, the random picker. Its panel is different because
     what it HAS is different (no measured diameter, an estimated layer, a provenance line), not
     because it is reached differently. */
  if(BADDED[i]&&ADDED_REC[i]){ showNewNucleus(ADDED_REC[i],distNm||0); return; }
  CUR_IDX=i;
  const pos=[BX[i],BY[i],BZ[i]], nb=kNearest(pos[0],pos[1],pos[2],3,i);
  const lt=layerTag(i);
  CUR_NUCID=String(BID[i]); CUR_ROOT="";''',
     '''  /* ── ONE PANEL FOR BOTH KINDS ────────────────────────────────────────────────────────────
     Søren, 2026-09-09, with the two screenshots side by side: "Why does this look different, from
     this? They should be the same, except the astrocyte is already named by me."

     This used to hand an added cell to a separate hand-built card, which had none of the tool on
     it. A cell that is in the arrays but gets a different screen has the same index, not the same
     rights. So one function draws both, and every difference below is a fact about the cell --
     no detection number, nothing measured, an estimated depth -- rather than a shortcut.

     The depth ruler needs nothing at all: renderDepthRuler(i) reads BDEP/BLAY, which
     absorbAddedNuclei() fills in from the coordinate. That was his other point. */
  const added=!!(BADDED[i]&&ADDED_REC[i]);
  const rec=added?ADDED_REC[i]:null;
  CUR_IDX=i;
  const pos=[BX[i],BY[i],BZ[i]], nb=kNearest(pos[0],pos[1],pos[2],3,i);
  const lt=layerTag(i);
  /* Empty for an added cell, and every id-keyed thing below is skipped because of it rather than
     being handed a 0 that means "nucleus number zero" to whatever reads it. */
  CUR_NUCID=added?"":String(BID[i]); CUR_ROOT="";''',
     "showCell draws both kinds"),

    ('''  let h='<div class="card">';
  h+='<div class="celltype" id="ctHeadline" data-unclassified="1" data-microns-name="">'
    + celltypeLink(pos,'Nucleus '+BID[i])
    + ((typeof favStarHtml==="function")?favStarHtml(String(BID[i]),"",pos[0],pos[1],pos[2]):"")
    + ' <small>no classifier for this dataset</small></div>';''',
     '''  const addedName=added?String(rec.identified||"").trim():"";
  let h='<div class="card">';
  /* No favourite star on an added cell: favourites key on a nucleus id, every added cell has id 0,
     and one shared star across all of them would be worse than none. The right fix is a backend
     key that is not a detection id; until then this is absent rather than wrong. */
  h+='<div class="celltype" id="ctHeadline" data-unclassified="1" data-microns-name="">'
    + celltypeLink(pos,added?escHtml(addedName||"Unnamed cell"):('Nucleus '+BID[i]))
    + ((!added&&typeof favStarHtml==="function")?favStarHtml(String(BID[i]),"",pos[0],pos[1],pos[2]):"")
    + (added?'':' <small>no classifier for this dataset</small>')+'</div>';''',
     "the headline is the name, or the nucleus number"),

    ('''  h+='<div style="margin-top:6px">'
    +'<span class="tag '+lt.cls+'">'+escHtml(lt.label)+'</span>'
    /* Its own tag rather than the layer one: core/panel.js overwrites #ctTag's text wholesale
       the moment a community identification wins, and sharing it would silently delete the
       anatomical label. */
    +' <span class="tag none" id="ctTag" title="No cell type has been agreed for this nucleus yet">unclassified</span>';''',
     '''  h+='<div style="margin-top:6px">'
    +'<span class="tag '+lt.cls+'"'
      +(added?' title="Estimated: this nucleus has no detection, so its depth is fitted from the '
        +DEPTH_FIT_K+' nearest detections and its layer is the majority of the detections nearest '
        +'it in depth."':'')+'>'+escHtml(lt.label)+(added?" (estimated)":"")+'</span>'
    +(added?' <span class="tag none" title="No detection found this nucleus \\u2014 somebody added it by coordinate.">added by the community</span>':'')
    /* Its own tag rather than the layer one: core/panel.js overwrites #ctTag's text wholesale
       the moment a community identification wins, and sharing it would silently delete the
       anatomical label. */
    +(addedName?'':' <span class="tag none" id="ctTag" title="No cell type has been agreed for this nucleus yet">unclassified</span>');''',
     "the tags say estimated, and who put it there"),

    ('''  h+= BPOL[i]
    ? ' <span class="tag none" title="Found by the electron-DENSE pass. That is evidence towards endothelial, pericyte, microglial or meningeal — and it is also what a red blood cell looks like. About 1 in 3 dark rows is not a nucleus at all.">dense nucleoplasm</span>'
    : ' <span class="tag none" title="Found by the pale pass — nucleoplasm brighter than the surrounding cytoplasm. Neurons, astrocytes and oligodendrocytes look like this.">pale nucleoplasm</span>';
  if(BTR[i]) h+=' <span class="tag none" title="Cut by the top or bottom face of the ~33 µm slab — its volume is an underestimate">truncated</span>';
  if(BDM[i]) h+=' <span class="tag none" title="Sits in or beside a section flagged as damaged (folded, torn or lost). The image here may be unreliable.">damaged section</span>';
  h+='</div>';

  /* The agree?/disagree pills, directly under the headline exactly where µJump puts them. */
  h+='<div id="idVotePanel" style="margin:5px 0 2px"></div>';''',
     '''  /* Detector flags, and an added cell has none: no pass found it, and truncated/damaged are
     statements about a detection that does not exist. Silence rather than a default. */
  if(!added){
    h+= BPOL[i]
      ? ' <span class="tag none" title="Found by the electron-DENSE pass. That is evidence towards endothelial, pericyte, microglial or meningeal — and it is also what a red blood cell looks like. About 1 in 3 dark rows is not a nucleus at all.">dense nucleoplasm</span>'
      : ' <span class="tag none" title="Found by the pale pass — nucleoplasm brighter than the surrounding cytoplasm. Neurons, astrocytes and oligodendrocytes look like this.">pale nucleoplasm</span>';
    if(BTR[i]) h+=' <span class="tag none" title="Cut by the top or bottom face of the ~33 µm slab — its volume is an underestimate">truncated</span>';
    if(BDM[i]) h+=' <span class="tag none" title="Sits in or beside a section flagged as damaged (folded, torn or lost). The image here may be unreliable.">damaged section</span>';
  }
  h+='</div>';

  /* The agree?/disagree pills, directly under the headline exactly where µJump puts them. They
     vote on an identification keyed by a NUCLEUS ID, so an added cell has nothing for them to
     address; its identity lives on its own row. */
  if(!added)h+='<div id="idVotePanel" style="margin:5px 0 2px"></div>';''',
     "detector flags belong to detections"),

    ('''  h+='<p class="hint" style="margin-top:10px">Nucleus '+BDIA[i].toFixed(1)+' &micro;m across, '
    +BVOL[i].toFixed(0)+' &micro;m&sup3;'
    +(BTR[i]?' <b>(underestimate &mdash; truncated)</b>':'')
    +' &middot; '+(BDEP[i]<0?Math.abs(BDEP[i]).toFixed(0)+' &micro;m ABOVE the pia'
                            :BDEP[i].toFixed(0)+' &micro;m below the pia')
    +(distNm!=null?' &middot; '+(distNm/1000).toFixed(2)+' &micro;m from your query':'')
    +'</p>';''',
     '''  const depthTxt=isFinite(BDEP[i])
    ? (BDEP[i]<0?Math.abs(BDEP[i]).toFixed(0)+' &micro;m ABOVE the pia'
                :BDEP[i].toFixed(0)+' &micro;m below the pia')
    : 'depth unknown';
  h+='<p class="hint" style="margin-top:10px">'
    /* No diameter and no volume on an added cell: BDIA/BVOL are NaN because nothing measured this
       nucleus, and "NaN µm across" is worse than not saying it. */
    +(added?'No measured size &mdash; this nucleus has no detection'
           :('Nucleus '+BDIA[i].toFixed(1)+' &micro;m across, '+BVOL[i].toFixed(0)+' &micro;m&sup3;'
             +(BTR[i]?' <b>(underestimate &mdash; truncated)</b>':'')))
    +' &middot; '+depthTxt+(added?' <b>(estimated)</b>':'')
    +(distNm!=null?' &middot; '+(distNm/1000).toFixed(2)+' &micro;m from your query':'')
    +'</p>';''',
     "the size line says what was measured"),

    ('''    +'<p class="hint" style="flex:1 1 200px;margin-top:0">Depth is measured from the <b>traced '
    +'pial surface</b>, which is inside this volume &mdash; not from a fitted plane. The layer '
    +'boundaries themselves are standard mouse V1 values, not measured here, so treat a cell '
    +'near a boundary as near a boundary.</p></div>';

  h+='<div class="meta">nucleus '+copyCode(BID[i])
    +' &middot; voxel '+copyCode(pos.join(", "))+'</div>';''',
     '''    +'<p class="hint" style="flex:1 1 200px;margin-top:0">'
    +(added
      ? 'This nucleus has no detection, so its depth is <b>estimated</b>: a plane fitted to the '
        +DEPTH_FIT_K+' nearest detections\\u2019 own depths, anchored on the nearest one. The pial '
        +'surface itself is traced inside this volume, and the layer boundaries are standard mouse '
        +'V1 values \\u2014 so treat a cell near a boundary as near a boundary, and this one as '
        +'near its estimate.'
      : 'Depth is measured from the <b>traced pial surface</b>, which is inside this volume '
        +'&mdash; not from a fitted plane. The layer boundaries themselves are standard mouse V1 '
        +'values, not measured here, so treat a cell near a boundary as near a boundary.')
    +'</p></div>';

  h+='<div class="meta">'
    +(added?('added by '+escHtml(rec.reporterName||"someone")
            +(rec.timestamp?(' on '+escHtml(String(rec.timestamp).slice(0,10))):''))
           :('nucleus '+copyCode(BID[i])))
    +' &middot; voxel '+copyCode(pos.join(", "))+'</div>';
  if(added&&rec.comment)h+='<p class="hint">&ldquo;'+escHtml(rec.comment)+'&rdquo;</p>';''',
     "the ruler note and the meta line tell the truth about the depth"),
]

BODY = [
    ('''  h+='<label style="margin-top:18px;display:block">Community identifications</label>';
  h+='<div class="meta" id="commReports"></div>';
  h+='<div id="classHistoryPanel" style="margin:10px 0 0"></div>';''',
     '''  h+='<label style="margin-top:18px;display:block">Community identifications</label>';
  if(added){
    /* Keyed by nucleus id everywhere else; an added cell's identity is the one on its own row. */
    h+='<div class="meta">'+(addedName
      ? ('Identified as <b>'+escHtml(addedName)+'</b>'
         +(rec.reporterName?(' by '+escHtml(rec.reporterName)):'')+'.')
      : 'Nobody has named this cell yet.')+'</div>';
  }else{
    h+='<div class="meta" id="commReports"></div>';
    h+='<div id="classHistoryPanel" style="margin:10px 0 0"></div>';
  }''',
     "an added cell's identity is shown from its own row"),

    ('''  h+='<label style="margin-top:16px;display:block">Is this detection wrong?</label>';''',
     '''  /* An added cell has no detection to move, split or reject -- the whole block is about
     correcting the detector, and there is nothing here the detector did. */
  if(added){
    h+='</div>';
    document.getElementById("panel").innerHTML=h;
    ID_CTX={nucId:"",root:"",pos:pos.slice()};
    window.CUR_CELLTYPE_DISPLAY=addedName||null;
    window.CUR_POS=pos.slice();
    window.CUR_MICRONS_NAME=null; window.CUR_COMMUNITY_TOP_NAME=addedName||null;
    if(typeof UJ.tree!=="undefined"&&UJ.tree.start)try{UJ.tree.start();}catch(_et){}
    if(typeof wireOrganelleFlag==="function"){try{wireOrganelleFlag("");}catch(_eo){}}
    try{wireNewNucleusList();}catch(_ew){}
    return;
  }
  h+='<label style="margin-top:16px;display:block">Is this detection wrong?</label>';''',
     "the detection-correction block is for detections"),
]

SUBMIT = [
    ('''  const cmtEl=document.getElementById("idfComment");
  msg.textContent="sending…";
  postReport({
    type:"new_identification",
    nucleusId:BID[i],''',
     '''  const cmtEl=document.getElementById("idfComment");
  msg.textContent="sending…";
  /* ── THE SAME PANEL, A DIFFERENT ROW ─────────────────────────────────────────────────────
     An added cell has no nucleus id, so "new_identification" has nothing to key to. Code.gs's
     new_cell_no_nucleus branch with append:true fills the blank `identified` on the row that is
     already there, matched on its exact stored coord -- which its own comment says is what that
     path exists for. Same tree, same type-ahead, same certainty; only the destination differs,
     because that is the only thing that does. */
  if(BADDED[i]&&ADDED_REC[i]){
    const rec=ADDED_REC[i];
    postReport({
      type:"new_cell_no_nucleus", append:true,
      coord:String(rec.coord),
      identified:nm,
      path:UJ.tree.pathText(),
      comment:(cmtEl&&cmtEl.value||"").trim(),
      certainty:certainty,
      timestamp:new Date().toISOString()
    }, nm).then(function(d){
      msg.textContent=(d&&d.ok)?("Recorded: "+nm+". Thank you."):"Could not record that.";
      if(d&&d.ok){ rec.identified=nm; showCell(i,null); try{wireNewNucleusList();}catch(_e){} }
    }).catch(function(e){ msg.textContent="failed: "+netErr(e); });
    return;
  }
  postReport({
    type:"new_identification",
    nucleusId:BID[i],''',
     "naming an added cell lands on its own row"),
]

# ── the hand-built card, and the search it needed, are gone ─────────────────────────────────────
REMOVE = [
    ("SHOW_NEW_NUCLEUS", "showNewNucleus"),
    ("NEAREST_NEW_NUCLEUS", "nearestNewNucleus"),
]


def cut_function(s, name):
    """Delete `function NAME(...){...}` and the comment block immediately above it."""
    key = "\nfunction " + name + "("
    at = s.index(key)
    # the doc comment above, if there is one
    start = at + 1
    tail = s[:start]
    if tail.rstrip().endswith("*/"):
        start = tail.rindex("/*")
    i = s.index("{", at + len(key) - 1)
    depth, j, instr = 0, i, None
    while j < len(s):
        c = s[j]
        if instr:
            if c == "\\":
                j += 2
                continue
            if c == instr:
                instr = None
        elif c in "\"'`":
            instr = c
        elif c == "/" and s[j + 1] == "*":
            j = s.index("*/", j) + 2
            continue
        elif c == "/" and s[j + 1] == "/":
            j = s.index("\n", j)
            continue
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                j += 1
                break
        j += 1
    return s[:start] + s[j:].lstrip("\n")


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
    for _tag, fn in REMOVE:
        if ("\nfunction " + fn + "(") in s:
            s = cut_function(s, fn)
            print("  ok: " + fn + "() is gone -- one panel draws both kinds now")
        else:
            print("  already there: " + fn + "() is gone")
    io.open(p, "w", encoding="utf-8").write(s)


edit("ljump.html", HEAD + BODY + SUBMIT)
print("\nnow: node newnucleuscheck.js")
