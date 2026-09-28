# Rawal AI Troubleshooting Runbook

## Health and logs

```bash
curl -i http://localhost:8000/api/v1/health
curl -i http://localhost:8000/api/docs

docker compose ps
docker compose logs --tail=200 app
```

For local processes, inspect the terminal running Uvicorn and verify that the configured port is listening. On Render, inspect the service logs and confirm the health check path is `/api/v1/health`.

## Authentication failures

If login loops, verify `AUTH_PASSWORD`, `JWT_SECRET`, browser time, and the API origin. Clear the browser's Rawal token from site storage only after confirming the backend is healthy. In split deployment, check that CORS allows the exact Vercel origin.

## Agent stalls

A provider can accept a streaming request and then send no bytes. Rawal's stall watchdog retries the stream and emits a visible error after the retry budget. Check the provider base URL, model identifier, quota, and proxy logs. Use the UI Interrupt action before retrying. If the persisted thread displays `running` after a restart, opening its status endpoint repairs the stale state.

## Render data loss

Render's ephemeral filesystem is not durable across all restarts. Configure `MONGO_URI` or `MONGODB_URI` and test a restart. Google Drive archives are optional additional protection. Do not treat a free-tier filesystem as the only backup.

## Sandbox failures

On a workstation, run `celesto doctor` and set `SANDBOX_BACKEND=celesto`. On Render and other hosts without KVM, set `SANDBOX_BACKEND=cloud` and `CELESTO_API_KEY`. Use `SANDBOX_BACKEND=local` only for tests or trusted host-process execution.

## Frontend failures

A blank page often indicates a stale service-worker cache or a failed build. Run `npm run typecheck`, `npm run build`, inspect the browser console, and clear the service worker. A successful Vercel build with API errors usually means `VITE_API_URL` or backend CORS is wrong.

## Private installer failures

The installer requires a GitHub read token through `RAWAL_GITHUB_TOKEN`, `GH_TOKEN`, or `GITHUB_TOKEN`. Verify the token has access to the private repository and has not expired. Never test by printing the token. Run `node cli/index.js --help` to verify the CLI without contacting GitHub.

## References

[1]: https://render.com/docs/troubleshooting-deploys "Render deployment troubleshooting"
[2]: https://vercel.com/docs/deployments/troubleshoot-a-build "Vercel build troubleshooting"
