# 🤖 Agent Onboarding — SmartPress

> Read this before doing **any** work in this repo.

---

## Step 1 — Read These Files First (in order)

1. `Master.md` — full project context, stack, phases, decisions
2. `AI_CHANGELOG.md` — what changed recently and current version
3. namka-control `Master.md` — MACP protocol and portfolio overview

**Raw URLs:**
- `https://raw.githubusercontent.com/AliMora83/SmartPress/main/Master.md`
- `https://raw.githubusercontent.com/AliMora83/SmartPress/main/AI_CHANGELOG.md`
- `https://raw.githubusercontent.com/AliMora83/namka-control/main/Master.md`

---

## Step 2 — Agent Roles

| Agent | Role |
|---|---|
| **Claude** | UX review, product decisions, issues AG-Update.md |
| **Comet** | Research, audit, documentation |
| **Gemini** | Architecture, UI proposals |
| **AG (Antigravity)** | Implementation only — executes AG-Update.md |

---

## Step 3 — Rules

- Do not commit code without an AG-Update.md from Claude
- Do not modify `Master.md` during implementation — Comet and Claude own it
- Add a review log entry to `Master.md` at the end of your session
- Check `AI_CHANGELOG.md` for current version before starting work

---

*Part of the [Namka Control](https://github.com/AliMora83/namka-control) portfolio.*
