# SmartPress v3 — Rebuild Plan

> Owner: Ali Mora | Location: Johannesburg, ZA
> Created: 2026-08-26 | Supersedes: `SmartPress-Update`, build phases in `Master.md`

## Mission

A fast, offline-capable, local-first compressor for **images and PDFs**. No backend, no
accounts, no network calls at runtime. Video moves to a separate project.

## The pivot in one line

Removing video removes the reason a backend existed. Images and PDFs compress in the
browser, so `backend/` is deleted rather than ported — and with it every open security
and infrastructure issue from the v2 review.

---

## Cross-cutting rules

These apply to every sprint. A sprint isn't done if it breaks one.

1. **Always-On Constraint (carried forward from v2).** At the end of *every sprint*, a user
   can complete upload → compress → download in at least one verified environment.
   Not just every phase. Every sprint.
2. **No runtime CDN.** Every `.wasm` binary is vendored into `/public` and imported from a
   local path. The v2 `unpkg.com` fetch is exactly what made offline impossible.
3. **No blocking loader.** The dropzone renders immediately. Codecs load on first use,
   with the spinner scoped to the affected row.
4. **Errors are typed UX states**, never generic crashes or silent failures.
5. **Single source of truth for version:** `package.json`. Everything else reads from it.

## Version milestones

| Milestone | Version | Meaning |
|---|---|---|
| End of Phase 1 | `3.0.0-alpha.1` | Backend gone, real codecs, images work |
| End of Phase 2 | `3.0.0` | Images GA — modes, conversion, ZIP |
| End of Phase 3 | `3.1.0` | Installable offline, PDF beta |

---

# Phase 1 — Strip & Rebuild the Core

*Goal: the backend is gone and image compression is measurably better than v2.*

### Sprint 1.1 — Extraction & Demolition

Preserve the video work, then delete it. Reconcile the docs so the agent workflow stops
reading stale files.

**Tasks**

- [ ] `git tag v3.0.0-pre-split && git push --tags` — recoverable snapshot before deletion.
- [ ] Create new repo for video. Move `backend/`, `DEPLOY_CLOUD_RUN.md`,
      `Stabilise FFmpeg`, `SmartPress-Update`, `test_video.mp4`. The Cloud Run Jobs /
      polling / storage-abstraction work carries over intact.
- [ ] Delete from this repo: `backend/`, `Dockerfile`, `.dockerignore`, `.gcloudignore`,
      `netlify.toml`, `DEPLOY_CLOUD_RUN.md`, `test_video.mp4`.
- [ ] Remove deps: `@ffmpeg/ffmpeg`, `@ffmpeg/util`.
- [ ] **Bridge task (temporary):** route image compression through canvas `toBlob()` so the
      app stays functional this sprint. ~20 lines. Deleted in Sprint 1.3.
- [ ] `next.config.ts`: drop the COOP/COEP block. Single-threaded codecs don't need
      `SharedArrayBuffer`, and `output: 'export'` in Phase 3 can't emit headers anyway.
- [ ] `package.json`: rename `smart-compressor` → `smartpress`, set `3.0.0-alpha.1`.
- [ ] Docs reconciliation:
  - `AGENT-ONBOARDING.md` → fix the `AI_CHANGELOG.md` reference (the file is `AI-Logs.md`).
  - `Master.md` → replace v2 build phases with this plan; keep the Always-On Constraint.
  - `PROJECT-SYNC.json` → set `live_url`, correct phase, version from `package.json`.
  - `README.md` → images + PDF, no backend, no Vercel/Cloud Run references.
  - `Error Handling` → hold; rewritten in Sprint 1.3 against the new failure modes.
- [ ] CI: `npm install` → `npm ci`. Drop the Python steps that no longer apply.

**Done when:** repo builds and lints clean with zero Python and zero server references;
drag an image in, get a smaller image out.

---

### Sprint 1.2 — The Codec Layer

Build the compression engine standalone, behind a clean interface, before wiring it to UI.

**Tasks**

- [ ] **Decision gate — codec stack.** Spike `icodec` (MIT, one package, covers mozjpeg +
      pngquant + webp + avif, exports each `.wasm` separately) against the `@jsquash/*`
      family (Apache-2.0, five packages, actively maintained, no quantizer so a sixth dep
      is needed for lossy PNG). icodec first; jsquash if integration fights. icodec's risk
      is staleness — last published Nov 2024. Record the choice in `AI-Logs.md`.
- [ ] **Native decode, wasm encode only.** `createImageBitmap(file, { imageOrientation:
      "from-image" })` → `OffscreenCanvas` → `ImageData`. Browsers already decode JPEG and
      PNG in hardware; shipping wasm decoders doubles the payload for no gain.
- [ ] Vendor all encoder `.wasm` into `/public/wasm/`. Verify zero network requests at
      runtime with the Network tab set to offline.
- [ ] `lib/codecs/` built around a **`CodecSpec`** — each codec declares its own primary
      control and extras rather than conforming to a fixed shape:
      `{ primary: { kind: "quality" | "effort", label }, extras: Knob[], mapPrimary(v) }`.
      Per-format dynamic import so nothing loads until needed.
