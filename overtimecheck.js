/* Computed volumes start off the cumulative chart, and can be clicked back on.     2026-09-09

   Søren: "I would like for this graph that it was default that computed volumes are disabled, so
   that you can add them by clicking but they don't show by default."

   Drives the REAL renderReportsOverTime() lifted out of each shipped page (pagefn.js) against a
   stubbed Plotly, and reads the trace list it hands over. The distinction under test is one word:
   "legendonly" leaves a greyed, clickable legend entry; false would remove the entry and make this
   hidden data instead of a starting position.

   Run: node overtimecheck.js  */
const vm = require("vm");
const { fnText, source } = require("./pagefn.js");

const PAGES = ["ujump.html", "djump.html", "pjump.html"];
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

const DAILY = [
  { date: "2026-07-12", counts: { "New identifications": 2, "Computed volumes": 5, "Discrepancies": 1 } },
  { date: "2026-07-13", counts: { "New identifications": 3, "Computed volumes": 40 } },
  /* A renamed sheet: it is a spreadsheet tab, and somebody can retitle it. */
  { date: "2026-07-14", counts: { "computed Volumes ": 7, "Organelle locations": 4 } }
];

for (const page of PAGES) {
  console.log(page);
  const ctx = vm.createContext({ console, Set, Object, Array, Math, JSON });
  let call = null;
  ctx.Plotly = { newPlot: (id, traces, layout, cfg) => { call = { id, traces, layout, cfg }; } };
  ctx.PLOTLY_CFG = {};
  ctx.colorFor = () => "#123456";
  ctx.baseLayout = () => ({ xaxis: {}, yaxis: {} });
  ctx.document = { getElementById: () => ({ id: "plotReportsOverTime", innerHTML: "" }) };
  vm.runInContext(fnText(page, "renderReportsOverTime"), ctx);
  ctx.DAILY = DAILY;
  vm.runInContext("renderReportsOverTime(DAILY)", ctx);

  ok(!!call, "the chart is drawn");
  if (!call) continue;
  const t = call.traces, byName = {};
  t.forEach(x => { byName[x.name] = x; });

  ok(t.length === 5, "every report type still gets a trace", t.map(x => x.name).join(" | "));
  ok(byName["Computed volumes"] && byName["Computed volumes"].visible === "legendonly",
     "Computed volumes starts off", byName["Computed volumes"] && String(byName["Computed volumes"].visible));
  ok(byName["Computed volumes"] && byName["Computed volumes"].visible !== false,
     "...as a legend entry you can click back on, NOT as removed data");
  ok(byName["computed Volumes "] && byName["computed Volumes "].visible === "legendonly",
     "a renamed sheet is still recognised", "case- and space-insensitive");
  ok(["New identifications", "Discrepancies", "Organelle locations"]
       .every(n => byName[n] && byName[n].visible === true),
     "nothing else is hidden",
     ["New identifications", "Discrepancies", "Organelle locations"]
       .map(n => n + "=" + (byName[n] && byName[n].visible)).join(", "));
  ok(call.layout.showlegend === true, "the legend is shown, or there is nothing to click");

  /* Still a stacked area, and still cumulative — the change must not have touched either. */
  ok(t.every(x => x.stackgroup === "one"), "the traces still stack");
  ok(byName["New identifications"].y.join(",") === "2,5,5",
     "...and are still cumulative", byName["New identifications"].y.join(","));

  /* The description has to agree with the chart. */
  ok(/Computed volumes start hidden/.test(source(page)),
     "the sub-heading says computed volumes start hidden");
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
process.exit(fails ? 1 : 0);
