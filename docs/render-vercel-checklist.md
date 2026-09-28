# Render + Vercel — Copy-Paste Checklist

Recommended production shape: **Render** runs the stateful API + agent runtime
(Docker), **Vercel** serves the static React client. One-command local Docker
remains available for single-origin self-hosting.

## 1) Persistence (do this first)

Create a **MongoDB Atlas** database. Copy connection string + db name.
Without it, Render Free wipes `./data` on spin-down/restart.

## 2) Render backend (Blueprint)

1. Dashboard → **New → Blueprint** → connect the repo (public or private).
2. Render detects `render.yaml` → service **`rawal-ai-agent`** (Docker, Free).
3. Set secrets in Dashboard → Environment (never commit):
   - `DEFAULT_LLM_API_KEY` = provider key (required before first agent turn)
   - `AUTH_PASSWORD` = strong login password (required for public)
   - `MONGO_URI` = Atlas URI · `DATABASE_NAME` = `rawal_ai`
   - `SECRET_KEY`, `JWT_SECRET` = auto-generated on first boot; pin stable values for prod
   - `CORS_ORIGINS` = `*` for first boot only, then exact Vercel origin
    - `SANDBOX_BACKEND` = `cloud` (Render has no KVM) with `CELESTO_API_KEY`
   - `BROWSER_CDP_URL` = `wss://…` remote Chromium (required on Free 512 MB; empty = local Chromium, may OOM)
4. Deploy → verify:
   - `https://YOUR-RENDER-SERVICE.onrender.com/api/v1/health`
   - `https://YOUR-RENDER-SERVICE.onrender.com/api/docs`

Notes: blueprint includes a 1 GB `/data` disk; a single API process serves
`$PORT`.

## 3) Vercel frontend

1. Import same repo → **Root Directory = `frontend`**, framework Vite,
   build `npm run build`, output `dist` (see `frontend/vercel.json`).
2. Env: `VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com` (no trailing `/api/v1` — code appends it).
3. Deploy → copy the `https://….vercel.app` origin.
4. Back in Render: set `CORS_ORIGINS=https://….vercel.app` → redeploy backend.
5. Retest: login, project create, chat streaming, terminal, preview.

## 4) Rollback

- Render: Dashboard → Deploys → **Rollback** to previous commit.
- Vercel: Deployments → **Promote** previous deployment.
- Docker local: `docker compose down && git checkout <tag> && docker compose up --build`.

See [deployment.md](deployment.md) for the long form and [configuration.md](configuration.md) for every variable.
