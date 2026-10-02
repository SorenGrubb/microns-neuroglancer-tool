# -*- coding: utf-8 -*-
u"""The pad can go and fetch a JPEG XL decoder, if you ask it to.                        2026-10-03

Eyewire II's retina serves 16, 32 and 64 nm as JPEG XL and only 128 and 256 nm as jpeg. Chrome has
no JPEG XL decoder, so core/emtiles.js drops the levels it cannot read and the pad opens at 128 nm
— where a LYSOSOME IS FOUR PIXELS ACROSS. Whole cells can be outlined there; organelles cannot.

core/jxl.js is the decoder (vendored jxl-oxide, in a module worker, booted on demand). This is the
tick that turns it on, and the three things that have to happen when it is ticked.

WHY A TICK AND NOT A DEFAULT, in numbers, measured before any of this was written:

    jxl-oxide    45 ms per chunk on the lossless 16 nm level, 110 ms on the lossy 32/64 nm ones
    browser jpeg  8 ms

A pad view is about twenty chunks, so the finest level costs roughly a second where the jpeg level
costs a sixth of one, plus 1.7 MB of decoder the first time. Sixty-two of ωJump's sixty-three
volumes will never want any of that. So: offered only where it would do something, off until
asked, and nothing is fetched before the asking.

THE TICK ONLY APPEARS WHERE IT WOULD HELP, and emtiles has to be the one to say so — it is the
thing that dropped the levels, and after it has dropped them nobody downstream can tell whether a
volume had any. `unreadableEncodings()` is that answer: the encodings this volume lists that
nothing configured can decode. On every other volume in this family it is empty and the tick is not
in the DOM's way at all.

THE BUFFER IS COPIED BEFORE IT IS TRANSFERRED, and this is the one place a bug here would be
expensive rather than visible. core/segread.js caches a chunk's ArrayBuffer by URL and range, and
core/emtiles.js caches the DECODED plane in a WeakMap keyed on that same buffer. Transferring it to
the worker detaches it — so the second time anything asked for that chunk it would get a zero-byte
buffer, and the cache that exists to make the second section of a tracing free would instead make
it wrong. `buf.slice(0)` costs a quarter of a megabyte of copy against a 45 ms decode.

AND THE MIP NUMBERS MOVE WHEN IT IS TICKED. The menu's option values encode mip indices, and with
the decoder on, mip 0 stops being 128 nm and becomes 16. That is correct and it is why the handler
reconfigures emtiles and calls padRelabelMips() rather than only redrawing: every label on that
menu is computed from the scale list, so they follow by themselves — as long as the list is re-read.

Checks: jxlcheck.js (the decoder's protocol), emtilescheck.js ("a host that brings a decoder"),
padjxlcheck.js (this tick, on the real page).
Run: python3 src/the_pad_can_load_a_jpeg_xl_decoder.py, then node padjxlcheck.js
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

 (u"the volume can be asked what it serves that nothing here can read",
  u'''  function configured(){ return !!CFG; }''',
  u'''  function configured(){ return !!CFG; }

  /* ── WHAT THIS VOLUME SERVES THAT NOTHING CONFIGURED CAN READ ──────────────  2026-10-03
     realScales() drops those levels, and once they are dropped nothing downstream can tell whether
     the volume had any -- a page cannot distinguish "this volume only publishes 128 nm" from
     "this volume publishes 16 nm in a format we cannot open". The pad's JPEG XL tick is the
     difference between those two: it should appear on the Eyewire retina and nowhere else.

     Returns the encodings, not a boolean, because the next one of these will not be jxl. */
  async function unreadableEncodings(){
    if (!CFG) return [];
    var info = await UJ.segread._getInfo(CFG.em), seen = {}, out = [];
    (info.scales || []).forEach(function(s){
      var e = String(s.encoding || "raw");
      if (!canRead(e) && !seen[e]){ seen[e] = 1; out.push(e); }
    });
    return out;
  }'''),

 (u"...and it is exported",
  u'''  return { configure: configure, configured: configured, drawSection: drawSection,''',
  u'''  return { configure: configure, configured: configured,
           unreadableEncodings: unreadableEncodings, drawSection: drawSection,'''),
])


edit("core/tracingcard.js", [

 (u"the decoders the pad has been told to use",
  u'''  return { em: o.em || "", seg: o.seg || "", nuc: o.nuc || "", res: res,
           skipScales: o.skipScales || [],''',
  u'''  /* ── AND THE DECODERS THE PAD HAS BEEN ASKED TO USE ────────────────────────  2026-10-03
     Empty on every volume whose levels the browser can already read, which is all but one of the
     sixty-eight this family offers. See tracingDecoders() and the tick beside the pad. */
  return { em: o.em || "", seg: o.seg || "", nuc: o.nuc || "", res: res,
           skipScales: o.skipScales || [], decoders: o.decoders || tracingDecoders(),'''),

 (u"tracingDecoders, beside the sources it belongs to",
  u'''/* ── THIS DATASET'S CONTRAST, NOT minnie65's ──────────────  2026-09-20''',
  u'''/* ── A DECODER THE PAGE WENT AND FETCHED ─────────────────────────────────────  2026-10-03
   Eyewire II's retina publishes 16, 32 and 64 nm as JPEG XL, which Chrome cannot read, so without
   this the pad opens at the volume's 128 nm jpeg level and a lysosome is four pixels across.

   NULL UNTIL THE TICK IS TICKED AND THE DECODER IS UP, both of them. Null means core/emtiles.js
   drops those levels, which is exactly right while there is nothing to decode them with — a menu
   offering 16 nm before the worker has booted would draw noise or nothing.

   THE BUFFER IS COPIED, and this is the expensive mistake not to make. core/segread.js caches a
   chunk's ArrayBuffer by URL and range and core/emtiles.js caches the decoded plane in a WeakMap
   keyed on that same buffer; transferring it to the worker DETACHES it, so the next read of that
   chunk -- the one the cache exists to make free -- would get zero bytes. A quarter of a megabyte
   of copy against a 45 ms decode is not a trade worth thinking about twice. */
var PAD_FINE = false;
function tracingDecoders(){
  try {
    if (!PAD_FINE) return null;
    if (!(window.UJ && UJ.jxl && UJ.jxl.ready())) return null;
    return { jxl: function(buf){ return UJ.jxl.decode(buf.slice(0)); } };
  } catch (_e){ return null; }
}
/* ── THIS DATASET'S CONTRAST, NOT minnie65's ──────────────  2026-09-20'''),

 (u"the tick, after the segmentation's own line",
  u'''    "<span class=\\"hint\\" id=\\"tracePadSegSay\\" style=\\"flex:1 1 100%\\"></span>",''',
  u'''    "<span class=\\"hint\\" id=\\"tracePadSegSay\\" style=\\"flex:1 1 100%\\"></span>",
    "<!-- A DECODER THE BROWSER DOES NOT HAVE.  2026-10-03. Eyewire II\\'s retina serves its finest",
    "     three levels as JPEG XL; Chrome cannot read them, so the pad opens at its 128 nm jpeg level",
    "     where a lysosome is four pixels across. Hidden on every volume that does not need it --",
    "     emtiles says which those are -- and off until asked on the one that does, because the",
    "     decoder is 1.7 MB and a chunk takes 45 ms against the browser\\'s 8. -->",
    "<label id=\\"tracePadFineWrap\\" style=\\"display:none;font-size:12px;align-items:center;gap:6px;flex:0 0 auto\\" title=\\"This volume publishes its finest levels in JPEG XL, which this browser cannot read, so the pad is showing you the coarsest ones it can. Ticking this fetches a JPEG XL decoder (about 1.7 MB, once) and the finer levels appear in the menu on the left. They are slower: about 45 ms a chunk against 8 for the levels you have now, and a view is around twenty chunks. The decoding happens off the page\\u2019s own thread, so nothing freezes while it loads.\\"><input type=\\"checkbox\\" id=\\"tracePadFine\\"> the finest levels (fetches a decoder)</label>",
    "<span class=\\"hint\\" id=\\"tracePadFineSay\\" style=\\"flex:1 1 100%\\"></span>",'''),

 (u"the tick appears only where it would do something",
  u'''  if (wide0 >= 0 && chunk0 && chunk1 && chunk0 >= chunk1)
    sel.options[wide0].textContent =
      sel.options[wide0].textContent.replace(/, slower to load$/, "");
  return true;
}''',
  u'''  if (wide0 >= 0 && chunk0 && chunk1 && chunk0 >= chunk1)
    sel.options[wide0].textContent =
      sel.options[wide0].textContent.replace(/, slower to load$/, "");
  try { await padFineOffer(); } catch (_e){}
  return true;
}

/* ── OFFER THE DECODER ONLY WHERE IT WOULD DO SOMETHING ────────────────────────  2026-10-03
   Asked of core/emtiles.js rather than of the dataset row, because emtiles is the thing that
   dropped the levels and the only thing that knows a volume HAD any. On the sixty-seven volumes
   whose levels the browser can already read this leaves the label hidden and does nothing else.

   Hidden rather than absent once ticked: the tick stays on screen so it can be unticked, which is
   how somebody who tried the 16 nm level and found it too slow gets back to the fast one. */
async function padFineOffer(){
  var wrap = document.getElementById("tracePadFineWrap");
  if (!wrap) return false;
  var want = [];
  try { want = await UJ.emtiles.unreadableEncodings(); } catch (_e){ want = []; }
  var can = !!(window.UJ && UJ.jxl && UJ.jxl.supported());
  var offer = (PAD_FINE || (want.indexOf("jxl") >= 0)) && can;
  wrap.style.display = offer ? "flex" : "none";
  return offer;
}

/* The tick itself. Three things happen, in this order, and the order is the point: the decoder has
   to be UP before emtiles is reconfigured, because tracingDecoders() returns null until it is --
   reconfiguring first would quietly set no decoders and leave the menu unchanged, which looks
   exactly like the tick not working. */
async function padFineSet(on){
  var say = document.getElementById("tracePadFineSay");
  var box = document.getElementById("tracePadFine");
  var tell = function(t){ if (say) say.textContent = t || ""; };
  if (on){
    tell("Fetching the JPEG XL decoder (about 1.7 MB, once)\\u2026");
    try { await UJ.jxl.start(); }
    catch (e){
      PAD_FINE = false; if (box) box.checked = false;
      tell("The decoder would not load: " + ((e && e.message) || e)
           + " \\u2014 the pad is still on the levels it can read.");
      return false;
    }
  }
  PAD_FINE = !!on;
  try { UJ.emtiles.configure(tracingSources()); } catch (_e){}
  try { await padRelabelMips(); } catch (_e){}
  try { await padDraw(); } catch (_e){}
  tell(on
    ? "The finer levels are in the menu on the left. About 45 ms a chunk against 8, and a view is "
      + "around twenty chunks \\u2014 decoded off the page\\u2019s own thread, so nothing freezes."
    : "Back to the levels the browser reads itself.");
  return true;
}'''),

 (u"and it is wired, beside the pen",
  u'''  const pen = document.getElementById("tracePadPen");
  if (pen){''',
  u'''  /* NOT REMEMBERED, unlike the pen. The pen is a fact about the hand doing the drawing and is the
     same every day; this is a trade against one volume\\'s download, and starting a session by
     silently fetching 1.7 MB because of something ticked last week is not a kindness. */
  const fine = document.getElementById("tracePadFine");
  if (fine) fine.addEventListener("change", function(){ padFineSet(fine.checked); });
  const pen = document.getElementById("tracePadPen");
  if (pen){'''),
])
print("\nNow: node padjxlcheck.js, then python3 src/build_stamps.py")
