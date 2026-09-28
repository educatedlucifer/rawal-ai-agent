# Security Policy — rawal-ai-agent

## Supported versions

| Version | Supported |
|---|---|
| `2.x` (current) | ✅ |
| `< 2.0` (bhati-era) | ❌ — upgrade; storage keys and DB names migrated automatically |

## Reporting a vulnerability

- **Do not** open a public issue for vulnerabilities.
- Email / DM the maintainer listed in `package.json` → `author`, or open a
  **GitHub Private Vulnerability Report** on the repo.
- Include: affected version/commit, repro steps, impact, and whether secrets
  (SECRET_KEY/JWT_SECRET/AUTH_PASSWORD/tokens) are involved.
- Expect acknowledgement within 72h and a fix/release timeline within 14 days
  for critical issues.

## What counts as critical here

- Auth bypass (`AUTH_PASSWORD`/`ALLOW_ANONYMOUS` misconfig, JWT forgery).
- Sandbox escape (Docker/local path traversal, command injection, SSRF via tools).
- Secret leakage (tokens in logs, URLs, artifacts, shell `ps`, git remotes).
- Stored/reflected XSS via chat artifacts, file preview, or share links.

## Hardening checklist (operator)

1. Set 64+ char `SECRET_KEY` and a *different* `JWT_SECRET` (see `backend/.env.example`).
2. Set strong `AUTH_PASSWORD`; keep `ALLOW_ANONYMOUS=false` on any public host.
3. Set `CORS_ORIGINS` to the exact frontend origin (never `*` in production).
4. Use MongoDB (`MONGO_URI`) on ephemeral hosts (Render Free) — local SQLite is wiped.
  5. Use `SANDBOX_BACKEND=celesto` locally for untrusted code; `cloud` on hosts
     without KVM (Render) with `CELESTO_API_KEY`; `local` only for tests and never
     exposed unauthenticated.
6. Scope tokens minimally (GitHub fine-grained, Telegram allow-list, MCP bearer).
7. Put TLS in front of self-hosted deployments; rotate any secret pasted into chat/logs.
8. On Render Free, set `BROWSER_CDP_URL` to a remote Chromium endpoint instead of
   running Chromium in the 512 MB API container.

See `docs/security.md` for the full threat model and `docs/configuration.md` for
every variable. Never commit `backend/.env`.
