"""The pooled board is remembered, because eight Apps Script calls are slow.         2026-09-09

MEASURED against the live deployment, from a browser:

    4 per-tool boards, in parallel   ->  10.3 s
    8 per-tool boards, in parallel   ->  over 45 s (blew the tool's budget, twice)
    8 sequential                     ->  over 45 s

Apps Script serialises requests from one user, so firing all eight at once buys much less than it
looks like it should. The fallback pooling added minutes ago is therefore CORRECT and SLOW: the
board fills in progressively, which is far better than a dead spinner, but the last name can land
half a minute after the page does.

So the pooled result is kept in localStorage and drawn IMMEDIATELY on every visit after the first,
while the fetches run again behind it and redraw when they land. First visit: names arrive over
~20-40 s, as before. Every visit after that: instant, with a line saying how old the numbers are.

Six hours is the staleness limit, chosen against the thing being cached rather than by feel: the
real endpoint's own numbers are a four-hourly snapshot, so a pooled board more than six hours old
is stale by the standard the feature itself sets. Past that it is dropped rather than shown.

Every read and write is wrapped: a private window, a browser with site data blocked, or a full
quota all throw here, and none of them should cost the board. The cache is a convenience, never a
source -- the network result always wins and always overwrites.

None of this runs once the combined endpoint is deployed. That path is one call, and one call
needs no cache.

Run: python3 src/the_pooled_board_is_remembered.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAIRS = [
    ('''  function lbPoolPerTool(){
    var keys=[];for(var k in TOOLS)keys.push(k);
    var by={},done=0,got=0;''',
     '''  /* ── the pooled board, remembered ─────────────────────────────────────────────────────────
     Measured against the live deployment: four of these boards in parallel take 10.3 s and eight
     take over 45. Apps Script serialises one user's requests, so parallelism buys less than it
     looks like it should, and the last name can land half a minute after the page does.

     So the pooled rows are kept and redrawn instantly on the next visit while the fetches run
     again behind them. Six hours, because the endpoint this stands in for recomputes every four
     -- past that these numbers are stale by the feature's own standard and are dropped rather
     than shown. Every access is wrapped: a private window, blocked site data or a full quota all
     throw, and none of them should cost the board. The cache never wins over the network. */
  var LB_CACHE_KEY="grubblab_lb_pooled_v1",LB_CACHE_MAX_MS=6*60*60*1000;
  function lbCacheRead(){
    try{
      var raw=localStorage.getItem(LB_CACHE_KEY);
      if(!raw)return null;
      var d=JSON.parse(raw);
      if(!d||!d.t||!d.rows||!d.rows.length)return null;
      if(Date.now()-d.t>LB_CACHE_MAX_MS)return null;
      return d;
    }catch(_e){return null;}
  }
  function lbCacheWrite(rows){
    try{localStorage.setItem(LB_CACHE_KEY,JSON.stringify({t:Date.now(),rows:rows}));}catch(_e){}
  }
  function lbAgo(ms){
    var m=Math.round((Date.now()-ms)/60000);
    if(m<2)return "just now";
    if(m<60)return m+" minutes ago";
    var h=Math.round(m/60);
    return h===1?"an hour ago":(h+" hours ago");
  }
  function lbPoolPerTool(){
    var keys=[];for(var k in TOOLS)keys.push(k);
    var by={},done=0,got=0;
    /* Drawn before a single request goes out, so a returning visitor sees the board rather than
       "Adding up the tools…" for half a minute. Overwritten the moment real rows arrive. */
    var cached=lbCacheRead();
    if(cached)lbDraw(cached.rows,"Pooled from each tool\\u2019s own top-ten board, as of "
      +lbAgo(cached.t)+". Refreshing\\u2026");''',
     "the pooled rows are cached and drawn first"),

    ('''      if(!rows.length){
        if(final)lbSay(got?"No contributions yet \\u2014 open any tool and identify a cell."
                          :"Could not reach the server, so the leaderboard could not be loaded.");
        return;
      }''',
     '''      if(!rows.length){
        /* Nothing of our own yet. A cached board is still on screen and still true-as-of; wiping
           it for a spinner, or for "could not reach the server" while eight requests are still in
           flight, would be a strictly worse thing to look at. */
        if(cached&&!final)return;
        if(final&&!got&&cached)return;
        if(final)lbSay(got?"No contributions yet \\u2014 open any tool and identify a cell."
                          :"Could not reach the server, so the leaderboard could not be loaded.");
        return;
      }
      if(final)lbCacheWrite(rows);''',
     "a cached board is not wiped for a spinner"),
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


edit("index.html", PAIRS)
print("\nnow: node indexboardcheck.js")
