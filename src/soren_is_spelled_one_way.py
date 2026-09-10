"""Søren is spelled one way, and an unsigned submit says so before it goes.          2026-09-10

Two from Søren, on the same screen:

  *"What is this? Why am I spelled two different ways now?"* -- his list showing
  "SÃ¸ren Grubb" beside "Søren Grubb".

  *"Also, when you are not logged in while submitting, there should be a warning!"*

1. THE MOJIBAKE, and it is one function call.

       const p = JSON.parse(atob(String(resp.credential).split(".")[1]...));
       REPORTER_NAME = p.name || "";

   atob() returns a BINARY STRING -- one character per byte, each 0..255. The Google ID token's
   payload is UTF-8, so "ø" (U+00F8) arrives as the two bytes 0xC3 0xB8, and reading those two
   bytes as two characters gives "Ã¸". Every non-ASCII letter in every name goes the same way.

   Which is exactly what his screenshot shows, and it also explains why only ONE of the two rows is
   wrong: the older row's name came back from the SERVER, which verifies the token through Google's
   own tokeninfo endpoint and gets proper UTF-8. The newer one is the name this page decoded for
   itself. Two spellings, two sources, one of them broken.

   Fixed with TextDecoder over the actual bytes. Present in FOUR tools -- βJump, ηJump, λJump and
   ωJump -- which all decode the token client-side; µJump, δJump, πJump and χJump go through
   core/gamify.js, which takes the name from ?myStats= (server-side, already correct) and never had
   the bug.

2. THE UNSIGNED SUBMIT.

   postReport() refused an EXPIRED token before the round trip and said so, but a user who had never
   signed in at all fell straight through: the post went out with credential:null, the server said
   "unauthenticated", and the answer only came back after a round trip -- and only reached the eye
   at call sites that print d.error. Some do not.

   Now it refuses the same way an expired token is refused, in the same shape every call site here
   already handles, before anything is sent. Same sentence, same toast, no round trip, and nothing
   silently dropped.

Run: python3 src/soren_is_spelled_one_way.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── the decode, in every tool that does it for itself ───────────────────────────────────────────
DECODE_HELPER = '''/* THE TOKEN PAYLOAD IS UTF-8, AND atob() IS NOT.                                    2026-09-10
   Søren: "Why am I spelled two different ways now?" -- his own list showing "SÃ¸ren Grubb" beside
   "Søren Grubb". atob() returns a BINARY STRING, one character per byte: "ø" (U+00F8) is the two
   UTF-8 bytes 0xC3 0xB8, and reading those as two characters gives "Ã¸". The correct spelling in
   the same list came from the SERVER, which verifies the token through Google's tokeninfo and gets
   real UTF-8 -- so the two spellings were two sources, one of them decoding wrongly here.

   Bytes first, then a UTF-8 decode. The try/catch is not decoration: a token is base64url and a
   malformed one must not take sign-in down with it. */
function jwtPayload(cred){
  try{
    var b=atob(String(cred).split(".")[1].replace(/-/g,"+").replace(/_/g,"/"));
    var u=new Uint8Array(b.length);
    for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);
    return JSON.parse(new TextDecoder("utf-8").decode(u));
  }catch(_e){ return {}; }
}
'''

PAGES = {
    "ljump.html": [
        ('''    const p=JSON.parse(atob(String(resp.credential).split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));''',
         '''    const p=jwtPayload(resp.credential);''',
         "λJump decodes the name as UTF-8"),
    ],
    "bjump.html": [
        ('''    const p=JSON.parse(atob(String(resp.credential).split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));''',
         '''    const p=jwtPayload(resp.credential);''',
         "βJump decodes the name as UTF-8"),
    ],
    "hjump.html": [
        ('''    const p=JSON.parse(atob(String(resp.credential).split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));''',
         '''    const p=jwtPayload(resp.credential);''',
         "ηJump decodes the name as UTF-8"),
    ],
    "wjump.html": [
        ('''    var p = JSON.parse(atob(resp.credential.split(".")[1]));''',
         '''    var p = jwtPayload(resp.credential);''',
         "ωJump decodes the name as UTF-8"),
    ],
}

# Each page gets the helper immediately above the function that used to do it inline.
ANCHORS = {
    "ljump.html": "let GOOGLE_VERIFIED=false, GOOGLE_CREDENTIAL=null, REPORTER_NAME=\"\";",
}

WARN = [
    ('''function postReport(payload,okMsg){
  /* REFUSED HERE, BEFORE THE ROUND TRIP, when the token is already dead -- and answered in the
     shape every call site in this page already handles ({ok:false, error}), so the sentence
     reaches every message line and every toast without one of them being edited. */
  if(googleExpired()){''',
     '''function postReport(payload,okMsg){
  /* ── NEVER SIGNED IN AT ALL ──────────────────────────────────────────────────────────────
     Søren, 2026-09-10: "when you are not logged in while submitting, there should be a warning!"

     The expired-token case below has been refused before the round trip for weeks. A user who had
     never signed in fell straight through it: the post went out with credential:null, the server
     answered "unauthenticated", and that only reached the eye at call sites that print d.error --
     which not all of them do. Refused the same way, in the same shape, before anything is sent. */
  if(!GOOGLE_VERIFIED||!GOOGLE_CREDENTIAL){
    askSignInAgain();
    var notIn="You are not signed in \\u2014 nothing was submitted. Sign in with Google (top right) "
      +"and try again; every contribution names who made it.";
    if(typeof showSubmitToast==="function") showSubmitToast(false, notIn);
    return Promise.resolve({ok:false, error:notIn});
  }
  /* REFUSED HERE, BEFORE THE ROUND TRIP, when the token is already dead -- and answered in the
     shape every call site in this page already handles ({ok:false, error}), so the sentence
     reaches every message line and every toast without one of them being edited. */
  if(googleExpired()){''',
     "an unsigned submit is refused with a warning, not sent"),
]


def edit(rel, pairs, helper_anchor=None):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    print(rel)
    if helper_anchor is not None and "function jwtPayload(" not in s:
        assert helper_anchor in s, "NOT FOUND: helper anchor in " + rel
        s = s.replace(helper_anchor, DECODE_HELPER + helper_anchor, 1)
        print("  ok: jwtPayload() added")
    elif helper_anchor is not None:
        print("  already there: jwtPayload()")
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


for page, pairs in PAGES.items():
    # The helper goes immediately above the sign-in handler that used to decode inline. Each page
    # declares its own credential globals on one line; that line is the anchor.
    src = io.open(os.path.join(HERE, page), encoding="utf-8").read()
    anchor = None
    for cand in ["let GOOGLE_VERIFIED=false, GOOGLE_CREDENTIAL=null, REPORTER_NAME=\"\";",
                 "function handleGoogleCred(", "function onGoogleCred(", "function handleCred("]:
        if cand in src:
            anchor = cand
            break
    assert anchor, page + ": no anchor for the helper"
    edit(page, pairs, anchor)

edit("ljump.html", WARN)
print("\nnow: node newnucleuscheck.js")
