// Google Apps Script backend for microns_neuroglancer_jump.html
// Regenerated from the embedded reference copy inside the HTML file's REPORT_ENDPOINT comment
// block -- keep both in sync. To deploy: paste this into your Apps Script project (bound to the
// Google Sheet you want reports written to), then Deploy > Manage deployments > edit the existing
// deployment > New version > Deploy.
//
// Sheets used (auto-created on first submission of each type): "Discrepancies",
// "New identifications", "Confirmations", "Merged splits", "Organelle locations",
// "Not a nucleus", "New cells (no nucleus)", "Computed volumes", "Master cell list",
// "Connectivity samples".
//
// "Master cell list" (added 2026-08-02): Søren's request -- "a list of all the cells in the
// entire dataset, which is updated/corrected as we go... separate from the MICrONS classifier -
// discrepancy reports." Unlike every sheet above (an append-only EVENT log -- one row per report,
// history preserved forever), this is a derived, one-row-per-CELL CURRENT-STATE table: every main
// nucleus (144,118), standalone point (6,013 minus 26 exact source-data duplicates Søren may want
// to clean up), and merged-nucleus sub-cell (386) in the whole dataset, ~150,491 rows total. It is
// NOT maintained by this script from scratch -- Søren seeds it once by importing a CSV built by
// build_master_cell_list.py (reads ujump.html's embedded static arrays the same way
// precompute_dashboard.py/extract_lists.py do), then this script keeps each MAIN-NUCLEUS row
// current afterwards, via upsertMasterCellRow() below, called at the end of the
// new_identification/confirmation/discrepancy branches in doPost. (Standalone points and
// merged-sub-cell identities aren't wired into live updates yet -- those come from different
// report types with a different key shape (new_cell_no_nucleus's coord, merged_split's
// groupId+subIndex) and weren't in scope for this first pass; they still get the correct one-time
// seed value, they just won't self-update if Søren later revises one through µJump.)
//
// Columns (must match build_master_cell_list.py's CSV header exactly, since that's what seeds the
// sheet): cell_key, kind, nucleus_id, voxel_x, voxel_y, voxel_z, voxel_paste, microns_predicted,
// own_verified_identity, current_identity, identity_source, community_top_identity,
// community_votes_json, last_updated. current_identity follows the SAME precedence used
// everywhere else in this project (own-verified beats everything) with a new middle tier Søren
// chose over "most recent wins": own_verified_identity (if the seed already has one -- community
// reports can never override this) > community majority vote (tallied fresh from Discrepancies +
// New identifications + Confirmations every time, tie-broken by most recent, since per-user dedup
// already means at most one live row per person per nucleus in those sheets) > microns_predicted
// > "Unclassified". community_top_identity/community_votes_json are populated regardless of which
// tier wins, so the underlying vote split stays visible even when own-verified is overriding it.
//
// "Computed volumes" (added 2026-07-31): one row per "Compute volume" button click in the
// HTML tool -- a mesh-derived whole-cell volume estimate MICrONS doesn't publish anywhere and
// which can only be computed one cell at a time (see save_computed_volume in doPost, and
// ?computedVolumes=1 in doGet). This is how the µJump dashboard's root-ID-volume graph is
// seeded and grows over time, rather than from a one-off batch job.
//
// "Confirmations" holds reports where the user's identification MATCHES MICrONS' own existing
// suggestion exactly (see the "agrees" case in renderResult() in the HTML) -- kept as its own
// sheet/type rather than folded into "New identifications" (which is specifically for cells that
// had NO MICrONS prediction at all), so the two stay distinguishable, but it's still folded into
// the same per-nucleus/allIds community-report tallies as Discrepancies/New identifications below,
// since more independent agreement should visibly build confidence in a cell, not vanish.
//
// Privacy note: reporterName/reporterEmail are collected on every submission but only ever read
// back to the client for the "New cells (no nucleus)" type (doGet's ?newCells=1 branch) -- a
// deliberate, scoped exception requested by Søren so a community-reported cell can be credited to
// its reporter (or shown as "anonymous"), the same way Søren's own verified dataset shows authors.
// Every other report type keeps reporterName/reporterEmail server-side only.
//
// "New cells (no nucleus)" rows can carry two independent segmentation IDs: rootId (the cell
// body) and nucRootId (the nucleus, when the raw minnie35 segmentation happens to split it off as
// its own mesh) -- nucRootId was appended as the LAST column, so if you already have rows in this
// sheet, add a "nucRootId" (or "nucleusId" -- both are accepted) header to the last column by
// hand (the header-write in doPost only fires once, when the sheet is empty).
//
// Re-reporting a cell only merges into an EXISTING row when the client explicitly sends
// append:true (the user chose "yes, same cell" on a warning shown when they're about to submit
// near an existing report -- see refreshDupeCheck() in the HTML). d.coord in that case is the
// existing report's own exact stored coordinate, matched as a plain string comparison, not a
// fresh proximity search -- an earlier, fully-automatic version of this logic guessed via its own
// distance search on every submission and wasn't reliable enough to trust on its own. Without
// append:true, every submission always creates a new row, even at an identical coordinate. On
// append, identified/certainty/comment are filled in the same way as rootId/nucRootId -- this is
// what lets an "unclassified, location only" report (identified/certainty submitted blank on
// purpose -- see openLocationOnlyReport() in the HTML) get classified later without creating a
// duplicate: whoever classifies it submits through this same flow with append:true and a real
// identified name/certainty, which fills the blanks on the SAME row.
//
// Centriole/cilium ("organelle_location") reports logged against a "New cells (no nucleus)"
// report have no nucleusId to key on either (same situation as the report itself), so doGet's
// ?newCellOrganelles=1 bulk mode returns every "Organelle locations" row with a blank nucleusId,
// keyed by coord, for the client to match by coordinate proximity -- mirroring ?newCells=1.
// Before this endpoint existed, these rows were written successfully but never read back
// anywhere (the per-nucleus lookup below only matches an exact real nucleusId).

// ── Google sign-in enforcement ─────────────────────────────────────────────
// Every submission must carry a Google ID token (d.credential) obtained when the
// user signs in with Google in the HTML tool. We verify it here, server-side, so
// no unauthenticated request can write a row even if it bypasses the front-end UI
// (e.g. by POSTing to this URL directly). The reporterName/reporterEmail written
// to the sheets come from the VERIFIED token, never from client-supplied fields.
var GOOGLE_CLIENT_ID="240227117082-gmiv0s37qdqngo3t3ph0lmthg4t4t47p.apps.googleusercontent.com";
// Set this to YOUR Google sign-in email to enable owner-only removal of proposed root IDs.
// Leave blank to disable removal entirely (votes are still recorded either way).
var OWNER_EMAIL="";
/* Undo / restore -- 2026-08-09 (Søren: "users occasionally misclassify cells accidentally...
   ensure accidental changes do not permanently overwrite existing classifications"). How long a
   self-service "Undo" (see doPost's restore_classification/undoLast branch, and the toast that
   appears right after every submission in ujump.html) stays valid after the ORIGINAL entry's own
   timestamp. Deliberately generous (not a 10-second snackbar) since the whole point is catching a
   "wait, that was wrong" moment that might not register until the reporter has moved on to the
   next cell. Only gates the QUICK undoLast path -- an administrator's restore (OWNER_EMAIL) and a
   reporter correcting one of their OWN older entries (picked explicitly from the history panel,
   not "the last thing I did") are both unrestricted by time, since those are deliberate lookups
   rather than a reflexive undo. */
var RESTORE_UNDO_WINDOW_MS=20*60*1000;

function verifyGoogleToken(credential){
  if(!credential) return null;
  try{
    var resp=UrlFetchApp.fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token="+encodeURIComponent(credential),
      {muteHttpExceptions:true});
    if(resp.getResponseCode()!==200) return null;          // expired or malformed token
    var info=JSON.parse(resp.getContentText());
    if(info.aud!==GOOGLE_CLIENT_ID) return null;           // token was issued for a different app
    if(info.iss!=="accounts.google.com" && info.iss!=="https://accounts.google.com") return null;
    if(String(info.email_verified)!=="true") return null;  // Google itself hasn't verified this email
    return {email:info.email||"", name:info.name||""};
  }catch(err){ return null; }
}

// RUN THIS ONCE from the Apps Script editor after adding token verification:
// pick "authorizeExternalRequests" in the toolbar function dropdown, click Run, and approve
// the permission prompt. This grants the web app permission to call Google's tokeninfo
// endpoint. WITHOUT it, doPost cannot verify tokens and silently rejects every submission
// (nothing reaches the sheets). You only need to do this once.
function authorizeExternalRequests(){
  var r=UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=test",{muteHttpExceptions:true});
  Logger.log("tokeninfo reachable — HTTP "+r.getResponseCode()+" (400 is expected for a dummy token; it means the call works).");
}

