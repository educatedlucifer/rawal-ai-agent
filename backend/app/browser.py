"""Per-thread Playwright browser sessions for live computer-use automation.

The manager keeps one isolated browser context per thread. Playwright is imported
lazily so the backend remains bootable when the optional browser runtime is not
installed; callers receive a clear setup error instead of a startup failure.
"""

from __future__ import annotations

import asyncio
import base64
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("app.browser")


class BrowserUnavailable(RuntimeError):
    """Raised when Playwright or its Chromium runtime is unavailable."""


@dataclass
class BrowserSnapshot:
    url: str
    title: str
    image_base64: str
    width: int
    height: int
    captured_at: float


class BrowserSession:
    def __init__(self, thread_id: str, workspace: str) -> None:
        self.thread_id = thread_id
        self.workspace = Path(workspace)
        self._playwright: Any = None
        self.browser: Any = None
        self.context: Any = None
        self.page: Any = None
        self.remote = bool(settings.BROWSER_CDP_URL)
        self.lock = asyncio.Lock()
        self.started_at = time.time()

    async def start(self, url: str | None = None) -> None:
        async with self.lock:
            if self.page and not self.page.is_closed():
                if url:
                    await self.page.goto(url, wait_until="domcontentloaded", timeout=30_000)
                return
            try:
                from playwright.async_api import async_playwright
            except ImportError as exc:  # pragma: no cover - environment dependent
                raise BrowserUnavailable(
                    "Playwright is not installed. Install backend requirements and run "
                    "`playwright install chromium`."
                ) from exc
            self._playwright = await async_playwright().start()
            try:
                cdp_url = settings.BROWSER_CDP_URL
                if not cdp_url:
                    from app.sandbox import sandboxes

                    box = await sandboxes.peek(self.thread_id)
                    getter = getattr(box, "browser_cdp_url", None)
                    if callable(getter):
                        cdp_url = await getter() or ""
                if cdp_url:
                    self.remote = True
                    self.browser = await self._playwright.chromium.connect_over_cdp(
                        cdp_url, timeout=30_000
                    )
                    self.context = self.browser.contexts[0] if self.browser.contexts else await self.browser.new_context(
                        viewport={"width": 1280, "height": 820},
                        device_scale_factor=1,
                        ignore_https_errors=False,
                    )
                else:
                    await self._ensure_chromium()
                    self.browser = await self._playwright.chromium.launch(
                        headless=True,
                        args=[
                            "--disable-dev-shm-usage",
                            "--disable-background-networking",
                            "--disable-features=Translate,BackForwardCache",
                            "--disable-extensions",
                            "--disable-gpu",
                            "--no-first-run",
                            "--no-default-browser-check",
                            "--no-zygote",
                            "--renderer-process-limit=1",
                            "--js-flags=--max-old-space-size=128",
                        ],
                    )
                    self.context = await self.browser.new_context(
                        viewport={"width": 1280, "height": 820},
                        device_scale_factor=1,
                        ignore_https_errors=False,
                    )
                self.page = await self.context.new_page()
                self.page.set_default_timeout(15_000)
                if url:
                    await self.page.goto(url, wait_until="domcontentloaded", timeout=30_000)
            except Exception:
                await self._close_unlocked()
                raise

    async def _ensure_chromium(self) -> None:
        """Install the pinned Playwright browser on first use when absent.

        Render and slim Python images often contain the Playwright package but
        not its browser cache. Browser startup must not depend on the agent's
        shell tool: that tool may itself be unavailable while the workspace
        driver is recovering. The install is bounded and uses Playwright's
        normal cache location, so later sessions start immediately.
        """
        executable = Path(self._playwright.chromium.executable_path)
        if executable.exists():
            return
        env = os.environ.copy()
        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "playwright",
            "install",
            "chromium",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=180)
        except TimeoutError as exc:
            proc.kill()
            await proc.wait()
            raise BrowserUnavailable("Chromium installation timed out after 180 seconds") from exc
        if proc.returncode != 0 or not executable.exists():
            detail = (stderr or stdout).decode(errors="replace")[-1200:]
            raise BrowserUnavailable(
                "Playwright Chromium is missing and automatic installation failed. "
                "Install it with `python -m playwright install chromium`. "
                f"Details: {detail}"
            )

    async def ensure(self) -> Any:
        await self.start()
        if not self.page:
            raise BrowserUnavailable("Browser page could not be created")
        return self.page

    async def navigate(self, url: str) -> dict[str, Any]:
        page = await self.ensure()
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            raise ValueError("browser navigation only supports http(s) URLs")
        async with self.lock:
            response = await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
            return {
                "url": page.url,
                "title": await page.title(),
                "status_code": response.status if response else None,
            }

    async def screenshot(self, full_page: bool = False) -> BrowserSnapshot:
        page = await self.ensure()
        async with self.lock:
            image = await page.screenshot(type="png", full_page=full_page, animations="disabled")
            return BrowserSnapshot(
                url=page.url,
                title=await page.title(),
                image_base64=base64.b64encode(image).decode("ascii"),
                width=await page.evaluate("() => window.innerWidth"),
                height=await page.evaluate("() => window.innerHeight"),
                captured_at=time.time(),
            )

    async def frame(self, quality: int = 68) -> BrowserSnapshot:
        """Capture a compact viewport frame for the realtime browser stream."""
        page = await self.ensure()
        async with self.lock:
            image = await page.screenshot(type="jpeg", quality=max(35, min(quality, 90)))
            return BrowserSnapshot(
                url=page.url,
                title=await page.title(),
                image_base64=base64.b64encode(image).decode("ascii"),
                width=await page.evaluate("() => window.innerWidth"),
                height=await page.evaluate("() => window.innerHeight"),
                captured_at=time.time(),
            )

    async def click(self, selector: str, button: str = "left", click_count: int = 1) -> dict[str, Any]:
        page = await self.ensure()
        async with self.lock:
            locator = page.locator(selector).first
            await locator.click(button=button, click_count=click_count)
            return {"selector": selector, "url": page.url, "title": await page.title()}

    async def type_text(self, selector: str, text: str, clear: bool = True) -> dict[str, Any]:
        page = await self.ensure()
        async with self.lock:
            locator = page.locator(selector).first
            if clear:
                await locator.fill(text)
            else:
                await locator.press_sequentially(text)
            return {"selector": selector, "characters": len(text), "url": page.url}

    async def press(self, key: str, selector: str | None = None) -> dict[str, Any]:
        page = await self.ensure()
        async with self.lock:
            if selector:
                await page.locator(selector).first.press(key)
            else:
                await page.keyboard.press(key)
            return {"key": key, "selector": selector, "url": page.url}

    async def mouse(self, action: str, x: float, y: float, button: str = "left") -> dict[str, Any]:
        page = await self.ensure()
        async with self.lock:
            if action == "move":
                await page.mouse.move(x, y)
            elif action == "click":
                await page.mouse.click(x, y, button=button)
            elif action == "dblclick":
                await page.mouse.dblclick(x, y, button=button)
            else:
                raise ValueError("mouse action must be move, click, or dblclick")
            return {"action": action, "x": x, "y": y, "url": page.url}

    async def scroll(self, delta_x: float = 0, delta_y: float = 700) -> dict[str, Any]:
        page = await self.ensure()
        async with self.lock:
            await page.mouse.wheel(delta_x, delta_y)
            position = await page.evaluate("() => ({ x: window.scrollX, y: window.scrollY })")
            return {"scroll_x": position["x"], "scroll_y": position["y"], "url": page.url}

    async def inspect(self, max_chars: int = 12_000) -> dict[str, Any]:
        page = await self.ensure()
        async with self.lock:
            data = await page.evaluate(
                """() => ({
                    url: location.href,
                    title: document.title,
                    text: (document.body?.innerText || '').slice(0, 20000),
                    links: Array.from(document.querySelectorAll('a[href]')).slice(0, 100).map(a => ({
                      text: (a.innerText || a.textContent || '').trim().slice(0, 160), href: a.href
                    })),
                    inputs: Array.from(document.querySelectorAll('input,textarea,select,button')).slice(0, 100).map(el => ({
                      tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || '',
                      name: el.getAttribute('name') || '', placeholder: el.getAttribute('placeholder') || '',
                      value: el.value || '',
                      text: (el.innerText || '').trim().slice(0, 120),
                      aria: el.getAttribute('aria-label') || ''
                    }))
                })"""
            )
            data["text"] = data.get("text", "")[:max_chars]
            return data

    async def close(self) -> None:
        async with self.lock:
            await self._close_unlocked()

    async def _close_unlocked(self) -> None:
        try:
            if self.context:
                await self.context.close()
            if self.browser:
                await self.browser.close()
            if self._playwright:
                await self._playwright.stop()
        finally:
            self.context = None
            self.browser = None
            self.page = None
            self._playwright = None


class BrowserManager:
    def __init__(self) -> None:
        self._sessions: dict[str, BrowserSession] = {}
        self._lock = asyncio.Lock()

    async def get(self, thread_id: str, workspace: str) -> BrowserSession:
        evicted: BrowserSession | None = None
        async with self._lock:
            session = self._sessions.get(thread_id)
            if session is None:
                if len(self._sessions) >= max(1, settings.BROWSER_MAX_SESSIONS):
                    oldest_id = min(self._sessions, key=lambda key: self._sessions[key].started_at)
                    evicted = self._sessions.pop(oldest_id)
                session = BrowserSession(thread_id, workspace)
                self._sessions[thread_id] = session
        if evicted:
            await evicted.close()
        return session

    async def peek(self, thread_id: str) -> BrowserSession | None:
        return self._sessions.get(thread_id)

    async def close(self, thread_id: str) -> None:
        session = self._sessions.pop(thread_id, None)
        if session:
            await session.close()

    async def close_all(self) -> None:
        for thread_id in list(self._sessions):
            await self.close(thread_id)


browsers = BrowserManager()
