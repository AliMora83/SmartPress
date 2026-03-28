# 🗜️ SmartPress

> Fast, smart compression for images and videos — powered by Next.js 15 + Python FastAPI + FFmpeg.

---

## 📌 Overview

**SmartPress** is a self-contained media compression utility with a Smart-Bot branded two-column UI. It supports batch image (JPG, PNG) and video (MP4) compression with client-side previews and a Python FastAPI backend handling FFmpeg processing.

- **Owner:** Ali Mora
- **Location:** Johannesburg, ZA
- **Updated:** 2026-03-29
- **Status:** 🟡 Active Development

---

## 🎯 Mission

Ship a fast, beautiful, zero-auth media compression tool that anyone can self-host or deploy to Vercel + Cloud Run in minutes.

---

## 🏗 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS |
| Backend | Python FastAPI |
| Media Processing | FFmpeg (via Python subprocess) |
| Styling / Fonts | Tailwind CSS, Montserrat (Extra Bold) |
| Deployment (FE) | Vercel |
| Deployment (BE) | Docker + Google Cloud Run |

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

## 🗂 Project Structure

```
SmartPress/
├── app/               # Next.js app directory
├── components/        # React components
├── backend/           # Python FastAPI + FFmpeg
├── public/            # Smart-Bot mascot + static assets
├── Master.md          # MACP project master file
├── DEPLOY.md          # Deployment guide
├── DEPLOY_CLOUD_RUN.md
└── README.md
```

---

## ✨ Features

- 🎨 **Beautiful UI** — Two-column layout with Smart-Bot mascot branding
- 🚀 **Fast Compression** — Client-side preview + server-side FFmpeg processing
- 📦 **Batch Operations** — Compress All and Download All functionality
- 🎯 **Multiple Formats** — JPG, PNG (images) and MP4 (video)
- 🤖 **Smart Branding** — Montserrat typography with responsive design
- 📝 **Auto Prefix** — All compressed outputs named `smartpress_*` for easy identification

---

## 🤖 AI Agent Briefing Protocol

> **If you are an AI assistant (Claude, Gemini, Antigravity, Comet, or any agent) reading this file:**

Before starting any work on this project, you **must** read the full `Master.md` file. It is the single source of truth and contains:

- Architecture decisions and ratified tech choices
- Current milestone, next step, and blockers
- AI model assignments
- Existing AI reviews and cross-checked decisions

### 📥 Master.md — Direct Links

```
https://github.com/AliMora83/SmartPress/blob/main/Master.md
```

Raw (for programmatic access):

```
https://raw.githubusercontent.com/AliMora83/SmartPress/main/Master.md
```

### ✅ Briefing Protocol

Use this prompt at the start of any session:

> *"Before starting SmartPress work, read Master.md at the URL above and check the **AI Reviews & Artifacts** section for existing ratified decisions. Do not re-architect anything marked `Ratified` without explicit approval from Ali."*

### 🔁 After Your Work

Commit any decisions, architecture choices, or review notes back to `Master.md` under the **AI Reviews & Artifacts** section, following the existing format. Set status to `Agent Reviewed` so the next agent knows to cross-check it.

---

## 🤖 AI Agents

| Agent | Role |
|-------|------|
| **Claude** | Full-stack agent — React, TypeScript, architecture |
| **Gemini** | Analysis + automation tasks |
| **Comet (Perplexity)** | Cross-check, ratification, architecture review |
| **Antigravity** | Build agent — autonomous implementation |

Review consensus states: `Unreviewed` → `Agent Reviewed` → `Cross-Checked` → `Ratified`

---

## 📡 Mission Control

This project is tracked in **Namka Mission Control** — the central hub for all of Ali's projects.

| Resource | Link |
|----------|------|
| Mission Control Master.md | [Namka-Mission-Control](https://github.com/AliMora83/Namka-Mission-Control/blob/main/Master.md) |
| SmartPress Master.md | [Master.md](./Master.md) |
| Deploy Guide | [DEPLOY.md](./DEPLOY.md) |
| Cloud Run Deploy | [DEPLOY_CLOUD_RUN.md](./DEPLOY_CLOUD_RUN.md) |

---

_Last updated by: Comet (Perplexity) on 2026-03-29_
