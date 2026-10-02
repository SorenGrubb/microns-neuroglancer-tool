# -*- coding: utf-8 -*-
u"""A scale this file cannot decode is not imagery it has.                               2026-10-03

Søren asked for Eyewire II's mouse retina. Its EM is public and it is beautiful, and it serves its
finest three levels as `jxl` -- JPEG XL -- with only the coarsest two as jpeg.

core/emtiles.js had two branches: jpeg, and everything else read as raw bytes. So a jxl chunk
would have been a compressed bitstream interpreted as grey values -- NOISE, drawn confidently,
with nothing in the console and nothing in the picture to say so. That is the worst failure this
module has available to it, because unlike a blank canvas it looks like data, and EM noise and EM
tissue are not easy to tell apart at a glance on a volume nobody here has seen before.

TWO CHANGES, AND THE FIRST ONE IS THE REAL FIX.

1. realScales() drops scales whose encoding this file cannot decode, beside the ones skipScales
   names. So every caller -- the pad, the cell panel, the EM preview, on every tool -- simply
   never sees them, and the retina's mip 0 becomes its 128 nm jpeg level without a single host
   knowing anything about JPEG XL.

   NOT A skipScales LIST PER DATASET, which is what I reached for first. That would have been a
   hand-written list of what the decoder cannot do, kept in a config file, next to a decoder that
   also knows -- one value decided by one expression and matched by a second that drifts from it,
   which is the bug this project has now paid for six times. The decoder already knows. Ask it.

2. decodeChunk() throws on an encoding it cannot read. Reachable only when EVERY scale is one,
   since realScales refuses to empty a volume's list rather than leave it with no imagery at all
   -- and that is exactly the path where silence would put noise on screen.

WHY THERE IS NO THIRD BRANCH. Chrome has no JPEG XL decoder. Neuroglancer shows all five of this
volume's levels because it carries a WASM one; the viewer links this family writes are therefore
unaffected and open at the full 16 nm. CFG.decodeJpeg is the seam if we ever carry a decoder here
too -- add the encoding to CAN_READ on the same day, and the levels come back by themselves.

Check: emtilescheck.js, section "an encoding this file cannot read is dropped, not drawn",
written red first in src/an_encoding_this_file_cannot_read_check.py.
Run: python3 src/an_encoding_this_file_cannot_read.py, then node emtilescheck.js,
     then python3 src/build_stamps.py
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


edit("core/emtiles.js", [

 (u"realScales drops what the decoder cannot read",
  u'''  function realScales(info){
    var skip = (CFG && CFG.skipScales) || [];
    if (!skip.length) return info.scales;
    var kept = info.scales.filter(function(s){ return skip.indexOf(s.key) < 0; });
    return kept.length ? kept : info.scales;
  }''',
  u'''  /* ── ...AND SCALES WHOSE ENCODING THIS FILE CANNOT DECODE ────────────  2026-10-03
     Eyewire II's mouse retina serves 16, 32 and 64 nm as `jxl` (JPEG XL) and only 128 and 256 nm
     as jpeg. decodeChunk below has two branches, jpeg and raw, so a jxl chunk read as raw is a
     compressed bitstream interpreted as grey values: noise, drawn confidently, with nothing
     anywhere to say so. It looks like tissue, which is what makes it worse than a blank canvas.

     ASKED OF THE DECODER, NOT WRITTEN DOWN PER DATASET. The first draft of this named the three
     jxl keys in ωJump's skipScales -- a hand-maintained list of what the decoder cannot do,
     living in a config file beside a decoder that also knows. One value decided in one place and
     matched in a second that drifts from it is this project's recurring bug; CAN_READ is the one
     place, and every tool and every caller inherits it.

     Chrome has no JPEG XL decoder, which is why there is no third branch. Neuroglancer carries a
     WASM one, so the viewer links are unaffected and open at the full 16 nm -- it is the in-page
     section, and only that, which stops at 128 nm on this volume. CFG.decodeJpeg is the seam if
     we ever carry a decoder here: add the encoding to CAN_READ and the levels come back. */
  var CAN_READ = { raw: 1, jpeg: 1 };
  function realScales(info){
    var skip = (CFG && CFG.skipScales) || [];
    var kept = info.scales.filter(function(s){
      return skip.indexOf(s.key) < 0 && CAN_READ[String(s.encoding || "raw")];
    });
    /* A list that emptied the volume is a skipScales typo, or a volume this module cannot read at
       all. One dead mip is a better failure than no imagery -- and in the second case decodeChunk
       says what happened rather than letting the picture lie about it. */
    return kept.length ? kept : info.scales;
  }'''),

 (u"decodeChunk says so instead of drawing it",
  u'''  async function decodeChunk(buf, scale, ch, shape){
    if (String(scale.encoding || "raw") !== "jpeg"){''',
  u'''  async function decodeChunk(buf, scale, ch, shape){
    var enc = String(scale.encoding || "raw");
    /* Reachable only on a volume where EVERY scale is one of these, since realScales drops the
       rest -- which is precisely the case where saying nothing would mean noise on screen. */
    if (!CAN_READ[enc])
      throw new Error("this volume's " + enc + " chunks need a decoder core/emtiles.js does not "
                      + "have — it reads raw and jpeg");
    if (enc !== "jpeg"){'''),
])
print("\nNow: node emtilescheck.js, then python3 src/build_stamps.py")
