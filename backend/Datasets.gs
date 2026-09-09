/* ============================================================================
   Datasets.gs -- multi-dataset support + daily-cached cross-page profile totals.
   Added 2026-08-16 for hJump (H01 human cortex), which is a SEPARATE PAGE with its own
   spreadsheet, sharing this one Apps Script deployment so there is one OAuth consent
   screen, one sign-in, and one points/level that follows the user between pages.

   This is a NEW file in the same Apps Script project as Code.gs. All .gs files in a
   project share one global scope, so everything here is callable from Code.gs and vice
   versa. Keeping it separate means Code.gs needs only three mechanical edits (see
   APPLYING.md) instead of a 3,700-line rewrite.
   ============================================================================ */

/* ---------- 1. The dataset registry ---------------------------------------------------
   sheetId "" means "the spreadsheet this script is bound to" -- i.e. today's µJump sheet,
   reached exactly as before. Add a dataset by adding a row here and creating its sheet
   with the SAME tab names and column layouts; nothing else in this file is per-dataset. */
/* `res` is the dataset's voxel size in nanometres, [x, y, z], and it is only here because
   something needed it: the organelle top-up in dashboardLive() converts voxel coordinates to
   microns to report a cilium's length and a nucleus-to-centriole distance, and it did that with a
   hard-coded 4 x 4 x 40 -- µJump's voxel, and nobody else's. δJump's is 9 x 9 x 45, so a cilium
   logged there would have been reported at about half its length.

   ONLY FILLED IN WHERE IT HAS BEEN READ OFF THE PAGE ITSELF (UJ.cfg.res in the browser), because
   a wrong number here is worse than none: code that needs a resolution and has not got one skips
   the measurement and says so, which is recoverable. Add the rest the same way -- open the tool,
   read UJ.cfg.res, put it here -- rather than inferring from the dataset's paper. */
