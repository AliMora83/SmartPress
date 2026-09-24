# SmartPress v3 — Rebuild Plan

> Owner: Ali Mora | Location: Johannesburg, ZA
> Created: 2026-08-26 | Supersedes: `SmartPress-Update`, build phases in `Master.md`
> Sequence revised 2026-09-24 (Sprint 1.4): ZIP delivery is cancelled: `downloadAll()`
> is the permanent web delivery path. Phase 2 and Phase 3 are renumbered around PDF,
> AVIF, format conversion, and the desktop build. See the Sprint 1.4 entry in
> `AI-Logs.md` for why.

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
| End of Phase 2 | `3.0.0` | Images GA — PDF, AVIF, format conversion |
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

### Sprint 2.1 — PDF, Route A

MIT-licensed, narrow, fully under your control. This is also where the Image/PDF mode
toggle from the old plan belongs — PDF is what actually needs mode-scoped loading, so
it ships with the feature that requires it rather than ahead of it.

**Tasks**

- [ ] Home screen mode toggle: **Image** | **PDF**. Mode-scoped codec loading — Image
      mode never fetches PDF machinery, and vice versa.
- [ ] **Filter, not gate.** A PDF dropped in Image mode offers to switch modes or flags
      that row — it is never silently rejected. Real drop validation, since v2's
      drag-and-drop bypassed the `accept` filter entirely.
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

**Done when:** switching modes changes the settings panel and what loads over the wire
(verifiable in the Network tab), and a scanned multi-page PDF shrinks substantially and
still renders correctly in Preview, Acrobat, and Chrome.

---

### Sprint 2.2 — PNG modes + AVIF

PNG's lossy/lossless split already shipped early, in Sprint 1.3 (`CLAUDE.md`,
`lib/codecs/quality.ts`) — the real work left here is AVIF.

**Tasks**

- [ ] Fix the Turbopack production-build stall on `@jsquash/avif` (`next build`, not
      `next dev` — see `CLAUDE.md`'s bundler warning). This is the actual gate; flipping
      `CAPABILITIES.avif.available` to `true` is one line once it's fixed, by design
      (`encoders.ts`).
- [ ] AVIF encode is slow. Surface an honest time estimate rather than looking hung.
- [ ] Re-run the fixture sweep with AVIF included and record it in `AI-Logs.md`, the
      same way the JPEG/PNG curves were calibrated in 1.3.
- [ ] Confirm the accept-filter/capability double gate in `Compressor.tsx` still holds:
      AVIF becomes available by construction once the descriptor says so, no separate
      list to remember to update.

**Done when:** AVIF encodes in a production build, off the main thread, at a calibrated
default quality — and dropping only JPEG/PNG files still never loads it.

---

### Sprint 2.3 — Format Conversion

**Tasks**

- [ ] Output format: `Keep original | JPEG | WebP | AVIF | PNG`.
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

**Done when:** a phone JPEG converts to AVIF at roughly half the size with correct
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
| — | Settings panel shape | **Settled** — Option A, swapping primary control |
| — | PNG default mode | **Settled** — lossy palette, with a visible radio to switch (Sprint 1.3) |
| — | Decode strategy | **Settled** — native decode, wasm encode only |
| — | Codec stack | **Settled** — hybrid: `@jsquash/*` (JPEG/WebP) + vendored pngquant (PNG), AVIF stubbed (Sprint 1.2) |
| — | Batch delivery | **Settled, cancelled ZIP** — `downloadAll()` via directory picker or staggered fallback is permanent (Sprint 1.4) |
| — | Save boundary | **Settled** — `lib/save/` behind a `Saver` interface, web today, Tauri in 3.3 (Sprint 1.4) |
| 2.2 | AVIF default quality, Smart-mode default on/off | Open — needs real AVIF encode times once the Turbopack stall is fixed |
| 3.1 | Precache all codecs vs fetch on demand | Open — sets PWA install weight |
| 3.2 | Static export vs Hostinger's Node runtime | Open — depends on what 3.1's service worker needs |
| 3.2 | Ship PDF Route A, or escalate to AGPL Route B | Open — governs any future hosting or commercialisation beyond personal use |

## Known risks

- **AVIF encode time** on large batches may be bad enough to want a warning or a
  worker-count cap. Measure once 2.2 unblocks it.
- **Browser memory ceiling** is the real constraint on batch size. Decoded `ImageData` is
  ~4 bytes per pixel — a 50 MP photo is 200 MB uncompressed before any encoding.
- **PDF Route A coverage** may disappoint on text-heavy or `FlateDecode`-image PDFs.
  Honest UI messaging in 2.1 is the mitigation, not a stretch goal.
- **Static export drops header control** — anything later needing `SharedArrayBuffer`
  (multithreaded oxipng) requires host-level COOP/COEP or reverting the export. Relevant
  to both 3.1's service worker and 3.2's Hostinger decision.
- **`showDirectoryPicker()` is Chromium-only and not yet standardised** — Safari and
  Firefox stay on the anchor-click fallback indefinitely, not as a temporary gap.
