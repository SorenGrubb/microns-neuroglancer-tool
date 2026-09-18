/* A refusal no longer looks like a tick, in µJump, δJump and πJump.               2026-09-04

   Audit item 6, the last of them. Every POST these three pages made went out mode:"no-cors", so
   the reply was opaque and the success toast fired on the promise resolving rather than on any
   answer. "✓ Submitted — thank you. Your identification was sent." was shown for a write the
   backend had refused — including `unknown report type`, which is precisely what a page gets
   while Code.gs is older than the page posting to it, i.e. the state these pages are in between
   an edit here and the next Deploy → New version.

   What is under test is the distinction the old code could not draw at all, and that a reader of
   a toast cannot draw either unless the page draws it for them:

       it arrived and was written      -> the tick
       it arrived and was REFUSED      -> the server's own sentence, which is the actionable half
       it never arrived                -> "your report was NOT submitted"

   Driven through each page's own postReport and its own best-effort savers, against a fetch stub
   that answers differently each time. A check that stubbed postAndRead would be asserting its own
   arithmetic.

   Run: node readsreplycheck.js */
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const core = require("./corepath.js");
const page = require("./pagepath.js");

const R = [];
const ok = (n, c, d) => { R.push(!!c); console.log((c ? "PASS " : "*** FAIL *** ") + n
                                                   + (d !== undefined ? "  <- " + d : "")); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function jwt(expSec){
  const body = Buffer.from(JSON.stringify({ name:"Søren Grubb", email:"soren@grubb.dk",
                                            exp: expSec })).toString("base64")
    .replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return "hdr." + body + ".sig";
}
const ALIVE = () => jwt(Math.floor(Date.now() / 1000) + 3600);

(async () => {
  for (const file of ["ujump.html", "djump.html", "pjump.html"]){
    console.log("\n--- " + file + " ---");
    let html = fs.readFileSync(page(file), "utf8");

    /* NO PAGE POSTS OPAQUELY ANY MORE. Asserted in the source as well as in behaviour: the mode
       is one word inside one options object, and a call site missed by the edit would keep
       working perfectly while silently keeping the old blindness. The two remaining mentions are
       the comments explaining why it is gone. */
    const opaque = (html.match(/mode:"no-cors"/g) || []).length;
    const opaqueFetch = /fetch\([^)]*mode:"no-cors"/.test(html);
    ok("no POST goes out opaque any more", !opaqueFetch && opaque === 2,
       opaque + " mentions left, both in comments  <- a missed call site would look fine and see nothing");

    html = html.replace(/<script src="(core\/[A-Za-z0-9_.\-]+\.js)"><\/script>/g, (m, rel) => {
      try { return "<script>\n" + fs.readFileSync(core(rel.slice(5)), "utf8") + "\n</script>"; }
      catch (e) { return m; }
    });

    /* The stub answers whatever REPLY says at the moment of the call, so one loaded page can be
       shown a success, three different refusals and a dead network in turn. */
    let REPLY = { body: '{"ok":true,"status":"ok"}' };
    const posts = [], toasts = [];
    const dom = new JSDOM(html, { runScripts:"dangerously", url:"https://grubblab.com/" + file,
      virtualConsole: new VirtualConsole(), pretendToBeVisual: true,
      beforeParse(w){
        w.open = () => null; w.alert = () => {};
        w.fetch = (url, opt) => {
          if (!(opt && opt.method === "POST"))
            return w.Promise.resolve({ ok:true, status:200,
              json: () => w.Promise.resolve({}), text: () => w.Promise.resolve("{}") });
          posts.push({ mode: opt.mode, body: String(opt.body || "") });
          if (REPLY.reject) return w.Promise.reject(new w.Error("Failed to fetch"));
          /* url/redirected (2026-09-18): a POST answered with a sign-in page has usually been
             redirected to one, and the final URL is the only thing that distinguishes "Apps Script
             returned a page" from "the browser followed it to accounts.google.com". */
          return w.Promise.resolve({ ok:true, status:200, type:"cors",
            url: REPLY.url || "https://script.google.com/macros/s/AAA/exec",
            redirected: !!REPLY.redirected,
            text: () => w.Promise.resolve(REPLY.body),
            json: () => w.Promise.resolve(JSON.parse(REPLY.body)) });
        };
      } });
    const w = dom.window;
    await sleep(900);
    w.showSubmitToast = (good, msg) => { toasts.push((good ? "OK " : "NO ") + String(msg || "")); };
    w.handleGoogleCred({ credential: ALIVE() });

    const last = () => toasts[toasts.length - 1] || "";
    const submit = async () => { toasts.length = 0;
      const r = w.postReport({ type:"new_identification", nucleusId:"1", identified:"Astrocyte" },
                             "Submitted — thank you. Your identification was sent.");
      await sleep(40); return r; };

    console.log("  the write lands");
    REPLY = { body: '{"ok":true,"status":"ok"}' };
    const sent = await submit();
    ok("postReport still returns true, synchronously", sent === true,
       "twenty-odd call sites branch on it; turning it into a promise is the change this avoided");
    ok("...the POST carries no mode at all", posts.length > 0 && posts[posts.length-1].mode === undefined,
       String(posts[posts.length-1].mode) + "  <- plain, so the redirect can be followed and read");
    ok("...and the tick is shown", /^OK /.test(last()), last().slice(0, 50));

    console.log("  the write is refused");
    REPLY = { body: '{"ok":false,"error":"unknown report type: new_identification — this deployment '
                  + 'has no handler for it. Re-paste Code.gs. Nothing was written."}' };
    await submit();
    ok("a refusal is NOT a tick", /^NO /.test(last()),
       "the whole point of the item: this said \"✓ Submitted — thank you\" until today");
    ok("...and the server's own sentence is passed through",
       /unknown report type/.test(last()) && /Re-paste Code\.gs/.test(last()),
       last().slice(0, 80) + "…  <- no wording invented here could say which type or what to do");

    console.log("  the sign-in lapsed between the check and the write");
    REPLY = { body: '{"ok":false,"error":"unauthenticated"}' };
    await submit();
    ok("the one refusal worth rewording is reworded",
       /^NO /.test(last()) && /sign-in has expired/.test(last())
       && !/unauthenticated/.test(last()),
       last().slice(0, 70) + "  <- \"unauthenticated\" is not a sentence anybody can act on");
    ok("...and it says nothing was recorded", /nothing was recorded/i.test(last()));

    console.log("  the server never answered");
    REPLY = { reject: true };
    await submit();
    ok("a dead network is its own message", /^NO /.test(last())
       && /Could not reach the server/i.test(last()) && /NOT submitted/.test(last()),
       last().slice(0, 60) + "  <- distinct from a refusal, because the advice is different");

    /* ── A GOOGLE SIGN-IN PAGE IS NOT "SOMETHING UNREADABLE" ───────────────────────  2026-09-18
       Søren, after computing a volume: *"The computed volume was not saved — the server replied
       with something unreadable: `<!DOCTYPE html><html lang="da"><head><script nonce="…">
       window['ppConfig'] = {productName: '26981ed0.`"*

       That is a Google page in his own language, and printing its first 120 characters says
       nothing while reading as a fault in the tool. Apps Script serves it when the deployment's
       access is not "Anyone", or when it was authorised BEFORE the script asked for a new scope
       and so needs approving again — which is the state this project has been in since DriveApp
       was added on 2026-09-17. One cause worth naming, one remedy. */
    console.log("  and something that is not JSON at all");
    REPLY = { body: "<!DOCTYPE html><html lang=\"da\"><head><script nonce=\"qzl2N\">"
                  + "window['ppConfig'] = {productName: '26981ed0." };
    await submit();
    ok("an HTML reply is not read as success", /^NO /.test(last()),
       last().slice(0, 40) + "…  <- HTML is not consent");
    ok("...and it is named for what it is rather than quoted at him",
       /Google page/.test(last()) && !/unreadable/.test(last()) && !/DOCTYPE/i.test(last()),
       last().slice(0, 80) + "…");
    ok("...and says the one thing to do about it",
       /authoris/i.test(last()) && /approve it once/.test(last())
       && /nothing was recorded/i.test(last()),
       "re-authorise the deployment, and nothing was written");
    ok("...and names the scope change that makes an old authorisation insufficient",
       /Drive/.test(last()) && /2026-09-17/.test(last()));
    ok("...and the access setting, which is the other half of the same fault",
       /Anyone/.test(last()));

    console.log("  the same page, but reached by a redirect to Google's sign-in");
    REPLY = { body: "<!doctype html><html><head></head></html>", redirected: true,
              url: "https://accounts.google.com/v3/signin/identifier?flow=x" };
    await submit();
    ok("a redirect to accounts.google.com is said as that, not as Apps Script's answer",
       /redirected to Google\u2019s sign-in page|redirected to Google's sign-in page/.test(last()),
       last().slice(0, 70) + "…  <- a different fault with the same remedy, and the URL is the only "
       + "thing that knows which");

    /* ── the best-effort savers ────────────────────────────────────────────────────────────────
       These return their own sentence synchronously and the caller has already printed it by the
       time the reply lands, so a SERVER refusal has nowhere to go but a toast. Before today the
       whole reply was `.catch(function(){})`. */
    console.log("  the silent saves");
    const VOL = () => w.maybeSaveComputedVolume("111", "Pyramidal neuron",
                        { volumeUm3: 1234.5, vertices: 99, fragmentCount: 1 }, 0, "222");
    REPLY = { body: '{"ok":true,"status":"ok"}' };
    toasts.length = 0;
    /* Awaited BEFORE the next assertion, and deliberately so: the stub reads REPLY when the
       promise resolves, so leaving this call in flight would let it read the NEXT reply and
       report a refusal for the run that succeeded. Which is a fair description of the bug this
       whole item is about. */
    const quiet = VOL();
    await sleep(40);
    ok("a saved measurement says nothing", !quiet && toasts.length === 0,
       "silence is right when it worked — this is not a deliberate Submit click");
    REPLY = { body: '{"ok":false,"error":"unknown report type: save_computed_volume"}' };
    toasts.length = 0; VOL(); await sleep(40);
    ok("...but a refused one is said out loud", toasts.length === 1 && /^NO /.test(last()),
       last().slice(0, 70));
    ok("...naming which measurement it was", /computed volume/i.test(last()),
       "\"That measurement was not saved\" leaves somebody hunting for which");
  }

  const bad = R.filter(x => !x).length;
  console.log(bad ? `\n*** ${bad} of ${R.length} FAILED ***`
                  : `\nRESULT: ALL ${R.length} CHECKS PASSED`);
  process.exit(bad ? 1 : 0);
})();