var DATASETS = {
  ujump: { label: "µJump — MICrONS minnie65",       sheetId: "", res: [4, 4, 40] },
  hjump: { label: "ηJump — H01 human cortex",       sheetId: "1Iijbb2rkMBa3Jxij3nfTFBgBeXdyCxI8KFegXwEXbW0" },
  bjump: { label: "βJump — Alzheimer's vCLEM CA1",  sheetId: "1ejkOC1mJQb1sx8i_TpGoHRpHRBt0_v6lgP7A_Ng9GwM" },
  /* Added 2026-08-20 for δJump (V1DD, the Allen "V1 Deep Dive"). Its sheet was created BLANK
     on purpose: every tab in Code.gs is made on demand via
     `getSheetByName(x) || insertSheet(x)` followed by a header row when `getLastRow()===0`,
     so there is nothing to pre-build here and nothing to keep in sync by hand. */
  djump: { label: "δJump — V1DD (Allen V1 Deep Dive)", sheetId: "1Cr53X7GYRh0OE0qYRcFtnot1hJhMyCuDUxWLvqj3-Z0",
           res: [9, 9, 45] },   /* read from UJ.cfg.res on grubblab.com/djump.html, 2026-09-05 */
  /* Added 2026-08-23 for λJump (Lee et al. 2016 mouse V1 ssTEM). Same as δJump: create the
     spreadsheet BLANK. Every tab in Code.gs is made on demand via
     `getSheetByName(x) || insertSheet(x)` with a header row when `getLastRow()===0`, so there
     is nothing to pre-build and nothing to keep in sync by hand.

     Until the id is pasted in, SS() throws and dsConfigError() returns a readable message --
     which is the intended behaviour, not a bug: writing λJump's reports into µJump's
     spreadsheet would be far worse than an error. Check what is actually DEPLOYED with
     <endpoint>?whoami=1 before concluding the page is broken. */
  ljump: { label: "λJump — Lee16 mouse V1 ssTEM", sheetId: "1oEpn5x9g0P9EpwUx2kQwrixbGVWRrTMtfcH88DS8rIw" },
  /* ωJump — Janelia OpenOrganelle FIB-SEM, 15 datasets. Unlike every dataset above it, this one
     has NO nucleus table: the community builds it. Handlers in WJumpDiscovery.gs. */
  /* This working copy carried PASTE_WJUMP_SHEET_ID_HERE for a while and was delivered three
     times with it, each time putting the placeholder back over the live value. ωJump then
     answers every request with "The ωJump spreadsheet has not been created yet" while every
     other tool keeps working, which is why nobody notices. gs_config_check.js now fails on any
     PASTE placeholder, so a file in that state cannot be handed over again. */
  wjump: { label: "ωJump — OpenOrganelle FIB-SEM",
           sheetId: "1ZjBZRzukC0WH3f-oUrcwgWl3ETiee06v7COtreVDuR4" },
  /* πJump — MICrONS pinky100 Layer 2/3, 456 somas. Same shape as δJump and λJump: the sheet
     ("piJump", created 2026-08-27, same Drive folder and owner as ωJump's) was made BLANK on
     purpose. Every tab is created on demand by `getSheetByName(x) || insertSheet(x)` plus a
     header row when `getLastRow()===0`, so there is nothing to pre-build and nothing to keep in
     sync by hand.
     NOT sheetId: "" -- that means "the spreadsheet this script is bound to", i.e. µJump's, and
     πJump's community reports would land in µJump's tables. */
  pjump: { label: "πJump — MICrONS pinky100 Layer 2/3",
           sheetId: "10aIhHZWTRx2UCAxx1C-c46pZf4GxqaFsX4GZvtx4f_g" },
  /* χJump — Nguyen & Thomas 2022 cb2 (BossDB), mouse cerebellar cortex. Handlers in
     XJumpCells.gs, and unlike every dataset above it there is no nucleus table AND no cell list:
     the segmentation is FRAGMENTS, and a cell is something a person assembles.

     Create the spreadsheet BLANK, same as δJump/λJump/πJump. Every tab is made on demand by
     `getSheetByName(x) || insertSheet(x)` plus a header row when `getLastRow()===0`, so there is
     nothing to pre-build and nothing to keep in sync by hand.

     NOT sheetId: "" -- that means "the spreadsheet this script is bound to", i.e. µJump's, and
     χJump's assemblies would land in µJump's tables. Until the real id is pasted in here,
     dsConfigError() returns a readable message and nothing is written anywhere. */
  xjump: { label: "χJump — cb2 cerebellum (fragment assembly)",
           sheetId: "PASTE_XJUMP_SHEET_ID_HERE" }
};
var DEFAULT_DS = "ujump";

/* Which dataset the CURRENT request is about. Safe as a module-level variable: every Apps
   Script execution runs in its own isolated context, so there is no cross-request bleed. */
var CURRENT_DS = DEFAULT_DS;

/* Call once at the top of doGet and doPost. Falls back to ujump for any unknown or missing
   value, so an old client that sends no ds keeps working unchanged. */
function setDsFromRequest(e) {
  var d = "";
  try { if (e && e.parameter && e.parameter.ds) d = String(e.parameter.ds); } catch (_p) {}
  if (!d) {
    try { if (e && e.postData && e.postData.contents) d = String(JSON.parse(e.postData.contents).ds || ""); }
    catch (_b) {}
  }
  CURRENT_DS = DATASETS.hasOwnProperty(d) ? d : DEFAULT_DS;
  return CURRENT_DS;
}

/* Drop-in replacement for SpreadsheetApp.getActiveSpreadsheet() throughout Code.gs. */
function SS() {
  var cfg = DATASETS[CURRENT_DS] || DATASETS[DEFAULT_DS];
  if (!cfg.sheetId) return SpreadsheetApp.getActiveSpreadsheet();
  /* A registered-but-not-yet-created dataset must fail LOUDLY, not quietly fall back to the
     bound sheet -- silently writing βJump reports into the µJump spreadsheet would be far
     worse than an error, and much harder to notice. */
  if (cfg.sheetId.indexOf("PASTE") === 0) {
    throw new Error('dataset "' + CURRENT_DS + '" has no spreadsheet yet — paste its ID into ' +
                    'DATASETS.' + CURRENT_DS + '.sheetId in Datasets.gs (see APPLYING.md step 3)');
  }
  return SpreadsheetApp.openById(cfg.sheetId);
}

