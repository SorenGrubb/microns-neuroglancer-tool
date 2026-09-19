/* βJump page check: does the page resolve known coordinates to the known nuclei, are the shared
   core modules wired in, and — the one that is specific to this dataset — are the mesh features
   correctly DISABLED for the ~half of nuclei that have no segment?

   Run from a scratch copy (see jsdom-testing-mnt-hang): node bjumpcheck.js */
const {JSDOM,VirtualConsole}=require("jsdom"), fs=require("fs");
let html=fs.readFileSync("bjump.html","utf8"); const inl=[];
html=html.replace(/<script src="(core\/[A-Za-z0-9_.\-]+\.js)"><\/script>/g,(m,rel)=>{
  if(!fs.existsSync(rel))return m; inl.push(rel); return "<script>\n"+fs.readFileSync(rel,"utf8")+"\n</script>";});
const vc=new VirtualConsole(); const errs=[]; vc.on("jsdomError",e=>errs.push(String(e.message).slice(0,120)));
const dom=new JSDOM(html,{runScripts:"dangerously",url:"https://grubblab.com/bjump.html",
  virtualConsole:vc,pretendToBeVisual:true,
  beforeParse(w){ let s=7; w.Math.random=()=>((s=(s*1103515245+12345)&0x7fffffff)/0x7fffffff);
    w.fetch=()=>new w.Promise(()=>{}); w.open=()=>null; w.alert=()=>{};
    w.XMLHttpRequest=function(){return{open(){},setRequestHeader(){},send(){},abort(){},addEventListener(){},readyState:0,status:0,responseText:""};};}});
const w=dom.window;
const R=[]; const ok=b=>{R.push(!!b);return b?"PASS":"*** FAIL ***";};

/* SIGN IN THE WAY THE PAGE DOES.                                                    2026-09-04
   This check used to flip GOOGLE_VERIFIED by hand. That was enough while the writes tested only
   that flag; since 2026-09-03 they also require a CREDENTIAL and an unexpired one (bjumpSaveGate,
   signInMsg), so a hand-set flag now means "verified, with nothing to send" -- a state the real
   page cannot be in, and the volume save correctly refused it. Driven through the page's own
   credential handler instead, with a token shaped like Google's. */
