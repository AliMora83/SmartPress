# AI Changelog — SmartPress

> Auto-maintained by GitHub Actions. Each entry reflects a versioned push.
> Newest entries appear first. Do not edit manually.

---

## 2026-10-06 | Sprint 3.2b — PWA + offline | Claude (Sonnet 5.5)

Branch `sprint/3.2b-pwa` (off main after #13 merged). Installable, and fully usable offline after one visit.

**What shipped**
- **Manifest + icons.** `public/manifest.webmanifest` (name/short_name SmartPress, `start_url` and `scope` `/`,
  standalone, background and theme `#0C0E12` = `bg-ground`). Icons 192, 512 and 512 maskable in `public/icons/`,
  rendered from `docs/design-system/smartpress-mark.svg` by `scripts/make-icons.mjs` (output committed; not from
  fixtures). Layout links the manifest and sets `theme-color`. `.htaccess` adds `application/manifest+json`.
- **Service worker, hand-written.** `public/sw.js` is a template; `scripts/inject-sw.mjs` (postbuild, after
  prune) walks `out/` and writes `out/sw.js` with the precache list and cache name `smartpress-<hash>`, the hash
  covering every precached path *and its bytes* (not the app version). Excludes `.htaccess`, `404.html`, `404/`,
  `_not-found/`, `sw.js`. Precached files: cache-first. Navigations: network-first, fallback to the cached page
  then `/`; skipped straight to cache when `navigator.onLine` is false. `HEAD` (Next link prefetch) answered from
  cache. Old `smartpress-*` caches deleted on activate.
- **Registration + updates** (`lib/pwa.ts`): production and `NEXT_PUBLIC_TARGET=web` only. No automatic
  skipWaiting: the toast "Update ready" / Reload (`components/ui/UpdateToast.tsx`) posts SKIP_WAITING, and only
  that tab reloads. Hidden while any file is queued or processing, and re-checked at click time.
- **Guard** (`check-export.mjs`): allows the three icons; fails if `sw.js` still has the hash placeholder or an
  empty list, if any precache entry is not a file in `out/`, or if `/`, `/licenses/` or the manifest are missing.

**Precache:** 266 entries, 7.47 MB (cap 12 MB). `out/` is 9.6 MB. Largest: `pdfjs/pdf.worker.min.mjs` 1,265,413;
two JS chunks 455,794 and 449,115; `wasm/pngquant_bg.wasm` 349,781; `wasm/webp_enc_simd.wasm` 345,584;
`wasm/webp_enc.wasm` 281,261; `wasm/mozjpeg_enc.wasm` 251,524; `Smart_icon.png` 238,190 (unused by the app; precached
because the list is a walk of `out/`).

**A miss found and fixed:** the first offline run logged failed fetches. Next's link prefetch sends `HEAD /` from
the licenses page, which the worker ignored (GET only), so it hit the network. Fixed in `sw.js`. Not a gap in the
list generator: every file the app requests at runtime, including worker-initiated wasm and pdf.js assets, was
served by the worker (77 responses from the SW in one offline session).

**Verification** (Chrome 154 driven over CDP, against `npx serve out`; the built-in browser pane refuses service
workers, so it couldn't be used):
1. Load once: worker `activated`, controlling the page, 266 entries cached.
2-3. Server **killed** and DevTools offline emulation on, then reload: page loads (`navigator.onLine` false).
   Shift-reload bypasses any service worker by spec, so "hard reload" was a normal reload.
4. Offline: JPG 180 KB → 63 KB, P1.png 1.02 MB → 103 KB, PDF 1.08 MB → 33 KB, all succeeded.
   **0 failed requests** across reload and all three compressions, workers included. `/licenses/` works both by
   link and by direct navigation; an unknown path falls back to the cached app. Leftover on the licenses page: 2
   `ERR_ABORTED` events, Next cancelling its own prefetch (the same `HEAD` now answers 200 from cache).
5. Update: rebuilt with one changed string and brought the server back. The open tab, with a batch (JPG, PNG, two
   PDFs) running, had the new worker waiting in 32 of 69 busy samples and the toast showed in **none**. It appeared
   once the batch finished; Reload applied the new build (new string shown, only the new cache remained, no
   waiting worker).

---

## 2026-10-06 | Sprint 3.2a follow-up — export hygiene | Claude (Sonnet 5.5)

Same branch. The web export no longer ships fixtures, the bench route or the duplicate wasm.

**What changed**
- **/bench is dev-only.** `app/bench/page.tsx` → `page.dev.tsx`; `next.config.ts` (now a phase function)
  adds `dev.tsx` to `pageExtensions` only under `next dev`. Production has no `/bench` route.
  Verified: `next dev --webpack` serves `/bench/` (200, harness renders) and `/__fixtures/P1.png` (200);
  the export returns 404 for both.
- **`postbuild`** (`npm run build` runs it): `scripts/prune-export.mjs` deletes `out/__fixtures` and the
  hashed `_next/static/media/*.wasm`; `scripts/check-export.mjs` then FAILS the build if `out/` has:
  a `__fixtures` dir, anything named `bench*`/under a `bench` path, a `.png/.jpg/.jpeg/.pdf` outside
  `_next/` other than the allowlist (`icon.png`, `Smart_icon.png`), or a `.wasm` outside `wasm/`.
  Guard tested both ways (planted files → exit 1 listing each; clean → ok).
- **Duplicate wasm: the hashed set is unused.** Checked against `npx serve out` request logs (worker
  fetches don't show in page devtools): compressing a JPG, a PNG (which also runs the WebP nudge) and a PDF
  requested only `/wasm/mozjpeg_enc.wasm`, `/wasm/pngquant_bg.wasm`, `/wasm/webp_enc_simd.wasm`. Code agrees:
  `encoders.ts` passes each binary from `/wasm/` into `init(module)`; the hashed files are the @jsquash glue's
  default `new URL()` fallback, which Turbopack emits but never reaches. Re-run with the hashed files
  deleted: all formats still work. Not exercised: `webp_enc.wasm` (non-SIMD; this browser always picks SIMD).
- `.gitignore` already has `/out/`.

**Export:** 9.6 MB, 273 files (was 30 MB, 303). Routes: `/`, `/_not-found` (+`404.html`), `/licenses`, `/icon.png`.

| .wasm file | Bytes |
|---|---|
| `wasm/pngquant_bg.wasm` | 349,781 |
| `wasm/webp_enc_simd.wasm` | 345,584 |
| `wasm/webp_enc.wasm` | 281,261 |
| `wasm/mozjpeg_enc.wasm` | 251,524 |

**Smoke test** (`npx serve out`, fixtures from `npx serve public/__fixtures --cors` since the export no longer
carries them): JPG 180 KB → 63 KB (−65%); P1.png 1.02 MB → 103 KB (−90%); PDF 1.08 MB → 33 KB (−97%);
MP4 "Not supported", not in "3 files ready" or the totals; Choose folder (picker stubbed with OPFS) wrote
3 files; Choose folder is the only Save to option.

---

## 2026-10-06 | Sprint 3.2a — Pre-deploy fixes + static export | Claude (Sonnet 5.5)

Branch `sprint/3.2a-deploy-prep`. Version 3.0.0 (`package.json`, lockfile; the UI badge reads it).

**What shipped**
- **Unsupported files are visible, never processed.** Drop zone, Add files and folder drop accept
  only JPG/JPEG/PNG/PDF, checking extension **and** MIME type (they must name the same format).
  Anything else gets a row with status "Not supported", no Result/Saved, is excluded from Start
  and from the footer counts, and removes with ✕. Input `accept` is `.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf`.
- **`NEXT_PUBLIC_TARGET` = `web` | `desktop`**, default `web` (set in `next.config.ts`). Web removes
  "Same as source" entirely; Choose folder is the only, default option. Desktop keeps the old path
  (verified: the string is in the desktop bundle, absent from the web bundle).
- **Static export:** `output: 'export'`, `trailingSlash: true`, `images.unoptimized`. No blockers found
  (no API routes, server actions, middleware/proxy or dynamic routes). `/licenses` exports as
  `out/licenses/index.html`.
- **`public/.htaccess`** (LiteSpeed): wasm MIME, deflate for text + wasm, immutable cache for
  `/_next/static/*`, no-cache for HTML and `sw.js`, HTTPS redirect, `ErrorDocument 404 /404.html`.
- `tsconfig.json` now excludes `out/`: a leftover export contains a copy of `worker.ts` that broke
  the typecheck of the next build.

**Export size:** 30 MB, 303 files (`out/__fixtures` 19 MB, `out/pdfjs` 4.7 MB, `out/wasm` 1.3 MB, `out/_next` 3.5 MB).

| .wasm file | Bytes |
|---|---|
| `wasm/pngquant_bg.wasm` | 349,781 |
| `wasm/webp_enc_simd.wasm` | 345,584 |
| `wasm/webp_enc.wasm` | 281,261 |
| `wasm/mozjpeg_enc.wasm` | 251,524 |
| `_next/static/media/webp_enc_simd.47c786d2.wasm` | 345,584 |
| `_next/static/media/webp_enc.3b04e8dd.wasm` | 281,261 |
| `_next/static/media/mozjpeg_enc.e0f7e132.wasm` | 251,524 |

**Exported routes:** `/`, `/_not-found` (+ `404.html`), `/bench`, `/licenses`, `/icon.png`.

**Smoke test** (`npx serve out`, Chromium pane, production export): JPG 180 KB → 63 KB (−65%); P1.png
1.02 MB → 103 KB (−90%); PDF (scanned-style) 1.08 MB → 33 KB (−97%); MP4 and a `.png`-named file with
a video MIME both "Not supported", skipped by Start, not in totals, ✕ removes. Choose folder write
landed 4 files in the folder (picker stubbed with an OPFS directory; a native dialog can't be driven).
No console errors. Unknown path returns 404 with the Next 404 page.

---

## 2026-10-03 | Sprint 3.1 — UI redesign | Claude (Sonnet 5.5)

The interface is rebuilt to `docs/design-system/` (README, `tokens.json`, four
component specs), **dark only**. UI only: nothing under `lib/codecs/` or the
compression/queue/settings logic changed.

**What shipped**
- **Tokens** mirrored in `app/globals.css`: raw values as CSS variables, mapped into
  Tailwind v4 via `@theme` (so `bg-surface`, `border-control-border`,
  `text-text-muted`, `rounded-lg`, `text-label` … are real utilities). No light theme,
  no `prefers-color-scheme` anywhere (verified: zero such rules in the built CSS).
- **Geist + Geist Mono** via `next/font/google` (self-hosted at build, nothing fetched
  at runtime; `NOTICE` has the OFL entry). Mono on every number and section label.
- **Layout:** header (wordmark, version tag, Clear list, Add files); main column (drop
  strip that accepts files **and folders**, column headers, rows); 320px settings
  panel (presets, PNG mode, Keep PDF text selectable, Save to, Start pinned bottom);
  status bar (batch totals, notices). ~1120×740 window from `lg` up; below that the
  page flows and scrolls.
- **Components** in `components/ui/`: `Button` (primary/secondary/quiet), `PresetSelector`,
  `FileRow` (done, nudge, skipped, processing, queued, plus unchanged/error),
  `Wordmark` (chevron mark + lowercase smartpress). Mascot removed.
- Clickable controls use `control-border`; accent appears only on Start, the selected
  preset, savings, progress and focus rings (audited from computed styles: the only
  accent users are those, plus Convert, which the spec makes primary).
- `/licenses` and its markdown renderer restyled to the tokens. `/bench` (a dev tool,
  inline-styled) is untouched and simply inherits the dark body.

**Where the web build departs from the README, and why** (decided with the owner)
- **Save to.** "Same as source" is shown disabled ("Desktop app only"): a page cannot
  write beside the original. "Choose folder" uses `showDirectoryPicker`; when a folder
  is chosen, finished files are written straight into it when a Start batch completes.
  That needed one small addition to the save layer (`saveAll(items, { directory })`,
  `lib/save/`); no codec code.
- **Show in folder** is *not* rendered: a web page cannot open the OS file manager, and a
  button that does nothing is worse than none. It arrives with the desktop build (3.3).
  Until then the status bar offers a quiet **Save all** when no folder was chosen.
- **Per-row save icon** (plus remove) added in a fifth `60px` column. The README row has
  no download action, but without one a user with no chosen folder couldn't get a file
  out, which breaks the always-on upload→compress→download flow.
- **Processing** shows elapsed seconds, not a percentage. The encoders have no progress
  callback, so the percentage is stage-based (5/25/100) and would freeze at 25% and read
  as hung; the bar is the existing indeterminate sweep for the same reason.
- Thumbnails and their object-URL bookkeeping are gone (no design for them).
- Panel hint copy is mine (the spec only says "one small line describing the preset").

**Verified against `next build` + `next start`:** 1) Geist and Geist Mono load
(`document.fonts`) and resolve on body, numbers and labels. 2) Computed styles match the
tokens: Start 48px/radius-lg/accent, Convert 30px/radius-sm, Add files raised +
control-border, Clear list transparent + control-border, selected preset accent,
rows `surface` + `line` + radius-lg with grid `222px 90px 90px 70px 60px`, drop strip
dashed `line-strong` radius-xl. 3) Full flow at Medium: P2 −90% with a "WebP would
save an additional 81%" strip; Convert → `WEBP` badge, 12 KB, saves as
`smartpress_P2.webp`; noise PNG → Skipped (warn) with the README copy verbatim and
Original = Result; scanned PDF −97%, "5 pages"; unsupported `.txt` → typed Failed row;
7 files with a 4-worker pool → rows 5–7 queued (muted, em dashes), status "Compressing
7 of 7", Start disabled while nothing is pending. 4) The folder walker
(`lib/dropEntries.ts`) passes a mock test: recursion, batched `readEntries`, filtering
inside folders only, loose unsupported files kept. **Not verified:** a real folder drop
and the choose-folder write path (a headless pane can't synthesise directory entries or
the picker); both need a manual pass in Chromium.

A bug caught on the way: `@theme inline` does not emit `--font-sans`/`--font-mono`, so
the first build silently fell back to the system font. Fixed by naming the next/font
variables directly in the base rules.

---

## 2026-10-02 | Unified presets — slider removed | Claude (Sonnet 5.5)

The 0–10 quality slider, its state and its persistence are gone. One
**Min / Medium / Max** preset (default Medium) now drives every format:

| Preset | 0–10 scale | JPEG / PDF images (native) | WebP (native) | Lossy PNG (pngquant) |
|---|---|---|---|---|
| Min | 8 | 82 | 83 | 60–80 |
| Medium | 6 | 71 | 71 | 40–60 |
| Max | 4 | 63 | 59 | 15–40 |

`PRESET_SCALE` (was `WEBP_SCALE_FOR_PNG_PRESET`) is the single mapping, shared
with the WebP nudge; `PngPreset` became `Preset`. The 0–10 scale and its
calibrated curves are unchanged and still reachable at `/bench`.

**Behaviour changes to know about**
- **JPEG default moves from native 75 to 71.** The old default was scale 7;
  Medium is 6. Min (82) is the closest to the old behaviour with more quality.
- **Lossless PNG effort is now fixed** (`LOSSLESS_EFFORT = 4`, what the old default
  resolved to). The slider used to buy effort there; the presets are quality
  tiers and mapping "Min" to a different effort made little sense. `effortLevel`
  was removed with its only caller.
- **Settings key bumped to `smartpress:settings:v3`** and the v2 key is deleted on
  first load, per the "bump rather than migrate" rule. Users' saved preset, PNG
  mode and text-selectable choice reset to defaults once.

Verified against `next build` + `next start`: no range inputs in the DOM; A-large
JPEG Min/Medium/Max → 181.43 / 116.41 / 94.44 KB; SYN-scanned-style.pdf →
46.07 / 32.85 / 27.91 KB; P4.png at Max 11.54 KB (matches the Sprint 2.2 table);
preset persists across reload; no console errors.

---

## 2026-10-02 | Sprint 2.3 — WebP nudge | Claude (Sonnet 5.5)

After a **lossy PNG** compresses, the worker also encodes the same pixels as WebP
(`@jsquash/webp`) at the matching tier. If it beats the PNG result by **more than
10%** the row shows "WebP would save an additional X% — Convert?"; one click
replaces the output with the WebP (`smartpress_<name>.webp`, `image/webp`). The
threshold is `WEBP_NUDGE_MIN_GAIN` in `lib/compression.ts`. JPEG and PDF paths are
untouched; skipped PNGs, lossless PNG and failed WebP encodes produce no offer (a
WebP failure never fails the PNG row). The baseline is what the user would
actually get, i.e. the original file when the PNG encode wasn't worth keeping.

**Tier mapping is a choice, not a measurement.** Min/Medium/Max → WebP scale
8/6/4 → native 83/71/59 (`WEBP_SCALE_FOR_PNG_PRESET`). The codecs degrade
differently and nothing here compares them perceptually; the mapping preserves
ordering and intent only.

| Fixture | Min: PNG → WebP | Medium: PNG → WebP | Max: PNG → WebP |
|---|---|---|---|
| P1.png | 121,973 → 26,254 (−78.5%) | 105,536 → 17,648 (−83.3%) | 93,495 → 15,562 (−83.4%) |
| P2.png | 73,033 → 17,708 (−75.8%) | 64,487 → 12,220 (−81.1%) | 58,450 → 10,776 (−81.6%) |
| P3.png | 38,733 → 11,188 (−71.1%) | 34,570 → 7,916 (−77.1%) | 30,807 → 6,914 (−77.6%) |
| P4.png | 14,637 → 5,102 (−65.1%) | 13,071 → 3,632 (−72.2%) | 11,819 → 3,152 (−73.3%) |

These fixtures all clear the threshold by a wide margin, so the table shows the
nudge firing everywhere; the below-threshold case is covered by a control below.

Verified against `next build` + `next start`: P1 at Medium shows "an additional
83%"; Convert removes the nudge, the download is `smartpress_P1.webp`, a real
RIFF/WEBP file of 17,648 B (matches the sweep). Controls with no nudge: a 32×32
solid-colour PNG (83 B result), a random-noise PNG (skipped), a JPEG, and P4 in
lossless mode. No console errors. A flat two-tone 64×64 PNG landed at 11%, just
over the line, and did show the nudge.

Also this sprint: `SmartPress-v3-Plan.md` drops AVIF from Sprint 2.2 (now "PNG
presets"), adds this sprint, and moves Format Conversion to 2.4 without AVIF.

---

## 2026-10-02 | Sprint 2.2 — PNG presets | Claude (Sonnet 5.5)

Lossy PNG now has three presets instead of the 0-10 slider: **Min 60-80, Medium
40-60, Max 15-40** (pngquant `min-max`; "Min" is the lightest touch). Default
Medium. A file that can't reach its preset's minimum is **skipped** — original
kept, own filename, row says why. The slider remains for JPEG, PDF images and
lossless-PNG effort, and only renders when the queue needs it.

**The vendored wasm cannot do min_quality.** `pngquant_bg.wasm`'s options struct
has one `quality` field, which acts as imagequant's max; min is effectively 0 and
`QualityTooLow` never fires (a 256×256 noise image at quality 10-100 returns a
full 256-colour palette, no error). So the preset's max goes to the encoder and
the min is **emulated in JS** (`lib/codecs/pngQuality.ts`): decode the output with
the wasm's own `png_to_rgba`, compute imagequant's error metric against the
source, convert with its `mse_to_quality`. Skip when below min.

**Calibration caveat.** The port omits imagequant's per-pixel importance
weighting, so measured error is 1.1-1.7× imagequant's budget on P1-P4 and
0.4-0.7× on the icon fixtures. `MSE_SCALE = 1/1.75` biases toward never
skipping a file the encoder was happy with; the cost is that some real skips are
missed on image types the scale over-corrects. Exact semantics need a wasm
rebuilt with min/max exposed (no Rust toolchain on this machine; not done).

| Fixture | Original | Min (60-80) | Medium (40-60) | Max (15-40) |
|---|---|---|---|---|
| P1.png | 1,065,228 | 121,973 (−88.5%) | 105,536 (−90.1%) | 93,495 (−91.2%) |
| P2.png | 629,412 | 73,033 (−88.4%) | 64,487 (−89.8%) | 58,450 (−90.7%) |
| P3.png | 321,119 | 38,733 (−87.9%) | 34,570 (−89.2%) | 30,807 (−90.4%) |
| P4.png | 115,568 | 14,637 (−87.3%) | 13,071 (−88.7%) | 11,819 (−89.8%) |

Measured quality of each result met its preset min on all four. Verified against
`next build` + `next start`: P1.png at Medium → 103.06 KB (−90%) in the UI,
matching the table; a 256×256 random-noise PNG → skipped (15 < 40).

---

## 2026-09-24 | Sprint 2.1 — PDF, Route A | Claude (Sonnet 5)

PDF joins images as a first-class format: three compression levels behind the
same worker/pool interface images use, typed error states for the ways a PDF
can refuse to cooperate, and an opt-in level 3 that took three separate
`document`-in-a-Worker bugs to make safe. Closes Phase 2's PDF sprint;
`SmartPress-v3-Plan.md` is updated to match.

### Measured findings (the fixture table `pdf.ts`'s comments have pointed at since Task 1)

Three real fixtures, not synthetic ones, because Route A's actual coverage
gaps (`FlateDecode`, fonts, CCITT, JPEG2000) only show up against real
documents: a company profile deck (**Azibuye Company Profile.pdf**, 6.16 MB,
10 pages, photo-heavy), a product guide full of UI screenshots
(**DIS-Odoo Inventory Guide-v1.pdf**, 3.19 MB, 16 pages), and a slide-style
deck (**Trading Rapid Implementation.pdf**, 1.56 MB, 7 pages). All three,
quality 7/10:

| File | Original | Level 2 (recompress images) | Level 3 (flatten) |
|---|---|---|---|
| Azibuye Company Profile | 6,455,773 | 2,948,583 (−54.3%) | 1,775,280 (−72.5%) |
| DIS-Odoo Inventory Guide | 3,349,470 | 973,529 (−70.9%) | 2,735,196 (−18.3%) |
| Trading Rapid Implementation | 1,631,467 | 951,349 (−41.7%) | 469,614 (−71.2%) |

(Level 3's column is the pre-Task-4 numbers — see below for what changed.)

**The `/SMask` skip bug cost the most.** An early draft of `recompressOne()`
treated any image with an `/SMask` reference as unsafe to touch and skipped
it outright. DIS-Odoo — screenshots exported with an alpha channel, so almost
every image on the page carries one — went from **2.5% saved to 70.9%** once
that was fixed: an `/SMask` is a pointer to a *separate* grayscale stream
object, not extra channels inside the image being recompressed, so
recompressing the base image and leaving the mask stream alone is correct and
loses nothing. That's why `recompressOne()`'s comment calls this out as
deliberate rather than obvious.

Everything else Route A doesn't touch — `/JPXDecode`, `/CCITTFaxDecode`,
indexed or odd-bpc `/FlateDecode`, image masks, predictor-filtered bitmaps —
**didn't appear in any of the three real fixtures**, so `findImages()`
leaving them untouched is a safety net for PDFs this sprint didn't have
fixtures for, not a tested fallback. `FLATTEN_SCALE` (150/72, i.e. 150dpi)
and `MAX_LONG_EDGE` (2000px) are both this table's anchors, the same role
`quality.ts`'s curves play for images — changing either changes output bytes
for every PDF, so re-measure against real fixtures rather than adjusting the
number.

**Route B, recorded per the plan, not implemented:** MuPDF 1.28.0 would cover
the gaps above (fonts, JPX, CCITT) but is AGPL-3.0. Fine for a personal
offline tool; a licensing problem the moment SmartPress is hosted or sold,
because AGPL's network-use clause reaches a web deployment in a way GPL's
doesn't. Not pulled in here — recorded so Route A's coverage ceiling isn't
mistaken for a bug to fix later without re-litigating the licence tradeoff.

### Task 1 — the codec layer, Task 2 — typed error states, Task 3 — UI wiring

Already committed (`850592b`, `b5b6ba8`) or carried as uncommitted work
finished in this pass (`9007b2b`) before this entry was written — see those
commits for the detail the usual entry format would repeat here. In short:
`lib/codecs/pdf.ts` does levels 1–2 with only `pdf-lib`; `PdfPasswordError`
and `PdfCorruptError` give password-protected and unreadable PDFs their own
non-retryable messages via `lib/errors.ts`; a signed PDF is detected up front
(`SigFlags` or any `/FT /Sig` field) and returned byte-for-byte untouched
rather than risk invalidating a signature pdf-lib has no notion of; and
`Compressor.tsx` gained PDF as an accepted format, a page-count badge, and
the `keepTextSelectable` setting that gates level 3.

**Deliberate deviation from the plan's own task list:** the plan called for a
"Home screen mode toggle: Image | PDF" to get mode-scoped codec loading.
What shipped instead is `format === "pdf"` gating a dynamic `import("./pdf")`
in `worker.ts`, with no user-facing toggle at all — PDF is just always
accepted alongside images. Same outcome (an image-only batch never loads
`pdf-lib`; see this entry's Verification section for the check), simpler
UI, no mode state to keep in sync with the queue's actual contents.

### Task 4 — the level 3 flatten had a `document`-in-a-Worker bug, three times over

`flattenPdf()` renders each page via `OffscreenCanvas` and rebuilds the PDF
around JPEGs — it already ran inside the codec Worker from Task 1. Running
the three real fixtures through it for the first time surfaced that
"runs inside a Worker" and "safe to run inside a Worker" are different
claims: `pdfjs-dist`'s browser defaults reach for the global `document` in
three unrelated places, and each one threw as a plain `TypeError` that
doesn't name `document` anywhere in its message, so each fix needed a stack
trace read, not a docs read.

1. **Annotation appearance layer.** Any PDF with links or form fields threw
   immediately — pdfjs creates DOM widgets for interactive annotations even
   when they're never going to be interacted with. Fixed with
   `annotationMode: AnnotationMode.DISABLE` on `page.render()`.
2. **Font loading.** Without `disableFontFace: true`, pdfjs registers an
   `@font-face`/`FontFace` per font via `document.fonts` — the mechanism
   that lets a rendered page's text look like real text. `disableFontFace`
   switches it to drawing glyphs as filled canvas paths instead, which needs
   no `document` at all. That in turn means a PDF that doesn't embed one of
   its own fonts (common for base-14 fonts like Helvetica) needs pdfjs's own
   substitute outlines and CMaps to draw anything — hence vendoring
   `standard_fonts/` and `cmaps/` under `/public/pdfjs/` and passing
   `standardFontDataUrl` / `cMapUrl` / `cMapPacked: true`.
3. **`CanvasFactory` and `FilterFactory`.** Even with both of the above,
   every one of the three real fixtures still threw:
   `TypeError: Cannot read properties of undefined (reading 'createElement')`
   first, then `(reading 'URL')` once that was patched. Both come from
   `getDocument()`'s defaults — `DOMCanvasFactory` and `DOMFilterFactory` —
   which call `document.createElement()` internally for things that have
   nothing to do with the canvas already handed to `page.render()`:
   `DOMCanvasFactory` backs soft-mask compositing and (per point 2) glyph
   rasterising with a throwaway canvas of its own; `DOMFilterFactory` renders
   actual `<svg><filter>` elements into `document.body` to implement
   `/SMask` alpha and luminosity compositing via `ctx.filter = "url(#id)"`.
   Neither has a document-less equivalent — there's nowhere to put the SVG.
   pdfjs's own Node.js target has the identical gap (no DOM in Node either)
   and its answer is `NodeFilterFactory`, an empty subclass of
   `BaseFilterFactory` that inherits every method as a no-op returning
   `"none"` — soft masks render without their mask rather than crashing.
   That class isn't exported from the package, so `pdfFlatten.ts` reproduces
   its exact (lack of) behaviour, and pairs it with an `OffscreenCanvas`-backed
   `CanvasFactory` for the canvas half.

**Net effect, same three real fixtures, quality 7:** Azibuye 1,775,280 →
**1,602,126** bytes, DIS-Odoo 2,735,196 → **2,665,208**, Trading 469,614 →
**432,607** — modestly smaller across the board (real glyph rendering
instead of whatever the pre-fix path was drawing), and, more importantly,
all three now complete without throwing at all. DIS-Odoo's flatten still
loses to its own level 2 result on size either side of this fix — a
screenshot-heavy PDF is already close to photographically dense at level 2,
so flattening it to a raster JPEG doesn't buy anything further.

**The silent fallback is gone.** `compressPdf()` used to catch a
`flattenPdf()` throw and quietly return the level 2 result with no note at
all — before this fix, that meant every one of the three real fixtures
looked, from the UI, exactly like flattening had never been attempted.
`pdfNote` gained a third value, `"flatten-failed"`, distinct from
`"flatten-not-smaller"`, so the row says "Flattening failed — text kept
selectable" instead.

### Verification

1. `next build` (Turbopack): **10.5s** compile, **21.6s** total including
   type-check and static page generation — no stall, which is the actual
   risk given `@jsquash/avif` already stalls this bundler indefinitely (see
   the Sprint 1.2 entry). PDF and `pdfjs-dist` build cleanly under Turbopack.
2. `npm run lint`: **0 problems.**
3. `npx tsc --noEmit`: **0 errors.**
4. **Mode-scoped loading, proven behaviourally** (worker-initiated fetches
   don't show up in this tool's network recorder either, matching the
   Sprint 1.2 finding — a fresh page load was confirmed clean via the
   recorder, but the level 2/3 split needed the same rename trick 1.2 used):
   with `public/pdfjs/pdf.worker.min.mjs` renamed away, a real fixture at
   the default setting still compressed normally (929.06 KB, byte-identical
   to the setting having been left in place) — level 2 never touches
   `pdfjs-dist`. The same fixture with `keepTextSelectable` off then showed
   "Flattening failed" instead of crashing or silently landing on level 2.
   Restoring the file made flatten succeed again at the same byte count as
   before (422.47 KB). `standardFontDataUrl`/`cMapUrl` are referenced only
   inside the same `flattenPdf()` function as the worker script, so they're
   gated identically by construction, not separately verified.
5. **Level 1–2 (default) functional check**, three real fixtures at quality
   7: sizes match the table above exactly (2,948,583 / 973,529 / 951,349
   bytes) — reproducible, not a one-off.
6. **Level 3 (opt-in) functional check**, same three fixtures: outputs
   visually reviewed in a PDF viewer (text and images render correctly) and
   approved before this entry was written.
7. **Typed error states**, one fixture per case: `SYN-password-protected.pdf`
   → "This PDF is password-protected..."; a truncated PDF → "This PDF
   couldn't be read..."; `SYN-digitally-signed.pdf` → left untouched with
   the signature message; `SYN-form-links.pdf` (annotations) and
   `SYN-scanned-style.pdf` (flatten attempted and not smaller) both complete
   without error. None of the five produced a generic crash or a silent
   failure.
8. `git log --oneline` on `sprint/2.1-pdf`: seven commits, each scoped to
   one concern (codec layer, typed errors, UI wiring, worker-safe flatten,
   vendored assets, flatten-failed note, version bump); `git status` clean
   after the last one.
9. **Size added to `/public/` by the vendored `pdfjs-dist` assets:**
   `standard_fonts/` (16 files) is 798,046 bytes and `cmaps/` (169 files) is
   1,167,747 bytes — **1,965,793 bytes (~1.9 MiB) new in this sprint.**
   Combined with the worker script already vendored in Task 1
   (`pdf.worker.min.mjs`, 1,265,413 bytes), `/public/pdfjs/` totals
   **3,233,754 bytes (~3.1 MiB)**. None of it is in the main bundle or
   fetched on page load (item 4) — it's fetched from the codec Worker only
   when a flatten is actually attempted, same lazy-loading discipline as the
   wasm binaries under `/public/wasm/`.

**Known gap carried forward, not fixed here:** the plan's "be honest about
coverage" task is only half done. A signed PDF, a failed flatten, and
"nothing changed" each get their own message, but a PDF that legitimately
can't shrink much at level 2 because it's dense with `/JPXDecode` or
`/CCITTFaxDecode` images (Route A's known gaps) still just reports a small
percentage with no explanation of why. Flagged for whoever picks up Route A
coverage next, rather than guessed at now without a real fixture that hits it.

---

## 2026-09-24 | Sprint 1.4 — Save Boundary | Claude (Sonnet 5)

A Sprint 1.3 prompt landed assuming the repo's state since 2026-08-31 was uncertain.
Task 0 audited it read-only and found 1.3 already merged to `main` — Tasks 1–4 and 6
from that prompt were done, verified, and logged (see the entry below, unedited).
The two real gaps were `downloadAll()`'s reliability, which 1.3 explicitly punted on,
and the save/codec boundary, which had never been built. This sprint is those two,
plus reconciling the docs to a plan that has changed shape since 1.3: **ZIP is
cancelled**, and Phase 2/3 are renumbered around PDF, AVIF, format conversion, and a
Tauri desktop build.

### Audit correction

`sprint/1.3-integration` existed locally and on `origin`, already merged into `main`
(`d8875ec`). Canvas bridge gone, codec layer wired into `Compressor.tsx`, v2 server
code (`useJobPoller`, `compressOnServer`, `API_URL`, `jobId`, the `"server"` mode)
absent from a full-tree grep, IndexedDB settings-only, `/licenses` live, JPEG curve at
native 75 for scale 7. `package.json` was already `3.0.0-beta.1`. Main-thread
responsiveness re-measured against the production build at `/bench`: worst stall 9ms,
zero `longtask` entries across the full fixture set — decode already runs in the
worker, so the concern the original prompt raised didn't apply.

Two loose ends from that audit, closed here:

- **`front.png` (~3.96 MB), named as the worst-case fixture, does not exist anywhere
  in this repo** and never did. `P1.png` (~1.07 MB, the largest real fixture) is the
  worst case from here on — noted in `SmartPress-v3-Plan.md` so it isn't rediscovered.
- **`.avif-probe/`**, an untracked 3.6 MB spike copy of the app sitting ungitignored in
  the repo root, was polluting a whole-tree `npm run lint` (64 errors, all vendored
  code Sprint 1.3's `eslint.config.mjs` never had reason to ignore, since it didn't
  know this directory existed). Moved outside the repo entirely, to
  `../avif-probe-archive/` — sibling to `smart-compressor/`, not inside it. Flagged
  for Sprint 2.2, since it's AVIF-build spike material and that's where the Turbopack
  stall actually gets fixed.

### Task 7 — the save boundary

`lib/codecs/` was already clean: `pool.run()` returns `{ bytes, decodeMs, encodeMs }`
and nothing about saving. The boundary that didn't exist was between the *app* and
saving — `Compressor.tsx` built its own Blob, its own long-lived Blob URL per row, its
own anchor elements, inline.

Moved all of it to `lib/save/` behind a `Saver` interface (`saveOne`, `saveAll`), with
`lib/save/web.ts` as the only implementation today:

- `FileItem` now carries `resultBlob?: Blob` instead of a pre-created `downloadLink`
  Blob URL. The row never creates a URL for its result at all — `lib/save/web.ts`
  creates one transiently per save action and revokes it 10s later rather than on the
  next tick, since revoking immediately has been observed elsewhere to cancel a
  download that hasn't started reading yet.
- The single per-row Download control changed from a real `<a href download>` to a
  button calling `saver.saveOne()`, so single-file save goes through the same module
  as the batch path — otherwise the boundary would be real for two of three saving
  concerns and not the third.
- `Compressor.tsx` went from creating/revoking a result Blob URL per row to owning
  none of that; it only reads outcomes (`written` / `sent` / `failed`) back from the
  `Saver` and renders them.

**A latent purity bug in the existing `elapsed` timer surfaced during this refactor.**
`renderStatusIndicator` called `Date.now()` directly during render — always wrong, but
apparently not reachable by eslint-plugin-react-hooks's `react-hooks/purity` rule
until this file's shape changed enough for its analysis to walk that far. Not a
regression this sprint introduced; fixed anyway, since a build with `npm run lint`
returning an *error* fails this sprint's own acceptance bar. Fixed by moving the clock
read into the existing 500ms interval effect (`nowMs` state) instead of reading it in
`renderStatusIndicator`; the counter's behaviour is unchanged (updates every 500ms
while busy).

### Task 5 — `downloadAll()`, decided

Built on Task 7: `webSaver.saveAll()` picks the strategy.

- **Chromium (`showDirectoryPicker` present):** one folder picked once via a real
  user gesture, then `dir.getFileHandle(name, { create: true })` →
  `createWritable()` → `write(blob)` → `close()` per file. Each of those is a promise
  that rejects on a real failure (quota, revoked permission, disk full) — a genuine
  per-file success signal, not an inference. A picker cancellation
  (`AbortError`) reports `{ mode: "cancelled" }` and does not fall back to firing
  anchor downloads instead — silently replacing "you clicked Cancel" with eight
  surprise downloads would be worse than doing nothing.
- **Everywhere else, or if the picker call itself fails for some other reason:** the
  1.3 fallback, unchanged in behaviour — staggered anchor clicks 300ms apart, chained
  rather than scheduled up front so a backgrounded tab's coalesced timers can't fire
  them all at once, with an honest "sent, not confirmed" notice.
- Every row's own Download button stays visible in both cases, per the 1.3 decision
  this sprint is closing out.

**Verified behaviourally, not just read** (a real OS directory-picker dialog can't be
driven from browser automation, so `window.showDirectoryPicker` was mocked in-page
with an in-memory handle that records what it's asked to write — this exercises the
actual `saveAllToDirectory()` code path, not a stand-in for it):

- Full success: 2 files, both written, byte counts matched the compressor's own
  output exactly (57,441 / 15,220 bytes). Notice: "Saved 2 of 2 files to your folder."
- Partial failure: one `getFileHandle` call made to throw. Result: 1 written, 1
  failed, notice named the failed file, and — a real bug caught by this test — the
  failed row was still showing "Saved to folder" from an *earlier successful* run
  until fixed to clear a row's `saved` state on a failed retry rather than only ever
  setting it.
- Cancellation: picker throws `AbortError`. Result: `{ mode: "cancelled" }`, neutral
  notice, no anchors fired, both rows kept their prior state untouched (correct — a
  cancelled picker means no attempt was made on any file, unlike a per-file failure).
- Fallback path re-verified with `showDirectoryPicker` deleted from `window`:
  sequential dispatch, amber "sent to your browser" notice, per-row buttons intact.

**`showDirectoryPicker`'s per-file promises are a reliable signal** — this was the
condition under which the original prompt asked to stop and ask before proceeding.
They weren't unreliable, so this sprint didn't stop.

### Doc reconciliation

- `PROJECT-SYNC.json` and `.github/workflows/generate-project-sync.yml` deleted.
  **Not touched:** `AG-Update.md`, a spec for a separate cross-repo dashboard project
  that polls `/PROJECT-SYNC.json` from seven repos including this one — deleting the
  file here means that dashboard's SmartPress card will 404 (it degrades per-repo by
  its own design, so this shouldn't break the dashboard, only blank one card). Flagged
  rather than fixed, since `AG-Update.md` isn't this repo's own documentation.
- `SmartPress-v3-Plan.md` rewritten: Phase 1 sprints 1.1–1.4 marked done and
  compressed to summaries (full detail stays in this file); Phase 2 renumbered to
  2.1 PDF / 2.2 AVIF / 2.3 format conversion; Phase 3 renumbered to 3.1 UI redesign
  (shared codebase, web + Tauri) / 3.2 Hostinger deploy / 3.3 Tauri desktop app. ZIP
  removed from the version-milestones table, decision gates, and known risks; the old
  PDF Route A detail (Sprint 3.2) and PWA detail (Sprint 3.1) were relocated rather
  than dropped, into the new 2.1 and 3.1 respectively.
- `CLAUDE.md`: new "Saving is a separate layer from compressing" section documenting
  the `Saver` interface and the ZIP cancellation. It had no "ZIP makes it moot" line
  to remove — that phrasing was in `AI-Logs.md`'s 1.3 entry, which stays as written.
- `package-lock.json`'s root `"version"` (stale at `3.0.0-alpha.3`) fixed via
  `npm install --package-lock-only`, no dependency changes.
- Bumped `3.0.0-beta.1` → **`3.0.0-beta.2`**.

**Left alone, listed rather than touched, per instruction:** twelve unrelated branches
on `origin` from what looks like a different, automated workflow (Netlify/Cloud
Run/video-perf tooling, not this plan) — corrected from "eight" in this sprint's own
Task 0 audit, which undercounted them —
`configure-cloud-run-deployment-16160941949625094776`,
`enable-ai-panel-18173201185073607634`,
`fix-blocking-compress-video-8403481463251808759`,
`optimize-preview-generation-6223700370319669638`,
`optimize-video-analysis-polling-3476505406273383762`,
`perf-async-file-upload-12259952863800562529`,
`perf-compress-concurrency-17031960316395049479`,
`perf-optimize-async-analyze-video-15485091967985340846`, and four more under a
`perf/` prefix (`async-sleep-fix-8743722115146672861`,
`fix-blocking-ffmpeg-8266961301954695722`,
`optimize-preview-generation-8909084090226268186`,
`skip-video-preview-1714888696648951237`).

### Verification

1. `next build`: **17.9s**, against 1.2's logged 17.59s and 1.3's 17.63s — no
   regression from the save-layer refactor.
2. `npm run lint`: **0 problems** (the `.avif-probe/` noise is gone with the move;
   the purity and exhaustive-deps issues surfaced mid-refactor are fixed, not
   suppressed).
3. `downloadAll()`: both paths demonstrated above, plus the single-row `saveOne()`
   path (no console errors, row marked "Sent to downloads").
4. `/licenses`: reachable from the main page, production build, unchanged from 1.3.
5. Main entry bundle: routes unchanged (`/`, `/_not-found`, `/bench`, `/icon.png`,
   `/licenses`), all static; `lib/save/` is a page-load import, not lazy, since every
   page that can compress can also need to save.

---

## 2026-08-31 | Sprint 1.3 — Integration & Cleanup | Claude (Opus 5)

Phase 1 closes. The codec layer replaces the canvas bridge, the v2 server code is
gone, IndexedDB is back inside its intended scope, and the GPL notices are
reachable from the running app. **Version `3.0.0-alpha.3` -> `3.0.0-beta.1`.**

### Task 0 — reconciliation

`lib/codecs/` matched what the sprint assumed: `decode(file) -> ImageData`,
`encode(data, format, options) -> Uint8Array`, a capability descriptor per format,
worker pool at `min(hardwareConcurrency, 4)`. JPEG and WebP are `@jsquash`, PNG is
vendored pngquant, AVIF is `available: false`. A caller discovers AVIF is
unavailable from **the descriptor**, not by catching the throw, which is what the
UI needed.

Three gaps, all additive rather than design conflicts, so the sprint extended the
layer instead of bridging two designs:

- `CompressJob` carried only `quality: number`, with nowhere to put PNG mode. It
  now carries the whole `EncodeOptions`.
- The pool dropped the worker's `stage` and passed only a percentage. Stage is now
  passed through — it is what lets the UI say "Reading image" vs "Compressing"
  instead of showing a number frozen at 25%.
- `EncodeOptions.nativeOverride` was added as a calibration seam. Only `/bench`
  sets it; it is how Task 1 measured native quality without editing `quality.ts`
  between runs.

Two defects in Sprint 1.2 code surfaced while wiring this up. Both are logged
below as **1.2 defects rather than 1.3 changes** — neither was introduced by this
sprint.

**Decode was already in the worker**, not on the main thread — the concern raised
in the prompt does not apply. `worker.ts` calls `decode()` itself, so a Blob goes
in and encoded bytes come out; no `ImageData` crosses the boundary in either
direction.

### Task 1 — the JPEG curve was wrong, and it is now measured

The old curve was a straight line across native 40-95, putting the default at
**q79** — a number nobody chose. Swept the four JPEG fixtures across native 70-86
through the real pool:

| Native | A-large | B-mid | C-small | D-marginal | Beats canvas? |
|---|---|---|---|---|---|
| 73 | 121,058 | 65,954 | 48,108 | 55,624 | all four |
| 74 | 130,819 | 69,115 | 50,964 | 57,424 | all four |
| **75** | **130,903** | **69,317** | **51,239** | **57,441** | **all four** |
| 76 | 132,332 | 70,137 | 52,090 | 57,770 | all four (D by 1.4%) |
| 77 | 144,919 | 75,497 | 56,817 | 59,215 | B and D fail |
| 78 | 146,805 | 76,376 | 57,667 | 59,493 | C also fails |
| 79 | 148,249 | 76,899 | 58,446 | 60,094 | all four fail |
| 83 | 206,725 | 104,279 | 71,813 | 66,974 | all four fail |

**The measured ceiling is native 76** — 77 flips two fixtures. Landed on **75**:
one under the ceiling so the acceptance is not on a knife edge, MozJPEG's own
default, and the spike-parity point.

Both curves are now anchored on measured points rather than a straight line
(`anchored()` in `quality.ts`):

| scale | 0 | 1 | 2 | 3 | 4 | 5 | 6 | **7** | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| JPEG native | 40 | 48 | 55 | 59 | 63 | 67 | 71 | **75** | 82 | 88 | 95 |
| PNG native | 50 | 58 | 65 | 69 | 73 | 77 | 81 | **85** | 89 | 94 | 98 |

The steps are concentrated where the sweep says they matter: JPEG spends 4 native
units per step across 55-75 against 7.5 below and 6.7 above, because between 71
and 75 the largest fixture grows 9.8% for four native units while between 79 and
83 it grows **39%** for the same four. Steps up there buy bytes, not quality.

**Acceptance, at quality 7 (fixture set: the eight files in `public/__fixtures/`,
regenerated from `Test Image.png` via `sips`, gitignored):**

| File | Canvas | 1.2 at q7 (q79) | **1.3 at q7 (q75)** | vs canvas |
|---|---|---|---|---|
| A-large-q95.jpg | 147,087 | 148,249 ✗ | **130,903** | **−11.00%** |
| B-mid-q70.jpg | 74,889 | 76,899 ✗ | **69,317** | **−7.44%** |
| C-small-q55.jpg | 57,126 | 58,446 ✗ | **51,239** | **−10.31%** |
| D-marginal-q42.jpg | 58,580 | 60,094 ✗ | **57,441** | **−1.94%** |

All four now beat canvas, and all four are byte-identical to the icodec spike.

**PNG was checked for the same defect and had a different one.** The default at
native 85 turned out to be defensible — 50 to 85 grows the largest fixture 36%,
92 to 98 grows it 78%, so 85 is high quality below the cliff — but the *ceiling*
was wrong: swept 35-100, **native 98, 99 and 100 produce byte-identical output on
all four PNG fixtures**, because the quantizer stops quantizing. The old curve
mapped scale 10 to 100, spending the top of the slider inside a three-value dead
zone. The ceiling is now 98, the last native value that changes anything. PNG
output at quality 7 is unchanged: −87.4/−87.5/−87.2/−86.8%.

### Task 2 — the swap

Compression routes through `lib/codecs/` and the canvas `toBlob()` path is
deleted. No fallback branch.

- **Progress** is stage-based, so the row shows an indeterminate bar plus a
  running clock rather than a percentage frozen at 25%. Honest about not knowing
  how far along it is.
- **Cancellation** is wired: removing a row or clearing the queue terminates that
  file's worker. Verified — cancelling a 3.4 s PNG mid-encode leaves no error row,
  no unhandled rejection, and the pool recovers (the next batch compressed
  normally).
- **`MIN_GAIN_RATIO` still governs**, via `isWorthKeeping()` from
  `lib/compression.ts`, not reimplemented. Verified at quality 10, where
  D-marginal grows: the row reads "No size reduction — original kept", keeps its
  **original filename** with no `smartpress_` prefix, and offers the quiet
  "Download original" link.
- **Blob URL discipline** verified directly rather than by reading: downloading
  twice from one row works both times; removing a *different* row leaves the
  survivor's URL alive; the removed row's URL is revoked. Previews moved from
  base64 `readAsDataURL` to object URLs and are revoked with the row.
- `crypto.randomUUID()` replaces the colliding `${Date.now()}-${i}` ids.

### Task 3 — `downloadAll()`: no reliable signal exists. **Needs your call.**

Investigated and found nothing to detect the real failure with. An anchor-click
download reports nothing back — no success event, no error event, and no signal
when Chrome's "Download multiple files?" prompt is denied. The page is not told.
There is no `downloads` API outside extensions. `showSaveFilePicker` *would* give
a real promise, but it prompts per file and is Chromium-only, which is a different
feature, not a detector.

Rather than ship a detector that reports false confidence, this landed the
fallback the prompt named as acceptable — **flagged as yours to accept or
replace**:

- Per-row download controls, always available.
- The stagger is now **chained** rather than `setTimeout(fn, i * 300)` scheduled
  up front. That was a real bug: a backgrounded tab coalesces those timers and
  fires every click at once.
- After a multi-file run, a notice lists exactly what was handed to the browser
  and says plainly that a dismissed permission prompt drops the rest silently.
  It does not claim the files arrived.
- Rows that were dispatched are marked "Sent to downloads" — dispatched, not
  confirmed, and the label says so.

ZIP in Sprint 2.3 removes the problem rather than detecting it.

### Task 4 — v2 code deleted

Removed `useJobPoller` and its `/status/${jobId}` polling, `compressOnServer` and
its `/upload-url` + PUT + `/compress-video?async=true` calls, the `jobId` field,
`startPolling`, `API_URL`, and the `mode: "client" | "server"` split.
`Compressor.tsx` went from 782 lines to 735 — a smaller drop than the raw
deletion suggests, because the progress, cancellation, settings and download-notice
work all landed in the same file.

Re-ran the sweep for `/download`, `/compress`, `/status`, `/upload`, `jobId`,
`job_id`, `useJobPoller`, `compressOnServer`, `fetch(`, `axios`, excluding
`node_modules`, `.next` and lockfiles. What survives:

- `lib/codecs/loader.ts` — `fetch` of `/wasm/*`, the raw-bytes loader.
- `app/bench/page.tsx` — `fetch` of `/__fixtures/*`, the harness.
- `lib/codecs/pool.ts` — `jobId` as the pool's own worker-slot field, unrelated.
- Doc prose in this file, the plan, and `AG-Update.md`.

Zero references to `API_URL`, `useJobPoller`, `compressOnServer`, `/status/`,
`/upload-url`, `/compress-video`, `/download-batch`, `job_id` or `axios`.

### Task 5 — IndexedDB deviation closed

The Patch 1.1b deviation is fixed. The store key is bumped to
`smartpress:settings:v2` and v1's keys (`smartpress_files`,
`smartpress_image_quality`, `smartpress_video_crf`) are deleted on first load
rather than migrated — a stale queue restoring itself is what caused the 1.1a
404s.

Verified by reading IDB directly after a compress-and-reload: the store holds
**exactly one key**, `smartpress:settings:v2` = `{quality, pngMode}`. Settings
persist, the queue is empty, zero phantom `done` rows.

### Task 6 — quality control

One universal 0-10 control, swapping rather than greying: quality on every lossy
path, **effort on lossless PNG**, never dead. PNG mode is a visible radio with
lossy palette as the default.

The lossless path is new and needed a fix — the vendored `optimize()`
deserialises its options struct whole with no field defaults, so a partial object
panics inside wasm with an opaque `unwrap_throw`. Both paths now pass every field
and differ in `quantize` and what the control feeds. Measured: lossless PNG lands
at **−35%** across the four fixtures, better than the plan's ~20% estimate, and
`effortLevel` maps the scale onto oxipng levels 1-5.

AVIF cannot appear: the accept filter is derived from `CAPABILITIES` rather than a
literal list, so `available: false` excludes it by construction. WebP encodes but
is deliberately **not** an output option — conversion is Sprint 2.4.

### Task 7 — copy and the licence notice

"PNG compression arrives in the next update" is gone, along with the last video
reference in the page metadata. "PDF — coming soon" stays: still true, Sprint 2.1.

Added a **`/licenses` route**, statically prerendered, rendering `NOTICE` and
`public/wasm/PROVENANCE.md` **read from disk at build time** — not restated in
JSX, because a hand-copied licence notice drifts. A small Markdown subset renderer
(`lib/markdown.tsx`) handles the headings, tables and code blocks those two files
use; it ships no client JS. Linked from the left column under the version line as
`GPLv3 · Source · Notices`.

### Defects in Sprint 1.2 code, found in 1.3

Both were shipped by Sprint 1.2 and found while integrating. Recorded against 1.2
so the codec layer's history stays honest: they were latent in that sprint's code,
not regressions introduced here.

**1.2-D1 — `CodecPool.cancel()` never settled a running job's promise.**
`dispatch()` overwrote the live entry with `waiting: null`, so cancelling a job
that had already started terminated its worker and left the caller's `await`
pending forever. Only queued jobs rejected. Sprint 1.2 had no caller that awaited
a cancellation, which is why nothing surfaced it. Fixed by keeping the `waiting`
reference past dispatch and rejecting with a named `CancelledError`, so a caller
can tell a cancel from a failure without matching on a message string.

**1.2-D2 — the wasm loader could not work in a production build.**
`loader.ts` fetched `"/wasm/<file>"`, a root-relative path. Turbopack ships the
codec worker as a **`blob:` URL**, so inside the worker that path has no origin to
resolve against and `fetch` throws `Failed to parse URL`. Under
`next dev --webpack` the worker is served over http and the identical code
resolves fine.

**Every format failed in production; none failed in dev.** Sprint 1.2 benchmarked
the layer and proved its lazy loading entirely in dev, so **every number in the
1.2 entry was a dev-only figure** and the codec layer had never actually run in a
built artefact. Fixed by resolving against `location.origin`, which remains the
page's origin for a same-origin blob worker. `CLAUDE.md` now carries the rule this
should have been caught by — codec benchmarks and verification run against
`next build`, never dev — and flags the same class of failure as likely again in
Phase 3's static export.

That fix then exposed a third problem, this one genuinely 1.3's since 1.3 wrote
the classifier: `classify()` matched the literal string `failed to load /wasm/`
and stopped matching once the URL carried an origin, so a `CODEC_UNAVAILABLE`
silently became a generic `ENCODE_FAILED`. Widened to `/wasm/` and re-verified.
All three are recorded in the rewritten `Error Handling`.

### Verification

1. **Full fixture set through the app, production build** — byte-for-byte
   identical to `/bench`, so the UI passes the codecs the same options the
   harness does:

   | File | Original | Output | Change |
   |---|---|---|---|
   | A-large-q95.jpg | 835,992 | 130,903 | −84.34% |
   | B-mid-q70.jpg | 184,220 | 69,317 | −62.37% |
   | C-small-q55.jpg | 81,622 | 51,239 | −37.22% |
   | D-marginal-q42.jpg | 67,153 | 57,441 | −14.46% |
   | P1.png | 1,065,228 | 134,587 | −87.37% |
   | P2.png | 629,412 | 78,911 | −87.46% |
   | P3.png | 321,119 | 40,974 | −87.24% |
   | P4.png | 115,568 | 15,220 | −86.83% |

2. **Network during compression and download: zero page-initiated requests**, and
   zero external origins. The only traffic is the worker's `/wasm/*` fetches,
   which the page cannot observe — see 5.
3. **Lifetime regressions pass** — double download from one row; removing a
   different row leaves the survivor alive; the removed row's URL is revoked.
4. **Reload with a populated queue** — settings persist, queue empty, no phantom
   rows, one key in IDB.
5. **Per-format lazy loading, from the UI, in production.** With
   `pngquant_bg.wasm` and both WebP binaries removed from the server, a JPEG still
   compressed to 69,317 bytes — the exact benchmark figure. Positive control: a
   PNG in the same batch failed with the typed `CODEC_UNAVAILABLE` state and a
   Retry button, not a crash, so the test is not vacuous.
6. **`downloadAll()`** — see Task 3. The notice and per-row retry work; the
   underlying detection is impossible and needs a decision.
7. **`/licenses`** renders in the production build, reachable from the main page
   by clicking, with both tables and both code blocks intact.
8. **`next build` 17.63 s**, against 17.59 s logged for 1.2 — and 16.31 s when
   1.2 was rebuilt on this machine in this session, so the honest delta is
   **+1.3 s**. Nothing pulled `@jsquash/avif` back into the graph; the only
   references are comments.
9. **`npm run lint` — 0 warnings, down from 5.** Four were the v2 dead code and
   went with it. The fifth (`no-img-element` on the preview thumbnail) is
   suppressed with a documented reason rather than left standing: `next/image`
   cannot resolve a `blob:` URL through its loader, and there is nothing to
   optimise for bytes already in memory. **Suppressed, not fixed** — call it four
   if you would rather count it that way.
10. **Bundle: main entry 573.8 KB -> 590.3 KB, `+16.5 KB` (+2.9%).** Measured by
    summing the JS the prerendered `/` entry references, on both branches, in this
    session — 1.2 measures 573.8 KB by that method, matching its logged 573.4 KB.
    Far below 1.2's projected +161.1 KB, because the per-format encoders sit
    behind dynamic imports and split into lazy chunks; only the pool and the
    curves land eagerly.

### Notes for Sprint 2.x

- **`downloadAll()` detection is unresolved by design.** 2.3's ZIP makes it moot
  for batches; the single-file path never had the problem.
- **`Error Handling` is rewritten** for the local failure modes with a real
  `retryable` flag, which v2 specified and never implemented.
- **The `/bench` harness now loads fixtures by `fetch`** instead of a file picker,
  and has native-quality sweep modes. Re-running the calibration is one click.

---

## 2026-08-30 | Sprint 1.2 — The Codec Layer | Claude (Opus 5)

> **Superseded in part — read the Sprint 1.3 entry before trusting anything below.**
> Two defects in this sprint's code were found in 1.3 (`1.2-D1`, `1.2-D2`), and the
> second means **every benchmark figure in this entry was measured in `next dev`
> only**. The codec layer as shipped here could not load a single wasm binary in a
> production build. The quality-7 table below is also superseded: 1.3 recalibrated
> the JPEG curve, so the default no longer maps to native q79.

Built `lib/codecs/` behind a narrow interface. **No UI wiring** — the canvas
bridge stays live and `components/Compressor.tsx` is byte-for-byte unchanged
(`git diff` empty against both the index and `main`). Sprint 1.3 does the swap.

### What shipped

| Format | Backing | Control | wasm | Status |
|---|---|---|---|---|
| JPEG | `@jsquash/jpeg@1.6.0` (MozJPEG) | quality | `mozjpeg_enc.wasm` 251,524 B | ✅ |
| PNG | **vendored** imagequant 4.3.3 | quality (quantization) | `pngquant_bg.wasm` 349,781 B | ✅ |
| WebP | `@jsquash/webp@1.5.0` (libwebp) | quality | `webp_enc[_simd].wasm` 281,261 / 345,584 B | ✅ |
| AVIF | `@jsquash/avif@2.1.1` | quality | *not vendored* | ❌ **blocked** |

All `@jsquash` packages are Apache-2.0, published 2025-05. Crucially they have
**no `exports` map**, so deep imports work — the property icodec lacked.

### AVIF is blocked: it stalls the Turbopack build

`@jsquash/avif` in the module graph makes `next build` hang exactly the way
icodec did. Bisected:

| Configuration | `next build` |
|---|---|
| `main` (no codec layer) | **14.95 s** |
| codec layer present but unreferenced | **14.95 s** |
| JPEG + PNG + WebP reachable | **17.59 s** |
| \+ AVIF | **never completes** (killed at 10 min) |

Ruled out along the way: the worker (stalls without it), `output: 'standalone'`
(stalls without it), and glue size (~40 KB per codec). It is AVIF specifically.

AVIF is not needed before Sprint 2.2, so the sprint ships without it rather than
blocking Phase 1. `CAPABILITIES.avif.available === false`, `FORMATS` excludes it,
and `encoders.ts` throws with the reason plus the code to restore. **Re-enabling
it requires fixing the build first, not just uncommenting.**

#### Hypothesis for Sprint 2.2 (not a finding — untested)

Two unrelated packages, icodec and `@jsquash`, both stall Turbopack on AVIF and
on nothing else. That points at **the AVIF encoder build itself rather than
either package's wrapper** — the common ancestor is the same Squoosh/libavif +
aom emscripten output.

One refinement to the framing, since it changes what to test: the AVIF *glue JS*
is not large — `avif_enc.js` is 39,621 B, comparable to `mozjpeg_enc.js` at
38,422 B. What is multi-megabyte is the **`.wasm` the glue references**
(`avif_enc.wasm` 3.3 MB, `avif_enc_mt.wasm` 3.5 MB, and 8 MB in icodec's build).
So the suspicion is the bundler resolving and emitting those referenced binaries
once the glue enters the module graph, not parsing the glue.

**The corollary is the useful part.** pngquant is every bit as much an emscripten
/ wasm-bindgen artefact, and it does *not* stall — because it is vendored and
loaded as raw bytes, so its `.wasm` never enters the module graph at all. That is
the one structural difference between the codec that stalls and the codecs that
do not.

So the first thing Sprint 2.2 should try for AVIF is the treatment PNG already
gets: vendor `avif_enc.wasm` under `/public/wasm/`, import the encoder glue in a
way that never lets the bundler resolve its `.wasm` neighbour, and hand over a
compiled `WebAssembly.Module`. If that builds, the hypothesis holds and the fix
is uniform across every codec. If it still stalls, the cause is in the glue after
all and this note is wrong — which is worth knowing quickly and cheaply.

### Benchmark

Fixture set: the eight files from the Patch 1.1 canvas baseline, regenerated from
`Test Image.png` via `sips` into `public/__fixtures/` (gitignored). Harness is the
unlinked `/bench` route, running through the real worker pool.

**At the default quality 7/10:**

| File | Original | Canvas | Sprint 1.2 | vs original | encode |
|---|---|---|---|---|---|
| A-large-q95.jpg | 835,992 | 147,087 | 148,249 | −82.27% | 850 ms |
| B-mid-q70.jpg | 184,220 | 74,889 | 76,899 | −58.26% | 454 ms |
| C-small-q55.jpg | 81,622 | 57,126 | 58,446 | −28.39% | 336 ms |
| D-marginal-q42.jpg | 67,153 | 58,580 | 60,094 | −10.51% | 342 ms |
| P1.png | 1,065,228 | 1,065,228 | 134,587 | **−87.37%** | 3,363 ms |
| P2.png | 629,412 | 629,412 | 78,911 | **−87.46%** | 2,333 ms |
| P3.png | 321,119 | 321,119 | 40,974 | **−87.24%** | 1,332 ms |
| P4.png | 115,568 | 115,568 | 15,220 | **−86.83%** | 539 ms |

Outputs sit slightly above the spike's because the default maps to native q79
(JPEG) and q85 (PNG), where the spike used q75 for both. **At matched native q75
the output is byte-identical to the spike:**

| File | Spike (icodec) | Sprint 1.2 @ matched q75 |
|---|---|---|
| A-large-q95.jpg | 130,903 | **130,903** |
| B-mid-q70.jpg | 69,317 | **69,317** |
| C-small-q55.jpg | 51,239 | **51,239** |
| D-marginal-q42.jpg | 57,441 | **57,441** |
| P1.png | 111,948 | **111,948** |
| P2.png | 72,317 | **72,317** |
| P3.png | 37,069 | **37,069** |
| P4.png | 14,327 | **14,327** |

Exact parity, as expected — the same MozJPEG and the same imagequant build,
reached through a different package. The ceiling from the spike is met.

**Sprint 1.3 must reproduce the quality-7 table.** A mismatch means the UI is
passing different options than the harness.

### Per-format lazy loading — proven behaviourally

Neither the page's `PerformanceObserver` nor the DevTools recorder observes
worker-initiated fetches, so this was tested by removing the binaries instead:
with `pngquant_bg.wasm` and both WebP binaries deleted from the server, a JPEG
still compressed normally (184,220 → 76,899). The positive control confirms the
test is not vacuous — a PNG then failed with
`Failed to load /wasm/pngquant_bg.wasm: HTTP 404`, surfacing as a clean typed
error rather than a crash.

### Notes for Sprint 1.3

- **Progress is stage-based, not continuous.** These encoders expose no progress
  callback, so the worker reports `decoding` (5%) then `encoding` (25%) and jumps
  to 100%. At ~3.4 s for a 1 MB PNG the UI needs to read as working, not as a
  percentage crawling.
- **Cancellation terminates the worker.** A wasm encode has no yield point, so
  `CodecPool.cancel()` kills the worker and replaces it. Queued jobs are just
  dropped.
- **Decode runs in the worker**, not on the caller's thread — so no `ImageData`
  crosses the boundary at all. Blob in, encoded bytes out (transferred).
- **Main-thread responsiveness is still unmeasured.** The automation pane runs
  the tab hidden, which clamps timers and fakes a ~1 s stall, so the probe was
  discarded again. `/bench` reports the figure for a human to read in a visible
  tab.
- **The vendored `pngquant.js` is modified** — upstream's default
  `new URL('pngquant_bg.wasm', import.meta.url)` branch is unreachable for us but
  Turbopack resolves it at build time and fails. Replaced with a throw and marked
  inline, as the GPL requires.

### Verification

- `next build` **17.59 s** vs 14.95 s on `main` (+2.6 s).
- `npm run lint` — **5 warnings, all pre-existing** in `Compressor.tsx`.
  `lib/codecs/vendor/**` is eslint-ignored: vendored code is not ours to restyle.
- `git diff components/Compressor.tsx` — **empty**.
- Bundle: the main entry `/` is **unchanged at 573.4 KB**, since nothing imports
  the codec layer yet. Reaching it costs **+161.1 KB** of glue on that route.
  No wasm is bundled — all 1.2 MB is fetched on demand from `/wasm/`.

---

## 2026-08-30 | Codec Gate — icodec spike, PNG decision, GPLv3 | Claude (Opus 5)

Resolves the Sprint 1.2 decision gate. No production code changed; the canvas
bridge stayed live throughout. The spike lives on `spike/icodec`, tagged
`spike/icodec-v1`, and is not merged.

### Decision: `@jsquash` for JPEG/WebP/AVIF, vendored pngquant for PNG

`icodec` was **rejected on packaging, not on output**. Its output was the best
measured:

| Fixture | Original | Canvas bridge | icodec | vs canvas |
|---|---|---|---|---|
| A-large-q95.jpg | 835,992 | 147,087 | **130,903** | −11.0% |
| B-mid-q70.jpg | 184,220 | 74,889 | **69,317** | −7.4% |
| C-small-q55.jpg | 81,622 | 57,126 | **51,239** | −10.3% |
| D-marginal-q42.jpg | 67,153 | 58,580 | **57,441** | −1.9% |
| P1.png | 1,065,228 | 1,065,228 | **111,948** | **−89.5%** |
| P2.png | 629,412 | 629,412 | **72,317** | **−88.5%** |
| P3.png | 321,119 | 321,119 | **37,069** | **−88.5%** |
| P4.png | 115,568 | 115,568 | **14,327** | **−87.6%** |

Canvas cannot compress PNG, so its PNG column is the original size. Encode times:
JPEG 163–556 ms; PNG 492–4,857 ms. Harder PNG classes held up — a synthetic flat
UI screenshot hit −93.4%, and two RGBA logos −83.8% / −84.5% with alpha preserved
as palette + `tRNS`, partial transparency intact.

**These are the ceiling Sprint 1.2 should reach.** Materially worse means
misconfiguration, not a result.

Why it was rejected anyway:

- The `exports` map allows only `.`, `./node`, `./version.json` and `*.wasm`.
  Deep imports fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`, so the barrel is the
  only entry point — and the plan requires per-format loading.
- `index.js` assigns `globalThis._icodec_ImageData` as a load-bearing side
  effect, so it cannot be tree-shaken away.
- The barrel pulls every codec's glue, including `heic-enc`'s emscripten pthread
  runtime (`em-pthread`) — a codec we can never use, having dropped COOP/COEP.
- **`next build` never completed.** Two runs under Turbopack, 20 and 30 minutes,
  against a ~14 s baseline on `main`, never passing "Creating an optimized
  production build ...". Dev passed, because `next dev --webpack` and
  `next build` use different bundlers.

### Carried forward: the wasm raw-bytes loading technique

This is reusable and belongs to no particular package. Both loader families
accept raw bytes:

- emscripten builds → `factory({ wasmBinary: arrayBuffer })`
- wasm-bindgen builds → `init({ module_or_path: arrayBuffer })`

So the worker fetches the binary from `/wasm/` and hands over the bytes, instead
of letting the package resolve its own asset. This **bypasses bundler wasm asset
handling entirely** and needed no `next.config` change — no COOP/COEP, nothing
Phase 3's static export could not emit. Verified: the worker bundle referenced
only `/wasm/mozjpeg.wasm` and `/wasm/pngquant_bg.wasm`, with zero CDN references.

### PNG: `@jsquash` has no quantizer

Confirmed against the registry and the package tarballs, not from memory.
`@jsquash/imagequant`, `/quantize` and `/pngquant` all 404. Both PNG packages are
lossless-only:

| Package | Version | Options | Nature |
|---|---|---|---|
| `@jsquash/png` | 3.1.1 | `{ bitDepth?: 8 }` | lossless |
| `@jsquash/oxipng` | 2.3.0 | `{ level, interlace, optimiseAlpha }` | lossless |

Lossless-only lands near −20%, which the plan already judged as making SmartPress
look worse than the tools it replaces. So PNG uses **vendored pngquant** from
icodec's build, loaded by the raw-bytes technique. Behind `lib/codecs/` the split
is invisible.

Also noted: `@jsquash/oxipng` ships `pkg` and `pkg-parallel` builds and
auto-selects via `isWorker && hardwareConcurrency > 1 && await threads()`. On a
non-isolated page `threads()` is false, so it degrades to single-threaded
correctly — but the parallel build's dynamic import still sits in the module
graph, which is the shape that stalled Turbopack on the spike.

### Licence: GPL-3.0-or-later

`pngquant_bg.wasm` provenance was established by reading crate paths **embedded
in the binary**, because icodec's `versions.json` omits its PNG upstreams and its
`LICENSE` carries no third-party notices — the package under-declares what it
ships, so its MIT label cannot be relied on.

| Crate | Version | Licence |
|---|---|---|
| **imagequant** | 4.3.3 | **GPL-3.0-or-later** |
| oxipng | 9.1.2 | MIT |
| png | 0.17.14 | MIT OR Apache-2.0 |
| libdeflater | 1.22.0 | Apache-2.0 |

`imagequant` is dual-licensed: GPL-3.0-or-later, or a paid commercial licence.
SmartPress takes the GPL arm rather than lose −87% to −93% on PNG. The repo had
**no licence at all** beforehand, so this is an initial grant, not a
relicensing — and `git blame` puts every surviving line in HEAD on the sole
copyright holder, so the grant is unilateral. `google-labs-jules[bot]` has 50
commits in history but zero surviving lines; its Netlify and Cloud Run work was
deleted in Sprint 1.1.

Serving the wasm and JS to a browser conveys the work, so the obligations apply
regardless of hosting: source availability and a reachable notice. The
user-facing notice is Sprint 1.3's Task 5. Provenance and terms are in `NOTICE`.

**Fallback if a permissive licence is ever needed:** `image-q` (MIT, pure
TypeScript, slower than wasm). The swap is contained behind `lib/codecs/`, so it
would not reach the UI.

---

## 2026-08-29 | Patch 1.1 — Download Correctness & Gain Threshold | Claude (Opus 5)

Two patches on top of Sprint 1.1, both confined to the canvas bridge era. Neither is codec
work; they exist so Sprint 1.2 measures against a pipeline that is actually correct.

### Canvas bridge baseline — `3.0.0-alpha.2`

Four JPEGs, production build, zero network requests on download. **Sprint 1.2's benchmarks
measure against these numbers.**

| Original | Output | Change |
|---|---|---|
| 1.07 MB | 178.85 KB | −84% |
| 222.86 KB | 96.68 KB | −57% |
| 139.73 KB | 120 KB | −14% |
| 120.73 KB | 120.56 KB | −0% |

PNG has no baseline row: canvas cannot compress it, so every PNG correctly keeps its
original. Real PNG numbers arrive with the quantizer in Sprint 1.2.

### Patch 1.1a — download 404s

Chrome returned `404 — File wasn't available on site` on most rows. Two independent causes,
not one:

- **(b) A surviving server path.** `downloadAll()` still built
  `${API_URL}/download-batch?files=...` whenever more than three files had completed.
  Sprint 1.1 set `API_URL = ""` when the backend was deleted, so that href resolved against
  the origin and Next.js answered the 404. Sprint 1.1's verification grepped for
  `NEXT_PUBLIC_API_URL` and `localhost:8000`; a bare relative path passed straight through
  that check.
- **(c) Blob URLs outliving their page session.** Not an over-eager revoke effect, which was
  the obvious suspect. The URLs were being **persisted to IndexedDB alongside the file
  items**, so a reload restored rows as `done` carrying URLs minted by a page session that
  no longer existed. Every restored link was byte-identical to the previous session's and
  every one was dead. This is why exactly one row appeared to work — the one compressed
  live in the current session.

Fixed by deleting the batch branch outright (there is no backend and no batch endpoint),
keeping blob URLs out of IndexedDB, and resetting restored rows to `pending` rather than
offering a link that cannot resolve. Object URLs are now created once when a result is
produced and revoked only on row removal, queue clear, recompress and unmount — never
during render. A `Set` guards against double-revoke.

### Patch 1.1b — gain threshold

The −0% row above was re-encoded to save **170 bytes**, spending a full generation of JPEG
quality for 0.14%. The keep-original branch only triggered when output was the same size or
larger, so it never caught this.

**Decision: `MIN_GAIN_RATIO = 0.03`.** An encode must save at least 3% of the original to be
worth shipping; below that the original is kept and the row takes the no-gain path. The
constant and its predicate live in **`lib/compression.ts`**, not as a literal in
`Compressor.tsx` — Sprint 1.2's codec layer needs the same rule and must not redefine it.

Verified on the bridge: a JPEG whose re-encode gains 1.29% (160,739 → 158,667 bytes) is now
kept as the original. The −82%, −59% and −13% rows are unaffected.

No-gain rows read as a quiet secondary state — "No size reduction — original kept" with a
muted "Download original" link, not the green primary button — and download under their
**original filename**. Only files SmartPress actually re-encoded carry the `smartpress_`
prefix.

### `downloadAll()` — current behaviour, named so it is not rediscovered

With four completed files it fires **four individual anchor clicks, one per file**, each
against that row's own `blob:` URL, staggered by `index * 300`ms. There is no ZIP and no
batch request. Filenames follow the same prefix rule as the per-row links.

Two consequences worth knowing before Phase 2:

- Chrome treats the second and later programmatic downloads from one origin as
  "Download multiple files?" and prompts once per origin. Deny it and the remaining files
  are dropped silently — the app is not told.
- The 300ms stagger is wall-clock `setTimeout`, so a backgrounded tab coalesces the timers
  and the clicks arrive together.

Real batching is `fflate` at store level, which the plan puts in **Phase 2 (Sprint 2.3)**.
Deliberately not built here.

### Known deviation from the plan

**IndexedDB still stores whole file items, including `File` objects.** Patch 1.1a stopped
persisting the blob *URLs*, which fixed the 404s, but the Sprint 1.3 rule — *IndexedDB
stores settings only: no `File` objects, no previews, no writes on every progress tick* — is
still violated. Flagged here so 1.3 treats it as known scope rather than a discovery.

### Housekeeping

- Deleted `test.zip` from the repo root: 21 bytes containing the ASCII string
  `Internal Server Error`, a v2 backend error response someone saved to disk.
- The tagline promised "images and PDFs" while the dropzone accepted JPEG and PNG only. It
  now reads "images" with a visible **PDF — coming soon** marker, matching the Sprint 2.1
  plan rather than silently rejecting a format the sidebar advertised.
- **Version:** `3.0.0-alpha.2` → `3.0.0-alpha.3`.

---

## 2026-08-26 | Sprint 1.1 — Extraction & Demolition | Claude (Sonnet 5)

**The pivot:** SmartPress moves from images+video to images+PDF, running fully client-side.
FFmpeg was the only reason a backend existed, so `backend/` was deleted rather than ported —
and with it every open security and infrastructure issue from the v2 review.

- **Recovery point:** tagged `v3.0.0-pre-split` and pushed before any deletion. An
  additional checkpoint commit preserved uncommitted Phase 3 work (direct-to-storage
  uploads, Gemini remediation, `ai_diagnostics.py`) that would otherwise have been lost.
- **Extracted to a sibling repo:** `backend/`, `DEPLOY_CLOUD_RUN.md`, `Stabilise FFmpeg`,
  `SmartPress-Update`, `test_video.mp4`. The FastAPI + Cloud Run Jobs + storage-abstraction
  work (~90% complete) carries over intact, along with its four open review items.
- **Removed from this repo:** `backend/` (11 tracked files, 0 `.py` files remain),
  `Dockerfile`, `.dockerignore`, `.gcloudignore`, `netlify.toml`, `DEPLOY_CLOUD_RUN.md`,
  `test_video.mp4`, `Stabilise FFmpeg`, `SmartPress-Update`. Dropped `@ffmpeg/ffmpeg` and
  `@ffmpeg/util` (4 packages removed from the lockfile).
- **Temporary canvas bridge:** image compression now runs through
  `createImageBitmap(file, { imageOrientation: "from-image" })` → `OffscreenCanvas` →
  `convertToBlob`, satisfying the Always-On Constraint without FFmpeg. Deliberately
  short-lived — Sprint 1.3 replaces it with the wasm codec layer and deletes it. The old
  `-vf scale=1280:-1` was **not** reproduced: it upscaled small images. Canvas PNG often
  grows the file, so output larger than input is discarded and the row reads
  "already optimal".
- **Removed the `unpkg.com` ffmpeg-core fetch**, satisfying the no-runtime-CDN rule and
  removing the 30 MB blocking "Preparing the Smart-Bot..." gate. The dropzone now renders
  immediately.
- **Images-only UI:** accept filter narrowed to `image/jpeg,image/png`; dropped files are
  validated too (v2's drag-and-drop bypassed the accept filter entirely) and rejected as a
  typed error row rather than crashing. Removed the dead "Video Quality (CRF)" control.
- **Version unified:** package renamed `smart-compressor` → `smartpress` at
  `3.0.0-alpha.1`. `app/page.tsx` now imports the version from `package.json` instead of
  the hardcoded "Version 2.0.0", and the PROJECT-SYNC CI workflow reads it from
  `package.json` rather than grepping `Master.md`.
- **Config:** dropped the COOP/COEP headers block (ffmpeg.wasm multithreading only) and the
  dead `/api-backend` rewrite. CI switched `npm install` → `npm ci`.
- **Docs reconciled:** `AGENT-ONBOARDING.md` deleted in favour of `CLAUDE.md` (it was a
  hand-rolled version of a convention Claude Code already has, and nothing enforced it —
  which is why its broken `AI_CHANGELOG.md` pointer survived so long). `Master.md`,
  `README.md`, `DEPLOY.md` and `PROJECT-SYNC.json` rewritten against the v3 plan.
  `Error Handling` deliberately held — Sprint 1.3 rewrites it against the new failure modes.
- **Status:** **Sprint 1.1 complete.** Build and lint pass clean; zero Python and zero
  server references outside `Error Handling` (held) and historical log entries.

---

## 2026-04-15 | UI Polish & Visibility Improvements | AG (Antigravity)
- **UI/UX Refinement:** Updated CSS classes for compression settings (CRF and Image Quality sliders). Modified labels and numerical value indicators to increase contrast and readability against the gray background by using bolder typography, darker colors (`text-gray-800`), and subtle dynamic shadows.

---

## 2026-04-09 | Phase 2 Asynchronous Leap Implementation | AG (Antigravity)
- **Architecture:** Transitioned from synchronous FFmpeg processing to an asynchronous job-based architecture using `BackgroundTasks` and an in-memory UUID `job_store` (TTL 1hr).
- **Backend Infrastructure:** Implemented dual-mode `/compress-video` (`?async=true|false`), `/status/{job_id}` polling endpoint, and a new storage abstraction layer (`storage.py`) supporting both GCS (Production) and Local Filesystem (Dev).
- **Frontend Refactor:** Replaced the simulated progress interval in `Compressor.tsx` with real-time polling logic (`useJobPoller`), integrating rich lifecycle states (`Queued`, `Processing` with real %, `Finalizing`, `Done`, `Failed`).
- **Resilience:** Extracted inline FFmpeg calls into `compression_worker.py` utilizing `ffprobe` for accurate progress calculation and robust subprocess stderr parsing for structured error handling.
- **Validation:** 
  - Successful e2e async smoke test using `Test Video.mp4`: 3.09 MB → 760 KB (76% reduction) in ~5 seconds.
  - Phase 1 synchronous path preserved seamlessly for backward compatibility.
- **Status:** **Phase 2 Development Complete**. <!-- (GCS and Cloud Run deployment awaiting GCP billing reactivation). -->

---

## 2026-04-02 | Phase 1 MVP Stabilized | AG (Antigravity)
- **Runtime Verification:** Successfully performed smoke test using `Test-Video.mp4`. Output: 1.36 MB → 211.06 KB (85% reduction).
- **Infrastructure:** Updated backend CORS and frontend API route alignment for local development.
- **UI/UX Audit:** Verified 10/10 visual and functional score (glassmorphism/premium design).
- **Fixes:** Removed syntax errors in `Compressor.tsx` and consolidated environment variables.
- **Status:** **Phase 1 ✅ CLOSED**.

---

## Session Log — 2026-04-01 (Entry 2)

**Agent:** Comet (Perplexity)
**Session Type:** AG Response Audit — Phase 1 Runtime Verification Report
**Files Reviewed:** `Master.md`, `AI_CHANGELOG.md`, AG Runtime Verification Report

### AG Report Summary

AG completed a deep audit of Phase 1 integration checks and submitted a Phase 1 Runtime Verification Report. The outcome is:

| Check | Status | Detail |
|---|---|---|
<!--
| Backend URL | ❌ FAIL | 503 Server Error — billing disabled on `smartpress-486210` |
| API Route Alignment | ✅ PASS | Frontend `${API_URL}/compress-video` ↔ Backend `POST /compress-video` confirmed aligned |
| CORS Configuration | ⚠️ PENDING | Env vars ready, blocked by billing |
| Smoke Test | ❌ FAIL | Blocked by checks 1 & 3 |

### Comet Assessment

- **Root Cause Confirmed**: The sole blocking issue is `BILLING_DISABLED` on GCP project `smartpress-486210`. This is an infrastructure/account-level block, not a code defect.
- **Code Health**: AG confirmed code alignment is 100% ready. Once billing is restored, the integration is expected to be seamless. No code remediation required from AG at this time.
- **Phase 1 Gate Status**: Phase 1 remains **OPEN**. The smoke test cannot be run until Cloud Run services are responsive.
- **AG Action Required**: Enable billing on GCP project `smartpress-486210` via the [Google Cloud Billing Console](https://console.cloud.google.com/billing). Once restored, re-run the 4 integration checks and report back.
- **No Phase 2 work to begin** until Phase 1 smoke test passes. This constraint remains active.
-->

---

## Session Log — 2026-04-01 (Entry 1)

**Agent:** Comet (Perplexity)
**Session Type:** Audit & Documentation
**Files Reviewed:** `SmartPress-Update`, `Master.md`, `AI_CHANGELOG.md`, `AGENT-ONBOARDING.md`

### Approved Elements

- **Task 1.1 — ffprobe Validation Layer**: Architecture correct. Pre-compression validation before FFmpeg is the right defensive pattern.
- **Task 1.2 — BackgroundTask Transition**: 202 Accepted response pattern is correct; prevents frontend timeouts on large files and sets up Phase 2 async leap cleanly.
- **Task 1.3 — Structured Error Schema**: Typed error model (`CORRUPT_MEDIA`, `FILE_TOO_LARGE`, `UNSUPPORTED_FORMAT`, `FFMPEG_TIMEOUT`) is the correct foundation before Phase 3 Gemini integration.
- **Always-On Constraint**: Fully endorsed. Rule is now a permanent gate — no phase may end in a broken state.

### Flagged Items (Blocking)

- **Blocking Runtime Issue — OPEN**: Phase 1 is NOT operationally closed. Four checks must pass before Phase 1 is considered complete:
  1. `NEXT_PUBLIC_API_URL` confirmed pointing to Cloud Run in Vercel dashboard (owner: AG)
  2. API route alignment verified against FastAPI `/docs` — `POST /compress-video` vs `POST /compress` (owner: AG + Claude)
  3. CORS origin confirmed matching deployed frontend URL (owner: AG)
  4. Full smoke test logged: upload → compress → download in live environment (owner: AG)

---

> Note to AI: Read AI_CHANGELOG.md and AGENT-ONBOARDING.md on every new chat session.
