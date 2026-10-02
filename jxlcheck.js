/* The JPEG XL decoder's protocol, without the decoder.                              2026-10-03

   core/jxl.js exists because Eyewire II's retina serves its finest three levels as JPEG XL and
   Chrome cannot read them, so the pad is stuck at 128 nm where a lysosome is four pixels across.
   What this file checks is NOT that jxl-oxide decodes JPEG XL — that is jxl-oxide's business, it
   is measured rather than asserted (45 ms a chunk; see the module header), and a check that pulled
   1.7 MB of wasm over the network would be testing somebody else's library in the dark.

   What this file checks is the part core/jxl.js actually owns, which is a protocol:

     - nothing is downloaded or spawned until somebody asks for a decode. 62 of ωJump's 63 volumes
       will never want this, and they must not pay for it;
     - twenty chunks arriving at once boot ONE decoder, not twenty;
     - a reply is matched to its caller BY ID. The worker answers in the order it finishes, which
       is not the order it was asked — a queue that assumed otherwise would hand one chunk's pixels
       to another chunk's caller, which on a pad looks like a tracing in the wrong place and
       nothing like a bug;
     - one chunk failing fails that chunk;
     - a worker that dies fails everything outstanding rather than leaving twenty promises pending
       for the life of the page;
     - a boot that failed can be retried, because the usual reason is that the network was not
       there a moment ago.

   And one more, which is cheap and not decoration: THE WORKER SOURCE PARSES. It is a string, so a
   typo in it is invisible to every tool in this repo until a user ticks a box and gets nothing.

   Run: node jxlcheck.js */