// ── Gamification: points, levels, aggregation, favourites ────────────────────
// 2026-08-xx points redesign (Søren: rare cells and white-matter cells should give more points,
// primary cilia more than other organelles, and the whole thing "recomputed live"). REPORT_SHEETS_POINTS
// is kept only as a quick-glance summary of the FLAT-rate sheets -- aggregateAll() below now computes
// content-based weights per row for New identifications/Confirmations/Discrepancies/Organelle
// locations/Root ID proposals/votes rather than a single flat weight per sheet, so this table is no
// longer read by aggregateAll() itself. See aggregateAll()'s own comments for the full rule set.
var REPORT_SHEETS_POINTS={
  "New identifications":4,"Confirmations":1,"Discrepancies":2,"Merged splits":3,
  "Organelle locations":1,"Not a nucleus":10,"New cells (no nucleus)":10,"Computed volumes":0.1,
  "Nucleus position fixes":5
};
var LEVELS=[[0,"Novice"],[100,"Contributor"],[500,"Skilled"],[2000,"Expert"],[10000,"Master"],[100000,"Godlike"]];
function levelFor(points){
  var name="Novice",next=null,nextAt=null;
  for(var i=0;i<LEVELS.length;i++){
    if(points>=LEVELS[i][0]){name=LEVELS[i][1];
      if(i+1<LEVELS.length){next=LEVELS[i+1][1];nextAt=LEVELS[i+1][0];}else{next=null;nextAt=null;}}
  }
  return {level:name,next:next,nextAt:nextAt};
}
function firstName(n){n=String(n||"").trim();if(!n)return "anonymous";return n.split(/\s+/)[0];}
function gJson(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
function handleMap(){
  var ss=primarySS(),sh=ss.getSheetByName("Handles"),m={};
  if(sh&&sh.getLastRow()>=2){var d=sh.getDataRange().getValues(),h=d[0],iE=h.indexOf("email"),iH=h.indexOf("handle");
    for(var i=1;i<d.length;i++){var e=String(d[i][iE]);if(e)m[e]=String(d[i][iH]||"");}}
  return m;
}
function displayFor(HM,email,name){var h=HM[String(email||"")];return (h&&h.length)?h:firstName(name);}
function getHandle(email,fallbackName){
  var ss=primarySS(),sh=ss.getSheetByName("Handles");
  if(sh&&sh.getLastRow()>=2){var d=sh.getDataRange().getValues(),h=d[0],iE=h.indexOf("email"),iH=h.indexOf("handle");
    for(var i=1;i<d.length;i++){if(String(d[i][iE])===email){var hv=String(d[i][iH]||"");return hv||firstName(fallbackName);}}}
  return firstName(fallbackName);
}
function streakFrom(dates){
  var keys=Object.keys(dates).sort();if(!keys.length)return {current:0,longest:0};
  var longest=1,cur=1;
  for(var i=1;i<keys.length;i++){
    var prev=new Date(keys[i-1]+"T00:00:00Z"),now=new Date(keys[i]+"T00:00:00Z");
    var diff=Math.round((now-prev)/86400000);
    cur=(diff===1)?cur+1:1; if(cur>longest)longest=cur;
  }
  var set={};keys.forEach(function(k){set[k]=1;});
  var todayD=new Date(),today=Utilities.formatDate(todayD,"UTC","yyyy-MM-dd");
  var last=keys[keys.length-1],gap=Math.round((new Date(today+"T00:00:00Z")-new Date(last+"T00:00:00Z"))/86400000);
  var cnt=0;
  if(gap<=1){var probe=new Date(last+"T00:00:00Z");
    while(true){var key=Utilities.formatDate(probe,"UTC","yyyy-MM-dd");if(set[key]){cnt++;probe.setUTCDate(probe.getUTCDate()-1);}else break;}}
  return {current:cnt,longest:longest};
}
/* Full rule set for the 2026-08-xx points redesign (Søren's spec, verbatim rules below each
   comment). Recomputed entirely fresh on every call, same "no caching/snapshotting" architecture
   as before -- Søren explicitly wants this "recomputed live".
     - New identification: 4 pt, or 6 pt if the cell is in the white matter OR its claimed identity
       has <500 cells on record in the "Master cell list" ("rare cell").
     - New cell, no nucleus: 10 pt flat.
     - Discrepancy: 2 pt flat.
     - Merged split: 3 pt flat per identified sub-cell (one row = one sub-cell already).
     - Organelle/structure location: 1 pt per row, 2 pt if kind==="cilium" (primary cilium),
       summed and capped at 10 pt per (reporter, nucleus) pair.
     - Confirmation: 1 pt to the confirmer, flat.
     - Not a nucleus: 10 pt flat.
     - Computed volume: 0.1 pt each.
     - Root ID / nucleus ID proposal: 0.2 pt each, capped at 10 pt per (proposer, nucleus) pair.
     - Received upvotes: +1 pt each, capped at +5 pt per (recipient, nucleus) pair.
     - Received downvotes: -1 pt each, capped at -5 pt per (recipient, nucleus) pair.
       Both vote types are pooled from BOTH "Identity votes" (votes on this person's identity
       claims) AND "Root ID votes" (votes on this person's root-ID proposals) -- Søren's "both,
       summed" answer -- with up/down tallied SEPARATELY before their independent caps apply (so a
       heavily-contested cell can contribute its full +5 and its full -5 to the same person at once,
       matching the spec's two separate "max ... per cell" lines rather than one net-capped value).
     - Confirmation-credit bonus (+5 pt, uncapped): whenever anyone's identity claim on a nucleus
       (a row in New identifications/Discrepancies/Confirmations) shares the same (nucleusId,
       identity) as an EARLIER claim by a different reporter, the earlier reporter gets +5 -- once
       per later agreeing report. Broadened (Søren's "broaden it" answer) from a literal "someone
       Confirms your New identification" reading, which a routing-logic proof showed could never
       actually pay out: ujump.html only ever creates a "Confirmations" row when the claimed
       identity EQUALS the pre-existing MICrONS prediction, so a Confirmation's identity can never
       match a prior New-identification/Discrepancy claim on the same nucleus (those are only
       created when there's no prediction, or the claim differs from it). removePriorIdentityReports()
       guarantees at most one row per (nucleusId, reporterEmail) across all three sheets combined, so
       grouping by (nucleusId, identity) here can never double-count the same person agreeing with
       themselves. */
function aggregateAll(){
  var ss=SS(),byEmail={};
  function ensure(em){if(!byEmail[em])byEmail[em]={name:"",reports:0,points:0,dates:{},cellTypes:{},organelles:0,newCells:0,rootProps:0,computedVolumes:0,notNucleusFlags:0,votesGiven:0,meshContactsComputed:0};return byEmail[em];}
  /* touch(em,name,ts): records ACTIVITY (display name + the date, for daysActive/streak) for
     any row a user submits, regardless of what kind of row it is -- but does NOT bump u.reports
     by itself any more. 2026-08-10 (Søren: "the total reports number should not include computed
     volumes or reported root IDs or votes, it should only contain the reported or confirmed cell
     identities... there could be fields that report the number of computed volumes, root IDs
     proposed and votes given") -- before this, touch() unconditionally did u.reports++, so
     "total reports" silently counted EVERY row type this file logs (root-ID proposals, organelle
     locations, computed-volume clicks, etc.), not just genuine cell-identity submissions. Now
     u.reports is incremented explicitly, only at the call sites below that represent an actual
     reported-or-confirmed cell IDENTITY: "New identifications"/"Discrepancies"/"Confirmations"
     (the three identity-report sheets), plus "New cells (no nucleus)" and "Merged splits" (both
     carry a real "identified" cell-type column -- see their appendRow headers -- so a row there
     IS a cell-identity claim, just for a cell missing from nucleus_detection_v0 or a sub-cell of
     a merged detection, respectively). Deliberately NOT counted: "Not a nucleus" (no "identified"
     column at all -- by design, per its own doPost comment, it flags a false-positive detection
     INSTEAD OF forcing a cell-type identification onto it), "Organelle locations" (already its
     own "organelles" stat -- an organelle/extracellular-structure location, not a cell identity),
     "Computed volumes" (now its own "computedVolumes" stat), "Root ID proposals" (already its
     own "rootProps"/"rootProposals" stat), and votes on either identities or root IDs (now their
     own "votesGiven" stat, see the new loop near the bottom of this function). */
  function touch(em,name,ts){var u=ensure(em);if(name)u.name=String(name);if(ts)u.dates[String(ts).slice(0,10)]=1;return u;}
  function tallyType(em,idRaw){if(!idRaw)return;var u=ensure(em);u.cellTypes[idRaw]=(u.cellTypes[idRaw]||0)+1;}

  /* ---- Rarity and white-matter bonuses, from the precomputed index. ----
     This block used to read three single columns of "Master cell list" here. The comment that
     stood in its place said the narrow reads were chosen because the sheet runs ~144k rows and
     this function sits on the live path -- correct reasoning, insufficient remedy. Measured on
     µJump, 2026-08-26: those three reads cost 68.8 s and the loop over them 0.1 s, out of
     aggregateAll()'s 77.8 s total. Apps Script charges roughly 23 s per 150k-row column read
     regardless of how few columns you ask for, so reading fewer of them could never have helped.

     The 68.8 seconds produced 30 identity counts and a white-matter verdict for the 435 nucleus
     ids that appear in identity reports. PointsIndex.gs precomputes exactly those, into ~70 rows,
     on the four-hourly trigger. gs_harness_pointsindex.js runs the ORIGINAL pass above and the
     index side by side over the same fixture and asserts they agree on every count and every
     white-matter verdict -- a faster function that quietly awarded different points would be
     worse than a slow one.

     Not yet built: counts are empty and both bonuses are zero. Nothing errors; run
     rebuildAllPointsIndexes() once. See PointsIndex.gs's header for the staleness rules. */
  var _pix=pointsIndexFor(ss);
  var identityCountByKey=_pix.counts, whiteMatterIds=_pix.whiteMatter;
  function isRareIdentity(identity){var ck=String(identity||"").toLowerCase();return ck?((identityCountByKey[ck]||0)<500):false;}
  function isWhiteMatter(nucleusId){return !!whiteMatterIds[String(nucleusId||"")];}

  // ---- New identifications / Discrepancies / Confirmations: own per-row base points, plus
  // collect every row (combined) for the earliest-claimant bonus pass below. ----
  var idClaimRows=[]; // {ts, nucleusId, identityLower, email}
  ["New identifications","Discrepancies","Confirmations"].forEach(function(sheetName){
    var sh=ss.getSheetByName(sheetName);if(!sh||sh.getLastRow()<2)return;
    var data=sh.getDataRange().getValues(),head=data[0];
    var iEmail=head.indexOf("reporterEmail"),iName=head.indexOf("reporterName"),iTs=head.indexOf("timestamp"),
        iNuc=head.indexOf("nucleusId"),iId=head.indexOf("identified");
    for(var r=1;r<data.length;r++){
      var em=String(data[r][iEmail]||"");if(!em)continue;
      var ts=iTs>=0?String(data[r][iTs]||""):"",nucleusId=iNuc>=0?String(data[r][iNuc]||""):"",idRaw=iId>=0?String(data[r][iId]||""):"";
      var u=touch(em,iName>=0?data[r][iName]:"",ts);u.reports++; // genuine cell-identity report/confirmation -- see touch()'s comment above
      tallyType(em,idRaw);
      if(sheetName==="New identifications")u.points+=(isWhiteMatter(nucleusId)||isRareIdentity(idRaw))?6:4;
      else if(sheetName==="Discrepancies")u.points+=2;
      else if(sheetName==="Confirmations")u.points+=1;
      if(nucleusId&&idRaw)idClaimRows.push({ts:ts,nucleusId:nucleusId,identityLower:idRaw.toLowerCase(),email:em});
    }
  });
  var claimGroups={};
  idClaimRows.forEach(function(row){(claimGroups[row.nucleusId+"|"+row.identityLower]=claimGroups[row.nucleusId+"|"+row.identityLower]||[]).push(row);});
  Object.keys(claimGroups).forEach(function(key){
    var group=claimGroups[key];if(group.length<2)return;
    group.sort(function(a,b){return a.ts<b.ts?-1:(a.ts>b.ts?1:0);});
    var earliestEmail=group[0].email,bonusU=ensure(earliestEmail);
    for(var gi=1;gi<group.length;gi++)bonusU.points+=5;
  });

  // ---- Flat-rate sheets: New cells (no nucleus) 10pt, Merged splits 3pt, Not a nucleus 10pt,
  // Computed volumes 0.1pt -- unchanged per-row logic otherwise, still tally cellTypes off
  // "identified" where that sheet has the column, same as before this redesign. ----
  var FLAT_RATE={"New cells (no nucleus)":10,"Merged splits":3,"Not a nucleus":10,"Computed volumes":0.1,
                 "Nucleus position fixes":5,
                 /* ωJump. "Box visits":3 is deliberately NOT zero and is the one entry here that
                    changes behaviour rather than rewarding it: the page sends each user to the
                    box furthest from any already-VISITED box, so an unreported empty box is a
                    box the sampler will serve again, and again. Pay only for finds and people
                    abandon empty boxes silently, the visited set stays sparse, and the sampler
                    degrades to re-serving the same voids. Three points for an honest "nothing
                    here" is what keeps the map complete. The obvious gaming risk -- clicking
                    "empty" without looking -- is measured, not assumed away: wjumpState returns
                    contradictedEmptyBoxes, boxes called empty where somebody later found a
                    nucleus. */
                 "Box visits":3,"Nuclei found":5,"Nucleus names":2,"Nucleus rejections":2,
                 /* χJump. "Cell fragments" is ABSENT from this map on purpose and the absence is
                    the decision: paying per fragment would pay for a property of the
                    segmentation rather than of the person. A badly over-segmented Purkinje cell
                    runs to dozens of pieces and a cleanly-segmented granule cell to three, for
                    the same amount of looking -- and it would reward padding an assembly with
                    fragments nobody checked. The cell is the unit of work, so it is the unit of
                    payment. 8 rather than ωJump's 5 for a find because assembling one cell out
                    of cb2 is an evening's careful clicking, not a glance. */
                 "Cells built":8,"Cell names":2,"Cell rejections":2,
                 /* χJump's discovery loop. "Box visits":3 is deliberately NOT zero and is the one
                    entry here that changes behaviour rather than rewarding it -- the sampler ranks
                    against boxes already VISITED, so an unreported empty box is one it will serve
                    again, and again. Pay only for finds and people abandon empty boxes silently.
                    "Nuclei" is 1 rather than ωJump's 5 because a mark here is one click inside a
                    batch of fifty, not a considered submission. */
                 "Box visits":3,"Nuclei":1};
  for(var flatSheetName in FLAT_RATE){
    var fsh=ss.getSheetByName(flatSheetName);if(!fsh||fsh.getLastRow()<2)continue;
    var fdata=fsh.getDataRange().getValues(),fhead=fdata[0];
    var fEmail=fhead.indexOf("reporterEmail"),fName=fhead.indexOf("reporterName"),fTs=fhead.indexOf("timestamp"),fId=fhead.indexOf("identified");
    var fw=FLAT_RATE[flatSheetName];
    for(var fr=1;fr<fdata.length;fr++){
      var em=String(fdata[fr][fEmail]||"");if(!em)continue;
      var u=touch(em,fName>=0?fdata[fr][fName]:"",fTs>=0?fdata[fr][fTs]:"");
      u.points+=fw;
      // Only "New cells (no nucleus)" and "Merged splits" carry a genuine cell-type "identified"
      // column (see touch()'s comment above) -- those two count toward u.reports. "Not a
      // nucleus" has no identity to report by design, and "Computed volumes" is a measurement,
      // not an identification -- both get their own separate counters instead.
      if(flatSheetName==="New cells (no nucleus)"){u.newCells++;u.reports++;}
      else if(flatSheetName==="Merged splits")u.reports++;
      else if(flatSheetName==="Not a nucleus")u.notNucleusFlags++;
      else if(flatSheetName==="Computed volumes")u.computedVolumes++;
      if(fId>=0&&fdata[fr][fId])tallyType(em,String(fdata[fr][fId]));
    }
  }

  // ---- Organelle locations: 1pt/row, 2pt if kind==="cilium", capped at 10pt per (reporter,
  // nucleus) pair -- accumulate raw sums first, then apply the cap once when rolling into points. ----
  var orgRaw={};
  var osh=ss.getSheetByName("Organelle locations");
  if(osh&&osh.getLastRow()>=2){
    var od=osh.getDataRange().getValues(),oh=od[0];
    var oEmail=oh.indexOf("reporterEmail"),oName=oh.indexOf("reporterName"),oTs=oh.indexOf("timestamp"),
        oNuc=oh.indexOf("nucleusId"),oKind=oh.indexOf("kind"),oId=oh.indexOf("identified");
    for(var or=1;or<od.length;or++){
      var em=String(od[or][oEmail]||"");if(!em)continue;
      var u=touch(em,oName>=0?od[or][oName]:"",oTs>=0?od[or][oTs]:"");u.organelles++;
      // 2026-08-10 (Søren: "I don't get why adding the different cell types together gives more
      // than what I have reported?") -- tallyType() here fed the "cell types you identify most"
      // breakdown from EVERY organelle-location row's "identified" column (the host cell's type,
      // carried along for context, NOT a fresh identity claim), even though organelle reports no
      // longer count toward u.reports (see touch()'s comment above this function). That let the
      // breakdown's total exceed "total reports" once the two were decoupled -- an organelle
      // report on an already-identified cell would tally that cell's type again here without
      // being one of the "reports" the number above it is describing. Removed so this breakdown
      // is drawn from the exact same rows as u.reports (identity sheets + New cells (no nucleus)
      // + Merged splits): its total can now only be <= reports (equal unless someone left
      // "identified" blank on a counted report), never more, oId is left computed above in case
      // a future "organelles by cell type" view wants it, just not fed into this shared bucket.
      var nucleusId=oNuc>=0?String(od[or][oNuc]||""):"",kind=oKind>=0?String(od[or][oKind]||""):"";
      var ow=(kind==="cilium")?2:1;
      if(!orgRaw[em])orgRaw[em]={};
      orgRaw[em][nucleusId]=(orgRaw[em][nucleusId]||0)+ow;
    }
  }
  Object.keys(orgRaw).forEach(function(em){var u=ensure(em);Object.keys(orgRaw[em]).forEach(function(nid){u.points+=Math.min(orgRaw[em][nid],10);});});

  // ---- Root ID / nucleus ID proposals: 0.2pt each, capped at 10pt per (proposer, nucleus) pair.
  // Also indexes each proposer's own (nucleusId|rootId) pairs for the received-votes pass below. ----
  var rootRaw={},myRootProposals={};
  var psh=ss.getSheetByName("Root ID proposals");
  if(psh&&psh.getLastRow()>=2){
    var pd=psh.getDataRange().getValues(),ph=pd[0];
    var iEm=ph.indexOf("proposedByEmail"),iNm=ph.indexOf("proposedByName"),iTs2=ph.indexOf("timestamp"),
        iNuc2=ph.indexOf("nucleusId"),iRoot2=ph.indexOf("rootId");
    for(var p=1;p<pd.length;p++){
      var em=String(pd[p][iEm]||"");if(!em)continue;
      var u=touch(em,iNm>=0?pd[p][iNm]:"",iTs2>=0?pd[p][iTs2]:"");u.rootProps++;
      var nucleusId=iNuc2>=0?String(pd[p][iNuc2]||""):"",rootId=iRoot2>=0?String(pd[p][iRoot2]||""):"";
      if(!rootRaw[em])rootRaw[em]={};
      rootRaw[em][nucleusId]=(rootRaw[em][nucleusId]||0)+0.2;
      if(!myRootProposals[em])myRootProposals[em]={};
      myRootProposals[em][nucleusId+"|"+rootId]=true;
    }
  }
  Object.keys(rootRaw).forEach(function(em){var u=ensure(em);Object.keys(rootRaw[em]).forEach(function(nid){u.points+=Math.min(rootRaw[em][nid],10);});});

  // ---- Mesh contacts ("Find cell contacts", 2026-08-10): 0.2pt each, capped at 10pt per
  // (reporter, nucleusIdA) pair -- same rate/cap shape as Root ID proposals just above, chosen
  // for consistency with an already-established scale rather than a fresh number. NOT counted in
  // u.reports: a mesh-contact measurement is not a reported cell IDENTITY (see touch()'s own
  // comment near the top of this function for the full "reports = identity only" reasoning). ----
  var mcRaw={};
  var mcSh=ss.getSheetByName("Mesh contacts");
  if(mcSh&&mcSh.getLastRow()>=2){
    var mcData=mcSh.getDataRange().getValues(),mcH=mcData[0];
    var mcEm=mcH.indexOf("reporterEmail"),mcNm=mcH.indexOf("reporterName"),mcTs=mcH.indexOf("timestamp"),mcA=mcH.indexOf("nucleusIdA");
    for(var mcr=1;mcr<mcData.length;mcr++){
      var mcEmail=String(mcData[mcr][mcEm]||"");if(!mcEmail)continue;
      var mcU=touch(mcEmail,mcNm>=0?mcData[mcr][mcNm]:"",mcTs>=0?mcData[mcr][mcTs]:"");mcU.meshContactsComputed++;
      var mcNidA=mcA>=0?String(mcData[mcr][mcA]||""):"";
      if(!mcRaw[mcEmail])mcRaw[mcEmail]={};
      mcRaw[mcEmail][mcNidA]=(mcRaw[mcEmail][mcNidA]||0)+0.2;
    }
  }
  Object.keys(mcRaw).forEach(function(em){var u=ensure(em);Object.keys(mcRaw[em]).forEach(function(nid){u.points+=Math.min(mcRaw[em][nid],10);});});

  // ---- Mesh proximity ("Synapse contacts" in βJump, "Astrocyte-synapse" in µJump, 2026-09-04):
  // the same 0.2pt-per-item, 10pt-per-(reporter,cell) shape as Mesh contacts directly above, for
  // the same reason -- these are measurements of the same kind and cost, and a second scale would
  // mean the two are worth different amounts for no reason anybody could defend. NOT counted in
  // u.reports (identities only), and deliberately NOT folded into meshContactsComputed either:
  // that counter is labelled "cell-pairs you've checked with Find cell contacts" in the profile
  // chip, and quietly adding a different measurement to it would make that sentence false. ----
  var mpRaw={};
  var mpSh2=ss.getSheetByName("Mesh proximity");
  if(mpSh2&&mpSh2.getLastRow()>=2){
    var mpData=mpSh2.getDataRange().getValues(),mpH2=mpData[0];
    var mpEm=mpH2.indexOf("reporterEmail"),mpNm=mpH2.indexOf("reporterName"),
        mpTs2=mpH2.indexOf("timestamp"),mpNid2=mpH2.indexOf("nucleusId"),
        mpSt=mpH2.indexOf("status");
    for(var mpr2=1;mpr2<mpData.length;mpr2++){
      var mpEmail2=String(mpData[mpr2][mpEm]||"");if(!mpEmail2)continue;
      touch(mpEmail2,mpNm>=0?mpData[mpr2][mpNm]:"",mpTs2>=0?mpData[mpr2][mpTs2]:"");
      // The "none found" placeholder row records that somebody looked; it is not an item, so it
      // earns the visit but not the per-item rate.
      if(mpSt>=0&&String(mpData[mpr2][mpSt])==="none found")continue;
      var mpKey=String(mpData[mpr2][mpNid2]||"");
      if(!mpRaw[mpEmail2])mpRaw[mpEmail2]={};
      mpRaw[mpEmail2][mpKey]=(mpRaw[mpEmail2][mpKey]||0)+0.2;
    }
  }
  Object.keys(mpRaw).forEach(function(em){var u=ensure(em);Object.keys(mpRaw[em]).forEach(function(nid){u.points+=Math.min(mpRaw[em][nid],10);});});

  // ---- Received upvotes/downvotes: pooled from "Identity votes" (against this person's own
  // identity claims, from idClaimRows above) and "Root ID votes" (against this person's own root-ID
  // proposals, from myRootProposals above), tallied per (recipient, nucleus) and capped
  // independently at +5/-5 -- see the big comment above this function for why up/down aren't netted
  // before capping. ----
  var myIdentityClaims={};
  idClaimRows.forEach(function(row){
    if(!myIdentityClaims[row.email])myIdentityClaims[row.email]={};
    myIdentityClaims[row.email][row.nucleusId+"|"+row.identityLower]=true;
  });
  var voteUpRaw={},voteDownRaw={};
  function addVote(email,nucleusId,up){
    var bucket=up?voteUpRaw:voteDownRaw;
    if(!bucket[email])bucket[email]={};
    bucket[email][nucleusId]=(bucket[email][nucleusId]||0)+1;
  }
  // ---- Votes GIVEN (2026-08-10, Søren: "there could be fields that report the number of...
  // votes given") -- a distinct thing from the received-upvotes/downvotes pass above: this
  // counts, per VOTER (not per recipient), how many distinct identity/root-ID votes they've
  // cast. Both vote sheets overwrite in place on re-vote (see the vote_identity/vote_root_id
  // doPost branches), so one row per (voter, nucleus, identity-or-rootId) already means "one
  // row per distinct thing they've voted on, most recent choice" -- exactly what a row-count
  // should represent here, no separate de-duplication needed. touch() only (not u.reports++):
  // voting is explicitly NOT a "reported cell identity" per Søren's instruction above. ----
  var ivsh=ss.getSheetByName("Identity votes");
  if(ivsh&&ivsh.getLastRow()>=2){
    var ivd=ivsh.getDataRange().getValues(),ivh=ivd[0];
    var jNuc=ivh.indexOf("nucleusId"),jId=ivh.indexOf("identity"),jV=ivh.indexOf("vote"),jEm=ivh.indexOf("voterEmail"),jTs=ivh.indexOf("timestamp");
    for(var iv=1;iv<ivd.length;iv++){
      var nucleusId=String(ivd[iv][jNuc]||""),pairKey=nucleusId+"|"+String(ivd[iv][jId]||"").toLowerCase(),up=Number(ivd[iv][jV])>=0;
      for(var em2 in myIdentityClaims){if(myIdentityClaims[em2][pairKey])addVote(em2,nucleusId,up);}
      var voterEm=jEm>=0?String(ivd[iv][jEm]||""):"";
      if(voterEm){var vu=touch(voterEm,"",jTs>=0?ivd[iv][jTs]:"");vu.votesGiven++;}
    }
  }
  var rvsh=ss.getSheetByName("Root ID votes");
  if(rvsh&&rvsh.getLastRow()>=2){
    var rvd=rvsh.getDataRange().getValues(),rvh=rvd[0];
    var kNuc=rvh.indexOf("nucleusId"),kRoot=rvh.indexOf("rootId"),kV=rvh.indexOf("vote"),kEm=rvh.indexOf("voterEmail"),kTs=rvh.indexOf("timestamp");
    for(var rv=1;rv<rvd.length;rv++){
      var nucleusId=String(rvd[rv][kNuc]||""),pairKey=nucleusId+"|"+String(rvd[rv][kRoot]||""),up=Number(rvd[rv][kV])>=0;
      for(var em3 in myRootProposals){if(myRootProposals[em3][pairKey])addVote(em3,nucleusId,up);}
      var voterEm2=kEm>=0?String(rvd[rv][kEm]||""):"";
      if(voterEm2){var vu2=touch(voterEm2,"",kTs>=0?rvd[rv][kTs]:"");vu2.votesGiven++;}
    }
  }
  Object.keys(voteUpRaw).forEach(function(em){var u=ensure(em);Object.keys(voteUpRaw[em]).forEach(function(nid){u.points+=Math.min(voteUpRaw[em][nid],5);});});
  Object.keys(voteDownRaw).forEach(function(em){var u=ensure(em);Object.keys(voteDownRaw[em]).forEach(function(nid){u.points-=Math.min(voteDownRaw[em][nid],5);});});

  // Several rates above are fractional (0.1/0.2 pt); round once at the end so totals never surface
  // as long decimals, but keep one decimal place (not a whole-number round) since 0.1pt rates can
  // legitimately produce totals like 4.3 for a light contributor.
  for(var _e in byEmail)byEmail[_e].points=Math.round(byEmail[_e].points*10)/10;
  return byEmail;
}
/* 2026-08-09 (performance audit, Søren: "Yes, I am fine with that approach" re: relaxing
   aggregateAll()'s "recomputed live" rule to "recomputed at most every ~90s") -- aggregateAll()
   itself is UNCHANGED (still a genuine full recompute, still callable directly if some future
   caller needs a guaranteed-fresh read), but it was being called on ?leaderboard= AND on
   ?myStats= -- and myStats fires on EVERY page load for every signed-in user (see
   gamifyOnSignIn()/loadMyStats() in ujump.html), not just when someone opens the leaderboard.
   That meant a global, identical, ~9-full-sheet-scan computation was being redone from scratch on
   nearly every page view, with cost growing every day as the report sheets grow. The result is
   the SAME for every caller (it's not scoped to one user), so it's an ideal CacheService
   candidate: one cache entry serves every request within the TTL window. 90s was chosen as a
   negligible freshness cost for points/leaderboard standing specifically -- nobody needs
   sub-minute accuracy on a gamification score -- while still being short enough that a fresh
   submission's points show up well within the same browsing session. Falls back to a live,
   uncached call (never throws, never serves stale-forever data) if CacheService is unavailable,
   the cached JSON fails to parse, or the payload is too large to cache (script cache caps a
   single value at 100KB; with enough distinct contributors this COULD exceed that some day, at
   which point this silently just stops caching rather than breaking). */
var AGGREGATE_CACHE_KEY="aggregateAll_v1",AGGREGATE_CACHE_TTL_SEC=90;
function aggregateAllCached(){
  var cache;
  try{cache=dsCache();}catch(_cs){cache=null;}
  if(cache){
    try{
      var hit=cache.get(AGGREGATE_CACHE_KEY);
      if(hit)return JSON.parse(hit);
    }catch(_cg){/* corrupt/unparseable cache entry -- fall through to a live recompute */}
  }
  var fresh=aggregateAll();
  if(cache){
    try{cache.put(AGGREGATE_CACHE_KEY,JSON.stringify(fresh),AGGREGATE_CACHE_TTL_SEC);}
    catch(_cp){/* e.g. payload over the 100KB per-value cache limit -- just don't cache this round */}
  }
  return fresh;
}
/* Invalidates the aggregateAll() cache immediately -- called once from doPost's own shared exit
   point (after every write branch that could change a report/vote/favourite tally), so a user who
   just submitted something doesn't have to wait out the full TTL to see their own new points
   reflected the next time they open the leaderboard or their profile. Cheap (cache.remove is
   O(1)); safe to call even if nothing was ever cached (no-op) or if CacheService throws for any
   reason. */
function invalidateAggregateCache(){
  try{dsCache().remove(AGGREGATE_CACHE_KEY);}catch(_cr){}
}
/* Per-nucleus read cache for doGet's ?nucleusId= branch (see its own comment there) -- 45s TTL,
   a little longer than the aggregate cache since a single cell's report list changes far less
   often than the site-wide leaderboard does, but still short enough that nobody browsing the
   tool notices. invalidateNucleusViewCache() is called from doPost's shared exit point (same
   spot as invalidateAggregateCache()) so the cell that was JUST reported on always reflects the
   change on the very next view, regardless of the TTL. */
var NUC_VIEW_CACHE_TTL_SEC=45;
function invalidateNucleusViewCache(nucleusId){
  if(!nucleusId)return;
  try{dsCache().remove("nucView:"+String(nucleusId));}catch(_nvr){}
}
/* Cache for doGet's ?connectivitySamples=1 branch (see its own comment there) -- same reasoning
   as AGGREGATE_CACHE above (one global result shared by every caller, cheap to cache, expensive
   to recompute per request as the "Connectivity samples" sheet grows). 60s TTL: this chart is
   explicitly meant to grow from real usage over time, so nobody needs the dashboard to reflect a
   single new sample within seconds -- unlike the per-nucleus view cache, there's no matching
   "invalidate the one row that changed" concept here (a fresh connectivity_sample write just
   means the WHOLE bucketed-by-type payload is one row bigger), so this is invalidated the same
   blanket way as the aggregate cache, from doPost's shared exit point. */
var CONN_SAMPLES_CACHE_KEY="connectivitySamples_v1",CONN_SAMPLES_CACHE_TTL_SEC=60;
function invalidateConnSamplesCache(){
  try{dsCache().remove(CONN_SAMPLES_CACHE_KEY);}catch(_csr){}
}
/* Cache for doGet's ?meshContactTypeStats=1 branch (see its own comment there) -- same reasoning
   as CONN_SAMPLES_CACHE above: one global pre-aggregated result shared by every dashboard load,
   cheap to cache, and "Mesh contacts" is written to on every "Check" click in the Cell contacts
   panel, so recomputing the group-by-type-pair average from scratch on every dashboard open would
   scale badly as that sheet grows. 60s TTL, same as connectivity samples -- nobody needs this
   dot-plot to reflect a single new click within seconds. */
var MESH_CONTACT_STATS_CACHE_KEY="meshContactTypeStats_v1",MESH_CONTACT_STATS_CACHE_TTL_SEC=60;
function invalidateMeshContactStatsCache(){
  try{dsCache().remove(MESH_CONTACT_STATS_CACHE_KEY);}catch(_mcr){}
}
function favouritesFor(email){
  var ss=SS(),sh=ss.getSheetByName("Favourites"),out=[];
  if(sh&&sh.getLastRow()>=2){var d=sh.getDataRange().getValues(),h=d[0];
    var iE=h.indexOf("email"),iN=h.indexOf("nucleusId"),iR=h.indexOf("rootId"),iC=h.indexOf("coord"),iNo=h.indexOf("note"),iRem=h.indexOf("removed");
    for(var i=1;i<d.length;i++){if(String(d[i][iE])!==email)continue;if(iRem>=0&&String(d[i][iRem]).toLowerCase()==="yes")continue;
      out.push({nucleusId:String(d[i][iN]||""),rootId:String(d[i][iR]||""),coord:String(d[i][iC]||""),note:String(iNo>=0?(d[i][iNo]||""):"")});}}
  return out;
}
function userReportedIdentity(nucleusId,ident,email){
  if(!nucleusId||!ident||!email)return false;
  var ss=SS(),key=String(ident).toLowerCase(),hit=false;
  ["Discrepancies","New identifications","Confirmations"].forEach(function(sheetName){
    if(hit)return;
    var sh=ss.getSheetByName(sheetName);if(!sh||sh.getLastRow()<2)return;
    var d=sh.getDataRange().getValues(),h=d[0];
    var iN=h.indexOf("nucleusId"),iId=h.indexOf("identified"),iE=h.indexOf("reporterEmail");
    if(iN<0||iId<0||iE<0)return;
    for(var i=1;i<d.length;i++){
      if(String(d[i][iN])===nucleusId&&String(d[i][iId]).toLowerCase()===key&&String(d[i][iE])===email){hit=true;break;}
    }
  });
  return hit;
}
function removePriorIdentityReports(nucleusId,email){
  var ss=SS();
  ["Discrepancies","New identifications","Confirmations"].forEach(function(sheetName){
    var sh=ss.getSheetByName(sheetName);if(!sh||sh.getLastRow()<2)return;
    var data=sh.getDataRange().getValues(),h=data[0],iNuc=h.indexOf("nucleusId"),iEm=h.indexOf("reporterEmail");
    if(iNuc<0||iEm<0)return;
    for(var r=data.length-1;r>=1;r--){
      if(String(data[r][iNuc])===String(nucleusId)&&String(data[r][iEm])===String(email))sh.deleteRow(r+1);
    }
  });
}
/* Tallies every LIVE identity report for one main nucleus across the three report-log sheets
   (Discrepancies / New identifications / Confirmations -- same three sheets every other
   per-nucleus community tally in this file already reads). Because removePriorIdentityReports()
   above always deletes a person's earlier row before their new one is appended, at most one row
   per (nucleusId, reporterEmail) pair can exist here at any time -- so this is always a clean
   "current stance of everyone who's weighed in", never double-counting someone who changed their
   mind. Case-insensitive tally key (so "Pericyte" and "pericyte" count as the same vote), but the
   ORIGINAL casing of the most-recently-submitted matching report is what gets displayed/returned,
   so the output reads naturally rather than forcing one arbitrary case convention.
   Returns {counts:{<identity display string>: n, ...}, top:<display string or "">,
   topCount:<n>, totalReports:<n>, mostRecentIdentity:<display string or "">} -- "top" is the
   plain-majority winner; ties are broken by whichever tied identity was reported most recently
   (mostRecentIdentity is precomputed for that tie-break, not just informational). */
function tallyIdentitiesForNucleus(nucleusId){
  var ss=SS();
  var counts={},display={},latestTsByKey={},mostRecentTs=null,mostRecentIdentity="",total=0;
  ["Discrepancies","New identifications","Confirmations"].forEach(function(sheetName){
    var sh=ss.getSheetByName(sheetName);if(!sh||sh.getLastRow()<2)return;
    var data=sh.getDataRange().getValues(),h=data[0];
    var iNuc=h.indexOf("nucleusId"),iId=h.indexOf("identified"),iTs=h.indexOf("timestamp");
    if(iNuc<0||iId<0)return;
    for(var r=1;r<data.length;r++){
      if(String(data[r][iNuc])!==String(nucleusId))continue;
      var raw=String(data[r][iId]||"").trim();
      if(!raw)continue;
      var key=raw.toLowerCase();
      var ts=iTs>=0?String(data[r][iTs]||""):"";
      counts[key]=(counts[key]||0)+1;
      total++;
      // Keep the most-recently-submitted casing as the display string for this identity.
      if(!latestTsByKey[key]||ts>latestTsByKey[key]){latestTsByKey[key]=ts;display[key]=raw;}
      if(!mostRecentTs||ts>mostRecentTs){mostRecentTs=ts;mostRecentIdentity=raw;}
    }
  });
  var top="",topCount=0,topKey="";
  Object.keys(counts).forEach(function(key){
    if(counts[key]>topCount){topCount=counts[key];topKey=key;}
  });
  // Tie-break: if more than one identity shares the top count, prefer whichever of THOSE tied
  // identities was reported most recently, rather than an arbitrary object-key iteration order.
  var tiedKeys=Object.keys(counts).filter(function(key){return counts[key]===topCount;});
  if(tiedKeys.length>1){
    var bestTs=null;
    tiedKeys.forEach(function(key){
      if(!bestTs||latestTsByKey[key]>bestTs){bestTs=latestTsByKey[key];topKey=key;}
    });
  }
  top=topKey?display[topKey]:"";
  var displayCounts={};
  Object.keys(counts).forEach(function(key){displayCounts[display[key]]=counts[key];});
  return {counts:displayCounts,top:top,topCount:topCount,totalReports:total,mostRecentIdentity:mostRecentIdentity};
}
/* ── A REJECTION, ON THE ROW IT IS ABOUT ─────────────────────────────────────────  2026-09-04
   Audit item 5's tail. "Not a nucleus" flags a MICrONS detection as a segmentation artefact and,
   until today, wrote its own sheet and nothing else -- so the master cell list went on listing the
   detection as a cell, with a prediction and a layer, and nothing on the row hinted that somebody
   had looked and said it is not one.

   A COUNT, IN A COLUMN OF ITS OWN, and deliberately not kind="not a nucleus". `kind` is
   load-bearing: dashboardLive() gates unclassifiedPerLayer, unclassifiedMain, identifiedMain and
   the identity_source split on kind==="main_nucleus", so rewriting it would drop this cell out of
   every one of those counts. That may even be the right answer eventually, but a KPI number that
   moves without anybody deciding it should is the exact failure this audit exists to stop.

   A count rather than a flag because one person saying so and four people saying so are different
   claims, and the sheet should be able to tell them apart. Recomputed from the sheet on every
   call, never incremented on the row -- same rule as every other tally in this file, so deleting a
   report by hand makes the number follow.

   ensureHeaderColumn, so a sheet seeded before this existed grows the column on first use, the way
   corrected_voxel and holeLengthUm did.

   Not for the five shared-schema tools: mlRecordReport handles those (MasterList.gs), and writing
   µJump's layout into their tab would interleave two schemas in one table. */
function upsertMasterCellRejection(nucleusId){
  if(!nucleusId)return;
  if(typeof ML_DATASETS!=="undefined"&&ML_DATASETS[CURRENT_DS])return;
  var ss=SS();
  var sh=ss.getSheetByName(MASTER_LIST_SHEET);
  if(!sh||sh.getLastRow()<1)return;
  var nsh=ss.getSheetByName("Not a nucleus");
  if(!nsh||nsh.getLastRow()<2)return;
  var nd=nsh.getDataRange().getValues(),nh=nd[0],iN=nh.indexOf("nucleusId");
  if(iN<0)return;
  var seen={},n=0;
  for(var r=1;r<nd.length;r++){
    if(String(nd[r][iN])!==String(nucleusId))continue;
    /* ONE PER PERSON. Somebody clicking twice is not two people agreeing, and this number is read
       as agreement. Rows with no email (a bulk import) each count once, since there is nothing to
       deduplicate them by. */
    var iE=nh.indexOf("reporterEmail");
    var who=iE>=0?String(nd[r][iE]||"").toLowerCase():"";
    if(who){ if(seen[who])continue; seen[who]=1; }
    n++;
  }
  if(!n)return;
  var header=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iKey=header.indexOf("cell_key");
  if(iKey<0)return;
  var rowIdx=masterRowForKey_(sh,iKey,sh.getLastRow(),"N:"+String(nucleusId));
  if(rowIdx<1)return;                 /* no row for it -- nothing to annotate, and inventing one
                                         from a rejection would be a strange way to add a cell */
  var iCol=ensureHeaderColumn(sh,"not_a_nucleus_reports");
  sh.getRange(rowIdx,iCol+1).setValue(n);
  var iUpd=header.indexOf("last_updated");
  if(iUpd>=0)sh.getRange(rowIdx,iUpd+1).setValue(new Date().toISOString());
}

/* ── A CELL SOMEBODY FOUND THAT THE DETECTOR MISSED ──────────────────────────────  2026-09-04
   Audit item 5's tail. new_cell_no_nucleus is the report for a real cell MICrONS produced no
   nucleus detection for at all, and it lived in "New cells (no nucleus)" and nowhere else -- so
   the one table that is supposed to say what is in this volume did not know about the cells only
   people had found.

   THE KEY IS THE COORDINATE, "NEW:<coord>", because there is no nucleus id and that is the whole
   meaning of the type. Code.gs already treats that exact string as the identity of such a report
   (see the `append` half of the new_cell_no_nucleus branch, which matches on it to add a root id
   to an existing row), and MasterList.gs adopted the same key for the shared schema on the same
   day, so the two families agree.

   kind="found_cell": a value dashboardLive() does not test for, so no existing count moves. The
   identity is tallied from the report sheet itself, by the same most-reports-wins rule
   tallyIdentitiesForNucleus uses, and identity_source can never be "microns_only" here -- there is
   no MICrONS prediction for a cell MICrONS never detected. */
function upsertMasterFoundCell(coord){
  coord=String(coord||"").trim();
  if(!coord)return;
  if(typeof ML_DATASETS!=="undefined"&&ML_DATASETS[CURRENT_DS])return;
  var ss=SS();
  var sh=ss.getSheetByName(MASTER_LIST_SHEET);
  if(!sh||sh.getLastRow()<1)return;
  var fsh=ss.getSheetByName("New cells (no nucleus)");
  if(!fsh||fsh.getLastRow()<2)return;
  var fd=fsh.getDataRange().getValues(),fh=fd[0];
  var iC=fh.indexOf("coord"),iId=fh.indexOf("identified"),iRoot=fh.indexOf("rootId"),
      iNucRoot=fh.indexOf("nucRootId"),iTs=fh.indexOf("timestamp");
  if(iC<0)return;
  var counts={},display={},latest={},roots={},any=false;
  for(var r=1;r<fd.length;r++){
    if(String(fd[r][iC]||"").trim()!==coord)continue;
    any=true;
    if(iRoot>=0&&fd[r][iRoot])roots[String(fd[r][iRoot])]=1;
    if(iNucRoot>=0&&fd[r][iNucRoot])roots[String(fd[r][iNucRoot])]=1;
    var raw=iId>=0?String(fd[r][iId]||"").trim():"";
    if(!raw)continue;                 /* a location-only report asserts nothing about the identity */
    var key=raw.toLowerCase(),ts=iTs>=0?String(fd[r][iTs]||""):"";
    counts[key]=(counts[key]||0)+1;
    if(!latest[key]||ts>latest[key]){latest[key]=ts;display[key]=raw;}
  }
  if(!any)return;
  var topKey="",topCount=0;
  Object.keys(counts).forEach(function(k){ if(counts[k]>topCount){topCount=counts[k];topKey=k;} });
  var tied=Object.keys(counts).filter(function(k){return counts[k]===topCount;});
  if(tied.length>1){ var best=null; tied.forEach(function(k){ if(!best||latest[k]>best){best=latest[k];topKey=k;} }); }
  var top=topKey?display[topKey]:"";
  var shown={}; Object.keys(counts).forEach(function(k){shown[display[k]]=counts[k];});

  var header=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var at={}; header.forEach(function(c,i){at[c]=i;});
  if(at.cell_key===undefined)return;
  /* "S:<x>_<y>_<z>", WHICH IS THE KEY THIS SHEET ALREADY USES for a coordinate-keyed cell --
     6,011 of them, seeded by build_master_cell_list.py from Søren's own standalone-point table.
     Code.gs's own header says what they were waiting for: "Standalone points ... aren't wired
     into live updates yet -- those come from different report types with a different key shape
     (new_cell_no_nucleus's coord ...)". This IS that wiring, so it must land on those rows rather
     than open a second key space beside them.

     The shared schema (MasterList.gs) keys the same type "NEW:<coord>", and that stays: δJump's
     and πJump's seeds contain no standalone points, so there is nothing there to collide with or
     join to. Two schemas, each using the key its own sheet already understands. */
  var cellKey="S:"+coord.replace(/[^0-9.\-]+/g,"_");
  var rowIdx=masterRowForKey_(sh,at.cell_key,sh.getLastRow(),cellKey);
  var row=rowIdx>0?sh.getRange(rowIdx,1,1,header.length).getValues()[0]
                  :new Array(header.length).fill("");
  function put(name,v){ if(at[name]!==undefined&&v!=="" &&v!=null)row[at[name]]=v; }
  put("cell_key",cellKey);
  /* ONLY ON A ROW THIS CREATES. A seeded standalone point already carries whatever `kind`
     build_master_cell_list.py gave it, and overwriting that from a community report would edit
     the seed on the strength of somebody's click. */
  if(rowIdx<1)put("kind","standalone");
  var parts=coord.split(/[^0-9.\-]+/).filter(function(s){return s!=="";});
  if(parts.length===3){
    put("voxel_x",Number(parts[0])); put("voxel_y",Number(parts[1])); put("voxel_z",Number(parts[2]));
    put("voxel_paste",parts.join(", "));
  }
  var rootList=Object.keys(roots);
  if(rootList.length)put("microns_root_id",rootList.join(","));
  if(at.community_top_identity!==undefined)row[at.community_top_identity]=top;
  if(at.community_votes_json!==undefined)row[at.community_votes_json]=JSON.stringify(shown);
  /* own_verified_identity still outranks the tally, exactly as it does on every other row -- a
     found cell Søren has verified himself must not be overwritten by whoever reports it next. */
  var own=at.own_verified_identity!==undefined?String(row[at.own_verified_identity]||""):"";
  if(at.current_identity!==undefined)
    row[at.current_identity]=own?own:(top?top:"Unclassified");
  if(at.identity_source!==undefined)
    row[at.identity_source]=own?"own_verified":(top?"community_majority":"unclassified");
  if(at.last_updated!==undefined)row[at.last_updated]=new Date().toISOString();
  if(rowIdx>0)sh.getRange(rowIdx,1,1,header.length).setValues([row]);
  else sh.appendRow(row);
}

/* Everything already reported, folded in. Run once from the Apps Script editor, per dataset, after
   pasting this file -- a change that only covers reports filed after today leaves the interesting
   half sitting in a sheet nobody joins to. Idempotent: both writers recompute from the report
   sheets rather than adding to what is there. */
function backfillRejectionsAndFoundCells(){
  var ss=SS(),out=[];
  /* ONE-TIME CLEANUP, 2026-09-04. The first version of upsertMasterFoundCell keyed these rows
     "NEW:<coord>" -- the shared schema's form -- before mlKeyProfile showed that this sheet
     already holds 6,011 coordinate-keyed cells under "S:<x>_<y>_<z>". Any NEW: row is therefore a
     row written by that first version, in the wrong key space; the found-cell pass below rebuilds
     it under the right one from the report sheet, which is the only place the facts actually
     live. Bottom-up, because deleting a row renumbers everything under it. */
  var msh=ss.getSheetByName(MASTER_LIST_SHEET);
  if(msh&&msh.getLastRow()>=2){
    var mh=msh.getRange(1,1,1,msh.getLastColumn()).getValues()[0],mk=mh.indexOf("cell_key");
    if(mk>=0){
      var mkeys=msh.getRange(2,mk+1,msh.getLastRow()-1,1).getValues(),dropped=0;
      for(var mr=mkeys.length-1;mr>=0;mr--){
        if(String(mkeys[mr][0]||"").indexOf("NEW:")===0){msh.deleteRow(mr+2);dropped++;}
      }
      if(dropped)out.push(dropped+" row(s) re-keyed from NEW: to S:");
    }
  }
  var nsh=ss.getSheetByName("Not a nucleus"),done={};
  if(nsh&&nsh.getLastRow()>=2){
    var nd=nsh.getDataRange().getValues(),iN=nd[0].indexOf("nucleusId"),nAnn=0;
    for(var r=1;r<nd.length&&iN>=0;r++){
      var id=String(nd[r][iN]||""); if(!id||done["n"+id])continue;
      done["n"+id]=1; upsertMasterCellRejection(id); nAnn++;
    }
    out.push(nAnn+" rejected detection(s) annotated");
  }
  var fsh=ss.getSheetByName("New cells (no nucleus)");
  if(fsh&&fsh.getLastRow()>=2){
    var fd=fsh.getDataRange().getValues(),iC=fd[0].indexOf("coord"),nNew=0;
    for(var r2=1;r2<fd.length&&iC>=0;r2++){
      var c=String(fd[r2][iC]||"").trim(); if(!c||done["c"+c])continue;
      done["c"+c]=1; upsertMasterFoundCell(c); nNew++;
    }
    out.push(nNew+" found cell(s) written");
  }
  var msg=CURRENT_DS+": "+(out.join(", ")||"nothing to do");
  try{Logger.log(msg);}catch(e){}
  return msg;
}

/* Column order MUST match build_master_cell_list.py's CSV header exactly -- that CSV is what
   Søren imports to seed this sheet, and this script only ever reads/writes by column NAME
   (h.indexOf(...)), never a hardcoded index, so the two stay compatible even if a column is
   reordered in a future re-seed, as long as the header row is preserved verbatim. */
var MASTER_LIST_SHEET="Master cell list";
/* 2026-08-02 EXTENSION: 8 columns appended (has_cilium, cilium_checked, cilium_length_um,
   has_centriole, centriole_dist_um, nucleus_volume_um3, estimated_layer, neighbor_10_keys) so the
   µJump dashboard can compute EVERY chart live from this sheet, rather than from a frozen
   precompute_dashboard.py snapshot (Søren: "none of them should be static... changed by user
   reports"). See dashboardLive() below and build_master_cell_list.py's own header comment for the
   full reasoning on which of these are geometric/fixed vs. identity-driven/live. */
var MASTER_LIST_HEADERS=["cell_key","kind","nucleus_id","voxel_x","voxel_y","voxel_z","voxel_paste",
  "microns_predicted","own_verified_identity","current_identity","identity_source",
  "community_top_identity","community_votes_json","last_updated",
  "has_cilium","cilium_checked","cilium_length_um","has_centriole","centriole_dist_um",
  "nucleus_volume_um3","estimated_layer","neighbor_10_keys",
  "microns_root_id","community_root_ids","computed_volume_um3",
  "has_microglia_plug","microglia_plug_count","has_astrocyte_hole","astrocyte_hole_count"];
/* Adds colName as a new header cell at the end of sh's header row if it isn't already present --
   idempotent, cheap (one small header-row read, and a write only when actually missing), safe to
   call before every write to a column that might not exist yet on an ALREADY-LIVE, ALREADY-SEEDED
   sheet. Added 2026-08-02 after a real bug: "Computed volumes"' nucVolumeUm3 column was being
   written to for months with no header cell above it (Søren: "there is a column I where there is
   a number... but the column does not have a header") -- the one-time "if(getLastRow()===0)"
   header write only ever fires for a sheet that's completely empty, so any column added to the
   write array AFTER a sheet already has rows silently never gets a header of its own. Every new
   column introduced from this point forward (microns_root_id, community_root_ids below, and
   nucVolumeUm3's own retrofit) calls this before writing, instead of repeating that mistake.
   Returns the column's 0-indexed position (whether it already existed or was just added). */
function ensureHeaderColumn(sh,colName){
  var lastCol=sh.getLastColumn();
  var header=lastCol>0?sh.getRange(1,1,1,lastCol).getValues()[0]:[];
  var idx=header.indexOf(colName);
  if(idx>=0)return idx;
  sh.getRange(1,lastCol+1).setValue(colName);
  return lastCol;
}
/* Classification history -- 2026-08-09 (Søren: every reclassification should record who/when/
   previous/new classification/certainty/comment/source, and prior reasoning must never be
   silently destroyed by the next report). One APPEND-ONLY row per real identity CHANGE on a
   main nucleus (never edited or deleted afterwards), logged from inside upsertMasterCellRow()
   below at the exact point it overwrites "Master cell list"'s current_identity -- that is the
   only place in this file that already knows both the OLD value (about to be overwritten) and
   the NEW one, so history-logging lives there instead of duplicating that lookup. sourceType is
   one of: "microns_original" (a lazily-seeded baseline entry, see below -- not a real user
   action), "verification" (Søren's own verified dataset, own_verified_identity), "manual_revision"
   (the SAME reporter changing their own earlier call on this cell), or "community" (anyone else's
   identification/reclassification). This sheet is purely ADDITIVE -- it never reads from or
   writes to any existing sheet's schema, so every already-seeded row in every other sheet
   (including the ~150k-row Master cell list) is completely unaffected; a cell with no rows here
   yet just shows an empty history panel until its first new report after this shipped, or the
   lazy baseline row below fires. */
var CLASSIFICATION_HISTORY_SHEET="Classification history";
var CLASSIFICATION_HISTORY_HEADERS=["timestamp","nucleusId","rootId","coord","previousIdentity","newIdentity","sourceType","certainty","comment","reporterName","reporterEmail"];
function appendClassificationHistory(entry){
  var ss=SS();
  var sh=ss.getSheetByName(CLASSIFICATION_HISTORY_SHEET)||ss.insertSheet(CLASSIFICATION_HISTORY_SHEET);
  if(sh.getLastRow()===0)sh.appendRow(CLASSIFICATION_HISTORY_HEADERS);
  sh.appendRow([entry.timestamp||new Date().toISOString(),entry.nucleusId||"",entry.rootId||"",entry.coord||"",
    entry.previousIdentity||"",entry.newIdentity||"",entry.sourceType||"community",
    entry.certainty||"",entry.comment||"",entry.reporterName||"",entry.reporterEmail||""]);
}
/* Most recent classification-history row for one nucleus, or null if it has none yet. Used both
   to decide sourceType ("manual_revision" vs "community", by comparing reporterEmail) and by the
   client-facing needsOverrideContext() guard below. "Classification history" is a report-log
   sheet like Discrepancies/New identifications (grows only for cells that get reclassified, not
   once per cell in the dataset), so a full-sheet scan here is the same order of magnitude as
   every other per-nucleus report lookup in this file -- NOT the 150k-row Master cell list. */
function lastClassificationHistoryEntry(nucleusId){
  var ss=SS();
  var sh=ss.getSheetByName(CLASSIFICATION_HISTORY_SHEET);
  if(!sh||sh.getLastRow()<2)return null;
  var data=sh.getDataRange().getValues(),h=data[0];
  var iNuc=h.indexOf("nucleusId"),iId=h.indexOf("newIdentity"),iEm=h.indexOf("reporterEmail");
  if(iNuc<0||iId<0)return null;
  /* Rows are append-only and never reordered, so sheet order IS chronological order -- taking
     the LAST matching row found while scanning forward is the most recent entry, full stop. (An
     earlier version compared ISO timestamp STRINGS instead and required a strict ">", which
     silently kept the WRONG row whenever two entries were appended within the same millisecond --
     exactly what happens when upsertMasterCellRow() writes a lazy baseline row immediately
     followed by the real submission's row in the same call, as it does the first time any
     pre-existing cell is reclassified after this feature shipped.) */
  var best=null;
  for(var r=1;r<data.length;r++){
    if(String(data[r][iNuc])!==String(nucleusId))continue;
    best={identity:data[r][iId],email:iEm>=0?data[r][iEm]:""};
  }
  return best;
}
/* Upserts ONE main-nucleus row in "Master cell list" after a new_identification/confirmation/
   discrepancy report comes in for it -- called from doPost, never from doGet. Recomputes the
   community tally fresh from the report-log sheets every time (tallyIdentitiesForNucleus above)
   rather than maintaining a running counter on the row itself, trading a little extra work per
   call for zero risk of the tally silently drifting out of sync with the underlying reports (e.g.
   if a report were ever edited or deleted by hand directly in the sheet). Does nothing if the
   "Master cell list" sheet doesn't exist yet -- Søren needs to import the CSV seed first; failing
   silently here (rather than throwing) means a not-yet-seeded deployment doesn't break normal
   identification submissions, it just means this particular feature isn't live yet. */
/* Find a row in "Master cell list" by its cell_key.                                 2026-08-26

   MEASURED on µJump's live sheet, 150,514 rows, a key in the middle (timeRowLookup() in
   Diagnostics.gs):

       pulling the whole cell_key column into JavaScript and walking it : 31.0 s
       createTextFinder() scoped to that column                         :  2.3 s
       same row from both                                               : yes

   That 31 seconds was being paid on EVERY identification submitted to µJump -- three call sites
   ran the identical loop -- which is why submitting there is slow and instant everywhere else.

   TWO things make this safe rather than merely fast, and both are load-bearing:

   1. THE FINDER IS SCOPED TO THE cell_key COLUMN, never the sheet. MASTER_LIST_HEADERS has a
      neighbor_10_keys column that stores cell keys, so a finder loosed on the whole sheet would
      cheerfully match a neighbour list before the row it was asked for -- and the caller would
      then write an identity into the wrong cell. matchEntireCell(true) is the second guard on the
      same problem: without it "N:12" matches "N:120".

   2. A NULL RESULT IS CONFIRMED BY THE OLD SCAN BEFORE IT IS BELIEVED. upsertMasterCellRow()
      treats "not found" as "append a new row", so a false miss does not fail loudly -- it
      silently duplicates a master row for a nucleus that already had one. A genuine miss is rare
      (only a nucleus absent from the seed), so paying the old 31 s exactly there costs almost
      nothing and removes the one way this change could corrupt data. */
function masterRowForKey_(sh,iKey,lastRow,cellKey){
  if(lastRow<2||iKey<0)return -1;
  var range=sh.getRange(2,iKey+1,lastRow-1,1);
  try{
    var hit=range.createTextFinder(cellKey).matchEntireCell(true).matchCase(true).findNext();
    if(hit)return hit.getRow();
  }catch(_tf){/* TextFinder unavailable or threw -- fall through to the scan, never to a guess */}
  // Null, or threw. Confirm before anybody appends on the strength of it.
  var keys=range.getValues();
  for(var r=0;r<keys.length;r++){if(String(keys[r][0])===cellKey)return r+2;}
  return -1;
}
function upsertMasterCellRow(nucleusId,submission){
  if(!nucleusId)return;
  /* NOT FOR THE FIVE TOOLS THAT USE THE SHARED SCHEMA (MasterList.gs, 2026-09-02). This function
     is dataset-agnostic -- SS() is whichever spreadsheet the request is for -- and the shared
     schema happens to contain cell_key, current_identity and identity_source too, so without
     this line it would find all three, write µJump's COLUMN LAYOUT into their positions, and
     append µJump-shaped rows for keys it could not find. Two schemas interleaved in one tab, and
     nothing later could untangle them. mlRecordReport() handles those datasets instead. */
  if(typeof ML_DATASETS!=="undefined"&&ML_DATASETS[CURRENT_DS])return;
  var ss=SS();
  var sh=ss.getSheetByName(MASTER_LIST_SHEET);
  if(!sh)return; // not seeded yet -- see comment above
  var lastRow=sh.getLastRow();
  if(lastRow<1)return;
  var header=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iKey=header.indexOf("cell_key"),iOwn=header.indexOf("own_verified_identity"),
      iMicrons=header.indexOf("microns_predicted"),iCur=header.indexOf("current_identity"),
      iSrc=header.indexOf("identity_source"),iCTop=header.indexOf("community_top_identity"),
      iCVotes=header.indexOf("community_votes_json"),iUpd=header.indexOf("last_updated"),
      iNucCol=header.indexOf("nucleus_id"),iKind=header.indexOf("kind");
  if(iKey<0||iCur<0||iSrc<0)return; // header doesn't match the expected schema -- bail out safely
  var cellKey="N:"+String(nucleusId);
  var rowIdx=masterRowForKey_(sh,iKey,lastRow,cellKey);
  var tally=tallyIdentitiesForNucleus(nucleusId);
  /* 2026-08-09 (performance audit) -- micronsPred/ownVerified/oldIdentity used to be three
     separate .getValue() calls, each its own SpreadsheetApp round trip. MASTER_LIST_HEADERS
     guarantees microns_predicted, own_verified_identity, current_identity are three CONSECUTIVE
     columns (indices 7,8,9), so on a normally-seeded sheet this is read in one batched call
     instead; readRunOk guards against a hand-edited/reordered header ever silently reading the
     wrong column, falling back to the original one-call-per-cell reads in that case. */
  var ownVerified="",micronsPred="",oldIdentity="";
  if(rowIdx>0){
    var readRunOk=(iOwn===iMicrons+1)&&(iCur===iOwn+1);
    if(readRunOk){
      var readRun=sh.getRange(rowIdx,iMicrons+1,1,3).getValues()[0];
      micronsPred=String(readRun[0]||"");ownVerified=String(readRun[1]||"");oldIdentity=String(readRun[2]||"");
    } else {
      ownVerified=String(sh.getRange(rowIdx,iOwn+1).getValue()||"");
      micronsPred=String(sh.getRange(rowIdx,iMicrons+1).getValue()||"");
      // Captured BEFORE the overwrite below -- this is the one place in the file that ever sees
      // both the old and new current_identity in the same call, which is why classification-
      // history logging (below, after the write) lives here rather than duplicating this lookup.
      oldIdentity=String(sh.getRange(rowIdx,iCur+1).getValue()||"");
    }
  }
  var currentIdentity,identitySource;
  if(ownVerified){currentIdentity=ownVerified;identitySource="own_verified";}
  else if(tally.top){currentIdentity=tally.top;identitySource="community_majority";}
  else if(micronsPred){currentIdentity=micronsPred;identitySource="microns_only";}
  else{currentIdentity="Unclassified";identitySource="unclassified";}
  var now=new Date().toISOString();
  if(rowIdx>0){
    /* Same batching idea as the read above: current_identity, identity_source,
       community_top_identity, community_votes_json, last_updated are five CONSECUTIVE columns
       (indices 9-13) on a normally-seeded sheet -- one setValues() call instead of up to five
       separate setValue() round trips. Falls back to the original per-cell writes if the header
       has ever been reordered/edited by hand, same defensive guard as the read above. */
    var writeRunOk=(iCTop===iCur+2)&&(iCVotes===iCur+3)&&(iUpd===iCur+4)&&(iSrc===iCur+1);
    if(writeRunOk){
      sh.getRange(rowIdx,iCur+1,1,5).setValues([[currentIdentity,identitySource,tally.top,JSON.stringify(tally.counts),now]]);
    } else {
      sh.getRange(rowIdx,iCur+1).setValue(currentIdentity);
      sh.getRange(rowIdx,iSrc+1).setValue(identitySource);
      if(iCTop>=0)sh.getRange(rowIdx,iCTop+1).setValue(tally.top);
      if(iCVotes>=0)sh.getRange(rowIdx,iCVotes+1).setValue(JSON.stringify(tally.counts));
      if(iUpd>=0)sh.getRange(rowIdx,iUpd+1).setValue(now);
    }
  } else {
    // Not in the seed (e.g. a nucleus added to ujump.html's dataset after the last seed export,
    // or reported on before Søren ever imports the CSV at all) -- self-heal by appending a
    // minimal row rather than silently dropping this cell out of the master list. voxel
    // coordinates and microns_predicted are left blank since this script has no access to
    // ujump.html's embedded static arrays; they'll fill in correctly next time Søren re-runs
    // build_master_cell_list.py and re-imports.
    var newRow=new Array(MASTER_LIST_HEADERS.length).fill("");
    newRow[iKey]=cellKey; if(iKind>=0)newRow[iKind]="main_nucleus"; if(iNucCol>=0)newRow[iNucCol]=nucleusId;
    newRow[iCur]=currentIdentity; newRow[iSrc]=identitySource;
    if(iCTop>=0)newRow[iCTop]=tally.top; if(iCVotes>=0)newRow[iCVotes]=JSON.stringify(tally.counts);
    if(iUpd>=0)newRow[iUpd]=now;
    sh.appendRow(newRow);
  }
  /* Classification history logging -- see CLASSIFICATION_HISTORY_SHEET's own comment above for
     the full design. Two independent things can happen here:
     1) BACKWARD-COMPATIBILITY BASELINE: this cell has a real MICrONS prediction on file but has
        never had a single classification-history row written for it (true for every one of the
        ~150k already-seeded rows the first time each is ever touched again) -- lazily seed a
        synthetic "microns_original" entry so the history panel has a real starting point instead
        of silently beginning mid-story. Runs at most once per cell, ever.
     2) THE ACTUAL CHANGE that triggered this call, only if it's a genuine identity change
        (currentIdentity !== oldIdentity) -- e.g. a Confirmation that doesn't move the tally
        writes no history row, so agreeing with the status quo doesn't spam the log. `submission`
        is the raw doPost payload (d) from the caller; optional so existing/other future callers
        of upsertMasterCellRow that don't have a submission handy (none currently) still work. */
  if(submission){
    var priorEntry=lastClassificationHistoryEntry(nucleusId);
    /* Fires once EVER per cell, regardless of oldIdentity's current value -- a cell already
       reclassified before this feature existed (oldIdentity !== micronsPred, e.g. an own_verified
       or pre-feature community override) still gets its true starting point recorded, even though
       the actual transition away from it predates any history row and can't be reconstructed. */
    if(micronsPred&&!priorEntry){
      appendClassificationHistory({nucleusId:nucleusId,rootId:submission.rootId,coord:submission.coord,
        previousIdentity:"",newIdentity:micronsPred,sourceType:"microns_original",
        certainty:"",comment:"MICrONS automatic prediction (baseline, recorded retroactively).",
        reporterName:"MICrONS",reporterEmail:""});
    }
    if(currentIdentity!==oldIdentity){
      var sourceType;
      /* forceSourceType (2026-08-09, undo/restore feature) -- lets a caller that already KNOWS
         this write is an undo or an administrator restore label it as such explicitly, rather than
         having it get misfiled as an ordinary "community"/"manual_revision" entry by the heuristic
         below. Only ever set by the restore_classification doPost branch. */
      if(submission.forceSourceType)sourceType=submission.forceSourceType;
      else if(identitySource==="own_verified")sourceType="verification";
      else if(priorEntry&&priorEntry.email&&submission.reporterEmail&&priorEntry.email===submission.reporterEmail)sourceType="manual_revision";
      else sourceType="community";
      appendClassificationHistory({nucleusId:nucleusId,rootId:submission.rootId,coord:submission.coord,
        previousIdentity:oldIdentity,newIdentity:currentIdentity,sourceType:sourceType,
        certainty:submission.certainty,comment:submission.comment,
        reporterName:submission.reporterName,reporterEmail:submission.reporterEmail});
    }
  }
}
/* Root IDs in "Master cell list" (2026-08-02, Søren: "there are no rootIDs in the master cell
   list. There should be! Both the MICrONS predicted ones and the reported rootIDs.") -- two
   separate columns, since they come from two structurally different sources:

   microns_root_id -- the cell's current default segmentation root ID, decoded from ujump.html's
   own embedded NH/NLO/HI packing (same decode as the live tool's rootId(i) JS function). This is a
   FIXED/geometric-like fact (same category as estimated_layer/neighbor_10_keys, not something a
   live report changes), and Apps Script has no access to ujump.html's embedded arrays to compute
   it -- so it's seeded from a small companion CSV (see dashboard-data-tools/
   build_root_id_backfill.py) via backfillMicronsRootIds() below, a ONE-TIME import+backfill, not
   something upserted live per report.

   community_root_ids -- the community-PROPOSED additional root IDs for a nucleus (from the
   existing "Root ID proposals" sheet/propose_root_id-remove_root_id doPost branches, which predate
   this column and already power the single-cell "?rootIds=" panel in ujump.html) -- this genuinely
   is live, so it's kept current two ways: upsertMasterCellRootIds() below is called from the
   propose_root_id/remove_root_id branches on every future submission, and
   backfillCommunityRootIds() (also below) is a one-time catch-up for every proposal submitted
   BEFORE this column existed -- the exact same "live update going forward + one-time historical
   backfill" split already used for current_identity/identity_source (see upsertMasterCellRow above
   + backfillCommunityIdentities further below), for the same reason: a live upsert alone can never
   reach reports that were already sitting in the sheet before the column was added. */
function activeRootIdsForNucleus(nucleusId){
  var ss=SS();
  var psh=ss.getSheetByName("Root ID proposals");
  if(!psh||psh.getLastRow()<2)return [];
  var pd=psh.getDataRange().getValues(),ph=pd[0];
  var iNuc=ph.indexOf("nucleusId"),iRoot=ph.indexOf("rootId"),iRem=ph.indexOf("removed");
  if(iNuc<0||iRoot<0)return [];
  var out=[],seen={};
  for(var p=1;p<pd.length;p++){
    if(String(pd[p][iNuc])!==String(nucleusId))continue;
    if(iRem>=0&&String(pd[p][iRem]).toLowerCase()==="yes")continue;
    var rid=String(pd[p][iRoot]||"");
    if(!rid||seen[rid])continue;
    seen[rid]=1;out.push(rid);
  }
  return out;
}
/* Keeps ONE nucleus's community_root_ids cell current -- called from doPost's propose_root_id and
   remove_root_id branches, mirroring how upsertMasterCellRow() keeps identity current per report.
   Fine to re-scan "Root ID proposals" fresh on every call (same cost class as
   tallyIdentitiesForNucleus(), already used the same way for single-nucleus updates elsewhere) --
   see backfillCommunityRootIds() below for why that pattern must NOT be looped over many nuclei
   at once. Does nothing if "Master cell list" doesn't exist yet, or this nucleus isn't in it (root
   IDs alone don't warrant self-healing a new row -- upsertMasterCellRow()'s identity-driven
   self-heal already covers that case when an identity report comes in). */
function upsertMasterCellRootIds(nucleusId){
  if(!nucleusId)return;
  var ss=SS();
  var sh=ss.getSheetByName(MASTER_LIST_SHEET);
  if(!sh)return;
  var iCRoots=ensureHeaderColumn(sh,"community_root_ids");
  var header=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iKey=header.indexOf("cell_key");
  if(iKey<0)return;
  var lastRow=sh.getLastRow();
  if(lastRow<2)return;
  var cellKey="N:"+String(nucleusId);
  var rowIdx=masterRowForKey_(sh,iKey,lastRow,cellKey);
  if(rowIdx<0)return;
  sh.getRange(rowIdx,iCRoots+1).setValue(JSON.stringify(activeRootIdsForNucleus(nucleusId)));
}
/* Merged-nucleus status on "Master cell list" -- 2026-08-09 (Søren: "improve merged nuclei
   support... Master Cell List should indicate merged nuclei status, community reports, and
   proposed resolutions"). Until now the merged_split doPost branch never touched Master cell
   list at all -- a merged-nucleus row in the ~150k-row sheet stayed permanently at whatever
   "merged" status (if any) it had at the one-time CSV seed, with no way to see from Master cell
   list alone that a cell has an OPEN merged-nucleus report, how many sub-identities have been
   proposed, or what they are. This closes that gap the same way upsertMasterCellRootIds() does:
   re-scan "Merged splits" fresh for this one nucleus (small sheet, same cost class as every
   other per-nucleus live upsert here), and write four additive columns.
   Columns (self-healed via ensureHeaderColumn, so this is safe to deploy against the
   already-seeded ~150k-row sheet with zero migration):
     merged_nucleus          "yes" once any live "Merged splits" report exists for this nucleus,
                              else left blank (never downgraded back to blank -- a merge report,
                              once made, is permanent evidence MICrONS's detector fused this
                              detection, even if every individual sub-report were later removed).
     merged_reports_count    distinct (groupId, subIndex) sub-nuclei reported so far -- the
                              "community reports" figure for this merged detection.
     merged_identified_types the "proposed resolutions" -- distinct identified sub-cell type
                              names reported, joined "; ", so the actual proposed identity(ies)
                              are visible without opening the Sheet's raw report log.
     merged_last_updated     timestamp of the most recent merged_split report for this nucleus.
   Does nothing if "Master cell list" doesn't exist yet, or this nucleus isn't in it -- merge
   status alone doesn't warrant self-healing a brand-new row (mirrors upsertMasterCellRootIds's
   own reasoning); a merged nucleus is by definition a MICrONS-detected main nucleus, so it
   should already be in the CSV seed as a "main_nucleus" row. */
function upsertMasterCellMergedStatus(nucleusId){
  if(!nucleusId)return;
  var ss=SS();
  var sh=ss.getSheetByName(MASTER_LIST_SHEET);
  if(!sh)return;
  var iMerged=ensureHeaderColumn(sh,"merged_nucleus");
  var iCount=ensureHeaderColumn(sh,"merged_reports_count");
  var iTypes=ensureHeaderColumn(sh,"merged_identified_types");
  var iUpd=ensureHeaderColumn(sh,"merged_last_updated");
  var header=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iKey=header.indexOf("cell_key");
  if(iKey<0)return;
  var lastRow=sh.getLastRow();
  if(lastRow<2)return;
  var cellKey="N:"+String(nucleusId);
  var rowIdx=masterRowForKey_(sh,iKey,lastRow,cellKey);
  if(rowIdx<0)return;

  var msh=ss.getSheetByName("Merged splits");
  if(!msh||msh.getLastRow()<2)return;
  var md=msh.getDataRange().getValues(),mh=md[0];
  var mNuc=mh.indexOf("nucleusId"),mGroup=mh.indexOf("groupId"),mSub=mh.indexOf("subIndex"),
      mId=mh.indexOf("identified"),mTs=mh.indexOf("timestamp");
  if(mNuc<0)return;
  var subs={},types={},lastTs="";
  for(var m=1;m<md.length;m++){
    if(String(md[m][mNuc])!==String(nucleusId))continue;
    // (groupId, subIndex) identifies one distinct sub-nucleus within one submission; falls back
    // to the raw row number if either column is somehow missing so this never divides-by-zero
    // into a single bucket on an old/malformed row.
    var subKey=(mGroup>=0?String(md[m][mGroup]):"")+":"+(mSub>=0?String(md[m][mSub]):m);
    subs[subKey]=1;
    var idName=mId>=0?String(md[m][mId]||"").trim():"";
    if(idName)types[idName]=1;
    var ts=mTs>=0?String(md[m][mTs]||""):"";
    if(ts>lastTs)lastTs=ts;
  }
  var reportsCount=Object.keys(subs).length;
  if(!reportsCount)return; // nothing live for this nucleus -- shouldn't normally happen (the
                            // caller just wrote a row), but guards a stale/edge call safely
  sh.getRange(rowIdx,iMerged+1).setValue("yes");
  sh.getRange(rowIdx,iCount+1).setValue(reportsCount);
  sh.getRange(rowIdx,iTypes+1).setValue(Object.keys(types).sort().join("; "));
  if(lastTs)sh.getRange(rowIdx,iUpd+1).setValue(lastTs);
}
/* One-time backfill for the four merged-nucleus columns above -- folds in every historical
   merged_split report submitted before this feature existed (same situation/fix pattern as
   backfillCommunityRootIds() above: tally the WHOLE "Merged splits" sheet ONCE, not once per
   nucleus, then one bulk read + one bulk write against the ~150k-row Master cell list, never
   per-row Range calls). RUN THIS ONCE after deploying this version; safe to re-run. */
function tallyMergedStatusFromSplits(){
  var ss=SS();
  var msh=ss.getSheetByName("Merged splits");
  var out={};
  if(!msh||msh.getLastRow()<2)return out;
  var md=msh.getDataRange().getValues(),mh=md[0];
  var mNuc=mh.indexOf("nucleusId"),mGroup=mh.indexOf("groupId"),mSub=mh.indexOf("subIndex"),
      mId=mh.indexOf("identified"),mTs=mh.indexOf("timestamp");
  if(mNuc<0)return out;
  for(var m=1;m<md.length;m++){
    var nid=String(md[m][mNuc]||"");if(!nid)continue;
    if(!out[nid])out[nid]={subs:{},types:{},lastTs:""};
    var subKey=(mGroup>=0?String(md[m][mGroup]):"")+":"+(mSub>=0?String(md[m][mSub]):m);
    out[nid].subs[subKey]=1;
    var idName=mId>=0?String(md[m][mId]||"").trim():"";
    if(idName)out[nid].types[idName]=1;
    var ts=mTs>=0?String(md[m][mTs]||""):"";
    if(ts>out[nid].lastTs)out[nid].lastTs=ts;
  }
  return out;
}
function backfillMergedNucleusStatus(){
  try{
    backfillMergedNucleusStatusImpl();
  }catch(err){
    Logger.log("backfillMergedNucleusStatus FAILED with a real exception: "+(err&&err.message?err.message:String(err)));
    Logger.log("Stack: "+(err&&err.stack?err.stack:"(no stack available)"));
    throw err;
  }
}
function backfillMergedNucleusStatusImpl(){
  var ss=SS();
  var sh=ss.getSheetByName(MASTER_LIST_SHEET);
  if(!sh){Logger.log('"Master cell list" sheet not found -- import the CSV seed first.');return;}
  var iMerged=ensureHeaderColumn(sh,"merged_nucleus");
  var iCount=ensureHeaderColumn(sh,"merged_reports_count");
  var iTypes=ensureHeaderColumn(sh,"merged_identified_types");
  var iUpd=ensureHeaderColumn(sh,"merged_last_updated");
  var header=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iKey=header.indexOf("cell_key");
  if(iKey<0){Logger.log("Master cell list header doesn't have cell_key -- unexpected, aborting.");return;}
  var lastRow=sh.getLastRow();
  if(lastRow<2){Logger.log('"Master cell list" is empty.');return;}

  var byNucleus=tallyMergedStatusFromSplits();
  var nucIds=Object.keys(byNucleus);
  Logger.log(nucIds.length+" distinct nuclei have at least one merged_split report on file.");
  if(!nucIds.length)return;

  var n=lastRow-1;
  var keyCol=sh.getRange(2,iKey+1,n,1).getValues();
  var mergedCol=sh.getRange(2,iMerged+1,n,1).getValues();
  var countCol=sh.getRange(2,iCount+1,n,1).getValues();
  var typesCol=sh.getRange(2,iTypes+1,n,1).getValues();
  var updCol=sh.getRange(2,iUpd+1,n,1).getValues();
  var rowByKey={};
  for(var r2=0;r2<n;r2++)rowByKey[String(keyCol[r2][0])]=r2;

  var updated=0,notFound=0;
  nucIds.forEach(function(nid){
    var cellKey="N:"+nid;
    var rIdx=rowByKey[cellKey];
    if(rIdx===undefined){notFound++;return;} // doesn't self-heal a missing row, same as backfillCommunityRootIds
    var info=byNucleus[nid];
    mergedCol[rIdx][0]="yes";
    countCol[rIdx][0]=Object.keys(info.subs).length;
    typesCol[rIdx][0]=Object.keys(info.types).sort().join("; ");
    if(info.lastTs)updCol[rIdx][0]=info.lastTs;
    updated++;
  });
  if(updated>0){
    sh.getRange(2,iMerged+1,n,1).setValues(mergedCol);
    sh.getRange(2,iCount+1,n,1).setValues(countCol);
    sh.getRange(2,iTypes+1,n,1).setValues(typesCol);
    sh.getRange(2,iUpd+1,n,1).setValues(updCol);
  }
  Logger.log("Backfill complete: "+updated+" rows updated with merged-nucleus status, "+notFound+" nuclei not found in Master cell list (skipped).");
}
/* One-time backfill for microns_root_id -- imports dashboard-data-tools/build_root_id_backfill.py's
   output CSV (cell_key, microns_root_id -- two columns, ~130k rows, small), which Søren must first
   import as a NEW sheet tab named exactly "Root ID backfill" (Insert new sheet, not "append to
   current sheet" -- same import step Søren already knows from the main seed). Wrapped in the same
   try/catch + Logger.log(message+stack) diagnostic pattern as backfillCommunityIdentities() (see
   that function's own comment for why: three earlier silent generic-error failures on that
   function made clear that swallowed exceptions are not an acceptable failure mode for a
   manually-run backfill). Follows the same call-count-safe design lessons from that same 3-round
   debugging: ONE bulk single-column read of the small source sheet, ONE bulk single-column read of
   Master List's cell_key for the lookup, then a targeted single-cell write per row that actually
   changes -- never a full-sheet read, never a per-row report-sheet re-scan. */
function backfillMicronsRootIds(){
  try{
    backfillMicronsRootIdsImpl();
  }catch(err){
    Logger.log("backfillMicronsRootIds FAILED with a real exception: "+(err&&err.message?err.message:String(err)));
    Logger.log("Stack: "+(err&&err.stack?err.stack:"(no stack available)"));
    throw err;
  }
}
function backfillMicronsRootIdsImpl(){
  var ss=SS();
  var sh=ss.getSheetByName(MASTER_LIST_SHEET);
  if(!sh){Logger.log('"Master cell list" sheet not found -- import the CSV seed first.');return;}
  var srcSh=ss.getSheetByName("Root ID backfill");
  if(!srcSh){Logger.log('"Root ID backfill" sheet not found -- run build_root_id_backfill.py and import its output CSV as a new sheet tab named exactly "Root ID backfill" first.');return;}
  var iRootCol=ensureHeaderColumn(sh,"microns_root_id");
  var header=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iKey=header.indexOf("cell_key");
  if(iKey<0){Logger.log("Master cell list header doesn't have cell_key -- unexpected, aborting.");return;}
  var lastRow=sh.getLastRow();
  if(lastRow<2){Logger.log('"Master cell list" is empty.');return;}

  var srcLastRow=srcSh.getLastRow();
  if(srcLastRow<2){Logger.log('"Root ID backfill" sheet is empty.');return;}
  var srcHeader=srcSh.getRange(1,1,1,srcSh.getLastColumn()).getValues()[0];
  var sKey=srcHeader.indexOf("cell_key"),sRoot=srcHeader.indexOf("microns_root_id");
  if(sKey<0||sRoot<0){Logger.log('"Root ID backfill" header must have cell_key and microns_root_id columns -- re-import without hand-editing the header.');return;}
  var srcN=srcLastRow-1;
  // Only 2 columns wide -- small even at ~130k rows, nothing like the 22-column crash-suspect read.
  var srcData=srcSh.getRange(2,1,srcN,srcSh.getLastColumn()).getValues();
  var rootByKey={};
  for(var s=0;s<srcN;s++){
    var rid=String(srcData[s][sRoot]||"");
    if(rid)rootByKey[String(srcData[s][sKey])]=rid;
  }
  Logger.log(Object.keys(rootByKey).length+" cells have a MICrONS root ID in the backfill source.");

  // UNLIKE backfillCommunityIdentities/backfillCommunityRootIds (which only ever touch a small
  // subset of rows -- the few hundred nuclei someone has actually reported on), MOST main nuclei
  // in this dataset DO have a MICrONS root ID (~130k of ~144k), so this backfill can end up
  // updating the vast majority of all rows on its first run. Writing those one setValue() call at
  // a time (the pattern used elsewhere in this file, safe there because it only ever applies to a
  // few hundred rows) would mean ~130,000 separate round trips here -- exactly the kind of call
  // volume the earlier backfillCommunityIdentities failures turned out to be caused by. Instead:
  // read the WHOLE target column into memory (one call, same size/cost as the cell_key read right
  // above), overlay every changed value in memory, then write the WHOLE column back in ONE bulk
  // setValues() call -- a handful of large-but-single calls instead of up to 130,000 small ones.
  var n=lastRow-1;
  var keyCol=sh.getRange(2,iKey+1,n,1).getValues();
  var curRootCol=sh.getRange(2,iRootCol+1,n,1).getValues();
  var updated=0,skipped=0;
  for(var r=0;r<n;r++){
    var key=String(keyCol[r][0]);
    var wantRoot=rootByKey[key];
    if(!wantRoot)continue; // no MICrONS root ID for this cell (unsegmented, or a standalone point)
    var haveRoot=String(curRootCol[r][0]||"");
    if(haveRoot===wantRoot){skipped++;continue;}
    curRootCol[r][0]=wantRoot;
    updated++;
  }
  if(updated>0)sh.getRange(2,iRootCol+1,n,1).setValues(curRootCol); // ONE bulk write for the whole column
  Logger.log("Backfill complete: "+updated+" rows updated with a MICrONS root ID, "+skipped+
    " already correct (skipped). Refresh anything reading this sheet to see the new column.");
}
/* One-time backfill for community_root_ids -- folds in every historical propose_root_id report
   submitted before this column existed (same historical-gap situation as
   backfillCommunityIdentities() below, same fix pattern: tally the WHOLE report sheet ONCE, not
   once per nucleus). RUN THIS ONCE after deploying this version; safe to re-run. */
function tallyActiveRootIdsFromProposals(){
  var ss=SS();
  var psh=ss.getSheetByName("Root ID proposals");
  var out={};
  if(!psh||psh.getLastRow()<2)return out;
  var pd=psh.getDataRange().getValues(),ph=pd[0]; // ONE read, not per nucleus
  var iNuc=ph.indexOf("nucleusId"),iRoot=ph.indexOf("rootId"),iRem=ph.indexOf("removed");
  if(iNuc<0||iRoot<0)return out;
  for(var p=1;p<pd.length;p++){
    var nid=String(pd[p][iNuc]||"");if(!nid)continue;
    if(iRem>=0&&String(pd[p][iRem]).toLowerCase()==="yes")continue;
    var rid=String(pd[p][iRoot]||"");if(!rid)continue;
    if(!out[nid])out[nid]=[];
    if(out[nid].indexOf(rid)<0)out[nid].push(rid);
  }
  return out;
}
function backfillCommunityRootIds(){
  try{
    backfillCommunityRootIdsImpl();
  }catch(err){
    Logger.log("backfillCommunityRootIds FAILED with a real exception: "+(err&&err.message?err.message:String(err)));
    Logger.log("Stack: "+(err&&err.stack?err.stack:"(no stack available)"));
    throw err;
  }
}
function backfillCommunityRootIdsImpl(){
  var ss=SS();
  var sh=ss.getSheetByName(MASTER_LIST_SHEET);
  if(!sh){Logger.log('"Master cell list" sheet not found -- import the CSV seed first.');return;}
  var iCRoots=ensureHeaderColumn(sh,"community_root_ids");
  var header=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iKey=header.indexOf("cell_key");
  if(iKey<0){Logger.log("Master cell list header doesn't have cell_key -- unexpected, aborting.");return;}
  var lastRow=sh.getLastRow();
  if(lastRow<2){Logger.log('"Master cell list" is empty.');return;}

  var idsByNucleus=tallyActiveRootIdsFromProposals();
  var nucIds=Object.keys(idsByNucleus);
  Logger.log(nucIds.length+" distinct nuclei have at least one active proposed root ID.");
  if(!nucIds.length)return;

  var n=lastRow-1;
  var keyCol=sh.getRange(2,iKey+1,n,1).getValues();
  var curCol=sh.getRange(2,iCRoots+1,n,1).getValues();
  var rowByKey={};
  for(var r2=0;r2<n;r2++)rowByKey[String(keyCol[r2][0])]=r2;

  // Same bulk-in-memory-then-one-write approach as backfillMicronsRootIdsImpl() above (see its
  // comment) -- currently this only ever touches a small subset of rows in practice (nuclei with
  // an actual proposal), so per-row writes were never really at risk here the way they were for
  // microns_root_id, but there's no reason to keep two different write strategies in this file
  // when the bulk approach is strictly safer in every case, including if proposal volume grows a
  // lot over time.
  var updated=0,skipped=0,notFound=0;
  nucIds.forEach(function(nid){
    var cellKey="N:"+nid;
    var rIdx=rowByKey[cellKey];
    if(rIdx===undefined){notFound++;return;} // this backfill doesn't self-heal a missing row; backfillCommunityIdentities() covers that
    var wantJson=JSON.stringify(idsByNucleus[nid]);
    var haveJson=String(curCol[rIdx][0]||"");
    if(haveJson===wantJson){skipped++;return;}
    curCol[rIdx][0]=wantJson;
    updated++;
  });
  if(updated>0)sh.getRange(2,iCRoots+1,n,1).setValues(curCol); // ONE bulk write for the whole column
  Logger.log("Backfill complete: "+updated+" rows updated, "+skipped+" already correct (skipped), "+
    notFound+" reported nuclei not found in \"Master cell list\" (run backfillCommunityIdentities() "+
    "first if these should already exist there).");
}
/* computed_volume_um3 in "Master cell list" (2026-08-02, Søren: "The master cell list should also
   contain the computed volumes.") -- the mesh-derived whole-cell volume from the "Compute volume"
   button (the "Computed volumes" sheet, see the save_computed_volume doPost branch's own long
   comment), folded into Master List alongside the existing nucleus_volume_um3 column (a DIFFERENT,
   precomputed value from Søren's CAVE nucleus_detection_v0 export -- the two are related but not
   interchangeable, see that column's own seed-time comment). "Computed volumes" is already
   upserted BY ROOT ID (one row per rootId, see that branch's own 2026-08-02 upsert-by-rootId note),
   so at most one volume exists per rootId to fold in -- no per-row dedup needed here.

   Join key: nucleusId when the report carries one (exact -- cell_key="N:"+nucleusId), else
   microns_root_id (the "Compute volume" button always computes the nucleus's OWN default root ID,
   automatically combining any additionally-proposed root IDs into one mesh -- see
   meshDlButtonHtml()'s own tooltip in ujump.html -- so a main nucleus's Computed-volumes rootId
   should always match its microns_root_id). A report with NEITHER a matching nucleusId NOR a
   matching microns_root_id (e.g. a "new cell, no nucleus" community report, which never gets a row
   in Master List at all -- see build_master_cell_list.py's own scope) has nothing to attach to and
   is silently skipped, same as backfillCommunityRootIds()'s "notFound" case above. */
function upsertMasterCellComputedVolume(rootId,nucleusId,volumeUm3){
  if(!rootId||!volumeUm3)return;
  var ss=SS();
  var sh=ss.getSheetByName(MASTER_LIST_SHEET);
  if(!sh)return;
  var iVolCol=ensureHeaderColumn(sh,"computed_volume_um3");
  var header=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iKey=header.indexOf("cell_key"),iRootCol=header.indexOf("microns_root_id");
  if(iKey<0)return;
  var lastRow=sh.getLastRow();
  if(lastRow<2)return;
  var n=lastRow-1;
  var rowIdx=-1;
  if(nucleusId){
    var cellKey="N:"+String(nucleusId);
    var keys=sh.getRange(2,iKey+1,n,1).getValues();
    for(var r=0;r<n;r++){if(String(keys[r][0])===cellKey){rowIdx=r+2;break;}}
  }
  if(rowIdx<0&&iRootCol>=0){
    var roots=sh.getRange(2,iRootCol+1,n,1).getValues();
    for(var r2=0;r2<n;r2++){if(String(roots[r2][0])===String(rootId)){rowIdx=r2+2;break;}}
  }
  if(rowIdx<0)return; // no matching Master List row (e.g. a new-cell-no-nucleus report) -- nothing to attach to
  sh.getRange(rowIdx,iVolCol+1).setValue(Math.round(volumeUm3*100)/100);
}
/* One-time backfill for computed_volume_um3 -- folds in every historical "Compute volume" click
   recorded before this column existed. Reads "Computed volumes" ONCE (that sheet grows one row per
   DISTINCT rootId ever computed, from manual button clicks -- small, nowhere near "Master cell
   list"'s ~150k scale), builds a nucleusId-keyed AND a rootId-keyed lookup, then applies the same
   bulk-read-whole-column-then-ONE-write pattern as backfillMicronsRootIds()/backfillCommunityRootIds()
   above (see their shared comment for why: no reason to risk per-row writes when the row count that
   might change is not reliably small, and the bulk approach is never worse). Wrapped in the same
   try/catch + Logger.log(message+stack) diagnostic pattern as every other backfill in this file. */
function backfillComputedVolumes(){
  try{
    backfillComputedVolumesImpl();
  }catch(err){
    Logger.log("backfillComputedVolumes FAILED with a real exception: "+(err&&err.message?err.message:String(err)));
    Logger.log("Stack: "+(err&&err.stack?err.stack:"(no stack available)"));
    throw err;
  }
}
function backfillComputedVolumesImpl(){
  var ss=SS();
  var sh=ss.getSheetByName(MASTER_LIST_SHEET);
  if(!sh){Logger.log('"Master cell list" sheet not found -- import the CSV seed first.');return;}
  var srcSh=ss.getSheetByName("Computed volumes");
  if(!srcSh||srcSh.getLastRow()<2){Logger.log('"Computed volumes" sheet not found or empty -- nothing to backfill yet.');return;}
  var iVolCol=ensureHeaderColumn(sh,"computed_volume_um3");
  var header=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iKey=header.indexOf("cell_key"),iRootCol=header.indexOf("microns_root_id");
  if(iKey<0){Logger.log("Master cell list header doesn't have cell_key -- unexpected, aborting.");return;}
  var lastRow=sh.getLastRow();
  if(lastRow<2){Logger.log('"Master cell list" is empty.');return;}

  var srcData=srcSh.getDataRange().getValues(),srcHead=srcData[0];
  var sRoot=srcHead.indexOf("rootId"),sNuc=srcHead.indexOf("nucleusId"),sVol=srcHead.indexOf("volumeUm3");
  if(sRoot<0||sVol<0){Logger.log('"Computed volumes" header must have rootId and volumeUm3 columns.');return;}
  var volByNucKey={},volByRoot={};
  for(var i=1;i<srcData.length;i++){
    var rid=String(srcData[i][sRoot]||"");if(!rid)continue;
    var vol=Number(srcData[i][sVol])||0;if(!vol)continue;
    var nid=sNuc>=0?String(srcData[i][sNuc]||""):"";
    if(nid)volByNucKey["N:"+nid]=vol;
    volByRoot[rid]=vol; // "Computed volumes" is already upserted by rootId, so at most one row per rootId
  }
  Logger.log(Object.keys(volByRoot).length+" distinct root IDs have a computed volume on file ("+
    Object.keys(volByNucKey).length+" of those also carry a nucleusId).");

  var n=lastRow-1;
  var keyCol=sh.getRange(2,iKey+1,n,1).getValues();
  var rootCol=iRootCol>=0?sh.getRange(2,iRootCol+1,n,1).getValues():null;
  var curVolCol=sh.getRange(2,iVolCol+1,n,1).getValues();
  var updated=0;
  for(var r=0;r<n;r++){
    var key=String(keyCol[r][0]);
    var want=volByNucKey[key];
    if(want===undefined&&rootCol){
      var rid2=String(rootCol[r][0]||"");
      if(rid2)want=volByRoot[rid2];
    }
    if(want===undefined)continue;
    want=Math.round(want*100)/100;
    var have=Number(curVolCol[r][0])||0;
    if(have===want)continue;
    curVolCol[r][0]=want;
    updated++;
  }
  if(updated>0)sh.getRange(2,iVolCol+1,n,1).setValues(curVolCol); // ONE bulk write for the whole column
  Logger.log("Backfill complete: "+updated+" rows updated with a computed (mesh) volume. Refresh "+
    "anything reading this sheet to see the new column.");
}
/* Live organelle upsert into "Master cell list" (2026-08-04, Søren: "I reported an unclassified
   cell as an astrocyte and reported centriole and primary cilium location. However, the centriole
   and primary cilium data did not show in the Master cell list even though it was listed in the
   organelle locations.") -- ROOT CAUSE: unlike new_identification/confirmation (which both call
   upsertMasterCellRow() on every submission, see the "organelle_location" doPost branch above),
   organelle_location reports only ever got appended to "Organelle locations" and NEVER touched
   "Master cell list" at all. has_cilium/has_centriole/cilium_length_um/centriole_dist_um were
   originally seeded once from Søren's own ground-truth dataset (see build_master_cell_list.py)
   and treated as fixed thereafter -- true for THAT dataset, but not for a brand-new community
   report landing after the seed. dashboardLive() already works around this with its own in-memory
   "live top-up" (merging in any not-yet-reflected "Organelle locations" row, purely for the
   DASHBOARD's charts, see its own long comment above) -- but that top-up only lives inside
   dashboardLive()'s return value, never written back to the actual sheet ROWS, so anyone looking
   at (or filtering/exporting) "Master cell list" directly never saw it. This is that missing
   write-back, plus a one-time backfill for every historical report below.

   Only fires with a real nucleusId -- same "no single row to attach to" situation as
   upsertMasterCellComputedVolume() above (a merged-nucleus sub-cell report deliberately posts a
   BLANK nucleusId, see ujump.html's own comment on that call site). Only "centriole"/"cilium" are
   tracked here -- the other 14 organelle kinds (lysosomes, mitochondria, etc., added in the
   organelle-report generalization) have no equivalent Master List columns, same scope
   dashboardLive()'s own top-up already limited itself to.

   Geometry: pointA/pointB/coord are raw voxel "x,y,z" strings in the tool's usual 4x4x40nm-
   anisotropic convention (same units as NX/NY/NZ everywhere else) -- coord is the REPORTING
   NUCLEUS's own position (see the doGet "?allOrganelles=1" comment: "coord... doubles as the
   reporting nucleus's own position"), which is exactly what's needed to compute
   centriole_dist_um server-side with no access to ujump.html's embedded NX/NY/NZ arrays.
   parseOrganelleVoxel()/organelleDistUm() below reproduce build_master_cell_list.py's
   cilium_len_um()/dist_um() exactly (4nm/4nm/40nm per axis, /1000 for µm, rounded to 2dp) and
   also match dashboardLive()'s own inline parseVoxGs()/voxDistUmGs() helpers, so a live-upserted
   value, a re-seeded value, and a dashboard-chart value never disagree.

   A report only ever POSITIVELY confirms a structure -- there's no "checked, none found" report
   type in this schema -- so this only ever SETS has_cilium/has_centriole to 1 and never clears an
   existing 1, and cilium_checked is set to 1 only for an actual cilium report (finding one
   necessarily means the cell was examined for one; there's no "centriole_checked" column to
   mirror in the schema).

   2026-08-07 EXTENSION: also tracks kind==="microglia_plug" and kind==="nucleoplasmic_reticulum_2"
   (the astrocyte "holes" Søren calls NR type II) -- Søren: "where are all the organelle
   identifications? Why are they not added to the Master cell list?" after the bulk import of his
   historical plug/hole data. Unlike cilium/centriole (which are naturally ~one-per-cell, so a
   plain has_X boolean was enough), a single microglia can legitimately carry many plugs and a
   single astrocyte many holes (Søren's own data has runs of 10+ plug rows under one microglia --
   see [[new-cell-detection-must-check-mergeddata]]'s sibling session), so these two also get a
   _count column, not just has_X. Rather than incrementing a running counter on every submission
   (which would double-count on a backfill re-run), countOrganelleReports() below recomputes the
   TRUE count fresh from "Organelle locations" every time it's called -- same "recompute rather than
   accumulate" philosophy as tallyIdentitiesForNucleus()/aggregateAll() elsewhere in this file, so a
   live upsert, a backfill, and a re-run of either can never drift out of sync with each other.
   These two kinds are otherwise still the ONLY 4 organelle kinds tracked at the Master List row
   level (cilium, centriole, microglia_plug, nucleoplasmic_reticulum_2) -- the remaining organelle/
   structure kinds from the report-generalization work still have no equivalent columns; add one
   the same way if a future request needs it. */
function parseOrganelleVoxel(s){
  if(!s)return null;
  var p=String(s).split(",").map(function(x){return parseFloat(x);});
  if(p.length<3||p.slice(0,3).some(function(x){return !isFinite(x);}))return null;
  return p;
}
function organelleDistUm(p1,p2){
  if(!p1||!p2)return null;
  var dx=(p1[0]-p2[0])*4,dy=(p1[1]-p2[1])*4,dz=(p1[2]-p2[2])*40;
  return Math.round(Math.sqrt(dx*dx+dy*dy+dz*dz)/1000*100)/100;
}
/* Fresh count of "Organelle locations" rows matching (nucleusId, kind) -- used for
   microglia_plug/nucleoplasmic_reticulum_2, which can legitimately repeat many times per nucleus
   (unlike cilium/centriole, tracked as a plain has_X boolean). ONE bulk two-column read, filtered
   in memory -- same cost class as tallyIdentitiesForNucleus(), an already-accepted per-call full-
   column scan elsewhere in this file. */
function countOrganelleReports(nucleusId,kind){
  var ss=SS();
  var osh=ss.getSheetByName("Organelle locations");
  if(!osh||osh.getLastRow()<2)return 0;
  var oh=osh.getRange(1,1,1,osh.getLastColumn()).getValues()[0];
  var oiN=oh.indexOf("nucleusId"),oiK=oh.indexOf("kind");
  if(oiN<0||oiK<0)return 0;
  var n=osh.getLastRow()-1;
  var nCol=osh.getRange(2,oiN+1,n,1).getValues(),kCol=osh.getRange(2,oiK+1,n,1).getValues();
  var count=0,want=String(nucleusId);
  for(var r=0;r<n;r++){if(String(nCol[r][0])===want&&String(kCol[r][0])===kind)count++;}
  return count;
}
function upsertMasterCellOrganelle(nucleusId,kind,pointA,pointB,coord){
  var TRACKED=["centriole","cilium","microglia_plug","nucleoplasmic_reticulum_2"];
  if(!nucleusId||TRACKED.indexOf(kind)<0)return;
  var ss=SS();
  var sh=ss.getSheetByName(MASTER_LIST_SHEET);
  if(!sh)return;
  var lastRow=sh.getLastRow();
  if(lastRow<2)return;
  if(kind==="microglia_plug"||kind==="nucleoplasmic_reticulum_2"){
    // ensureHeaderColumn first -- these 2 columns weren't in the original seed/first extension.
    ensureHeaderColumn(sh,"has_microglia_plug");ensureHeaderColumn(sh,"microglia_plug_count");
    ensureHeaderColumn(sh,"has_astrocyte_hole");ensureHeaderColumn(sh,"astrocyte_hole_count");
  }
  var header=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iKey=header.indexOf("cell_key"),iHasCil=header.indexOf("has_cilium"),
      iCilChecked=header.indexOf("cilium_checked"),iCilLen=header.indexOf("cilium_length_um"),
      iHasCent=header.indexOf("has_centriole"),iCentDist=header.indexOf("centriole_dist_um"),
      iHasPlug=header.indexOf("has_microglia_plug"),iPlugCount=header.indexOf("microglia_plug_count"),
      iHasHole=header.indexOf("has_astrocyte_hole"),iHoleCount=header.indexOf("astrocyte_hole_count");
  if(iKey<0)return;
  var n=lastRow-1;
  var cellKey="N:"+String(nucleusId);
  var rowIdx=-1;
  var keys=sh.getRange(2,iKey+1,n,1).getValues();
  for(var r=0;r<n;r++){if(String(keys[r][0])===cellKey){rowIdx=r+2;break;}}
  if(rowIdx<0)return; // not in the seed / no self-heal path here (unlike upsertMasterCellRow) -- nothing to attach to yet
  var pA=parseOrganelleVoxel(pointA),pB=parseOrganelleVoxel(pointB),pC=parseOrganelleVoxel(coord);
  if(kind==="cilium"){
    if(iHasCil>=0)sh.getRange(rowIdx,iHasCil+1).setValue(1);
    if(iCilChecked>=0)sh.getRange(rowIdx,iCilChecked+1).setValue(1);
    if(iCilLen>=0&&pA&&pB){var len=organelleDistUm(pA,pB);if(len!==null)sh.getRange(rowIdx,iCilLen+1).setValue(len);}
  } else if(kind==="centriole"){
    if(iHasCent>=0)sh.getRange(rowIdx,iHasCent+1).setValue(1);
    if(iCentDist>=0&&pA&&pC){var dist=organelleDistUm(pA,pC);if(dist!==null)sh.getRange(rowIdx,iCentDist+1).setValue(dist);}
  } else if(kind==="microglia_plug"){
    var plugN=countOrganelleReports(nucleusId,"microglia_plug");
    if(iHasPlug>=0&&plugN>0)sh.getRange(rowIdx,iHasPlug+1).setValue(1);
    if(iPlugCount>=0)sh.getRange(rowIdx,iPlugCount+1).setValue(plugN);
  } else if(kind==="nucleoplasmic_reticulum_2"){
    var holeN=countOrganelleReports(nucleusId,"nucleoplasmic_reticulum_2");
    if(iHasHole>=0&&holeN>0)sh.getRange(rowIdx,iHasHole+1).setValue(1);
    if(iHoleCount>=0)sh.getRange(rowIdx,iHoleCount+1).setValue(holeN);
  }
}
/* One-time backfill for every historical organelle_location report submitted before the live
   upsert above existed -- same try/catch-Logger.log diagnostic pattern, and the same bulk-read-
   whole-column + overlay + ONE-write-per-column pattern as every other backfill in this file
   (reasoning: a large fraction of Master List's rows could plausibly have a historical organelle
   report by now, so per-row writes are the wrong default from the start -- see the "bulk-write-
   vs-per-row-write" lesson on backfillMicronsRootIds() above). Reads "Organelle locations" ONCE,
   keeps only the LAST report per nucleus+kind (repeat submissions overwrite, same "latest wins"
   behaviour as the live upsert), then overlays onto Master List's relevant columns. */
function backfillOrganelleObservations(){
  try{
    backfillOrganelleObservationsImpl();
  }catch(err){
    Logger.log("backfillOrganelleObservations FAILED with a real exception: "+(err&&err.message?err.message:String(err)));
    Logger.log("Stack: "+(err&&err.stack?err.stack:"(no stack available)"));
    throw err;
  }
}
function backfillOrganelleObservationsImpl(){
  var ss=SS();
  var sh=ss.getSheetByName(MASTER_LIST_SHEET);
  if(!sh){Logger.log('"Master cell list" sheet not found -- import the CSV seed first.');return;}
  var osh=ss.getSheetByName("Organelle locations");
  if(!osh||osh.getLastRow()<2){Logger.log('"Organelle locations" sheet not found or empty -- nothing to backfill yet.');return;}
  // 2026-08-07: also backfill microglia_plug/nucleoplasmic_reticulum_2 counts (see
  // upsertMasterCellOrganelle()'s own comment for why these 2 need a _count column, not just
  // has_X) -- ensureHeaderColumn first since these weren't in the original seed.
  ensureHeaderColumn(sh,"has_microglia_plug");ensureHeaderColumn(sh,"microglia_plug_count");
  ensureHeaderColumn(sh,"has_astrocyte_hole");ensureHeaderColumn(sh,"astrocyte_hole_count");
  var header=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iKey=header.indexOf("cell_key"),iHasCil=header.indexOf("has_cilium"),
      iCilChecked=header.indexOf("cilium_checked"),iCilLen=header.indexOf("cilium_length_um"),
      iHasCent=header.indexOf("has_centriole"),iCentDist=header.indexOf("centriole_dist_um"),
      iHasPlug=header.indexOf("has_microglia_plug"),iPlugCount=header.indexOf("microglia_plug_count"),
      iHasHole=header.indexOf("has_astrocyte_hole"),iHoleCount=header.indexOf("astrocyte_hole_count");
  if(iKey<0||iHasCil<0||iHasCent<0){Logger.log("Master cell list header missing an expected organelle column -- aborting.");return;}
  var lastRow=sh.getLastRow();
  if(lastRow<2){Logger.log('"Master cell list" is empty.');return;}
  var n=lastRow-1;

  var od=osh.getDataRange().getValues(),oh=od[0];
  var oiN=oh.indexOf("nucleusId"),oiK=oh.indexOf("kind"),oiA=oh.indexOf("pointA"),
      oiB=oh.indexOf("pointB"),oiC=oh.indexOf("coord");
  var cilByNuc={},centByNuc={},plugCountByNuc={},holeCountByNuc={};
  for(var i=1;i<od.length;i++){
    var nid=String(oiN>=0?(od[i][oiN]||""):"");
    if(!nid)continue;
    var kind=String(oiK>=0?(od[i][oiK]||""):"");
    if(kind==="cilium"){
      var a=parseOrganelleVoxel(oiA>=0?od[i][oiA]:null),b=parseOrganelleVoxel(oiB>=0?od[i][oiB]:null);
      cilByNuc[nid]=(a&&b)?organelleDistUm(a,b):null; // null = report found, but geometry unparsable -- still counts as "has one"
    } else if(kind==="centriole"){
      var nucPos=parseOrganelleVoxel(oiC>=0?od[i][oiC]:null),cPos=parseOrganelleVoxel(oiA>=0?od[i][oiA]:null);
      centByNuc[nid]=(nucPos&&cPos)?organelleDistUm(nucPos,cPos):null;
    } else if(kind==="microglia_plug"){
      plugCountByNuc[nid]=(plugCountByNuc[nid]||0)+1;
    } else if(kind==="nucleoplasmic_reticulum_2"){
      holeCountByNuc[nid]=(holeCountByNuc[nid]||0)+1;
    }
  }
  Logger.log(Object.keys(cilByNuc).length+" nuclei have a historical cilium report, "+
    Object.keys(centByNuc).length+" have a historical centriole report, "+
    Object.keys(plugCountByNuc).length+" have a historical microglia plug report, "+
    Object.keys(holeCountByNuc).length+" have a historical astrocyte hole (NR type II) report.");

  var keyCol=sh.getRange(2,iKey+1,n,1).getValues();
  var hasCilCol=sh.getRange(2,iHasCil+1,n,1).getValues();
  var cilCheckedCol=iCilChecked>=0?sh.getRange(2,iCilChecked+1,n,1).getValues():null;
  var cilLenCol=iCilLen>=0?sh.getRange(2,iCilLen+1,n,1).getValues():null;
  var hasCentCol=sh.getRange(2,iHasCent+1,n,1).getValues();
  var centDistCol=iCentDist>=0?sh.getRange(2,iCentDist+1,n,1).getValues():null;
  var hasPlugCol=sh.getRange(2,iHasPlug+1,n,1).getValues();
  var plugCountCol=sh.getRange(2,iPlugCount+1,n,1).getValues();
  var hasHoleCol=sh.getRange(2,iHasHole+1,n,1).getValues();
  var holeCountCol=sh.getRange(2,iHoleCount+1,n,1).getValues();

  var updated=0;
  for(var r=0;r<n;r++){
    var key=String(keyCol[r][0]);
    if(key.slice(0,2)!=="N:")continue; // only main nuclei carry a real nucleusId to join organelle reports against
    var nid=key.slice(2);
    var changed=false;
    if(cilByNuc.hasOwnProperty(nid)){
      if(String(hasCilCol[r][0])!=="1"){hasCilCol[r][0]=1;changed=true;}
      if(cilCheckedCol&&String(cilCheckedCol[r][0])!=="1"){cilCheckedCol[r][0]=1;changed=true;}
      if(cilLenCol&&cilByNuc[nid]!==null&&Number(cilLenCol[r][0])!==cilByNuc[nid]){cilLenCol[r][0]=cilByNuc[nid];changed=true;}
    }
    if(centByNuc.hasOwnProperty(nid)){
      if(String(hasCentCol[r][0])!=="1"){hasCentCol[r][0]=1;changed=true;}
      if(centDistCol&&centByNuc[nid]!==null&&Number(centDistCol[r][0])!==centByNuc[nid]){centDistCol[r][0]=centByNuc[nid];changed=true;}
    }
    if(plugCountByNuc.hasOwnProperty(nid)){
      if(String(hasPlugCol[r][0])!=="1"){hasPlugCol[r][0]=1;changed=true;}
      if(Number(plugCountCol[r][0])!==plugCountByNuc[nid]){plugCountCol[r][0]=plugCountByNuc[nid];changed=true;}
    }
    if(holeCountByNuc.hasOwnProperty(nid)){
      if(String(hasHoleCol[r][0])!=="1"){hasHoleCol[r][0]=1;changed=true;}
      if(Number(holeCountCol[r][0])!==holeCountByNuc[nid]){holeCountCol[r][0]=holeCountByNuc[nid];changed=true;}
    }
    if(changed)updated++;
  }
  if(updated>0){
    sh.getRange(2,iHasCil+1,n,1).setValues(hasCilCol);
    if(cilCheckedCol)sh.getRange(2,iCilChecked+1,n,1).setValues(cilCheckedCol);
    if(cilLenCol)sh.getRange(2,iCilLen+1,n,1).setValues(cilLenCol);
    sh.getRange(2,iHasCent+1,n,1).setValues(hasCentCol);
    if(centDistCol)sh.getRange(2,iCentDist+1,n,1).setValues(centDistCol);
    sh.getRange(2,iHasPlug+1,n,1).setValues(hasPlugCol);
    sh.getRange(2,iPlugCount+1,n,1).setValues(plugCountCol);
    sh.getRange(2,iHasHole+1,n,1).setValues(hasHoleCol);
    sh.getRange(2,iHoleCount+1,n,1).setValues(holeCountCol);
  }
  Logger.log("Backfill complete: "+updated+" rows updated with a historical cilium/centriole/"+
    "microglia-plug/astrocyte-hole observation.");
}
/* One-time correction for a naming-casing bug in the guided-identification client (fixed
   2026-08-08, see canonSubmitName() in ujump.html): 3 leaf display names ("Perivascular
   fibroblast"/"Pia mater fibroblast"/"Pial sheath fibroblast") differed only in the
   capitalization of "fibroblast" from their canonical own-verified type string ("...Fibroblast"),
   and a 4th ("Perivascular macrophage") should always have collapsed into the broader
   "Macrophage" bucket -- the client posted these display strings verbatim as `identified` for
   every guided-ID submission before the fix, so any nucleus whose MOST RECENT community report
   went through one of these leaves ended up with a current_identity that doesn't match the
   hundreds of own-verified rows of the same real type, showing up as a second, near-empty bucket
   on the dashboard's "Cells per cell type"/cilia-percent-by-type charts (Søren, 2026-08-08:
   "there are perivascular fibroblasts and pia mater fibroblasts twice ... the second ones only
   contain a single point").

   Two-step fix: (1) rewrite the mismatched string wherever it appears in the "identified" column
   of every report sheet that feeds tallyIdentitiesForNucleus()/the dashboard's live cilium-length
   top-up -- "New identifications", "Confirmations", "Discrepancies", "Merged splits", "Organelle
   locations" -- so future recomputes never reproduce the bug; (2) re-run upsertMasterCellRow() for
   every nucleus whose reports were touched, so its current_identity/community_top_identity in
   "Master cell list" immediately reflects the corrected casing rather than waiting on its next
   organic report. Same bulk-read-whole-column + overlay + ONE write per sheet discipline as every
   other backfill in this file. Safe to re-run (idempotent -- a second pass finds nothing left to
   fix, since every value is already canonical). */
function fixLeafNamingMismatches(){
  try{
    fixLeafNamingMismatchesImpl();
  }catch(err){
    Logger.log("fixLeafNamingMismatches FAILED with a real exception: "+(err&&err.message?err.message:String(err)));
    Logger.log("Stack: "+(err&&err.stack?err.stack:"(no stack available)"));
    throw err;
  }
}
function fixLeafNamingMismatchesImpl(){
  var CANON={"Perivascular fibroblast":"Perivascular Fibroblast","Pia mater fibroblast":"Pia mater Fibroblast",
    "Pial sheath fibroblast":"Pial sheath Fibroblast","Perivascular macrophage":"Macrophage"};
  var ss=SS();
  var SHEETS=["New identifications","Confirmations","Discrepancies","Merged splits","Organelle locations"];
  var touchedNuclei={},totalFixed=0;
  SHEETS.forEach(function(sheetName){
    var sh=ss.getSheetByName(sheetName);
    if(!sh||sh.getLastRow()<2){Logger.log(sheetName+": sheet not found or empty, skipping.");return;}
    var header=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
    var iId=header.indexOf("identified"),iNuc=header.indexOf("nucleusId");
    if(iId<0){Logger.log(sheetName+': no "identified" column, skipping.');return;}
    var n=sh.getLastRow()-1;
    var idCol=sh.getRange(2,iId+1,n,1).getValues();
    var nucCol=iNuc>=0?sh.getRange(2,iNuc+1,n,1).getValues():null;
    var changed=false,fixedHere=0;
    for(var r=0;r<n;r++){
      var raw=String(idCol[r][0]||"");
      if(CANON[raw]){
        idCol[r][0]=CANON[raw];
        changed=true;fixedHere++;totalFixed++;
        if(nucCol&&nucCol[r][0])touchedNuclei[String(nucCol[r][0])]=1;
      }
    }
    if(changed)sh.getRange(2,iId+1,n,1).setValues(idCol);
    Logger.log(sheetName+": "+fixedHere+" row(s) corrected.");
  });
  var nucIds=Object.keys(touchedNuclei);
  nucIds.forEach(function(nid){upsertMasterCellRow(nid);});
  Logger.log("fixLeafNamingMismatches complete: "+totalFixed+" report rows corrected across "+
    SHEETS.length+" sheets, "+nucIds.length+" Master List nuclei recomputed.");
}
/* One-time correction for cilium_length_um/centriole_dist_um/nucleus_volume_um3 values corrupted
   when "Master cell list" was first seeded (2026-08-08, Søren: "How come I can only count 9 points
   in the dashboard graph for Dural border cells primary cilium length, when I can see in the graph
   above that 79/419 cells have a primary cilium?"). ROOT CAUSE: importing master_cell_list_seed.csv
   into Google Sheets, under Søren's Danish-locale spreadsheet, let Sheets' "convert text to
   numbers, dates and formulas automatically" auto-detection reinterpret a decimal-looking string
   like "2.59" as a European D.M date rather than a number, silently storing a Date object instead.
   has_cilium/cilium_checked (plain "1"/blank flags) were never at risk -- only the 3 genuinely
   decimal columns were. safeNumGs() (see its own 2026-08-02 comment above) already stops the
   resulting garbage from DISPLAYING (previously "-2 trillion µm" on these exact charts) by
   treating a Date cell as "no data" -- but that just makes the value silently MISSING instead of
   wrong, which is the 79-vs-9 gap Søren is seeing: most of the 79 Dural-border cilium
   measurements are sitting in the sheet as Date objects, not numbers.

   Fix: dashboard-data-tools/build_numeric_observations_backfill.py re-derives all 3 columns fresh
   from ujump.html's own embedded data (untouched by the Sheets import bug) into a small companion
   CSV (cell_key + the 3 numeric columns, ~150k rows -- same scale/pattern as
   build_root_id_backfill.py). Søren imports it as a new sheet tab named exactly "Numeric
   observations backfill" (Insert new sheet -- same step as the root-ID backfill), ideally with
   "Convert text to numbers, dates, and formulas automatically" UNCHECKED this time (removes any
   chance of the same corruption happening to this NEW sheet before this function even runs), then
   runs backfillNumericObservations() once from the Apps Script editor. The function itself
   re-parses every value with parseFloat() (immune to cell TYPE, works whether the source cell
   ended up text or a correctly-imported number) and writes each one back with
   Range.setValue(numberValue) -- setValue() with a genuine JS number sets a real numeric cell type
   directly via the Sheets API, which never goes through CSV-import text-parsing/date-detection at
   all, so the TARGET "Master cell list" cells can never be corrupted by this bug again regardless
   of spreadsheet locale. Same bulk-read-whole-column + overlay + ONE write per column pattern as
   every other backfill in this file. Safe to re-run (idempotent, always re-derives from the same
   source CSV). */
function backfillNumericObservations(){
  try{
    backfillNumericObservationsImpl();
  }catch(err){
    Logger.log("backfillNumericObservations FAILED with a real exception: "+(err&&err.message?err.message:String(err)));
    Logger.log("Stack: "+(err&&err.stack?err.stack:"(no stack available)"));
    throw err;
  }
}
function backfillNumericObservationsImpl(){
  var ss=SS();
  var sh=ss.getSheetByName(MASTER_LIST_SHEET);
  if(!sh){Logger.log('"Master cell list" sheet not found -- import the CSV seed first.');return;}
  var bsh=ss.getSheetByName("Numeric observations backfill");
  if(!bsh||bsh.getLastRow()<2){Logger.log('"Numeric observations backfill" sheet not found or empty -- import numeric_observations_backfill.csv as a tab named exactly that first.');return;}
  var header=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iKey=header.indexOf("cell_key"),iCilLen=header.indexOf("cilium_length_um"),
      iCentDist=header.indexOf("centriole_dist_um"),iVol=header.indexOf("nucleus_volume_um3");
  if(iKey<0||iCilLen<0||iCentDist<0||iVol<0){Logger.log("Master cell list header missing an expected numeric column -- aborting.");return;}
  var n=sh.getLastRow()-1;
  if(n<1){Logger.log('"Master cell list" is empty.');return;}
  var keys=sh.getRange(2,iKey+1,n,1).getValues();
  var rowByKey={};
  for(var r=0;r<n;r++){rowByKey[String(keys[r][0])]=r;}

  var bdata=bsh.getDataRange().getValues(),bh=bdata[0];
  var biKey=bh.indexOf("cell_key"),biCilLen=bh.indexOf("cilium_length_um"),
      biCentDist=bh.indexOf("centriole_dist_um"),biVol=bh.indexOf("nucleus_volume_um3");
  if(biKey<0){Logger.log('"Numeric observations backfill" header missing cell_key -- aborting.');return;}
  /* Diagnostic (2026-08-08, Søren saw cilium_length_um/centriole_dist_um both update in the
     thousands but nucleus_volume_um3 update as exactly 0 -- with the source CSV itself confirmed
     clean, the two most likely causes are (a) this sheet's own "nucleus_volume_um3" header wasn't
     found (biVol===-1, e.g. a stray space or the column shifted during import) or (b) EVERY
     nucleus_volume_um3 cell in THIS sheet got Date-converted on import (the exact bug this backfill
     exists to fix, just recurring one level up). Logging which case it is up front, instead of
     just producing a silent 0, so the next run's log makes the cause obvious without guessing. */
  Logger.log('"Numeric observations backfill" columns found -- cell_key:'+biKey+' cilium_length_um:'+
    biCilLen+' centriole_dist_um:'+biCentDist+' nucleus_volume_um3:'+biVol+' (a -1 means that header '+
    'was not found in row 1 of that sheet -- check for a typo/extra space/shifted column).');
  if(biVol<0)Logger.log('WARNING: "nucleus_volume_um3" header not found in "Numeric observations '+
    'backfill" -- every nucleus_volume_um3 value will be skipped this run. Check cell D1 of that '+
    'sheet reads exactly "nucleus_volume_um3".');

  var cilLenCol=sh.getRange(2,iCilLen+1,n,1).getValues();
  var centDistCol=sh.getRange(2,iCentDist+1,n,1).getValues();
  var volCol=sh.getRange(2,iVol+1,n,1).getValues();
  // Same Date-guard as safeNumGs(): a source cell that itself got misconverted on THIS sheet's
  // own import is treated as no data, never blindly cast.
  var dateSkipVol=0,blankSkipVol=0;
  function parseNumericCell(v){
    if(v===undefined||v===null||v===""){return null;}
    if(v instanceof Date){return null;}
    var n2=parseFloat(v);
    return isFinite(n2)?n2:null;
  }
  var updatedCil=0,updatedCent=0,updatedVol=0,notFound=0;
  for(var i=1;i<bdata.length;i++){
    var key=String(bdata[i][biKey]||"");
    if(!key)continue;
    var rowIdx=rowByKey[key];
    if(rowIdx===undefined){notFound++;continue;}
    var cl=biCilLen>=0?parseNumericCell(bdata[i][biCilLen]):null;
    var cd=biCentDist>=0?parseNumericCell(bdata[i][biCentDist]):null;
    var rawVol=biVol>=0?bdata[i][biVol]:undefined;
    var nv=biVol>=0?parseNumericCell(rawVol):null;
    if(nv===null){
      if(rawVol instanceof Date)dateSkipVol++;
      else if(rawVol===undefined||rawVol===null||rawVol==="")blankSkipVol++;
    }
    if(cl!==null&&cilLenCol[rowIdx][0]!==cl){cilLenCol[rowIdx][0]=cl;updatedCil++;}
    if(cd!==null&&centDistCol[rowIdx][0]!==cd){centDistCol[rowIdx][0]=cd;updatedCent++;}
    if(nv!==null&&volCol[rowIdx][0]!==nv){volCol[rowIdx][0]=nv;updatedVol++;}
  }
  sh.getRange(2,iCilLen+1,n,1).setValues(cilLenCol);
  sh.getRange(2,iCentDist+1,n,1).setValues(centDistCol);
  sh.getRange(2,iVol+1,n,1).setValues(volCol);
  /* 2026-08-08: Søren re-checked after a first run of this function and cilium_length_um/
     centriole_dist_um STILL displayed as dates in "Master cell list", even though the logged
     "corrected/filled" counts were real (4068/11488). Cause: Range.setValues(number) overwrites a
     cell's VALUE but leaves its existing FORMAT untouched -- these cells were originally
     auto-formatted as "Date" by Sheets' CSV-import auto-detection (the very bug this backfill
     fixes), so Sheets kept rendering the new, correct number through that stale Date format
     (e.g. showing "1/2/1900" instead of "2.59"). nucleus_volume_um3 was never Date-formatted in
     the first place (0 corrected, format was already Number), which is why only these two columns
     showed the symptom. Explicitly resetting the number format on all 3 target columns to plain
     "0.00" -- regardless of whether this run changed a given cell's value -- guarantees Sheets
     displays every cell as a number from here on, independent of whatever format it inherited from
     the original bad import. */
  sh.getRange(2,iCilLen+1,n,1).setNumberFormat("0.00");
  sh.getRange(2,iCentDist+1,n,1).setNumberFormat("0.00");
  sh.getRange(2,iVol+1,n,1).setNumberFormat("0.00");
  Logger.log("backfillNumericObservations complete: cilium_length_um "+updatedCil+", centriole_dist_um "+
    updatedCent+", nucleus_volume_um3 "+updatedVol+" cells corrected/filled; "+notFound+
    " backfill rows had no matching Master List cell_key.");
  Logger.log("nucleus_volume_um3 diagnostic: "+dateSkipVol+" source cell(s) were Date-corrupted on "+
    'THIS sheet\'s own import (skipped), '+blankSkipVol+" were blank/missing in the source CSV. If "+
    "both are 0 and updatedVol is still 0, every source value already exactly matched what's "+
    "already in \"Master cell list\" (nothing needed fixing there).");
}
/* One-time backfill for "Computed volumes" rows missing nucleusId (2026-08-04, Søren: "The
   computed volumes tab in the google sheet has a lot of computed volumes, where there is no
   nucleus ID. Can we backfill those based on the nucleus ID from the Master cell list?") --
   ROOT CAUSE (historical, already fixed going forward): maybeSaveComputedVolume() in ujump.html
   hardcoded nucleusId:"" regardless of the caller until the 2026-08-02 fix (see
   [[master-cell-list-root-ids-and-computed-volumes-fix]]), so every "Compute volume" click before
   that fix landed with a blank nucleusId here, even when it WAS clicked from the main nucleus
   display (where a real nucleus ID was on screen the whole time). Purely a one-time historical
   catch-up -- new rows already carry the real nucleusId, nothing live to hook up here.

   Join: "Master cell list"'s microns_root_id is a nucleus's own default segmentation root ID (see
   backfillMicronsRootIds() above) -- a main nucleus's "Compute volume" click always used that
   exact root ID (see upsertMasterCellComputedVolume()'s own comment), so rootId -> microns_root_id
   is the primary, most reliable join. Falls back to community_root_ids (JSON array of
   community-PROPOSED additional root IDs per nucleus) for the rarer case where a click happened
   against a proposed/combined root instead of the nucleus's own default. A rootId matching
   NEITHER (e.g. a community-reported/standalone/merged-sub cell's own panel, which never had a
   single nucleus to begin with) is left blank, exactly as before -- not every row can be
   attributed, and this never invents an attribution.

   Never overwrites a nucleusId that's already there (only fills genuinely blank cells), and never
   touches rootId/volumeUm3/anything else -- one column, filled in only where it's currently empty. */
function backfillComputedVolumeNucleusIds(){
  try{
    backfillComputedVolumeNucleusIdsImpl();
  }catch(err){
    Logger.log("backfillComputedVolumeNucleusIds FAILED with a real exception: "+(err&&err.message?err.message:String(err)));
    Logger.log("Stack: "+(err&&err.stack?err.stack:"(no stack available)"));
    throw err;
  }
}
function backfillComputedVolumeNucleusIdsImpl(){
  var ss=SS();
  var cvSh=ss.getSheetByName("Computed volumes");
  if(!cvSh||cvSh.getLastRow()<2){Logger.log('"Computed volumes" sheet not found or empty -- nothing to backfill.');return;}
  var mlSh=ss.getSheetByName(MASTER_LIST_SHEET);
  if(!mlSh||mlSh.getLastRow()<2){Logger.log('"Master cell list" sheet not found or empty -- import the CSV seed first.');return;}

  var mlHeader=mlSh.getRange(1,1,1,mlSh.getLastColumn()).getValues()[0];
  var iNucId=mlHeader.indexOf("nucleus_id"),iRoot=mlHeader.indexOf("microns_root_id"),
      iCRoots=mlHeader.indexOf("community_root_ids");
  if(iNucId<0||iRoot<0){Logger.log('"Master cell list" header missing nucleus_id/microns_root_id -- run backfillMicronsRootIds() first.');return;}
  var mlN=mlSh.getLastRow()-1;
  // Only the 3 single columns actually needed -- NOT a full-row read, which would also drag in
  // neighbor_10_keys' heavy per-row JSON blobs across all ~150k rows for no reason (see the "0
  // community-identified" bug postmortem above on why that matters at this sheet's real scale).
  var nucIdCol=mlSh.getRange(2,iNucId+1,mlN,1).getValues();
  var rootCol=mlSh.getRange(2,iRoot+1,mlN,1).getValues();
  var cRootsCol=iCRoots>=0?mlSh.getRange(2,iCRoots+1,mlN,1).getValues():null;

  var byRoot={},byProposedRoot={},dupRoots=0;
  for(var i=0;i<mlN;i++){
    var nid=String(nucIdCol[i][0]||"");
    if(!nid)continue; // standalone/merged-sub rows have no single nucleus_id to map a rootId onto
    var root=String(rootCol[i][0]||"");
    if(root){
      if(byRoot[root]&&byRoot[root]!==nid)dupRoots++;
      else if(!byRoot[root])byRoot[root]=nid;
    }
    if(cRootsCol&&cRootsCol[i][0]){
      try{
        var proposed=JSON.parse(cRootsCol[i][0]);
        proposed.forEach(function(pr){var pk=String(pr);if(!byProposedRoot[pk])byProposedRoot[pk]=nid;});
      }catch(e){}
    }
  }
  Logger.log(Object.keys(byRoot).length+" nuclei have a known microns_root_id, "+
    Object.keys(byProposedRoot).length+" distinct community-proposed root IDs on file"+
    (dupRoots>0?(" ("+dupRoots+" root ID collisions across different nuclei -- first one found wins)"):"")+".");

  // "Computed volumes" is small (one row per distinct rootId ever computed, not per click) -- a
  // full-row read here is fine, same as backfillComputedVolumesImpl()'s own getDataRange() above.
  var cvN=cvSh.getLastRow()-1;
  var cvHeader=cvSh.getRange(1,1,1,cvSh.getLastColumn()).getValues()[0];
  var iCvRoot=cvHeader.indexOf("rootId"),iCvNuc=cvHeader.indexOf("nucleusId");
  if(iCvRoot<0||iCvNuc<0){Logger.log('"Computed volumes" header missing rootId/nucleusId -- unexpected, aborting.');return;}
  var cvData=cvSh.getRange(2,1,cvN,cvSh.getLastColumn()).getValues();

  var updatedViaOwn=0,updatedViaProposed=0,stillUnmatched=0;
  var nucCol=[];
  for(var r=0;r<cvN;r++){
    var existing=String(cvData[r][iCvNuc]||"");
    if(existing){nucCol.push([existing]);continue;} // never overwrite a real value
    var root=String(cvData[r][iCvRoot]||"");
    if(!root){nucCol.push([""]);continue;}
    if(byRoot[root]){nucCol.push([byRoot[root]]);updatedViaOwn++;}
    else if(byProposedRoot[root]){nucCol.push([byProposedRoot[root]]);updatedViaProposed++;}
    else{nucCol.push([""]);stillUnmatched++;}
  }
  if(updatedViaOwn+updatedViaProposed>0)cvSh.getRange(2,iCvNuc+1,cvN,1).setValues(nucCol); // ONE bulk write
  Logger.log("Backfill complete: "+updatedViaOwn+" rows filled via a nucleus's own microns_root_id, "+
    updatedViaProposed+" more via a community-proposed root ID, "+stillUnmatched+" rows still have "+
    "no matching nucleus (genuinely no single nucleus to attach to, e.g. a community-reported/"+
    "standalone/merged-sub cell's own panel).");
}
/* "0 community-identified" bug (2026-08-02, Søren: "The MICrONS-predicted vs. verified-by-us vs.
   community-identified shows 0 community identified nuclei. How come? There are 79 newly
   identified cells and 92 discrepancies in the user reports.") -- ROOT CAUSE: a nucleus's
   identity_source only ever becomes "community_majority" via upsertMasterCellRow() above, which
   only runs at the moment a NEW report is submitted through doPost. build_master_cell_list.py
   (the script that generates master_cell_list_seed.csv, what Søren originally imported to seed
   this sheet) has NO access to this Apps Script project's report sheets -- it only ever reads
   ujump.html's own embedded static arrays -- so it seeds identity_source as one of "own_verified"
   / "microns_only" / "unclassified" ONLY, leaving community_top_identity/community_votes_json
   blank (see its own header comment + "identity_source[i] = ..." lines). Every one of Søren's 92
   discrepancies + 79 new identifications was submitted BEFORE "Master cell list" existed, so none
   of them ever triggered upsertMasterCellRow() with the sheet present -- their rows are stuck at
   the seed's own_verified/microns_only/unclassified value forever, until something re-triggers a
   recompute. backfillCommunityIdentities() below is that one-time recompute: it finds every
   nucleusId with at least one row in Discrepancies/New identifications/Confirmations (regardless
   of when it was submitted) and reruns the SAME precedence logic upsertMasterCellRow() already
   uses per nucleus, then writes back only the rows that actually changed. RUN THIS ONCE from the
   Apps Script editor after deploying this version (pick "backfillCommunityIdentities" in the
   toolbar function dropdown, click Run) -- check View > Logs afterward for a summary. Safe to
   re-run any time (idempotent: rows that already match the freshly-computed value are skipped,
   not rewritten). Every future report submitted after this point is still picked up live via
   upsertMasterCellRow() as before -- this backfill only exists to close the historical gap.

   2026-08-02 REWRITE #1 after a real failed run (Søren: generic "Der opstod en ukendt fejl" / "An
   unknown error occurred" in the execution log, no useful detail). The first version bulk-read the
   ENTIRE "Master cell list" sheet in one getRange(...).getValues() call -- ~150k rows x 22
   columns, including the large per-row neighbor_10_keys JSON array (the single biggest column in
   the sheet, per build_master_cell_list.py's own size note: this column alone made the seed CSV
   balloon from ~20.6MB to ~44.7MB). Loading that entire column for every one of ~150k rows into
   one JS array is almost certainly what exceeded Apps Script's execution memory and produced the
   generic failure.

   2026-08-02 REWRITE #2 -- REWRITE #1's fix (only touching the min..max span of the few needed
   columns) turned out not to be enough, because it still called tallyIdentitiesForNucleus(nid)
   once PER matched nucleus -- and that helper (used correctly elsewhere for a SINGLE live report)
   internally does its own FULL getDataRange().getValues() read of all three report sheets on
   every call. For ~171 reported nuclei that's 171x3 = 513 extra full-sheet reads, on top of the
   3 initial reads used to just collect nucleusIds and the up-to-171 per-row reads/writes against
   "Master cell list" -- roughly 850+ separate SpreadsheetApp service calls in total. Each such
   call carries its own real network/RPC overhead in the live Apps Script environment (unlike a
   fast in-process test), and that volume of calls is squarely the kind of thing that can trip a
   generic Apps Script failure (execution time, an internal per-minute call-rate limit, etc.) even
   when no single call is individually too large. Fixed by cutting total service calls to roughly
   a dozen, regardless of how many nuclei need backfilling:
   (1) tallyAllNucleiFromReportSheets() below reads each of the three report sheets EXACTLY ONCE
       TOTAL (not once per nucleus) and tallies every nucleus's votes in the same pass, replicating
       tallyIdentitiesForNucleus()'s exact case-insensitive-count + most-recent-tie-break logic --
       this also replaces the earlier separate "just collect nucleusIds" pass, since the tally
       naturally has every reported nucleusId as a key already.
   (2) The 5 "Master cell list" columns this function actually reads (cell_key, own_verified_
       identity, microns_predicted, current_identity, identity_source) are each bulk-read ONCE as a
       single column (150k rows x 1 col -- small and cheap, the same kind of read
       upsertMasterCellRow() already does safely on every live report submission) instead of one
       multi-column read PER matched nucleus -- so every read in this function happens exactly
       once, total, no matter how many nuclei end up needing an update.
   (3) Only WRITES remain per-row (one per nucleus whose value actually changed, via a single
       getRange/setValues call spanning current_identity..last_updated) -- unavoidable, since
       Apps Script has no bulk-write-to-scattered-rows primitive, but this is now the ONLY
       linear-in-nuclei-count cost left, and it only fires for rows that genuinely changed. */
function tallyAllNucleiFromReportSheets(){
  var ss=SS();
  var byNucleus={}; // nucleusId -> {counts, display, latestTsByKey, mostRecentTs, mostRecentIdentity}
  ["Discrepancies","New identifications","Confirmations"].forEach(function(sheetName){
    var sh=ss.getSheetByName(sheetName);if(!sh||sh.getLastRow()<2)return;
    var data=sh.getDataRange().getValues(),h=data[0]; // ONE read per sheet, not per nucleus
    var iNuc=h.indexOf("nucleusId"),iId=h.indexOf("identified"),iTs=h.indexOf("timestamp");
    if(iNuc<0||iId<0)return;
    for(var r=1;r<data.length;r++){
      var nid=String(data[r][iNuc]||"");if(!nid)continue;
      var raw=String(data[r][iId]||"").trim();if(!raw)continue;
      var key=raw.toLowerCase();
      var ts=iTs>=0?String(data[r][iTs]||""):"";
      if(!byNucleus[nid])byNucleus[nid]={counts:{},display:{},latestTsByKey:{},mostRecentTs:null,mostRecentIdentity:""};
      var b=byNucleus[nid];
      b.counts[key]=(b.counts[key]||0)+1;
      if(!b.latestTsByKey[key]||ts>b.latestTsByKey[key]){b.latestTsByKey[key]=ts;b.display[key]=raw;}
      if(!b.mostRecentTs||ts>b.mostRecentTs){b.mostRecentTs=ts;b.mostRecentIdentity=raw;}
    }
  });
  var out={};
  Object.keys(byNucleus).forEach(function(nid){
    var b=byNucleus[nid];
    var top="",topCount=0,topKey="";
    Object.keys(b.counts).forEach(function(key){if(b.counts[key]>topCount){topCount=b.counts[key];topKey=key;}});
    var tiedKeys=Object.keys(b.counts).filter(function(key){return b.counts[key]===topCount;});
    if(tiedKeys.length>1){
      var bestTs=null;
      tiedKeys.forEach(function(key){if(!bestTs||b.latestTsByKey[key]>bestTs){bestTs=b.latestTsByKey[key];topKey=key;}});
    }
    top=topKey?b.display[topKey]:"";
    var displayCounts={};
    Object.keys(b.counts).forEach(function(key){displayCounts[b.display[key]]=b.counts[key];});
    out[nid]={counts:displayCounts,top:top,topCount:topCount,mostRecentIdentity:b.mostRecentIdentity};
  });
  return out;
}
/* Entry point actually run from the Apps Script editor's function dropdown -- a thin wrapper that
   catches ANY exception from backfillCommunityIdentitiesImpl() below and logs its real message +
   stack trace via Logger.log, instead of letting it surface as the Apps Script UI's generic
   "Der opstod en ukendt fejl. Prøv igen senere." / "An unknown error occurred" toast, which gives
   no diagnostic information at all. Added 2026-08-02 after TWO prior rewrites of this function
   both failed with that exact generic message and no further detail was available to work from --
   if a THIRD failure happens, check View > Executions (Udførelser, the clock icon in the left
   sidebar) for this run and read the full logged error text; that's the actual bug report needed
   to fix it correctly instead of guessing again. */
function backfillCommunityIdentities(){
  try{
    backfillCommunityIdentitiesImpl();
  }catch(err){
    Logger.log("backfillCommunityIdentities FAILED with a real exception (see below) -- this is "+
      "the actual error, not the generic Apps Script UI message. Message: "+
      (err&&err.message?err.message:String(err)));
    Logger.log("Stack: "+(err&&err.stack?err.stack:"(no stack available)"));
    throw err;
  }
}
function backfillCommunityIdentitiesImpl(){
  var ss=SS();
  var sh=ss.getSheetByName(MASTER_LIST_SHEET);
  if(!sh){Logger.log('"Master cell list" sheet not found -- import the CSV seed first.');return;}
  var lastRow=sh.getLastRow();
  if(lastRow<2){Logger.log('"Master cell list" sheet is empty.');return;}
  var header=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]; // call 1: header row (tiny)
  var iKey=header.indexOf("cell_key"),iOwn=header.indexOf("own_verified_identity"),
      iMicrons=header.indexOf("microns_predicted"),iCur=header.indexOf("current_identity"),
      iSrc=header.indexOf("identity_source"),iCTop=header.indexOf("community_top_identity"),
      iCVotes=header.indexOf("community_votes_json"),iUpd=header.indexOf("last_updated");
  if(iKey<0||iCur<0||iSrc<0){Logger.log("Header doesn't match the expected schema -- re-import the CSV without hand-editing the header.");return;}
  Logger.log("Header check: cell_key="+iKey+" own_verified_identity="+iOwn+" microns_predicted="+iMicrons+
    " current_identity="+iCur+" identity_source="+iSrc+" community_top_identity="+iCTop+
    " community_votes_json="+iCVotes+" last_updated="+iUpd+" (a -1 means that column is genuinely "+
    "missing from the sheet's header row, not just an edge case -- worth double-checking against "+
    "row 1 of \"Master cell list\" by eye if anything below looks off).");

  // Calls 2-4: the three report sheets, read exactly once each (not once per nucleus -- see the
  // REWRITE #2 comment above for why that was the real problem).
  var tallyByNucleus=tallyAllNucleiFromReportSheets();
  var idList=Object.keys(tallyByNucleus);
  Logger.log(idList.length+" distinct nuclei have at least one historical report.");
  if(!idList.length)return;

  // Calls 5-9: single-column bulk reads (150k rows x 1 col each -- small and cheap, the same kind
  // of read upsertMasterCellRow() already does safely on every live report submission) -- every
  // value this function needs to READ from "Master cell list", for every row, in one shot each, so
  // no further reads happen inside the per-nucleus loop below at all. iOwn/iMicrons are guarded
  // (getRange with column index 0, i.e. a -1 header lookup + 1, is invalid and throws -- an
  // earlier version of this function called getRange(2,iOwn+1,...)/getRange(2,iMicrons+1,...)
  // unconditionally, which WOULD throw exactly this kind of opaque exception if either column were
  // ever missing; own_verified_identity/microns_predicted should always be present per
  // MASTER_LIST_HEADERS, but there's no reason to risk a hard crash on it when a graceful
  // "treat as blank" fallback costs nothing).
  var n=lastRow-1;
  var keyCol=sh.getRange(2,iKey+1,n,1).getValues();
  var ownCol=iOwn>=0?sh.getRange(2,iOwn+1,n,1).getValues():null;
  var micronsCol=iMicrons>=0?sh.getRange(2,iMicrons+1,n,1).getValues():null;
  var curCol=sh.getRange(2,iCur+1,n,1).getValues();
  var srcCol=sh.getRange(2,iSrc+1,n,1).getValues();
  var rowByKey={};
  for(var r2=0;r2<n;r2++)rowByKey[String(keyCol[r2][0])]=r2; // 0-indexed into the columns above

  // The columns this function ever WRITES, batched into one getRange/setValues call per changed
  // row (spanning min..max of these column indexes) -- deliberately never touches voxel_x/y/z,
  // neighbor_10_keys, cilium/centriole data, or estimated_layer. Per MASTER_LIST_HEADERS these 5
  // columns are contiguous (current_identity..last_updated), so span===writeCols.length and a
  // blank-filled slice safely overwrites only these 5 cells. If the header is ever hand-reordered
  // so some OTHER column falls between them, contiguous is false and the code below falls back to
  // 5 individual setValue() calls per changed row instead -- slower, but never silently blanks an
  // unrelated column the way a blind slice-write would if it turned out non-contiguous.
  var writeCols=[iCur,iSrc,iCTop,iCVotes,iUpd].filter(function(i){return i>=0;});
  var minCol=Math.min.apply(null,writeCols),maxCol=Math.max.apply(null,writeCols),span=maxCol-minCol+1;
  var contiguous=(span===writeCols.length);
  function off(i){return i-minCol;}

  var now=new Date().toISOString();
  var updatedExisting=0,skippedUnchanged=0,newRows=[],done=0;
  idList.forEach(function(nid){
    var cellKey="N:"+nid;
    var tally=tallyByNucleus[nid]; // precomputed above, no per-nucleus sheet read
    var rIdx=rowByKey[cellKey];
    if(rIdx===undefined){
      // Reported on, but not present in the seed at all (e.g. added to ujump.html's dataset after
      // the last CSV export) -- self-heal by appending a minimal row, same fallback
      // upsertMasterCellRow() uses for a single live report.
      var newRow=new Array(header.length).fill("");
      newRow[iKey]=cellKey;
      var currentIdentity=tally.top?tally.top:"Unclassified";
      var identitySource=tally.top?"community_majority":"unclassified";
      newRow[iCur]=currentIdentity;newRow[iSrc]=identitySource;
      if(iCTop>=0)newRow[iCTop]=tally.top;
      if(iCVotes>=0)newRow[iCVotes]=JSON.stringify(tally.counts);
      if(iUpd>=0)newRow[iUpd]=now;
      newRows.push(newRow);
    } else {
      var ownVerified=ownCol?String(ownCol[rIdx][0]||""):"";
      var micronsPred=micronsCol?String(micronsCol[rIdx][0]||""):"";
      var currentIdentity,identitySource;
      if(ownVerified){currentIdentity=ownVerified;identitySource="own_verified";}
      else if(tally.top){currentIdentity=tally.top;identitySource="community_majority";}
      else if(micronsPred){currentIdentity=micronsPred;identitySource="microns_only";}
      else{currentIdentity="Unclassified";identitySource="unclassified";}
      var curNow=String(curCol[rIdx][0]||""),srcNow=String(srcCol[rIdx][0]||"");
      if(curNow===currentIdentity&&srcNow===identitySource){
        skippedUnchanged++;
      } else {
        var sheetRow=rIdx+2; // back to 1-indexed sheet row for the write
        var votesJson=JSON.stringify(tally.counts);
        if(contiguous){
          var slice=new Array(span);
          slice[off(iCur)]=currentIdentity;slice[off(iSrc)]=identitySource;
          if(iCTop>=0)slice[off(iCTop)]=tally.top;
          if(iCVotes>=0)slice[off(iCVotes)]=votesJson;
          if(iUpd>=0)slice[off(iUpd)]=now;
          sh.getRange(sheetRow,minCol+1,1,span).setValues([slice]); // one write call for this row
        } else {
          // Non-contiguous fallback -- 5 small independent writes, each bounded to its own exact
          // column, so nothing else on the row can ever be touched regardless of header order.
          sh.getRange(sheetRow,iCur+1).setValue(currentIdentity);
          sh.getRange(sheetRow,iSrc+1).setValue(identitySource);
          if(iCTop>=0)sh.getRange(sheetRow,iCTop+1).setValue(tally.top);
          if(iCVotes>=0)sh.getRange(sheetRow,iCVotes+1).setValue(votesJson);
          if(iUpd>=0)sh.getRange(sheetRow,iUpd+1).setValue(now);
        }
        updatedExisting++;
      }
    }
    done++;
    if(done%25===0)Logger.log(done+" / "+idList.length+" processed...");
  });
  if(newRows.length)sh.getRange(sh.getLastRow()+1,1,newRows.length,header.length).setValues(newRows);
  Logger.log("Backfill complete: "+updatedExisting+" existing rows updated, "+skippedUnchanged+
    " already correct (skipped), "+newRows.length+" new rows appended for nuclei missing from the "+
    "seed. Refresh the µJump dashboard's live data (or wait for its cache to expire) to see the "+
    "corrected \"Community-identified\" count.");
}
/* ---------------------------------------------------------------------------------------------
   dashboardLive() (2026-08-02) -- computes EVERY µJump-dashboard chart fresh from the CURRENT
   contents of "Master cell list" (+ "Organelle locations" for a live cilium/centriole top-up),
   replacing the old design where most charts came from a one-time dashboard_data.json snapshot
   baked into the dashboard HTML at build time. Søren: "none of them should be static. They should
   all be changed by user reports."

   What's genuinely live here vs. what can't be: current_identity (own-verified > community
   majority > MICrONS-only > Unclassified) is recomputed by upsertMasterCellRow() on every
   relevant report, so every chart bucketing by CELL TYPE reflects reports the moment they land --
   correct a cell's identity and it moves to its new type bucket in every chart next refresh, no
   re-baking needed. What does NOT change from a report: WHERE a cell physically is, so which
   cortical layer it's in (estimated_layer) and which 10 cells are its nearest geometric neighbours
   (neighbor_10_keys) are precomputed once by build_master_cell_list.py (no spatial-index library
   is available in Apps Script, and re-deriving one over 150k points on every request would be far
   too slow) -- but WHICH TYPE those neighbours currently resolve to is looked up fresh below, so
   the neighbour-composition chart still reflects current identities, not frozen ones. Likewise
   has_cilium/has_centriole/cilium_length_um/centriole_dist_um are fixed OBSERVATIONS (a cilium's
   coordinates don't change), precomputed once, but which cell-type bucket each one counts toward
   is resolved live from current_identity -- and any organelle report submitted since the last
   re-seed (only in "Organelle locations", not yet folded into the sheet) is merged in below too,
   so a brand-new measurement shows up immediately rather than waiting for a re-seed.

   Performance note: reads the WHOLE "Master cell list" sheet (150k+ rows) into memory every call
   -- this can take real time (low tens of seconds), which is why the dashboard caches this
   client-side and only calls it on an explicit "Refresh live data" click / cache-expiry, not on
   every page view (same on-demand pattern as the rest of this dashboard). */
