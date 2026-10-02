# SmartPress v3 — Rebuild Plan

> Owner: Ali Mora | Location: Johannesburg, ZA
> Created: 2026-08-26 | Supersedes: `SmartPress-Update`, build phases in `Master.md`
> Sequence revised 2026-09-24 (Sprint 1.4): ZIP delivery is cancelled: `downloadAll()`
> is the permanent web delivery path. Phase 2 and Phase 3 are renumbered around PDF,
> AVIF, format conversion, and the desktop build. See the Sprint 1.4 entry in
> `AI-Logs.md` for why.
> Revised 2026-10-02 (Sprint 2.3): AVIF is removed from Sprint 2.2 and from Phase 2
> entirely — it is unscheduled until the Turbopack build stall has a fix. Sprint 2.2
> became PNG presets, 2.3 is the WebP nudge, and format conversion moved to 2.4.

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
6. **Saving is not the codec layer's problem.** `lib/codecs/` never creates a Blob, picks
   a filename, or touches a filesystem or the DOM. All of that lives behind the `Saver`
   interface in `lib/save/` (web today, Tauri in 3.3) — settled in Sprint 1.4.

## Version milestones

| Milestone | Version | Meaning |
|---|---|---|
| End of Phase 1 | `3.0.0-alpha.1` | Backend gone, real codecs, images work |
| End of Phase 2 | `3.0.0` | Images GA — PDF, PNG presets, WebP nudge, format conversion |
| End of Phase 3 | `3.1.0` | Installable offline (web + Tauri desktop), redesigned UI |

---

# Phase 1 — Strip & Rebuild the Core

*Goal: the backend is gone and image compression is measurably better than v2.*

**Status: Sprints 1.1–1.4 are done.** Full detail for each is in `AI-Logs.md`; this plan
keeps only what still matters for later sprints.

### Sprint 1.1 — Extraction & Demolition ✅

Backend and video deleted, canvas `toBlob()` landed as a temporary bridge, docs
reconciled. See the `AI-Logs.md` entry.

### Sprint 1.2 — The Codec Layer ✅

`lib/codecs/` built around per-format dynamic import, native decode + wasm encode,
the 0–10 quality scale. Chose the hybrid stack: `@jsquash/*` for JPEG/WebP, vendored
pngquant for PNG (no permissive quantizer exists), AVIF stubbed pending a Turbopack
build fix. See `AI-Logs.md` and `CLAUDE.md`.

### Sprint 1.3 — Pipeline Rewrite ✅

Canvas bridge deleted, codec layer wired into `Compressor.tsx`, v2 server code
(`useJobPoller`, `compressOnServer`, `API_URL`, `jobId`, the `"server"` mode) removed,
IndexedDB scoped back to settings only, JPEG/PNG curves recalibrated against the
fixture set, `/licenses` shipped. Phase 1 closed. See `AI-Logs.md`.

### Sprint 1.4 — Save Boundary ✅

`downloadAll()`'s reliability question from 1.3 (no signal exists for a plain anchor
click) is resolved rather than deferred to a ZIP sprint that no longer exists:
**ZIP is cancelled.** `downloadAll()` is the permanent web delivery path.

- Chromium: `showDirectoryPicker()`, one folder picked once, every file written
  directly through `FileSystemWritableFileStream` — a real per-file success signal.
- Everywhere else: the staggered anchor-click fallback from 1.3, honest about
  reporting nothing back, with every row's own Download button always visible.
- All of it moved out of `Compressor.tsx` into `lib/save/web.ts` behind a `Saver`
  interface (`saveOne`, `saveAll`), so the desktop build in 3.3 can implement the same
  interface by writing to disk directly instead of downloading through a browser.
- `lib/codecs/` confirmed clean of this concern — it already returned raw encoded
  bytes and timing, nothing about saving.
- Docs reconciled to this sequence; `front.png`, referenced in the 1.3 prompt as the
  worst-case benchmark fixture, was never actually in the repo — `P1.png` (the
  largest real fixture, ~1.07 MB) is the worst case from here on.

See `AI-Logs.md` for the full entry.

---

# Phase 2 — The Product Layer

*Goal: the thing you'd actually reach for instead of an online tool.*

### Sprint 2.1 — PDF, Route A ✅

