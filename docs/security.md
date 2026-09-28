# Rawal AI Security Guide

## Minimum production hardening

Set unique random values for `SECRET_KEY` and `JWT_SECRET`. Set `AUTH_PASSWORD` and keep `ALLOW_ANONYMOUS=false`. Restrict `CORS_ORIGINS` to the deployed frontend. Use HTTPS at the public edge. Store credentials in Render/Vercel secret managers, not in Git.

Use fine-grained GitHub tokens with only the required repository permissions. Restrict Telegram user IDs. Rotate credentials after accidental exposure. Never paste a provider key, GitHub token, npm token, database URI, or service-account JSON into an issue, README, screenshot, or chat.

## Sandbox policy

Celesto microVMs (local or Celesto Cloud) are preferred for untrusted code. The host-local sandbox confines paths and blocks root workspace deletion, but it does not provide VM isolation. Do not expose a local-sandbox instance to untrusted users. Keep command timeouts and resource limits enabled.

## Private repository installer

The private Rawal CLI accepts a token through the environment and uses it only for Git operations. The token is not embedded in the package, written to the checkout, or printed in logs. Use a read-only token where possible. Public npm distribution of the complete application is intentionally disabled.

## Incident response

If a secret is exposed, revoke it immediately, create a replacement, update the hosting secret manager, restart affected services, and inspect Git history and logs. If a workspace is compromised, stop the service, preserve logs, rotate credentials, review GitHub and database access, and restore from a known-good backup.

## References

[1]: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github "GitHub authentication security"
[2]: https://owasp.org/www-project-top-ten/ "OWASP Top Ten"
[3]: https://docs.celesto.ai "Celesto documentation"
