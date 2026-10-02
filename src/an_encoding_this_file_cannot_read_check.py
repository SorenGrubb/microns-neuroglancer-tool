# -*- coding: utf-8 -*-
u"""The check, first: a scale this file cannot decode must not be drawn.                 2026-10-03

RED BEFORE GREEN. This script only adds the section to emtilescheck.js. Run it, watch the three
new lines FAIL, then run src/an_encoding_this_file_cannot_read.py and watch them pass. The
failures are the evidence that the assertions are about the module and not about themselves.

WHAT IS BEING ASSERTED, and why it is worth a section of its own. Eyewire II's mouse retina
(Ströh et al. 2026, the volume Søren asked for) serves its finest three levels as `jxl` -- JPEG XL
-- and only its coarsest two as jpeg. core/emtiles.js has exactly two branches in decodeChunk:
jpeg, and everything else read as raw bytes. So today a jxl chunk would be a compressed bitstream
interpreted as grey values, drawn confidently, with no error in the console and nothing in the
picture to say so. Noise that looks like tissue is the worst thing this module can produce --
worse than a blank canvas, because a blank canvas is obviously wrong.

The scale list below was read live from the volume's own info on 2026-10-03, not copied from a
paper: five scales, 16/32/64 nm jxl and 128/256 nm jpeg, every one of them keeping a 40 nm
section, chunk 128x128x16, voxel_offset [0,0,1].

Run: python3 src/an_encoding_this_file_cannot_read_check.py, then node emtilescheck.js
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
/* ── AN ENCODING THIS FILE CANNOT READ ────────────────────────────  2026-10-03
   Eyewire II's mouse retina, read live from its own info on 2026-10-03. Its finest three levels
   are `jxl` and its coarsest two are jpeg, and every one of the five keeps a 40 nm section -- so
   nothing in the z rule saves this module from the jxl ones. decodeChunk reads anything that is
   not jpeg as raw bytes, which on a JPEG XL bitstream is noise that looks like tissue.

   Chrome has no JPEG XL decoder (Neuroglancer carries a WASM one, which is why the viewer link
   shows all five levels and the pad cannot). Until this page carries one too, those levels are
   not imagery this module has: it drops them, and if a volume were ALL of them it says so. */
console.log("\\nan encoding this file cannot read is dropped, not drawn");
{
  const sc = (key, r, size, enc) => ({ key: key, resolution: r, size: size,
    voxel_offset: [0, 0, 1], chunk_sizes: [[128, 128, 16]], encoding: enc });
  const EW2 = { type: "image", data_type: "uint8", num_channels: 1, scales: [
    sc("16_16_40",   [16, 16, 40],   [81920, 81920, 2064], "jxl"),
    sc("32_32_40",   [32, 32, 40],   [40960, 40960, 2064], "jxl"),
    sc("64_64_40",   [64, 64, 40],   [20480, 20480, 2064], "jxl"),
    sc("128_128_40", [128, 128, 40], [10240, 10240, 2064], "jpeg"),
    sc("256_256_40", [256, 256, 40], [5120, 5120, 2064],   "jpeg") ] };
  const EW2_EM = "precomputed://https://example/ew2";
  sandbox.INFO_FOR = { "https://example/ew2": EW2 };
  E.configure({ em: EW2_EM, res: [16, 16, 40] });

  const kept = E.sectionScales(EW2);
  ok(kept.length === 2 && kept.every(s => s.encoding === "jpeg"),
     "the three jxl levels are not offered \\u2014 the z rule keeps all five, the decoder does not",
     kept.map(s => s.key).join(" ") || "none");

  const at0 = await E.scaleAt(0);
  ok(at0.scale.key === "128_128_40" && at0.sectionNm === 40 && at0.slab === 1,
     "...so mip 0 is the finest level that is really readable, still one section per plane",
     at0.scale.key + ", " + at0.sectionNm + " nm, slab " + at0.slab);

  const any = await E.scaleAt(0, true);
  ok(any.scale.key === "128_128_40",
     "...and slabOk does not reach them either: this is not a z limit, it is a decoder limit",
     any.scale.key);

  /* The volume with nothing readable in it at all. realScales refuses to empty the list, so the
     jxl scales come back -- and THAT is the path where silence would mean noise on screen. */
  let said = "";
  try { await E._decodeChunk(new ArrayBuffer(4), EW2.scales[0], [128, 128, 16], [128, 128, 16]); }
  catch (e){ said = String((e && e.message) || e); }
  ok(/jxl/.test(said) && /decoder/.test(said),
     "...and a jxl chunk that reached the decoder anyway says so rather than drawing noise",
     said || "nothing thrown \\u2014 it drew the bitstream as grey values");

  sandbox.INFO_FOR = null;
  E.configure({ em: "precomputed://https://example/em", res: [4, 4, 40] });
  ok(E.sectionScales(INFO).length === 3,
     "...and a volume whose every level is raw is exactly as it was", E.sectionScales(INFO).length);
}
'''

edit("emtilescheck.js", [

 (u"the section goes in before the summary",
  u'console.log(fails ? "\\n" + fails + " FAILED" : "\\nall good");',
  SECTION + u'\nconsole.log(fails ? "\\n" + fails + " FAILED" : "\\nall good");'),
])
print("\nNow: node emtilescheck.js  -- expect FAILs, then run "
      "src/an_encoding_this_file_cannot_read.py")