`pdf-lib` (MIT) for levels 1–2 (cleanup, recompress embedded `/DCTDecode` and 8bpc
`/FlateDecode` images — the `/SMask`-skip bug found in the measured fixture table cost
DIS-Odoo Inventory Guide 68 points of savings before it was fixed), `pdfjs-dist` (Apache
2.0) for an opt-in level 3 that flattens to images and keeps whichever result is
smaller. Mode-scoped loading shipped as `format === "pdf"` gating a dynamic import in
`worker.ts` rather than the planned Image/PDF toggle — same outcome (an image-only batch
never fetches PDF machinery), no toggle state to keep in sync with the queue. Password,
corrupt, and signed PDFs are typed states, not crashes; a signed PDF is returned
byte-for-byte untouched rather than risk invalidating a signature `pdf-lib` has no notion
of. Route B (MuPDF, AGPL-3.0) is documented, not implemented, per the task list. "Honest
coverage" is done for signed/flatten cases but not yet for a PDF that's legitimately
dense with `/JPXDecode` or `/CCITTFaxDecode` images — flagged as a known gap rather than
guessed at without a fixture that hits it. Full detail, including the three
`document`-in-a-Worker bugs the level 3 flatten needed fixed, in `AI-Logs.md`.

---

### Sprint 2.2 — PNG presets ✅

Lossy PNG replaces the 0–10 slider with three presets mapped to pngquant
`min`–`max` quality ranges: **Min 60–80, Medium 40–60, Max 15–40** (default Medium).
The vendored wasm exposes only `max`, so `min` is enforced in JS by measuring the
output (`lib/codecs/pngQuality.ts`); a file below its preset's minimum is **skipped**
and the original kept. (Superseded: the slider was removed afterwards and the
presets now drive JPEG and PDF images too — see `AI-Logs.md`.)
Measured on P1–P4 in `AI-Logs.md`. The emulation is approximate — exact semantics
need a wasm rebuilt with min/max exposed.

**AVIF was removed from this sprint's scope.** The `@jsquash/avif` Turbopack build
stall, the AVIF time estimate, and the AVIF fixture sweep are not scheduled. AVIF
stays stubbed (`available: false`, `lib/codecs/encoders.ts`) with its restore path
intact; picking it up again starts with the build fix, not the flag.

---

### Sprint 2.3 — WebP Nudge ✅

After a **lossy PNG** compresses, encode the same pixels as WebP (`@jsquash/webp`) at
the matching quality tier and, if it beats the PNG result by more than 10%, offer it.

**Tasks**

- [x] Tier mapping: each PNG preset → a WebP quality (`PRESET_SCALE` in
      `quality.ts`), with the sweep recorded in `AI-Logs.md`.
- [x] Worker computes the WebP alternative after a PNG result that cleared its
      preset minimum. Not for skipped files, lossless PNG, JPEG, or PDF.
- [x] Threshold lives with the other keep/offer rules in `lib/compression.ts`
      (`WEBP_NUDGE_MIN_GAIN`, 10% relative to the PNG result).
- [x] Nudge below the row: "WebP would save an additional X% — Convert?". One click
      replaces the row's output with the WebP under a `.webp` name.
- [x] A WebP failure never fails the PNG row; it only means no offer.
- [x] Verified against `next build` + `next start`. A JPEG/PDF-only batch never
      loads the WebP encoder by construction (the worker only calls it from the PNG
      branch); that was not separately proven at the network level, since
      worker-initiated fetches are invisible to the page.

**Done when:** a PNG that WebP shrinks by more than 10% shows the nudge, Convert swaps
the download for the WebP, and PNGs below the threshold, skipped PNGs, JPEGs and PDFs
show nothing.

---

### Sprint 2.4 — Format Conversion

**Tasks**

- [ ] Output format: `Keep original | JPEG | WebP | PNG` (AVIF unscheduled).
- [ ] **Smart mode** (optional toggle): encode to several candidates, keep the smallest.
      Costs CPU, wins bytes — make the tradeoff explicit in the UI.
- [ ] **Transparency guard.** PNG-with-alpha → JPEG silently flattens onto black. Detect
      alpha and either warn or exclude JPEG from the options for that file.
- [ ] Resize: max-dimension cap that **never upscales**. Fixes v2's `scale=1280:-1`, which
      enlarged small images and could emit an odd height that libx264 rejected.
- [ ] Metadata: strip EXIF by default, toggle to preserve. Orientation is already applied
      before stripping (Sprint 1.2) — this only adds the preserve toggle.
- [ ] Filename handling when the output extension changes on conversion, and dedupe when
      two differently-named originals would collide after conversion.

**Done when:** a phone JPEG converts to WebP at roughly half the size with correct
orientation, and an alpha PNG cannot be silently flattened to JPEG.

---

# Phase 3 — Redesign, Deploy, Desktop

*Goal: the tool looks like a real product, is reachable on the web, and runs offline as
a real desktop app — from one codebase.*

### Sprint 3.1 — UI Redesign (online + offline, shared codebase)

The redesigned UI is one codebase that serves both the web build and the Tauri shell in
3.3 — this is why the save boundary in 1.4 exists, and why nothing in `lib/codecs/` or
the settings/queue logic may assume a browser tab is the only place it runs.

**Tasks**

