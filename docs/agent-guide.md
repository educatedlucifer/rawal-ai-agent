# Agent Guide — modes, permissions, runs

A **Project** holds **Threads**. Each user turn starts a **run** that streams
events over SSE (`GET /threads/{id}/stream?after=<seq>` with resume).

## Modes

| Mode | Tools | Use when |
|---|---|---|
| **Agent** | Full (files, shell, browser, connectors, artifacts) | Doing the work |
| **Plan** | Read-only | Proposing before destructive/unfamiliar ops |
| **Chat** | None | Q&A without side effects |

Frontend reconnects with sequence-based resume — a network drop never silently
loses events.

## Permissions

- **ask** (default for shared/prod): every mutating tool prompts; approve/deny/`allow_always` per run.
- **auto**: only in a trusted isolated workspace (prefer a Celesto computer).
- Interrupt anytime (`/interrupt`), steer mid-run (`/steer`) without restarting.

## Reliability built-in

Stall watchdog (silent provider streams end visibly), exponential retries,
repeat-tool-call guard, context compaction at `COMPACT_AT_RATIO`, stale-run
recovery after restarts. If the agent looks stuck: check event feed + backend
logs → Interrupt → retry with a healthy provider/model.

## Computer backends (`SANDBOX_BACKEND`)

`auto` (default) = Celesto local microVM when the SDK is installed, else
path-confined local. `celesto` for isolated local computers · `cloud` for
Celesto Cloud (`CELESTO_API_KEY`) · `local` on hosts without virtualization
or in tests. See [configuration.md](configuration.md).

## Artifacts & sharing

Agent-created files appear under Artifacts; share via email transcript
(`SMTP_*`) or share links (`/threads/{id}/share`). Preview dev servers through
`/preview/{thread_id}/{port}/{path}` (ticket-cookie auth when login is enabled).
