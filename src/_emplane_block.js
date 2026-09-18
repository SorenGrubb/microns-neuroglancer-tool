/* ── THE SECTION ITSELF, BESIDE THE MODEL ──────────────────────────────────────  2026-09-18
   Søren: "I would like that there is a single plane of the EM data with the segmentation loaded
   when you view the cell next to the cortical layers model, under the top view, but it may slow
   things down, so it should be possible to turn it off."

   WHERE IT GOES, AND WHY THAT IS THE WHOLE LAYOUT CHANGE. The cortical-layer model is 260x320; the
   top view is 260x140 and sits beside it, which leaves about 150 px of nothing under the top view
   and beside the model. Putting the section there costs the panel almost no extra height -- two
   stacked 260x140 panels against one 260x320 -- which is what "without too much wasted space"
   means here. So the two diagrams stop being two flex siblings and become a model column and a
   stack, and the stack is what grew.

   WHAT IT COSTS, SAID PLAINLY. One 260x140 window at 32 nm is about 18 chunks of EM plus the
   segmentation's own, and the measured cold cost on this bucket is ~1.5 s per chunk over six
   connections (see core/emtiles.js's header). That is seconds on a cold cache and free afterwards,
   because core/segread.js caches by URL and range -- which is exactly why this has a switch, and
   why the switch is REMEMBERED: somebody who turns it off on a slow connection should not meet it
   again on the next cell.

   32 nm, NOT THE PAD'S 16. The pad is for placing vertices and wants detail; this is for
   recognising a cell and wants context. 16 nm across 260 px is 4.2 um, which is the inside of a
   nucleus; 32 nm is 8.3 um, which is a soma. emtiles refuses to go coarser than 32 nm because past
   that a "section" becomes an averaged slab -- so this is the widest honest view of one plane.

   A SLOW DRAW MUST NOT PAINT THE PREVIOUS CELL. Every render takes a token; the draw re-checks it
   at each await and drops out if a newer panel has been rendered since. Without that, stepping
   through cells paints whichever fetch happens to land last, and it looks like the panel is
   showing the wrong cell -- which it would be.

   THE IDS ARE PASSED IN, NOT READ OFF CUR_ROOT/CUR_NUCID -- and the reason is not the obvious one.
   All four panels DO set those globals before they build their markup, so a global read would not
   be stale. It would be wrong in a quieter way: CUR_NUCID means "the MICrONS nucleus detection this
   panel is about", and the two community panels set it to null on purpose, because they are not
   about one. A user-reported cell's nucleus id lives in CUR_NUC_ROOT instead, so reading CUR_NUCID
   there paints no nucleus and reports no problem. A merged sub-cell has no nucleus id of its own at
   all -- only its parent's, which is the FUSED detection, and painting that would outline several
   cells as if they were this one. So each panel passes what it actually knows about the cell in
   front of the reader, and a panel that knows nothing draws the plane and says so. */
var EM_PLANE_KEY="ujump_panel_emplane",EM_PLANE_SEG_KEY="ujump_panel_emseg",EM_PLANE_TOKEN=0,EM_PLANE_WIRED=false,EM_PLANE_LAST=null;
/* 300x162 DRAWN, 260 SHOWN. The picture is fetched and drawn at 300 px wide and displayed in the
   260 px the two diagrams above it are, because "how much tissue" and "how much room" are two
   different questions and only the first one was his: 18-20 um across, in a column whose other
   two panels are 260 wide. Widening the canvas alone would break the alignment those three panels
   were lined up for; widening all three is a layout change he did not ask for. Drawing 300 data
   pixels into 260 display pixels costs nothing extra to fetch, and on any 2x screen it is sharper
   than 260 would have been. The 162 keeps the 260x140 proportion the top view set.
   MIP 3 IS THE 64 nm LEVEL, reached with slabOk -- see core/emtiles.js’s note on it. 300 px at
   64 nm is 19.2 um, inside what he asked for -- and MEASURED against the real chunk grid it costs
   exactly what the 8.3 um view cost: 15 chunks either way, for 2.3x the tissue. The same 19.2 um at
   32 nm would be a 594x321 window and 60 chunks, for a picture the same size on screen. A view's
   cost is its tissue area over the chunk area, so the only cheap way to show more of it is to read
   data that is already downsampled. */