/* EVERY layer name any dataset in this family uses, in cortical order. µJump (MICrONS) splits
   2/3 and subdivides 5 and 6; δJump (V1DD) draws the Ledderose scheme, Layer 1..Layer 6. A chart
   given only µJump's list puts every δJump cell in a bucket it does not draw, which is exactly
   what "the cells per cortical layer only shows unknown" looked like. Used as a SORT ORDER, not a
   filter: liveLayerOrder_() below returns only the layers actually present, and keeps anything
   unrecognised at the end rather than dropping it. */
var LIVE_LAYER_ORDER=["Leptomeninges","Layer 1","Layer 2","Layer 2/3","Layer 3","Layer 4",
  "Layer 5","Layer 5a","Layer 5b","Layer 6","Layer 6a","Layer 6b","White matter",
  /* H01's own short forms (2026-09-06). liveLayerOrder_ already KEPT these -- it appends anything
     unrecognised rather than dropping it -- and sorted them alphabetically, which for L1..L6, WM
     happens to be the right cortical sequence. That is luck: a dataset using "L10" would sort it
     between L1 and L2. Declared, so the order is a decision rather than an accident. */
  "L1","L2","L3","L4","L5","L6","WM",
  "Unknown"];
function liveLayerOrder_(seen){
  var out=[],extra=[];
  LIVE_LAYER_ORDER.forEach(function(l){ if(seen[l])out.push(l); });
  Object.keys(seen).forEach(function(l){ if(LIVE_LAYER_ORDER.indexOf(l)<0)extra.push(l); });
  return out.concat(extra.sort());
}
/* 2026-08-02 BUGFIX: a plain "row[i]!=='' -> Number(row[i])" cast is not safe for a Sheets cell,
   because Sheets' CSV-import "convert text to numbers, dates and formulas" auto-detection can
   (and, for Søren's Danish-locale spreadsheet, DID) decide a decimal-looking string like "2.34"
   is actually a European D.M date ("2. April") rather than a number, silently storing it as a
   Date. getDataRange().getValues() then returns a native JS Date object for that cell instead of
   a number or string -- it is NOT "", so the old guard let it through, and Number(dateObject)
   returns its epoch MILLISECONDS (huge, and negative for anything near Sheets' 1899 date-serial-0
   epoch), which is exactly the "-2 trillion" garbage Søren saw on the cilium-length/nucleus-
   centriole/nucleus-volume charts. safeNumGs() treats a Date value (or blank/non-finite) as "no
   data" instead of blindly casting it. This guards the CODE, but the SHEET still has the wrong
   values stored -- the real fix is re-importing master_cell_list_seed.csv with that "convert"
   checkbox UNCHECKED so numeric columns stay as plain text and Number() parses them correctly
   regardless of spreadsheet locale. */
