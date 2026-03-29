# 🚀 SmartPress

> Fast, smart compression for images and videos — powered by Next.js 15 + Python FastAPI + FFmpeg.

## 📊 Overview

**SmartPress** is a self-contained media compression utility with a Smart-Bot branded two-column UI. It supports batch image (JPG, PNG) and video (MP4) compression with client-side previews and a Python FastAPI backend handling FFmpeg processing — all with zero auth and no database required.

- **Owner**: Ali Mora
- **Location**: Johannesburg, ZA
- **Updated**: 2026-03-29
- **Status**: 🟡 Active Development
- **Priority**: 🟡 Priority 2

---

## ✨ Features

- 🎨 **Beautiful UI** — Two-column layout with Smart-Bot mascot branding
- 🚀 **Fast Compression** — Client-side preview + server-side FFmpeg processing
- 📦 **Batch Operations** — Compress All and Download All functionality
- 🎯 **Multiple Formats** — JPG, PNG (images) and MP4 (video)
- 🤖 **Smart Branding** — Montserrat typography with responsive design
- 📝 **Auto Prefix** — All compressed outputs named `smartpress_*` for easy identification

---

## 🏗 Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 |
| Language | TypeScript |
| Styling | Tailwind CSS + Montserrat (Extra Bold) |
| Backend | Python FastAPI |
| Media Processing | FFmpeg (via Python subprocess) |
| Database | None (stateless) |
| Auth | None (public tool) |
| Hosting | Vercel (FE) / Docker + Google Cloud Run (BE) |

---

## 🚀 Getting Started

### Frontend

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The backend API will run on [http://localhost:8000](http://localhost:8000).

---

## 📝 File Structure

```
SmartPress/
├── AGENT-ONBOARDING.md      # AI agent rules & MACP protocol
├── Master.md                # Source of truth — read this first
├── README.md                # This file
├── DEPLOY.md                # Deployment guide
├── DEPLOY_CLOUD_RUN.md      # Cloud Run deployment guide
├── Dockerfile               # Backend containerisation
├── app/                     # Next.js app directory
├── components/              # React components
├── backend/                 # Python FastAPI + FFmpeg
└── public/                  # Smart-Bot mascot + static assets
```

---

## 🤖 AI Agent Info

| Field | Value |
|-------|-------|
| **Assigned Agent** | Comet / Claude |
| **Agent Role** | Architecture review, full-stack implementation |
| **MACP Status** | Active |
| **Last Review** | 2026-03-29 |

> For AI agents: Read `AGENT-ONBOARDING.md` and `Master.md` before acting on this repo.

### Master.md Direct Links

```
https://github.com/AliMora83/SmartPress/blob/main/Master.md
```

Raw (for programmatic access):

```
https://raw.githubusercontent.com/AliMora83/SmartPress/main/Master.md
```

---

## 🔄 Current Phase

**Phase 1 — MVP Stabilisation**

- [x] Project scaffolding and UI
- [x] FastAPI + FFmpeg backend
- [x] Batch compress + download
- [ ] FFmpeg error handling for unsupported formats
- [ ] Frontend + backend deployment (Vercel + Cloud Run)

---

## 📌 Quick Links

- [Master.md](./Master.md) — Source of truth
- [AGENT-ONBOARDING.md](./AGENT-ONBOARDING.md) — Agent rules
- [DEPLOY.md](./DEPLOY.md) — Deployment guide
- [DEPLOY_CLOUD_RUN.md](./DEPLOY_CLOUD_RUN.md) — Cloud Run deployment
- [Namka Control Dashboard](https://control.namka.cloud) — *(coming soon)*
- [Namka Mission Control](https://github.com/AliMora83/Namka-Mission-Control) — Parent repo

---

## 💬 Contact

**Ali Mora**
Johannesburg, South Africa
Building AI-assisted SaaS at velocity 🚀

---

*Last Updated: 2026-03-29*
