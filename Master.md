# SmartPress — Intelligent File Compression

> Owner: Ali Mora | Location: Johannesburg, ZA
> Last updated: 2026-08-26 | Version: see `package.json`

## 🎯 Mission

A fast, offline-capable, local-first compressor for **images and PDFs**. Everything runs in
the browser — no backend, no accounts, no network calls at runtime. Video has moved to a
separate project.

## 🏗 Stack

- **Frontend**: Next.js 16 (App Router) / React 19 / TypeScript / Tailwind CSS
- **Compression**: native browser decode + vendored wasm encoders (no backend)
- **Typography**: Montserrat (Extra Bold for titles)
- **Deployment**: static bundle → namka.cloud

---

## ✅ Always-On Constraint

SmartPress must remain **functional at the end of every phase**. No phase may leave the product in a broken or offline state.

### Definition of “Functional”

At minimum, the following must work in at least one verified environment (local or deployed):

- Frontend loads without fatal errors.
- Backend responds successfully to a health check (`/` or `/health`).
- A user can complete one full flow: **upload → compress → download**.
- Errors are rendered as structured UX states (typed error model), not generic crashes or silent failures.

> **v3 amendment:** the backend health-check clause no longer applies — there is no backend.
> The constraint now binds at the end of *every sprint*, not just every phase.

---

## 📋 Build Phases

Plan of record is [`SmartPress-v3-Plan.md`](./SmartPress-v3-Plan.md). It supersedes the v2
phases and the `SmartPress-Update` evolution plan. Summary only below — the plan file owns
the task detail.

### Phase 1 — Strip & Rebuild the Core → `3.0.0-alpha.1`

*The backend is gone and image compression is measurably better than v2.*

- **Sprint 1.1 — Extraction & Demolition** ✅ Video project extracted at tag
  `v3.0.0-pre-split`; `backend/`, Docker, Netlify and Cloud Run config deleted; `@ffmpeg/*`
  removed; temporary canvas bridge keeps images working; docs reconciled.
- **Sprint 1.2 — The Codec Layer** — wasm encoders vendored to `/public/wasm/`, native
  decode, `CodecSpec` interface, 0–10 quality curves, pixel-budgeted worker pool,
  benchmark corpus.
- **Sprint 1.3 — Pipeline Rewrite** — collapse `Compressor.tsx` to a client-only pipeline,
  delete the canvas bridge and the server path, rewrite `Error Handling` for local failure
  modes.

### Phase 2 — The Product Layer → `3.0.0`

- **Sprint 2.1 — Mode Router** — Image | PDF toggle as a loading strategy.
- **Sprint 2.2 — Conversion & Quality** — output formats, transparency guard, resize that
  never upscales, EXIF handling.
- **Sprint 2.3 — Batch & Delivery** — ZIP via `fflate` at store level, batch summary.

### Phase 3 — Offline & PDF → `3.1.0`

- **Sprint 3.1 — Offline & PWA** — static export, service worker, airplane-mode gate.
- **Sprint 3.2 — PDF, Route A** — `pdf-lib`, DCTDecode re-encode, honest coverage messaging.
- **Sprint 3.3 — Hardening & Release** — soak tests, cancel/abort, a11y, CI.

---

## 🔒 Cross-cutting rules

1. **Always-On Constraint** — upload → compress → download works at the end of every sprint.
2. **No runtime CDN** — every `.wasm` is vendored into `/public` and loaded from a local path.
3. **No blocking loader** — the dropzone renders immediately; codecs load on first use.
4. **Errors are typed UX states**, never generic crashes or silent failures.
5. **Single source of truth for version:** `package.json`.

---

## 👥 Agent Assignments

| Agent          | Role                                   |
|----------------|----------------------------------------|
| Claude         | UX & Product Decisions                |
| Comet          | Documentation & Audit                 |
| Gemini         | Architecture & UI Proposals           |
| AG (Antigravity) | Implementation — executes AG-Update.md |

---

## 📋 Review Log

| Date | Agent | Activity |
|:---|:---|:---|
| 2026-08-26 | Claude (Sonnet 5) | Sprint 1.1 — extraction, backend/FFmpeg demolition, canvas bridge, doc reconciliation. |
| 2026-04-15 | AG (Antigravity) | UI Polish — Improved visibility and contrast for compression settings labels and values. |
| 2026-04-02 | AG (Antigravity) | Smoke Test — Phase 1 Runtime Verification (v2 architecture, now retired). |
| 2026-04-01 | Comet (Perplexity) | Reviewed & approved SmartPress Evolution Plan and added Always-On Constraint. |

> Note to AI: read `SmartPress-v3-Plan.md` (plan of record) and `AI-Logs.md` (changelog) at
> the start of every session. `CLAUDE.md` holds the working rules.