function safeNumGs(v){
  if(v===undefined||v===null||v==="")return null;
  if(v instanceof Date)return null;
  var n=Number(v);
  return isFinite(n)?n:null;
}
function dashboardLive(){
  var ss=SS();
  var sh=ss.getSheetByName(MASTER_LIST_SHEET);
  if(!sh||sh.getLastRow()<2){
    return {ready:false,note:"\"Master cell list\" sheet not found or empty -- import "+
      "master_cell_list_seed.csv as a tab named exactly \"Master cell list\" first."};
  }
  var data=sh.getDataRange().getValues(),header=data[0];
  var iKey=header.indexOf("cell_key"),iKind=header.indexOf("kind"),iCur=header.indexOf("current_identity"),
      iSrc=header.indexOf("identity_source"),iHasCil=header.indexOf("has_cilium"),
      iCilChecked=header.indexOf("cilium_checked"),iCilLen=header.indexOf("cilium_length_um"),
      iHasCent=header.indexOf("has_centriole"),iCentDist=header.indexOf("centriole_dist_um"),
      iVol=header.indexOf("nucleus_volume_um3"),iLayer=header.indexOf("estimated_layer"),
      iNbr=header.indexOf("neighbor_10_keys"),iNucId=header.indexOf("nucleus_id");
  if(iKey<0||iCur<0){
    return {ready:false,note:"\"Master cell list\" header row doesn't match the expected schema "+
      "(missing cell_key/current_identity) -- re-import the CSV without hand-editing the header."};
  }
  var identityOf={}; // cell_key -> current_identity, for the neighbour-composition lookup below
  var n=data.length;
  for(var r=1;r<n;r++){identityOf[String(data[r][iKey])]=String(data[r][iCur]||"");}

  /* ── WHICH SCHEMA IS THIS? ───────────────────────────────────────────────────────  2026-09-05
     µJump's list has 29 columns; the five tools on MasterList.gs's shared schema have 21, and the
     two share only some of them. Both have cell_key and current_identity, so the header guard
     above passes either way -- and then every µJump-only header.indexOf() returns -1 and the
     counts come out silently zero, which is what Søren saw on δJump.

     Resolved once, here, rather than by sprinkling `>=0` guards down the loop: a guard that is
     forgotten reads as a real zero. */
  var sharedSchema=(iKind<0);
  var iOrganJson=header.indexOf("organelles_json");    /* the shared schema's cilium/centriole */
  /* NO `kind` COLUMN MEANS EVERY ROW IS A CELL. True by construction on the shared schema -- there
     is nothing else in those sheets -- and where the column DOES exist the original test stands,
     so µJump, βJump and λJump are untouched. */
  function isMainRow(kind){ return sharedSchema||kind==="main_nucleus"; }
  /* "source_only" is the shared schema's word for what µJump calls "microns_only": the published
     table said so and nobody has disagreed. Same meaning, different vocabulary. */
  function srcNorm(s){ return s==="source_only"?"microns_only":s; }
  /* The shared schema records organelles as [{"kind":"cilium","n":1}, ...] on the row instead of
     has_cilium/has_centriole flags. */
  function organCount(row,want){
    if(iOrganJson<0)return 0;
    var raw=row[iOrganJson];
    if(!raw)return 0;
    try{
      var list=JSON.parse(raw);
      if(!(list instanceof Array))return 0;
      for(var oi=0;oi<list.length;oi++)
        if(list[oi]&&String(list[oi].kind)===want)return Number(list[oi].n)||1;
    }catch(_oj){}
    return 0;
  }

  var cellsPerType={},perTypePerLayer={},unclassifiedPerLayer={},
      cilChecked={},cilFound={},cilLen={},centDist={},volByType={},neighborComp={},
      layersSeen={};
  var identifiedMain=0,unclassifiedMain=0,microOnlyMain=0,ownVerifiedMain=0,communityMajorityMain=0;

  /* "Excitatory neuron"/"Inhibitory neuron" are real, historically-recorded identifications (the
     old guided-ID tree's generic escape-hatch leaves for "can't resolve the subtype from this
     view", since removed from the tree itself -- see [[ujump-decision-tree-generic-leaf-removal]])
     but were never one of the 16 real leaf cell types, so they shouldn't get their own bar on any
     per-cell-type chart (Søren, 2026-08-08: "I don't want the Excitatory neuron/Inhibitory neuron
     bars in my graph ... How can we fix this"). Excluded from every PER-TYPE bucket below the same
     way "Unclassified" already is -- but deliberately NOT folded into unclassifiedMain/
     unclassifiedPerLayer/identifiedMain, since these cells genuinely ARE identified (just not to a
     specific subtype); they simply never get their own bar or legend entry anywhere. This does not
     touch the underlying "Master cell list" data or the identified_vs_unclassified pie chart --
     only which per-type charts a cell contributes a bucket to. */
  function isGenericFallbackType(t){return t==="Excitatory neuron"||t==="Inhibitory neuron";}

  for(var r=1;r<n;r++){
    var row=data[r];
    var kind=String(row[iKind]||""),cur=String(row[iCur]||""),src=String(row[iSrc]||"");
    var isUnclassified=(!cur||cur==="Unclassified");
    var isGenericFallback=isGenericFallbackType(cur);
    var excludeFromTypeBar=isUnclassified||isGenericFallback;

    if(!excludeFromTypeBar)cellsPerType[cur]=(cellsPerType[cur]||0)+1;

    var layer=iLayer>=0?String(row[iLayer]||"Unknown"):"Unknown";
    layersSeen[layer]=1;
    if(!excludeFromTypeBar){
      if(!perTypePerLayer[cur])perTypePerLayer[cur]={};
      perTypePerLayer[cur][layer]=(perTypePerLayer[cur][layer]||0)+1;
    } else if(isUnclassified&&isMainRow(kind)){
      unclassifiedPerLayer[layer]=(unclassifiedPerLayer[layer]||0)+1;
    }

    if(isMainRow(kind)){
      if(isUnclassified)unclassifiedMain++;else identifiedMain++;
      var srcN=srcNorm(src);
      if(srcN==="microns_only")microOnlyMain++;
      else if(srcN==="own_verified")ownVerifiedMain++;
      else if(srcN==="community_majority")communityMajorityMain++;
    }

    if(iCilChecked>=0&&String(row[iCilChecked])==="1"&&!isGenericFallback){
      cilChecked[cur]=(cilChecked[cur]||0)+1;
      if(iHasCil>=0&&String(row[iHasCil])==="1")cilFound[cur]=(cilFound[cur]||0)+1;
    }
    if(iHasCil>=0&&String(row[iHasCil])==="1"&&!isGenericFallback){
      var cl=safeNumGs(row[iCilLen]); if(cl!==null)(cilLen[cur]=cilLen[cur]||[]).push(cl);
    }
    if(iHasCent>=0&&String(row[iHasCent])==="1"&&!isGenericFallback){
      var cd=safeNumGs(row[iCentDist]); if(cd!==null)(centDist[cur]=centDist[cur]||[]).push(cd);
    }
    /* THE SHARED SCHEMA'S VERSION, and deliberately only a COUNT. µJump's percentage has an
       honest denominator -- cilium_checked marks the cells somebody actually looked at. There is
       no such column here, and "all cells of this type" is not a substitute: it counts "nobody
       looked" as "no cilium". So this fills cilFound and leaves cilChecked alone, and the payload
       below reports counts rather than a percentage anybody would read as a rate. */
    if(sharedSchema&&!isGenericFallback&&organCount(row,"cilium")>0)
      cilFound[cur]=(cilFound[cur]||0)+1;
    if(!excludeFromTypeBar){
      var vv=safeNumGs(row[iVol]); if(vv!==null)(volByType[cur]=volByType[cur]||[]).push(vv);
    }
  }

  // Neighbour composition: for every non-Unclassified, non-generic-fallback row, resolve its
  // precomputed 10 nearest neighbour KEYS to their CURRENT identity (live), skip Unclassified/
  // generic-fallback/unknown ones on BOTH sides (the row's own type and each neighbour's type),
  // keep the first 5 (closest) that resolve to a real specific identity -- reproduces the original
  // "5 nearest IDENTIFIED neighbours" semantics without needing to re-run a spatial query.
  if(iNbr>=0){
    for(var r=1;r<n;r++){
      var row=data[r],cur=String(row[iCur]||"");
      if(!cur||cur==="Unclassified"||isGenericFallbackType(cur))continue;
      var nbrRaw=row[iNbr];
      if(!nbrRaw)continue;
      var nbrKeys;
      try{nbrKeys=JSON.parse(nbrRaw);}catch(e){continue;}
      var used=0;
      for(var k=0;k<nbrKeys.length&&used<5;k++){
        var nbType=identityOf[nbrKeys[k]];
        if(!nbType||nbType==="Unclassified"||isGenericFallbackType(nbType))continue;
        if(!neighborComp[cur])neighborComp[cur]={};
        neighborComp[cur][nbType]=(neighborComp[cur][nbType]||0)+1;
        used++;
      }
    }
  }

  // Live top-up: any "Organelle locations" report not yet folded into this sheet's static
  // has_cilium/has_centriole columns (dedup by nucleus_id, same convention as the old
  // live_organelle_merge block) -- so a brand-new measurement counts immediately, not just after
  // Søren next re-seeds the sheet.
  var coveredCil={},coveredCent={};
  for(var r=1;r<n;r++){
    if(iHasCil>=0&&String(data[r][iHasCil])==="1"&&iNucId>=0&&data[r][iNucId])coveredCil[String(data[r][iNucId])]=1;
    if(iHasCent>=0&&String(data[r][iHasCent])==="1"&&iNucId>=0&&data[r][iNucId])coveredCent[String(data[r][iNucId])]=1;
  }
  var osh=ss.getSheetByName("Organelle locations");
  if(osh&&osh.getLastRow()>=2){
    var od=osh.getDataRange().getValues(),oh=od[0];
    var oiN=oh.indexOf("nucleusId"),oiK=oh.indexOf("kind"),oiA=oh.indexOf("pointA"),
        oiB=oh.indexOf("pointB"),oiC=oh.indexOf("coord"),oiId=oh.indexOf("identified");
    function parseVoxGs(s){
      if(!s)return null;
      var p=String(s).split(",").map(Number);
      if(p.length<3||p.some(function(v){return isNaN(v);}))return null;
      return p;
    }
    /* THE DATASET'S OWN VOXEL, not µJump's. This was 4 x 4 x 40 for everybody, which is right
       for exactly one of the seven tools -- δJump's voxel is 9 x 9 x 45, so a cilium logged there
       came out about half its true length, in a chart with no hint that anything was wrong.

       null when the dataset has no resolution on file (see DATASETS in Datasets.gs), and the two
       callers below then SKIP the measurement. There is no safe default: any number picked here
       would be silently wrong for six datasets instead of visibly absent for a few. */
    var dsRes=(typeof DATASETS==="object"&&DATASETS[CURRENT_DS]&&DATASETS[CURRENT_DS].res)||null;
    function voxDistUmGs(a,b){
      if(!dsRes)return null;
      var dx=(a[0]-b[0])*dsRes[0],dy=(a[1]-b[1])*dsRes[1],dz=(a[2]-b[2])*dsRes[2];
      return Math.sqrt(dx*dx+dy*dy+dz*dz)/1000;
    }
    for(var i=1;i<od.length;i++){
      var nid=String(oiN>=0?(od[i][oiN]||""):"");
      var type=String(oiId>=0?(od[i][oiId]||""):"");
      if(!nid||!type||type==="Unclassified"||/[+×]/.test(type))continue;
      var kind2=String(oiK>=0?(od[i][oiK]||""):"");
      if(kind2==="cilium"&&!coveredCil[nid]){
        var a=parseVoxGs(oiA>=0?od[i][oiA]:null),b=parseVoxGs(oiB>=0?od[i][oiB]:null);
        if(a&&b){var lenUm=voxDistUmGs(a,b); if(lenUm!==null)(cilLen[type]=cilLen[type]||[]).push(lenUm);}
      } else if(kind2==="centriole"&&!coveredCent[nid]){
        var nucPos=parseVoxGs(oiC>=0?od[i][oiC]:null),cPos=parseVoxGs(oiA>=0?od[i][oiA]:null);
        if(nucPos&&cPos){var dUm=voxDistUmGs(nucPos,cPos); if(dUm!==null)(centDist[type]=centDist[type]||[]).push(dUm);}
      }
    }
  }

  // Sample nucleus_volume_um3 down to 800/type server-side, same cap the old static precompute
  // used, so the response payload doesn't carry all ~144k raw volumes over the wire.
  var MAX_SAMPLE=800;
  var volOut={};
  for(var t in volByType){
    var arr=volByType[t];
    if(arr.length>MAX_SAMPLE){
      var picked=[],idxPool=arr.slice();
      for(var s=0;s<MAX_SAMPLE;s++){
        var pick=Math.floor(Math.random()*idxPool.length);
        picked.push(idxPool[pick]);idxPool.splice(pick,1);
      }
      volOut[t]=picked;
    } else volOut[t]=arr;
  }

  var pcOut={};
  for(var t2 in cilChecked){
    var checked=cilChecked[t2],found=cilFound[t2]||0;
    pcOut[t2]={with_cilium:found,checked:checked,percent:Math.round(found/checked*1000)/10};
  }
  /* A PERCENTAGE NEEDS A DENOMINATOR SOMEBODY MEASURED. cilium_checked is that denominator on
     µJump's sheet -- the cells a person actually looked at. The shared schema has no such column,
     and "all cells of this type" is not a stand-in: it would count every cell nobody has opened
     as a cell with no cilium, and report a rate that only ever falls as the dataset grows. So on
     that schema this carries the COUNT and no percent, and `denominator` says which it is, so the
     chart can label itself rather than guess. */
  var cilDenom=sharedSchema?"cells with a cilium recorded (no checked-count in this schema)"
                           :"cells whose cilium status was checked";
  if(sharedSchema){
    pcOut={};
    for(var t3 in cilFound)pcOut[t3]={with_cilium:cilFound[t3],checked:null,percent:null};
  }

  /* WHOSE VERIFICATION? "own_verified" is Søren's own table for µJump, and the dashboard's legend
     said "verified by Grubb et al." in so many words. δJump has no such table -- Søren, 2026-09-05:
     "there is no Grubb et al verified for this dataset" -- so the label comes from the dataset's
     own source_name where there is one, and the series is marked absent when nothing is verified,
     rather than drawing an empty bar under somebody else's name. */
  var iSrcName=header.indexOf("source_name");
  var verifiedLabel="";
  if(ownVerifiedMain>0){
    verifiedLabel=sharedSchema?"verified in this dataset's own table":"verified by Grubb et al.";
    if(sharedSchema&&iSrcName>=0){
      for(var vr=1;vr<n;vr++){
        var sn=String(data[vr][iSrcName]||"");
        if(sn){verifiedLabel="verified — "+sn;break;}
      }
    }
  }

  var layerOrder=liveLayerOrder_(layersSeen);

  return {
    ready:true,
    generated_at:new Date().toISOString(),
    n_rows:n-1,
    schema:sharedSchema?"shared":"ujump",
    cells_per_type:{combined_best_identity:cellsPerType},
    cells_per_type_per_layer:{layer_order:layerOrder,data:perTypePerLayer},
    unclassified_per_layer:{layer_order:layerOrder,counts:unclassifiedPerLayer},
    identified_vs_unclassified:{identified:identifiedMain,unclassified:unclassifiedMain},
    predicted_vs_verified_live:{microns_predicted_no_override:microOnlyMain,own_verified:ownVerifiedMain,
      community_majority:communityMajorityMain,unclassified:unclassifiedMain,
      verified_label:verifiedLabel,has_verified:ownVerifiedMain>0},
    primary_cilia:{percent_with_cilium_by_type:pcOut,length_um_by_type:cilLen,denominator:cilDenom},
    nucleus_to_centriole_um:centDist,
    /* EMPTY OUTSIDE µJUMP AND SAYING SO. The shared schema has computed_volume_um3 -- the WHOLE
       CELL, from a mesh -- and no nucleus volume at all. Plotting one under the other's label
       would be the most quietly wrong thing on the page. */
    nucleus_volume_um3:volOut,
    nucleus_volume_available:!sharedSchema,
    neighbor_composition:neighborComp,
    neighbor_composition_available:iNbr>=0
  };
}
function myDownvotedList(email){
  var ss=SS(),mine=[],seen={},out=[];
  ["Discrepancies","New identifications","Confirmations"].forEach(function(sheetName){
    var sh=ss.getSheetByName(sheetName);if(!sh||sh.getLastRow()<2)return;
    var d=sh.getDataRange().getValues(),h=d[0],iNuc=h.indexOf("nucleusId"),iEm=h.indexOf("reporterEmail"),iId=h.indexOf("identified"),iC=h.indexOf("coord");
    for(var r=1;r<d.length;r++){if(String(d[r][iEm])!==email)continue;mine.push({nucleusId:String(d[r][iNuc]||""),identity:String(iId>=0?(d[r][iId]||""):""),coord:String(iC>=0?(d[r][iC]||""):"")});}
  });
  var vsh=ss.getSheetByName("Identity votes"),vmap={};
  if(vsh&&vsh.getLastRow()>=2){var vd=vsh.getDataRange().getValues(),vh=vd[0],jN=vh.indexOf("nucleusId"),jId=vh.indexOf("identity"),jV=vh.indexOf("vote");
    for(var v=1;v<vd.length;v++){var key=String(vd[v][jN])+"|"+String(vd[v][jId]).toLowerCase();if(!vmap[key])vmap[key]={up:0,down:0};if(Number(vd[v][jV])>=0)vmap[key].up++;else vmap[key].down++;}}
  mine.forEach(function(m){if(!m.identity)return;var key=m.nucleusId+"|"+m.identity.toLowerCase();var t=vmap[key]||{up:0,down:0};if(t.down>0&&!seen[key]){seen[key]=1;out.push({nucleusId:m.nucleusId,identity:m.identity,coord:m.coord,up:t.up,down:t.down,net:t.up-t.down});}});
  return out;
}
function upvotesForProposer(email){
  var ss=SS(),psh=ss.getSheetByName("Root ID proposals");
  if(!psh||psh.getLastRow()<2)return 0;
  var pd=psh.getDataRange().getValues(),ph=pd[0],iEm=ph.indexOf("proposedByEmail"),iN=ph.indexOf("nucleusId"),iR=ph.indexOf("rootId"),mine={};
  for(var p=1;p<pd.length;p++){if(String(pd[p][iEm])===email)mine[String(pd[p][iN])+"|"+String(pd[p][iR])]=1;}
  var vsh=ss.getSheetByName("Root ID votes");if(!vsh||vsh.getLastRow()<2)return 0;
  var vd=vsh.getDataRange().getValues(),vh=vd[0],jN=vh.indexOf("nucleusId"),jR=vh.indexOf("rootId"),jV=vh.indexOf("vote"),up=0;
  for(var v=1;v<vd.length;v++){var k=String(vd[v][jN])+"|"+String(vd[v][jR]);if(mine[k]&&Number(vd[v][jV])>=0)up++;}
  return up;
}
/* "Download your work" (2026-08-02) -- Søren: "I want the user to be able to download all the
   annotation that they have made themselves, when looking at their profile below the 'Reports
   needing review' as a button that says 'Download your work'." Every sheet this file ever writes
   a per-user row to, paired with whichever column name THAT sheet uses for the submitter's email
   (these vary -- "reporterEmail" on every report-log sheet, but "proposedByEmail"/"voterEmail"/
   plain "email" on the vote/proposal/favourite sheets -- see doPost's branches above for where
   each convention comes from). Read-only, keyed off the caller's OWN verified token (same
   ?myStats=/?favourites=/?myDownvoted= convention: the credential is the query value itself, not
   a header), so a user can only ever download their own rows, never anyone else's. */
