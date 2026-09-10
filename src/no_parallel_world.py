"""An added cell is a community-identified cell, not a parallel world.               2026-09-10

Søren: *"I want that when you report a new cell, it should become a community identified cell, not
live in a parallel world as an unnamed cell where one user suggested that it is an astrocyte. I want
it to look like the Nucleus XX cells... Users should be able to correct the nucleus identifications
also, so that they are named the name that a user tells us and when there are more identifications
it should be the most popular one."*

WHAT WAS STILL PARALLEL, and why. Everything a cell's identity does in this family -- majority
consensus, correcting somebody else's call, agree/disagree votes, the classification history, the
Master cell list -- is keyed on a NUMERIC nucleus id. Measured, in BJumpPosition.gs:

    out.push({ nucleusId: Number(nid), current: ..., community: ..., source: ... });

`Number(nid)`. So an added cell, which had no id at all, could not enter any of it: its identity had
to live on its own "New cells (no nucleus)" row, where the first writer wins and nobody can
disagree. That is the parallel world, and it was a consequence of the missing id rather than a
design anybody chose.

SO ADDED CELLS GET AN ID. Deterministic from the coordinate, so every client computes the same one
without asking the server and without any new state to keep:

    addedNucleusId("102833,23184,348")  ->  FNV-1a over "<ds>|<coord>", into [1000000, 1000999999]

λJump's detections are numbered 1..488, so the reserved band cannot collide with one. Across a
thousand added cells the chance of two hashing alike is about 0.02 %, and the dataset key is in the
hash so two tools cannot collide with each other either.

WHAT THAT UNLOCKS, all of it machinery that already exists and was simply unreachable:

  * identifying an added cell posts an ordinary `new_identification` -- the same report a detection
    gets, so the Master cell list computes current_identity and community_top_identity for it, and
    the MOST POPULAR name wins exactly as it does everywhere else;
  * anybody can identify it again with a different name, which is what "correct the identification"
    means here -- consensus decides, not whoever typed first;
  * the agree/disagree pills, the community-identifications list and the classification history all
    address it;
  * the favourite star works, because it keys on the same id. It was left off yesterday precisely
    because every added cell would have shared id 0.

The "New cells (no nucleus)" row keeps doing the one job it is right for: recording that a nucleus
exists at that coordinate. The identity moves off it and into the same place every other identity in
this tool lives.

The missed-nucleus form still asks what the cell is, and now sends TWO reports: the row (the
location) and, if a type was picked, a `new_identification` (the first opinion about it). One is a
fact about the volume; the other is a claim somebody can disagree with. They were never the same
thing, and merging them into one column is what made the first opinion unchallengeable.

Run: python3 src/no_parallel_world.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ID = [
    ('''function absorbAddedNuclei(){''',
     '''/* ── A STABLE ID FOR A CELL WITH NO DETECTION ─────────────────────────────────────────────
   Everything identity does in this family is keyed on a NUMERIC nucleus id -- bjumpIdentities()
   returns `Number(nid)`, the Master cell list is keyed by it, votes and history address it. A cell
   without one cannot take part, which is why an added cell's name had to live on its own row where
   the first writer won and nobody could disagree.

   Derived from the coordinate rather than assigned by the server: every client computes the same id
   from the same row, with no new state to keep and nothing to deploy. FNV-1a, mapped into a band
   starting at a million -- this dataset's detections are 1..488, so the two cannot meet. The
   dataset key is inside the hash so two tools cannot collide with each other either. Across a
   thousand added cells the chance of two hashing alike is about 0.02 %. */
const ADDED_ID_BASE=1000000, ADDED_ID_SPAN=1000000000;
function addedNucleusId(coordStr){
  const s=((UJ&&UJ.cfg&&UJ.cfg.backend&&UJ.cfg.backend.ds)||"")+"|"+String(coordStr||"").replace(/\\s+/g,"");
  let h=0x811c9dc5;
  for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,0x01000193)>>>0; }
  return ADDED_ID_BASE+(h%ADDED_ID_SPAN);
}
function absorbAddedNuclei(){''',
     "an added cell gets an id it can be identified by"),

    ('''    /* 0, because detection ids run 1..N_DET and 0 therefore cannot collide with one. */
    bid.push(0);''',
     '''    /* A REAL ID, derived from the coordinate -- see addedNucleusId(). It was 0 until 2026-09-10,
       which meant every added cell shared one id and none of them could be identified, voted on or
       favourited through the machinery every detection uses. */
    bid.push(addedNucleusId(rec.coord));''',
     "...instead of every added cell sharing id 0"),

    ('''function ljumpIdentityOf(i){
  /* An added cell has no detection id -- BID is 0 for it -- so the Master cell list cannot be
     keyed by it, and looking it up anyway would read every added cell's identity off nucleus 0.
     Its identity is the one on its own row, which is what the name-it control writes. */
  if(BADDED[i]&&ADDED_REC[i])return String(ADDED_REC[i].identified||"").trim();
  const rec=IDENTITY_BY_NID&&IDENTITY_BY_NID[BID[i]];
  return rec&&rec.current?String(rec.current).trim():"";
}''',
     '''function ljumpIdentityOf(i){
  /* THE MASTER CELL LIST FIRST, for both kinds -- an added cell has a real id now, so the consensus
     that decides every other cell's name decides its name too, and a second identification can
     overturn the first. The row's own `identified` is only a fallback, for a cell added before
     anybody identified it through the normal flow. */
  const rec=IDENTITY_BY_NID&&IDENTITY_BY_NID[BID[i]];
  if(rec&&rec.current)return String(rec.current).trim();
  if(BADDED[i]&&ADDED_REC[i])return String(ADDED_REC[i].identified||"").trim();
  return "";
}''',
     "consensus names an added cell, the row is only a fallback"),
]

PANEL = [
    ('''  const addedName=added?String(rec.identified||"").trim():"";''',
     '''  /* The consensus name if there is one, the row's own only as a fallback -- same rule as
     ljumpIdentityOf(), so the headline and the filter can never disagree. */
  const addedName=added?ljumpIdentityOf(i):"";''',
     "the headline reads the consensus"),

    ('''  /* No favourite star on an added cell: favourites key on a nucleus id, every added cell has id 0,
     and one shared star across all of them would be worse than none. The right fix is a backend
     key that is not a detection id; until then this is absent rather than wrong. */
  h+='<div class="celltype" id="ctHeadline" data-unclassified="1" data-microns-name="">'
    + celltypeLink(pos,added?escHtml(addedName||"Unnamed cell"):('Nucleus '+BID[i]))
    + ((!added&&typeof favStarHtml==="function")?favStarHtml(String(BID[i]),"",pos[0],pos[1],pos[2]):"")
    + (added?'':' <small>no classifier for this dataset</small>')+'</div>';''',
     '''  /* The star works for both now: an added cell has a real id to key a favourite on. It was
     absent yesterday only because every added cell shared id 0 and would have shared one star. */
  h+='<div class="celltype" id="ctHeadline" data-unclassified="1" data-microns-name="">'
    + celltypeLink(pos,added?escHtml(addedName||"Unnamed cell"):('Nucleus '+BID[i]))
    + ((typeof favStarHtml==="function")?favStarHtml(String(BID[i]),"",pos[0],pos[1],pos[2]):"")
    + (added?'':' <small>no classifier for this dataset</small>')+'</div>';''',
     "an added cell can be favourited"),

    ('''  /* The agree?/disagree pills, directly under the headline exactly where µJump puts them. They
     vote on an identification keyed by a NUCLEUS ID, so an added cell has nothing for them to
     address; its identity lives on its own row. */
  if(!added)h+='<div id="idVotePanel" style="margin:5px 0 2px"></div>';''',
     '''  /* The agree?/disagree pills, directly under the headline exactly where µJump puts them. For
     BOTH kinds since 2026-09-10: an added cell's identity is an ordinary identification keyed by an
     ordinary id, so it can be agreed with and disagreed with like any other. */
  h+='<div id="idVotePanel" style="margin:5px 0 2px"></div>';''',
     "an added cell's name can be argued with"),

    ('''  h+='<label style="margin-top:18px;display:block">Community identifications</label>';
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
     '''  /* THE SAME PANEL FOR BOTH. This briefly printed a static line for an added cell, because its
     name lived on its own row and there was nothing to list. With a real id there is: every
     identification of it is an ordinary report, the most popular one wins, and the history shows
     who said what. */
  h+='<label style="margin-top:18px;display:block">Community identifications</label>';
  h+='<div class="meta" id="commReports"></div>';
  h+='<div id="classHistoryPanel" style="margin:10px 0 0"></div>';''',
     "the community panel is the community panel"),

    ('''  if(added){
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
  }''',
     '''  if(added){
    h+='</div>';
    document.getElementById("panel").innerHTML=h;
    /* A real nucleus id, so the organelle form, the vote widget and the identification all key to
       the same cell the Master cell list knows about. */
    ID_CTX={nucId:String(BID[i]),root:"",pos:pos.slice()};
    window.CUR_CELLTYPE_DISPLAY=addedName||null;
    window.CUR_POS=pos.slice();
    window.CUR_MICRONS_NAME=null; window.CUR_COMMUNITY_TOP_NAME=addedName||null;
    /* The same community load a detection gets: reports, votes, history. */
    loadCommunity(i);
    if(typeof UJ.tree!=="undefined"&&UJ.tree.start)try{UJ.tree.start();}catch(_et){}
    if(typeof wireOrganelleFlag==="function"){try{wireOrganelleFlag("");}catch(_eo){}}
    try{wireNewNucleusList();}catch(_ew){}
    return;
  }''',
     "an added cell loads its community panel too"),
]

SUBMIT = [
    ('''  /* ── THE SAME PANEL, A DIFFERENT ROW ─────────────────────────────────────────────────────
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
  postReport({''',
     '''  /* ONE REPORT TYPE FOR BOTH KINDS. This briefly appended the name to the added cell's own
     "New cells" row, because it had no id to key an identification to. It has one now
     (addedNucleusId), so identifying an added cell is an ORDINARY new_identification -- which is
     what makes it correctable: the Master cell list takes every identification of that id and the
     most popular wins, exactly as for a detection. A name written into a row was a name nobody
     could disagree with. */
  postReport({''',
     "identifying an added cell is an ordinary identification"),
]

FORM = [
    ('''    postReport({
      type:"new_cell_no_nucleus",
      coord:raw.slice(0,3).join(","),
      identified:ident,
      comment:(commentEl&&commentEl.value||"").trim(),
      timestamp:new Date().toISOString()
    },"missed nucleus").then(function(d){''',
     '''    /* TWO REPORTS, because they are two different claims. The row records that a nucleus EXISTS
       at this coordinate -- a fact about the volume. The identification is somebody's opinion about
       what it is, and it goes through the same path every other identification takes so that the
       next person can disagree and the most popular name wins. Writing the opinion into the row's
       `identified` column, as this did until 2026-09-10, made the first opinion unchallengeable. */
    const addedId=addedNucleusId(raw.slice(0,3).join(","));
    if(ident){
      postReport({
        type:"new_identification",
        nucleusId:addedId,
        rootId:"",
        coord:raw.slice(0,3).join(","),
        identified:ident,
        path:"",
        comment:"",
        certainty:"",
        timestamp:new Date().toISOString()
      }, ident);
    }
    postReport({
      type:"new_cell_no_nucleus",
      coord:raw.slice(0,3).join(","),
      identified:ident,
      comment:(commentEl&&commentEl.value||"").trim(),
      timestamp:new Date().toISOString()
    },"missed nucleus").then(function(d){''',
     "adding a named cell files an identification as well as the row"),
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


edit("ljump.html", ID + PANEL + SUBMIT + FORM)
print("\nnow: node newnucleuscheck.js")
