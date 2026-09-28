# Rawal AI Configuration Reference

Rawal AI uses Pydantic settings loaded from `backend/.env`. In managed hosting, define the same variables in the provider dashboard. Variable names are case-insensitive, but uppercase names are recommended for portability.

## Application and security

`ENV` accepts `dev` or `prod`. `HOST` and `PORT` control the API bind address. `LOG_LEVEL` controls structured log verbosity. `CORS_ORIGINS` accepts `*` or a comma-separated list of exact origins.

`SECRET_KEY` and `JWT_SECRET` must be long, random, unique values in production. `AUTH_PASSWORD` enables the login gate. `AUTH_USERNAME` chooses the login identity. `ALLOW_ANONYMOUS=true` intentionally permits open access and should only be used on a private local network.

## Persistence

`DATA_DIR` stores SQLite and local application data. `WORKSPACE_ROOT` stores project workspaces. `DATABASE_URL` can point to an async SQL database supported by the backend. `MONGO_URI` and `MONGODB_URI` are accepted aliases; `MONGODB_DB_NAME` overrides `DATABASE_NAME` when supplied. Use MongoDB on ephemeral hosts.

`GDRIVE_CREDENTIALS_JSON` accepts raw or base64 service-account JSON. `GDRIVE_FOLDER_ID` selects the archive folder. Google Drive is optional and should be treated as a backup layer, not the only live database.

## LLM providers

`DEFAULT_LLM_BASE_URL`, `DEFAULT_LLM_API_KEY`, and `DEFAULT_LLM_MODEL` define the fallback provider. The UI can add additional providers. `LLM_TIMEOUT_SECONDS` controls provider request timeouts. `MAX_AGENT_STEPS` limits one autonomous turn. `MAX_CONTEXT_TOKENS` and `COMPACT_AT_RATIO` control history compaction.

## Computer (Celesto)

`SANDBOX_BACKEND` supports `auto`, `celesto`, `cloud`, and `local`. `auto` selects a local Celesto microVM when the SDK is installed and otherwise falls back to a path-confined host process. `celesto` always uses a local microVM (`celesto doctor` must pass). `cloud` uses Celesto Cloud and needs `CELESTO_API_KEY`. `local` is the test/fallback host process.

A trusted workstation should prefer `celesto`. Render and other hosts without KVM should use `cloud`. Do not run untrusted code with a host-local sandbox exposed to the public internet.

## Integrations

`GITHUB_TOKEN` enables repository operations and workspace sync. `VERCEL_TOKEN`, `RENDER_TOKEN`, and `HF_TOKEN` enable their respective integration clients. `TELEGRAM_BOT_TOKEN` enables Telegram and `TELEGRAM_ALLOWED_USER_IDS` restricts users. Search uses `duckduckgo` without a key by default; Tavily and Brave require their respective API keys.

SMTP variables enable transcript sharing. Keep SMTP credentials in the hosting provider's secret store.

## Copy-ready configuration

The canonical complete configuration block is maintained in the root README and `backend/.env.example`. Copy the entire file for a new environment, then replace every production placeholder. Do not copy secrets from one environment into another.

## References

[1]: https://docs.pydantic.dev/latest/concepts/pydantic_settings/ "Pydantic Settings documentation"
[2]: https://www.mongodb.com/docs/atlas/ "MongoDB Atlas documentation"
