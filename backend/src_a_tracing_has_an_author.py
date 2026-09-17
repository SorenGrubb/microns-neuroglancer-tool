"""A traced structure is stored, attributed, and versioned — never voted on.          2026-09-17

Stage 1 shipped the page side: µJump reads contours out of a pasted Neuroglancer link, keeps them
locally, feeds them to the Blender notebook, and POSTs them as `traced_structure` rows. Nothing in
Code.gs claimed that type, so every shared tracing hit the default clause added on 2026-09-02 and
came back *"unknown report type: traced_structure"*, with nothing written. That was the correct
answer to give — it is also why this file exists.

SØREN'S RULE, AND WHY IT SHAPES EVERYTHING HERE. *"I don't think the traced structures should have
consensus handling, but it should be marked who traced the structures."* So this branch is
deliberately unlike every other writer in this file:

  - no upsertMasterCellRow / upsertMasterCellOrganelle. A hand-traced outline is not a claim about
    what MICrONS's nucleus 253863 is; it is a drawing somebody made. It must not move an identity
    tally, and it must not create a master row of its own.
  - no vote sheet, no agreement bonus, no `reports` credit. aggregateAll() reads named sheets only,
    so a new sheet is outside it by construction — and that is the intended state, not an oversight.
    (A `tracings` stat would mean another full-sheet read on a function that measured 77.8 s live.
    If it is ever wanted, it belongs in PointsIndex.gs's four-hourly precompute, not here.)
  - reporterName IS returned to the client. The same deliberate exception ?newCells=1 carries, for
    the same reason: attribution is the whole point of the record. reporterEmail stays server-side.

ONE ROW PER CONTOUR, AND WHAT TIES THEM TOGETHER. The page POSTs each ring separately (µJump posts
no-cors and cannot batch a response anyway), so a tracing arrives as N rows carrying the same
`structureId` and the same `groupId` — structureId identifying the cell somebody outlined, groupId
identifying one act of sharing it. That second key is what makes a tracing correctable: outline
five more sections, share again, and the newer group supersedes the older one on read-back without
anything being deleted. Full history stays in the sheet, same as classification history.

Who owns a tracing is (structureId, reporterEmail), not structureId alone. Two people outlining the
same cell is two tracings, and with no consensus there is nothing that would merge them — merging
them would be exactly the consensus handling Søren asked not to have.

THE READ-BACK IS TWO SHAPES, because contour text is bulky and an index is not:
  ?tracings=1                      -> one entry per tracing: who, what, how many sections. No points.
  ?tracings=1&structureId=<id>     -> the same, plus `rows` in the exact field names
                                      core/tracing.js's rowsToStructures() already parses.

LATEST-GROUP-WINS USES THE APPEND-ONLY PROPERTY. This sheet is only ever appended to and never
reordered, so scanning forward, the last groupId seen for a tracing is its newest — the same
technique lastClassificationHistoryEntry() uses. Rows shared before groupId existed all carry "",
compare equal, and therefore accumulate as a single version; there is no version information in
them to recover.

Run from backend/:  python3 src_a_tracing_has_an_author.py
                    node gs_harness_tracings.js && node gs_wiring_check.js
"""
import io
import os

HERE = os.path.dirname(os.path.abspath(__file__))

POST = ('''  } else if(d.type==="not_a_nucleus"){''',
        '''  } else if(d.type==="traced_structure"){
    /* A cell somebody outlined by hand, one row per contour — see this file's header for why this
       branch writes nowhere else. Stage 1 of the tracing feature (2026-09-16) posts these from
       µJump's Jump tab; core/tracing.js turns a pasted Neuroglancer link into exactly these rows
       and turns them back into rings on the way out.

       z AND ringIndex ARE LEGITIMATELY 0. `d.z||""` would write "" for section 0 and for the first
       ring of every section, which is most of them — the coordinate would survive and the ring
       order would not. Hence the explicit ===0 tests, which nothing else in this chain needs
       because nothing else in this chain has a meaningful zero.

       points is the whole contour as one string (core/tracing.js's encodePoints: "x,y x,y ..."),
       because a cell traced on 40 sections is 40 rows either way and a row per VERTEX would be
       tens of thousands. pointCount is stored beside it so the index read-back can report a size
       without parsing anything. */
    var sh=ss.getSheetByName("Traced structures")||ss.insertSheet("Traced structures");
    if(sh.getLastRow()===0){
      sh.appendRow(["timestamp","structureId","groupId","name","cellType","color","nucleusId","rootId","z","ringIndex","points","pointCount","subIndex","subCount","comment","path","reporterName","reporterEmail"]);
    }
    sh.appendRow([d.timestamp||new Date().toISOString(),d.structureId||"",d.groupId||"",
                  d.name||"",d.cellType||"",d.color||"",d.nucleusId||"",d.rootId||"",
                  (d.z===0?0:(d.z||"")),(d.ringIndex===0?0:(d.ringIndex||"")),
                  d.points||"",d.pointCount||"",d.subIndex||"",d.subCount||"",
                  d.comment||"",d.path||"",d.reporterName||"",d.reporterEmail||""]);
    // Deliberately nothing else. Not upsertMasterCellRow (a drawing is not an identity claim),
    // not upsertMasterCellOrganelle (a contour is not an organelle location), no vote sheet.
  } else if(d.type==="not_a_nucleus"){''',
        "doPost has a traced_structure branch")

