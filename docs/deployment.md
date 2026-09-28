# Rawal AI Deployment Runbook

This runbook covers the supported deployment shapes: one-container Docker, Render backend plus Vercel frontend, local development, and Termux. Choose one shape before creating credentials so that the correct persistence and CORS settings are used.

## Deployment decision

| Deployment | Frontend | Backend | Sandbox | Persistence | Best use |
|---|---|---|---|---|---|
| Docker Compose | Same container | Same container | Docker | Local volume | Complete local installation |
| Render + Vercel | Vercel static hosting | Render Docker service | Local sandbox | MongoDB recommended | Internet-accessible split deployment |
| Local processes | Vite dev server | Uvicorn | Local or Docker | Local SQLite/files | Development and debugging |
| Termux | Browser/PWA | Local Uvicorn | Local | Local storage | Android-only self-hosting |

## Render backend

Create a Blueprint from the private repository so Render uses `render.yaml`. Set the secret values in the Render dashboard rather than committing them. The minimum production set is `DEFAULT_LLM_API_KEY`, `AUTH_PASSWORD`, `SECRET_KEY`, `JWT_SECRET`, `MONGO_URI`, and `DATABASE_NAME`. Set `SANDBOX_BACKEND=cloud` and `CELESTO_API_KEY` because Render web services do not expose KVM.

For browser tools on Render Free, set `BROWSER_CDP_URL` to a private or managed Chromium-over-CDP WebSocket endpoint and keep `BROWSER_MAX_SESSIONS=1`. This keeps Chromium memory outside the 512 MB API container. Browserless, Browserbase, a private VPS, or an always-on local browser host can provide the endpoint. Keep the URL in Render's secret environment because it normally contains a provider token.

```dotenv
BROWSER_CDP_URL=wss://provider.example.com/playwright?token=YOUR_BROWSER_PROVIDER_TOKEN
BROWSER_MAX_SESSIONS=1
BROWSER_IDLE_TIMEOUT_S=900
```

Rawal AI connects with Playwright `connect_over_cdp()`. If `BROWSER_CDP_URL` is empty, it falls back to local Playwright Chromium with a low-memory launch profile.

After deployment, verify `/api/v1/health` and `/api/docs`. If the service starts but the first request is slow, wait for the free-tier cold start and retry. Configure MongoDB before testing project creation so a restart does not remove local state.

## Vercel frontend

Import the repository and set **Root Directory** to `frontend`. The build command is `npm run build` and the output directory is `dist`. Set `VITE_API_URL` to the Render origin without `/api/v1`, for example:

```dotenv
VITE_API_URL=https://rawal-api.onrender.com
```

The frontend code appends `/api/v1`. Set Render `CORS_ORIGINS` to the exact Vercel origin after the first Vercel deployment. Redeploy the backend after changing CORS.

## Docker Compose

```bash
cp backend/.env.example backend/.env
# Set production secrets and the provider key.
docker compose up --build -d
docker compose ps
curl -fsS http://localhost:8000/api/v1/health
docker compose logs -f app
```

Stop without deleting data with `docker compose down`. The `data/` bind mount contains the SQLite database and project workspaces. `docker compose down -v` is intentionally not recommended because it can remove persistent volumes.

## Local processes

```bash
bash install.sh
cp backend/.env.example backend/.env
# Set DEFAULT_LLM_API_KEY and AUTH_PASSWORD.
make dev
```

Run the backend alone with `make backend` and the frontend alone with `make frontend`. Use `SANDBOX_BACKEND=celesto` after `celesto doctor` passes. Use `SANDBOX_BACKEND=cloud` with `CELESTO_API_KEY` on hosts without local virtualization. Use `SANDBOX_BACKEND=local` only when a Celesto computer is unavailable.

## Termux

Install Node.js, Python, Git, and optionally Docker if the device supports it. Clone the private repository with a read-only GitHub token supplied through an environment variable, run `bash install.sh`, configure `backend/.env`, and run the backend on the local network if remote access is required. Do not expose an unauthenticated Termux port to the internet.

## Rollback

For Docker, check out the previous Git commit and rebuild. For Render and Vercel, use the provider's deployment history to promote the previous successful build. Restore MongoDB data only after identifying the failure and taking a backup. Never roll back by deleting `data/` or clearing the database.

## Release checklist

1. Run backend tests and Ruff.
2. Run frontend typecheck and production build.
3. Confirm secrets are absent from `git diff` and build artifacts.
4. Verify health, login, project creation, one streamed message, one tool call, file access, and preview.
5. Confirm CORS and authentication from the deployed frontend.
6. Record the Git commit and deployment URL.

## References

[1]: https://render.com/docs/blueprint-spec "Render Blueprint specification"
[2]: https://vercel.com/docs/projects/overview "Vercel project deployment"
[3]: https://docs.docker.com/compose/ "Docker Compose documentation"