var MY_REPORTS_SHEETS=[
  {name:"New identifications",emailCol:"reporterEmail"},
  {name:"Confirmations",emailCol:"reporterEmail"},
  {name:"Discrepancies",emailCol:"reporterEmail"},
  {name:"Merged splits",emailCol:"reporterEmail"},
  {name:"Organelle locations",emailCol:"reporterEmail"},
  {name:"Not a nucleus",emailCol:"reporterEmail"},
  {name:"New cells (no nucleus)",emailCol:"reporterEmail"},
  {name:"Computed volumes",emailCol:"reporterEmail"},
  {name:"Root ID proposals",emailCol:"proposedByEmail"},
  {name:"Root ID votes",emailCol:"voterEmail"},
  {name:"Identity votes",emailCol:"voterEmail"},
  {name:"Mesh contacts",emailCol:"reporterEmail"},
  {name:"Mesh proximity",emailCol:"reporterEmail"},
  {name:"Favourites",emailCol:"email"},
  /* ── AND THE OTHER TOOLS' OWN REPORTS (2026-09-02) ────────────────────────────────────────
     Everything above this line is what a MICrONS report looks like. χJump's unit of work is an
     ASSEMBLY, ωJump's is a DISCOVERY, and βJump's is a CORRECTION -- none of which has a "New
     identifications" row anywhere, so "Download your work" in those tools returned a workbook
     holding nothing but "Organelle locations", the one sheet every tool shares.

     No per-dataset branching: myReportsList() skips a sheet the spreadsheet does not have, and
     no spreadsheet holds another tool's tabs. One list; each workbook answers with its own.

     "Box visits" is χJump's AND ωJump's, and one entry covers both for the same reason. */
  {name:"Cells built",emailCol:"reporterEmail"},            // χJump
  {name:"Cell fragments",emailCol:"reporterEmail"},         // χJump
  {name:"Cell names",emailCol:"reporterEmail"},             // χJump
  {name:"Cell rejections",emailCol:"reporterEmail"},        // χJump
  {name:"Nuclei",emailCol:"reporterEmail"},                 // χJump — the discovery loop
  {name:"Nuclei found",emailCol:"reporterEmail"},           // ωJump
  {name:"Nucleus names",emailCol:"reporterEmail"},          // ωJump
  {name:"Nucleus rejections",emailCol:"reporterEmail"},     // ωJump
  {name:"Box visits",emailCol:"reporterEmail"},             // χJump and ωJump both
  {name:"Nucleus position fixes",emailCol:"reporterEmail"}  // βJump
];
/* Returns { "<sheet name>": {headers:[...], rows:[[...],...]}, ... } -- one key per sheet the
   user has at least one row in (sheets they've never touched are omitted entirely, so an empty
   client-side workbook doesn't grow a pile of blank tabs). The submitter's own email column is
   stripped from both headers and rows before returning (the caller already knows their own
   email, and there's no reason to echo it back row after row). Date objects (see safeNumGs's own
   comment above on why Sheets sometimes stores a value as a Date) are converted to ISO strings so
   the JSON response stays valid regardless of what got auto-detected on import. */
