"""One leaderboard across every tool, and a menu on the home page.                   2026-09-09

Søren: *"I would like to make an overall leaderboard for the index page. That leaderboard should
have the collective points from all the different tools, and there should be an indication of what
tools the different users have reported in. That should be the greek letter of the tool of course
in the color of the tool. It should come just after the wJump, so after all the tools. I think it is
about time we have a menu for the index page also and some headlines for the different sections."*

WHAT ALREADY EXISTED, and what did not.

  ?leaderboard=1        public, top 10 -- but scoped to ONE dataset by the &ds= every gamify read
                        carries. Eight boards, one per tool.
  ?profileTotals=<cred> cross-tool -- but filtered to the signed-in caller's own email.

So the numbers he wants are already materialised, in the "Profile totals" sheet (one row per email
per dataset, rebuilt every four hours), and there was no way to read them for anybody but yourself.
This adds the missing third shape: PUBLIC, and ACROSS DATASETS.

    ?combinedLeaderboard=1  ->  {ok, updated, datasets:{ds:label},
                                 leaderboard:[{handle, points, reports, datasets:[ds…],
                                               perDataset:{ds:points}}]}

Email never leaves the server, exactly as the per-dataset board already guarantees -- only the
handle. `datasets` is the list the home page draws its Greek letters from.

THE NAME PROBLEM, said plainly rather than papered over. "Profile totals" stores email and dataset
and no display name, and getHandle(email,"") falls back to "anonymous" for anybody who has not set
a handle in their dashboard. So the fallback name is taken from aggregateAllCached() -- the current
dataset's aggregate, which does carry names -- and users with neither a handle nor a row in that
dataset show as "anonymous", which is what they already show as everywhere else.

Run: python3 src/one_leaderboard_across_every_tool.py

  Both files here are the Apps Script deployment: editing them changes nothing on the site until
  the script is redeployed. The page's fetch degrades to a quiet "not available yet" until it is.
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DOGET = [
    ('''  if(e.parameter.leaderboard){''',
     '''  /* PUBLIC AND ACROSS EVERY TOOL, added 2026-09-09 for the home page. The board below it is
     per-dataset (every gamify read appends &ds=), and ?profileTotals= is cross-tool but filtered
     to the caller's own email -- so a "who has contributed most, anywhere" board had no endpoint
     at all until now. Reads the same materialised "Profile totals" sheet ?profileTotals= reads,
     so the two can never disagree, and costs one sheet read rather than eight aggregates. */
  if(e.parameter.combinedLeaderboard){
    return combinedLeaderboardEndpoint(e);
  }
  if(e.parameter.leaderboard){''',
     "doGet answers ?combinedLeaderboard=1"),
]

DATASETS_GS = [
    ('''    datasets: (function () { var m = {}; for (var k in DATASETS) m[k] = DATASETS[k].label; return m; })()
  });
}''',
     '''    datasets: (function () { var m = {}; for (var k in DATASETS) m[k] = DATASETS[k].label; return m; })()
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
    /* A dataset row exists for anybody the rebuild saw; a row with no reports in it is not a tool
       the person has "reported in", and drawing its letter would claim they had. */
    if (ds && reps > 0) {
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
}''',
     "the combined leaderboard endpoint"),
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


edit("backend/Code.gs", DOGET)
edit("backend/Datasets.gs", DATASETS_GS)
print("\nRedeploy the Apps Script for this to go live.")