/* Why this exists, learned the hard way on 2026-08-18.

   SS() throwing is correct -- writing βJump's data into µJump's spreadsheet would be far worse
   than an error. But an UNCAUGHT Apps Script exception renders an HTML error page, and Apps
   Script does not put Access-Control-Allow-Origin on those. So the browser rejects the response
   before any JavaScript sees it and the page reports a bare "Failed to fetch". The carefully
   worded message never reaches the user; the tool just looks broken.

   Call this at the top of doGet and doPost, right after setDsFromRequest(e), and return the
   message as JSON instead. gJson() sets the right MIME type and Apps Script DOES send CORS
   headers on a normal ContentService response, so the page can display it. SS() keeps throwing
   as a backstop for any path that forgets the guard. */
function dsConfigError() {
  var cfg = DATASETS[CURRENT_DS];
  if (!cfg) return 'unknown dataset "' + CURRENT_DS + '"';
  if (cfg.sheetId && cfg.sheetId.indexOf("PASTE") === 0) {
    return 'The ' + (cfg.label || CURRENT_DS) + ' spreadsheet has not been created yet. '
         + 'Create it, then paste its ID into DATASETS.' + CURRENT_DS + '.sheetId in Datasets.gs '
         + 'and redeploy (Deploy \u2192 Manage deployments \u2192 edit \u2192 New version).';
  }
  return "";
}

/* ---------- 1b. "Which version is actually deployed?" ----------------------------------
   Apps Script serves the last DEPLOYED version at /exec, so a file can be perfectly correct in
   the editor and still not be what answers a request. That is invisible from the outside and has
   now cost three round trips on βJump. This makes it a single click:

       <endpoint>?whoami=1

   It reports the registry as the LIVE code sees it. If a sheetId still reads PASTE_..., the
   deployment is stale no matter what the editor shows. Reveals no data — only which datasets
   exist and whether each has an id — so it is safe to leave unauthenticated. */
/* Bumped whenever this file changes, so a stale deployment is visible at a glance even before
   `missing` is read. The 2026-08-27 lesson: an identical whoami response across a paste-and-deploy
   attempt IS the finding -- it proves the deployed bundle did not change. That only works if the
   stamp actually moves, so move it. */
var DATASETS_BUILD = "2026-08-31 xjump-registered";

/* WHAT THIS COULD NOT ANSWER, and now can.

   2026-08-27: an ωJump save failed with `Unexpected token '<'` -- JSON.parse handed an HTML page.
   whoami was the right first check and it came back healthy: ok:true, the URL resolves, it is
   published to Anyone, and wjump's sheet id is set. All true, and none of it addressed the actual
   question, which was "is the code I just pasted the code this endpoint is running?"

   It could not address it for two reasons:
     - DATASETS_BUILD is a hand-maintained string in THIS file. It says nothing about
       WJumpDiscovery.gs or Code.gs, and it only changes when somebody remembers to change it.
     - /exec serves the last DEPLOYED version, never the editor's saved content. Pasting a file and
       pressing Ctrl+S changes nothing here. That is the failure this whole check exists to catch
       and it was the one thing it was blind to.

   So probe the functions themselves, the way hasDsConfigError already did. `typeof f === "function"`
   is evaluated inside the deployed bundle, so it reports what is actually running rather than what
   somebody believes was uploaded. `missing` is the whole answer in one field: empty array means
   every handler the pages call is present; a non-empty one names the file that did not make it. */
