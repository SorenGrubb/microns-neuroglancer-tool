/* Which volume a coordinate is in, and what to read it from.                         2026-10-03

   Søren: *"We should enable EM section, meshes and 3D structure also for minnie35 data."*

   core/volumes.js is the one list of imaged volumes and the one containment test, moved out of
   core/jumplink.js so the pad, the cell card, the mesh fetch and the EM preview can ask the same
   question the Discussion's linkifier has been asking since it was built. This file is about the
   answers, and especially about the two that are easy to get wrong:

     THE SEAM. minnie65's imagery starts at section 14,816 and minnie35's runs to 14,860, so
     forty-four sections are inside BOTH boxes. A point there has to resolve to one of them and it
     has to be the same one every time; it resolves to minnie65, the volume with segmentation,
     nuclei and cell types over it. Asserted as a point in the overlap, not as a rule in prose.

     OUTSIDE EVERYTHING. A coordinate a few hundred nanometres past a declared box is a rounding
     error or a slightly wrong box, and a panel that goes blank there is worse than one that shows
     the nearest thing it has. sourcesAt() falls back to the primary volume and says `inside:false`
     rather than returning null, so a caller can tell the difference — and so every tool that
     configured nothing behaves exactly as it did before this file existed.

   The numbers below are MICrONS's own, read off the published info files on 2026-10-03:
   minnie35's EM is 0–262144 x 0–262144 voxels at 8 nm and sections 7931–14860 at 40 nm.

   Run: node volumescheck.js */
const V = require("./core/volumes.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* µJump's own two, as window.jumpLinkHost() declares them. Nanometres. */
const BB65 = { xmin: 110592, xmax: 1814528, ymin: 110592, ymax: 1552384,
               zmin: 592640, zmax: 1116160 };
const BB35 = { xmin: 0, xmax: 2097152, ymin: 0, ymax: 2097152,
               zmin: 317240, zmax: 594400 };
const RES = [8, 8, 40];
const MINNIE = [
  { key: "minnie65", label: "minnie65", bb: BB65,
    em: "em65", seg: "seg65", nuc: "nuc65", mesh: "mesh65" },
  { key: "minnie35", label: "minnie35", bb: BB35, em: "em35", seg: "seg35", mesh: "mesh35" }
];

console.log("nothing configured is not a new way to break");
{
  V.configure([]);
  ok(V.count() === 0 && V.primary() === null, "an unconfigured page has no volumes and no primary");
  ok(V.at([1, 2, 3]) === null, "...and nothing is anywhere");
  ok(V.sourcesAt([1, 2, 3]) === null,
     "...and asking for sources gets null rather than an object full of empty strings, which a "
     + "caller would have happily fetched");
}

console.log("\nthe two minnie volumes");
V.configure(MINNIE);
{
  ok(V.count() === 2 && V.primary().key === "minnie65",
     "minnie65 is primary — it is what every tool here was built on", V.primary().key);

  /* Mid-volume in each, in voxels, which is what the boxes and links hold. */
  /* x and y chosen inside BOTH boxes so that only z decides, which is the axis the two
     volumes actually differ on. 8 nm in x and y, 40 nm in z. */
  const in65 = [100000, 100000, 20000];            // z 800,000 nm — past minnie35's last
  const in35 = [100000, 100000, 10000];            // z 400,000 nm — before minnie65's first
  ok((V.atVox(in65, RES) || {}).key === "minnie65",
     "a point in minnie65 says minnie65", (V.atVox(in65, RES) || {}).key);
  ok((V.atVox(in35, RES) || {}).key === "minnie35",
     "a point in minnie35 says minnie35", (V.atVox(in35, RES) || {}).key);

  /* ── THE SEAM ──────────────────────────────────────────────────────────────────────────────
     14,816 is minnie65's first section and 14,860 is minnie35's last, so this point is inside
     both boxes. Whichever it resolves to, it has to be the same one every time. */
  const seam = [100000, 100000, 14830];
  const sm = V.atVox(seam, RES);
  ok(!!sm && V.inBox([seam[0]*8, seam[1]*8, seam[2]*40], BB35)
          && V.inBox([seam[0]*8, seam[1]*8, seam[2]*40], BB65),
     "section 14,830 really is inside both boxes — the premise, not an assumption");
  ok(sm.key === "minnie65",
     "...and it resolves to minnie65, the one with segmentation, nuclei and cell types over it",
     sm.key);

  /* Priority is the LIST's order, not a name baked in here. Reverse the list and the seam flips —
     which is the assertion that this is a rule about declaration order rather than about minnie. */
  V.configure(MINNIE.slice().reverse());
  ok((V.atVox(seam, RES) || {}).key === "minnie35",
     "...and that is the list's order speaking, not this module preferring a name",
     (V.atVox(seam, RES) || {}).key);
  V.configure(MINNIE);
}

console.log("\nwhat to read a coordinate from");
{
  const s65 = V.sourcesAtVox([100000, 100000, 20000], RES);
  const s35 = V.sourcesAtVox([100000, 100000, 10000], RES);
  ok(s65.em === "em65" && s65.seg === "seg65" && s65.inside,
     "a minnie65 point reads minnie65's imagery and segmentation", s65.key);
  ok(s35.em === "em35" && s35.seg === "seg35" && s35.inside,
     "a minnie35 point reads minnie35's — which is the whole point of this file", s35.key);

  /* ── NUCLEI ARE ABSENT OUT THERE, NOT EMPTY ────────────────────────────────────────────────
     There is no MICrONS nucleus detection over minnie35. A caller must be able to tell "no
     detector has been run here" from "here is a nuclei volume", because an empty layer looks
     like a dataset with nothing in it. */
  ok(!!s65.nuc && !s35.nuc,
     "minnie65 has a nucleus segmentation and minnie35 has none",
     "65:" + (s65.nuc || "—") + "  35:" + (s35.nuc || "—"));
  ok(!!s35.mesh && s35.mesh !== s65.mesh,
     "...but minnie35 has its own mesh store, which is where its 3D comes from",
     s35.mesh);

  /* Outside both. Falling back rather than refusing, and saying which. */
  const out = V.sourcesAtVox([10, 10, 100], RES);
  ok(out && out.inside === false && out.key === "minnie65",
     "a point outside every box falls back to the primary volume AND says it is outside — "
     + "a rounding error at a boundary should not blank the panel, and a caller that needs to "
     + "know can ask",
     out.key + ", inside " + out.inside);
}

console.log("\nthe list is a copy, not a handle on the caller's array");
{
  const mine = MINNIE.slice();
  V.configure(mine);
  mine.length = 0;
  ok(V.count() === 2, "emptying the array afterwards does not empty the registry", V.count());
  const got = V.all();
  got.length = 0;
  ok(V.count() === 2, "...and neither does emptying what all() handed back", V.count());
  V.configure(MINNIE);
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
process.exit(fails ? 1 : 0);
