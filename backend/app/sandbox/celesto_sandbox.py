"""Celesto computer backend — isolated microVM (local) or Celesto Cloud.

Replaces Docker / host-process / Superserve / GitHub Actions as the agent's
computer. The public `Sandbox` contract is unchanged so tools and the UI keep
working. Local computers mount the project workspace at `/workspace`; cloud
computers keep files inside the guest and shuttle them over `run()`.
"""

from __future__ import annotations

import asyncio
import base64
import json
import posixpath
import shlex
import threading
import time
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.core.errors import AppError, SandboxError
from app.core.logging import get_logger
from app.sandbox.base import ExecResult, FileEntry, Sandbox, SandboxInfo
from app.sandbox.local_sandbox import LocalSandbox

log = get_logger("app.sandbox.celesto")

GUEST_ROOT = "/workspace"


def celesto_available() -> bool:
    try:
        from celesto import Computer  # noqa: F401
    except Exception:
        return False
    return True


def _command_result(result: Any, *, started: float, timed_out: bool = False) -> ExecResult:
    return ExecResult(
        exit_code=int(getattr(result, "exit_code", 1) or 0),
        stdout=str(getattr(result, "stdout", "") or ""),
        stderr=str(getattr(result, "stderr", "") or ""),
        duration_ms=int((time.perf_counter() - started) * 1000),
        timed_out=timed_out,
    )