function dsHandlerReport_() {
  /* Written out by name rather than looped with eval. `typeof someUndeclaredIdentifier` is the
     one place the language does NOT throw on an unknown name -- it returns "undefined" -- so the
     direct form is both safe and simpler, and it does not depend on eval being permitted. The
     first version used eval and did not need to. */
  var have = {
    wjumpBoxVisit:            (typeof wjumpBoxVisit            === "function"),
    wjumpNucleusFound:        (typeof wjumpNucleusFound        === "function"),
    wjumpNucleusName:         (typeof wjumpNucleusName         === "function"),
    wjumpNucleusReject:       (typeof wjumpNucleusReject       === "function"),
    wjumpState:               (typeof wjumpState               === "function"),
    pointsIndexFor:           (typeof pointsIndexFor           === "function"),
    rebuildAllPointsIndexes:  (typeof rebuildAllPointsIndexes  === "function"),
    masterRowForKey_:         (typeof masterRowForKey_         === "function")
  };
  var missing = [];
  for (var n in have) { if (have.hasOwnProperty(n) && !have[n]) missing.push(n); }
  return { have: have, missing: missing };
}

function dsWhoAmI() {
  var h = dsHandlerReport_();
  var out = { ok: true, build: DATASETS_BUILD, hasDsConfigError: (typeof dsConfigError === "function"),
              hasBjumpPositionFix: (typeof bjumpPositionFix === "function"),
              handlers: h.have, missing: h.missing,
              deployedCodeIsCurrent: h.missing.length === 0,
              note: h.missing.length
                ? "MISSING: " + h.missing.join(", ") + " -- these files were not in the deployed "
                  + "version. Pasting and saving is not deploying: Deploy > Manage deployments > "
                  + "edit (pencil) > Version: New version > Deploy."
                : "every handler the pages call is present in the deployed version",
              datasets: {} };
  for (var k in DATASETS) {
    if (!DATASETS.hasOwnProperty(k)) continue;
    var id = DATASETS[k].sheetId;
    out.datasets[k] = {
      label: DATASETS[k].label,
      sheet: !id ? "bound spreadsheet"
           : (id.indexOf("PASTE") === 0 ? "NOT SET (" + id + ") -- stale deployment or unfilled id"
                                        : "set (" + id.slice(0, 6) + "\u2026" + id.slice(-4) + ")")
    };
  }
  return gJson(out);
}

/* The bound spreadsheet, regardless of CURRENT_DS -- the one place cross-dataset results
   are stored so a single read serves every page. */
function primarySS() { return SpreadsheetApp.getActiveSpreadsheet(); }

/* Namespaces a CacheService key by dataset. Without this, hJump would serve µJump's
   cached leaderboard and nobody would notice until the numbers looked wrong. */
function dsKey(base) { return base + ":" + CURRENT_DS; }

/* Drop-in replacement for CacheService.getScriptCache() throughout Code.gs. Same three
   methods, every key silently prefixed with the current dataset -- so one find/replace
   namespaces every cache in the file instead of editing eleven separate key sites and
   hoping none was missed. Never throws: if the cache service is unavailable the object
   degrades to a no-op and callers simply recompute, which is what their existing
   try/catch blocks already expect. */
function dsCache() {
  var c = null;
  try { c = CacheService.getScriptCache(); } catch (_dc) { c = null; }
  var p = CURRENT_DS + ":";
  return {
    get: function (k) { try { return c ? c.get(p + k) : null; } catch (_g) { return null; } },
    put: function (k, v, t) { try { if (c) c.put(p + k, v, t); } catch (_p2) {} },
    remove: function (k) { try { if (c) c.remove(p + k); } catch (_r) {} }
  };
}


/* ---------- 2. Daily-cached profile totals --------------------------------------------
   Søren's chosen design: do NOT recompute every dataset live on each profile open. A
   scheduled job walks the datasets once a day and writes one row per (email, dataset);
   the profile endpoint then does a single cheap sheet read and sums.

   The per-page live numbers keep working exactly as before via ?myStats= -- so a user who
   has just submitted something still sees their own points move immediately on the page
   they are on. Only the CROSS-page total is a day old, which is what a level is for. */
