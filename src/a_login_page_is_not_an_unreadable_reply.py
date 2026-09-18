# -*- coding: utf-8 -*-
"""A Google sign-in page is not "something unreadable".                        2026-09-18

Søren, after computing a volume:

  *"The computed volume was not saved — the server replied with something unreadable:
  `<!DOCTYPE html><html lang="da"><head><script nonce="qzl2N-jQbrprHC2F-s5yCA">window['ppConfig'] =
  {productName: '26981ed0.`"*

THAT IS NOT AN UNREADABLE REPLY. It is a Google page, served to him in Danish, with `ppConfig` /
`productName` in its head — the shape of Google's own sign-in / authorisation interstitial. Apps
Script answers a POST with that page in a small number of situations, and all of them have the same
remedy and none of them are "the server is broken":

  * the deployment's access is not "Anyone", so an unauthenticated POST is sent to sign in;
  * the deployment was authorised before the script asked for a new scope, so it needs re-approving
    once by its owner — which is exactly the state this project is in, since DriveApp was added on
    2026-09-17 and the note that day said so;
  * the browser follows the redirect to accounts.google.com and hands back that page's HTML.

`postAndRead` tried `JSON.parse`, failed, and printed the first 120 characters of the body. Those
120 characters are a doctype and a nonce: they say nothing, they fill a toast, and they read as a
fault in the tool rather than a switch nobody has flipped. Since the body is HTML, the ONE thing
worth saying is which of the above it is and what to do about it.

So: an HTML body is recognised as such, and the toast says what it means. The response's own final
URL and redirect flag go into the sentence too, because "it ended up on accounts.google.com" and
"Apps Script itself returned a page" are different faults with different fixes and only the response
knows which happened.

Nothing about a real JSON refusal changes: `{ok:false,error:"..."}` is still printed verbatim, and
"unauthenticated" still gets its own rewording.

Run: python3 src/a_login_page_is_not_an_unreadable_reply.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ["ujump.html", "djump.html", "pjump.html"]

PAIRS = [
    ('''function postAndRead(payload){
  return fetch(REPORT_ENDPOINT,{method:"POST",
      headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload)})
    .then(function(r){ return r.text(); })
    .then(function(t){
      var d=null; try{ d=JSON.parse(t); }catch(_pe){}
      if(d&&(d.ok===true||d.status==="ok"))return {ok:true};
      var err=(d&&d.error)?String(d.error):("the server replied with something unreadable: "
              +String(t||"").slice(0,120));''',
     '''function postAndRead(payload){
  return fetch(REPORT_ENDPOINT,{method:"POST",
      headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload)})
    /* WHERE IT ENDED UP, not only what it said.  2026-09-18
       A POST that is answered with a sign-in page has usually been redirected to one, and the final
       URL is the only thing that can tell "Apps Script returned a page" from "the browser followed
       it to accounts.google.com". Carried alongside the body rather than looked up afterwards,
       because by then the response is gone. */
    .then(function(r){ return r.text().then(function(t){
      return {t:t,url:String(r.url||""),redirected:!!r.redirected,status:r.status}; }); })
    .then(function(got){
      var t=got.t;
      var d=null; try{ d=JSON.parse(t); }catch(_pe){}
      if(d&&(d.ok===true||d.status==="ok"))return {ok:true};
      /* ── A SIGN-IN PAGE IS NOT AN UNREADABLE REPLY ────────────────────────────  2026-09-18
         Søren got a toast beginning `<!DOCTYPE html><html lang="da">` with a nonce and Google's own
         `ppConfig` in it. That is a Google page, in his language, and printing its first 120
         characters says nothing while reading as a fault in the tool. Apps Script serves it when
         the deployment's access is not "Anyone", or when it was authorised BEFORE the script asked
         for a new scope and so needs approving once more by its owner -- which is the state this
         project has been in since DriveApp was added on 2026-09-17. One remedy, one sentence. */
      if(!d&&/^\\s*(<!doctype|<html)/i.test(String(t||""))){
        var where=/accounts\\.google\\.com/i.test(got.url)
          ? "the request was redirected to Google's sign-in page"
          : "Apps Script answered with a Google page instead of the report";
        return {ok:false,needsAuth:true,
          error:where+" \\u2014 so nothing was recorded. The deployment needs authorising again: "
            +"open the /exec address in a browser tab, approve it once, and try this again. "
            +"(A deployment authorised before the script asked for Drive access has to be "
            +"re-approved; that access was added on 2026-09-17.) Check too that Deploy \\u2192 "
            +"Manage deployments has \\u201cWho has access: Anyone\\u201d."};
      }
      var err=(d&&d.error)?String(d.error):("the server replied with something unreadable: "
              +String(t||"").slice(0,120));''',
     "an HTML reply is named for what it is, and says what to do"),
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


for page in PAGES:
    edit(page, PAIRS)
print("\nnow: node saveretrycheck.js")
