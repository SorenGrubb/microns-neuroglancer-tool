/* The shared panel must not credit a classifier that has never seen the cell.       2026-09-20

   core/panel.js explains a community override by naming what it replaced, and four of its
   sentences had "MICrONS" written into them. True on µJump, δJump and πJump. Not on ηJump, whose
   source is H01 — a different dataset, which does not predict but publishes — and not on λJump or
   βJump, which have no automated classifier at all and say so in their own headline.

   So three tools had been showing a tooltip crediting a classifier that was never involved, and
   the fourth would have as soon as it joined.

   `UJ.panel.source` is a hook returning {label, noun}, defaulting to {"MICrONS", "prediction"}.
   label:"" means there is no classifier here, and the sentences drop the attribution instead of
   inventing one.

   WHY THIS IS ITS OWN CHECK AND NOT A LINE IN ANOTHER ONE. The sentences are reached only through
   the headline-override branch, which needs reports, a ranked winner, and a headline element in
   one of two states — so they are easy to change and hard to see. Three of the four were fixed in
   one pass and the fourth was found by driving a browser afterwards, still saying "MICrONS's
   prediction" in the tooltip of a headline whose visible text had just been corrected to "H01
   published classification". Three out of four is how a page ends up half-true.

   FOUR SENTENCES, TWO CELL STATES, THREE KINDS OF HOST:

     - a cell the source DID call, where the community agrees  -> "confirmed", and the source keeps
       the credit;
     - a cell the source DID call, where the community disagrees -> overridden, and the sentence
       has to say what was replaced;
     - a cell the source never called -> overridden, and there is nothing to have replaced.

   Run: node sourcenamecheck.js */
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const core = require("./corepath.js");