var PROFILE_TOTALS_SHEET = "Profile totals";
var PROFILE_TOTALS_HEADERS = ["email", "dataset", "points", "reports", "organelles",
                              "newCells", "rootProposals", "computedVolumes", "votesGiven",
                              "daysActive", "updated"];

function profileTotalsSheet_() {
  var ss = primarySS(), sh = ss.getSheetByName(PROFILE_TOTALS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(PROFILE_TOTALS_SHEET);
    sh.getRange(1, 1, 1, PROFILE_TOTALS_HEADERS.length).setValues([PROFILE_TOTALS_HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/* Rebuilds every row. Run by the daily trigger; also safe to run by hand from the editor
   after adding a dataset or changing the points rules. */
function rebuildProfileTotals() {
  var t0 = new Date().getTime();
  /* FIRST, so every aggregateAll() below reads a fresh index rather than the previous one. This
     is also where the expensive master-list read now lives -- once every four hours, in a
     trigger, instead of on every page load. See PointsIndex.gs. */
  try { rebuildAllPointsIndexes(); }
  catch (err) { Logger.log("rebuildAllPointsIndexes failed: " + err); }
  var saved = CURRENT_DS, rows = [], stamp = new Date().toISOString();
  try {
    for (var ds in DATASETS) {
      if (!DATASETS.hasOwnProperty(ds)) continue;
      var cfg = DATASETS[ds];
      // A dataset whose sheet has not been created yet is skipped, not fatal.
      if (ds !== DEFAULT_DS && (!cfg.sheetId || cfg.sheetId.indexOf("PASTE") === 0)) continue;
      CURRENT_DS = ds;
      var agg;
      try { agg = aggregateAll(); }
      catch (err) { Logger.log("rebuildProfileTotals: " + ds + " failed: " + err); continue; }
      for (var em in agg) {
        if (!agg.hasOwnProperty(em)) continue;
        var u = agg[em];
        rows.push([em, ds, u.points || 0, u.reports || 0, u.organelles || 0,
                   u.newCells || 0, u.rootProps || 0, u.computedVolumes || 0,
                   u.votesGiven || 0, Object.keys(u.dates || {}).length, stamp]);
      }
    }
  } finally { CURRENT_DS = saved; }

  var sh = profileTotalsSheet_();
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, PROFILE_TOTALS_HEADERS.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, PROFILE_TOTALS_HEADERS.length).setValues(rows);
  /* Logged rather than assumed: this walks every dataset and calls aggregateAll() on each, so it
     is the one job here whose cost grows with the data. Apps Script kills a run at 6 minutes with
     no partial write, which would silently freeze the cross-tool totals at whatever they last
     were. Seeing the seconds climb is the warning. */
  var secs = (new Date().getTime() - t0) / 1000;
  Logger.log("rebuildProfileTotals: " + rows.length + " rows in " + secs.toFixed(1) + "s"
             + (secs > 180 ? "  *** over half the 6-minute limit ***" : ""));
  return rows.length;
}

/* Run ONCE from the Apps Script editor to schedule the daily rebuild. Idempotent: removes
   any existing trigger for the same function first, so re-running never stacks duplicates. */
function installProfileTotalsTrigger() {
  var all = ScriptApp.getProjectTriggers();
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === "rebuildProfileTotals") ScriptApp.deleteTrigger(all[i]);
  }
  /* Every 4 hours, not nightly. The chip already merges the CURRENT tool live with the snapshot
     for the others, so the only thing this cadence controls is how long points earned in another
     tool take to appear. A day of that reads as "the tools don't share points", which is the
     complaint this whole mechanism exists to answer. Four hours is a compromise with the 6-minute
     execution limit: this walks every dataset and calls aggregateAll() on each, so its cost grows
     with the data, and rebuildProfileTotals() logs its own duration so the ceiling is visible
     before it is hit rather than after. */
  ScriptApp.newTrigger("rebuildProfileTotals").timeBased().everyHours(4).create();
  return "cross-tool points rebuild scheduled every 4 hours";
}

/* One user's totals across every dataset, read from the daily sheet. */
/* perDataset is an ARRAY of {ds, label, points, ...}, not an object keyed by ds.

   It was an object, and core/gamify.js -- written in a different session -- consumed it with
   `(t.perDataset||[]).forEach(...)`. forEach does not exist on a plain object, so combinedPoints()
   threw, renderChip() died mid-call, and the sign-in chip stayed on "loading…" for ever. That is
   the "points never finish loading" Søren reported: not slow, broken, and broken in the seam
   between two files that were each correct on their own and never run together.

   The `ds` key matters just as much. gamify.js subtracts THIS dataset's snapshot figure and adds
   its live one, so the chip is correct immediately after a submission; without a `ds` on each
   entry that subtraction always found nothing and the current tool's points were counted twice. */
function profileTotalsFor(email) {
  var sh = profileTotalsSheet_(), out = { perDataset: [], points: 0, reports: 0, updated: null };
  if (sh.getLastRow() < 2) return out;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, PROFILE_TOTALS_HEADERS.length).getValues();
  var target = String(email || "").toLowerCase();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).toLowerCase() !== target) continue;
    var ds = String(vals[i][1]);
    var entry = {
      ds: ds,
      label: (DATASETS[ds] && DATASETS[ds].label) || ds,
      points: Number(vals[i][2]) || 0, reports: Number(vals[i][3]) || 0,
      organelles: Number(vals[i][4]) || 0, newCells: Number(vals[i][5]) || 0,
      rootProposals: Number(vals[i][6]) || 0, computedVolumes: Number(vals[i][7]) || 0,
      votesGiven: Number(vals[i][8]) || 0, daysActive: Number(vals[i][9]) || 0
    };
    out.perDataset.push(entry);
    out.points  += entry.points;
    out.reports += entry.reports;
    out.updated = vals[i][10] || out.updated;
  }
  return out;
}

