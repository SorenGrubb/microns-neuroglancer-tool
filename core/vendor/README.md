# core/vendor — the JPEG XL decoder, and the GIF encoder

`jxl_oxide_wasm.js` and `jxl_oxide_wasm_bg.wasm` are **jxl-oxide-wasm 0.12.6**, unmodified, exactly
as published on npm (`npm pack jxl-oxide-wasm`). Wonwoo Choi, MIT OR Apache-2.0 — both licence
texts are beside them. Source: https://github.com/tirr-c/jxl-oxide

## Why it is here and not on a CDN

Every byte this family serves comes from grubblab.com or from the dataset's own publisher. A third
host in the load path is a third thing that can go away, change, or watch who reads what; 1.7 MB in
the repository is the cheaper of the two prices. It is also the only way the decoder works from a
`file://` page, which is how every Playwright check in this repo opens the tools.

## Why jxl-oxide and not libjxl

Measured in Chromium on 128x2048 grey chunks encoded at Eyewire II's own settings — which is what a
128x128x16 chunk of that volume is:

| | wasm | lossless (its 16 nm) | q75 (its 32/64 nm) |
|---|---|---|---|
| jxl-oxide-wasm | 1.70 MB | **45 ms** | 110 ms |
| @jsquash/jxl (libjxl) | 0.85 MB | 75 ms | 97 ms |
| the browser's own JPEG | — | — | 8 ms |

The 16 nm level is the one you trace on and it is the lossless one, so jxl-oxide wins where it
matters. Note that the LOSSY levels are the slower ones here: jxl-oxide's modular path beats its
VarDCT path. Nothing about that is obvious, which is why it was measured rather than assumed.

## How it is loaded

Never, unless someone ticks "the finest levels" beside the pad on a volume that needs it — see
`core/jxl.js`. It is imported by a module worker built from a Blob, so the glue's URL is passed in
absolute; the wasm is found beside the glue through `import.meta.url`. Nothing on this page touches
it otherwise, and sixty-two of ωJump's sixty-three volumes never will.

## Updating it

`npm pack jxl-oxide-wasm`, copy `jxl_oxide_wasm.js` and `jxl_oxide_wasm_bg.wasm` here, run
`node jxlcheck.js` and `node padjxlcheck.js`. Neither of those loads the real wasm — they drive the
protocol — so open the Eyewire retina in ωJump and tick the box once by hand as well.


---

# `gifenc.js` — the GIF encoder

**gifenc 1.0.3**, unmodified, exactly as published on npm (`npm pack gifenc`). Matt DesLauriers,
MIT — the licence text is beside it as `LICENSE-MIT-gifenc.md`.
Source: https://github.com/mattdesl/gifenc

Søren, 2026-10-03: *"a button to export the view of the show in 3D as an image with scalebar or as
a movie that rotates 360 degrees with the current view."* A GIF because it drops into PowerPoint,
Word, Slack and a web page; nothing in a browser can write MP4, and WebM — smaller and prettier —
is not played by PowerPoint on Windows.

## What it costs

Measured before it was committed to, on a branching cell at the panel's own retina size
(1240 × 600), in Chromium:

| frames | file | grab | palette | encode |
|---|---|---|---|---|
| 36 | 0.15 MB | 1.4 s | 31 ms | 0.3 s |
| 48 | 0.21 MB | 2.0 s | 34 ms | 0.4 s |
| 64 | 0.27 MB | 2.8 s | 37 ms | 0.5 s |

Far smaller than a GIF usually is, for two reasons: the field behind the model is flat, and the
palette is taken **once for the whole turn** from three frames a third of a turn apart. The lighting
does not change as the model turns, so a palette per frame would be slower and the file bigger.

## How it is loaded

Never, unless somebody exports a turn. `core/mesh3dshot.js` fetches this file on the first one and
evaluates it with `new Function("exports", src)` into an object of its own — which is why the file
here is byte-identical to the published CommonJS build, with no browser shim glued to the front and
nothing added to the page's globals.

## Updating it

`npm pack gifenc`, copy `dist/gifenc.js` here, run `node shotcheck.js`. That check hands the source
straight in rather than fetching it, so it holds on a machine with no network — then export one
turn by hand from a tool and look at it.
