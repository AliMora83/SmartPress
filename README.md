# 🚀 SmartPress

> Fast, smart compression for images and PDFs — running entirely in your browser.

## 📊 Overview

**SmartPress** is a self-contained compression utility with a Smart-Bot branded two-column
UI. Files are compressed **fully client-side** — nothing is uploaded, there is no backend,
no accounts, and no database. Batch image compression works today; PDF support lands in
Phase 3.

- **Owner**: Ali Mora
- **Location**: Johannesburg, ZA
- **Updated**: 2026-08-26
- **Status**: 🟡 Active Development — v3 rebuild
- **Priority**: 🟡 Priority 2
- **Live**: [smartpress.namka.cloud](https://smartpress.namka.cloud)

---

## ✨ Features

- 🔒 **Fully local** — files never leave the device; no upload, no tracking
- 🎨 **Beautiful UI** — two-column layout with Smart-Bot mascot branding
- 📦 **Batch operations** — Compress All and Download All
- 🎯 **Formats** — JPG and PNG today; PDF in Phase 3
- 🤖 **Smart branding** — Montserrat typography, responsive design
- 📝 **Auto prefix** — compressed outputs named `smartpress_*`

---

## 🏗 Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS + Montserrat (Extra Bold) |
| Compression | Native browser decode + vendored wasm encoders |
| Backend | None — fully client-side |
| Database | None (stateless) |
| Auth | None (public tool) |
| Hosting | Static bundle on namka.cloud |

---

## 🚀 Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app. There is no backend to
start — that is the point.

---

## 📝 File Structure

```
SmartPress/
├── CLAUDE.md                # Working rules for AI agents
├── SmartPress-v3-Plan.md    # Plan of record
├── Master.md                # Project context and phases
├── AI-Logs.md               # Changelog
├── README.md                # This file
├── DEPLOY.md                # Deployment guide
├── app/                     # Next.js app directory
├── components/              # React components
└── public/                  # Smart-Bot mascot + static assets
```

---

## 🔄 Current Phase

**Phase 1 — Strip & Rebuild the Core**

- [x] Sprint 1.1 — video extracted, backend and FFmpeg removed, docs reconciled
- [ ] Sprint 1.2 — wasm codec layer, quality curves, worker pool, benchmarks
- [ ] Sprint 1.3 — client-only pipeline rewrite, typed error model

---

## 📌 Quick Links

- [SmartPress-v3-Plan.md](./SmartPress-v3-Plan.md) — Plan of record
- [Master.md](./Master.md) — Project context
- [AI-Logs.md](./AI-Logs.md) — Changelog
- [DEPLOY.md](./DEPLOY.md) — Deployment guide
- [Namka Control Dashboard](https://control.namka.cloud) — *(coming soon)*

---

## 💬 Contact

**Ali Mora**
Johannesburg, South Africa
Building AI-assisted SaaS at velocity 🚀

---

## Licence

SmartPress is licensed under the **GNU General Public License v3.0 or later**.
See [`LICENSE`](./LICENSE) for the full text.

The GPL is a deliberate choice, not an inherited default. SmartPress vendors
**libimagequant** for PNG palette quantization, which is GPL-3.0-or-later for
open-source use. Quantization is where the PNG savings are — roughly −87% to
−93% in our benchmarks, against ~20% for lossless-only optimisation — so the
project takes the GPL rather than ship materially worse results.

Third-party components and the provenance of every vendored `.wasm` binary are
recorded in [`NOTICE`](./NOTICE).


---

*Last Updated: 2026-08-26*