/* ---------- 3. The endpoint ------------------------------------------------------------
   Deliberately a NEW branch rather than a change to ?myStats=, so the existing per-page
   profile keeps behaving exactly as it does today and this can be adopted at leisure.

   Add this to doGet, near the other read branches:

       if (e.parameter.profileTotals) return profileTotalsEndpoint(e);
*/
function profileTotalsEndpoint(e) {
  var id = verifyGoogleToken(e.parameter.profileTotals);
  if (!id) return gJson({ ok: false, error: "unauthenticated" });
  var t = profileTotalsFor(id.email);
  var lvl = levelFor(t.points);
  return gJson({
    ok: true, email: id.email, handle: getHandle(id.email, id.name),
    combinedPoints: t.points, combinedReports: t.reports,
    level: lvl.level, nextLevel: lvl.next, nextLevelAt: lvl.nextAt,
    /* The ladder itself, so the page can name the level for the number it is ACTUALLY showing.
       Without it the chip showed combined points beside the level from ?myStats=, which is
       computed from one tool's points alone -- the reason βJump said "Contributor" (>=100 there)
       while every other tool said "Novice" on the same account. The points are pooled; the rank
       has to be pooled with them or the two numbers on one chip contradict each other. */
    levels: LEVELS,
    perDataset: t.perDataset,
    updated: t.updated,                      // ISO stamp; the UI can show "as of ..."
    datasets: (function () { var m = {}; for (var k in DATASETS) m[k] = DATASETS[k].label; return m; })()
  });
}