GET = ('''  if(e.parameter.newCellOrganelles==="1"){''',
       '''  if(e.parameter.tracings==="1"){
    /* Hand-traced structures, back out. Two shapes from one route:
         ?tracings=1                    -> the index: who traced what, how big, when. No contours.
         ?tracings=1&structureId=<id>   -> the same entries plus `rows`, in the field names
                                           core/tracing.js's rowsToStructures() already reads.
       The index exists because contour text dominates this sheet — an index of 200 tracings is a
       few kB, the contours behind them are megabytes — and because the list a user picks from
       needs none of it.

       KEYED BY (structureId, reporterEmail), NOT structureId. No consensus here, by Søren's
       instruction, so two people outlining the same cell are two tracings and stay two tracings;
       folding them together would BE the consensus handling he asked not to have. reporterName is
       returned (attribution is the record's purpose — the same deliberate exception ?newCells=1
       makes); reporterEmail is used as the key and never sent.

       LATEST GROUP WINS. The sheet is append-only and never reordered, so scanning forward the
       last groupId seen for a tracing is its newest submission; a new groupId therefore resets the
       accumulators rather than adding to them. That is what makes "outline five more sections and
       share again" a correction instead of a duplicate, with the older version still in the sheet.
       Rows written before groupId existed all carry "" and so accumulate as one version — there is
       no version information in them to recover.

       Whole-sheet read, like ?newCells=1 and ?newCellOrganelles=1 beside it. Right for as long as
       this sheet is thousands of rows rather than the master list's 150k; if it outgrows that, it
       wants a PointsIndex.gs-style precompute, not a cleverer scan. */
    var ss=SS();
    var sh=ss.getSheetByName("Traced structures");
    var want=String(e.parameter.structureId||"");
    var out={},order=[],zseen={};
    if(sh&&sh.getLastRow()>=2){
      var data=sh.getDataRange().getValues(),h=data[0];
      var iTs=h.indexOf("timestamp"),iSid=h.indexOf("structureId"),iGid=h.indexOf("groupId"),
          iName=h.indexOf("name"),iType=h.indexOf("cellType"),iCol=h.indexOf("color"),
          iNuc=h.indexOf("nucleusId"),iRoot=h.indexOf("rootId"),iZ=h.indexOf("z"),
          iRi=h.indexOf("ringIndex"),iPts=h.indexOf("points"),iPc=h.indexOf("pointCount"),
          iCm=h.indexOf("comment"),iRn=h.indexOf("reporterName"),iRe=h.indexOf("reporterEmail");
      for(var ti=1;ti<data.length;ti++){
        var row=data[ti],sid=String(row[iSid]||"");
        if(!sid)continue;
        if(want&&sid!==want)continue;
        var gid=String(iGid>=0?(row[iGid]||""):"");
        var k=sid+"|"+String(iRe>=0?(row[iRe]||""):"");
        var t=out[k];
        if(!t){t=out[k]={structureId:sid,groupId:gid,name:"",cellType:"",color:"",
                         nucleusId:"",rootId:"",tracedBy:"",comment:"",timestamp:"",
                         sections:0,contours:0,vertices:0};
               order.push(k);zseen[k]={};t.groupId=gid;}
        if(gid!==t.groupId){t.groupId=gid;t.contours=0;t.vertices=0;zseen[k]={};if(t.rows)t.rows=[];}
        // Metadata comes from whichever row of the winning group was seen last -- every row of one
        // submission carries the same values, so "last" and "any" agree; this just avoids caring.
        t.name=String(row[iName]||"");
        if(iType>=0)t.cellType=String(row[iType]||"");
        if(iCol>=0)t.color=String(row[iCol]||"");
        if(iNuc>=0)t.nucleusId=String(row[iNuc]||"");
        if(iRoot>=0)t.rootId=String(row[iRoot]||"");
        if(iCm>=0)t.comment=String(row[iCm]||"");
        if(iRn>=0)t.tracedBy=String(row[iRn]||"");
        t.timestamp=String(row[iTs]||"");
        t.contours++;
        t.vertices+=Number(row[iPc]||0)||0;
        zseen[k][String(row[iZ])]=1;
        if(want){
          if(!t.rows)t.rows=[];
          t.rows.push({structureId:sid,name:t.name,cellType:t.cellType,color:t.color,
                       nucleusId:t.nucleusId,rootId:t.rootId,
                       z:Number(row[iZ]||0),ringIndex:Number(row[iRi]||0),
                       points:String(row[iPts]||""),reporterName:t.tracedBy});
        }
      }
    }
    var tracings=order.map(function(k){var t=out[k];t.sections=Object.keys(zseen[k]).length;return t;});
    return gJson({tracings:tracings});
  }
  if(e.parameter.newCellOrganelles==="1"){''',
       "doGet answers ?tracings=1")


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


edit("Code.gs", [POST, GET])
print("\nnow: node gs_harness_tracings.js")
