# -*- coding: utf-8 -*-
u"""An HTML reply from Apps Script says WHICH Google page it got.                        2026-09-23

Søren, with a screenshot of Hesham's toast: "The outlined organelle's centre was not saved -- Apps
Script answered with a Google page instead of the report -- so nothing was recorded. The deployment
needs authorising again..."

THAT SENTENCE IS PROBABLY WRONG HERE, and it is mine. Two facts from the same afternoon do not fit
it:

  - Hesham's 18 tracing rows LANDED, with Drive file ids and working links (DriveApp ran, so the
    deployment's Drive access is granted and current);
  - every POST on these pages reads its reply -- no-cors went in 2026-09-04 -- so the tracings were
    confirmed by the server, not assumed.

An unauthorised deployment does not write eighteen rows and create eighteen Drive files for the same
user minutes earlier. So the far likelier cause is the OTHER thing Apps Script answers with HTML: a
script that THREW. And the remedy for that is the redeploy this project has been carrying for days,
not a re-authorisation -- a different button, in a different menu.

THE DIAGNOSIS SPLITS THREE WAYS NOW, on what the HTML actually is:

  a sign-in page   (ServiceLogin, accounts.google.com, "Sign in", data-initial-setup-data)
      -> the deployment is not reachable as "Anyone", or it needs approving again
  an error page    (Exception, "Script function not found", TypeError, ReferenceError,
                    "errorMessage", "exceeded maximum execution time")
      -> the script ran and threw. Redeploy: Deploy -> Manage deployments -> edit -> New version.
         A deployment older than the page is the usual reason, and this one is older than
         2026-09-19.
  neither          -> say both, and say which is likelier given that other writes are landing

AND IT SAYS WHAT IT SAW. The old message asserted a cause; this one names the evidence it matched
on, so the next person to read it can disagree with it.

THE EVIDENCE IS WORTH KEEPING, which is why the first 200 characters of the reply go into the
console. The toast stays one sentence; the thing that identifies the page goes where it can be
looked at.

Check: htmlreplycheck.js.
Run: python3 src/an_html_reply_says_which_html_it_is.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

OLD = u'''      if(!d&&/^\\s*(<!doctype|<html)/i.test(String(t||""))){
        var where=/accounts\\.google\\.com/i.test(got.url)
          ? "the request was redirected to Google's sign-in page"
          : "Apps Script answered with a Google page instead of the report";
        return {ok:false,needsAuth:true,
          error:where+" \\u2014 so nothing was recorded. The deployment needs authorising again: "
            +"open the /exec address in a browser tab, approve it once, and try this again. "
            +"(A deployment authorised before the script asked for Drive access has to be "
            +"re-approved; that access was added on 2026-09-17.) Check too that Deploy \\u2192 "
            +"Manage deployments has \\u201cWho has access: Anyone\\u201d."};
      }'''

NEW = u'''      if(!d&&/^\\s*(<!doctype|<html)/i.test(String(t||""))){
        /* ── WHICH GOOGLE PAGE ───────────────────────────────────────────────────  2026-09-23
           This used to assert one cause -- "the deployment needs authorising again" -- for a
           symptom with two. Hesham was sent after the wrong one: his eighteen tracing rows had
           just landed WITH their Drive files, so the deployment was authorised and Drive access
           was working. Apps Script also answers with HTML when the script THROWS, and the remedy
           for that is a redeploy, which is a different button in a different menu.
           See src/an_html_reply_says_which_html_it_is.py. */
        var body=String(t||"");
        var signIn=/accounts\\.google\\.com/i.test(got.url)
                 ||/ServiceLogin|data-initial-setup-data|signin\\/v2/i.test(body);
        var threw=/Exception|Script function not found|TypeError|ReferenceError|errorMessage|exceeded maximum execution time/i.test(body);
        /* The evidence, where it can be read and argued with. The toast stays one sentence. */
        try{ console.warn("[report] Apps Script answered with HTML ("
             +(signIn?"sign-in":threw?"error page":"unidentified")+"): "+body.slice(0,200)); }catch(_cw){}
        var why, fix;
        if(signIn&&!threw){
          why="the request was redirected to Google\\u2019s sign-in page";
          fix="The deployment is not reachable as \\u201cAnyone\\u201d, or it needs approving "
             +"again: open the /exec address in a browser tab, approve it once, and check "
             +"Deploy \\u2192 Manage deployments has \\u201cWho has access: Anyone\\u201d.";
        } else if(threw){
          why="Apps Script ran the script and it threw, so it answered with its error page";
          fix="The deployment is almost certainly older than this page. Redeploy it: "
             +"Deploy \\u2192 Manage deployments \\u2192 edit \\u2192 New version. "
             +"The Apps Script execution log says which line.";
        } else {
          why="Apps Script answered with a Google page instead of the report";
          fix="Two things do this. If other writes are landing, the deployment is authorised and "
             +"the script threw \\u2014 redeploy it (Deploy \\u2192 Manage deployments \\u2192 "
             +"edit \\u2192 New version). If nothing is landing, it needs approving: open the "
             +"/exec address in a browser tab and check \\u201cWho has access: Anyone\\u201d. "
             +"The console has the first 200 characters of the reply.";
        }
        return {ok:false,needsAuth:signIn&&!threw,
          error:why+" \\u2014 so nothing was recorded. "+fix};
      }'''


def edit(rel):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read()
    if NEW in s:
        print("  already there: " + rel); return
    n = s.count(OLD)
    assert n == 1, "%s: %d" % (rel, n)
    io.open(P, "w", encoding="utf-8").write(s.replace(OLD, NEW, 1))
    print("  ok: " + rel)


for page in ("ujump.html", "djump.html", "pjump.html"):
    edit(page)