/* ---------- 4. The same numbers, for everybody ------------------------------------------
   Søren, 2026-09-09: "I would like to make an overall leaderboard for the index page. That
   leaderboard should have the collective points from all the different tools, and there should be
   an indication of what tools the different users have reported in."

   Deliberately NOT a change to ?leaderboard=, which is per-dataset and stays that way: the eight
   in-tool dashboards each want their own volume's board, and pooling them there would answer a
   question nobody asked while standing inside one dataset. This is the home page's question --
   who has contributed most, anywhere -- and it is a different one.

   PUBLIC, with the same contract the per-dataset board already keeps: email is read but never
   returned. Only the handle, the totals, and which datasets the person has points in.

   Costs ONE sheet read. profileTotalsFor() walks the whole sheet to find one email; this walks it
   once and keeps everybody, which is cheaper than the eight aggregateAll() calls the per-dataset
   board would need to be pooled by hand.

   THE NAME FALLBACK, because it is a real limitation and not an oversight: "Profile totals" has
   no name column (see PROFILE_TOTALS_HEADERS), and getHandle(email, "") resolves to "anonymous"
   for anybody who has not set a handle. So names are borrowed from aggregateAllCached() -- the
   REQUEST'S dataset, whichever that is, which does carry them. Somebody with no handle and no row
   in that dataset shows as "anonymous", which is exactly what they show as on the per-dataset
   board today. Setting a display name in any tool's dashboard fixes it everywhere at once. */
function combinedLeaderboardEndpoint(e) {
  var sh = profileTotalsSheet_();
  var out = { ok: true, updated: null, leaderboard: [],
              datasets: (function () { var m = {}; for (var k in DATASETS) m[k] = DATASETS[k].label; return m; })() };
  if (sh.getLastRow() < 2) return gJson(out);

  /* Names, best effort -- see the header. Never fatal: a board with handles and "anonymous" is
     worth far more than no board because one aggregate threw. */
  var names = {};
  try {
    var agg = aggregateAllCached();
    for (var em in agg) names[String(em).toLowerCase()] = agg[em].name || "";
  } catch (err) { names = {}; }

  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, PROFILE_TOTALS_HEADERS.length).getValues();
  var byEmail = {};
  for (var i = 0; i < vals.length; i++) {
    var email = String(vals[i][0] || "").toLowerCase();
    if (!email) continue;
    var ds = String(vals[i][1] || "");
    var pts = Number(vals[i][2]) || 0, reps = Number(vals[i][3]) || 0;
    var u = byEmail[email] || (byEmail[email] = { points: 0, reports: 0, per: {}, order: [] });
    u.points += pts;
    u.reports += reps;
    /* POINTS OR REPORTS -- see the same fix in index.html's pooling fallback. A dataset row
       exists for anybody the rebuild saw, and a row with points but no reports is still a tool the
       person has worked in: χJump and ωJump earn points through their own state stores and report
       zero "reports" (measured 2026-09-09: 570.3/0 and 1987/0), so a reports-only gate would hide
       exactly those two the moment this endpoint went live. */
    if (ds && (reps > 0 || pts > 0)) {
      if (!u.per.hasOwnProperty(ds)) u.order.push(ds);
      u.per[ds] = (u.per[ds] || 0) + pts;
    }
    if (vals[i][10]) out.updated = vals[i][10];
  }

  var arr = [];
  for (var em2 in byEmail) {
    var v = byEmail[em2];
    arr.push({ email: em2, points: v.points, reports: v.reports, per: v.per, order: v.order });
  }
  arr.sort(function (a, b) { return b.points - a.points || b.reports - a.reports; });

  /* Twenty-five rather than the in-tool board's ten: this is the only board that covers everybody,
     and a home page has room for it. */
  out.leaderboard = arr.slice(0, 25).map(function (u) {
    /* The tool letters are ordered by that person's points in each, most first -- so the letters
       read as "where this person works", not as the order the sheet happened to be in. */
    var dsList = u.order.slice().sort(function (a, b) { return (u.per[b] || 0) - (u.per[a] || 0); });
    return { handle: getHandle(u.email, names[u.email] || ""),
             points: Math.round(u.points * 100) / 100,
             reports: u.reports,
             datasets: dsList,
             perDataset: u.per };
  });
  return gJson(out);
}
