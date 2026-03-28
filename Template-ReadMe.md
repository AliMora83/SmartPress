# 🧭 Namka Mission Control

> AI-Supported Mission Control for managing multi-project, multi-agent development at velocity.

---

## 📌 Overview

**Namka Mission Control** is the central command hub for Ali Mora's portfolio of AI-assisted SaaS projects. It tracks priorities, blockers, AI agent assignments, and infrastructure across all active repositories — ensuring humans and AI agents always work from a single source of truth.

- **Owner:** Ali Mora
- **Location:** Johannesburg, ZA
- **Updated:** 2026-03-28

---

## 🎯 Mission

Build and ship a portfolio of AI-assisted SaaS products across edtech, events, 3D manufacturing, and developer tooling — leveraging free-tier APIs and AI coding assistants (Gemini, Claude, Qwen) for maximum velocity.

---

## 🗂 Active Projects (Summary)

| # | Project | Stack | Priority | Status |
|---|---------|-------|----------|--------|
| 1 | Odoo POS Terminal | Python / Odoo | 🔴 Ship Now | Active |
| 2 | Bridging Africa API | Python / Odoo | 🔴 Ship Now | Active |
| 3 | EventSaas | TypeScript / React | 🔴 Ship Now | Active |
| 4 | Kora Tutor | TypeScript / Next.js | 🟡 Active Dev | Active |
| 5 | SmartPress (3D) | TypeScript | 🟡 Active Dev | Active |
| 6 | OpenMindi AI Studio | JavaScript | 🟡 Active Dev | Active |
| 7 | Atlas Website | TypeScript | 🟡 Active Dev | Active |
| 8 | Namka Mission Control | TypeScript | 🟡 Active Dev | Active |
| 9 | Khula Landing | TypeScript / React | 🟡 Active Dev | Active |
| 10 | Khula Learning | JavaScript / Firebase | 🟡 Active Dev | Active |

> See `Master.md` for the full project list including Priority 3–5 projects, blockers, and next steps.

---

## 🏗 Infrastructure

| Service | Purpose |
|---------|---------|
| GitHub (AliMora83) | All source code repos |
| Netlify | Frontend deployments |
| Vercel | Next.js deployments |
| Firebase | Auth + DB for Khula Learning |
| Odoo.sh | Odoo backend (Bridging Africa, POS) |
| Google Apps Script | Dev Mission Control automation |
| Google Sheets | Dev Mission Control dashboard |

---

## 🤖 AI Agents

This project uses a **Multi-Agent Context Protocol (MACP)** to coordinate AI assistants across projects:

| Agent | Role |
|-------|------|
| **Qwen** | Build agent — Odoo, Python, autonomous implementation |
| **Claude** | Full-stack agent — React, TypeScript, architecture |
| **Gemini** | Analysis + low-priority automation tasks |
| **Comet (Perplexity)** | Cross-check, ratification, architecture review |

Review consensus states: `Unreviewed` → `Agent Reviewed` → `Cross-Checked` → `Ratified`

---

## 📋 Dev Mission Control

- **Sheet:** [Google Sheets Dashboard](https://docs.google.com/spreadsheets/d/1h-Yy9hkVHWr-BbnLiXVcMZ4b8eQm__d4QOCvY8mO3y8)
- **Apps Script:** [Automation Script](https://script.google.com/u/0/home/projects/1sDVQDD510ZC0UHpfvpIkt4TvbMnNRTNtYzivxuZ8qB2oeud6DvzcV_MO/edit)

---

## 📄 Using This Template

This is the **ReadMe template** for new projects under the Namka umbrella. Copy and populate the sections relevant to your project. Keep it concise — the Master.md is the canonical source of truth for deep context.

---

---

## 🤖 Instructions for AI Agents

> **If you are an AI assistant (Claude, Gemini, Qwen, Perplexity, or any agent) reading this file:**

Before starting any work on this project or any project in this portfolio, you **must** read the full `Master.md` file. It is the single source of truth and contains:

- All active projects, stacks, and statuses
- Current next steps and blockers per project
- AI model assignments per project
- Infrastructure details and API key registry
- Ratified architecture decisions from previous AI reviews

### 📥 Master.md — Direct Link

```
https://github.com/AliMora83/Namka-Mission-Control/blob/main/Master.md
```

Raw (for programmatic access):
```
https://raw.githubusercontent.com/AliMora83/Namka-Mission-Control/main/Master.md
```

### ✅ Briefing Protocol

Use this prompt at the start of any session:

> *"Before starting [project name], read Master.md at the URL above and check the **AI Reviews & Artifacts** section for existing ratified decisions. Do not re-architect anything marked `Ratified` without explicit approval from Ali."*

### 🔁 After Your Work

Commit any decisions, architecture choices, or review notes back to `Master.md` under the **AI Reviews & Artifacts** section, following the existing format. Set status to `Agent Reviewed` for your entry so the next agent knows to cross-check it.
