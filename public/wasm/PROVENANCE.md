# Vendored WebAssembly binaries

Served from `/wasm/` at runtime and loaded by raw bytes — see
`lib/codecs/loader.ts`. The vendored `pngquant.js` glue in
`lib/codecs/vendor/` is **modified** from upstream -- see its header comment.
Nothing here is fetched from a CDN, and no bundler
resolves these paths: the worker fetches the file and hands the bytes to the
codec's initialiser.

Licence terms for everything here are in the repo-root `NOTICE`.

| File | SHA-256 | Bytes | Source | Upstream | Licence |
|---|---|---|---|---|---|
| `mozjpeg_enc.wasm` | `24d4177f…9326` | 251,524 | `@jsquash/jpeg@1.6.0` | MozJPEG | BSD-3-Clause + IJG |
| `webp_enc.wasm` | `b6085bb6…6ab7` | 281,261 | `@jsquash/webp@1.5.0` | libwebp | BSD-3-Clause |
| `webp_enc_simd.wasm` | `39c27926…a305` | 345,584 | `@jsquash/webp@1.5.0` | libwebp (SIMD) | BSD-3-Clause |
| `pngquant_bg.wasm` | `3a6b3c7e…b40f` | 349,781 | `icodec@0.6.0` | **imagequant 4.3.3 + oxipng 9.1.2** | **GPL-3.0-or-later** |

Full SHA-256 values are produced by `shasum -a 256 public/wasm/*.wasm`.

## Regenerating

**From `@jsquash`** (mozjpeg, webp, avif) — these are copies of files already in
`node_modules`, so a version bump means re-copying:

```
cp node_modules/@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm public/wasm/
cp node_modules/@jsquash/webp/codec/enc/webp_enc.wasm public/wasm/
cp node_modules/@jsquash/webp/codec/enc/webp_enc_simd.wasm public/wasm/
```

AVIF is **not vendored**: `@jsquash/avif` stalls the Turbopack production build
(Sprint 1.2 bisect), so the codec layer marks the format unavailable and nothing
can load it. Restore `avif_enc.wasm` only alongside a build that completes.

Both WebP variants are required: `@jsquash/webp` picks the SIMD build at runtime
via `wasm-feature-detect`, so the vendored module must match what detection
chose. AVIF's `avif_enc_mt.wasm` is deliberately **not** vendored — it needs
cross-origin isolation, which we do not have and which Phase 3's static export
cannot emit.

**pngquant** — not an npm dependency. Extracted from a published icodec release:

```
npm pack icodec@0.6.0 && tar xzf icodec-0.6.0.tgz
cp package/dist/pngquant_bg.wasm public/wasm/
cp package/dist/pngquant.js      lib/codecs/vendor/pngquant.js
```

Verify against the SHA-256 above before trusting a re-extraction.

Building from upstream source is preferable to trusting this binary: icodec's
`versions.json` does not list its PNG upstreams and its `LICENSE` carries no
third-party notices, so the package under-declares what it ships. The contents
recorded above were determined by reading crate paths embedded in the binary.
To rebuild, compile `imagequant` + `oxipng` to wasm with `wasm-bindgen`.
