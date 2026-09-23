/* An HTML reply from Apps Script says WHICH Google page it got.                        2026-09-23

   Hesham's toast said "Apps Script answered with a Google page ... The deployment needs authorising
   again". Two facts from the same afternoon say that was the wrong remedy: his 18 tracing rows had
   just landed WITH their Drive files (so Drive access was granted and working), and every POST on
   these pages reads its reply (no-cors went on 2026-09-04), so those rows were confirmed by the
   server rather than assumed. An unauthorised deployment does not do that.

   Apps Script answers with HTML for two reasons and the remedies are different buttons in different
   menus. So the message now names which one it matched, and says so when it cannot tell.

   Run: node htmlreplycheck.js [page.html] */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };
const PAGE = process.argv[2] || "ujump.html";

/* Real shapes: a Google sign-in page, an Apps Script error page, and HTML that is neither. */
const SIGNIN = '<!DOCTYPE html><html lang="da"><head><title>Log ind</title>'
             + '<script nonce="x">window.WIZ_global_data={};</script>'
             + '<div data-initial-setup-data="%.@." class="ServiceLogin">Sign in</div></html>';
const ERRPAGE = '<!DOCTYPE html><html><head><title>Error</title></head><body>'
              + '<div>Exception: Cannot read properties of undefined (reading \'getLastRow\')</div>'
              + '<div>TypeError at Code.gs:3201</div></body></html>';
const NEITHER = '<!doctype html><html><body><p>Temporarily unavailable.</p></body></html>';

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(3000);

  const got = await p.evaluate(async ([signin, errpage, neither]) => {
    GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "x";
    const logs = [];
    const warn = console.warn;
    console.warn = function(){ logs.push([].slice.call(arguments).join(" ")); warn.apply(console, arguments); };
    const run = async (body, url) => {
      logs.length = 0;
      window.fetch = () => Promise.resolve({
        ok: true, status: 200, url: url || "https://script.googleusercontent.com/x",
        text: () => Promise.resolve(body) });
      const r = await postAndRead({ type: "organelle_location", credential: "x" });
      return { err: r.error || "", needsAuth: !!r.needsAuth, log: logs.join(" | ") };
    };
    return { signin: await run(signin, "https://accounts.google.com/ServiceLogin"),
             signinBody: await run(signin),
             err: await run(errpage),
             neither: await run(neither) };
  }, [SIGNIN, ERRPAGE, NEITHER]);

  console.log(PAGE + "\n\na Google sign-in page");
  ok(/sign-in page/i.test(got.signin.err) && got.signin.needsAuth,
     "is called a sign-in page, and asks for approval", got.signin.err.slice(0, 90));
  ok(/Who has access/.test(got.signin.err), "...naming the setting to check", true);
  ok(/sign-in page/i.test(got.signinBody.err),
     "...recognised from the BODY too, not only from a redirect to accounts.google.com",
     got.signinBody.err.slice(0, 60));

  console.log("\nan Apps Script error page");
  ok(/threw/i.test(got.err.err), "is called a script that threw", got.err.err.slice(0, 80));
  ok(/New version/.test(got.err.err),
     "...and sends him to the REDEPLOY, not to re-authorising",
     (got.err.err.match(/Redeploy[^.]*\./) || ["NOT SAID"])[0]);
  ok(!/needs approving|authorising again/i.test(got.err.err),
     "...and does not also tell him to re-authorise, which was the wrong remedy", true);
  ok(got.err.needsAuth === false, "...and is not flagged as an auth failure", got.err.needsAuth);

  console.log("\nHTML that is neither");
  ok(/Two things do this/.test(got.neither.err),
     "says it cannot tell, and gives both", got.neither.err.slice(0, 70));
  ok(/If other writes are landing/.test(got.neither.err),
     "...with the test that tells them apart", true);

  console.log("\nand the evidence is kept");
  ok(/Apps Script answered with HTML \(error page\)/.test(got.err.log)
     && /Exception/.test(got.err.log),
     "the first 200 characters go to the console, so the guess can be argued with",
     got.err.log.slice(0, 110));
  ok(/\(sign-in\)/.test(got.signin.log), "...labelled with what it matched", got.signin.log.slice(0, 70));

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
