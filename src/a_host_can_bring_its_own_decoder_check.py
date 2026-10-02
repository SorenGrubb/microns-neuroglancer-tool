# -*- coding: utf-8 -*-
u"""The check, first: a host that brings a decoder gets the levels back.                 2026-10-03

RED BEFORE GREEN. This adds the section to emtilescheck.js. Run it, watch the five new lines fail,
then run src/a_host_can_bring_its_own_decoder.py.

WHAT IT IS FOR. core/emtiles.js learned this morning to DROP scales whose encoding it cannot read,
which is what stops Eyewire II's JPEG XL levels being drawn as noise. Søren has now asked for the
other half: a page that carries a JPEG XL decoder should get those levels back, at 16 nm, instead
of being stuck at the volume's 128 nm jpeg level where a lysosome is four pixels across.

CAN_READ MUST NOT BECOME TWO LISTS. The whole point of asking the decoder rather than writing down
per dataset what it cannot do was that one place knows. A host-supplied decoder has to extend that
same place, so `canRead` is base-plus-CFG.decoders and nothing else consults a literal.

STUBBED, NOT REAL, and deliberately. What is under test here is the ROUTING — does a scale come
back, does the chunk reach the decoder the host named, does the result get laid out exactly as a
JPEG's is, and does an encoding with no decoder still say so. Whether jxl-oxide decodes JPEG XL
correctly is jxl-oxide's business and is measured elsewhere; a check that pulled 1.7 MB of wasm
would be testing somebody else's library in the dark.

Run: python3 src/a_host_can_bring_its_own_decoder_check.py, then node emtilescheck.js
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    print(rel)
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


SECTION = u'''
/* ── ...AND A HOST THAT BRINGS ONE GETS THEM BACK ──────────────────────  2026-10-03
   The section above drops what this file cannot decode. Søren asked for the other half: at the
   retina's 128 nm jpeg level a lysosome is four pixels, so a page carrying a JPEG XL decoder
   should get the 16 nm levels back rather than being told they do not exist.

   CFG.decoders is {encoding: fn(buf) -> {data, width, height}} — the same shape CFG.decodeJpeg
   already has, because a decoded chunk is a decoded chunk whatever produced it. canRead() is base
   plus those keys and nothing else consults a literal, so "what can be read" stays the one
   question with the one answer that this morning's change made it.

   STUBBED. What is under test is the routing: the scale comes back, the chunk reaches the named
   decoder, the result is laid out exactly as a JPEG's is, and an encoding with no decoder still
   says so. jxl-oxide decoding JPEG XL correctly is jxl-oxide's business. */
console.log("\\n...and a host that brings a decoder gets those levels back");
{
  const sc = (key, r, size, enc) => ({ key: key, resolution: r, size: size,
    voxel_offset: [0, 0, 1], chunk_sizes: [[128, 128, 16]], encoding: enc });
  const EW2 = { type: "image", data_type: "uint8", num_channels: 1, scales: [
    sc("16_16_40",   [16, 16, 40],   [81920, 81920, 2064], "jxl"),
    sc("32_32_40",   [32, 32, 40],   [40960, 40960, 2064], "jxl"),
    sc("64_64_40",   [64, 64, 40],   [20480, 20480, 2064], "jxl"),
    sc("128_128_40", [128, 128, 40], [10240, 10240, 2064], "jpeg"),
    sc("256_256_40", [256, 256, 40], [5120, 5120, 2064],   "jpeg") ] };
  sandbox.INFO_FOR = { "https://example/ew2": EW2 };

  let asked = 0;
  const f = (x, y, z) => (x * 7 + y * 3 + z * 13) & 255;
  const stacked = (nx, ny, nz) => {
    const d = new Uint8Array(nx * ny * nz);
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++)
      d[(z * ny + y) * nx + x] = f(x, y, z);
    return d;
  };
  E.configure({ em: "precomputed://https://example/ew2", res: [16, 16, 40],
                decoders: { jxl: async function(){ asked++;
                  return { data: stacked(8, 8, 4), width: 8, height: 32 }; } } });

  const kept = E.sectionScales(EW2);
  ok(kept.length === 5 && kept[0].key === "16_16_40",
     "all five levels are readable once a jxl decoder is in the config",
     kept.map(s => s.key).join(" "));
  const at0 = await E.scaleAt(0);
  ok(at0.scale.key === "16_16_40" && at0.slab === 1,
     "...so mip 0 is the volume's finest again, one section per plane", at0.scale.key);

  /* The chunk goes to the decoder the host named, and comes back in the raw layout — the same
     assertion the JPEG section makes, because the whole point is that it is the same path. */
  const sj = { key: "16_16_40", encoding: "jxl", chunk_sizes: [[8, 8, 4]] };
  const before = asked;
  const full = await E._decodeChunk(new ArrayBuffer(4), sj, [8, 8, 4], [8, 8, 4]);
  let bad = 0;
  for (let z = 0; z < 4; z++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++)
    if (full[x + 8 * (y + 8 * z)] !== f(x, y, z)) bad++;
  ok(asked === before + 1 && bad === 0,
     "a jxl chunk goes to the host's decoder and lands at (x, y, z)",
     (asked - before) + " call(s), " + bad + " wrong of 256");

  /* One decoder does not make every encoding readable. */
  let said = "";
  try { await E._decodeChunk(new ArrayBuffer(4), { key: "k", encoding: "avif", chunk_sizes: [[2, 2, 1]] },
                             [2, 2, 1], [2, 2, 1]); }
  catch (e){ said = String((e && e.message) || e); }
  ok(/avif/.test(said),
     "...while an encoding nothing was supplied for still says so", said || "nothing thrown");

  /* And taking the decoder away puts the volume back where this morning left it — the levels
     are a property of the configuration, not a door that stays open once opened. */
  E.configure({ em: "precomputed://https://example/ew2", res: [16, 16, 40] });
  ok(E.sectionScales(EW2).length === 2,
     "...and configuring without it drops them again", E.sectionScales(EW2).map(s => s.key).join(" "));

  sandbox.INFO_FOR = null;
  E.configure({ em: "precomputed://https://example/em", res: [4, 4, 40] });
}
'''

edit("emtilescheck.js", [

 (u"the section goes after the one it extends",
  u'console.log(fails ? "\\n" + fails + " FAILED" : "\\nall good");',
  SECTION + u'\nconsole.log(fails ? "\\n" + fails + " FAILED" : "\\nall good");'),
])
print("\nNow: node emtilescheck.js  -- expect FAILs, then run src/a_host_can_bring_its_own_decoder.py")