function myReportsList(email){
  var ss=SS();
  var out={};
  MY_REPORTS_SHEETS.forEach(function(cfg){
    var sh=ss.getSheetByName(cfg.name);
    if(!sh||sh.getLastRow()<2)return;
    var data=sh.getDataRange().getValues(),header=data[0];
    var iEm=header.indexOf(cfg.emailCol);
    if(iEm<0)return;
    var rows=[];
    for(var r=1;r<data.length;r++){
      if(String(data[r][iEm]||"")!==email)continue;
      var rowOut=[];
      for(var c=0;c<header.length;c++){
        if(c===iEm)continue;
        var v=data[r][c];
        rowOut.push(v instanceof Date?v.toISOString():v);
      }
      rows.push(rowOut);
    }
    if(rows.length){
      var headersOut=header.filter(function(h,idx){return idx!==iEm;});
      out[cfg.name]={headers:headersOut,rows:rows};
    }
  });
  return out;
}

function doPost(e){
  setDsFromRequest(e);   // Datasets.gs -- must be the FIRST statement
  var _dsErr = dsConfigError();          // see the note in doGet above
  if (_dsErr) return gJson({ok:false, error:_dsErr});
  var d=JSON.parse(e.postData.contents);
  // Reject anything without a valid, unexpired Google ID token BEFORE writing any row.
  var identity=verifyGoogleToken(d.credential);
  if(!identity){
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:"unauthenticated"}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  // Trust ONLY the verified identity for attribution — overwrite whatever the client sent.
  d.reporterName=identity.name;
  d.reporterEmail=identity.email;
  // Report dedup: a fresh identity call by the same user for the same cell replaces their earlier one.
  if(d.type==="new_identification"||d.type==="confirmation"||d.type==="discrepancy"){removePriorIdentityReports(d.nucleusId,identity.email);}
  var ss=SS();
  /* βJump only: move an automatically-detected nucleus to a corrected coordinate. Every other
     thing βJump submits reuses an existing type -- identifications are "new_identification",
     rejections are "not_a_nucleus" -- so this is the single new branch. Handler in
     BJumpPosition.gs; placed before the chain so the chain itself is untouched. */
  if(d.type==="nucleus_position_fix"){ return mlAfter_(ss, d, bjumpPositionFix(d, ss)); }
  /* EVERY BRANCH FROM HERE TO THE CHAIN IS WRAPPED IN mlAfter_(), which records the cell in the
     shared "Master cell list" and returns the handler's own response unchanged (MasterList.gs,
     2026-09-02, Søren: "always fill data into those sheets when there are user reports"). It is
     a wrapper rather than a line inside each handler because these branches return directly --
     there is no shared exit here to hang it on -- and because a handler added later then cannot
     forget it. It is a no-op for any dataset not in ML_DATASETS.

     2026-09-04 (audit item 5): βJump's branch above IS wrapped now. It was left out because
     βJump is not in ML_DATASETS, which made the wrapper pointless -- but "pointless today"
     and "wrong" are different, and a branch that returns early is exactly the one that gets
     forgotten on the day the dataset IS opted in. The wrapper costs one no-op call.

     ωJump's three writes. Placed here with bjumpPositionFix, before the if/else chain, so the
     chain itself stays untouched. wjump_box_visit fires for an EMPTY box as well as a productive
     one -- see the header of WJumpDiscovery.gs for why that record is load-bearing rather than
     bookkeeping. */
  if(d.type==="wjump_box_visit"){      return mlAfter_(ss, d, wjumpBoxVisit(d, ss)); }
  if(d.type==="wjump_nucleus_found"){  return mlAfter_(ss, d, wjumpNucleusFound(d, ss)); }
  if(d.type==="wjump_nucleus_name"){   return mlAfter_(ss, d, wjumpNucleusName(d, ss)); }
  /* The community finds these, so the community will also find things that are not nuclei. A map
     that can only grow keeps its mistakes for ever. A rejection is a VOTE, not a delete -- one
     person must not be able to erase another's find. */
  if(d.type==="wjump_nucleus_reject"){ return mlAfter_(ss, d, wjumpNucleusReject(d, ss)); }
  /* χJump's five writes. Handlers in XJumpCells.gs; placed here with the ωJump and βJump
     branches, before the if/else chain, so the chain itself stays untouched. What is different
     about this tool is that its unit of work is an ASSEMBLY rather than a report: a cell here is
     a set of fragment ids a person put together, so building, adding and removing are all
     first-class writes and not variants of one submission. */
  if(d.type==="xjump_cell_build"){  return mlAfter_(ss, d, xjumpCellBuild(d, ss)); }
  if(d.type==="xjump_cell_add"){    return mlAfter_(ss, d, xjumpCellAdd(d, ss)); }
  if(d.type==="xjump_cell_remove"){ return mlAfter_(ss, d, xjumpCellRemove(d, ss)); }
  if(d.type==="xjump_cell_name"){   return mlAfter_(ss, d, xjumpCellName(d, ss)); }
  /* A rejection is a VOTE, not a delete -- one person must not be able to dismantle another's
     assembly. Same rule as ωJump's, with more force here: what is being judged is somebody's
     work rather than a detector's output. */
  if(d.type==="xjump_cell_reject"){ return mlAfter_(ss, d, xjumpCellReject(d, ss)); }
  /* χJump's discovery loop, added 2026-09-01. Nuclei arrive in BULK -- one POST carrying an array
     of points from neuroglancer's annotation tool -- because fifty marks would otherwise be fifty
     round trips, and because only a batch can be deduped against itself as well as against the
     sheet. The join is a conclusion the PAGE reaches, by testing each point against the meshes of
     an assembled cell, and arrives here as an answer rather than a question. */
  if(d.type==="xjump_nuclei_found"){ return mlAfter_(ss, d, xjumpNucleiFound(d, ss)); }
  if(d.type==="xjump_box_visit"){    return mlAfter_(ss, d, xjumpBoxVisit(d, ss)); }
  if(d.type==="xjump_nucleus_join"){ return mlAfter_(ss, d, xjumpNucleusJoin(d, ss)); }
  if(d.type==="new_identification"){
    var sh=ss.getSheetByName("New identifications")||ss.insertSheet("New identifications");
    if(sh.getLastRow()===0){
      sh.appendRow(["timestamp","nucleusId","rootId","coord","identified","path","reporterName","reporterEmail","comment","certainty"]);
    }
    sh.appendRow([d.timestamp||new Date().toISOString(),d.nucleusId||"",d.rootId||"",
                  d.coord||"",d.identified||"",d.path||"",d.reporterName||"",d.reporterEmail||"",d.comment||"",d.certainty||""]);
    upsertMasterCellRow(d.nucleusId,d); // keep "Master cell list" current -- see comment above its definition; d carries certainty/comment/reporterName/reporterEmail/rootId/coord for classification-history logging
  } else if(d.type==="confirmation"){
    // A user's identification MATCHES MICrONS' own existing suggestion exactly -- kept as its
    // own sheet/type (same schema as "New identifications" above) rather than folded into it, so
    // it stays distinguishable as "corroborates an existing correct call" vs "brand-new ID for a
    // previously-unclassified cell". Still counted into the same per-nucleus/allIds
    // community-report tallies as Discrepancies/New identifications (see doGet below), since more
    // independent agreement should visibly build confidence in a cell, not vanish.
    var sh=ss.getSheetByName("Confirmations")||ss.insertSheet("Confirmations");
    if(sh.getLastRow()===0){
      sh.appendRow(["timestamp","nucleusId","rootId","coord","identified","path","reporterName","reporterEmail","comment","certainty"]);
    }
    sh.appendRow([d.timestamp||new Date().toISOString(),d.nucleusId||"",d.rootId||"",
                  d.coord||"",d.identified||"",d.path||"",d.reporterName||"",d.reporterEmail||"",d.comment||"",d.certainty||""]);
    upsertMasterCellRow(d.nucleusId,d); // keep "Master cell list" current -- see comment above its definition; d carries certainty/comment/reporterName/reporterEmail/rootId/coord for classification-history logging
  } else if(d.type==="merged_split"){
    // One row per sub-nucleus a user reported inside a single fused MICrONS detection --
    // groupId ties every sub-nucleus from the same report together, subIndex/subCount
    // record its position within that group (e.g. "2 of 3").
    var sh=ss.getSheetByName("Merged splits")||ss.insertSheet("Merged splits");
    if(sh.getLastRow()===0){
      sh.appendRow(["timestamp","nucleusId","rootId","coord","groupId","subIndex","subCount","identified","path","reporterName","reporterEmail","comment","certainty"]);
    }
    sh.appendRow([d.timestamp||new Date().toISOString(),d.nucleusId||"",d.rootId||"",
                  d.coord||"",d.groupId||"",d.subIndex||"",d.subCount||"",d.identified||"",d.path||"",d.reporterName||"",d.reporterEmail||"",d.comment||"",d.certainty||""]);
    upsertMasterCellMergedStatus(d.nucleusId); // keep "Master cell list"'s merged-status columns current -- see its own comment above
  } else if(d.type==="organelle_location"){
    // One row per centriole/cilium a user reported on an already-identified cell --
    // groupId+subIndex/subCount tie multiple structures from the same submission together,
    // same convention as merged_split above. kind is "centriole" (pointA only) or "cilium"
    // (pointA=base, pointB=tip) -- or, since 2026-08-07, any other vector kind (pointA/pointB are
    // generic, not cilium-specific -- see ORGANELLE_KIND_BY_VALUE[...].vector in ujump.html).
    var sh=ss.getSheetByName("Organelle locations")||ss.insertSheet("Organelle locations");
    if(sh.getLastRow()===0){
      sh.appendRow(["timestamp","nucleusId","rootId","coord","groupId","subIndex","subCount","kind","pointA","pointB","identified","path","reporterName","reporterEmail","comment"]);
    }
    // 2026-08-07: hole-shaped structures (microglia_plug, nucleoplasmic_reticulum_2 -- Søren's
    // "astrocyte holes") carry a bit more geometry than a plain organelle point: the hole's own
    // length/width/direction (not just pointA/pointB's straight-line distance) and which
    // organelles were seen passing through it. These 4 fields are OPTIONAL and blank on every
    // ordinary report -- for now only ever populated by the "All own data.xlsx" bulk import (see
    // dashboard-data-tools/build_hole_reports_import.py), though any future report could fill
    // them in too. ensureHeaderColumn (not the one-time getLastRow()===0 branch above) since this
    // sheet already has months of live rows by the time this was added -- see that function's own
    // comment for why the one-time branch alone would silently leave these headerless.
    ensureHeaderColumn(sh,"holeLengthUm");
    ensureHeaderColumn(sh,"holeWidthUm");
    ensureHeaderColumn(sh,"holeDirection");
    ensureHeaderColumn(sh,"throughHole");
    sh.appendRow([d.timestamp||new Date().toISOString(),d.nucleusId||"",d.rootId||"",
                  d.coord||"",d.groupId||"",d.subIndex||"",d.subCount||"",d.kind||"",d.pointA||"",d.pointB||"",d.identified||"",d.path||"",d.reporterName||"",d.reporterEmail||"",d.comment||"",
                  d.holeLengthUm||"",d.holeWidthUm||"",d.holeDirection||"",d.throughHole||""]);
    // 2026-08-04: fold centriole/cilium observations into "Master cell list" too (Søren: "the
    // centriole and primary cilium data did not show in the Master cell list even though it was
    // listed in the organelle locations") -- see upsertMasterCellOrganelle()'s own comment above.
    upsertMasterCellOrganelle(d.nucleusId,d.kind,d.pointA,d.pointB,d.coord);
  } else if(d.type==="not_a_nucleus"){
    // Flags a MICrONS nucleus detection as a false positive (segmentation artifact, not a
    // real nucleus at all) rather than forcing a cell-type identification onto it.
    var sh=ss.getSheetByName("Not a nucleus")||ss.insertSheet("Not a nucleus");
    if(sh.getLastRow()===0){
      sh.appendRow(["timestamp","nucleusId","rootId","coord","comment","path","reporterName","reporterEmail"]);
    }
    sh.appendRow([d.timestamp||new Date().toISOString(),d.nucleusId||"",d.rootId||"",
                  d.coord||"",d.comment||"",d.path||"",d.reporterName||"",d.reporterEmail||""]);
    upsertMasterCellRejection(d.nucleusId); // the row it is about should say somebody rejected it
  } else if(d.type==="restore_classification"){
    /* Undo / correct-my-own-submission / administrator restore -- 2026-08-09, see
       RESTORE_UNDO_WINDOW_MS's own comment above for the general design. Three ways a caller can
       reach this branch, distinguished by which fields are set on d:
         - d.undoLast===true            -> quick "Undo" toast right after a submission. Reverts
           the CALLER's own most recent "Classification history" entry for this nucleus back to
           whatever it replaced (previousIdentity). Self only, and only within
           RESTORE_UNDO_WINDOW_MS of that entry's own timestamp.
         - d.targetTimestamp set, caller is that entry's own original reporter -> "Correct this"
           in the history panel: re-applies an OLDER entry of the caller's own (its newIdentity),
           no time limit, since this is a deliberate lookup rather than a reflexive undo.
         - d.targetTimestamp set, caller is OWNER_EMAIL -> "Restore this version" administrator
           action, available on ANY history entry regardless of who originally wrote it, no time
           limit. Written through own_verified_identity (the SAME authoritative-override column
           Søren's own verified dataset already uses) so it actually sticks ahead of the
           community tally, rather than being just one more vote that could immediately be
           outvoted again.
       Every path funnels back through upsertMasterCellRow() so the restore is itself a normal,
       fully-audited "Classification history" entry (see forceSourceType below) -- nothing here
       bypasses or deletes any existing history row, satisfying "preserve full audit history" /
       "accidental changes do not permanently overwrite" by construction: the thing being undone
       is still sitting in the sheet, and the undo itself is just one more entry on top of it. */
    var rcHist=ss.getSheetByName(CLASSIFICATION_HISTORY_SHEET);
    var rcTarget=null;
    if(rcHist&&rcHist.getLastRow()>=2){
      var rcData=rcHist.getDataRange().getValues(),rcH=rcData[0];
      var rcNuc=rcH.indexOf("nucleusId"),rcTs=rcH.indexOf("timestamp"),rcPrev=rcH.indexOf("previousIdentity"),
          rcNew=rcH.indexOf("newIdentity"),rcEm=rcH.indexOf("reporterEmail");
      if(d.undoLast===true){
        // Append-only + never reordered -> the LAST matching row found while scanning forward is
        // the most recent entry (same technique as lastClassificationHistoryEntry() above).
        for(var rr=1;rr<rcData.length;rr++){
          if(String(rcData[rr][rcNuc])!==String(d.nucleusId))continue;
          rcTarget={previousIdentity:rcData[rr][rcPrev],newIdentity:rcData[rr][rcNew],
            reporterEmail:rcEm>=0?rcData[rr][rcEm]:"",timestamp:rcData[rr][rcTs]};
        }
      } else if(d.targetTimestamp){
        for(var rr2=1;rr2<rcData.length;rr2++){
          if(String(rcData[rr2][rcNuc])!==String(d.nucleusId))continue;
          if(String(rcData[rr2][rcTs])!==String(d.targetTimestamp))continue;
          rcTarget={previousIdentity:rcData[rr2][rcPrev],newIdentity:rcData[rr2][rcNew],
            reporterEmail:rcEm>=0?rcData[rr2][rcEm]:"",timestamp:rcData[rr2][rcTs]};
          break;
        }
      }
    }
    if(rcTarget){
      var isAdmin=Boolean(OWNER_EMAIL)&&identity.email===OWNER_EMAIL;
      var isSelf=Boolean(rcTarget.reporterEmail)&&identity.email===rcTarget.reporterEmail;
      var withinWindow=true;
      if(d.undoLast===true&&!isAdmin){
        var rcAge=Date.now()-new Date(rcTarget.timestamp).getTime();
        withinWindow=isFinite(rcAge)&&rcAge>=0&&rcAge<=RESTORE_UNDO_WINDOW_MS;
      }
      if((isAdmin||isSelf)&&withinWindow){
        var restoreIdentity=d.undoLast===true?rcTarget.previousIdentity:rcTarget.newIdentity;
        if(restoreIdentity){
          if(isAdmin&&!isSelf){
            // Administrator restore -- write straight into own_verified_identity so it trumps the
            // community tally, exactly like Søren's own verified dataset already does. Silently
            // no-ops if the nucleus isn't in "Master cell list" yet (upsertMasterCellRow below
            // covers that same case for the history-logging half).
            var rcMsh=ss.getSheetByName(MASTER_LIST_SHEET);
            if(rcMsh){
              var rcHead=rcMsh.getRange(1,1,1,rcMsh.getLastColumn()).getValues()[0];
              var rcIOwn=rcHead.indexOf("own_verified_identity"),rcIKey=rcHead.indexOf("cell_key");
              if(rcIOwn>=0&&rcIKey>=0&&rcMsh.getLastRow()>=2){
                var rcCellKey="N:"+String(d.nucleusId);
                var rcKeys=rcMsh.getRange(2,rcIKey+1,rcMsh.getLastRow()-1,1).getValues();
                for(var rcR=0;rcR<rcKeys.length;rcR++){
                  if(String(rcKeys[rcR][0])===rcCellKey){rcMsh.getRange(rcR+2,rcIOwn+1).setValue(restoreIdentity);break;}
                }
              }
            }
            upsertMasterCellRow(d.nucleusId,{rootId:d.rootId||"",coord:d.coord||"",certainty:"",
              comment:(d.reason?d.reason+" ":"")+"Restored by administrator.",
              reporterName:identity.name,reporterEmail:identity.email,forceSourceType:"admin_restore"});
          } else {
            // Self: undo my own last change, or correct an earlier call of my own. Goes through
            // the SAME live-tally path as any other reclassification (Discrepancies + the usual
            // one-row-per-reporter dedupe) -- not authoritative, so a later community vote can
            // still outweigh it, same as any real reclassification would be. This is deliberate:
            // an "undo" from an ordinary reporter shouldn't be able to force-override everyone
            // else's independent votes the way an admin restore can.
            removePriorIdentityReports(d.nucleusId,identity.email);
            var rsh=ss.getSheetByName("Discrepancies")||ss.insertSheet("Discrepancies");
            if(rsh.getLastRow()===0){
              rsh.appendRow(["timestamp","nucleusId","rootId","coord","registered","identified","path","reporterName","reporterEmail","comment","certainty"]);
            }
            var rcComment=(d.reason?d.reason+" ":"")+(d.undoLast===true?"Undo of my previous submission.":"Correcting my own earlier call.");
            rsh.appendRow([new Date().toISOString(),d.nucleusId||"",d.rootId||"",d.coord||"",
              rcTarget.newIdentity||"",restoreIdentity,"",identity.name,identity.email,rcComment,""]);
            upsertMasterCellRow(d.nucleusId,{rootId:d.rootId||"",coord:d.coord||"",certainty:"",
              comment:rcComment,reporterName:identity.name,reporterEmail:identity.email,
              forceSourceType:d.undoLast===true?"undo":"manual_revision"});
          }
        }
      }
      // Unauthorized, window expired, or nothing to restore to -- silently no-op, same "fail
      // closed, no error surfaced" convention as remove_root_id above (and the only option anyway,
      // since postReport() sends mode:"no-cors" and can never read a response).
    }
  } else if(d.type==="save_computed_volume"){
    // Logs one result of the "Compute volume" button (MeshDL.computeVolume() in the HTML) --
    // a mesh-derived whole-cell volume estimate, which MICrONS does not publish anywhere and
    // which the client can only get one cell at a time (fetching+decoding a full mesh is too
    // expensive to do in bulk). Rather than trying to precompute this for the whole dataset,
    // the µJump dashboard's "root-ID volume vs nucleus volume" graph is intentionally seeded
    // FROM REAL USAGE: every time someone clicks the button and it succeeds, that one data
    // point is saved here, so the graph starts sparse and fills in organically over time as
    // more cells get looked at -- added 2026-07-31, Søren's chosen approach over a one-off
    // batch job or a "coming soon" placeholder. nucleusId is blank for a standalone point or
    // a merged-nucleus sub-cell (same "no real single nucleus to key on" situation as
    // new_cell_no_nucleus/organelle_location above); cellType is whatever the tool's own
    // best-available identity was showing at the moment of the click (own-verified > MICrONS
    // prediction > "Unclassified"), so the dashboard can bucket volumes by type without a
    // second lookup. UPSERT by rootId (changed 2026-08-02, reversing the original no-dedup
    // design): re-computing the same cell's volume (e.g. after a re-proofread mesh, or just a
    // second person clicking "Recalculate" on the same root ID) now OVERWRITES that root ID's
    // existing row instead of appending a new one. Søren's call after seeing the sheet fill up
    // with many rows for popular/re-visited cells -- one row per cell is what the dashboard
    // actually wants (its "root-ID volume vs nucleus volume" graph plots one point per cell, not
    // per click), and the HTML side now shows the existing saved volume next to the button
    // (labelled "Recalculate" instead of "Compute volume" once a value is known) so a repeat
    // click is always an intentional update, not an accidental duplicate. Rows with a blank
    // rootId (shouldn't normally happen -- the button always has one) fall back to append.
    // nucVolumeUm3 (added 2026-08-xx): the PRECOMPUTED nucleus volume for this exact same
    // cell (from Søren's CAVE nucleus_detection_v0 export), sent alongside the freshly
    // computed mesh volume ONLY when the click happened from the main nucleus display (where
    // that number is already known and shown on-screen) -- see meshDlButtonHtml()'s comment
    // in the HTML. Blank whenever unknown (e.g. clicked from a community-reported cell's own
    // panel, or a standalone/merged-sub cell with no single nucleus to look a volume up for).
    // This is what lets the dashboard show nucleus volume as a real measured PORTION of the
    // same cell's whole-cell volume, instead of two unrelated per-type averages -- appended
    // as the last column so existing rows/headers aren't disturbed.
    var sh=ss.getSheetByName("Computed volumes")||ss.insertSheet("Computed volumes");
    if(sh.getLastRow()===0){
      sh.appendRow(["timestamp","rootId","nucleusId","cellType","volumeUm3","vertices","fragmentCount","reporterEmail","nucVolumeUm3"]);
    }
    // 2026-08-02 retrofit: ensureHeaderColumn() (see its own comment above) self-heals a real bug --
    // this sheet was created before nucVolumeUm3 existed in the write array above, so its live
    // header row only ever had 8 cells while every row since has been writing a 9th value with no
    // header above it (Søren: "column I ... does not have a header"). Cheap (one small read, a
    // write only the first time it's missing), safe to call on every submission going forward.
    ensureHeaderColumn(sh,"nucVolumeUm3");
    var cvRow=[d.timestamp||new Date().toISOString(),d.rootId||"",d.nucleusId||"",
               d.cellType||"",d.volumeUm3||"",d.vertices||"",d.fragmentCount||"",d.reporterEmail||"",d.nucVolumeUm3||""];
    var cvExistingRow=-1;
    if(d.rootId&&sh.getLastRow()>=2){
      var cvData=sh.getRange(2,2,sh.getLastRow()-1,1).getValues(); // column B = rootId
      for(var cvR=0;cvR<cvData.length;cvR++){
        if(String(cvData[cvR][0])===String(d.rootId)){cvExistingRow=cvR+2;break;}
      }
    }
    if(cvExistingRow>0)sh.getRange(cvExistingRow,1,1,cvRow.length).setValues([cvRow]);
    else sh.appendRow(cvRow);
    // 2026-08-02: fold this volume into "Master cell list" too (Søren: "The master cell list
    // should also contain the computed volumes.") -- see upsertMasterCellComputedVolume()'s own
    // comment for the join logic (nucleusId first, microns_root_id fallback).
    upsertMasterCellComputedVolume(d.rootId,d.nucleusId,Number(d.volumeUm3)||0);
  } else if(d.type==="connectivity_sample"){
    /* 2026-08-09 (Søren: "every time a user looks at the connectivity, the data should be added
       to the graph") -- same "seeded from real usage" philosophy as save_computed_volume just
       above: the dashboard's "Input vs output synapses per cell type" chart used to be driven
       entirely by a static connectivity_aggregate.json Søren regenerates occasionally offline via
       microns_connectivity_colab.py (his own CAVE token, up to 40 sampled cells per type). Now,
       every time ANYONE expands a cell's "Connectivity" panel and successfully queries CAVE with
       THEIR OWN token, the resulting input/output synapse counts for that ONE cell are logged
       here too, so the chart grows organically and never needs a manual offline re-run to stay
       current. inputCount/outputCount are TOTAL synapse counts for the queried cell (every synapse
       returned by that query, tagged by direction) -- not partner counts, not an average -- see
       the client's own comment where these are computed. cellType is the tool's own
       best-available identity for the queried cell at the moment of the query (own-verified >
       community > MICrONS prediction > "Unclassified"), same convention save_computed_volume
       already uses. layer is optional (estimateLayerFast() on the client) and lets
       renderSynapseIO()'s existing layer picker filter live samples the same way it used to
       filter the static aggregate's precomputed per-layer breakdown.
       UPSERT by nucleusId (2026-08-10, Søren: "If the connectivity has been sampled before, it
       should update the already existing sample and not make an extra one") -- reversing the
       original append-only design (every prior comment revision here argued FOR one row per
       query, matching save_computed_volume's OWN original append-only design before Søren made
       the exact same call there; see that branch's comment for the parallel history). Re-querying
       the SAME cell now OVERWRITES its existing row instead of adding another: one row per cell,
       not one row per click, same as save_computed_volume's rootId upsert. This also means a
       popular cell that gets looked at repeatedly no longer over-represents itself in
       renderSynapseIO()'s dot plot (pseudo-replication) -- the dot plot now reads as one point per
       DISTINCT cell ever queried, its MOST RECENT synapse counts, which is arguably a better
       distribution anyway (repeated proofreading of the same cell over time should update its
       sample, not multiply it). Falls back to append if nucleusId is somehow blank (shouldn't
       normally happen -- loadConnectivityPanel() is only wired up for the main in-region nucleus
       panel, which always has one).
       byType (2026-08-09, Søren: "We should also save which cell types they are connecting with.
       So that we can make the '3 cell types with the most synaptic connections' graph a live graph
       at some point.") -- a JSON string, {partnerCellType: {in:N, out:N}}, one entry per distinct
       partner cell type this query found, computed client-side from the SAME allPoints the
       in/output totals above come from (see saveConnectivitySample()'s own comment in ujump.html).
       Mirrors connectivity_aggregate.json's by_synapse_count[queryCellType][partnerCellType] shape
       (partner type -> synapse count) closely enough that a future live version of THAT chart
       (renderConnectivity(), currently reading the static offline file) could sum this column's
       in+out across every sample instead, grouped by cellType -- not wired up yet, just captured
       now so the data already exists once that's built. Stored as one JSON string per row rather
       than one row per partner type to avoid multiplying row count by ~10-16x per query. */
    var conSh=ss.getSheetByName("Connectivity samples")||ss.insertSheet("Connectivity samples");
    if(conSh.getLastRow()===0){
      conSh.appendRow(["timestamp","nucleusId","rootId","cellType","layer","inputCount","outputCount","reporterName","reporterEmail","byType"]);
    }
    var conRow=[d.timestamp||new Date().toISOString(),d.nucleusId||"",d.rootId||"",
      d.cellType||"Unclassified",d.layer||"",Number(d.inputCount)||0,Number(d.outputCount)||0,
      d.reporterName||"",d.reporterEmail||"",String(d.byType||"")];
    var conExistingRow=-1;
    if(d.nucleusId&&conSh.getLastRow()>=2){
      var conNucCol=1; // "nucleusId" is column B (index 1) in the header written just above
      var conIds=conSh.getRange(2,conNucCol+1,conSh.getLastRow()-1,1).getValues();
      for(var conR=0;conR<conIds.length;conR++){
        if(String(conIds[conR][0])===String(d.nucleusId)){conExistingRow=conR+2;break;}
      }
    }
    if(conExistingRow>0)conSh.getRange(conExistingRow,1,1,conRow.length).setValues([conRow]);
    else conSh.appendRow(conRow);
  } else if(d.type==="cell_contacts_batch"){
    /* "Find cell contacts" (2026-08-10, Soren: "I would want it to be done for any kind of cell
       with any other kind of cell... Is it possible for the user to compute the coordinates for
       the places where a cell contacts the nearest cells... like compute volume... Could this be
       done in uJump?") -- ujump.html's computeCellContacts() fetches this cell's own mesh plus
       its CELL_CONTACT_CANDIDATES nearest neighbours' meshes (any type) in the browser and finds
       the minimum mesh-to-mesh distance for each pair via a grid-based proximity test; this saves
       EVERY evaluated pair in one batch request per click (not just "touching" ones -- see that
       function's own comment for why a "not touching" result is still worth recording), rather
       than one POST per pair.
       UPSERTED by an UNORDERED nucleus pair key: nucleusIdA is always the lexicographically
       smaller of the two nucleus IDs, nucleusIdB the other -- re-checking the same pair from
       EITHER cell's own panel updates the one shared row instead of creating a second,
       potentially contradictory-looking row for "the same physical fact" viewed from the other
       side (same "upsert, don't duplicate" principle Soren already asked for on Connectivity
       samples, applied here from the start rather than needing a second request to fix it).
       contactPointNucleusId records which of the two cells the saved contactVoxel* coordinate
       actually sits ON -- the algorithm always returns a point on the QUERYING cell's own mesh
       (d.nucleusId here), which is not necessarily "A" after the lexicographic sort above, so
       this can't be inferred later from nucleusIdA/B alone and has to be stored explicitly.
       touchPointCount/usedDefaultSettings (2026-08-14, Soren: "save the number of contact points
       between the cell types, so that we can make a live-updating dot-plot graph showing the
       average number of contact points between two cell types ... only used for the graph if the
       default settings are used, so that they are comparable") -- touchPointCount is how many
       touch points THIS pair actually had (the sheet still only stores one representative
       coordinate per pair, same as before -- this is just the count); usedDefaultSettings ("yes"/
       "no") records whether the click that produced this row used the tool's current default
       cluster spacing, so ?meshContactTypeStats=1 below can filter to only comparable rows before
       averaging. NOTE for whoever deploys this: if "Mesh contacts" already exists as a live sheet
       from before this date, these two columns won't be on its header row -- add
       "touchPointCount" and "usedDefaultSettings" as two new header cells at the end of row 1
       by hand (same one-time fix as nucRootId got on "New cells (no nucleus)" below); new sheets
       get them automatically via the appendRow just below. */
    var ccSh=ss.getSheetByName("Mesh contacts")||ss.insertSheet("Mesh contacts");
    if(ccSh.getLastRow()===0){
      ccSh.appendRow(["timestamp","nucleusIdA","rootIdA","cellTypeA","nucleusIdB","rootIdB","cellTypeB",
        "minDistanceNm","contactPointNucleusId","contactVoxelX","contactVoxelY","contactVoxelZ","reporterName","reporterEmail",
        "touchPointCount","usedDefaultSettings"]);
    }
    var ccPairs=Array.isArray(d.pairs)?d.pairs:[];
    if(ccPairs.length){
      var ccData=ccSh.getDataRange().getValues();
      var ccHead=ccData[0];
      var ccIA=ccHead.indexOf("nucleusIdA"),ccIB=ccHead.indexOf("nucleusIdB");
      var ccKeyToRow={};
      for(var ccr=1;ccr<ccData.length;ccr++){
        ccKeyToRow[String(ccData[ccr][ccIA])+"|"+String(ccData[ccr][ccIB])]=ccr+1;
      }
      var ccTs=d.timestamp||new Date().toISOString();
      var ccQueryNid=String(d.nucleusId||"");
      var ccUsedDefault=d.usedDefaultSettings?"yes":"no";
      ccPairs.forEach(function(p){
        var nidB=String(p.contactNucleusId||"");
        if(!ccQueryNid||!nidB)return;
        var lo=ccQueryNid<nidB?ccQueryNid:nidB,hi=ccQueryNid<nidB?nidB:ccQueryNid;
        var rootLo=ccQueryNid<nidB?(d.rootId||""):(p.contactRootId||"");
        var rootHi=ccQueryNid<nidB?(p.contactRootId||""):(d.rootId||"");
        var typeLo=ccQueryNid<nidB?(d.cellType||""):(p.contactCellType||"");
        var typeHi=ccQueryNid<nidB?(p.contactCellType||""):(d.cellType||"");
        var row=[ccTs,lo,rootLo,typeLo,hi,rootHi,typeHi,Number(p.minDistanceNm)||0,ccQueryNid,
          p.contactVoxelX!=null?p.contactVoxelX:"",p.contactVoxelY!=null?p.contactVoxelY:"",p.contactVoxelZ!=null?p.contactVoxelZ:"",
          d.reporterName||"",d.reporterEmail||"",
          Number(p.touchPointCount)||(p.contactVoxelX!=null&&p.contactVoxelX!==""?1:0),ccUsedDefault];
        var key=lo+"|"+hi,existingRow=ccKeyToRow[key];
        if(existingRow)ccSh.getRange(existingRow,1,1,row.length).setValues([row]);
        else{ccSh.appendRow(row);ccKeyToRow[key]=ccSh.getLastRow();}
      });
    }
  } else if(d.type==="mesh_proximity_batch"){
    /* ── ONE CELL, AND WHAT WAS MEASURED NEAR ITS MEMBRANE ───────────────────────  2026-09-04
       Søren's write audit found two expensive computations with nowhere to go: βJump's synapse
       contacts (a mesh-surface search of the raw synapse segmentation, each hit verified by
       fetching its own mesh) and µJump's astrocyte-synapse proximity (per synapse, the distance
       to the nearest astrocyte membrane, and whether that makes it tripartite). Both ran for
       minutes, produced real findings, and offered an .xlsx download as the only way out.

       NOT cell_contacts_batch, though the shape is close. That sheet is built around a SYMMETRIC
       cell-to-cell pair -- nucleusIdA/nucleusIdB, upserted on the unordered key -- and neither of
       these is symmetric: a synapse segment is not a cell with a nucleus, and an astrocyte's
       distance to somebody else's synapse is not a fact about two somata. Putting them there
       would corrupt the one sheet that IS about cell pairs.

       `kind` carries which question was asked ("synapse_contacts" / "tripartite"), and every read
       filters on it. Columns that would mean different things for different kinds live in the
       `detail` JSON rather than becoming half-empty columns nobody can interpret.

       LATEST RUN WINS, per (kind, nucleusId, reporter): re-running with a bigger radius is a
       correction, not a second opinion. Somebody ELSE's run for the same cell is kept -- two
       people measuring at different settings is real disagreement, and the sheet should show it. */
    var mpSh=ss.getSheetByName("Mesh proximity")||ss.insertSheet("Mesh proximity");
    if(mpSh.getLastRow()===0){
      mpSh.appendRow(["timestamp","kind","nucleusId","rootId","cellType","itemIndex",
        "partnerNucleusId","partnerRootId","partnerType","minDistanceNm","status","count",
        "atVoxelX","atVoxelY","atVoxelZ","partnerVoxelX","partnerVoxelY","partnerVoxelZ",
        "detail","settings","usedDefaultSettings","reporterName","reporterEmail"]);
    }
    var mpKind=String(d.kind||"").slice(0,40);
    var mpNid=String(d.nucleusId||"");
    var mpEmail=String(d.reporterEmail||"");
    var mpItems=Array.isArray(d.items)?d.items:[];
    if(!mpKind||!mpNid)return gJson({ok:false,error:"mesh_proximity_batch needs a kind and a nucleusId"});
    /* THIS REPORTER'S PREVIOUS RUN FOR THIS CELL AND KIND, removed first. Bottom-up, because
       deleting a row renumbers everything below it. */
    if(mpSh.getLastRow()>=2){
      var mpVals=mpSh.getDataRange().getValues(),mpH=mpVals[0];
      var mpKi=mpH.indexOf("kind"),mpNi=mpH.indexOf("nucleusId"),mpEi=mpH.indexOf("reporterEmail");
      for(var mpr=mpVals.length-1;mpr>=1;mpr--){
        if(String(mpVals[mpr][mpKi])===mpKind&&String(mpVals[mpr][mpNi])===mpNid
           &&String(mpVals[mpr][mpEi]||"").toLowerCase()===mpEmail.toLowerCase())mpSh.deleteRow(mpr+1);
      }
    }
    var mpTs=d.timestamp||new Date().toISOString();
    var mpSettings=typeof d.settings==="string"?d.settings:JSON.stringify(d.settings||{});
    var mpDefault=d.usedDefaultSettings?"yes":"no";
    var mpRows=mpItems.map(function(it,idx){
      return [mpTs,mpKind,mpNid,String(d.rootId||""),String(d.cellType||""),idx+1,
        String(it.partnerNucleusId||""),String(it.partnerRootId||""),String(it.partnerType||""),
        it.minDistanceNm===""||it.minDistanceNm==null?"":Number(it.minDistanceNm),
        String(it.status||""),it.count===""||it.count==null?"":Number(it.count),
        it.atVoxelX!=null?it.atVoxelX:"",it.atVoxelY!=null?it.atVoxelY:"",it.atVoxelZ!=null?it.atVoxelZ:"",
        it.partnerVoxelX!=null?it.partnerVoxelX:"",it.partnerVoxelY!=null?it.partnerVoxelY:"",
        it.partnerVoxelZ!=null?it.partnerVoxelZ:"",
        typeof it.detail==="string"?it.detail:JSON.stringify(it.detail||{}),
        mpSettings,mpDefault,d.reporterName||"",mpEmail];
    });
    /* A RUN THAT FOUND NOTHING IS A RESULT. One row with no partner records that this cell was
       checked at these settings and came back empty -- which is the difference between "nobody has
       looked" and "somebody looked and there is nothing there". */
    if(!mpRows.length){
      mpRows.push([mpTs,mpKind,mpNid,String(d.rootId||""),String(d.cellType||""),0,
        "","","","","none found","",  "","","",  "","","",  "{}",mpSettings,mpDefault,
        d.reporterName||"",mpEmail]);
    }
    mpSh.getRange(mpSh.getLastRow()+1,1,mpRows.length,mpRows[0].length).setValues(mpRows);
  } else if(d.type==="new_cell_no_nucleus"){
    // A genuinely new cell that MICrONS's automatic nucleus detector never produced ANY
    // detection for at all (unlike "new_identification", which is for a real MICrONS
    // nucleus that just has no cell-type prediction on file). No nucleusId exists to key
    // this to, so coord is the user's own estimated nucleus-center coordinate instead --
    // deliberately never auto-filled from a nearby real nucleus, to avoid conflating this
    // with that unrelated cell. rootId is optional (a segmentation mesh may still exist
    // here even without a detected nucleus). nucRootId is also optional and separate from
    // rootId: the raw minnie35 segmentation occasionally splits a nucleus off as its own
    // distinct segment ID rather than merging it into the cell body, so a reporter may have
    // both a cell-body root ID and a separate nucleus root ID to log. Appended as the LAST
    // column (same convention "certainty" used above it) so it doesn't shift any existing
    // columns -- if you already deployed before this field existed, add a "nucRootId"
    // header manually to any sheet that already has rows.
    var sh=ss.getSheetByName("New cells (no nucleus)")||ss.insertSheet("New cells (no nucleus)");
    if(sh.getLastRow()===0){
      sh.appendRow(["timestamp","coord","rootId","identified","path","reporterName","reporterEmail","comment","certainty","nucRootId"]);
    }
    // d.append===true means the USER EXPLICITLY CHOSE, on the client (see refreshDupeCheck()
    // in renderResult()), to add their rootId/nucRootId to an existing report rather than
    // create a new one -- an earlier version of this branch tried to guess this
    // automatically via its own 5000nm proximity search on every submission, silently, but
    // that wasn't reliable enough to trust on its own (in particular, it could not be told
    // apart from "not appended yet" from the client, so a user had no way to confirm it had
    // actually worked). Now the client already found the matching report itself (it has the
    // full list cached for exactly this) and sends back that report's own EXACT stored
    // coord string, so the match here is a plain string comparison rather than a fresh,
    // independent distance calculation that could disagree with the client's. If several
    // rows happen to share that exact coord (e.g. a legacy duplicate from before this
    // append feature existed), the one still missing an ID this submission provides is
    // preferred, so a stray old duplicate gets absorbed correctly instead of whichever row
    // happens to come first. Only fills in blanks; never overwrites a value a row already
    // has, so an earlier ID can't be clobbered by a later, possibly mistyped one.
    //
    // identified/certainty/comment are filled the same way as rootId/nucRootId above -- this is
    // what makes an "unclassified, location only" report (see openLocationOnlyReport() in the
    // HTML -- identified/certainty submitted blank on purpose) work: whoever later classifies
    // that cell submits through this same flow with append:true, a real identified name and
    // certainty, and this fills them into the SAME row rather than silently dropping the
    // classification or creating a duplicate.
    var appended=false;
    if(d.append===true&&sh.getLastRow()>=2){
      var allData=sh.getDataRange().getValues();
      var hdr=allData[0];
      var cIdx=hdr.indexOf("coord"),rIdx=hdr.indexOf("rootId");
      // Tolerate a manually-typed "nucleusId" header (the name every OTHER sheet in this file
      // uses for a MICrONS nucleus ID) in addition to the literal "nucRootId" this code
      // originally asked for -- a sheet that predates this field needed its header added by
      // hand, and "nucleusId" is the more natural name to reach for.
      var nIdx=hdr.indexOf("nucRootId");
      if(nIdx<0)nIdx=hdr.indexOf("nucleusId");
      var identIdx=hdr.indexOf("identified"),certIdx=hdr.indexOf("certainty"),commentIdx=hdr.indexOf("comment");
      var matchRow=-1;
      for(var ri=1;ri<allData.length;ri++){
        if(String(allData[ri][cIdx])!==String(d.coord))continue;
        if(matchRow<0)matchRow=ri;
        if((d.rootId&&!allData[ri][rIdx])||(d.nucRootId&&!allData[ri][nIdx])||(d.identified&&identIdx>=0&&!allData[ri][identIdx])){matchRow=ri;break;}
      }
      if(matchRow>=0&&rIdx>=0&&nIdx>=0){
        var sheetRow=matchRow+1; // allData is 0-indexed with allData[0]=headers, so data row ri sits at sheet row ri+1
        if(d.rootId&&!allData[matchRow][rIdx])sh.getRange(sheetRow,rIdx+1).setValue(d.rootId);
        if(d.nucRootId&&!allData[matchRow][nIdx])sh.getRange(sheetRow,nIdx+1).setValue(d.nucRootId);
        if(d.identified&&identIdx>=0&&!allData[matchRow][identIdx])sh.getRange(sheetRow,identIdx+1).setValue(d.identified);
        if(d.certainty&&certIdx>=0&&!allData[matchRow][certIdx])sh.getRange(sheetRow,certIdx+1).setValue(d.certainty);
        if(d.comment&&commentIdx>=0&&!allData[matchRow][commentIdx])sh.getRange(sheetRow,commentIdx+1).setValue(d.comment);
        appended=true;
      }
    }
    if(!appended){
      sh.appendRow([d.timestamp||new Date().toISOString(),d.coord||"",d.rootId||"",
                    d.identified||"",d.path||"",d.reporterName||"",d.reporterEmail||"",d.comment||"",d.certainty||"",d.nucRootId||""]);
    }
    /* AFTER BOTH PATHS, appended-to-an-existing-report as well as a new row: adding a root id to
       somebody's earlier find changes what the master row should say about it too. */
    upsertMasterFoundCell(d.coord);
  } else if(d.type==="propose_root_id"){
    // A user proposes an ADDITIONAL segmentation root ID that belongs to this cell (patchy
    // segmentation often splits one cell across several meshes). Stored pending; shown to
    // everyone and folded into the Neuroglancer view until the owner removes it.
    var sh=ss.getSheetByName("Root ID proposals")||ss.insertSheet("Root ID proposals");
    if(sh.getLastRow()===0){
      sh.appendRow(["timestamp","nucleusId","rootId","proposedByEmail","proposedByName","comment","removed","segType"]);
    }
    var phead=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
    if(phead.indexOf("segType")<0){sh.getRange(1,sh.getLastColumn()+1).setValue("segType");phead=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];}
    var pdata=sh.getDataRange().getValues();
    var pNucI=phead.indexOf("nucleusId"),pRootI=phead.indexOf("rootId");
    var dup=false;
    for(var pi=1;pi<pdata.length;pi++){
      if(String(pdata[pi][pNucI])===String(d.nucleusId||"")&&String(pdata[pi][pRootI])===String(d.rootId||"")){dup=true;break;}
    }
    if(!dup&&d.rootId){
      var prow=[d.timestamp||new Date().toISOString(),d.nucleusId||"",d.rootId||"",d.reporterEmail||"",d.reporterName||"",d.comment||"",""];
      var pSegI=phead.indexOf("segType");
      while(prow.length<phead.length)prow.push("");
      prow[pSegI]=String(d.segType||"img65");
      sh.appendRow(prow);
    }
    // Keep "Master cell list"'s community_root_ids column current the moment a proposal lands --
    // see the "Root IDs in Master cell list" comment above upsertMasterCellRootIds() for the full
    // design. No-op if the nucleus isn't in the master list (nothing to update).
    upsertMasterCellRootIds(d.nucleusId);
  } else if(d.type==="vote_root_id"){
    // One vote per verified email per (nucleusId, rootId). Re-voting overwrites the old vote.
    var sh=ss.getSheetByName("Root ID votes")||ss.insertSheet("Root ID votes");
    if(sh.getLastRow()===0){
      sh.appendRow(["timestamp","nucleusId","rootId","voterEmail","vote"]);
    }
    var vote=(Number(d.vote)>=0)?1:-1;
    var vdata=sh.getDataRange().getValues(),vhead=vdata[0];
    var vNucI=vhead.indexOf("nucleusId"),vRootI=vhead.indexOf("rootId"),vEmI=vhead.indexOf("voterEmail"),vVI=vhead.indexOf("vote");
    var found=-1;
    for(var vi=1;vi<vdata.length;vi++){
      if(String(vdata[vi][vNucI])===String(d.nucleusId||"")&&String(vdata[vi][vRootI])===String(d.rootId||"")&&String(vdata[vi][vEmI])===String(d.reporterEmail||"")){found=vi;break;}
    }
    if(found>0){
      sh.getRange(found+1,vVI+1).setValue(vote);
      sh.getRange(found+1,1).setValue(d.timestamp||new Date().toISOString());
    } else {
      sh.appendRow([d.timestamp||new Date().toISOString(),d.nucleusId||"",d.rootId||"",d.reporterEmail||"",vote]);
    }
  } else if(d.type==="remove_root_id"){
    // Owner-only: mark a proposed root ID removed so it drops out of the view for everyone.
    if(OWNER_EMAIL&&identity.email===OWNER_EMAIL){
      var sh=ss.getSheetByName("Root ID proposals");
      if(sh&&sh.getLastRow()>=2){
        var rdata=sh.getDataRange().getValues(),rhead=rdata[0];
        var rNucI=rhead.indexOf("nucleusId"),rRootI=rhead.indexOf("rootId"),rRemI=rhead.indexOf("removed");
        for(var ri=1;ri<rdata.length;ri++){
          if(String(rdata[ri][rNucI])===String(d.nucleusId||"")&&String(rdata[ri][rRootI])===String(d.rootId||"")){
            sh.getRange(ri+1,rRemI+1).setValue("yes");
          }
        }
      }
      // Same reasoning as propose_root_id above -- a removal changes the active set too.
      upsertMasterCellRootIds(d.nucleusId);
    }
  } else if(d.type==="set_handle"){
    var sh=ss.getSheetByName("Handles")||ss.insertSheet("Handles");
    if(sh.getLastRow()===0)sh.appendRow(["email","handle"]);
    var hd=sh.getDataRange().getValues(),hh=hd[0],iE=hh.indexOf("email"),iH=hh.indexOf("handle");
    var handle=String(d.handle||"").slice(0,40),found=-1;
    for(var i=1;i<hd.length;i++){if(String(hd[i][iE])===identity.email){found=i;break;}}
    if(found>0)sh.getRange(found+1,iH+1).setValue(handle); else sh.appendRow([identity.email,handle]);
  } else if(d.type==="add_favourite"){
    var sh=ss.getSheetByName("Favourites")||ss.insertSheet("Favourites");
    if(sh.getLastRow()===0)sh.appendRow(["timestamp","email","nucleusId","rootId","coord","note","removed"]);
    var fd=sh.getDataRange().getValues(),fh=fd[0],iE=fh.indexOf("email"),iN=fh.indexOf("nucleusId"),iC=fh.indexOf("coord"),iRem=fh.indexOf("removed"),dup=-1;
    for(var i=1;i<fd.length;i++){if(String(fd[i][iE])===identity.email&&(String(fd[i][iN])===String(d.nucleusId||"")||(d.coord&&String(fd[i][iC])===String(d.coord)))){dup=i;break;}}
    if(dup>0){if(iRem>=0)sh.getRange(dup+1,iRem+1).setValue("");}
    else sh.appendRow([new Date().toISOString(),identity.email,d.nucleusId||"",d.rootId||"",d.coord||"",d.note||"",""]);
  } else if(d.type==="remove_favourite"){
    var sh=ss.getSheetByName("Favourites");
    if(sh&&sh.getLastRow()>=2){var fd=sh.getDataRange().getValues(),fh=fd[0],iE=fh.indexOf("email"),iN=fh.indexOf("nucleusId"),iC=fh.indexOf("coord"),iRem=fh.indexOf("removed");
      for(var i=1;i<fd.length;i++){if(String(fd[i][iE])===identity.email&&(String(fd[i][iN])===String(d.nucleusId||"")||(d.coord&&String(fd[i][iC])===String(d.coord)))){if(iRem>=0)sh.getRange(i+1,iRem+1).setValue("yes");}}}
  } else if(d.type==="vote_identity"){
    // You cannot up/down-vote an identification you yourself proposed for this nucleus. Checked
    // by verified email against the identity-report sheets (Discrepancies / New identifications /
    // Confirmations); if the voter is among the proposers of this exact identity, the vote is
    // silently dropped rather than recorded.
    if(userReportedIdentity(String(d.nucleusId||""),String(d.identity||""),identity.email)){
      // ok:true here too -- see the shared return at the end of doPost. A silently-dropped
      // self-vote is a successful no-op, not a failure, and must not read as one.
      return ContentService.createTextOutput(JSON.stringify({ok:true,status:"ok",skipped:"own_identity"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var sh=ss.getSheetByName("Identity votes")||ss.insertSheet("Identity votes");
    if(sh.getLastRow()===0)sh.appendRow(["timestamp","nucleusId","identity","voterEmail","vote"]);
    var vote=(Number(d.vote)>=0)?1:-1;
    var vd=sh.getDataRange().getValues(),vh=vd[0];
    var iNuc=vh.indexOf("nucleusId"),iId=vh.indexOf("identity"),iEm=vh.indexOf("voterEmail"),iV=vh.indexOf("vote");
    var key=String(d.identity||"").toLowerCase(),found=-1;
    for(var i=1;i<vd.length;i++){if(String(vd[i][iNuc])===String(d.nucleusId||"")&&String(vd[i][iId]).toLowerCase()===key&&String(vd[i][iEm])===identity.email){found=i;break;}}
    if(found>0){sh.getRange(found+1,iV+1).setValue(vote);sh.getRange(found+1,1).setValue(d.timestamp||new Date().toISOString());}
    else sh.appendRow([d.timestamp||new Date().toISOString(),d.nucleusId||"",d.identity||"",identity.email,vote]);
  } else if(d.type==="discrepancy"){
    /* NAMED, since 2026-09-02, rather than being the chain's bare `else`. It was written when
       µJump was the only tool and anything reaching the end of the chain really was a discrepancy;
       it has been the catch-all for thirty-one types across nine tools ever since, so every POST
       this deployment did not recognise was filed here with an empty nucleusId and answered with
       a cheerful ok:true. Søren hit it on 2026-09-02: χJump's "Add fragments" against a Code.gs
       older than the page wrote a junk row into THIS sheet and reported "the backend accepted the
       request but returned no cell key". Every tool in the family posts this exact string, so
       naming it takes nothing away. */
    var sh=ss.getSheetByName("Discrepancies")||ss.insertSheet("Discrepancies");
    if(sh.getLastRow()===0){
      sh.appendRow(["timestamp","nucleusId","rootId","coord","registered","identified","path","reporterName","reporterEmail","comment","certainty"]);
    }
    sh.appendRow([d.timestamp||new Date().toISOString(),d.nucleusId||"",d.rootId||"",
                  d.coord||"",d.registered||"",d.identified||"",d.path||"",d.reporterName||"",d.reporterEmail||"",d.comment||"",d.certainty||""]);
    upsertMasterCellRow(d.nucleusId,d); // keep "Master cell list" current -- see comment above its definition; d carries certainty/comment/reporterName/reporterEmail/rootId/coord for classification-history logging
  } else {
    /* THE DEFAULT THIS CHAIN NEVER HAD. A type no branch claimed is a page talking to a
       deployment that does not understand it -- almost always Code.gs pasted later than the tool
       that posts, since the .gs files are pasted one at a time by hand and nothing has ever
       noticed when one is behind.

       Refused, with the type in the message, and NOTHING WRITTEN. Returned here rather than
       falling through, so neither invalidateAggregateCache() nor mlRecordReport() runs: no row
       was written, so no tally can have changed and no cell has anything new to say. A silent
       ok:true for a write that did not happen is the single worst answer a shared record can
       give, and for this chain it was the default answer. */
    return gJson({ok:false, error:"unknown report type: " + String(d.type||"(none)")
      + " — this deployment has no handler for it, which almost always means Code.gs is older "
      + "than the page that posted. Re-paste Code.gs (and the tool's own .gs file) into the Apps "
      + "Script project and Deploy → New version. Nothing was written."});
  }
  // 2026-08-09 (performance audit) -- every branch above that reaches this shared return either
  // wrote a row/vote/restore that could change someone's aggregateAll() tally, or was a genuine
  // no-op that already returned early above (unauthenticated; vote_identity's own-identity skip)
  // and never reaches here. Invalidating unconditionally at this single point is simpler and
  // safer than threading a call into every individual branch, and correctly means the NEXT
  // leaderboard/myStats read recomputes fresh rather than waiting out AGGREGATE_CACHE_TTL_SEC.
  invalidateAggregateCache();
  // d.nucleusId is present on every branch that writes a per-nucleus report (new_identification/
  // confirmation/discrepancy/restore_classification/vote_identity/organelle_location/etc.);
  // harmless no-op (see invalidateNucleusViewCache()) for the few types that don't carry one
  // (set_handle, add_favourite/remove_favourite) since there's nothing cached under "nucView:"
  // to remove for those anyway.
  invalidateNucleusViewCache(d.nucleusId);
  // Harmless no-op for every type except connectivity_sample -- see invalidateConnSamplesCache()'s
  // own comment for why this is a blanket invalidation rather than a per-row one.
  if(d.type==="connectivity_sample")invalidateConnSamplesCache();
  // Same blanket-invalidation reasoning, for cell_contacts_batch -- see invalidateMeshContactStatsCache().
  if(d.type==="cell_contacts_batch")invalidateMeshContactStatsCache();
  /* `ok:true` AS WELL AS `status:"ok"` (2026-08-28). This return has always said only
     status:"ok". µJump never noticed: it POSTs mode:"no-cors" and cannot read the response at
     all, so it reports success unconditionally. But βJump, ηJump and λJump DO read it, and all
     three judge success as `d && d.ok` -- so every identification they filed came back looking
     like a failure. βJump said "Could not record that." underneath a submission that had in fact
     been written, upserted into the Master cell list and counted.

     Søren, 2026-08-28, reporting a colleague's session: an identification refused to record, and
     after a refresh the same nucleus had vanished from the "unidentified" filter -- because it
     was no longer unidentified. The write had worked every time. The only βJump actions that
     appeared to succeed were the ones with their own handlers (bjumpPositionFix, ωJump's writes),
     which return gJson({ok:true,...}) -- a second return shape nobody reconciled with this one.

     Adding the field rather than replacing it: anything reading `status` keeps working. */
  /* THE SHARED "Master cell list" WRITE, for the five tools that use it (MasterList.gs,
     2026-09-02). Here rather than in each branch because every chain type δJump, πJump and
     ηJump can send reaches this line, and because the branches that return EARLY above are
     exactly the ones that recorded nothing -- a dropped self-vote, a failed validation -- which
     is when no master row should be written either. A no-op for every other dataset, so µJump,
     βJump and λJump are unaffected. It never throws; see its own comment. */
  mlRecordReport(ss, d);
  return ContentService.createTextOutput(JSON.stringify({ok:true,status:"ok"}))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e){
  setDsFromRequest(e);   // Datasets.gs -- must be the FIRST statement
  /* Config problems must come back as JSON, never as a thrown exception. An uncaught throw makes
     Apps Script render an HTML error page, and it puts no Access-Control-Allow-Origin on those --
     so the browser rejects the response and the tool reports a bare "Failed to fetch" with the
     real reason nowhere to be seen. Cost a debugging round trip on bJump, 2026-08-18. */
  var _dsErr = dsConfigError();
  if (_dsErr) return gJson({ok:false, error:_dsErr});
  // Deployment self-check -- answers "is the version I just pasted actually live?". See dsWhoAmI().
  if (e && e.parameter && e.parameter.whoami) return dsWhoAmI();
  /* A bare /exec with NO parameters at all is a human in a browser, never a page: every caller in
     this file passes at least one. Until 2026-08-27 it fell 800 lines through to the report dump
     and answered {"reports":[],"mergedGroups":[],...} -- four empty arrays, no hint that the
     query string had simply been lost off the end of the URL, and indistinguishable at a glance
     from a broken deployment. Answer with whoami instead, so opening the endpoint says what it
     is. Guarded on ZERO parameters so no existing caller can reach it. */
  if (e && e.parameter && Object.keys(e.parameter).length === 0) return dsWhoAmI();
  if (e && e.parameter && e.parameter.profileTotals) return profileTotalsEndpoint(e);
  // βJump: community consensus on corrected nucleus positions -- see BJumpPosition.gs
  if (e && e.parameter && e.parameter.bjumpFixes) return bjumpFixConsensus(e);
  // Filter-and-show's "current community identity" dimension (βJump and ηJump both use this same
  // branch, dataset-scoped via ds= -- see BJumpPosition.gs's bjumpIdentities() and Datasets.gs's
  // SS()). Bulk read of "Master cell list", no credential required.
  if (e && e.parameter && e.parameter.bjumpIdentities) return bjumpIdentities(e);
  /* ωJump: everything the discovery page needs for one dataset -- which boxes have been looked
     at (including the ones reported empty, which is what the sampler ranks against), every
     nucleus found, and the current free-text name consensus. WJumpDiscovery.gs. */
  if (e && e.parameter && e.parameter.wjumpState) return wjumpState(e);
  if (e && e.parameter && e.parameter.xjumpState) return xjumpState(e);
  /* Separate from xjumpState on purpose: cells are read on every page load, the nucleus map only
     when somebody opens the explore panel -- and in a volume expected to hold 10^4-10^5 nuclei
     that one has to be able to become a tiled or bounded request later without disturbing the
     other. */
  if (e && e.parameter && e.parameter.xjumpExplore) return xjumpExploreState(e);
  /* One cell's whole timeline. Separate from xjumpState for the reason its own comment
     gives: the history of five thousand cells has no business riding on every page load,
     and a history is only ever wanted for the one cell somebody is looking at. */
  if (e && e.parameter && e.parameter.xjumpCellHistory) return xjumpCellHistory(e);
  /* Classification history for one main nucleus -- chronological (oldest first, matching how a
     history panel reads top-to-bottom), sourced entirely from "Classification history" (see its
     own definition comment above upsertMasterCellRow for the full design). reporterEmail is
     never returned, same convention as every other read endpoint in this file -- the raw name is
     mapped through the public handle map instead.
     viewerCredential (2026-08-09, undo/restore feature) is OPTIONAL and, unlike every submission's
     d.credential, verified here purely to decide what to SHOW, not to authorize a write -- the
     actual restore_classification doPost branch re-verifies the acting user's own credential
     independently and is the real gate. Each entry gets isOwn (viewer wrote this exact entry) and
     canRestore (isOwn OR viewer is OWNER_EMAIL) so the frontend knows whether to offer a
     "Correct this" / "Restore this version" button on that row -- without ever exposing the raw
     reporterEmail itself, same privacy convention as reporterName-via-handle-map above. Absent or
     invalid viewerCredential -> every row's isOwn/canRestore is simply false (same as a
     never-signed-in visitor, who has nothing to restore anyway). */
  if(e.parameter.classificationHistory){
    var nid=String(e.parameter.classificationHistory);
    var chSs=SS();
    var chSh=chSs.getSheetByName(CLASSIFICATION_HISTORY_SHEET);
    var chOut=[];
    var chViewer=e.parameter.viewerCredential?verifyGoogleToken(e.parameter.viewerCredential):null;
    var chViewerEmail=chViewer?chViewer.email:"";
    var chViewerIsAdmin=Boolean(OWNER_EMAIL)&&chViewerEmail===OWNER_EMAIL;
    if(chSh&&chSh.getLastRow()>=2){
      var chHNDL=handleMap();
      var chData=chSh.getDataRange().getValues(),chH=chData[0];
      var iNuc=chH.indexOf("nucleusId"),iTs=chH.indexOf("timestamp"),iPrev=chH.indexOf("previousIdentity"),
          iNew=chH.indexOf("newIdentity"),iSrc=chH.indexOf("sourceType"),iCert=chH.indexOf("certainty"),
          iCom=chH.indexOf("comment"),iEm=chH.indexOf("reporterEmail"),iNm=chH.indexOf("reporterName");
      for(var chr=1;chr<chData.length;chr++){
        if(String(chData[chr][iNuc])!==nid)continue;
        var chRowEmail=iEm>=0?String(chData[chr][iEm]||""):"";
        var chIsOwn=Boolean(chViewerEmail)&&chRowEmail===chViewerEmail;
        chOut.push({timestamp:iTs>=0?chData[chr][iTs]:"",previousIdentity:iPrev>=0?(chData[chr][iPrev]||""):"",
          newIdentity:iNew>=0?(chData[chr][iNew]||""):"",sourceType:iSrc>=0?(chData[chr][iSrc]||"community"):"community",
          certainty:iCert>=0?(chData[chr][iCert]||""):"",comment:iCom>=0?(chData[chr][iCom]||""):"",
          reporterName:displayFor(chHNDL,iEm>=0?chData[chr][iEm]:"",iNm>=0?chData[chr][iNm]:""),
          isOwn:chIsOwn,canRestore:chIsOwn||chViewerIsAdmin});
      }
      chOut.sort(function(a,b){return String(a.timestamp).localeCompare(String(b.timestamp));});
    }
    return gJson({history:chOut});
  }
  /* Full annotation audit trail for one main nucleus -- unlike ?classificationHistory= above
     (which only tracks NAME CHANGES, sourced from the derived "Classification history" sheet),
     this reads every raw report-log sheet directly so nothing gets lost just because it didn't
     change the current identity: a Confirmation's comment, a Merged splits sub-report's
     justification note, an Organelle locations report, or a Not-a-nucleus flag. Søren's own
     example: "a user reports a possible dual nucleus and writes justification notes" -- that's a
     merged_split row, which never touches Classification history at all. Frontend merges this
     feed with ?classificationHistory= into one chronological "Cell history" panel (see
     mergeCellHistory() in ujump.html) rather than showing two separate panels.
     status: "recorded" for plain reports (nothing to resolve); merged_split computes
     "resolved"/"unresolved (N of M sub-cells identified)" by comparing how many distinct
     subIndex values within a groupId have a non-blank "identified" against that group's
     declared subCount; not_a_nucleus is always "unresolved -- flagged, awaiting review" since no
     acknowledgment mechanism exists yet for that report type (a future owner-only "mark
     resolved" action, mirroring remove_root_id's OWNER_EMAIL gating, is the natural next step
     if this becomes a real workflow bottleneck -- not built yet, scope kept to display-only).
     groupId links related sub-rows from one submission (merged_split, organelle_location) so the
     frontend can visually cluster them instead of listing each sub-nucleus/organelle as an
     unrelated entry. */
  if(e.parameter.annotationHistory){
    var ahNid=String(e.parameter.annotationHistory);
    var ahSs=SS();
    var ahHNDL=handleMap();
    var ahOut=[];
    var ahSheetData=function(name){
      var sh=ahSs.getSheetByName(name);
      if(!sh||sh.getLastRow()<2)return null;
      var data=sh.getDataRange().getValues();
      return {header:data[0],rows:data.slice(1)};
    };
    var ahIdx=function(header,name){return header.indexOf(name);};

    // New identifications / Confirmations / Discrepancies -- reclassification-style reports.
    // Nothing to resolve here (each report simply stands as recorded), unlike merged_split/
    // not_a_nucleus below.
    [{sheet:"New identifications",kind:"new_identification"},
     {sheet:"Confirmations",kind:"confirmation"},
     {sheet:"Discrepancies",kind:"discrepancy"}].forEach(function(cfg){
      var sd=ahSheetData(cfg.sheet);
      if(!sd)return;
      var h=sd.header;
      var iNuc=ahIdx(h,"nucleusId"),iTs=ahIdx(h,"timestamp"),iIdent=ahIdx(h,"identified"),
          iCert=ahIdx(h,"certainty"),iCom=ahIdx(h,"comment"),iEm=ahIdx(h,"reporterEmail"),iNm=ahIdx(h,"reporterName"),
          iReg=ahIdx(h,"registered");
      sd.rows.forEach(function(row){
        if(String(row[iNuc])!==ahNid)return;
        ahOut.push({timestamp:iTs>=0?row[iTs]:"",type:cfg.kind,
          note:iCom>=0?(row[iCom]||""):"",identified:iIdent>=0?(row[iIdent]||""):"",
          registered:iReg>=0?(row[iReg]||""):"",certainty:iCert>=0?(row[iCert]||""):"",
          reporterName:displayFor(ahHNDL,iEm>=0?row[iEm]:"",iNm>=0?row[iNm]:""),
          status:"recorded",groupId:""});
      });
    });

    // Merged splits -- grouped by groupId; resolved once every declared sub-position (up to
    // subCount) has at least one row with a non-blank "identified".
    var msd=ahSheetData("Merged splits");
    if(msd){
      var mh=msd.header;
      var mNuc=ahIdx(mh,"nucleusId"),mTs=ahIdx(mh,"timestamp"),mGroup=ahIdx(mh,"groupId"),mSub=ahIdx(mh,"subIndex"),
          mSubCount=ahIdx(mh,"subCount"),mIdent=ahIdx(mh,"identified"),mCert=ahIdx(mh,"certainty"),mCom=ahIdx(mh,"comment"),
          mEm=ahIdx(mh,"reporterEmail"),mNm=ahIdx(mh,"reporterName");
      var groupIdentified={},groupSubCount={};
      msd.rows.forEach(function(row){
        if(String(row[mNuc])!==ahNid)return;
        var g=mGroup>=0?String(row[mGroup]):"";
        if(!g)return;
        if(mSubCount>=0&&row[mSubCount])groupSubCount[g]=Number(row[mSubCount])||groupSubCount[g]||0;
        if(mIdent>=0&&row[mIdent]){
          groupIdentified[g]=groupIdentified[g]||{};
          groupIdentified[g][mSub>=0?String(row[mSub]):""]=1;
        }
      });
      msd.rows.forEach(function(row){
        if(String(row[mNuc])!==ahNid)return;
        var g=mGroup>=0?String(row[mGroup]):"";
        var declared=groupSubCount[g]||0;
        var identifiedN=g&&groupIdentified[g]?Object.keys(groupIdentified[g]).length:0;
        var status=(declared&&identifiedN>=declared)?"resolved":
          ("unresolved ("+identifiedN+" of "+(declared||"?")+" sub-cells identified)");
        ahOut.push({timestamp:mTs>=0?row[mTs]:"",type:"merged_split",
          note:mCom>=0?(row[mCom]||""):"",identified:mIdent>=0?(row[mIdent]||""):"",
          subIndex:mSub>=0?row[mSub]:"",subCount:mSubCount>=0?row[mSubCount]:"",
          certainty:mCert>=0?(row[mCert]||""):"",
          reporterName:displayFor(ahHNDL,mEm>=0?row[mEm]:"",mNm>=0?row[mNm]:""),
          status:status,groupId:g});
      });
    }

    // Organelle locations -- grouped by groupId same as merged splits above, but a reported
    // organelle just stands as reported (no "resolution" concept), so status is always "recorded".
    var osd=ahSheetData("Organelle locations");
    if(osd){
      var oh=osd.header;
      var oNuc=ahIdx(oh,"nucleusId"),oTs=ahIdx(oh,"timestamp"),oGroup=ahIdx(oh,"groupId"),oKind=ahIdx(oh,"kind"),
          oCom=ahIdx(oh,"comment"),oEm=ahIdx(oh,"reporterEmail"),oNm=ahIdx(oh,"reporterName");
      osd.rows.forEach(function(row){
        if(String(row[oNuc])!==ahNid)return;
        ahOut.push({timestamp:oTs>=0?row[oTs]:"",type:"organelle_location",
          note:oCom>=0?(row[oCom]||""):"",identified:oKind>=0?(row[oKind]||""):"",
          reporterName:displayFor(ahHNDL,oEm>=0?row[oEm]:"",oNm>=0?row[oNm]:""),
          status:"recorded",groupId:oGroup>=0?String(row[oGroup]):""});
      });
    }

    // Not a nucleus -- always unresolved (see comment above this block for why).
    var nnsd=ahSheetData("Not a nucleus");
    if(nnsd){
      var nh=nnsd.header;
      var nNuc=ahIdx(nh,"nucleusId"),nTs=ahIdx(nh,"timestamp"),nCom=ahIdx(nh,"comment"),
          nEm=ahIdx(nh,"reporterEmail"),nNm=ahIdx(nh,"reporterName");
      nnsd.rows.forEach(function(row){
        if(String(row[nNuc])!==ahNid)return;
        ahOut.push({timestamp:nTs>=0?row[nTs]:"",type:"not_a_nucleus",
          note:nCom>=0?(row[nCom]||""):"",
          reporterName:displayFor(ahHNDL,nEm>=0?row[nEm]:"",nNm>=0?row[nNm]:""),
          status:"unresolved -- flagged, awaiting review",groupId:""});
      });
    }

    ahOut.sort(function(a,b){return String(a.timestamp).localeCompare(String(b.timestamp));});
    return gJson({annotations:ahOut});
  }
  /* PUBLIC AND ACROSS EVERY TOOL, added 2026-09-09 for the home page. The board below it is
     per-dataset (every gamify read appends &ds=), and ?profileTotals= is cross-tool but filtered
     to the caller's own email -- so a "who has contributed most, anywhere" board had no endpoint
     at all until now. Reads the same materialised "Profile totals" sheet ?profileTotals= reads,
     so the two can never disagree, and costs one sheet read rather than eight aggregates. */
  if(e.parameter.combinedLeaderboard){
    return combinedLeaderboardEndpoint(e);
  }
  if(e.parameter.leaderboard){
    var agg=aggregateAllCached(),arr=[];
    for(var em in agg)arr.push({email:em,points:agg[em].points,reports:agg[em].reports,name:agg[em].name});
    arr.sort(function(a,b){return b.points-a.points||b.reports-a.reports;});
    var top=arr.slice(0,10).map(function(u){return {handle:getHandle(u.email,u.name),points:u.points,reports:u.reports};});
    return gJson({leaderboard:top});
  }
  if(e.parameter.myStats){
    var id=verifyGoogleToken(e.parameter.myStats);
    if(!id)return gJson({ok:false,error:"unauthenticated"});
    var agg=aggregateAllCached(),arr=[];
    for(var em in agg)arr.push({email:em,points:agg[em].points,reports:agg[em].reports});
    arr.sort(function(a,b){return b.points-a.points||b.reports-a.reports;});
    var rank=0;for(var i=0;i<arr.length;i++){if(arr[i].email===id.email){rank=i+1;break;}}
    var me=agg[id.email]||{reports:0,points:0,dates:{},cellTypes:{},organelles:0,newCells:0,rootProps:0,computedVolumes:0,notNucleusFlags:0,votesGiven:0,meshContactsComputed:0,name:id.name};
    var st=streakFrom(me.dates),lvl=levelFor(me.points);
    var cts=[];for(var ct in me.cellTypes)cts.push([ct,me.cellTypes[ct]]);cts.sort(function(a,b){return b[1]-a[1];});
    return gJson({email:id.email,name:id.name,handle:getHandle(id.email,id.name||me.name),
      reports:me.reports,points:me.points,level:lvl.level,nextLevel:lvl.next,nextLevelAt:lvl.nextAt,
      daysActive:Object.keys(me.dates).length,streak:st.current,longestStreak:st.longest,
      organelles:me.organelles,newCells:me.newCells,rootProposals:me.rootProps,
      // 2026-08-10 (Søren, "total reports" should only be cell-identity reports/confirmations) --
      // these three are the "separate fields" for the activity types "reports" now excludes:
      // computed-volume clicks, root-ID proposals (rootProposals above already existed), and
      // votes cast (as opposed to upvotesReceived below, which is votes cast ON this person's
      // own reports by OTHERS). notNucleusFlags is a bonus: "Not a nucleus" flags were also
      // being folded into the old "reports" total despite carrying no cell identity at all.
      computedVolumes:me.computedVolumes,votesGiven:me.votesGiven,notNucleusFlags:me.notNucleusFlags,
      meshContactsComputed:me.meshContactsComputed,
      upvotesReceived:upvotesForProposer(id.email),favourites:favouritesFor(id.email).length,downvoted:myDownvotedList(id.email).length,
      rank:rank,totalUsers:arr.length,cellTypes:cts.slice(0,6)});
  }
  if(e.parameter.favourites){
    var id=verifyGoogleToken(e.parameter.favourites);
    if(!id)return gJson({ok:false,error:"unauthenticated"});
    return gJson({favourites:favouritesFor(id.email)});
  }
  if(e.parameter.allOrganelles){
    // "identified" added (2026-08) so the µJump dashboard can bucket LIVE organelle reports by
    // cell type without needing a separate nucleus-ID-to-type lookup table -- every
    // organelle_location report already carries whatever cell-type string was on screen at
    // report time (see wireOrganelleForm()'s identified:name||"" in ujump.html), the same
    // convention save_computed_volume already uses for its cellType field. "coord" (already
    // returned) doubles as the reporting nucleus's own position, so nucleus-to-centriole
    // distance is computable client-side from coord+pointA alone, no extra data needed either.
    var ss=SS(),sh=ss.getSheetByName("Organelle locations"),out=[];
    if(sh&&sh.getLastRow()>=2){var d=sh.getDataRange().getValues(),h=d[0];
      var iN=h.indexOf("nucleusId"),iK=h.indexOf("kind"),iA=h.indexOf("pointA"),iB=h.indexOf("pointB"),iC=h.indexOf("coord"),iId=h.indexOf("identified");
      for(var i=1;i<d.length;i++){
        out.push({nucleusId:String(iN>=0?(d[i][iN]||""):""),kind:String(iK>=0?(d[i][iK]||""):""),
                  pointA:String(iA>=0?(d[i][iA]||""):""),pointB:String(iB>=0?(d[i][iB]||""):""),coord:String(iC>=0?(d[i][iC]||""):""),
                  identified:String(iId>=0?(d[i][iId]||""):"")});
      }
    }
    return gJson({organelles:out});
  }
  if(e.parameter.computedVolumes==="1"){
    // Bulk read for the µJump dashboard's "root-ID (mesh) volume vs nucleus volume per cell
    // type" graph -- every row ever logged by the "save_computed_volume" doPost branch above.
    // Public read (no token), reporterEmail withheld, same privacy convention as every other
    // bulk mode in this file. Intentionally returns every row rather than a pre-aggregated
    // summary -- there's no way to know in advance how the dashboard will want to bucket or
    // re-sample this as it grows, and the row count here will stay small for a long time
    // (one row per manual "Compute volume" click, not a bulk operation).
    var ss=SS();
    var sh=ss.getSheetByName("Computed volumes");
    var out=[];
    if(sh&&sh.getLastRow()>=2){
      var data=sh.getDataRange().getValues(),h=data[0];
      var iR=h.indexOf("rootId"),iN=h.indexOf("nucleusId"),iCT=h.indexOf("cellType"),
          iV=h.indexOf("volumeUm3"),iTs=h.indexOf("timestamp"),iNV=h.indexOf("nucVolumeUm3"),
          iFC=h.indexOf("fragmentCount");
      // fragmentCount (2026-08-05): was being stored (see the appendRow header above) but never
      // read back here, so every dashboard-loaded volume looked like a single-fragment
      // computation to the client -- µJump's new "only offer Recalculate once more root IDs have
      // been proposed than the saved computation used" check needs this to actually work for
      // volumes loaded from this shared sheet, not just ones computed fresh in the same session.
      for(var i=1;i<data.length;i++){
        out.push({rootId:String(data[i][iR]||""),nucleusId:String(data[i][iN]||""),
          cellType:String(data[i][iCT]||""),volumeUm3:Number(data[i][iV])||0,
          nucVolumeUm3:(iNV>=0&&data[i][iNV])?Number(data[i][iNV])||0:0,
          fragmentCount:(iFC>=0&&data[i][iFC])?Number(data[i][iFC])||1:1,
          timestamp:String(data[i][iTs]||"")});
      }
    }
    return gJson({computedVolumes:out});
  }
  if(e.parameter.connectivitySamples==="1"){
    /* Bulk read for the µJump dashboard's "Input vs output synapses per cell type" dot plot (see
       renderSynapseIO() in ujump.html) -- every row ever logged by the "connectivity_sample"
       doPost branch above. Same pattern as ?computedVolumes=1 just above: return every raw row
       rather than a server-side pre-aggregate, since the client needs individual per-cell values
       (not a mean) to plot a real distribution, same reasoning groupedDotChart()/dotMedianChart()
       already need real values elsewhere on this dashboard. Public read (no token), reporterEmail
       withheld, same privacy convention as every other bulk mode in this file. CacheService-backed
       (CONN_SAMPLES_CACHE_KEY, see its own comment) since this sheet is written to constantly (one
       row per connectivity query, by design) and read on every dashboard load. */
    var connCache;
    try{connCache=dsCache();}catch(_ccc){connCache=null;}
    if(connCache){
      try{
        var connHit=connCache.get(CONN_SAMPLES_CACHE_KEY);
        if(connHit)return ContentService.createTextOutput(connHit).setMimeType(ContentService.MimeType.JSON);
      }catch(_ccg){/* corrupt/unparseable entry -- fall through to a live read */}
    }
    var conSs=SS();
    var conSh=conSs.getSheetByName("Connectivity samples");
    var conOut=[];
    if(conSh&&conSh.getLastRow()>=2){
      var conData=conSh.getDataRange().getValues(),conH=conData[0];
      var iCN=conH.indexOf("nucleusId"),iCR=conH.indexOf("rootId"),iCCT=conH.indexOf("cellType"),
          iCL=conH.indexOf("layer"),iCIn=conH.indexOf("inputCount"),iCOut=conH.indexOf("outputCount"),
          iCTs=conH.indexOf("timestamp"),iCBT=conH.indexOf("byType");
      for(var ci=1;ci<conData.length;ci++){
        conOut.push({nucleusId:String(conData[ci][iCN]||""),rootId:String(conData[ci][iCR]||""),
          cellType:String(conData[ci][iCCT]||""),layer:String(iCL>=0?(conData[ci][iCL]||""):""),
          inputCount:Number(conData[ci][iCIn])||0,outputCount:Number(conData[ci][iCOut])||0,
          timestamp:String(conData[ci][iCTs]||""),
          // byType: raw JSON string, {partnerCellType:{in:N,out:N}} -- left unparsed here (same
          // "return the raw row" philosophy as everything else in this bulk read) since only a
          // future live version of the "3 cell types with the most synaptic connections" chart
          // would consume it; unused rows/older samples before this column existed just get "".
          byType:String(iCBT>=0?(conData[ci][iCBT]||""):"")});
      }
    }
    var connJson=JSON.stringify({connectivitySamples:conOut});
    if(connCache){
      try{connCache.put(CONN_SAMPLES_CACHE_KEY,connJson,CONN_SAMPLES_CACHE_TTL_SEC);}catch(_ccp){}
    }
    return ContentService.createTextOutput(connJson).setMimeType(ContentService.MimeType.JSON);
  }
  if(e.parameter.cellContacts){
    /* Scoped (not bulk) read for ONE nucleus's known "Mesh contacts" rows -- see the
       "cell_contacts_batch" doPost branch above for how these are written. Public, no token
       needed (same convention as ?computedVolumes=1/?connectivitySamples=1), called by
       loadCellContactsPanel() in ujump.html on every panel render so a cell someone else already
       checked shows results immediately. Each stored row is an UNORDERED pair (nucleusIdA/B, the
       lexicographically smaller one always stored as A -- see the doPost branch's own comment),
       so this scans for the queried nucleusId on EITHER side and normalizes the response to
       always describe "the OTHER cell" from the caller's point of view, regardless of which side
       of the stored pair it happened to land on. contactPointNucleusId is passed through as-is
       (it already names an absolute nucleus, not an A/B role) so the client can tell whether the
       saved contact coordinate sits on the cell being viewed or on its neighbour. */
    var ccNid=String(e.parameter.cellContacts);
    var ccGss=SS();
    var ccGsh=ccGss.getSheetByName("Mesh contacts");
    var ccOut=[];
    if(ccGsh&&ccGsh.getLastRow()>=2){
      var ccGdata=ccGsh.getDataRange().getValues(),ccGh=ccGdata[0];
      var gA=ccGh.indexOf("nucleusIdA"),gRA=ccGh.indexOf("rootIdA"),gTA=ccGh.indexOf("cellTypeA"),
          gB=ccGh.indexOf("nucleusIdB"),gRB=ccGh.indexOf("rootIdB"),gTB=ccGh.indexOf("cellTypeB"),
          gDist=ccGh.indexOf("minDistanceNm"),gPt=ccGh.indexOf("contactPointNucleusId"),
          gVX=ccGh.indexOf("contactVoxelX"),gVY=ccGh.indexOf("contactVoxelY"),gVZ=ccGh.indexOf("contactVoxelZ");
      for(var gr=1;gr<ccGdata.length;gr++){
        var rowA=String(ccGdata[gr][gA]),rowB=String(ccGdata[gr][gB]);
        var isA=rowA===ccNid,isB=rowB===ccNid;
        if(!isA&&!isB)continue;
        var otherNid=isA?rowB:rowA,otherRoot=isA?ccGdata[gr][gRB]:ccGdata[gr][gRA],otherType=isA?ccGdata[gr][gTB]:ccGdata[gr][gTA];
        ccOut.push({contactNucleusId:otherNid,contactRootId:String(otherRoot||""),contactCellType:String(otherType||""),
          minDistanceNm:Number(ccGdata[gr][gDist])||0,
          contactPointNucleusId:gPt>=0?String(ccGdata[gr][gPt]||""):"",
          contactVoxelX:(gVX>=0&&ccGdata[gr][gVX]!=="")?ccGdata[gr][gVX]:"",
          contactVoxelY:(gVY>=0&&ccGdata[gr][gVY]!=="")?ccGdata[gr][gVY]:"",
          contactVoxelZ:(gVZ>=0&&ccGdata[gr][gVZ]!=="")?ccGdata[gr][gVZ]:""});
      }
      ccOut.sort(function(a,b){return a.minDistanceNm-b.minDistanceNm;});
    }
    return gJson({contacts:ccOut});
  }
  if(e.parameter.meshContactTypeStats==="1"){
    /* Bulk read for the µJump dashboard's "touch points between two cell types" chart (2026-08-14,
       Soren: "save the number of contact points between the cell types, so that we can make a
       live-updating dot-plot graph showing the average number of contact points between two cell
       types. This data should only be used for the graph if the default settings are used, so that
       they are comparable"). REVISED 2026-08-16 (Soren: "I don't want the dot size scale, I want
       the dot plot" -- i.e. the same jittered-points-over-a-box style as dotMedianChart()/
       groupedDotChart() elsewhere on this dashboard, e.g. the nucleus-volume-share chart) -- that
       style needs the raw per-pair touchPointCount VALUES, not a pre-computed average, so this now
       returns every value per cell-type pair (same "return raw rows, let the client plot a real
       distribution" pattern as ?connectivitySamples=1 above) instead of pre-aggregating server-side.
       Rows are still grouped by UNORDERED cell-type pair (cellTypeA/cellTypeB sorted alphabetically
       so "Astrocyte+Pericyte" and "Pericyte+Astrocyte" merge into one bucket) and ONLY rows with
       usedDefaultSettings==="yes" are included -- exactly the comparability filter Soren asked for;
       a user who widened/narrowed the cluster spacing for their own exploration still gets their
       individual result shown in the Cell contacts panel via ?cellContacts=, it's just excluded
       from this shared chart. Public read (no token), same convention as every other bulk endpoint
       here. CacheService-backed, see MESH_CONTACT_STATS_CACHE_KEY's own comment. */
    var mcsCache;
    try{mcsCache=dsCache();}catch(_mcc){mcsCache=null;}
    if(mcsCache){
      try{
        var mcsHit=mcsCache.get(MESH_CONTACT_STATS_CACHE_KEY);
        if(mcsHit)return ContentService.createTextOutput(mcsHit).setMimeType(ContentService.MimeType.JSON);
      }catch(_mcg){/* corrupt/unparseable entry -- fall through to a live read */}
    }
    var mcsSs=SS();
    var mcsSh=mcsSs.getSheetByName("Mesh contacts");
    var mcsPairs=[];
    if(mcsSh&&mcsSh.getLastRow()>=2){
      var mcsData=mcsSh.getDataRange().getValues(),mcsH=mcsData[0];
      var mA=mcsH.indexOf("cellTypeA"),mB=mcsH.indexOf("cellTypeB"),
          mCnt=mcsH.indexOf("touchPointCount"),mDef=mcsH.indexOf("usedDefaultSettings");
      var mcsBuckets={}; // "typeLo|typeHi" -> {typeA,typeB,values:[...]}
      for(var mr=1;mr<mcsData.length;mr++){
        // mDef<0 (older deploy, header not migrated yet) or not "yes" -- excluded, same as any
        // explicitly non-default row: no way to know an un-migrated row used default settings.
        if(mDef<0||String(mcsData[mr][mDef])!=="yes")continue;
        var tA=String(mcsData[mr][mA]||"").trim(),tB=String(mcsData[mr][mB]||"").trim();
        if(!tA||!tB)continue;
        var tLo=tA<tB?tA:tB,tHi=tA<tB?tB:tA;
        var mKey=tLo+"|"+tHi;
        if(!mcsBuckets[mKey])mcsBuckets[mKey]={typeA:tLo,typeB:tHi,values:[]};
        mcsBuckets[mKey].values.push(mCnt>=0?(Number(mcsData[mr][mCnt])||0):0);
      }
      for(var mk in mcsBuckets){
        var mb=mcsBuckets[mk];
        mcsPairs.push({typeA:mb.typeA,typeB:mb.typeB,n:mb.values.length,values:mb.values});
      }
      mcsPairs.sort(function(a,b){return b.n-a.n;});
    }
    var mcsJson=JSON.stringify({pairs:mcsPairs});
    if(mcsCache){
      try{mcsCache.put(MESH_CONTACT_STATS_CACHE_KEY,mcsJson,MESH_CONTACT_STATS_CACHE_TTL_SEC);}catch(_mcp){}
    }
    return ContentService.createTextOutput(mcsJson).setMimeType(ContentService.MimeType.JSON);
  }
  if(e.parameter.dashboardLive==="1"){
    // Every µJump-dashboard chart, computed fresh from "Master cell list" (+ a live top-up from
    // "Organelle locations") -- see dashboardLive()'s own doc comment above for the full design.
    // Public read (no token needed), same convention as every other bulk dashboard endpoint here.
    return gJson(dashboardLive());
  }
  if(e.parameter.reportsOverTime==="1"){
    // Feeds the µJump dashboard's "cumulative reports over time" graph: every report-type
    // sheet's row count, binned by UTC calendar day, returned as one small array rather than
    // every individual row (this file's sheets could plausibly grow into the thousands, and
    // the dashboard only ever plots a running daily total, not individual events). Root ID
    // proposals/votes are included alongside the REPORT_SHEETS_POINTS sheets since they're
    // also a form of community contribution worth showing growth for.
    var ss=SS();
    var byDate={}; // "YYYY-MM-DD" -> { sheetName: count, ... }
    var sheetNames=Object.keys(REPORT_SHEETS_POINTS).concat(["Root ID proposals","Root ID votes"]);
    sheetNames.forEach(function(sheetName){
      var sh=ss.getSheetByName(sheetName);
      if(!sh||sh.getLastRow()<2)return;
      var data=sh.getDataRange().getValues(),h=data[0];
      var iTs=h.indexOf("timestamp");
      if(iTs<0)return;
      for(var i=1;i<data.length;i++){
        var raw=data[i][iTs];if(!raw)continue;
        var day;
        try{ day=Utilities.formatDate(new Date(raw),"UTC","yyyy-MM-dd"); }catch(err){ continue; }
        if(!byDate[day])byDate[day]={};
        byDate[day][sheetName]=(byDate[day][sheetName]||0)+1;
      }
    });
    var days=Object.keys(byDate).sort();
    var daily=days.map(function(d){return {date:d,counts:byDate[d]};});
    return gJson({daily:daily});
  }
  if(e.parameter.myDownvoted){
    var id=verifyGoogleToken(e.parameter.myDownvoted);
    if(!id)return gJson({ok:false,error:"unauthenticated"});
    return gJson({downvoted:myDownvotedList(id.email)});
  }
  if(e.parameter.myReports){
    // "Download your work" -- see myReportsList()'s own comment above for the full design.
    var id=verifyGoogleToken(e.parameter.myReports);
    if(!id)return gJson({ok:false,error:"unauthenticated"});
    return gJson({email:id.email,sheets:myReportsList(id.email)});
  }
  if(e.parameter.identityVotes){
    var ss=SS(),nid=String(e.parameter.identityVotes),map={};
    var sh=ss.getSheetByName("Identity votes");
    if(sh&&sh.getLastRow()>=2){var d=sh.getDataRange().getValues(),h=d[0],iNuc=h.indexOf("nucleusId"),iId=h.indexOf("identity"),iV=h.indexOf("vote");
      for(var i=1;i<d.length;i++){if(String(d[i][iNuc])!==nid)continue;var disp=String(d[i][iId]||""),k=disp.toLowerCase();
        if(!map[k])map[k]={identity:disp,up:0,down:0};if(Number(d[i][iV])>=0)map[k].up++;else map[k].down++;}}
    var out=[];for(var k in map)out.push({identity:map[k].identity,up:map[k].up,down:map[k].down,net:map[k].up-map[k].down});
    return gJson({identityVotes:out});
  }
  if(e.parameter.allRootIds==="1"){
    // Bulk mode for the "Open all matches in Neuroglancer" bulk filter view: every proposed
    // Root ID / Nucleus ID for every nucleus, grouped by nucleusId, so a community-reported
    // segmentation shows up there the same way it already does on the single-cell view (which
    // reads the equivalent per-nucleus ?rootIds= branch below). Public read (no token), same as
    // ?rootIds= -- these are shown to everyone regardless of sign-in. Removed proposals are
    // excluded, same rule as everywhere else.
    var ss=SS();
    var byNucleus={};
    var psh=ss.getSheetByName("Root ID proposals");
    if(psh&&psh.getLastRow()>=2){
      var pd=psh.getDataRange().getValues(),ph=pd[0];
      var iNuc=ph.indexOf("nucleusId"),iRoot=ph.indexOf("rootId"),iRem=ph.indexOf("removed"),iSeg=ph.indexOf("segType");
      for(var p=1;p<pd.length;p++){
        if(iRem>=0&&String(pd[p][iRem]).toLowerCase()==="yes")continue;
        var nid=String(pd[p][iNuc]||"");if(!nid)continue;
        if(!byNucleus[nid])byNucleus[nid]=[];
        byNucleus[nid].push({rootId:String(pd[p][iRoot]||""),segType:(iSeg>=0&&pd[p][iSeg])?String(pd[p][iSeg]):"img65"});
      }
    }
    return gJson({byNucleus:byNucleus});
  }
  if(e.parameter.rootIds){
    // Proposed additional root IDs for one nucleus, with vote tallies. Public read (no token).
    var ss=SS();
    var nid=String(e.parameter.rootIds);
    var out=[];
    var psh=ss.getSheetByName("Root ID proposals");
    if(psh&&psh.getLastRow()>=2){
      var pd=psh.getDataRange().getValues(),ph=pd[0];
      var iNuc=ph.indexOf("nucleusId"),iRoot=ph.indexOf("rootId"),iBy=ph.indexOf("proposedByName"),iRem=ph.indexOf("removed"),iSeg=ph.indexOf("segType");
      var tally={};
      var vsh=ss.getSheetByName("Root ID votes");
      if(vsh&&vsh.getLastRow()>=2){
        var vd=vsh.getDataRange().getValues(),vh=vd[0];
        var jNuc=vh.indexOf("nucleusId"),jRoot=vh.indexOf("rootId"),jV=vh.indexOf("vote");
        for(var k=1;k<vd.length;k++){
          if(String(vd[k][jNuc])!==nid)continue;
          var rk=String(vd[k][jRoot]);if(!tally[rk])tally[rk]={up:0,down:0};
          if(Number(vd[k][jV])>=0)tally[rk].up++;else tally[rk].down++;
        }
      }
      for(var p=1;p<pd.length;p++){
        if(String(pd[p][iNuc])!==nid)continue;
        if(iRem>=0&&String(pd[p][iRem]).toLowerCase()==="yes")continue;
        var rid=String(pd[p][iRoot]),t=tally[rid]||{up:0,down:0};
        out.push({rootId:rid,by:(iBy>=0?(pd[p][iBy]||""):""),up:t.up,down:t.down,net:t.up-t.down,segType:(iSeg>=0&&pd[p][iSeg])?String(pd[p][iSeg]):"img65"});
      }
    }
    return ContentService.createTextOutput(JSON.stringify({rootIds:out}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if(e.parameter.newCells==="1"){
    // Bulk mode for community-reported "new cell, no nucleus" points (see doPost's
    // new_cell_no_nucleus branch above), so the client can do its own coordinate-proximity
    // matching -- unlike every other report type, these aren't keyed to a MICrONS nucleusId
    // at all, so there's no per-ID lookup to offer instead. DELIBERATE EXCEPTION to the
    // "reporterName is never sent to the client" rule used everywhere else in this file: for
    // this report type specifically, Søren wants a nearby community-reported cell displayed
    // like a verified own-coordinate entry, with credit given to whoever reported it (or
    // "anonymous" client-side if left blank) -- so reporterName IS included here on purpose.
    // reporterEmail is still withheld, same as always.
    var ss=SS();
    var sh=ss.getSheetByName("New cells (no nucleus)");
    var newCells=[];
    if(sh&&sh.getLastRow()>=2){
      var data=sh.getDataRange().getValues();
      var headers=data[0];
      var coordIdx=headers.indexOf("coord");
      var rootIdx=headers.indexOf("rootId");
      // Same tolerant lookup as doPost's append-merge branch below -- see comment there.
      var nucRootIdx=headers.indexOf("nucRootId");
      if(nucRootIdx<0)nucRootIdx=headers.indexOf("nucleusId");
      var identIdx=headers.indexOf("identified");
      var nameIdx=headers.indexOf("reporterName");
      var commentIdx=headers.indexOf("comment");
      var certIdx=headers.indexOf("certainty");
      var tsIdx=headers.indexOf("timestamp");
      for(var ni=1;ni<data.length;ni++){
        newCells.push({coord:data[ni][coordIdx]||"",rootId:data[ni][rootIdx]||"",
          nucRootId:nucRootIdx>=0?(data[ni][nucRootIdx]||""):"",
          identified:data[ni][identIdx]||"",reporterName:data[ni][nameIdx]||"",
          comment:data[ni][commentIdx]||"",certainty:data[ni][certIdx]||"",
          timestamp:data[ni][tsIdx]||""});
      }
    }
    return ContentService.createTextOutput(JSON.stringify({newCells:newCells}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if(e.parameter.newCellOrganelles==="1"){
    // Bulk mode for centriole/cilium ("organelle_location") reports logged against a
    // "new cell, no nucleus" report (see wireOrganelleForm()'s "nonuc_" groupId prefix and
    // ID_CTX.nucId||"" in the HTML) -- these have no nucleusId to key on, exactly like
    // new_cell_no_nucleus itself, so they were being written but NEVER read back anywhere: the
    // per-nucleus branch below only ever looks up by an exact nucleusId, which a blank string
    // can never match. Mirrors ?newCells=1 above -- return every row with a blank nucleusId,
    // keyed by coord, and let the client match by coordinate proximity against the same
    // community-report coordinate (see organellesNearPos() in the HTML). No reporterName/
    // reporterEmail here, unlike ?newCells=1 -- that exception was scoped specifically to
    // crediting a new-cell report, not organelle sub-reports.
    var ss=SS();
    var sh=ss.getSheetByName("Organelle locations");
    var organelles=[];
    if(sh&&sh.getLastRow()>=2){
      var data=sh.getDataRange().getValues();
      var headers=data[0];
      var nidIdx=headers.indexOf("nucleusId");
      var coordIdx=headers.indexOf("coord");
      var groupIdx=headers.indexOf("groupId");
      var kindIdx=headers.indexOf("kind");
      var pointAIdx=headers.indexOf("pointA");
      var pointBIdx=headers.indexOf("pointB");
      var commentIdx=headers.indexOf("comment");
      for(var oi=1;oi<data.length;oi++){
        if(nidIdx>=0&&String(data[oi][nidIdx]||"").trim()!=="")continue; // has a real nucleusId -- belongs to the per-nucleus lookup instead
        organelles.push({coord:data[oi][coordIdx]||"",groupId:data[oi][groupIdx]||"",
          kind:data[oi][kindIdx]||"",pointA:data[oi][pointAIdx]||"",pointB:data[oi][pointBIdx]||"",
          comment:data[oi][commentIdx]||""});
      }
    }
    return ContentService.createTextOutput(JSON.stringify({organelles:organelles}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if(e.parameter.allIds==="1"){
    // Bulk mode for (a) the "unclassified" filter tiers that need to know what's already
    // reported, and (b) the "Reported by community?" / "Community report details" Excel
    // columns: every report, grouped by nucleus ID. Only identified + comment are ever
    // included — reporterName/reporterEmail are deliberately never sent back to the
    // client, same privacy rule as the per-nucleus branch below. nucleusIds is also
    // included alongside byNucleus for convenience (just Object.keys(byNucleus) really).
    // "Confirmations" (agreement with MICrONS' own suggestion) is folded in here too, same as
    // Discrepancies/New identifications, so agreement counts toward "already reported".
    var ss=SS();
    var byNucleus={};
    ["Discrepancies","New identifications","Confirmations"].forEach(function(sheetName){
      var sh=ss.getSheetByName(sheetName);
      if(!sh||sh.getLastRow()<2)return;
      var data=sh.getDataRange().getValues();
      var headers=data[0];
      var idIdx=headers.indexOf("nucleusId");
      var identIdx=headers.indexOf("identified");
      var commentIdx=headers.indexOf("comment");
      // reporterName and timestamp are returned so the client can rank the proposed names by
      // how many people backed each, and credit whoever proposed the winning one FIRST.
      // reporterEmail is deliberately NOT returned -- collected for attribution, not for
      // broadcasting to everyone who views a cell.
      var nameIdx=headers.indexOf("reporterName");
      var tsIdx=headers.indexOf("timestamp");
      var certIdx=headers.indexOf("certainty");
      for(var i=1;i<data.length;i++){
        var nid=String(data[i][idIdx]);
        if(!byNucleus[nid])byNucleus[nid]=[];
        byNucleus[nid].push({identified:data[i][identIdx],comment:data[i][commentIdx]||"",
        reporterName:nameIdx>=0?(data[i][nameIdx]||""):"",
        certainty:certIdx>=0?(data[i][certIdx]||""):"",
        timestamp:tsIdx>=0?String(data[i][tsIdx]||""):""});
      }
    });
    // Merged-split reports are kept separate from the tally above (mixing a sub-nucleus
    // identity into the same identified-count as a normal single-cell report would
    // misrepresent both) but still need to mark the parent nucleus as "has a community
    // report on file" for the needs-attention filter tiers / Excel columns, so each
    // sub-nucleus row is also pushed in with merged:true for callers that want to filter
    // it out of an identity tally while still counting it as "reported".
    var mergedSh=ss.getSheetByName("Merged splits");
    if(mergedSh&&mergedSh.getLastRow()>=2){
      var mdata=mergedSh.getDataRange().getValues();
      var mheaders=mdata[0];
      var midIdx=mheaders.indexOf("nucleusId");
      var mIdentIdx=mheaders.indexOf("identified");
      var mCommentIdx=mheaders.indexOf("comment");
      var mGroupIdx=mheaders.indexOf("groupId");
      // certainty + subIndex added 2026-08-09 alongside the Excel export's new "Classification
      // certainty" column (Søren: "Add ... 5. Classification certainty" to every exported cell)
      // -- a merged-nucleus sub-cell report carries its own certainty rating just like a normal
      // Discrepancies/New identifications row, but this branch previously dropped it on the
      // floor. subIndex lets the client match a specific sub-cell's own report instead of only
      // the parent nucleus (several sub-cells can share one nucleusId), same reasoning as
      // groupId just above.
      var mCertIdx=mheaders.indexOf("certainty");
      var mSubIdx2=mheaders.indexOf("subIndex");
      for(var mi=1;mi<mdata.length;mi++){
        var mnid=String(mdata[mi][midIdx]);
        if(!byNucleus[mnid])byNucleus[mnid]=[];
        byNucleus[mnid].push({identified:mdata[mi][mIdentIdx],comment:mdata[mi][mCommentIdx]||"",merged:true,
          groupId:mdata[mi][mGroupIdx],certainty:mCertIdx>=0?(mdata[mi][mCertIdx]||""):"",
          subIndex:mSubIdx2>=0?mdata[mi][mSubIdx2]:""});
      }
    }
    // "Not a nucleus" flags, folded in the same way as merged-split rows above (tagged
    // notNucleus:true) purely so the flagged nucleus still counts as "reported" for the
    // needs-attention filter tiers and the "Reported by community?" column.
    var nnSh=ss.getSheetByName("Not a nucleus");
    if(nnSh&&nnSh.getLastRow()>=2){
      var nndata=nnSh.getDataRange().getValues();
      var nnheaders=nndata[0];
      var nnidIdx=nnheaders.indexOf("nucleusId");
      var nnCommentIdx=nnheaders.indexOf("comment");
      for(var nni=1;nni<nndata.length;nni++){
        var nnnid=String(nndata[nni][nnidIdx]);
        if(!byNucleus[nnnid])byNucleus[nnnid]=[];
        byNucleus[nnnid].push({identified:"",comment:nndata[nni][nnCommentIdx]||"",notNucleus:true});
      }
    }
    return ContentService.createTextOutput(JSON.stringify({byNucleus:byNucleus,nucleusIds:Object.keys(byNucleus)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var nucleusId=e.parameter.nucleusId;
  var out=[];
  var HNDL=handleMap();
  if(nucleusId){
    /* 2026-08-09 (performance audit) -- this branch used to run SIX full getDataRange() scans
       (Discrepancies/New identifications/Confirmations/Merged splits/Not a nucleus/Organelle
       locations) on every single call, and it's called every time ANYONE views a cell that has
       any report on file -- by far the most frequently-hit read in the whole file. Short-TTL
       cache (nucViewCacheKey below) makes repeat views of the same cell within the TTL window
       near-instant; invalidateNucleusViewCache() (called from doPost's shared exit point) busts
       the SPECIFIC nucleus just written to immediately, so a fresh reclassification is never
       hidden behind this cache -- only OTHER, unrelated cells benefit from the cached read. */
    var nucViewCacheKey="nucView:"+String(nucleusId);
    var nucViewCache;
    try{nucViewCache=dsCache();}catch(_nvc){nucViewCache=null;}
    if(nucViewCache){
      try{
        var nucViewHit=nucViewCache.get(nucViewCacheKey);
        if(nucViewHit){
          return ContentService.createTextOutput(nucViewHit).setMimeType(ContentService.MimeType.JSON);
        }
      }catch(_nvg){/* corrupt/unparseable entry -- fall through to a live read */}
    }
    var ss=SS();
    // "Confirmations" folded in here too, so loadCommunityReports() on the client tallies it into
    // the same "N users report this as X" count as Discrepancies/New identifications.
    ["Discrepancies","New identifications","Confirmations"].forEach(function(sheetName){
      var sh=ss.getSheetByName(sheetName);
      if(!sh||sh.getLastRow()<2)return;
      var data=sh.getDataRange().getValues();
      var headers=data[0];
      var idIdx=headers.indexOf("nucleusId");
      var identIdx=headers.indexOf("identified");
      var commentIdx=headers.indexOf("comment");
      var tsIdx=headers.indexOf("timestamp");
      var certIdx=headers.indexOf("certainty");
      var emailIdx=headers.indexOf("reporterEmail");
      var nameIdx=headers.indexOf("reporterName");
      for(var i=1;i<data.length;i++){
        if(String(data[i][idIdx])===String(nucleusId)){
          // identified + comment + timestamp + certainty, plus the proposer's PUBLIC handle (chosen
          // display name, defaults to first name) so the FIRST proposer is credited on the cell even
          // without confirmation. Certainty (1-5) lets the client break naming ties by confidence.
          // Email is still never sent; the raw name is mapped to a handle.
          out.push({identified:data[i][identIdx],comment:data[i][commentIdx]||"",
                    timestamp:tsIdx>=0?data[i][tsIdx]:"",certainty:certIdx>=0?(data[i][certIdx]||""):"",
                    reporterName:displayFor(HNDL,emailIdx>=0?data[i][emailIdx]:"",nameIdx>=0?data[i][nameIdx]:"")});
        }
      }
    });
    // Merged-split reports for this nucleus, grouped by groupId (one report = one group =
    // however many sub-nuclei that reporter listed), kept in a separate array from "out"
    // above so the client can render "N users report this as merged" distinctly instead
    // of folding sub-identities into the normal per-cell tally.
    var mergedSh=ss.getSheetByName("Merged splits");
    if(mergedSh&&mergedSh.getLastRow()>=2){
      var mdata=mergedSh.getDataRange().getValues();
      var mheaders=mdata[0];
      var midIdx=mheaders.indexOf("nucleusId");
      var mIdentIdx=mheaders.indexOf("identified");
      var mCommentIdx=mheaders.indexOf("comment");
      var mGroupIdx=mheaders.indexOf("groupId");
      var mSubIdx=mheaders.indexOf("subIndex");
      var mSubCountIdx=mheaders.indexOf("subCount");
      var groups={};
      for(var mi=1;mi<mdata.length;mi++){
        if(String(mdata[mi][midIdx])!==String(nucleusId))continue;
        var gid=String(mdata[mi][mGroupIdx]);
        if(!groups[gid])groups[gid]={subCount:mdata[mi][mSubCountIdx]||0,subs:[]};
        groups[gid].subs.push({identified:mdata[mi][mIdentIdx],comment:mdata[mi][mCommentIdx]||"",subIndex:mdata[mi][mSubIdx]});
      }
      var mergedGroups=[];
      for(var gid2 in groups)mergedGroups.push(groups[gid2]);
      if(mergedGroups.length)var mergedOut=mergedGroups; else var mergedOut=[];
    }
    // "Not a nucleus" flags for this nucleus -- unlike merged-split there's no sub-grouping
    // needed (each flag is just one report), so this is a flat list of comments.
    var nnSh=ss.getSheetByName("Not a nucleus");
    var notNucleusOut=[];
    if(nnSh&&nnSh.getLastRow()>=2){
      var nndata=nnSh.getDataRange().getValues();
      var nnheaders=nndata[0];
      var nnidIdx=nnheaders.indexOf("nucleusId");
      var nnCommentIdx=nnheaders.indexOf("comment");
      for(var nni=1;nni<nndata.length;nni++){
        if(String(nndata[nni][nnidIdx])!==String(nucleusId))continue;
        notNucleusOut.push({comment:nndata[nni][nnCommentIdx]||""});
      }
    }
    // Centriole/cilium ("organelle_location") reports for this nucleus, grouped by groupId
    // the same way merged-split is above -- one group = one report submission, however many
    // structures (centriole/cilium rows) it contained. Each structure keeps its own
    // pointA/pointB (voxel coords, "x,y,z" strings -- pointA only for a centriole, pointA
    // as base + pointB as tip for a cilium) so the client can display and jump to the
    // actual reported location, not just a count. comment is duplicated across every row in
    // a submission (the client posts it once per structure), so the group's comment is just
    // the first row's value.
    var orgSh=ss.getSheetByName("Organelle locations");
    var organelleOut=[];
    if(orgSh&&orgSh.getLastRow()>=2){
      var odata=orgSh.getDataRange().getValues();
      var oheaders=odata[0];
      var oidIdx=oheaders.indexOf("nucleusId");
      var oGroupIdx=oheaders.indexOf("groupId");
      var oSubCountIdx=oheaders.indexOf("subCount");
      var oKindIdx=oheaders.indexOf("kind");
      var oPointAIdx=oheaders.indexOf("pointA");
      var oPointBIdx=oheaders.indexOf("pointB");
      var oCommentIdx=oheaders.indexOf("comment");
      var ogroups={};
      for(var oi=1;oi<odata.length;oi++){
        if(String(odata[oi][oidIdx])!==String(nucleusId))continue;
        var ogid=String(odata[oi][oGroupIdx]);
        if(!ogroups[ogid])ogroups[ogid]={subCount:odata[oi][oSubCountIdx]||0,comment:odata[oi][oCommentIdx]||"",structures:[]};
        ogroups[ogid].structures.push({kind:odata[oi][oKindIdx],pointA:odata[oi][oPointAIdx]||"",pointB:odata[oi][oPointBIdx]||""});
      }
      for(var ogid2 in ogroups)organelleOut.push(ogroups[ogid2]);
    }
    var nucViewJson=JSON.stringify({reports:out,mergedGroups:(typeof mergedOut!=="undefined"?mergedOut:[]),notNucleusReports:(typeof notNucleusOut!=="undefined"?notNucleusOut:[]),organelleGroups:(typeof organelleOut!=="undefined"?organelleOut:[])});
    if(nucViewCache){
      try{nucViewCache.put(nucViewCacheKey,nucViewJson,NUC_VIEW_CACHE_TTL_SEC);}catch(_nvp){/* e.g. over the 100KB per-value limit on an unusually heavily-reported cell -- just don't cache this round */}
    }
    return ContentService.createTextOutput(nucViewJson).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({reports:out,mergedGroups:(typeof mergedOut!=="undefined"?mergedOut:[]),notNucleusReports:(typeof notNucleusOut!=="undefined"?notNucleusOut:[]),organelleGroups:(typeof organelleOut!=="undefined"?organelleOut:[])}))
    .setMimeType(ContentService.MimeType.JSON);
}
