/* Every cell type is offered, and a cell somebody reported is counted.             2026-09-09

   Søren, on πJump: "I have reported some cells in pJump but they do not show up in the filter. It
   would be nice if all the possible cells are just greyed out until they are identified."

   Drives the REAL filterTypeTally() and buildTypeCheckboxesInto() lifted out of each shipped page
   (pagefn.js) against a five-nucleus dataset, so a page that quietly reverts to hiding empty types
   fails here rather than in his screenshot.

   Run: node celltypelistcheck.js  */
const vm = require("vm");
const { fnText, source } = require("./pagefn.js");

const PAGES = ["ujump.html", "djump.html", "pjump.html"];
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

/* A container with just enough DOM for the builder: it reads the old checkboxes to carry ticks
   across a rebuild, and writes innerHTML. */
function container(checked){
  return { innerHTML: "",
           querySelectorAll: () => (checked || []).map(v => ({ checked: true, value: v })) };
}

for (const page of PAGES){
  console.log(page);
  const src = source(page);
  const ctx = vm.createContext({ console, Map, Set, String, Array, JSON });

  /* Five nuclei. #0 own-verified Astrocyte; #1 and #2 MICrONS-predicted "23P"; #3 has NO
     prediction at all and a community report of "Microglia" -- the case MICrONS is worst at and
     people report most; #4 nothing at all. */
  Object.assign(ctx, {
    N: 5, ST_N: 0,
    OWN_TYPE: [0, 255, 255, 255, 255], OWN_TYPE_NAMES: ["Astrocyte"],
    NT: [0, 1, 1, 0, 0], CT_NAMES: ["23P"],
    NID: [10, 11, 12, 13, 14],
    ST_TYPE: [],
    mergedInfo: () => null,
    window: { __COMM_ROWTYPE: { "13": "Microglia" } },
    TYPE_ALIASES: {}, typeTitle: n => n,
    CATEGORY_ORDER: ["Neurons", "Glia", "Vascular cells"],
    CATEGORY_MEMBERS: { "Neurons": ["23P", "BC"], "Glia": ["Astrocyte", "Microglia", "OPC"],
                        "Vascular cells": ["Pericyte"] }
  });
  vm.runInContext(fnText(page, "filterTypeTally") + "\n" + fnText(page, "buildTypeCheckboxesInto"), ctx);

  const tally = vm.runInContext("filterTypeTally()", ctx);
  ok(tally.get("Astrocyte") === 1, "an own-verified cell is counted");
  ok(tally.get("23P") === 2, "a MICrONS prediction is counted", tally.get("23P"));
  ok(tally.get("Microglia") === 1,
     "a cell identified only by the community is counted", tally.get("Microglia"));

  ctx.c = container();
  vm.runInContext('buildTypeCheckboxesInto(c,"ftype")', ctx);
  const html = ctx.c.innerHTML;
  const has = v => html.indexOf('value="' + v + '"') >= 0;
  ok(has("23P") && has("Astrocyte") && has("Microglia"), "the types with cells are offered");
  ok(has("BC") && has("OPC") && has("Pericyte"),
     "...and so are the ones nobody has identified yet");
  ok(/Vascular cells/.test(html), "a category with no cells at all still gets its heading");

  /* Dimmed, not hidden -- and the 2026-08-20 complaint the hiding was meant to answer ("I ticked
     it and got nothing, with no hint why") is answered by the count and the tooltip instead. */
  const label = v => { const i = html.indexOf('value="' + v + '"');
                       return html.slice(html.lastIndexOf("<label", i), html.indexOf("</label>", i)); };
  ok(/opacity:\.55/.test(label("Pericyte")), "an empty type is dimmed");
  ok(!/opacity:\.55/.test(label("Astrocyte")), "...and one with cells is not");
  ok(/>0<\/span>/.test(label("Pericyte")), "an empty type says 0 rather than saying nothing");
  ok(/carries this (identity|type) yet/.test(label("Pericyte")),
     "...and its tooltip says what the 0 means");

  /* A rebuild happens now, when the community fetch lands. It must not silently clear a choice. */
  ctx.c = container(["Astrocyte"]);
  vm.runInContext('buildTypeCheckboxesInto(c,"ftype")', ctx);
  ok(/value="Astrocyte" checked/.test(ctx.c.innerHTML), "a rebuild keeps what was ticked");
  ok(!/value="23P" checked/.test(ctx.c.innerHTML), "...and only what was ticked");

  /* The rebuild has to actually be wired to the fetch, or the counts stay pre-community forever. */
  ok(/ALL_IDENTITIES=null;[\s\S]{0,900}?buildFilterTypeCheckboxes\(\)/.test(src),
     "the community fetch redraws the counts");
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
process.exit(fails ? 1 : 0);
