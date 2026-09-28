<div align="center">

# 🤖 rawal-ai-agent

### Self-hosted autonomous AI workspace — build, research, browse & ship from a controlled sandbox

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/rawal-ai-agent?color=cb3837&logo=npm)](https://www.npmjs.com/package/rawal-ai-agent)
[![CI](https://img.shields.io/github/actions/workflow/status/rawalsinghpsnl/rawal-ai-agent/ci.yml?label=CI&logo=github)](https://github.com/rawalsinghpsnl/rawal-ai-agent/actions)
[![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-blue?logo=python)](backend/requirements.txt)
[![Node 20–22](https://img.shields.io/badge/node-20--22-339933?logo=node.js)](.nvmrc)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?logo=docker)](docker-compose.yml)
[![Render](https://img.shields.io/badge/Render-blueprint-46E3B7?logo=render)](render.yaml)

```bash
npx rawal-ai-agent --mode local --dir rawal-ai-agent
```

**One click. No lock-in. Your keys stay on your infra.**

[Quickstart](docs/quickstart.md) · [Installation](docs/installation.md) · [Render + Vercel](docs/render-vercel-checklist.md) · [API](docs/api-reference.md) · [Security](docs/security.md) · [FAQ](docs/faq.md)

</div>

---

> **Security principle:** `rawal-ai-agent` is self-hosted software. API keys, workspaces,
> model traffic and deployment data remain under *your* control on *your* infrastructure.
> Never commit `backend/.env` — see [docs/security.md](docs/security.md) + [SECURITY.md](SECURITY.md).

## ✨ What you get

| Area | Capability |
|---|---|
| 🧠 Agent runtime | Autonomous multi-step loop, tool execution, steering, interrupt, permissions (`ask`/`auto`), context compaction, repeat-loop guard, visible failure states |
| 💻 Dev workspace | Chat, projects + threads, file tree + editor, terminal, browser preview, artifacts, Git ops, live activity |
| 🔌 Models | OpenAI-compatible + Anthropic-compatible + custom proxies, discovery, streaming, retries, stall watchdog |
| 🛡️ Isolation | Celesto microVM computers (local or Celesto Cloud); path-confined host fallback for tests and hosts without virtualization |
| 🌐 Connectivity | REST + SSE + WebSockets, MCP servers + registry, GitHub/Vercel/Render/HuggingFace/Drive/Telegram |
| 📱 Clients | Responsive web UI, installable PWA, Capacitor Android shell, desktop + mobile browsers |
| ⚙️ Operations | SQLite default, MongoDB for ephemeral hosts, Drive archives, `/health`, structured logs, blueprints |

## 🚀 One-click start

### npm (no git needed)

```bash
npx rawal-ai-agent --mode local --dir rawal-ai-agent
# Docker instead:
npx rawal-ai-agent --mode docker --dir rawal-ai-agent
```

Global: `npm i -g rawal-ai-agent && rawal-ai-agent --mode local`
Termux: `pkg install python nodejs git && npx rawal-ai-agent --mode local`
Details: [docs/npm-registry.md](docs/npm-registry.md) · [docs/installation.md](docs/installation.md)

### Local clone

Linux / macOS / Termux:

```bash
git clone https://github.com/rawalsinghpsnl/rawal-ai-agent.git
cd rawal-ai-agent
bash install.sh
# backend/.env → set DEFAULT_LLM_API_KEY, then:
make dev
```

Windows PowerShell:

```powershell
git clone https://github.com/rawalsinghpsnl/rawal-ai-agent.git
cd rawal-ai-agent
Set-ExecutionPolicy -Scope Process Bypass
.\install.ps1
# backend\.env → DEFAULT_LLM_API_KEY, then run the two printed commands
```

| Service | URL |
|---|---|
| Web (dev) | `http://localhost:5173` |
| API + docs | `http://localhost:8000/api/docs` |
| Health | `http://localhost:8000/api/v1/health` |
| Docker single-origin | `http://localhost:8000` |

### Docker Compose (complete local prod)

```bash
cp backend/.env.example backend/.env
# set SECRET_KEY, JWT_SECRET, AUTH_PASSWORD, DEFAULT_LLM_API_KEY
docker compose up --build
```

## 🏗️ Repo layout

```text
.
├── backend/          FastAPI API, agent runtime, tools, sandbox, storage, tests
│   ├── app/agent/    Prompts, loop, memory, permissions, compaction, scheduler
│   ├── app/api/v1/   Auth, projects, threads, chat, files, terminal, preview
│   ├── app/llm/      Provider clients, streaming, retries, stall watchdog
│   ├── app/sandbox/  Celesto computers (local microVM / Celesto Cloud) + host-local fallback
│   ├── app/tools/    Files, shell, browser, web, git, MCP, tasks, artifacts
│   └── tests/        Regression + integration tests
├── frontend/         React 18 + Vite + TS + Tailwind (PWA + Capacitor shell)
├── cli/              npm installer source → published as `rawal-ai-agent`
├── sandbox/          Legacy image (unused; computers now run on Celesto)
├── docs/             Full guides (start at docs/README.md)
├── Dockerfile        Prod image: frontend build + backend runtime
├── docker-compose.yml  Local single-origin stack
├── render.yaml       Render backend blueprint (Docker + disk)
├── install.sh        Linux/macOS/Termux one-click (self-healing)
├── install.ps1       Windows one-click (self-healing)
└── Makefile          Dev commands (Linux/macOS; Windows uses npm scripts)
```

Frontend deploys to Vercel with **Root Directory = `frontend`** (`frontend/vercel.json`).
Backend deploys to Render via Blueprint (`render.yaml`).

## ☁️ Production: Render backend + Vercel frontend

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

1. **MongoDB Atlas** first (Render Free filesystem is ephemeral).
2. Render → **New → Blueprint** → connect repo → set `DEFAULT_LLM_API_KEY`,
   `AUTH_PASSWORD`, `MONGO_URI`, `DATABASE_NAME` (+ `BROWSER_CDP_URL` on Free).
3. Vercel → import repo, Root `frontend`, `VITE_API_URL=https://YOUR-RENDER.onrender.com`.
4. Back in Render set `CORS_ORIGINS=https://YOUR-APP.vercel.app` → redeploy.

Full checklist: [docs/render-vercel-checklist.md](docs/render-vercel-checklist.md) ·
runbook: [docs/deployment.md](docs/deployment.md)

## 🔑 Configuration

Copy `backend/.env.example` → `backend/.env`. Minimum for first agent turn:
`DEFAULT_LLM_BASE_URL` + `DEFAULT_LLM_API_KEY` + `DEFAULT_LLM_MODEL`.
Public hosts also need `SECRET_KEY` + `JWT_SECRET` (64+ chars, different) +
`AUTH_PASSWORD` + exact `CORS_ORIGINS` + `MONGO_URI`.

Every variable explained: [docs/configuration.md](docs/configuration.md)

## 🤖 Agent operation

Threads stream runs over SSE with resume. **Agent** = full tools ·
**Plan** = read-only proposal · **Chat** = no tools. Use `ask` permissions on
shared/prod, `auto` only in trusted isolation. Interrupt/steer anytime.
Details: [docs/agent-guide.md](docs/agent-guide.md) · API: [docs/api-reference.md](docs/api-reference.md)

## ✅ Quality gates

```bash
cd backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check app/ tests/
npm --prefix frontend run typecheck && npm --prefix frontend run build
cd cli && node --check index.js && npm pack --dry-run
```

CI runs the same on every PR (plus Gitleaks). See [CONTRIBUTING.md](CONTRIBUTING.md).

## 🔒 Security

Threat model + hardening: [docs/security.md](docs/security.md) · policy: [SECURITY.md](SECURITY.md) ·
report vulnerabilities **privately** (never as public issues).

## 🗺️ Docs

[Index](docs/README.md) · [Quickstart](docs/quickstart.md) · [Install](docs/installation.md) ·
[npm](docs/npm-registry.md) · [Config](docs/configuration.md) · [Deploy](docs/deployment.md) ·
[Architecture](docs/architecture.md) · [Agent](docs/agent-guide.md) · [API](docs/api-reference.md) ·
[Browser](docs/browser-automation.md) ·
[Troubleshooting](docs/troubleshooting.md) · [FAQ](docs/faq.md) · [Changelog](docs/CHANGELOG.md)

## 📜 License & attribution

MIT — see [LICENSE](LICENSE). Attribution + fork rules that keep credit safe:
[NOTICE](NOTICE). Please don't publish typosquat npm packages claiming to be upstream.

---

<div align="center">

**Built in the open. Run anywhere. Fork responsibly — keep the `rawal-ai-agent` name pointing home.** 🛡️

`npx rawal-ai-agent` · `docker compose up --build` · `make dev`

</div>
