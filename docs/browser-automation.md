# Live Playwright Browser Automation

Rawal AI now includes a per-thread Playwright Chromium session. The Browser tab can start a live headless Chromium instance and connect to a bidirectional WebSocket stream that sends compact JPEG viewport frames approximately four times per second. The same channel accepts navigation, mouse, typing, keyboard, and scroll commands; if the stream cannot connect, the UI falls back to authenticated screenshot requests. Agent runs can use the same session through the `browser_*` tools.

## Runtime setup

Install the pinned Python dependency and Chromium runtime:

```bash
cd backend
pip install -r requirements.txt
python -m playwright install chromium
```

The application image installs Playwright Chromium during Docker build (`playwright install --with-deps chromium`). Celesto computers can also expose a CDP endpoint via `computer.browser()`. The application keeps the browser session isolated per thread and closes all sessions during shutdown.

## Agent tools

| Tool | Purpose | Permission |
| --- | --- | --- |
| `browser_navigate` | Open an HTTP(S) URL | Safe |
| `browser_screenshot` | Capture the viewport or full page | Safe |
| `browser_inspect` | Read visible text, links, and form controls | Safe |
| `browser_click` | Click a CSS selector | Write |
| `browser_type` | Fill or type into a CSS selector | Write |
| `browser_press` | Press a key or shortcut | Write |
| `browser_mouse` | Move/click at viewport coordinates | Write |
| `browser_scroll` | Scroll the page | Write |

The existing thread permission mode controls agent-initiated write actions. Direct actions from the Browser tab are explicit user actions and use the same authenticated thread session.

## Autonomous planning and recovery

When browser tools are available, the agent receives a browser-specific execution protocol. It plans briefly, inspects the current page before selecting a target, verifies the state after meaningful actions, and avoids repeating an identical failed action. The runner also performs an automatic post-action browser checkpoint and injects the current URL, title, and visible text back into the next model turn. Checkpoints are bounded to three recovery attempts per run; after that limit the agent reports the blocker instead of burning the full step budget on a loop. `browser_recovery` events make these checkpoints visible in the activity stream.

## Isolation and safety

Each thread receives its own Playwright `BrowserContext`, viewport, cookies, storage, and page. Browser sessions are not shared between threads. Navigation is limited to HTTP(S) URLs. The browser is headless by default; the UI receives screenshots rather than a remote desktop stream. Screenshots are returned as in-memory base64 PNG payloads and are not written to the project workspace unless a future artifact workflow explicitly requests persistence.

The browser is intended for user-authorized work. It should not be used to bypass authentication, CAPTCHAs, access controls, or website terms. Production deployments should run the backend and Chromium with a non-root user and an appropriate container seccomp profile. The local development fallback may run Chromium with the host's available sandbox configuration.