var EM_PLANE_W=300,EM_PLANE_H=162,EM_PLANE_CSS=260,EM_PLANE_MIP=3;
function emPlaneOn(){
  try{var v=localStorage.getItem(EM_PLANE_KEY);return v===null?true:v==="1";}catch(_e){return true;}
}
/* A SECOND TICK FOR THE OVERLAY, 2026-09-18 (Søren: "there should also be an option to turn off the
   segmentation"). Separate from the section's own switch and separately remembered, because the two
   answer different questions: the section costs a fetch, and the paint costs a LOOK -- a cell filled
   solid magenta is the right picture for "is this the cell I think it is" and the wrong one for
   "what is the membrane actually doing there". Default on, like the section. */
function emPlaneSegOn(){
  try{var v=localStorage.getItem(EM_PLANE_SEG_KEY);return v===null?true:v==="1";}catch(_e){return true;}
}
function emPlaneSay(tok,msg,bad){
  var el=document.getElementById("emPlaneSay");
  if(!el||EM_PLANE_TOKEN!==tok)return;
  el.textContent=msg||"";
  el.style.color=bad?"var(--bad)":"var(--mut)";
}
/* The markup only. Nothing is fetched until drawPanelEmPlane runs, which is a task later -- so a
   panel that is rendered and immediately replaced (a fast Next in the step-through) never opens a
   connection at all. */
