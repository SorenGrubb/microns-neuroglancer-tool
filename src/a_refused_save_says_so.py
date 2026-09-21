# -*- coding: utf-8 -*-
u"""A save that did not go through says so, on every tool.                               2026-09-21

Søren: "Start with 1 and 2" --

  1. SIGNED OUT, NOTHING SAID. core/bulkorgan.js, core/panel.js (the organelle form) and
     core/tracingcard.js all ask reportGateBlock() before they send, and only µJump and ωJump
     define it. Everywhere else the question was skipped:
       - λJump, βJump and ηJump answer a post with a PROMISE of {ok, error}. The bulk card counted
         anything but `false` as sent, so a refused row -- signed out, a lapsed token, or the
         backend saying no -- was "Thanks, 3 structures logged".
       - The tracing card marked a tracing shared the moment the promise existed, so a refusal
         left it off the queue that would have sent it after signing in: kept on the page, never in
         the dataset, and listed as if it were.

     Now:
       - core/tracingcard.js, loaded by every tool, defines reportGateBlock() when the page has
         none (µJump's and ωJump's own stay theirs -- a later function declaration replaces it).
         Signed out, or a token past its expiry: it offers Google's prompt and returns the reason;
         the bulk card and the organelle form alert it and send nothing.
       - core/bulkorgan.js waits for any promise it was handed, then says what happened: all in,
         or "n of m reached the sheet" with the first reason, and Submit live again. The "Thanks"
         is not shown until it is true. ωJump's host said this itself; it now only reloads its map.
       - core/tracingcard.js puts a refused tracing back on the queue and says so.

  2. RED THAT WAS NOT RED. The shared code colours an error var(--bad). µJump, δJump, πJump, λJump,
     βJump and ηJump call their red --danger and never defined --bad, so every "nothing was sent"
     printed in the body colour. Each gets --bad as an alias of its own --danger (so it follows the
     theme), βJump also --bd (a bar in its dashboard, drawn in nothing). χJump and ωJump have the
     opposite gap and are fixed in their builds.

Run: python3 src/a_refused_save_says_so.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    p = os.path.join(HERE, rel); s = io.open(p, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s / %s: %d" % (rel, name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(p, "w", encoding="utf-8").write(s)


print("core/tracingcard.js")
edit("core/tracingcard.js", [
 (u"one sign-in gate for every tool",
  u'''var UJ = UJ || {};
''',
  u'''var UJ = UJ || {};
/* ── THE SIGN-IN GATE, FOR A PAGE THAT HAS NONE ──────────────────────────────────  2026-09-21
   core/bulkorgan.js, core/panel.js's organelle form and this card ask reportGateBlock() before
   they send anything: "" to go ahead, or the reason not to, with Google's prompt already offered.
   µJump and ωJump define their own; the other six did not, so the question was skipped and a
   signed-out submission went out to be refused. Defined HERE because this file is on every tool,
   and only when the page has not got one -- a page's own `function reportGateBlock` in a later
   script replaces this. GOOGLE_EXP is seconds on µJump and milliseconds elsewhere; both are read. */
if (typeof window !== "undefined" && typeof window.reportGateBlock !== "function"){
  window.reportGateBlock = function(){
    var cred = (typeof GOOGLE_CREDENTIAL !== "undefined") ? GOOGLE_CREDENTIAL : null;
    var ver  = (typeof GOOGLE_VERIFIED !== "undefined") ? GOOGLE_VERIFIED : false;
    var exp  = (typeof GOOGLE_EXP !== "undefined") ? Number(GOOGLE_EXP) || 0 : 0;
    var expMs = exp > 1e12 ? exp : exp * 1000;
    var expired = !!cred && expMs > 0 && Date.now() > expMs - 60000;
    if (ver && cred && !expired) return "";
    try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.prompt(); } catch (_e){}
    return expired
      ? "Your Google sign-in has expired \\u2014 they last about an hour. Sign in again with the "
        + "account button in the top-right corner, then press Submit again.\\n\\nNothing has been "
        + "sent, so your work is still here."
      : "Please sign in with Google before submitting \\u2014 use the account button in the "
        + "top-right corner, then try again.\\n\\nNothing has been sent, so your work is still here: "
        + "sign in and press Submit again.";
  };
}
'''),
 (u"a refused tracing goes back on the queue",
  u'''  if(ok===false)return false;
  t.pending_share=false;
  t.shared_at=new Date().toISOString();''',
  u'''  if(ok===false)return false;
  t.pending_share=false;
  t.shared_at=new Date().toISOString();
  /* A PROMISE IS NOT A YES, 2026-09-21. λJump, βJump, ηJump and ωJump answer with a promise of
     {ok, error}; the backend can still refuse (a token that lapsed in flight, a deployment that
     does not know the type). A refused tracing goes back on the queue it would otherwise have been
     taken off, so it is sent on the next sign-in, and the card says why it was not. */
  if(ok&&typeof ok.then==="function"){
    ok.then(function(d){
      if(!(d&&d.ok===false))return;
      t.pending_share=true; t.shared_at="";
      tracingWrite(TRACINGS_KEPT); tracingRenderList();
      tracingSay("\\u201c"+(t.name||"The tracing")+"\\u201d did NOT reach the dataset: "
        +String(d.error||"the server refused it")+" It is kept here and goes up on its own once "
        +"you are signed in.");
      tracingFlushSoon();
    },function(){});
  }'''),
])

print("core/bulkorgan.js")
edit("core/bulkorgan.js", [
 (u"the thanks waits for the answer",
  u'''  btn.disabled=true;btn.textContent="submitted";
  document.getElementById("bulkOrganThanks").innerHTML=
    '<div class="idf-flag" style="border-color:var(--accent);color:var(--accent);margin-top:10px">'
    +"Thanks \\u2014 "+posted+" structure"+(posted===1?"":"s")+" logged across "
    +Object.keys(byCell).length+" cell"+(Object.keys(byCell).length===1?"":"s")+".</div>";
  if(bulkCfg().afterSubmit){ try{ bulkCfg().afterSubmit(sent); }catch(_e){} }''',
  u'''  btn.disabled=true;btn.textContent="submitted";
  const nCells=Object.keys(byCell).length;
  const thanks=function(n){
    document.getElementById("bulkOrganThanks").innerHTML=
      '<div class="idf-flag" style="border-color:var(--accent);color:var(--accent);margin-top:10px">'
      +"Thanks \\u2014 "+n+" structure"+(n===1?"":"s")+" logged across "
      +nCells+" cell"+(nCells===1?"":"s")+".</div>";
  };
  /* A PROMISE IS NOT A YES, 2026-09-21. Where postReport answers with a promise of {ok, error}
     (λJump, βJump, ηJump, ωJump), the thanks waits for the answers, and a refusal is said -- with
     the server's own reason and Submit live again -- rather than counted. µJump's family answers
     true and reports each post in its own toast, so it is thanked at once as before. */
  const pending=sent.filter(function(x){return x&&typeof x.then==="function";});
  if(!pending.length){ thanks(posted); }
  else{
    btn.textContent="sending\\u2026";
    Promise.all(sent.map(function(x){
      if(!(x&&typeof x.then==="function"))return x===false?"not sent":"";
      return x.then(function(d){return d&&d.ok===false?String(d.error||"refused"):"";},
                    function(e){return String(e&&e.message||e||"could not reach the server");});
    })).then(function(errs){
      const bad=errs.filter(Boolean);
      if(!bad.length){ btn.textContent="submitted"; thanks(errs.length); return; }
      btn.disabled=false; btn.textContent="Submit";
      document.getElementById("bulkOrganThanks").innerHTML=
        '<div class="idf-flag" style="margin-top:10px;color:var(--bad)">'
        +(errs.length-bad.length)+" of "+errs.length+" reached the sheet; "+bad.length
        +" did not \\u2014 "+escHtml(bad[0])+" Your rows are still here: press Submit again.</div>";
    });
  }
  if(bulkCfg().afterSubmit){ try{ bulkCfg().afterSubmit(sent); }catch(_e){} }'''),
])

ALIAS = {
    "ujump.html": u":root{--bad:var(--danger)}",
    "djump.html": u":root{--bad:var(--danger)}",
    "pjump.html": u":root{--bad:var(--danger)}",
    "ljump.html": u":root{--bad:var(--danger)}",
    "bjump.html": u":root{--bad:var(--danger);--bd:var(--line)}",
    "hjump.html": u":root{--bad:var(--danger)}",
}
for page, rule in ALIAS.items():
    print(page)
    s = io.open(os.path.join(HERE, page), encoding="utf-8").read()
    i = s.index(u":root{--bg:")
    line_end = s.index(u"\n", i) + 1
    edit(page, [(u"the error colour the shared code uses",
                 s[i:line_end],
                 s[i:line_end]
                 + u"/* The shared code colours an error var(--bad); this page's red is --danger. An alias, so it\n"
                   u"   follows the theme. 2026-09-21 -- until then every refusal printed in the body colour. */\n"
                 + rule + u"\n")])
