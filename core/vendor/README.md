# core/vendor — the JPEG XL decoder

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
