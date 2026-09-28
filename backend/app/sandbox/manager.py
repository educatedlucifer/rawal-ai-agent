"""Sandbox lifecycle: one Celesto computer per thread, reaped when idle."""

from __future__ import annotations

import asyncio
import time
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.core.crypto import decrypt
from app.core.logging import get_logger
from app.db.models import Setting
from app.db.session import SessionLocal
from app.sandbox.base import Sandbox, SandboxInfo
from app.sandbox.celesto_sandbox import CelestoSandbox, celesto_available
from app.sandbox.local_sandbox import LocalSandbox

log = get_logger("app.sandbox.manager")

SANDBOX_CONFIG_KEY = "sandbox_config"
VALID_BACKENDS = ("auto", "celesto", "cloud", "local")


async def load_sandbox_config() -> dict[str, Any]:
    """DB-backed sandbox setting (Settings → Sandbox). Missing → {}."""
    try:
        async with SessionLocal() as db:
            row = await db.get(Setting, SANDBOX_CONFIG_KEY)
            if row and isinstance(row.value, dict):
                return dict(row.value)
    except Exception as exc:
        log.warning("could not load sandbox config: %s", exc)
    return {}


async def save_sandbox_config(patch: dict[str, Any]) -> dict[str, Any]:
    async with SessionLocal() as db:
        row = await db.get(Setting, SANDBOX_CONFIG_KEY)
        current = dict(row.value) if row and isinstance(row.value, dict) else {}
        current.update({k: v for k, v in patch.items() if v is not None})
        if row is None:
            db.add(Setting(key=SANDBOX_CONFIG_KEY, value=current))
        else:
            row.value = current
        await db.commit()
        return current


def resolve_celesto_key(config: dict[str, Any] | None = None) -> str:
    config = config if config is not None else {}
    enc = str(config.get("celesto_key_enc") or "")
    if enc:
        key = decrypt(enc)
        if key:
            return key
    return settings.CELESTO_API_KEY


class SandboxManager:
    def __init__(self) -> None:
        self._boxes: dict[str, Sandbox] = {}
        self._touched: dict[str, float] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._backend: str | None = None
        self._reaper: asyncio.Task | None = None

    async def backend(self) -> str:
        if self._backend is None:
            config = await load_sandbox_config()
            configured = str(config.get("backend") or settings.SANDBOX_BACKEND)
            if configured not in VALID_BACKENDS:
                log.warning("unknown sandbox backend %r — using auto", configured)
                configured = "auto"
            if configured == "auto":
                self._backend = "celesto" if celesto_available() else "local"
                if self._backend == "local":
                    log.warning("Celesto unavailable — sandboxes will run on the host process")
            elif configured == "cloud":
                if resolve_celesto_key(config):
                    self._backend = "cloud"
                else:
                    log.warning("Celesto Cloud selected but no API key set — falling back to local Celesto")
                    self._backend = "celesto" if celesto_available() else "local"
            else:
                self._backend = configured
            log.info("sandbox backend: %s", self._backend)
        return self._backend

    async def configure(self) -> str:
        """Drop cached selection (call after the sandbox setting changes)."""
        self._backend = None
        return await self.backend()

    def _lock(self, key: str) -> asyncio.Lock:
        return self._locks.setdefault(key, asyncio.Lock())

    async def get(self, thread_id: str, workspace: str) -> Sandbox:
        async with self._lock(thread_id):
            box = self._boxes.get(thread_id)
            if box is None:
                Path(workspace).mkdir(parents=True, exist_ok=True)
                backend = await self.backend()
                if backend in ("celesto", "cloud"):
                    box = await self._get_celesto(thread_id, workspace, backend)
                else:
                    box = LocalSandbox(thread_id, workspace)
                    await box.start()
                self._boxes[thread_id] = box
            self._touched[thread_id] = time.time()
            return box

    async def _get_celesto(self, thread_id: str, workspace: str, backend: str) -> Sandbox:
        config = await load_sandbox_config()
        try:
            box = CelestoSandbox(
                thread_id,
                workspace,
                provider="cloud" if backend == "cloud" else "local",
                api_key=resolve_celesto_key(config),
            )
            await box.start()
            return box
        except Exception as exc:
            log.warning("celesto computer failed for %s (%s) — using local", thread_id, exc)
            box = LocalSandbox(thread_id, workspace)
            await box.start()
            return box

    async def pool_status(self) -> dict[str, Any]:
        return {"active": False}

    async def peek(self, thread_id: str) -> Sandbox | None:
        return self._boxes.get(thread_id)

    def touch(self, thread_id: str) -> None:
        """Mark a box recently-used WITHOUT creating it."""
        if thread_id in self._boxes:
            self._touched[thread_id] = time.time()

    async def release(self, thread_id: str, *, remove: bool = True) -> None:
        async with self._lock(thread_id):
            box = self._boxes.pop(thread_id, None)
            self._touched.pop(thread_id, None)
        if box is not None:
            await box.stop(remove=remove)

    async def restart(self, thread_id: str, workspace: str) -> Sandbox:
        await self.release(thread_id)
        return await self.get(thread_id, workspace)

    async def info(self, thread_id: str) -> SandboxInfo | None:
        box = self._boxes.get(thread_id)
        return await box.info() if box else None

    async def list(self) -> list[SandboxInfo]:
        return [await box.info() for box in list(self._boxes.values())]

    def start_reaper(self) -> None:
        if self._reaper is None or self._reaper.done():
            self._reaper = asyncio.create_task(self._reap_loop())

    async def _reap_loop(self) -> None:
        interval = max(60, settings.SANDBOX_IDLE_TIMEOUT_S // 4)
        while True:
            try:
                await asyncio.sleep(interval)
                cutoff = time.time() - settings.SANDBOX_IDLE_TIMEOUT_S
                stale = [tid for tid, ts in self._touched.items() if ts < cutoff]
                for tid in stale:
                    log.info("reaping idle sandbox %s", tid)
                    await self.release(tid)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # pragma: no cover
                log.warning("sandbox reaper error: %s", exc)

    async def shutdown(self) -> None:
        if self._reaper:
            self._reaper.cancel()
        for tid in list(self._boxes):
            await self.release(tid)


sandboxes = SandboxManager()
