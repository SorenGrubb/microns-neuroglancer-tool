# -*- coding: utf-8 -*-
u"""A host can bring a decoder, and get its levels back.                                 2026-10-03

This morning core/emtiles.js learned to drop scales whose encoding it cannot decode, which is what
stops Eyewire II's JPEG XL levels being drawn as noise. Søren asked for the other half, and the
reason is a number: at the retina's 128 nm jpeg level a lysosome is FOUR PIXELS across. A whole
cell can be outlined there; an organelle cannot. So a page that carries a JPEG XL decoder has to be
able to get 16 nm back.

CFG.decoders IS {encoding: fn(buf) -> {data, width, height}} — the same shape CFG.decodeJpeg has
had since H01 arrived, because a decoded chunk is a decoded chunk whatever produced it. And the
`decoders` map is what canRead() consults, so the question "what can this module read" still has
exactly one answer in exactly one place. Writing the readable encodings down a second time, next to
the decoders that already define them, is the bug this project keeps paying for; this is the same
refusal as this morning's, held one step further out.

THE JPEG BRANCH BECOMES THE DECODED BRANCH. It was `if (enc !== "jpeg") { ...raw... }` followed by
jpeg-specific code; the decode and the LAYOUT were one block. They are two things: which function
turns bytes into a picture, and how a picture is laid back into a chunk. The layout is identical
for anything that arrives as width × height greyscale, which is what the contract says, so the
jpeg path is now one case of it.

DECODERS ARE CONFIGURATION, NOT A DOOR THAT STAYS OPEN. A configure() without them drops those
levels again — asserted, because the pad's tick turns this on and off and a level list that only
ever grew would leave the mip menu describing scales the page can no longer read.

MEASURED BEFORE IT WAS BUILT, which is why it is opt-in upstream of here. Per 128×2048 chunk in
Chromium: jxl-oxide 45 ms on the volume's lossless 16 nm level and 110 ms on its lossy 32/64 nm
ones, against 8 ms for the browser's own JPEG. A pad view is about twenty chunks. Nothing in this
file knows that; it is why the host only ever puts a decoder here when the user has asked for one.

Check: emtilescheck.js, "...and a host that brings a decoder gets those levels back", written red
first in src/a_host_can_bring_its_own_decoder_check.py.
Run: python3 src/a_host_can_bring_its_own_decoder.py, then node emtilescheck.js
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

 (u"configure keeps the decoders the host brought",
  u"""            /* A replacement JPEG decoder, (ArrayBuffer) -> Promise<{data, width, height}> with one
               byte per pixel. For a check running where there is no browser; a page passes none. */
            decodeJpeg: cfg.decodeJpeg || null };""",
  u"""            /* A replacement JPEG decoder, (ArrayBuffer) -> Promise<{data, width, height}> with one
               byte per pixel. For a check running where there is no browser; a page passes none. */
            decodeJpeg: cfg.decodeJpeg || null,
            /* \u2500\u2500 DECODERS THE PAGE BROUGHT WITH IT \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  2026-10-03
               {encoding: fn}, same contract as decodeJpeg. Named here rather than read off cfg at
               use time because CFG is this module's whole idea of its configuration, and a field
               that lived only on the caller's object would be the one thing a reconfigure could
               not take away \u2014 which is exactly what the pad's tick needs it to do. */
            decoders: cfg.decoders || null };"""),

 (u"canRead asks the config as well as the base set",
  u'''  var CAN_READ = { raw: 1, jpeg: 1 };
  function realScales(info){''',
  u'''  /* ── ...AND WHAT A HOST BROUGHT WITH IT ──────────────────────────  2026-10-03
     CFG.decoders is {encoding: fn(buf) -> {data, width, height}}, the same shape CFG.decodeJpeg
     has. A page that loads one puts the encoding here and the levels come back; a page that does
     not is exactly as it was. Søren asked for this because at the Eyewire retina's 128 nm jpeg
     level a lysosome is four pixels across — a whole cell can be outlined there, an organelle
     cannot. core/jxl.js is the first such decoder.

     STILL ONE QUESTION WITH ONE ANSWER. The readable encodings are the base two plus the keys of
     the map that holds the functions. Nothing else writes the list down, which is the whole
     reason this is here and not in a per-dataset skipScales. */
  var CAN_READ = { raw: 1, jpeg: 1 };
  function canRead(enc){
    return !!(CAN_READ[enc] || (CFG && CFG.decoders && CFG.decoders[enc]));
  }
  function decoderFor(enc){
    if (enc === "jpeg") return (CFG && CFG.decodeJpeg) || browserJpeg;
    return (CFG && CFG.decoders && CFG.decoders[enc]) || null;
  }
  function realScales(info){'''),

 (u"realScales asks canRead rather than the literal",
  u'''      return skip.indexOf(s.key) < 0 && CAN_READ[String(s.encoding || "raw")];''',
  u'''      return skip.indexOf(s.key) < 0 && canRead(String(s.encoding || "raw"));'''),

 (u"the jpeg branch becomes the decoded branch",
  u'''    var enc = String(scale.encoding || "raw");
    /* Reachable only on a volume where EVERY scale is one of these, since realScales drops the
       rest -- which is precisely the case where saying nothing would mean noise on screen. */
    if (!CAN_READ[enc])
      throw new Error("this volume's " + enc + " chunks need a decoder core/emtiles.js does not "
                      + "have — it reads raw and jpeg");
    if (enc !== "jpeg"){''',
  u'''    var enc = String(scale.encoding || "raw");
    /* Reachable only on a volume where EVERY scale is one nothing can read, since realScales drops
       the rest -- which is precisely the case where saying nothing would mean noise on screen. */
    if (!canRead(enc))
      throw new Error("this volume's " + enc + " chunks need a decoder this page does not have "
                      + "— it reads raw, jpeg, and whatever the host configured");
    if (enc === "raw"){'''),

 (u"...and the decode picks the function by encoding",
  u'''    if (JPEG_SEEN && JPEG_SEEN.has(buf)) return JPEG_SEEN.get(buf);
    var img = await ((CFG && CFG.decodeJpeg) || browserJpeg)(buf);''',
  u'''    /* ANY DECODED CHUNK, NOT ONLY A JPEG ONE.  2026-10-03
       Below here was jpeg-specific only in which function it called: the LAYOUT -- an image
       chunk_x wide and chunk_y x chunk_z tall, the sections stacked down it -- is what the
       precomputed format says, not what JPEG says. So the decoder is chosen by encoding and the
       rest is shared, which is how a jxl chunk costs this file four lines rather than a branch. */
    if (JPEG_SEEN && JPEG_SEEN.has(buf)) return JPEG_SEEN.get(buf);
    var img = await decoderFor(enc)(buf);'''),
])
print("\nNow: node emtilescheck.js, then python3 src/build_stamps.py")
