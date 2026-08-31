# SmartPress

A fast, offline-capable, local-first compressor for **images and PDFs**. Everything runs in
the browser: no backend, no accounts, no database, no network calls at runtime. Video was
split out to its own repo at tag `v3.0.0-pre-split`.

**Stack:** Next.js 16 (App Router) / React 19 / TypeScript / Tailwind CSS.
Native browser decode + vendored wasm encoders.

**Licence: GPL-3.0-or-later.** SmartPress vendors libimagequant, which is GPL for
open-source use, and serves that binary to every visitor. `LICENSE`, `NOTICE` and
`public/wasm/PROVENANCE.md` carry the terms, and the `/licenses` route makes them
reachable from the running app — which is where the obligation actually lands. A
new dependency gets a `NOTICE` entry before it ships.

## Plan of record

[`SmartPress-v3-Plan.md`](./SmartPress-v3-Plan.md) owns the phases, sprints and open
decision gates. Read it before starting work. It supersedes the v2 build phases.
Changelog lives in [`AI-Logs.md`](./AI-Logs.md) — append an entry when a sprint closes.

## Always-On Constraint

SmartPress must remain **functional at the end of every sprint**. No sprint may leave the
product in a broken or offline state. At minimum, in at least one verified environment
(local or deployed):

- Frontend loads without fatal errors.
- A user can complete one full flow: **upload → compress → download**.
- Errors are rendered as structured UX states (typed error model), not generic crashes or
  silent failures.

## Dev and build use different bundlers

`next dev --webpack` runs webpack; `next build` runs Turbopack. They resolve
wasm-heavy codec packages differently, so **a change that works in dev is not
verified until `next build` completes**.

This is not theoretical. The icodec spike passed in dev and hung Turbopack
indefinitely (two runs, 20 and 30 minutes, against a ~15 s baseline).
`@jsquash/avif` does the same and is disabled for that reason -- see
`lib/codecs/encoders.ts` and the Sprint 1.2 entry in `AI-Logs.md`. Any new codec
or wasm dependency gets a `next build` before it is called done.

### Benchmark and verify against `next build`, never against dev

**A codec number measured in `next dev` is not a result.** Neither is a passing
lazy-load test, a network check, or a "the pipeline works" claim. Run them against
`next build` + `next start`.

The cost of not doing this is already on the record. Sprint 1.2 benchmarked the
codec layer entirely in dev and reported the pipeline as working. It did not work
in a production build at all: Turbopack ships the codec worker as a `blob:` URL,
so `fetch("/wasm/mozjpeg_enc.wasm")` inside the worker threw `Failed to parse URL`
-- a root-relative path has no origin to resolve against a `blob:` base. Under
webpack the worker is served over http and the same code resolves fine. **Every
format failed in production and none failed in dev**, so every 1.2 figure was a
dev-only number until Sprint 1.3 rebuilt them.

This is a class of bug, not one bug. The runtime that executes the code differs
from the runtime that bundled it, and each packaging change moves that boundary
again:

- **The worker's base URL** changes with how the bundler emits it (`blob:` vs a
  served path). Anything resolved relative to the worker is exposed.
- **Phase 3's `output: 'export'`** will move it a third time -- no server, assets
  under a possibly non-root base path, and no header control. Expect the same
  class of failure there and budget a production-artefact test for it, rather than
  discovering it after the export ships.

The rule that follows: when a change touches the worker, the wasm loader, asset
paths, or the build output, the verification that counts is the one run against
the built artefact.

## The codec layer is the compression path

`lib/codecs/` is how compression happens. There is no other path and no fallback:
the Sprint 1.1 canvas `toBlob()` bridge was deleted in Sprint 1.3, having done its
job of keeping the app alive between FFmpeg and wasm.

The arrangement behind the boundary is deliberately **hybrid**, and it is not an
accident to be tidied up:

- **JPEG and WebP** come from `@jsquash/*` packages, per-format dynamic import.
- **PNG is vendored pngquant** (`lib/codecs/vendor/pngquant.js` + `pngquant_bg.wasm`,
  from icodec's build). `@jsquash` has no quantizer at all — `@jsquash/png` and
  `@jsquash/oxipng` are lossless-only, and lossless-only PNG lands near 20% where
  quantization lands near 87%. PNG is therefore a **lossy** format here, with a
  visible radio to switch to lossless. That is what makes the repo GPL.
- **AVIF is stubbed**, `available: false`. `@jsquash/avif` never completes
  `next build`. The capability table keeps its shape and `encoders.ts` carries the
  restore path, so Sprint 2.2 flips one flag — after fixing the build, not instead
  of it.

Nothing above `lib/codecs/` may know any of this. The UI reads availability from
the capability descriptor rather than a hardcoded list, so a format arriving or
leaving is a one-line change in `capabilities.ts`.

**The 0–10 quality scale is calibrated, not decorative.** The per-codec curves in
`quality.ts` are anchored on measured points from the fixture sweep at `/bench`.
Changing an anchor changes output bytes for every user — re-run the sweep and
record the table, rather than adjusting a number because it looks nicer.

## Workers see a different world than the page

Encoding and decoding run in a worker, and in a production build Turbopack ships
that worker as a `blob:` URL. Two consequences that only appear after `next build`:

- **Root-relative URLs do not resolve inside the worker.** `fetch("/wasm/x.wasm")`
  throws "Failed to parse URL" because the worker's base is `blob:`. `loader.ts`
  builds absolute URLs against `location.origin` for exactly this reason.
- **Worker-initiated fetches are invisible** to the page's `PerformanceObserver`
  and to the DevTools network panel. Per-format lazy loading is therefore proven
  behaviourally — remove a binary, confirm the other formats still work, and keep a
  positive control so the test cannot pass vacuously.

Errors also cross that boundary as strings, not `Error` instances. See
`Error Handling`.

## No runtime CDN

Every `.wasm` binary is vendored into `/public` and imported from a local path. No
`unpkg`, no jsDelivr, no runtime fetch to any external origin. v2 fetched ffmpeg-core from
`unpkg.com`, which is exactly what made offline impossible. A new external fetch is a bug,
not a shortcut.

## Working rules

- **Single source of truth for version:** `package.json`. Everything else reads from it —
  never hardcode a version string.
- **No blocking loader.** The dropzone renders immediately; codecs load on first use with
  the spinner scoped to the affected row.
- **Respect sprint scope.** The plan marks work as belonging to a specific sprint. Dead
  code left behind by an in-scope change is expected and gets cleaned in its own sprint —
  leaving it is correct, removing it early creates review noise.
- **EXIF orientation is load-bearing.** Always decode with
  `createImageBitmap(file, { imageOrientation: "from-image" })`, and apply orientation
  before stripping metadata, or portrait phone photos come out sideways.
- **IndexedDB stores settings only.** No `File` objects, no `ImageData`, no previews,
  no blob URLs, no results. A blob URL outlives nothing: restoring one from a previous
  page session is what produced the Patch 1.1a download 404s. The store key is
  versioned (`smartpress:settings:v2`) — bump it rather than migrating, so a stale
  queue cannot come back.
- **The keep-original rule has one home.** `MIN_GAIN_RATIO` and `isWorthKeeping()` live
  in `lib/compression.ts`. An encode that saves less than 3% spent a generation of
  quality for nothing, so the user gets their own file back, under its own filename and
  without the `smartpress_` prefix. Never restate the boundary against a new encoder.
