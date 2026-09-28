"""Sandbox contract shared by Celesto computers and the host-local fallback."""

from __future__ import annotations

import abc
from collections.abc import AsyncIterator
from dataclasses import dataclass, field


@dataclass(slots=True)
class ExecResult:
    exit_code: int
    stdout: str
    stderr: str = ""
    duration_ms: int = 0
    timed_out: bool = False

    @property
    def ok(self) -> bool:
        return self.exit_code == 0 and not self.timed_out

    def combined(self) -> str:
        parts = [self.stdout.rstrip()]
        if self.stderr.strip():
            parts.append("[stderr]\n" + self.stderr.rstrip())
        return "\n".join(p for p in parts if p)


@dataclass(slots=True)
class FileEntry:
    name: str
    path: str
    is_dir: bool
    size: int = 0
    modified: float = 0.0


@dataclass(slots=True)
class SandboxInfo:
    id: str
    backend: str
    status: str
    workspace: str
    image: str = ""
    started_at: float = 0.0
    detail: dict = field(default_factory=dict)


class Sandbox(abc.ABC):
    """A place the agent can run commands and touch files.

    `workdir` is always the container/host path the agent sees as its project root.
    All file paths crossing this API are relative to that root.
    """

    id: str
    workdir: str

    @abc.abstractmethod
    async def start(self) -> SandboxInfo: ...

    @abc.abstractmethod
    async def stop(self, *, remove: bool = True) -> None: ...

    @abc.abstractmethod
    async def info(self) -> SandboxInfo: ...

    @abc.abstractmethod
    async def exec(
        self,
        command: str,
        *,
        cwd: str | None = None,
        timeout: int | None = None,
        env: dict[str, str] | None = None,
    ) -> ExecResult: ...

    @abc.abstractmethod
    def exec_stream(
        self,
        command: str,
        *,
        cwd: str | None = None,
        timeout: int | None = None,
        env: dict[str, str] | None = None,
    ) -> AsyncIterator[str]: ...

    @abc.abstractmethod
    async def read_file(self, path: str, *, max_bytes: int = 2_000_000) -> str: ...

    @abc.abstractmethod
    async def write_file(self, path: str, content: str) -> int: ...

    @abc.abstractmethod
    async def list_dir(self, path: str = "") -> list[FileEntry]: ...

    @abc.abstractmethod
    async def delete(self, path: str) -> None: ...

    @abc.abstractmethod
    async def exists(self, path: str) -> bool: ...

    async def endpoint(self, port: int) -> str | None:
        """Base URL the backend can use to reach a server listening inside the sandbox."""
        return None