function jwt(expSec){
  const body=Buffer.from(JSON.stringify({name:"S\u00f8ren Grubb",email:"soren@grubb.dk",exp:expSec}))
    .toString("base64").replace(/=+$/,"").replace(/\+/g,"-").replace(/\//g,"_");
  return "hdr."+body+".sig";
}
const signIn =()=>w.handleGoogleCred({credential:jwt(Math.floor(Date.now()/1000)+3600)});
const signOut=()=>w.eval("GOOGLE_VERIFIED=false;GOOGLE_CREDENTIAL=null;GOOGLE_EXP=0;");

setTimeout(async ()=>{          // async: the community read-back is awaited below
  const ev=s=>{try{return w.eval(s);}catch(e){return "ERR:"+e.message.slice(0,70);}};
  console.log("core modules inlined :",inl.join(", ")||"(none)");
  console.log("nuclei loaded        :",ok(ev("N")===220), ev("N"));
  console.log("UJ.cfg.res           :",ok(JSON.stringify(w.UJ.cfg.res)==="[8,8,30]"), JSON.stringify(w.UJ.cfg.res));
  console.log("UJ.cfg.mesh unsharded:",ok(w.UJ.cfg.mesh.unsharded===true&&/vclem-xh/.test(w.UJ.cfg.mesh.meshBase)));
  console.log("mesh key namespaced  :",ok(w.UJ.cfg.mesh.notFoundKey==="bjump_mesh_notfound_v1"));
  console.log("UJ.cfg.backend.ds    :",ok(w.UJ.cfg.backend.ds==="bjump"), w.UJ.cfg.backend.ds);
  console.log("core/mesh present    :",ok(!!(w.UJ.mesh&&w.UJ.mesh.downloadRoot)));
  console.log("core/gamify present  :",ok(typeof w.gamifyInit==="function"&&typeof w.openDashboard==="function"));
  console.log("core/ontology present:",ok(ev("typeof TREE==='object' && Object.keys(TREE).length>10")));
  console.log("strong escHtml       :",ok(ev("escHtml(String.fromCharCode(34))")==="&quot;"));
  console.log("segment source split :",ok(ev("(function(){let a=0,b=0,c=0;for(let i=0;i<N;i++){if(BSRC[i]===1)a++;else if(BSRC[i]===2)b++;else c++;}return a+'/'+b+'/'+c;})()")==="115/0/105"),
              ev("(function(){let a=0,b=0,c=0;for(let i=0;i<N;i++){if(BSRC[i]===1)a++;else if(BSRC[i]===2)b++;else c++;}return a+'/'+b+'/'+c;})()"), "(secgan16/seg32/none)");

  // ---------------------------------------------------------------- a nucleus WITH a mesh ----
  console.log("\n--- nucleus 146 @ voxel 20247,28319,507 (secgan16, segment 562193) ---");
  const r1=JSON.parse(ev("JSON.stringify(nearest(20247,28319,507))"));
  console.log("  resolves exactly    :",ok(r1.dist<1), r1.dist.toFixed(2)+" nm away");
  console.log("  nucleus id          :",ev("BID["+r1.i+"]"), ok(ev("BID["+r1.i+"]")===146));
  console.log("  segment id          :",ev("BSEG["+r1.i+"]"), ok(ev("BSEG["+r1.i+"]")===562193));
  console.log("  hasMesh             :",ok(ev("hasMesh("+r1.i+")")===true));
  console.log("  diameter            :",ev("BDIA["+r1.i+"].toFixed(2)"), ok(Math.abs(ev("BDIA["+r1.i+"]")-5.73)<0.01));
  console.log("  dist from pyramidale:",ev("BPY["+r1.i+"].toFixed(2)"), ok(Math.abs(ev("BPY["+r1.i+"]")-7.79)<0.01));
  // CD11b is this cell's standout marker; the percentile is what the panel actually shows
  console.log("  CD11b shell pct     :",ev("pct(MARKERS[0],MARKERS[0].shellArr["+r1.i+"])")+"th",
              ok(ev("pct(MARKERS[0],MARKERS[0].shellArr["+r1.i+"])")>=95));

  // Neuroglancer state
  const u=ev("viewerUrl([BX["+r1.i+"],BY["+r1.i+"],BZ["+r1.i+"]],BSEG["+r1.i+"],BSRC["+r1.i+"])");
  let st=null; try{ st=JSON.parse(decodeURIComponent(String(u).split("#!")[1])); }catch(e){}
  console.log("\n--- Neuroglancer state ---");
  console.log("  url host            :",ok(String(u).indexOf("neuroglancer-demo.appspot.com")>0));
  console.log("  dimensions          :",ok(st&&st.dimensions.x[0]===8e-9&&st.dimensions.z[0]===3e-8),
              st?[st.dimensions.x[0],st.dimensions.z[0]].join(", "):"-");
  console.log("  9 layers            :",ok(st&&st.layers.length===9), st?st.layers.length:"-");
  const segLayer=st&&st.layers.find(l=>l.name==="Segmentation (SECGAN 16nm)");
  const s32Layer=st&&st.layers.find(l=>l.name==="Segmentation (32nm)");
  console.log("  activated in SECGAN :",ok(segLayer&&segLayer.segments[0]==="562193"));
  console.log("  32nm layer empty    :",ok(s32Layer&&s32Layer.segments.length===0),
              "  <- an id is only valid in the volume it came from");
  console.log("  marker layers present:",ok(st&&["Hoechst","pTau","CD11b (microglia)","Amyloid-beta"]
              .every(n=>st.layers.some(l=>l.name===n))));

  // render
  ev("showCell("+r1.i+",null)");
  const p=w.document.getElementById("panel").innerHTML;
  const mb=w.document.getElementById("meshbtn");
  console.log("\n--- render (with mesh) ---");
  console.log("  panel rendered      :",ok(p.length>1500), p.length+" chars");
  console.log("  mesh button ENABLED :",ok(mb&&!mb.disabled));
  console.log("  3 neighbours        :",ok((p.match(/class="ntype njump"/g)||[]).length===3),
              "  <- uJump's .nrow layout since 2026-08-18, not the old inline go buttons");
  console.log("  measurement, not ID :",ok(/not a cell-type prediction/.test(p)),
              "  <- the marker panel must never read as a classification");
  console.log("  correction UI present:",ok(!!w.document.getElementById("fixcoord")
                                          &&!!w.document.getElementById("fixmove")));

  // ------------------------------------------------------------- a nucleus with NO segment ---
  console.log("\n--- nucleus 168 @ voxel 26758,36106,581 (no segment) ---");
  const r2=JSON.parse(ev("JSON.stringify(nearest(26758,36106,581))"));
  console.log("  nucleus id          :",ev("BID["+r2.i+"]"), ok(ev("BID["+r2.i+"]")===168));
  console.log("  segment id is 0     :",ok(ev("BSEG["+r2.i+"]")===0));
  console.log("  hasMesh false       :",ok(ev("hasMesh("+r2.i+")")===false));
  ev("showCell("+r2.i+",null)");
  const p2=w.document.getElementById("panel").innerHTML;
  const mb2=w.document.getElementById("meshbtn"), pb2=w.document.getElementById("pptxbtn");
  console.log("  mesh button DISABLED:",ok(mb2&&mb2.disabled&&pb2&&pb2.disabled),
              "  <- must not offer a download that can only 404");
  console.log("  explains why        :",ok(/outside the segmented sub-volume/.test(p2)));
  console.log("  'no segment' tag    :",ok(/no segment/.test(p2)));

  // ------------------------------------------------------------- guided identification ------
  console.log("\n--- guided identification (hippocampal overrides) ---");
  console.log("  q1 is CA1 strata     :",ok(/stratum pyramidale/i.test(w.UJ.ontology.TREE.q1.q+
              w.UJ.ontology.TREE.q1.opts.map(o=>o.label).join(" "))
              && !/Layer 4/.test(w.UJ.ontology.TREE.q1.opts.map(o=>o.label).join(" "))),
              "  <- cortical layers must be gone");
  console.log("  every q1 opt -> q2   :",ok(w.UJ.ontology.TREE.q1.opts.every(o=>o.next==="q2")),
              "  <- the rest of the shared tree must stay reachable");
  console.log("  CA1 pyramidal leaf   :",ok(w.UJ.ontology.TREE.ne_exc.opts[0].leaf==="ca1_pyramidal"
              && w.UJ.ontology.LEAF_NAMES.ca1_pyramidal==="CA1 pyramidal neuron"));
  console.log("  no cortical exc leaves:",ok(!w.UJ.ontology.TREE.ne_exc.opts.some(o=>/^exc_l/.test(o.leaf||""))));
  const inhSlugs=w.UJ.ontology.TREE.ne_inh.opts.map(o=>o.leaf).sort().join(",");
  console.log("  inh slugs unchanged  :",ok(inhSlugs==="inh_basket,inh_bipolar,inh_martinotti,inh_neurogliaform"),
              inhSlugs, " <- kept so cortex and hippocampus data stay comparable");
  console.log("  inh labels hippocampal:",ok(/stratum lacunosum-moleculare/.test(
              w.UJ.ontology.TREE.ne_inh.opts.map(o=>o.label).join(" "))));

  // Walk the tree with the SHARED engine (core/tree.js, stage P3 2026-08-18) rather than
  // bJump's old bespoke renderGuided(): openIdentify / chooseOption / goBack / jumpToLeaf are
  // now the same code uJump runs, driven here through real clicks on the rendered buttons.
  const box=()=>w.document.getElementById("idbox").innerHTML;
  const opts=()=>[].slice.call(w.document.getElementById("idbox").querySelectorAll(".idf-opt"));
  const clickLabel=re=>{const b=opts().filter(o=>re.test(o.textContent))[0];
    if(b)b.dispatchEvent(new w.Event("click",{bubbles:true})); return !!b;};
  ev("showCell("+r1.i+",null)");
  console.log("  renders inline in #idbox :",ok(/idf-q/.test(box())&&opts().length>0),
              opts().length+" option(s)  <- UJ.cfg.tree.panelId, not uJump's overlay");
  console.log("  no .show on an inline box:",ok(!w.document.getElementById("idbox").classList.contains("show")),
              "  <- modal:false");
  console.log("  opens at q1 (CA1 strata) :",ok(ev("ID_NODE")==="q1"&&/Stratum radiatum/.test(box())),
              String(ev("ID_NODE")));
  console.log("  leaf search box present  :",ok(!!w.document.getElementById("idfLeafInput")),
              "  <- uJump's type-ahead, rendered by the engine inside #idbox");
  console.log("  only ONE search box       :",ok(!w.document.getElementById("mainLeafInput")),
              "  <- the engine's box sits right here; a second one two lines up is clutter");
  console.log("  no false 'no X suggestion':",ok(!/suggestion on file/.test(box())),
              "  <- suggestionSource:null; this dataset has no classifier to have an opinion");
  console.log("  no dead close button      :",ok(!w.document.getElementById("idfclose")),
              "  <- modal:false, so there is nothing to close");
  console.log("  no cortical-layer question:",ok(!/cortical location/i.test(box())));
  console.log("  q2 reached               :",ok(clickLabel(/Stratum pyramidale/)&&/vasculature/.test(box())));
  console.log("  back one step offered    :",ok(!!w.document.getElementById("idfback")));
  console.log("  parenchyma -> glia       :",ok(clickLabel(/Parenchyma/)&&clickLabel(/Glia/)
              &&/heterochromatin/.test(box())));
  console.log("  leaf -> result screen    :",ok(clickLabel(/Scant dark|Microglia/)
              &&/Microglia/.test(box())&&!!w.document.getElementById("idsubmit")));
  console.log("  certainty scale rendered :",ok(!!w.document.getElementById("certScale")
              &&w.document.getElementById("certScale").children.length===5));
  console.log("  path recorded            :",ok(ev("ID_PATH.length")>=3), ev("ID_PATH.length")+" steps");
  console.log("  pathText = the questions :",ok(/vasculature/.test(w.UJ.tree.pathText())),
              JSON.stringify(w.UJ.tree.pathText().slice(0,46))+"  <- same column shape as uJump");
  w.document.getElementById("idfback").dispatchEvent(new w.Event("click",{bubbles:true}));
  console.log("  back works               :",ok(!w.document.getElementById("idsubmit")
              &&/heterochromatin/.test(box())));
  ev("showCell("+r1.i+",null)");
  ev("jumpToLeaf('microglia')");
  console.log("  fast path to a leaf      :",ok(/Microglia/.test(box())&&!!w.document.getElementById("idsubmit")),
              "  <- the 'I already know it' search route");

  // ---------------------------------------------- what actually goes on the wire -------------
  // The payload shape is the contract with Code.gs. Getting it wrong fails silently on the
  // server (an unknown d.type just falls off the end of the if/else chain), so assert it here.
  console.log("\n--- submitted payload ---");
  let sent=null;
  signIn();
  w.postReport=function(p){ sent=p; return w.Promise.resolve({ok:true}); };
  ev("showCell("+r1.i+",null)");
  clickLabel(/Stratum pyramidale/); clickLabel(/Parenchyma/); clickLabel(/Glia/);
  clickLabel(/Scant dark|Microglia/);
  w.document.getElementById("certScale").children[3].dispatchEvent(new w.Event("click",{bubbles:true}));
  w.document.getElementById("idsubmit").dispatchEvent(new w.Event("click",{bubbles:true}));
  console.log("  type                :",sent&&sent.type, ok(sent&&sent.type==="new_identification"),
              " <- Code.gs has no 'classification' branch");
  console.log("  identified          :",sent&&sent.identified, ok(sent&&sent.identified==="Microglia"));
  console.log("  coord = the voxel   :",sent&&sent.coord,
              ok(sent&&sent.coord===[ev("BX["+r1.i+"]"),ev("BY["+r1.i+"]"),ev("BZ["+r1.i+"]")].join(",")),
              " <- the anchor that survives a re-detection");
  console.log("  rootId = segment    :",sent&&sent.rootId, ok(sent&&sent.rootId===562193));
  console.log("  certainty carried   :",sent&&sent.certainty, ok(String(sent&&sent.certainty)==="4"),
              " <- read from #certScale by core/tree.js's getCertainty()");
  console.log("  path = the questions:",ok(sent&&/vasculature/.test(sent.path||"")),
              JSON.stringify(sent&&(sent.path||"").slice(0,46)));
  // certainty is required
  ev("showCell("+r1.i+",null)"); ev("jumpToLeaf('astrocyte')");
  sent=null;
  w.document.getElementById("idsubmit").dispatchEvent(new w.Event("click",{bubbles:true}));
  console.log("  refuses w/o certainty:",ok(sent===null),
              w.document.getElementById("idmsg") ? w.document.getElementById("idmsg").textContent : "");

  // corrections
  ev("showCell("+r1.i+",null)");
  w.postReport=function(p){ sent=p; return w.Promise.resolve({ok:true}); };
  w.document.getElementById("fixcoord").value="1,2,3";
  w.document.getElementById("fixmove").click();
  console.log("  move -> new type    :",sent&&sent.type, ok(sent&&sent.type==="nucleus_position_fix"&&sent.newCoord==="1,2,3"));

  /* "Add a missed nucleus" (2026-08-18, bjump-spec §6's last outstanding action) -- unlike
     Move/Merged/Split above, this must NOT carry the current cell's own nucleusId/rootId: a
     missed nucleus by definition has no detection of its own. */
  sent=null;
  w.document.getElementById("newnuccoord").value="9,8,7";
  w.document.getElementById("newnuccomment").value="looks like a small glial nucleus";
  w.document.getElementById("fixnew").click();
  console.log("  add-missed -> type  :",sent&&sent.type, ok(sent&&sent.type==="new_cell_no_nucleus"),
              " <- existing Code.gs type, no backend change");
  console.log("  add-missed carries coord:",sent&&sent.coord, ok(sent&&sent.coord==="9,8,7"));
  console.log("  add-missed carries comment:",sent&&sent.comment, ok(sent&&sent.comment==="looks like a small glial nucleus"));
  console.log("  add-missed has NO nucleusId:",ok(sent&&sent.nucleusId===undefined),
              " <- must not silently key to the cell on screen");
  await new Promise(r=>setTimeout(r,80));   // clearing the inputs happens in postReport()'s .then()
  console.log("  add-missed clears inputs on success:",
              ok(w.document.getElementById("newnuccoord").value===""&&w.document.getElementById("newnuccomment").value===""));

  sent=null;
  signOut();
  w.document.getElementById("newnuccoord").value="9,8,7";
  w.document.getElementById("fixnew").click();
  console.log("  add-missed gated by sign-in:",ok(sent===null),
              w.document.getElementById("fixnewmsg").textContent);
  signIn();

  sent=null;
  w.document.getElementById("newnuccoord").value="12 34";
  w.document.getElementById("fixnew").click();
  console.log("  add-missed validates 3 numbers:",ok(sent===null),
              w.document.getElementById("fixnewmsg").textContent);

  /* "Not a nucleus" and "Actually several nuclei" are core/report.js's forms as of 2026-08-18,
     not one-click posts: a false-positive claim other people have to weigh needs a stated
     reason. Both take over #idbox (the guided-ID panel) and hand it back on return. */
  sent=null; w.document.getElementById("fixsplit").click();
  const idbox=()=>w.document.getElementById("idbox").innerHTML;
  console.log("  reject -> a form    :",ok(/not a nucleus/i.test(idbox())
              && !!w.document.getElementById("nnSubmit") && sent===null),
              " <- asks for a reason instead of posting a bare vote");
  w.document.getElementById("nnSubmit").dispatchEvent(new w.Event("click",{bubbles:true}));
  await new Promise(r=>setTimeout(r,80));
  console.log("  reject -> existing  :",sent&&sent.type, ok(sent&&sent.type==="not_a_nucleus"),
              " <- already in Code.gs, no backend change");
  console.log("  reject carries coord:",ok(sent&&sent.coord===[ev("BX["+r1.i+"]"),ev("BY["+r1.i+"]"),
              ev("BZ["+r1.i+"]")].join(",")), sent&&sent.coord);
  ev("showCell("+r1.i+",null)");
  sent=null; w.document.getElementById("fixmerged").click();
  console.log("  merge -> a form     :",ok(/merged/i.test(idbox())
              && !!w.document.getElementById("mergedSubmit")),
              w.document.querySelectorAll(".merged-row").length+" sub-row(s)  <- bjump-spec §6 'Merge', shared with uJump");
  const rws=[].slice.call(w.document.querySelectorAll(".merged-row"));
  rws.forEach(function(rw,k){
    const x=rw.querySelector(".mrx"),y=rw.querySelector(".mry"),z=rw.querySelector(".mrz");
    if(x)x.value=String(100+k); if(y)y.value=String(200+k); if(z)z.value=String(300+k);
  });
  const posts=[]; w.postReport=function(p){ posts.push(p); return w.Promise.resolve({ok:true}); };
  w.document.getElementById("mergedSubmit").dispatchEvent(new w.Event("click",{bubbles:true}));
  await new Promise(r=>setTimeout(r,80));
  const ms=posts.filter(p=>p.type==="merged_split");
  console.log("  merge posts merged_split:",ok(ms.length>1), ms.length+" row(s)");
  console.log("  rows share a groupId:",ok(ms.length>1 && new Set(ms.map(p=>p.groupId)).size===1));
  w.postReport=function(p){ sent=p; return w.Promise.resolve({ok:true}); };

  // ------------------------------------------------------------------ compute volume --------
  console.log("\n--- compute volume ---");
  ev("showCell("+r1.i+",null)");
  const vb=w.document.getElementById("volbtn");
  console.log("  button present, enabled  :",ok(vb&&!vb.disabled));
  let volPost=null;
  w.postReport=function(p){ volPost=p; return w.Promise.resolve({ok:true}); };
  signIn();
  w.UJ.mesh.computeVolume=function(id,prog){ prog&&prog(0.5,"x");
    return w.Promise.resolve({volumeUm3:1234.5,vertices:9876,fragmentCount:3}); };
  vb.click();
  await new Promise(r=>setTimeout(r,80));
  const vmsg=w.document.getElementById("meshmsg").innerHTML;
  console.log("  reports the cell volume  :",ok(/1234\.5/.test(vmsg)));
  const nucv=w.eval("BVOL["+r1.i+"].toFixed(1)");
  console.log("  distinguishes nucleus vol:",ok(vmsg.indexOf("nucleus "+nucv)>=0&&/% of the cell/.test(vmsg)),
              "  <- BVOL is the nucleus, computeVolume is the whole cell");
  console.log("  saves via existing type  :",ok(volPost&&volPost.type==="save_computed_volume"),
              volPost?volPost.type:"(no post)");
  const nucRounded=w.eval("Math.round(BVOL["+r1.i+"]*100)/100");
  console.log("  carries BOTH volumes     :",ok(volPost&&volPost.volumeUm3===1234.5&&volPost.nucVolumeUm3===nucRounded),
              volPost?("cell "+volPost.volumeUm3+", nuc "+volPost.nucVolumeUm3):"");
  ev("showCell("+r2.i+",null)");
  console.log("  disabled without a mesh  :",ok(w.document.getElementById("volbtn").disabled));

  // ------------------------------------------------- community read-back + certainty ---------
  // The identification block, the vote pills and the audit trail are core/panel.js as of
  // 2026-08-18 -- shared verbatim with uJump. What is asserted here is the WIRING: that bJump's
  // panel exposes the DOM ids that module writes into, that every read it makes carries
  // ds=bjump (without which the shared backend serves uJump's spreadsheet), and that the
  // headline override reaches bJump's own celltypeLink so a named cell stays a Neuroglancer
  // link. The module's own rendering is covered by refactor-tests/panelcheck.js.
  console.log("\n--- community read-back (core/panel.js) ---");
  const asked=[];
  w.fetch=function(u){
    asked.push(String(u));
    let body={};
    if(/nucleusId=/.test(u))
      body={reports:[{identified:"Microglia",comment:"Microglia hugging amyloid beta plaque",
                      certainty:5,reporterName:"S\u00f8ren",timestamp:"2026-08-18T12:50:00Z"},
                     {identified:"Microglia",certainty:4,reporterName:"Someone else",
                      timestamp:"2026-08-18T13:10:00Z"}],
            mergedGroups:[],notNucleusReports:[],
            organelleGroups:[{structures:[{kind:"centriole",pointA:"20247,28319,507"}]}]};
    else if(/classificationHistory=/.test(u))
      body={history:[{previousIdentity:"",newIdentity:"Microglia",sourceType:"community",
                      reporterName:"S\u00f8ren",certainty:5,timestamp:"2026-08-18T12:50:00Z"}]};
    else if(/annotationHistory=/.test(u))
      body={annotations:[{type:"new_identification",identified:"Microglia",reporterName:"S\u00f8ren",
                          status:"recorded",timestamp:"2026-08-18T12:50:00Z"}]};
    else if(/identityVotes=/.test(u)) body={identityVotes:[{identity:"Microglia",up:1,down:0,net:1}]};
    else body={ok:true,fixes:[],minVotes:2,tolVox:250};
    return w.Promise.resolve({json:()=>w.Promise.resolve(body)});
  };
  ev("FIXES_RESP=null; FIXES_FETCH=null; FIXES_BY_NUCID=null; showCell("+r1.i+",null)");
  await new Promise(r=>setTimeout(r,200));
  const cbox=w.document.getElementById("commReports");
  console.log("  panel.js DOM ids present :",ok(!!cbox
              && !!w.document.getElementById("classHistoryPanel")
              && !!w.document.getElementById("idVotePanel")
              && !!w.document.getElementById("ctHeadline")
              && !!w.document.getElementById("ctTag")));
  console.log("  every read carries ds     :",ok(asked.length>=4 && asked.every(u=>/ds=bjump/.test(u))),
              asked.length+" request(s)");
  console.log("  reads the 4 shared endpts :",ok(["nucleusId=","classificationHistory=",
              "annotationHistory=","identityVotes="].every(k=>asked.some(u=>u.indexOf(k)>=0))));
  console.log("  still asks ?bjumpFixes    :",ok(asked.some(u=>/bjumpFixes=1/.test(u))),
              "  <- position correction stays bJump's own");
  console.log("  light-blue consensus block:",ok(cbox&&/Community name:\s*<b>Microglia<\/b>/.test(cbox.innerHTML)),
              "  <- shown as soon as one person reports");
  console.log("  credits the first proposer:",ok(cbox&&/first proposed by S\u00f8ren/.test(cbox.innerHTML)));
  console.log("  counts both reports       :",ok(cbox&&/2 users/.test(cbox.innerHTML)));
  /* The row used to read "Centriole at (x, y, z)" as one sentence. Since 2026-09-19 it is columns
     -- what it is, how big, where -- behind a fold; see src/the_organelle_locations_fold_up.py.
     What matters here is unchanged: bJump shows the organelle and offers a way to go and see it. */
  console.log("  organelle row + Jump      :",ok(cbox&&/>Centriole</.test(cbox.innerHTML)
              &&/20247, 28319, 507/.test(cbox.innerHTML)
              &&/class="jumpview"/.test(cbox.innerHTML)));
  console.log("  organelle report entry    :",ok(cbox&&/commOrganelleToggle/.test(cbox.innerHTML)),
              "  <- the way in to reporting one");
  const hd=w.document.getElementById("ctHeadline");
  console.log("  headline becomes the type :",ok(hd&&/Microglia/.test(hd.textContent)),
              hd?JSON.stringify(hd.textContent.slice(0,44)):"(none)");
  console.log("  headline stays a viewer link:",ok(hd&&/<a [^>]*href="[^"]*neuroglancer/i.test(hd.innerHTML)),
              "  <- bJump's celltypeLink hook, not uJump's cell-type page");
  console.log("  tag says 'community'      :",ok(w.document.getElementById("ctTag").textContent
              ==="community identification"));
  console.log("  stratum tag survives      :",ok(/stratum|pyramidale|\u00b5m/i.test(
              w.document.getElementById("ctTag").parentElement.textContent)),
              "  <- panel.js overwrites #ctTag, so the anatomy label has its own");
  console.log("  PPTX title follows suit   :",ok(ev("cellLabel(CUR_IDX)")==="Microglia"),
              "  <- reads window.CUR_CELLTYPE_DISPLAY, so it can never disagree with the headline");
  const chp=w.document.getElementById("classHistoryPanel");
  console.log("  audit trail rendered      :",ok(chp&&/Cell history \(2\)/.test(chp.innerHTML)),
              "  <- change log + raw report log, merged");
  const ivp=w.document.getElementById("idVotePanel");
  console.log("  agree/disagree pills      :",ok(ivp&&/class="idbtn idvote"/.test(ivp.innerHTML)));
  const fx=w.document.getElementById("fixstatus");
  console.log("  explains the 2-vote rule  :",ok(fx&&/<b>2 different people<\/b>/.test(fx.innerHTML)),
              "  <- the bold wraps the whole phrase, not just the number");

  console.log("\n--- neighbours and jump ---");
  console.log("  3 neighbour rows          :",ok(w.document.querySelectorAll(".neigh .nrow").length===3),
              w.document.querySelectorAll(".neigh .nrow").length+" row(s)");
  const nr=w.document.querySelector(".neigh .nrow");
  console.log("  dot + name + distance     :",ok(nr&&nr.querySelector(".dot")&&/\u00b5m/.test(nr.textContent)
              &&/voxel \(/.test(nr.textContent)));
  console.log("  neighbour row navigates   :",(function(){
    const before=ev("CUR_IDX"); w.document.querySelector(".neigh .njump").dispatchEvent(new w.Event("click",{bubbles:true}));
    const after=ev("CUR_IDX"); return ok(after!==before)+"  "+before+" -> "+after; })());
  ev("FIXES_RESP=null; FIXES_FETCH=null; FIXES_BY_NUCID=null; showCell("+r1.i+",null)");
  console.log("  jump-to-this-nucleus btn  :",ok(!!w.document.getElementById("jumphere")));
  console.log("  guided ID uses .idcta     :",ok(!!w.document.querySelector(".idcta #idbox")),
              "  <- same call-to-action framing as uJump");

  // empty case
  w.fetch=function(u){ return w.Promise.resolve({json:()=>w.Promise.resolve(
    /nucleusId=/.test(u)?{reports:[],mergedGroups:[],notNucleusReports:[],organelleGroups:[]}
    :(/History=|identityVotes=/.test(u)?{}:{ok:true,fixes:[],minVotes:2}))}); };
  ev("FIXES_RESP=null; FIXES_FETCH=null; FIXES_BY_NUCID=null; showCell("+r2.i+",null)");
  await new Promise(r=>setTimeout(r,200));
  console.log("  no reports -> quiet panel :",ok(w.document.getElementById("commReports").innerHTML.indexOf("Community name")<0),
              "  <- panel.js returns early rather than inventing a consensus");
  console.log("  headline stays the nucleus:",ok(/Nucleus /.test(w.document.getElementById("ctHeadline").textContent)),
              JSON.stringify(w.document.getElementById("ctHeadline").textContent.slice(0,44)));

  console.log("\n--- certainty control ---");
  ev("showCell("+r1.i+",null); jumpToLeaf('microglia')");
  const cscale=w.document.getElementById("certScale");
  cscale.children[3].click();
  console.log("  click marks the button    :",ok(cscale.children[3].classList.contains("sel")),
              "  <- uJump's CSS styles .cert-opt.sel, not .on");
  console.log("  only one stays marked     :",ok([].filter.call(cscale.children,
              c=>c.classList.contains("sel")).length===1));
  cscale.children[0].click();
  console.log("  re-clicking moves it      :",ok(cscale.children[0].classList.contains("sel")
              && !cscale.children[3].classList.contains("sel")));
  console.log("  getCertainty reads it     :",ok(ev("getCertainty()")==="1"), String(ev("getCertainty()")),
              "  <- core/tree.js queries #certScale .cert-opt.sel");

  // -------------------------------------------------------------------- sign-in -------------
  // Missed on the first build: bjump_config.js still had hjump's REPLACE_WITH_ placeholders, and
  // bjump_logic.js's last line skips gamifyInit() when the client id starts with "REPLACE" — so
  // the page silently had NO Google button and nothing failed. Assert the absence of the
  // placeholder, not just the presence of the module.
  console.log("\n--- sign-in ---");
  const raw=fs.readFileSync("bjump.html","utf8");
  console.log("  no REPLACE_ leftovers:",ok(!/REPLACE_WITH_/.test(raw)),
              (raw.match(/REPLACE_WITH_[A-Z_]*/g)||[]).join(",")||"clean");
  console.log("  endpoint is the live one:",ok(/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/
              .test(w.UJ.cfg.backend.endpoint)));
  console.log("  clientId looks real  :",ok(/\.apps\.googleusercontent\.com$/.test(w.UJ.cfg.backend.clientId)));
  console.log("  REPORT_ENDPOINT wired:",ok(ev("REPORT_ENDPOINT")===w.UJ.cfg.backend.endpoint));
  console.log("  gamifyInit ran       :",ok(!!ev("typeof GAMIFY_READY!=='undefined' || document.getElementById('gameChipSlot').innerHTML.length>0")),
              "slot has "+ev("document.getElementById('gameChipSlot').innerHTML.length")+" chars");
  console.log("  gameChipSlot present :",ok(!!w.document.getElementById("gameChipSlot")));

  // -------------------------------------------------------------------- theme + chrome ------
  console.log("\n--- chrome ---");
  const accent=w.getComputedStyle(w.document.documentElement).getPropertyValue("--accent").trim();
  console.log("  red accent          :",ok(accent==="#ff6b81"), accent||"(jsdom reported none)");
  console.log("  beta logo           :",ok(/<span class="mu">β<\/span>/.test(html)
                                         ||/&beta;/.test(fs.readFileSync("bjump.html","utf8"))));
  console.log("  theme toggle        :",ok(typeof w.toggleTheme==="function"));
  console.log("  name is the NG link :",ok(/target="_blank"[^>]*>Nucleus /.test(p)||/>Nucleus \d+ /.test(p)));

  // ---------------------------------------------------------- Filter and show (2026-08-18) ---
  console.log("\n--- Filter and show / step-through ---");
  console.log("  tab bar present      :",ok(!!w.document.getElementById("mainTabs")));
  console.log("  filter tabpanel exists:",ok(!!w.document.querySelector('.tabpanel[data-tabpanel="filter"]')));
  console.log("  core/stepthrough.js present:",ok(inl.includes("core/stepthrough.js")));
  console.log("  UJ.cfg.tabs uses OWN key:",ok(w.UJ.cfg.tabs&&w.UJ.cfg.tabs.lsKey==="bjump_active_tab"),
              w.UJ.cfg.tabs&&w.UJ.cfg.tabs.lsKey);
  console.log("  UJ.cfg.stepthrough uses OWN key:",ok(w.UJ.cfg.stepthrough&&w.UJ.cfg.stepthrough.lsKey==="bjump_stepthrough_v1"),
              w.UJ.cfg.stepthrough&&w.UJ.cfg.stepthrough.lsKey);

  // Click the Filter tab and confirm it actually switches (not just that the button exists).
  const filterBtn=[...w.document.querySelectorAll(".tabbtn[data-tab]")].find(b=>b.dataset.tab==="filter");
  filterBtn.dispatchEvent(new w.Event("click",{bubbles:true}));
  await new Promise(r=>setTimeout(r,10));
  console.log("  clicking Filter tab activates it:",ok(w.document.querySelector('.tabpanel[data-tabpanel="filter"]').classList.contains("active")));
  console.log("  ...and deactivates Jump:",ok(!w.document.querySelector('.tabpanel[data-tabpanel="jump"]').classList.contains("active")));

  // Marker filter <select>s were injected (3 markers: mg/tau/ab).
  const markerSelects=w.document.querySelectorAll(".fmarker");
  console.log("  3 marker filter selects injected:",ok(markerSelects.length===3), markerSelects.length);

  // Run an UNFILTERED preview -- should match all 220 nuclei, wire the step-through card.
  w.document.getElementById("filterRun").dispatchEvent(new w.Event("click",{bubbles:true}));
  await new Promise(r=>setTimeout(r,10));
  console.log("  unfiltered preview matches all 220:",ok(/220 matching /.test(w.document.getElementById("filterStatus").textContent)),
              w.document.getElementById("filterStatus").textContent);
  console.log("  download button enabled after preview:",ok(w.document.getElementById("filterDownload").disabled===false));
  console.log("  step-through card visible:",ok(w.document.getElementById("stepThroughCard").style.display===""));
  console.log("  step counter shows 1 of 220:",ok(/Cell 1 of 220/.test(w.document.getElementById("stepCounter").textContent)),
              w.document.getElementById("stepCounter").textContent);

  // Filter to mesh-only (115 of 220, per the segment_source_split check above) and re-preview.
  const meshSel=w.document.getElementById("fMesh"); meshSel.value="yes";
  meshSel.dispatchEvent(new w.Event("change",{bubbles:true}));
  await new Promise(r=>setTimeout(r,10));
  console.log("  changing a filter invalidates the preview:",ok(w.document.getElementById("filterDownload").disabled===true));
  w.document.getElementById("filterRun").dispatchEvent(new w.Event("click",{bubbles:true}));
  await new Promise(r=>setTimeout(r,10));
  console.log("  mesh-only filter matches 115:",ok(/115 matching/.test(w.document.getElementById("filterStatus").textContent)),
              w.document.getElementById("filterStatus").textContent);

  // Step Next twice, confirm the Jump-tab panel actually moved (via showCell -> #panel content).
  const panelBefore=w.document.getElementById("panel").innerHTML;
  w.document.getElementById("stepNext").dispatchEvent(new w.Event("click",{bubbles:true}));
  await new Promise(r=>setTimeout(r,10));
  const panelAfter=w.document.getElementById("panel").innerHTML;
  console.log("  Next actually navigates the Jump panel:",ok(panelAfter!==panelBefore&&panelAfter.length>0));
  console.log("  counter advanced to 2 of 115:",ok(/Cell 2 of 115/.test(w.document.getElementById("stepCounter").textContent)),
              w.document.getElementById("stepCounter").textContent);

  // --------------------------------------------- identity filter dimension (2026-08-19) -------
  // Unlike every other Filter-and-show dimension, this one reads the Master cell list live
  // (bjumpIdentities, BJumpPosition.gs) rather than the embedded arrays -- so it needs its own
  // fetch mock and its own reset of the module-level cache (same pattern the community
  // read-back section above uses for FIXES_CACHE).
  console.log("\n--- identity filter (Master cell list, 2026-08-19) ---");
  // Undo the mesh-only filter set earlier in the suite (fMesh="yes") so these counts are against
  // all 220, not the 115-nucleus mesh subset.
  const meshReset=w.document.getElementById("fMesh"); if(meshReset)meshReset.value="";
  ev("IDENTITY_BY_NID=null; IDENTITY_FETCH=null;");
  const identReqs=[];
  w.fetch=function(u){
    identReqs.push(String(u));
    // nucleus 1 -> Microglia, nucleus 2 -> Astrocyte, everyone else unclassified (blank).
    return w.Promise.resolve({json:()=>w.Promise.resolve({ok:true,identities:[
      {nucleusId:1,current:"Microglia",community:"Microglia",source:"community"},
      {nucleusId:2,current:"Astrocyte",community:"Astrocyte",source:"community"}
    ]})});
  };
  ev("window.__bjumpBuildIdentityDropdown()");
  await new Promise(r=>setTimeout(r,80));
  console.log("  identity fetch carries ds :",ok(identReqs.some(u=>/bjumpIdentities=1/.test(u)&&/ds=bjump/.test(u))),
              identReqs[0]||"(no request)");
  console.log("  cache populated from fetch:",ok(ev("IDENTITY_BY_NID[1]&&IDENTITY_BY_NID[1].current")==="Microglia"
              && ev("IDENTITY_BY_NID[2]&&IDENTITY_BY_NID[2].current")==="Astrocyte"));
  console.log("  bjumpIdentityOf reads it  :",ok(ev("(function(){for(let i=0;i<N;i++)if(BID[i]===1)return bjumpIdentityOf(i);})()")==="Microglia"),
              " <- keyed by BID (nucleus_id), not array index");
  console.log("  blank reads as unclassified:",ok(ev("(function(){for(let i=0;i<N;i++)if(BID[i]===3)return bjumpIdentityOf(i)===\"\";})()")===true));

  // The dropdown is only built once fetchBjumpIdentities() resolves -- it already has by now.
  const identSel=w.document.getElementById("fIdentity");
  console.log("  identity <select> built   :",ok(!!identSel));
  const identOpts=identSel?[...identSel.options].map(o=>o.value):[];
  console.log("  has (any)/unclassified/named:",ok(identOpts.includes("")&&identOpts.includes("__unclassified__")
              &&identOpts.includes("Microglia")&&identOpts.includes("Astrocyte")), identOpts.join(", "));
  const unclassOpt=identSel&&[...identSel.options].find(o=>o.value==="__unclassified__");
  console.log("  unclassified count is 218 :",ok(unclassOpt&&/\(218\)/.test(unclassOpt.textContent)),
              unclassOpt&&unclassOpt.textContent);

  // Filter down to Microglia only -- exactly 1 of 220 in this mock.
  identSel.value="Microglia";
  identSel.dispatchEvent(new w.Event("change",{bubbles:true}));
  await new Promise(r=>setTimeout(r,10));
  console.log("  selecting identity invalidates preview:",ok(w.document.getElementById("filterDownload").disabled===true));
  w.document.getElementById("filterRun").dispatchEvent(new w.Event("click",{bubbles:true}));
  await new Promise(r=>setTimeout(r,10));
  console.log("  identity filter -> Microglia only:",ok(/1 matching nucleus/.test(w.document.getElementById("filterStatus").textContent)),
              w.document.getElementById("filterStatus").textContent);

  // Unclassified sentinel: everyone except nucleus 1 and 2 -> 218 of 220.
  identSel.value="__unclassified__";
  identSel.dispatchEvent(new w.Event("change",{bubbles:true}));
  w.document.getElementById("filterRun").dispatchEvent(new w.Event("click",{bubbles:true}));
  await new Promise(r=>setTimeout(r,10));
  console.log("  identity filter -> unclassified: ",ok(/218 matching/.test(w.document.getElementById("filterStatus").textContent)),
              w.document.getElementById("filterStatus").textContent);

  // Excel export column exists and carries the identity per row (spot-check via buildColumnsBjump).
  const idColOk=ev("(function(){const cols=buildColumnsBjump();const c=cols.find(c=>c.header===\"current_community_identity\");"
    +"if(!c)return \"no column\";const row={row:{i:(function(){for(let i=0;i<N;i++)if(BID[i]===1)return i;})()}};return c.get(row);})()");
  console.log("  Excel export has identity col:",ok(idColOk==="Microglia"), idColOk);

  // Reset back to "not filtering" so it doesn't leak into anything after this block.
  identSel.value=""; identSel.dispatchEvent(new w.Event("change",{bubbles:true}));

  // ------------------------- corrections flow into Master cell list + Excel export (2026-08-19) -
  console.log("\n--- corrections in Filter-and-show export (bjump-spec §12, 2026-08-19) ---");
  ev("FIXES_RESP=null; FIXES_FETCH=null; FIXES_BY_NUCID=null;");
  const fixReqs=[];
  w.fetch=function(u){
    fixReqs.push(String(u));
    // nucleus 1 (BID===1) has a 3-vote consensus correction; nucleus 2 has none.
    return w.Promise.resolve({json:()=>w.Promise.resolve({ok:true,minVotes:2,tolVox:250,fixes:[
      {nucleusId:1,from:"1,2,3",to:"11,22,33",votes:3}
    ]})});
  };
  ev("fetchBjumpFixes()");
  await new Promise(r=>setTimeout(r,80));
  console.log("  fixes fetch carries ds    :",ok(fixReqs.some(u=>/bjumpFixes=1/.test(u)&&/ds=bjump/.test(u))),
              fixReqs[0]||"(no request)");
  console.log("  FIXES_RESP cached         :",ok(ev("FIXES_RESP&&FIXES_RESP.ok===true")===true));
  const corrOk=ev("(function(){for(let i=0;i<N;i++)if(BID[i]===1){const f=bjumpCorrectedPositionOf(i);return f&&f.to===\"11,22,33\"&&f.votes===3;}})()");
  console.log("  bjumpCorrectedPositionOf(nuc 1):",ok(corrOk===true));
  const noneOk=ev("(function(){for(let i=0;i<N;i++)if(BID[i]===2)return bjumpCorrectedPositionOf(i)===null;})()");
  console.log("  bjumpCorrectedPositionOf(nuc 2, no fix):",ok(noneOk===true));

  const exportCols=ev("(function(){const cols=buildColumnsBjump();"
    +"const idx1=(function(){for(let i=0;i<N;i++)if(BID[i]===1)return i;})();"
    +"const idx2=(function(){for(let i=0;i<N;i++)if(BID[i]===2)return i;})();"
    +"const voxCol=cols.find(c=>c.header===\"corrected_voxel\");"
    +"const votesCol=cols.find(c=>c.header===\"correction_votes\");"
    +"return JSON.stringify({hasCols:!!voxCol&&!!votesCol,"
    +"nuc1Vox:voxCol.get({row:{i:idx1}}),nuc1Votes:votesCol.get({row:{i:idx1}}),"
    +"nuc2Vox:voxCol.get({row:{i:idx2}}),nuc2Votes:votesCol.get({row:{i:idx2}})});})()");
  const ec=JSON.parse(exportCols);
  console.log("  Excel export has corrected_voxel/correction_votes cols:",ok(ec.hasCols));
  console.log("  nucleus 1 (has consensus) exports 11,22,33 / 3:",ok(ec.nuc1Vox==="11,22,33"&&ec.nuc1Votes===3),
              JSON.stringify(ec));
  console.log("  nucleus 2 (no consensus) exports blank        :",ok(ec.nuc2Vox===""&&ec.nuc2Votes===""),
              JSON.stringify(ec));

  // ------------------------------------- proposed root IDs reach Neuroglancer (2026-09-09) --
  // Søren: "when I propose new root IDs it does not add them to the neuroglancer mesh. Please
  // remember they should be the same color as the original one." Proposals fed the mesh, the
  // PowerPoint and the volume since 2026-08-19 and no viewer state at all.
  console.log("\n--- community-proposed root IDs in the viewer states ---");
  const stateOf=(url)=>{try{return JSON.parse(decodeURIComponent(String(url).split("#!")[1]));}
                        catch(e){return null;}};
  const segOf=(s,name)=>s&&s.layers.find(l=>l.name===name);
  // nucleus 146, segment 562193, on screen -- the proposals global is only ever this cell's
  ev("showCell("+r1.i+",null)");
  const clean=stateOf(ev("viewerUrl([BX["+r1.i+"],BY["+r1.i+"],BZ["+r1.i+"]],BSEG["+r1.i+"],BSRC["+r1.i+"],bjumpCellSegIds("+r1.i+",BSEG["+r1.i+"]))"));
  const cleanSeg=segOf(clean,"Segmentation (SECGAN 16nm)");
  console.log("  no proposals: one segment  :",ok(cleanSeg&&cleanSeg.segments.length===1
                                                &&cleanSeg.segments[0]==="562193"));
  console.log("  ...and NO pinned colour    :",ok(cleanSeg&&!cleanSeg.segmentColors),
              "  <- a cell without proposals keeps Neuroglancer's own colour");
  // one qualifying proposal, one from another volume that must be ignored
  ev("CUR_EXTRA_ROOTS=[{id:'999888777',segType:'secgan16'},{id:'12345',segType:'img35'}];");
  const ids=JSON.parse(ev("JSON.stringify(bjumpCellSegIds("+r1.i+",BSEG["+r1.i+"]))"));
  console.log("  bjumpCellSegIds: main first :",ok(ids.length===2&&ids[0]==="562193"
                                                 &&ids[1]==="999888777"), JSON.stringify(ids));
  const withProp=stateOf(ev("viewerUrl([BX["+r1.i+"],BY["+r1.i+"],BZ["+r1.i+"]],BSEG["+r1.i+"],BSRC["+r1.i+"],bjumpCellSegIds("+r1.i+",BSEG["+r1.i+"]))"));
  const wpSeg=segOf(withProp,"Segmentation (SECGAN 16nm)");
  console.log("  the proposal is SELECTED   :",ok(wpSeg&&wpSeg.segments.indexOf("999888777")>=0),
              wpSeg?JSON.stringify(wpSeg.segments):"-");
  console.log("  ...in the SAME colour      :",ok(wpSeg&&wpSeg.segmentColors
                                                &&wpSeg.segmentColors["562193"]==="#ff3b3b"
                                                &&wpSeg.segmentColors["999888777"]==="#ff3b3b"),
              wpSeg?JSON.stringify(wpSeg.segmentColors):"-");
  console.log("  another volume's id ignored:",ok(wpSeg&&wpSeg.segments.indexOf("12345")<0),
              "  <- img35 is a different segmentation, so a different cell");
  // the headline link is written before the fetch resolves, and rewritten when it lands
  const hrefBefore=(w.document.querySelector("#ctHeadline a")||{}).href||"";
  ev("bjumpRefreshViewerLinks()");
  const hrefAfter=(w.document.querySelector("#ctHeadline a")||{}).href||"";
  console.log("  headline link refreshed    :",ok(hrefBefore.indexOf("999888777")<0
                                                &&hrefAfter.indexOf("999888777")>0),
              "  <- showCell renders before loadBjumpRootIdPanel resolves");
  // the click-time viewers read the global when the button is pressed
  const cc=JSON.parse(ev("JSON.stringify(buildBjumpCellContactsAllViewerState("+r1.i+",'562193','Microglia',[]))"));
  const ccLayer=cc.layers.find(l=>l.name==="Microglia");
  console.log("  Cell contacts viewer too   :",ok(ccLayer&&ccLayer.segments.indexOf("999888777")>=0
                                                &&ccLayer.segmentColors["999888777"]==="#ff3b3b"),
              ccLayer?JSON.stringify(ccLayer.segments):"-");
  const sy=JSON.parse(ev("JSON.stringify(buildBjumpSynapseAllViewerState("+r1.i+",'562193','Microglia',[]))"));
  const syLayer=sy.layers.find(l=>l.name==="Microglia");
  console.log("  Synapse viewer too         :",ok(syLayer&&syLayer.segments.indexOf("999888777")>=0
                                                &&syLayer.segmentColors["999888777"]==="#ff3b3b"));
  // a nucleus with NO segment of its own: the proposal is the only thing there is to show
  ev("showCell("+r2.i+",null); CUR_EXTRA_ROOTS=[{id:'777666555',segType:'secgan16'}];");
  const orphan=stateOf(ev("viewerUrl([BX["+r2.i+"],BY["+r2.i+"],BZ["+r2.i+"]],BSEG["+r2.i+"],BSRC["+r2.i+"],bjumpCellSegIds("+r2.i+",BSEG["+r2.i+"]))"));
  const orSeg=segOf(orphan,"Segmentation (SECGAN 16nm)");
  console.log("  no segment of its own      :",ok(orSeg&&orSeg.segments.length===1
                                                &&orSeg.segments[0]==="777666555"),
              orSeg?JSON.stringify(orSeg.segments):"-",
              "  <- opened with nothing selected before this");
  // and another cell's proposals are never borrowed
  const other=JSON.parse(ev("JSON.stringify(bjumpCellSegIds("+r1.i+",BSEG["+r1.i+"]))"));
  console.log("  only the on-screen cell's  :",ok(other.length===1&&other[0]==="562193"),
              JSON.stringify(other));
  ev("CUR_EXTRA_ROOTS=[];");

  console.log("\nload errors           :",errs.length); errs.slice(0,4).forEach(e=>console.log("   ",e));
  const bad=R.filter(x=>!x).length;
  console.log("\nRESULT: "+(bad?bad+" of "+R.length+" FAILED":"ALL "+R.length+" CHECKS PASSED"));
  process.exit(bad?1:0);
},4000);