- [ ] **Canonical quality scale is 0–10**, higher is better, default 7. Each codec owns a
      non-linear curve concentrated in its useful band — linear mapping wastes most steps
      below usable quality. Curves get calibrated against the benchmark corpus.
- [ ] Worker pool **gated on total pixels in flight, not file count**. `ImageData` is 4
      bytes/pixel, so a 50 MP photo is 200 MB before encoding. Four in parallel kills the
      tab. Always permit at least one worker so a single huge image can't deadlock.
- [ ] Commit a fixed five-fixture benchmark corpus (photo, screenshot, flat graphic, PNG
      with alpha, oversized phone photo) so numbers stay comparable across sprints.

**Done when:** benchmarks show MozJPEG beating the canvas bridge at matched visual
quality across the fixture set, running off the pool without touching the main thread.

---

### Sprint 1.3 — Pipeline Rewrite

Collapse `Compressor.tsx` (691 lines) down to a client-only pipeline and clear the v2 bugs.

**Tasks**

- [ ] Delete `useJobPoller`, `compressOnServer`, `jobId`, and the `mode: "client" | "server"`
      split. Keep the five-state status model — it maps cleanly onto the worker pool.
- [ ] Replace base64 `readAsDataURL` previews with `URL.createObjectURL`. Revoke on
      remove, clear, and unmount.
- [ ] IndexedDB stores **settings only**. No `File` objects, no previews, no writes on
      every progress tick.
- [ ] Non-blocking init per cross-cutting rule 3.
- [ ] Rewrite `Error Handling` for local failure modes: `DECODE_FAILED`,
      `UNSUPPORTED_FORMAT`, `ENCODE_FAILED`, `FILE_TOO_LARGE`, `OUT_OF_MEMORY`.
      Each carries a `retryable` flag, as the v2 spec intended but never implemented.
- [ ] Delete the canvas bridge from Sprint 1.1.
- [ ] Fix `id: ${Date.now()}-${i}` collisions → `crypto.randomUUID()`.

**Done when:** a 20-image batch (mixed JPEG/PNG, including one >20 MB) completes with a
responsive UI and flat memory after clear.

---

# Phase 2 — The Product Layer

*Goal: the thing you'd actually reach for instead of an online tool.*

### Sprint 2.1 — Mode Router

Image / PDF is a **loading strategy**, not just navigation — it decides which wasm ever
touches the device.

**Tasks**

- [ ] Home screen mode toggle: **Image** | **PDF**. PDF ships in a "Coming soon" state.
- [ ] Mode-scoped codec loading. Image mode never fetches PDF machinery, and vice versa.
- [ ] **Filter, not gate.** A PDF dropped in Image mode offers to switch modes or flags
      that row — it is never silently rejected.
- [ ] Real drop validation. v2's drag-and-drop bypassed the `accept` filter entirely.
- [ ] Settings panel becomes mode-aware. The current fixed two-column grid can't hold a
      third concept; restructure now rather than retrofitting in Phase 3.
- [ ] Persist mode to IndexedDB with the other settings.

**Done when:** switching modes changes the settings panel, the accept filter, and what
loads over the wire — verifiable in the Network tab.

---

### Sprint 2.2 — Conversion & Quality

**Tasks**

- [ ] Output format: `Keep original | JPEG | WebP | AVIF | PNG`.
- [ ] **Smart mode** (optional toggle): encode to several candidates, keep the smallest.
      Costs CPU, wins bytes — make the tradeoff explicit in the UI.
- [ ] **Transparency guard.** PNG-with-alpha → JPEG silently flattens onto black. Detect
      alpha and either warn or exclude JPEG from the options for that file.
- [ ] Resize: max-dimension cap that **never upscales**. Fixes v2's `scale=1280:-1`, which
      enlarged small images and could emit an odd height that libx264 rejected.
- [ ] PNG path: lossy palette (default) vs lossless, user-selectable via visible radio.
      Lossy is where the ~65% savings live; lossless alone lands near 20% and would make
      SmartPress look worse than the tools it replaces. The radio keeps it from being a
      silent choice.
- [ ] **Settings shape — settled (Option A).** One universal control that *swaps* rather
      than greys: quality on lossy paths, effort on lossless PNG. Never a dead slider.
      Format is chosen in exactly one place. Per-format tabs were rejected — they duplicate
      the format selector and break under "Keep original", where a mixed batch would have
      several tabs applying to different files at once. The abstract 0–10 scale is what
      lets one control mean two things without lying.
- [ ] Metadata: strip EXIF by default, toggle to preserve. **Apply orientation before
      stripping** — otherwise portrait phone photos come out sideways.
- [ ] AVIF encode is slow. Surface an honest time estimate rather than looking hung.

**Done when:** a phone JPEG converts to AVIF at roughly half the size with correct
orientation, and an alpha PNG cannot be silently flattened.

---

### Sprint 2.3 — Batch & Delivery

**Tasks**

- [ ] ZIP via `fflate@0.8.3` (MIT) at **level 0 / store**. JPEG, PNG, WebP and AVIF are
      already compressed; deflate costs CPU and occasionally adds bytes.