function emPlaneBox(pos,ids){
  /* IT SAYS WHY IT IS NOT THERE RATHER THAN NOT BEING THERE.  2026-09-18
     These two guards used to return "" -- the section simply did not appear, with nothing to
     suggest it ever should have. The first time that happened the cause was a deployed page that
     predated the feature, which no message can help; but a core/*.js that 404s on the server, or
     a script blocked by an extension, would look exactly the same and IS worth a sentence. A
     feature that vanishes silently costs a round trip to diagnose every single time. */
  var missing=null;
  if(typeof UJ==="undefined"||!UJ.emtiles||!UJ.segread)
    missing="the EM reader did not load \u2014 check that core/emtiles.js and core/segread.js are "
      +"being served, then reload with Ctrl-Shift-R";
  else if(!window.MINNIE65_EM_BB)
    missing="the dataset\u2019s imaged extents have not loaded yet";
  var bb=window.MINNIE65_EM_BB;
  var tok=++EM_PLANE_TOKEN,on=emPlaneOn()&&!missing;
  EM_PLANE_LAST={pos:pos,ids:ids||null};
  if(!missing)setTimeout(function(){drawPanelEmPlane(tok);},0);
  /* ONE CAPTION LINE, THEN THE PICTURE -- not the top view's caption/picture/note, which would be
     the obvious symmetry and is the wrong one. The top view's note is a SENTENCE about this cell
     ("within Img65's imaged extent"); this one is a spec ("8.3 um across, 32 nm"), and a spec reads
     as part of the caption. Folding it up there also buys back a whole row, which matters because
     this stack is already the taller of the two columns: measured at panel width the model is
     332 px and the stack 391, so every row of text here is a row of empty background beside the
     model. It was 137 px of empty background before this section existed and it is 59 now, so the
     gap is less than half what it replaced --
     but "smaller than before" is not "none", and pretending otherwise by squeezing the picture to
     a 70 px letterbox would trade the thing he asked for against the thing he said about it.
     The <label> resets four properties it would otherwise inherit from this page's global rule
     (display:block, uppercase, letter-spaced, muted). That rule is for the FORM labels that head a
     control -- "LAYERS", "VIEWER" -- and this is a caption with a tick in it, not a heading; left
     alone it renders "EM SECTION" in the voice of a section title. */
  return '<div id="emPlaneBox" data-tok="'+tok+'" style="margin-top:10px">'
    +'<div class="hint" style="margin:0 0 3px">'
    +'<label for="emPlaneOn" style="display:inline-flex;align-items:center;gap:5px;margin:0;'
    +'cursor:pointer;text-transform:none;letter-spacing:0;font-size:inherit;color:inherit" '
    +'title="One plane of the EM at this coordinate, with this cell’s segmentation painted on '
    +'it. It is fetched from the imagery bucket, so the first cell on a cold cache takes a few '
    +'seconds; turning it off here is remembered.">'
    +'<input type="checkbox" id="emPlaneOn" style="width:auto;margin:0"'+(on?" checked":"")
    +(missing?" disabled":"")+'> '
    +'EM section</label>'
    +' <label for="emPlaneSeg" style="display:inline-flex;align-items:center;gap:5px;margin:0 0 0 7px;'
    +'cursor:pointer;text-transform:none;letter-spacing:0;font-size:inherit;color:inherit" '
    +'title="Paint this cell\u2019s own segmentation over the section \u2014 the cell in magenta, its '
    +'nucleus in blue. Turn it off to see the membranes underneath. Remembered separately from the '
    +'section itself.">'
    +'<input type="checkbox" id="emPlaneSeg" style="width:auto;margin:0"'
    +(emPlaneSegOn()?" checked":"")+(missing?" disabled":"")+'> '
    +'segmentation</label> <span id="emPlaneSay" style="color:var(--mut)">'
    +(missing?escHtml(missing):"")+'</span></div>'
    +'<canvas id="emPlaneCv" width="'+EM_PLANE_W+'" height="'+EM_PLANE_H+'" '
    +'style="width:100%;max-width:'+EM_PLANE_CSS+'px;display:'+(on?"block":"none")+';margin:0 auto;'
    +'background:var(--bg);border:1px solid var(--line);border-radius:6px"></canvas></div>';
}
async function drawPanelEmPlane(tok){
  var box=document.getElementById("emPlaneBox");
  if(!box)return;
  if(tok==null)tok=Number(box.dataset.tok||0);
  if(EM_PLANE_TOKEN!==tok)return;
  var cv=document.getElementById("emPlaneCv");
  if(!cv||!EM_PLANE_LAST)return;
  if(!emPlaneOn()){cv.style.display="none";emPlaneSay(tok,"");return;}
  cv.style.display="block";
  var pos=EM_PLANE_LAST.pos,ids=EM_PLANE_LAST.ids||{};
  /* minnie65 ONLY, on purpose. UJ.emtiles keeps ONE configured source, and the tracing pad has
     already pointed it at minnie65's EM; re-pointing it here for a minnie35 point would silently
     move the pad to the other volume. A point outside the predicted volume says so instead. */
  var bb=window.MINNIE65_EM_BB,nx=pos[0]*UJ_RX,ny=pos[1]*UJ_RY,nz=pos[2]*UJ_RZ;
  if(!bb||nx<bb.xmin||nx>bb.xmax||ny<bb.ymin||ny>bb.ymax||nz<bb.zmin||nz>bb.zmax){
    cv.style.display="none";
    emPlaneSay(tok,"outside minnie65’s imagery, so there is no section to draw here");
    return;
  }
  /* A quarter second before anything is fetched. Stepping through cells renders a panel per cell,
     and without this every one of them would open six connections that the next one invalidates. */
  emPlaneSay(tok,"…");
  await new Promise(function(r){setTimeout(r,250);});
  if(EM_PLANE_TOKEN!==tok)return;
  try{
    if(!UJ.emtiles.configured())
      UJ.emtiles.configure({em:SRC.em,res:(typeof UJ.cfg!=="undefined"&&UJ.cfg)?UJ.cfg.res:[4,4,40]});
    emPlaneSay(tok,"reading the EM…");
    var view=await UJ.emtiles.drawSection(cv,{centre:pos,w:EM_PLANE_W,h:EM_PLANE_H,
      mip:EM_PLANE_MIP,zoom:1,slabOk:true,
      /* ONE WINDOW FOR EVERY EM, 2026-09-18 -- EM_WINDOW is read from EM_SHADER_CONTROLS, which is
         what this page sends Neuroglancer, so the pad, this panel and every link it writes cannot
         drift apart. See src/one_window_for_every_em.py. */
      lo:EM_WINDOW.lo,hi:EM_WINDOW.hi,
      /* TIGHTEN, because this panel reads the 64 nm level and a window chosen for full-resolution
         tissue is wider than a downsampled histogram -- which is what "pale/washed out" was. It can
         only narrow, so this view can never have LESS contrast than the plain window gave it. */
      tighten:true,
      onProgress:function(d,n){emPlaneSay(tok,"reading the EM… "+d+"/"+n);}});
    if(EM_PLANE_TOKEN!==tok)return;
    /* SHORT ENOUGH TO SIT ON THE CAPTION LINE. Every word here that wraps costs a whole row of
       the panel (see emPlaneBox's comment on why rows are expensive in this column), so the
       resolution moves to the canvas tooltip and the line keeps the two things a reader needs at
       a glance: how much tissue this is, and which colour is which. */
    /* THE COLOUR KEY LIVES IN THE TOOLTIP, NOT THE CAPTION, and that is a size decision rather
       than a taste one: "cell in magenta, nucleus in blue" wraps this line onto a second row at
       panel width, and a row here is a row of empty background beside the model (see emPlaneBox).
       It is also the one fact on this line that never changes -- a reader learns it once, and the
       pad paints the same two colours for the same two things. The scale DOES change, cell to
       cell, so the scale is what the caption keeps. */
    var across="\u00b7 "+view.umAcross.toFixed(1)+"\u00a0\u00b5m across";
    try{cv.title=view.umAcross.toFixed(1)+" \u00b5m across at "+view.nmPerPx+" nm/px, z="+view.z
      +". "+(view.slab>1
        ?"One plane of the "+view.sectionNm+" nm level, which averages "+view.slab+" of the 40 nm "
         +"sections \u2014 the tracing pad reads true single sections instead. "
        :"One 40 nm section. ")
      +"The cell\u2019s own segmentation is painted in magenta, its nucleus in blue. "
      +"Contrast "+view.lo+"\u2013"+view.hi
      +(view.tightened?" (narrowed onto this plane from the "+view.windowAsked[0]+"\u2013"
                        +view.windowAsked[1]+" Neuroglancer window, because a downsampled level\u2019s "
                        +"values do not fill it)":" \u2014 the Neuroglancer window")+".";}catch(_t){}
    if(!emPlaneSegOn()){emPlaneSay(tok,across+" \u00b7 segmentation off");return;}
    var root=String(ids.root||"").trim(),nuc=String(ids.nuc||"").trim();
    if(!root&&!nuc){emPlaneSay(tok,across+" · no IDs to paint here");return;}
    if(!UJ.segpaint){emPlaneSay(tok,across);return;}
    if(!UJ.segpaint.configured())
      UJ.segpaint.configure({seg:SRC.seg,nuc:SRC.nuc,
                             res:(typeof UJ.cfg!=="undefined"&&UJ.cfg)?UJ.cfg.res:[4,4,40]});
    emPlaneSay(tok,across+" · reading the segmentation…");
    /* EM_SEG_ALPHA, not a number here -- see src/one_window_for_every_em.py. */
    var got=await UJ.segpaint.paint(cv,view,{root:root,nuc:nuc,alpha:EM_SEG_ALPHA});
    if(EM_PLANE_TOKEN!==tok)return;
    /* "Nothing appeared" has two causes that want different answers, the same two the pad's own
       overlay spells out: the cell is not in this window, or it is not in the segmentation. */
    if(got&&got.ok&&!got.painted)
      emPlaneSay(tok,across+" · this cell is not on this plane",true);
    else emPlaneSay(tok,across);
  }catch(e){
    if(EM_PLANE_TOKEN!==tok)return;
    emPlaneSay(tok,"could not read the imagery: "+String(e&&e.message||e),true);
  }
}
/* Delegated, and wired exactly once: the box is rebuilt with every panel, so a listener attached to
   the checkbox itself would be attached again per cell and lost with it. */
function wireEmPlaneToggle(){
  if(EM_PLANE_WIRED)return;
  EM_PLANE_WIRED=true;
  document.addEventListener("change",function(e){
    var t=e.target;
    if(!t||(t.id!=="emPlaneOn"&&t.id!=="emPlaneSeg"))return;
    try{localStorage.setItem(t.id==="emPlaneSeg"?EM_PLANE_SEG_KEY:EM_PLANE_KEY,
                             t.checked?"1":"0");}catch(_e){}
    var box=document.getElementById("emPlaneBox");
    drawPanelEmPlane(box?Number(box.dataset.tok||0):EM_PLANE_TOKEN);
  });
}
wireEmPlaneToggle();
