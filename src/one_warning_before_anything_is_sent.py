"""One warning, before anything is sent.                                              2026-09-11

Søren, after submitting three NR type II while signed out:

    "I clicked submit without being logged in, and it gave me a warning for each of the failed
     submissions and then had a greyed out button and then asked me to log in. None of them are
     saved and now I can't click submit. It should warn you BEFORE submitting anything that you are
     not logged in, so that this does not happen. Also, one warning is enough."

Three faults in one click, and they compound.

1. THE CHECK WAS INSIDE THE LOOP. postReport() tests the sign-in on every call, which is right for
   a form that posts once and wrong for one that posts a row per structure: three rows, three
   modal alerts, each one blocking until dismissed. The check belongs BEFORE the loop, where it can
   stop the whole submission instead of failing it three times.

2. THE BUTTON WAS DISABLED REGARDLESS. `btn.disabled=true; btn.textContent="submitted"` ran after
   the loop whether or not a single row went out. So the panel said "submitted" about nothing, and
   then refused to let him try again -- the one recovery (editing the link) being the last thing
   anybody would think to do. He was left signed in, with his work on screen, and no way to send
   it.

3. NOTHING TOLD HIM FIRST. The One Tap prompt appeared AFTER the three alerts, by which time the
   submission had already failed.

THE FIX

reportGateBlock() answers "can a write go out right now" in one place, offering the sign-in prompt
as it does -- the same shape as saveGateNote() beside it, which already does this for the volume
writes. Any submission that posts more than one row asks it ONCE, before the first post, and
returns without touching the button if the answer is no. Nothing is attempted, so nothing fails,
so there is nothing to warn about three times.

The button is only disabled once a post has actually gone out, and if none did it stays live with
its own label, because a button that cannot be pressed is only honest when the work is done.

AND A BACKSTOP. postReport()'s own alerts now collapse if the same one would be raised twice within
a few seconds. The gate above means no loop in this file should ever reach them, but "should" is
not a guarantee, and a wall of modal alerts is a bad way to find out about a new one.

SCOPE, stated rather than glossed: the gate and the backstop are µJump's. core/panel.js's own
organelle form -- shared with every other tool -- now asks for the gate too, but only when the page
has one, so the other tools keep today's behaviour until they get their own postReport hardened.
That is a real remaining gap and it is a separate piece of work.

Run: python3 src/one_warning_before_anything_is_sent.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

GATE = [
    ('''function postReport(payload,okMsg){
  if(!REPORT_ENDPOINT){alert("Reporting isn't wired up yet — set REPORT_ENDPOINT near the top of the script (see the comment above it) to a Google Apps Script web app URL.");return false;}
  if(!GOOGLE_VERIFIED||!GOOGLE_CREDENTIAL){''',
     '''/* ── CAN A WRITE GO OUT RIGHT NOW? ───────────────────────────────────────────────  2026-09-11
   Søren: "It should warn you BEFORE submitting anything that you are not logged in... Also, one
   warning is enough, we don't need a warning for each submission."

   postReport() asks this question too, but it asks it once per call -- correct for a form that
   posts a single row, three blocking alerts for one that posts a structure per row. This is the
   same question asked ONCE, before the first post, by anything that posts more than one thing.

   Returns "" when the write can go out and the sentence to show when it cannot, having already
   offered the sign-in prompt -- so the offer arrives BEFORE the failure rather than after three of
   them. Deliberately the same shape as saveGateNote() below it, which has done this for the volume
   writes since 2026-09-02; the two now differ only in their wording. */
function reportGateBlock(){
  if(!REPORT_ENDPOINT)
    return "Reporting isn't wired up yet \\u2014 this page has no backend configured.";
  if(GOOGLE_EXP&&Date.now()/1000>GOOGLE_EXP-90&&typeof handleGoogleExpiry==="function")
    handleGoogleExpiry();
  if(!GOOGLE_VERIFIED||!GOOGLE_CREDENTIAL){
    if(window.google&&google.accounts&&google.accounts.id){try{google.accounts.id.prompt();}catch(_gp){}}
    return "Please sign in with Google before submitting \\u2014 use the account button in the "
      + "top-right corner, then try again.\\n\\nNothing has been sent, so your work is still here: "
      + "sign in and press Submit again.";
  }
  return "";
}

/* The same modal twice in a row is noise, not information. The gate above means no loop in this
   file should reach postReport() unsigned at all -- but "should" is not a guarantee, and three
   stacked alerts is a poor way to discover a path that slipped through. */
var REPORT_ALERT_MSG="",REPORT_ALERT_AT=0;
function reportAlertOnce(msg){
  var now=Date.now();
  if(msg===REPORT_ALERT_MSG&&now-REPORT_ALERT_AT<5000)return;
  REPORT_ALERT_MSG=msg;REPORT_ALERT_AT=now;
  alert(msg);
}
function postReport(payload,okMsg){
  if(!REPORT_ENDPOINT){reportAlertOnce("Reporting isn't wired up yet — set REPORT_ENDPOINT near the top of the script (see the comment above it) to a Google Apps Script web app URL.");return false;}
  if(!GOOGLE_VERIFIED||!GOOGLE_CREDENTIAL){''',
     "one place decides whether a write can go out, and a repeated alert is said once"),

    ('''    if(window.google&&google.accounts&&google.accounts.id){try{google.accounts.id.prompt();}catch(_gp){}}
    alert("Please sign in with Google before submitting \\u2014 use the account button in the top-right corner, then try again.\\n\\nContributions require a verified Google account so they can be attributed.");
    return false;
  }
  if(GOOGLE_EXP&&Date.now()/1000>GOOGLE_EXP-90){handleGoogleExpiry();alert("Your Google sign-in has expired. Please sign in with Google again, then resubmit.");return false;}''',
     '''    if(window.google&&google.accounts&&google.accounts.id){try{google.accounts.id.prompt();}catch(_gp){}}
    reportAlertOnce("Please sign in with Google before submitting \\u2014 use the account button in the top-right corner, then try again.\\n\\nContributions require a verified Google account so they can be attributed.");
    return false;
  }
  if(GOOGLE_EXP&&Date.now()/1000>GOOGLE_EXP-90){handleGoogleExpiry();reportAlertOnce("Your Google sign-in has expired. Please sign in with Google again, then resubmit.");return false;}''',
     "...including the two sign-in alerts that stacked three deep"),
]

BULK = [
    ('''function bulkOrganSubmit(){
  const btn=document.getElementById("bulkOrganSubmit");''',
     '''function bulkOrganSubmit(){
  const btn=document.getElementById("bulkOrganSubmit");
  /* ── ASK ONCE, BEFORE ANYTHING IS SENT ──────────────────────────────────────────  2026-09-11
     This used to walk straight into the posting loop, so a signed-out submission raised one modal
     per structure and then disabled the button anyway. Nothing is attempted until the gate says
     the write can go out, and the button is left exactly as it was -- his rows are still on
     screen, and pressing Submit again after signing in is all that is needed. */
  if(typeof reportGateBlock==="function"){
    const blocked=reportGateBlock();
    if(blocked){alert(blocked);return;}
  }''',
     "the bulk panel checks the sign-in once, before the first post"),

    ('''  btn.disabled=true;btn.textContent="submitted";
  document.getElementById("bulkOrganThanks").innerHTML=
    '<div class="idf-flag" style="border-color:var(--accent);color:var(--accent);margin-top:10px">'
    +"Thanks \\u2014 "+posted+" structure"+(posted===1?"":"s")+" logged across "
    +Object.keys(byCell).length+" cell"+(Object.keys(byCell).length===1?"":"s")+".</div>";''',
     '''  /* A button that cannot be pressed is only honest once the work is actually done. If nothing
     went out, say so and leave it live rather than reporting a submission that did not happen. */
  if(!posted){
    btn.disabled=false;btn.textContent="Submit";
    document.getElementById("bulkOrganThanks").innerHTML=
      '<div class="idf-flag" style="margin-top:10px">Nothing was sent \\u2014 your rows are still '
      +'here. Try Submit again.</div>';
    return;
  }
  btn.disabled=true;btn.textContent="submitted";
  document.getElementById("bulkOrganThanks").innerHTML=
    '<div class="idf-flag" style="border-color:var(--accent);color:var(--accent);margin-top:10px">'
    +"Thanks \\u2014 "+posted+" structure"+(posted===1?"":"s")+" logged across "
    +Object.keys(byCell).length+" cell"+(Object.keys(byCell).length===1?"":"s")+".</div>";''',
     "a submission that sent nothing does not claim to have sent something"),

    ('''    rows.forEach(function(r,si){
      posted++;
      postReport({''',
     '''    rows.forEach(function(r,si){
      /* Counts what actually WENT OUT, not what was attempted -- which is the difference between
         "3 structures logged" and a green message about nothing. */
      if(postReport({''',
     "the count is of rows that went out, not rows tried"),

    ('''        identified:"",comment:comment,path:"bulk paste"
      });
    });
  });''',
     '''        identified:"",comment:comment,path:"bulk paste"
      })!==false)posted++;
    });
  });''',
     "...closing the same statement"),
]

RECOVER = [
    ('''  /* Re-arm after a submission so a second paste works without a reload. */
  document.getElementById("bulkOrganLink").addEventListener("input",function(){
    const b=document.getElementById("bulkOrganSubmit");
    if(b.disabled){b.disabled=false;b.textContent="Submit";}
  });''',
     '''  /* Re-arm after a submission so a second paste works without a reload. Editing the link was the
     only way back in until 2026-09-11, which is no help at all to somebody whose submission was
     refused with the link still correct -- "Find the cells" re-arms it too, and a refused
     submission no longer disables it in the first place. */
  const rearm=function(){
    const b=document.getElementById("bulkOrganSubmit");
    if(b.disabled){b.disabled=false;b.textContent="Submit";}
  };
  document.getElementById("bulkOrganLink").addEventListener("input",rearm);
  document.getElementById("bulkOrganKind").addEventListener("change",rearm);
  document.getElementById("bulkOrganResolve").addEventListener("click",rearm);''',
     "there is more than one way back to a live Submit button"),
]

PANEL = [
    ('''    const groupId=(ID_CTX.nucId||"nonuc")+"_"+Date.now()+"_org";
    submitBtn.disabled=true;submitBtn.textContent="submitting…";''',
     '''    /* One question, before the first post. This form posts a row PER STRUCTURE, so without this
       a signed-out submission raises one modal per row and then disables the button anyway -- the
       exact thing Søren hit in the bulk panel on 2026-09-11. Asked of the page rather than
       assumed: µJump defines reportGateBlock(); the other tools sharing this file do not yet, and
       keep their existing per-call behaviour until their own postReport is hardened. */
    if(typeof reportGateBlock==="function"){
      const blocked=reportGateBlock();
      if(blocked){alert(blocked);return;}
    }
    const groupId=(ID_CTX.nucId||"nonuc")+"_"+Date.now()+"_org";
    submitBtn.disabled=true;submitBtn.textContent="submitting…";''',
     "the single-cell organelle form asks the same question once"),
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


edit("ujump.html", GATE + BULK + RECOVER)
edit("core/panel.js", PANEL)
print("\nnow: node signingatecheck.js   and   node bulkorgancheck.js")