- [ ] Threshold: **1 file → direct download, 2+ → ZIP.** Chrome's "Download multiple
      files?" prompt fires at two, so a >2 rule would still hit it. Per-row Download stays
      for pulling one item out of a batch.
- [ ] Filename dedupe — two `photo.jpg` from different folders must not overwrite each
      other inside the archive.
- [ ] ZIP naming `smartpress_YYYY-MM-DD.zip`; **drop the `smartpress_` prefix on entries
      inside** (the archive already disambiguates), keep it on single downloads.
- [ ] Batch summary: total before → after, aggregate % saved.
- [ ] Before/after visual compare on a row, so quality settings are judged by eye.

**Done when:** 40 mixed images compress and arrive as one ZIP with no browser permission
prompt and no name collisions. **Tag `3.0.0`.**

---

# Phase 3 — Offline & PDF

*Goal: the tool you actually wanted — installed, working on a plane, handling PDFs.*

### Sprint 3.1 — Offline & PWA

**Tasks**

- [ ] `next.config.ts` → `output: 'export'` for a fully static bundle.
- [ ] `manifest.json` + icons (Smart-Bot already exists at the right sizes).
- [ ] Service worker precaching the app shell **and** the vendored wasm. Weigh the
      install cost — this is why mode-scoped loading landed in 2.1.
- [ ] Same build deploys to namka.cloud and installs as a local app.
- [ ] **Airplane-mode test as the acceptance gate.** Kill the network, hard-reload,
      compress a batch, download the ZIP.

**Done when:** it works with the network physically disabled.

---

### Sprint 3.2 — PDF, Route A

MIT-licensed, narrow, fully under your control. Activates the button from 2.1.

**Tasks**

- [ ] `pdf-lib@1.17.1` (MIT) to parse and rewrite documents.
- [ ] Walk page resources for image XObjects using `DCTDecode` — those are raw JPEG byte
      streams. Extract → re-encode through MozJPEG → swap back.
- [ ] Downsample above a DPI threshold. This, not re-encoding, is where most of the
      savings live in scanned documents.
- [ ] Strip metadata; enable object streams on save.
- [ ] **Be honest about coverage in the UI.** Route A won't touch `FlateDecode` images,
      fonts, CCITT fax, or JPEG2000. When a PDF barely shrinks, say why instead of
      reporting a disappointing number with no explanation.
- [ ] Document the Route B escape hatch (MuPDF `1.28.0`, AGPL-3.0) in `AI-Logs.md` — fine
      for a personal offline tool, a licensing problem if SmartPress is ever hosted or
      sold. Not implemented here; recorded so the decision isn't re-litigated later.

**Done when:** a scanned multi-page PDF shrinks substantially and still renders correctly
in Preview, Acrobat, and Chrome.

---

### Sprint 3.3 — Hardening & Release

**Tasks**

- [ ] Large-batch soak: 100+ files. Find the memory ceiling and fail gracefully at it
      rather than crashing the tab.
- [ ] Cancel / abort for in-flight work — absent throughout v2.
- [ ] Keyboard navigation and screen-reader labels on the dropzone, mode toggle, sliders.
- [ ] Tests: unit coverage on the codec layer and ZIP assembly; one end-to-end batch run.
      The repo currently has none.
- [ ] CI: build, lint, test. Deploy the static bundle.
- [ ] `AI-Logs.md` changelog; `PROJECT-SYNC.json` accurate; README rewritten with real
      before/after numbers from the benchmark corpus.

**Done when:** CI is green and **`3.1.0` is tagged and deployed.**

---

## Decision gates

| Sprint | Decision | Status |
|---|---|---|
| — | Quality scale | **Settled** — abstract 0–10, higher better, default 7, per-codec curves |
| — | Settings panel shape | **Settled** — Option A, swapping primary control |
| — | PNG default mode | **Settled** — lossy palette, with a visible radio to switch |
| — | Decode strategy | **Settled** — native decode, wasm encode only |
| 1.2 | icodec vs jsquash + quantizer | Open — spike in-sprint, icodec first |
| 2.2 | Smart mode default on or off | Open — needs real AVIF encode times from 1.2 |
| 3.1 | Precache all codecs, or fetch on demand | Open — sets PWA install weight |
| 3.2 | Ship Route A, or escalate to AGPL Route B | Open — governs any future hosting or commercialisation |

## Known risks

- **AVIF encode time** on large batches may be bad enough to want a warning or a
  worker-count cap. Measure in 1.2, decide in 2.2.
- **Browser memory ceiling** is the real constraint on batch size. Decoded `ImageData` is
  ~4 bytes per pixel — a 50 MP photo is 200 MB uncompressed before any encoding.
- **PDF Route A coverage** may disappoint on text-heavy or `FlateDecode`-image PDFs.
  Honest UI messaging in 3.2 is the mitigation, not a stretch goal.
- **Static export drops header control** — anything later needing `SharedArrayBuffer`
  (multithreaded oxipng) requires host-level COOP/COEP or reverting the export.