const fs = require("fs");
const os = require("os");
const path = require("path");
const core = require("./corepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* A stand-in worker. It records what it was sent and answers only when this file says so, which is
   what makes "out of order" something that can be arranged rather than waited for. */
function fakeWorker(){
  const w = {
    sent: [], onmessage: null, onerror: null, transferred: [],
    postMessage(m, transfer){ w.sent.push(m); if (transfer) w.transferred.push(transfer.length); },
    reply(m){ if (w.onmessage) w.onmessage({ data: m }); },
    die(m){ if (w.onerror) w.onerror({ message: m || "boom" }); }
  };
  return w;
}

(async () => {

/* Loaded fresh each section: this module holds a worker and a boot promise, and a section that
   inherited another's would be asserting against something it did not set up. */
function load(){
  delete require.cache[require.resolve(core("jxl.js"))];
  return require(core("jxl.js"));
}

console.log("nothing happens until somebody asks");
{
  const J = load();
  let made = 0;
  J._workerFactory(() => { made++; return fakeWorker(); });
  ok(made === 0, "configuring and loading the module spawns nothing", made + " worker(s)");
  ok(J.ready() === false, "...and it does not claim to be ready", J.ready());
}

console.log("\nthe boot message says where the decoder is");
{
  const J = load();
  let w = null;
  J._workerFactory(() => (w = fakeWorker()));
  J.configure({ base: "https://grubblab.com/core/vendor/" });
  const p = J.start();
  ok(!!w && w.sent.length === 1 && w.sent[0].t === "boot",
     "start() spawns one worker and sends it one boot", w && w.sent.length + " message(s)");
  ok(w.sent[0].glue === "https://grubblab.com/core/vendor/jxl_oxide_wasm.js",
     "...naming the glue ABSOLUTELY, because a blob: worker has no base to resolve against",
     w.sent[0].glue);
  w.reply({ t: "ready", v: "0.12.6" });
  ok((await p) === "0.12.6" && J.ready() === true, "...and the ready reply settles it", J.version());
}

console.log("\ntwenty chunks at once boot one decoder");
{
  const J = load();
  let made = 0, w = null;
  J._workerFactory(() => { made++; return (w = fakeWorker()); });
  const all = [J.decode(new ArrayBuffer(8)), J.decode(new ArrayBuffer(8)), J.decode(new ArrayBuffer(8))];
  await new Promise(r => setTimeout(r, 0));
  ok(made === 1, "three decodes, one worker", made + " spawned");
  w.reply({ t: "ready", v: "0.12.6" });
  await new Promise(r => setTimeout(r, 0));
  const gos = w.sent.filter(m => m.t === "go");
  ok(gos.length === 3, "...and all three chunks are handed over once it is up", gos.length + " go");
  ok(new Set(gos.map(m => m.id)).size === 3, "...each with an id of its own",
     gos.map(m => m.id).join(","));
  ok(w.transferred.length === 3 && w.transferred.every(n => n === 1),
     "...and each buffer is TRANSFERRED, not copied — a chunk is a quarter of a megabyte",
     w.transferred.join(","));

  /* OUT OF ORDER, ON PURPOSE. This is the assertion the whole queue exists for. */
  w.reply({ t: "ok", id: gos[2].id, data: new Uint8Array([3]), width: 3, height: 1 });
  w.reply({ t: "ok", id: gos[0].id, data: new Uint8Array([1]), width: 1, height: 1 });
  w.reply({ t: "ok", id: gos[1].id, data: new Uint8Array([2]), width: 2, height: 1 });
  const got = await Promise.all(all);
  ok(got.map(g => g.width).join(",") === "1,2,3",
     "replies in any order reach the caller that asked — matched by id, never by arrival",
     got.map(g => g.width).join(","));
}

console.log("\none chunk failing fails that chunk");
{
  const J = load();
  let w = null;
  J._workerFactory(() => (w = fakeWorker()));
  const a = J.decode(new ArrayBuffer(8)), b = J.decode(new ArrayBuffer(8));
  await new Promise(r => setTimeout(r, 0));
  w.reply({ t: "ready", v: "0.12.6" });
  await new Promise(r => setTimeout(r, 0));
  const gos = w.sent.filter(m => m.t === "go");
  w.reply({ t: "err", id: gos[0].id, m: "not a complete JPEG XL codestream" });
  w.reply({ t: "ok", id: gos[1].id, data: new Uint8Array([9]), width: 9, height: 1 });
  let said = "";
  try { await a; } catch (e){ said = e.message; }
  ok(/complete JPEG XL/.test(said), "the one that failed rejects, with the worker's own words", said);
  ok((await b).width === 9, "...and the one beside it is unaffected", (await b).width);
}

console.log("\na worker that dies takes nothing silently");
{
  const J = load();
  let w = null;
  J._workerFactory(() => (w = fakeWorker()));
  const a = J.decode(new ArrayBuffer(8)), b = J.decode(new ArrayBuffer(8));
  await new Promise(r => setTimeout(r, 0));
  w.reply({ t: "ready", v: "0.12.6" });
  await new Promise(r => setTimeout(r, 0));
  w.die("out of memory");
  let n = 0;
  for (const p of [a, b]) { try { await p; } catch (_e){ n++; } }
  ok(n === 2, "both outstanding decodes reject rather than hanging for the life of the page", n);
  ok(J.ready() === false, "...and the module knows it has no decoder any more", J.ready());
}

console.log("\na boot that failed can be tried again");
{
  const J = load();
  let made = 0, w = null;
  J._workerFactory(() => { made++; return (w = fakeWorker()); });
  const first = J.start();
  w.reply({ t: "boom", m: "NetworkError" });
  let said = "";
  try { await first; } catch (e){ said = e.message; }
  ok(/NetworkError/.test(said), "a boot failure says what the browser said", said);
  const second = J.start();
  ok(made === 2, "...and asking again really asks again — the usual cause is a network that "
     + "was not there a moment ago", made + " spawn(s)");
  w.reply({ t: "ready", v: "0.12.6" });
  ok((await second) === "0.12.6", "...and the second one can succeed", J.version());
}

console.log("\nwithout the browser it needs, it says so rather than throwing");
{
  const J = load();
  J._workerFactory(null);
  ok(J.supported() === false, "node has no Worker, so supported() is false", J.supported());
  let said = "";
  try { await J.decode(new ArrayBuffer(8)); } catch (e){ said = e.message; }
  ok(/workers and OffscreenCanvas/.test(said),
     "...and a decode asked for anyway explains itself in words a person can act on", said);
}

console.log("\nand the worker source is a program");
{
  const J = load();
  const f = path.join(os.tmpdir(), "jxlcheck_worker_" + process.pid + ".mjs");
  fs.writeFileSync(f, J._src, "utf8");
  let kind = "parsed and ran";
  try { await import("file://" + f); }
  catch (e){ kind = e.constructor.name + ": " + String(e.message).slice(0, 60); }
  fs.unlinkSync(f);
  /* `self` does not exist in node, so a ReferenceError means the module PARSED and then ran into
     the browser it was written for -- which is exactly as far as node can take it. A SyntaxError
     means the string this file ships is not JavaScript, and nothing else in this repo would ever
     have said so. */
  ok(/ReferenceError/.test(kind), "it parses as an ES module — it is a string, so nothing else "
     + "in this repo would notice a typo in it", kind);
  ok(/\bimport\(/.test(J._src) && /postMessage/.test(J._src),
     "...and it is the right program: it imports the glue and answers by message");
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
process.exit(fails ? 1 : 0);

})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