class CelestoSandbox(Sandbox):
    backend = "celesto"

    def __init__(
        self,
        sandbox_id: str,
        workspace: str,
        *,
        provider: str = "local",
        api_key: str = "",
        computer: Any | None = None,
    ):
        self.id = sandbox_id
        self.host_workspace = str(Path(workspace).resolve())
        self.workdir = GUEST_ROOT
        self.provider = "cloud" if provider == "cloud" else "local"
        self.api_key = api_key
        self._computer = computer
        self._started_at = 0.0
        self._lock = asyncio.Lock()
        self._host_files = LocalSandbox(sandbox_id, self.host_workspace)
        self._uses_host_files = self.provider == "local"

    def guest_path(self, path: str | None) -> str:
        raw = (path or "").replace("\\", "/")
        if raw in ("", ".", "/"):
            return GUEST_ROOT
        joined = raw if raw.startswith("/") else posixpath.join(GUEST_ROOT, raw)
        normalized = posixpath.normpath(joined)
        if normalized != GUEST_ROOT and not normalized.startswith(GUEST_ROOT + "/"):
            raise AppError(f"Path escapes workspace: {path}", code="path_escape")
        return normalized

    def relative(self, guest: str) -> str:
        normalized = posixpath.normpath(guest)
        if normalized == GUEST_ROOT:
            return ""
        prefix = GUEST_ROOT + "/"
        if normalized.startswith(prefix):
            return normalized[len(prefix) :]
        return normalized.lstrip("/")

    def host_rel(self, path: str | None) -> str:
        guest = self.guest_path(path)
        return self.relative(guest)

    async def start(self) -> SandboxInfo:
        async with self._lock:
            if self._started_at:
                return await self.info()
            Path(self.host_workspace).mkdir(parents=True, exist_ok=True)
            await self._host_files.start()
            if self._computer is None:
                self._computer = self._build_computer()
            await asyncio.to_thread(self._ensure_started)
            self._started_at = time.time()
            self.backend = "cloud" if self.provider == "cloud" else "celesto"
        log.info("celesto computer started thread=%s provider=%s id=%s", self.id, self.provider, self._computer_id())
        return await self.info()

    def _build_computer(self) -> Any:
        try:
            from celesto import Computer
        except Exception as exc:
            raise SandboxError(f"Celesto is not installed: {exc}") from exc
        options: dict[str, Any] = {"lifetime": "persistent"}
        if self.provider == "cloud":
            if self.api_key:
                options["api_key"] = self.api_key
            return Computer(provider="cloud", **options)
        options["mounts"] = [f"{self.host_workspace}:{GUEST_ROOT}"]
        options["writable_mounts"] = True
        if settings.SANDBOX_MEMORY_MB:
            options["memory"] = int(settings.SANDBOX_MEMORY_MB)
        return Computer(provider="local", **options)

    def _ensure_started(self) -> None:
        computer = self._computer
        if computer is None:
            raise SandboxError("Celesto computer is missing")
        start = getattr(computer, "start", None)
        if callable(start):
            start()

    def _computer_id(self) -> str:
        computer = self._computer
        if computer is None:
            return self.id
        value = getattr(computer, "id", None)
        return str(value) if value else self.id

    async def stop(self, *, remove: bool = True) -> None:
        computer = self._computer
        self._started_at = 0.0
        if computer is None:
            return
        def _shutdown() -> None:
            if remove:
                delete = getattr(computer, "delete", None)
                if callable(delete):
                    delete()
                    return
            close = getattr(computer, "close", None)
            if callable(close):
                close()
        await asyncio.to_thread(_shutdown)
        if remove:
            self._computer = None

    async def info(self) -> SandboxInfo:
        status = "running" if self._started_at else "stopped"
        return SandboxInfo(
            id=self._computer_id(),
            backend=self.backend,
            status=status,
            workspace=self.host_workspace,
            image="celesto-cloud" if self.provider == "cloud" else "celesto-microvm",
            started_at=self._started_at,
            detail={
                "isolated": True,
                "provider": self.provider,
                "guest_root": GUEST_ROOT,
                "computer_id": self._computer_id(),
            },
        )

    def _wrap_command(
        self,
        command: str,
        *,
        cwd: str | None = None,
        env: dict[str, str] | None = None,
    ) -> str:
        guest_cwd = self.guest_path(cwd) if cwd else GUEST_ROOT
        pieces: list[str] = [f"cd {shlex.quote(guest_cwd)}"]
        if env:
            for key, value in env.items():
                pieces.append(f"export {shlex.quote(str(key))}={shlex.quote(str(value))}")
        pieces.append(command)
        return " && ".join(pieces)

    async def exec(
        self,
        command: str,
        *,
        cwd: str | None = None,
        timeout: int | None = None,
        env: dict[str, str] | None = None,
    ) -> ExecResult:
        timeout = int(timeout or settings.SANDBOX_COMMAND_TIMEOUT_S)
        if self.provider == "cloud":
            timeout = min(timeout, 300)
        wrapped = self._wrap_command(command, cwd=cwd, env=env)
        started = time.perf_counter()
        computer = self._computer
        if computer is None:
            raise SandboxError("Celesto computer is not running")
        try:
            result = await asyncio.to_thread(computer.run, wrapped, timeout)
        except Exception as exc:
            message = str(exc).lower()
            timed_out = "timeout" in message or "timed out" in message
            return ExecResult(
                exit_code=124 if timed_out else 1,
                stdout="",
                stderr=str(exc),
                duration_ms=int((time.perf_counter() - started) * 1000),
                timed_out=timed_out,
            )
        timed_out = bool(getattr(result, "timed_out", False)) or int(getattr(result, "exit_code", 0) or 0) == 124
        return _command_result(result, started=started, timed_out=timed_out)

    async def exec_stream(
        self,
        command: str,
        *,
        cwd: str | None = None,
        timeout: int | None = None,
        env: dict[str, str] | None = None,
    ) -> AsyncIterator[str]:
        timeout = int(timeout or settings.SANDBOX_COMMAND_TIMEOUT_S)
        if self.provider == "cloud":
            timeout = min(timeout, 300)
        wrapped = self._wrap_command(command, cwd=cwd, env=env)
        computer = self._computer
        if computer is None:
            raise SandboxError("Celesto computer is not running")
        stream = getattr(computer, "run_stream", None)
        if not callable(stream):
            result = await self.exec(command, cwd=cwd, timeout=timeout, env=env)
            text = result.combined()
            if text:
                yield text if text.endswith("\n") else text + "\n"
            return

        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[Any] = asyncio.Queue()

        def produce() -> None:
            try:
                for event in stream(wrapped, timeout):
                    asyncio.run_coroutine_threadsafe(queue.put(event), loop).result()
            except Exception as exc:
                asyncio.run_coroutine_threadsafe(queue.put(exc), loop).result()
            finally:
                asyncio.run_coroutine_threadsafe(queue.put(None), loop).result()

        worker = threading.Thread(target=produce, daemon=True, name=f"celesto-stream-{self.id}")
        worker.start()
        while True:
            item = await queue.get()
            if item is None:
                break
            if isinstance(item, Exception):
                yield f"\n[celesto error: {item}]\n"
                break
            kind = getattr(item, "type", None)
            if kind in ("stdout", "stderr"):
                data = str(getattr(item, "data", "") or "")
                if data:
                    yield data
            elif kind == "exit" and getattr(item, "timed_out", False):
                yield f"\n[timed out after {timeout}s]\n"

    async def read_file(self, path: str, *, max_bytes: int = 2_000_000) -> str:
        if self._uses_host_files:
            return await self._host_files.read_file(self.host_rel(path), max_bytes=max_bytes)
        guest = self.guest_path(path)
        script = (
            "import pathlib,sys\n"
            f"p=pathlib.Path({guest!r})\n"
            "if not p.is_file():\n"
            "    sys.stderr.write('not a file')\n"
            "    sys.exit(2)\n"
            f"sys.stdout.buffer.write(p.read_bytes()[:{int(max_bytes)}])\n"
        )
        result = await self._run_python(script, timeout=60)
        if result.exit_code == 2:
            raise AppError(f"Not a file: {path}", code="not_a_file", status_code=404)
        if not result.ok:
            raise AppError(result.stderr or f"Could not read {path}", code="read_failed")
        return result.stdout.replace("\r\n", "\n")

    async def write_file(self, path: str, content: str) -> int:
        if self._uses_host_files:
            return await self._host_files.write_file(self.host_rel(path), content)
        guest = self.guest_path(path)
        payload = base64.b64encode(content.encode("utf-8")).decode("ascii")
        script = (
            "import base64,pathlib\n"
            f"p=pathlib.Path({guest!r})\n"
            "p.parent.mkdir(parents=True, exist_ok=True)\n"
            f"data=base64.b64decode({payload!r})\n"
            "p.write_bytes(data)\n"
            "print(len(data))\n"
        )
        result = await self._run_python(script, timeout=60)
        if not result.ok:
            raise AppError(result.stderr or f"Could not write {path}", code="write_failed")
        try:
            return int((result.stdout or "0").strip() or "0")
        except ValueError:
            return len(content.encode("utf-8"))

    async def list_dir(self, path: str = "") -> list[FileEntry]:
        if self._uses_host_files:
            return await self._host_files.list_dir(self.host_rel(path))
        guest = self.guest_path(path)
        script = (
            "import json,sys\n"
            "from pathlib import Path\n"
            f"root=Path({guest!r})\n"
            "if not root.is_dir():\n"
            "    print('[]')\n"
            "    raise SystemExit(0)\n"
            "entries=[]\n"
            "for child in sorted(root.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):\n"
            "    try:\n"
            "        st=child.stat()\n"
            "    except OSError:\n"
            "        continue\n"
            f"    rel=str(child.relative_to(Path({GUEST_ROOT!r}))) if str(child).startswith({GUEST_ROOT!r}) else child.name\n"
            "    entries.append({'name': child.name, 'path': rel, 'is_dir': child.is_dir(), "
            "'size': 0 if child.is_dir() else st.st_size, 'modified': st.st_mtime})\n"
            "print(json.dumps(entries))\n"
        )
        result = await self._run_python(script, timeout=30)
        if not result.ok:
            return []
        try:
            raw = json.loads(result.stdout or "[]")
        except json.JSONDecodeError:
            return []
        entries: list[FileEntry] = []
        for item in raw:
            entries.append(
                FileEntry(
                    name=str(item.get("name") or ""),
                    path=str(item.get("path") or ""),
                    is_dir=bool(item.get("is_dir")),
                    size=int(item.get("size") or 0),
                    modified=float(item.get("modified") or 0.0),
                )
            )
        return entries

    async def delete(self, path: str) -> None:
        if self.guest_path(path) == GUEST_ROOT:
            raise AppError("Refusing to delete the workspace root", code="refused")
        if self._uses_host_files:
            await self._host_files.delete(self.host_rel(path))
            return
        guest = self.guest_path(path)
        result = await self.exec(f"rm -rf -- {shlex.quote(guest)}", timeout=30)
        if not result.ok:
            raise AppError(result.stderr or f"Could not delete {path}", code="delete_failed")

    async def exists(self, path: str) -> bool:
        if self._uses_host_files:
            return await self._host_files.exists(self.host_rel(path))
        guest = self.guest_path(path)
        result = await self.exec(f"test -e {shlex.quote(guest)}", timeout=15)
        return result.exit_code == 0

    async def endpoint(self, port: int) -> str | None:
        computer = self._computer
        publish = getattr(computer, "publish_port", None) if computer is not None else None
        if self.provider == "cloud" and callable(publish):
            try:
                published = await asyncio.to_thread(publish, int(port))
                url = getattr(published, "url", None)
                if url:
                    return str(url).rstrip("/")
            except Exception as exc:
                log.warning("celesto publish_port(%s) failed: %s", port, exc)
        return f"http://127.0.0.1:{int(port)}"

    async def browser_cdp_url(self) -> str | None:
        computer = self._computer
        browser = getattr(computer, "browser", None) if computer is not None else None
        if not callable(browser):
            return None
        try:
            connection = await asyncio.to_thread(browser)
        except Exception as exc:
            log.warning("celesto browser connection failed: %s", exc)
            return None
        return getattr(connection, "url", None) or getattr(connection, "cdp_url", None)

    async def _run_python(self, script: str, *, timeout: int) -> ExecResult:
        encoded = base64.b64encode(script.encode("utf-8")).decode("ascii")
        command = "python3 -c " + shlex.quote(
            "import base64; exec(base64.b64decode('" + encoded + "').decode())"
        )
        return await self.exec(command, timeout=timeout)