- [ ] Dark UI redesign — the header link to `/licenses` moves here (`CLAUDE.md` already
      notes this: `GPLv3 · Source · Notices` currently sits under the version line in the
      left column; the redesign moves it into a header).
- [ ] PWA manifest + icons (Smart-Bot already exists at the right sizes) and a service
      worker precaching the app shell and vendored wasm, for the **web** offline case.
      Weigh the install cost — this is why mode-scoped loading landed in 2.1.
- [ ] Keyboard navigation and screen-reader labels on the dropzone, mode toggle, sliders —
      absent throughout v2.
- [ ] Airplane-mode test as an acceptance gate for the web build: kill the network,
      hard-reload, compress a batch, use `downloadAll()`.

**Done when:** the redesign renders identically in the web build and inside the Tauri
shell from 3.3, and the web build works with the network physically disabled.

---

### Sprint 3.2 — Online Deploy (Hostinger)

**Tasks**

- [ ] Static export (`next.config.ts` → `output: 'export'`) or Hostinger's supported
      Node runtime — decide based on what 3.1's service worker needs versus what
      Hostinger's hosting tier actually offers.
- [ ] Point `namka.cloud` at the Hostinger deployment; confirm the `/licenses` route and
      GPL notices still serve correctly from a static/exported build.
- [ ] CI: add the deploy step once the target is confirmed; keep build + lint + test
      gating it.

**Done when:** the live site at `namka.cloud` is served from Hostinger, GPL notices
reachable, and a fresh deploy doesn't require a manual step.

---

### Sprint 3.3 — Tauri Desktop App

**Tasks**

- [ ] Tauri shell around the same UI from 3.1 — no second codebase.
- [ ] Desktop `Saver` implementation behind the `lib/save/` interface from 1.4: write
      compressed output straight to disk via Tauri's filesystem APIs, no browser
      download machinery, no folder-picker permission dance. Nothing above `lib/save/`
      needs to change for this to work — that was the point of the boundary.
- [ ] Large-batch soak: 100+ files. Find the memory ceiling and fail gracefully at it
      rather than crashing.
- [ ] Tests: unit coverage on the codec layer and the save boundary; one end-to-end
      batch run. The repo currently has none.
- [ ] CI: build, lint, test, package the desktop binary.

**Done when:** CI is green, the desktop app compresses and writes files with no browser
involved, and **`3.1.0` is tagged and released.**

---

## Decision gates

| Sprint | Decision | Status |
|---|---|---|
| — | Quality scale | **Settled** — abstract 0–10, higher better, default 7, per-codec curves |
| — | Settings panel shape | **Settled, revised** — was Option A (one swapping slider); now one Min/Medium/Max preset for all formats, no slider |
| — | PNG default mode | **Settled** — lossy palette, with a visible radio to switch (Sprint 1.3) |
| — | Decode strategy | **Settled** — native decode, wasm encode only |
| — | Codec stack | **Settled** — hybrid: `@jsquash/*` (JPEG/WebP) + vendored pngquant (PNG), AVIF stubbed (Sprint 1.2) |
| — | Batch delivery | **Settled, cancelled ZIP** — `downloadAll()` via directory picker or staggered fallback is permanent (Sprint 1.4) |
| — | Save boundary | **Settled** — `lib/save/` behind a `Saver` interface, web today, Tauri in 3.3 (Sprint 1.4) |
| 2.4 | Smart-mode default on/off | Open |
| — | AVIF | **Deferred, unscheduled** — removed from Sprint 2.2; blocked on the Turbopack build stall |
| 3.1 | Precache all codecs vs fetch on demand | Open — sets PWA install weight |
| 3.2 | Static export vs Hostinger's Node runtime | Open — depends on what 3.1's service worker needs |
| 3.2 | Ship PDF Route A, or escalate to AGPL Route B | Open — governs any future hosting or commercialisation beyond personal use |

## Known risks

- **AVIF encode time** (deferred with AVIF) may want a warning or a worker-count cap
  if AVIF is ever picked up.
- **Browser memory ceiling** is the real constraint on batch size. Decoded `ImageData` is
  ~4 bytes per pixel — a 50 MP photo is 200 MB uncompressed before any encoding.
- **PDF Route A coverage** may disappoint on text-heavy or `FlateDecode`-image PDFs.
  Honest UI messaging in 2.1 is the mitigation, not a stretch goal.
- **Static export drops header control** — anything later needing `SharedArrayBuffer`
  (multithreaded oxipng) requires host-level COOP/COEP or reverting the export. Relevant
  to both 3.1's service worker and 3.2's Hostinger decision.
- **`showDirectoryPicker()` is Chromium-only and not yet standardised** — Safari and
  Firefox stay on the anchor-click fallback indefinitely, not as a temporary gap.