const R = [];
const ok = (n, c, d) => { R.push(!!c); console.log((c ? "PASS " : "*** FAIL *** ") + n
                                                   + (d !== undefined ? "  <- " + d : "")); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Two reporters saying the same thing, which is all the ranking needs to produce a winner. */
const REPORTS = name => ({ ok: true, mergedGroups: [], notNucleusReports: [], organelleGroups: [],
  reports: [{ identified: name, reporterName: "R0", timestamp: "2026-09-10T10:00:00.000Z" },
            { identified: name, reporterName: "R1", timestamp: "2026-09-11T10:00:00.000Z" }] });

/* core/panel.js with a headline to override and a backend that answers. `srcSrc` is what this
   host says about its own classifier; `published` is what it claims to have called this cell. */
function hostWindow(srcSrc, published, payload) {
  const vc = new VirtualConsole();
  const host =
      '<div class="celltype" id="ctHeadline" data-unclassified="' + (published ? "0" : "1") + '"'
    + '   data-microns-name="' + (published || "") + '">'
    + '  <a href="#x">' + (published || "Unnamed") + '</a>'
    + '  <small>' + (published ? "source classification" : "no call") + '</small></div>'
    + '<span id="ctTag">unclassified</span>'
    + '<div id="commReports"></div><div id="idVotePanel"></div>'
    + "<script>" + fs.readFileSync(core("ontology.js"), "utf8") + "<" + "/script>"
    + "<script>" + fs.readFileSync(core("organelles.js"), "utf8") + "<" + "/script>"
    + "<script>"
    + 'var REPORT_ENDPOINT="https://example.invalid/exec";'
    + 'var GOOGLE_VERIFIED=false, GOOGLE_CREDENTIAL="", REPORTER_NAME="", REPORTER_EMAIL="";'
    + 'var ID_CTX={}, CUR_NUCID="1", CUR_ROOT="";'
    + 'function escHtml(s){return String(s==null?"":s);}'
    + 'function coordSpan(x,y,z){return x+", "+y+", "+z;}'
    + 'function celltypeLink(p,h){return "<a href=\'#\'>"+h+"</a>";}'
    + 'function canonSubmitName(n){return n||"";}'
    + 'function postReport(){return true;}'
    + 'window.UJ=window.UJ||{};UJ.panel=UJ.panel||{};' + (srcSrc || "")
    + "<" + "/script>"
    + "<script>" + fs.readFileSync(core("panel.js"), "utf8") + "<" + "/script>";
  const dom = new JSDOM(host, { runScripts: "dangerously", virtualConsole: vc,
    url: "https://grubblab.com/x.html", pretendToBeVisual: true,
    beforeParse(w) {
      w.alert = () => {};
      w.fetch = u => w.Promise.resolve({ status: 200, ok: true,
        json: () => w.Promise.resolve(/identityVotes/.test(String(u))
          ? { ok: true, identityVotes: [] } : payload),
        text: () => w.Promise.resolve(JSON.stringify(payload)) });
    } });
  return dom.window;
}

async function seen(srcSrc, published, winner) {
  const w = hostWindow(srcSrc, published, REPORTS(winner));
  await sleep(200);
  w.loadCommunityReports("1", [1, 2, 3]);
  await sleep(300);
  const h = w.document.getElementById("ctHeadline");
  const t = w.document.getElementById("ctTag");
  const small = h.querySelector("small");
  return { head: h.textContent.replace(/\s+/g, " ").trim(),
           small: small ? small.textContent : "", title: h.title,
           tagTitle: t ? t.title : "" };
}

(async () => {
  console.log("--- a host that says nothing keeps MICrONS, which is what it always said ---");
  {
    const conf = await seen("", "Astrocyte", "Astrocyte");
    ok("a confirmed call still credits MICrONS in the line under the name",
       /^MICrONS prediction — confirmed by 2 users$/.test(conf.small), conf.small);
    ok("...and in the tooltip behind it",
       /MICrONS’s prediction/.test(conf.title), conf.title.slice(0, 80)
       + "  <- the sentence that was missed the first time round");
    const over = await seen("", "Astrocyte", "Microglia");
    ok("an overridden call says what it replaced",
       /in place of the MICrONS prediction/.test(over.title), over.title.slice(-70));
    ok("...and so does the tag", /not by MICrONS|place of the MICrONS/.test(over.tagTitle),
       over.tagTitle.slice(0, 70));
  }

  console.log("\n--- ηJump: H01 publishes, it does not predict ---");
  {
    const SRC = 'UJ.panel.source={label:"H01",noun:"published classification"};';
    const conf = await seen(SRC, "Pyramidal neuron", "Pyramidal neuron");
    ok("a confirmed call credits H01, in H01's own noun",
       conf.small === "H01 published classification — confirmed by 2 users", conf.small);
    ok("...and the tooltip agrees with the line above it",
       /H01’s published classification/.test(conf.title) && !/MICrONS/.test(conf.title),
       conf.title.slice(0, 90));
    const over = await seen(SRC, "Pyramidal neuron", "Astrocyte");
    ok("an overridden call names H01 as what it replaced",
       /in place of the H01 published classification/.test(over.title) && !/MICrONS/.test(over.title),
       over.title.slice(-72));
    const none = await seen(SRC, "", "Astrocyte");
    ok("a cell H01 never called says so, without inventing a prediction",
       /There is no H01 published classification for this cell/.test(none.title)
       && !/MICrONS/.test(none.title), none.title.slice(-64));
    ok("...and the tag says who did name it", /not by H01/.test(none.tagTitle)
       && !/MICrONS/.test(none.tagTitle), none.tagTitle.slice(0, 74));
  }

  console.log("\n--- λJump / βJump: there is no classifier at all ---");
  {
    /* label:"" is not the same as unset. Unset means "nobody told me", which defaults to MICrONS;
       "" is a page stating that its dataset has no automated call to credit or contradict. */
    const SRC = 'UJ.panel.source={label:"",noun:"prediction"};';
    const none = await seen(SRC, "", "Astrocyte");
    ok("the sentence drops the attribution instead of inventing one",
       /This dataset has no automated classifier/.test(none.title) && !/MICrONS/.test(none.title),
       none.title.slice(-56));
    ok("...and so does the tag",
       /This dataset has no automated classifier/.test(none.tagTitle)
       && !/MICrONS|not by /.test(none.tagTitle), none.tagTitle.slice(0, 74));
  }

  const bad = R.filter(x => !x).length;
  console.log("\n" + (bad ? "*** " + bad + " of " + R.length + " FAILED ***"
                          : "RESULT: ALL " + R.length + " CHECKS PASSED"));
  process.exit(bad ? 1 : 0);
})();
