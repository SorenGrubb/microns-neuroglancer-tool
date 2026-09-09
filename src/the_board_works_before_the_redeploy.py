"""The board works before the redeploy.                                              2026-09-09

Søren's screenshot: "The combined leaderboard is not available from the server yet."

MEASURED, rather than assumed. The live deployment, asked directly:

    ?combinedLeaderboard=1   ->  {"reports":[],"mergedGroups":[],"notNucleusReports":[],
                                  "organelleGroups":[]}      <- doGet's fallback: it has never
                                                                heard of the parameter
    ?leaderboard=1&ds=ujump  ->  {"leaderboard":[
                                    {"handle":"Søren Grubb","points":1471.1,"reports":250},
                                    {"handle":"Hesham","points":369.3,"reports":125},
                                    {"handle":"Gary","points":201.9,"reports":87},
                                    {"handle":"rukaya","points":104,"reports":40}]}
    ...&ds=pjump             ->  Søren Grubb, 70.7 / 15
    ...&ds=ljump             ->  Søren Grubb, 55 / 4

So the message is correct and the page is behaving exactly as designed -- and the design was wrong
about one thing: it made a leaderboard he asked for today wait on a deployment step. Every number
it needs is ALREADY SERVED, eight times over, one board per dataset, publicly, right now.

So the page tries the good endpoint first and falls back to pooling the eight per-tool boards
itself. When the Apps Script is redeployed the first path starts answering and the fallback stops
running, with no further edit.

WHAT THE FALLBACK COSTS, and it says so on screen rather than in this file only:

  * Each per-tool board is a TOP TEN. Somebody eleventh in every tool is invisible to it. The real
    endpoint reads the Profile totals sheet and has no such horizon.
  * It pools by HANDLE, because a handle is all the per-dataset board returns -- email never leaves
    the server, which is the right call and also means two people who chose the same display name
    would be added together here. The real endpoint pools by email and cannot.
  * Eight Apps Script calls. Measured in a browser against the live deployment: four in parallel
    took 10.3 s, and eight sequential blew a 45-second budget. So they go out in parallel AND the
    board is redrawn as each one lands -- names appear after a second or two and settle, rather
    than twenty seconds of "Loading…". A tool that fails is skipped; the others still count.

The colours, the letters, the escaping and the ordering are the same code either way -- the render
was pulled out into one function so the two paths cannot draw different boards.

Run: python3 src/the_board_works_before_the_redeploy.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

OLD = '''  (function loadCombinedLeaderboard(){
    var el=document.getElementById("lbAll");
    if(!el)return;
    fetch(LB_ENDPOINT+"?combinedLeaderboard=1").then(function(r){return r.json();}).then(function(d){
      var rows=(d&&d.leaderboard)||null;
      /* THREE OUTCOMES, THREE SENTENCES. An old deployment answers without a leaderboard array at
         all -- that is not the same as an empty board, and saying "no entries yet" for it would
         send somebody looking for contributors instead of for a redeploy. */
      if(!rows){lbSay("The combined leaderboard is not available from the server yet.");return;}
      if(!rows.length){lbSay("No contributions yet \\u2014 open any tool and identify a cell.");return;}
      el.innerHTML=rows.map(function(u,i){
        var letters=(u.datasets||[]).map(function(ds){
          var t=TOOLS[ds];
          if(!t)return "";
          var pts=(u.perDataset&&u.perDataset[ds])?" \\u2014 "+lbNum(u.perDataset[ds])+" points here":"";
          return '<a class="tl-'+lbEsc(ds)+'" href="'+t.href+'" title="'+lbEsc(t.name+pts)+'">'
                +t.ch+'</a>';
        }).join("");
        return '<div class="lbrow">'
          +'<span class="lbrank">'+(i+1)+'.</span>'
          +'<span class="lbname">'+lbEsc(u.handle||"anonymous")+'</span>'
          +'<span class="lbnum">'+lbNum(u.points)+' points \\u00b7 '+lbNum(u.reports)+' reports</span>'
          +(letters?'<span class="lbtools">'+letters+'</span>':'')
          +'</div>';
      }).join("");
      var note=document.getElementById("lbAllNote");
      /* The totals are a four-hourly snapshot, not live, and a board that looks live while being
         four hours old is the kind of thing somebody argues with. */
      if(note)note.textContent=d.updated
        ? ("Totals recomputed every four hours \\u2014 last on "+String(d.updated).slice(0,16).replace("T"," ")+" UTC.")
        : "Totals are recomputed every four hours.";
    }).catch(function(){
      lbSay("Could not reach the server, so the leaderboard could not be loaded.");
    });
  })();'''

NEW = '''  /* ONE RENDERER, TWO SOURCES. The board can be built from the combined endpoint or pooled from
     the eight per-tool boards (see below), and the two must not be able to draw different-looking
     boards -- so the drawing lives here and each loader only supplies rows. */
  function lbDraw(rows,note){
    var el=document.getElementById("lbAll");
    if(!el)return;
    el.innerHTML=rows.map(function(u,i){
      var letters=(u.datasets||[]).map(function(ds){
        var t=TOOLS[ds];
        if(!t)return "";
        var pts=(u.perDataset&&u.perDataset[ds])?" \\u2014 "+lbNum(u.perDataset[ds])+" points here":"";
        return '<a class="tl-'+lbEsc(ds)+'" href="'+t.href+'" title="'+lbEsc(t.name+pts)+'">'
              +t.ch+'</a>';
      }).join("");
      return '<div class="lbrow">'
        +'<span class="lbrank">'+(i+1)+'.</span>'
        +'<span class="lbname">'+lbEsc(u.handle||"anonymous")+'</span>'
        +'<span class="lbnum">'+lbNum(u.points)+' points \\u00b7 '+lbNum(u.reports)+' reports</span>'
        +(letters?'<span class="lbtools">'+letters+'</span>':'')
        +'</div>';
    }).join("");
    var n=document.getElementById("lbAllNote");
    if(n)n.textContent=note||"";
  }
  /* ── the fallback: pool the eight boards this deployment already serves ───────────────────
     Søren, 2026-09-09, on seeing "not available from the server yet": every number this section
     wants is ALREADY public, eight times over, one board per dataset. Making a leaderboard he
     asked for today wait on a redeploy was the wrong trade, so the page does the pooling itself
     until the combined endpoint answers, and then stops.

     THREE HONEST LIMITS, all of them on screen rather than only in the generator:
       - each per-tool board is a TOP TEN, so somebody eleventh everywhere is invisible here;
       - it pools by HANDLE, because that is all the per-dataset board returns (email never leaves
         the server, which is right) -- so two people who chose the same display name merge;
       - eight Apps Script calls. Measured against the live deployment: four in parallel took
         10.3 s. So they go out together and the board is REDRAWN as each lands -- names appear
         after a second or two and settle, rather than twenty seconds of a spinner. */
  function lbPoolPerTool(){
    var keys=[];for(var k in TOOLS)keys.push(k);
    var by={},done=0,got=0;
    function paint(final){
      var rows=[];
      for(var h in by)rows.push(by[h]);
      rows.sort(function(a,b){return b.points-a.points||b.reports-a.reports;});
      rows.forEach(function(r){
        r.datasets.sort(function(a,b){return (r.perDataset[b]||0)-(r.perDataset[a]||0);});
      });
      if(!rows.length){
        if(final)lbSay(got?"No contributions yet \\u2014 open any tool and identify a cell."
                          :"Could not reach the server, so the leaderboard could not be loaded.");
        return;
      }
      lbDraw(rows,final
        ? "Pooled from each tool\\u2019s own top-ten board, so somebody outside the top ten "
          +"everywhere is not listed, and two people sharing a display name would be added "
          +"together. Both go away once the combined board is deployed."
        : "Adding up the tools\\u2026 ("+done+" of "+keys.length+")");
    }
    keys.forEach(function(ds){
      fetch(LB_ENDPOINT+"?leaderboard=1&ds="+encodeURIComponent(ds))
        .then(function(r){return r.json();})
        .then(function(j){
          got++;
          ((j&&j.leaderboard)||[]).forEach(function(u){
            var h=String(u.handle||"anonymous");
            var e=by[h]||(by[h]={handle:h,points:0,reports:0,perDataset:{},datasets:[]});
            var p=Number(u.points)||0,rep=Number(u.reports)||0;
            e.points+=p;e.reports+=rep;
            /* A tool where somebody has points but no reports (a computed volume, say) is not one
               they have "reported in", and drawing its letter would claim they had. */
            if(rep>0){
              if(!e.perDataset.hasOwnProperty(ds))e.datasets.push(ds);
              e.perDataset[ds]=(e.perDataset[ds]||0)+p;
            }
          });
        })
        .catch(function(){})   /* one tool down is not the board down */
        .then(function(){ done++; paint(done===keys.length); });
    });
  }
  (function loadCombinedLeaderboard(){
    var el=document.getElementById("lbAll");
    if(!el)return;
    fetch(LB_ENDPOINT+"?combinedLeaderboard=1").then(function(r){return r.json();}).then(function(d){
      var rows=(d&&d.leaderboard)||null;
      /* An old deployment answers doGet's fallback -- {"reports":[],"mergedGroups":[],...}, no
         leaderboard key at all. Measured, 2026-09-09. That is not an empty board and must not be
         treated as one: it means the pooling path below, not "nobody has contributed". */
      if(!rows){lbPoolPerTool();return;}
      if(!rows.length){lbSay("No contributions yet \\u2014 open any tool and identify a cell.");return;}
      /* The totals are a four-hourly snapshot, not live, and a board that looks live while being
         four hours old is the kind of thing somebody argues with. */
      lbDraw(rows,d.updated
        ? ("Totals recomputed every four hours \\u2014 last on "+String(d.updated).slice(0,16).replace("T"," ")+" UTC.")
        : "Totals are recomputed every four hours.");
    }).catch(function(){
      /* Not necessarily dead: the combined call can fail on its own. Try the eight; if they are
         unreachable too, paint() says so. */
      lbPoolPerTool();
    });
  })();'''


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


edit("index.html", [(OLD, NEW, "the board pools the eight tools until the endpoint exists")])
print("\nnow: node indexboardcheck.js")
