"""Celesto sandbox: path confinement, command wrapping, cloud file helpers."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.core.errors import AppError
from app.sandbox.celesto_sandbox import GUEST_ROOT, CelestoSandbox


class FakeComputer:
    def __init__(self) -> None:
        self.commands: list[tuple[str, int]] = []
        self.started = False
        self.deleted = False
        self.id = "vm-test"

    def start(self) -> None:
        self.started = True

    def delete(self) -> None:
        self.deleted = True

    def run(self, command: str, timeout: int = 30):
        self.commands.append((command, timeout))
        if "not a file" in command or "sys.exit(2)" in command:
            path_exists = "note.txt" in command
            if "is_file" in command and not path_exists:
                return SimpleNamespace(exit_code=2, stdout="", stderr="not a file")
        if "print(len(data))" in command:
            return SimpleNamespace(exit_code=0, stdout="6\n", stderr="")
        if command.startswith("test -e"):
            return SimpleNamespace(exit_code=0, stdout="", stderr="")
        if "json.dumps" in command:
            return SimpleNamespace(
                exit_code=0,
                stdout='[{"name": "adir", "path": "adir", "is_dir": true, "size": 0, "modified": 0},'
                '{"name": "b.txt", "path": "b.txt", "is_dir": false, "size": 1, "modified": 0}]',
                stderr="",
            )
        if command.startswith("rm -rf"):
            return SimpleNamespace(exit_code=0, stdout="", stderr="")
        if "echo hi" in command:
            return SimpleNamespace(exit_code=3, stdout="hi\n", stderr="")
        return SimpleNamespace(exit_code=0, stdout="ok\n", stderr="")


@pytest.fixture
async def box(tmp_path):
    computer = FakeComputer()
    sandbox = CelestoSandbox("thr1", str(tmp_path), provider="cloud", computer=computer)
    sandbox._uses_host_files = False
    await sandbox.start()
    sandbox._fake = computer
    return sandbox


def test_guest_path_confinement(tmp_path):
    box = CelestoSandbox("thr1", str(tmp_path), computer=FakeComputer())
    assert box.guest_path("a/b.txt") == f"{GUEST_ROOT}/a/b.txt"
    assert box.guest_path("") == GUEST_ROOT
    with pytest.raises(AppError):
        box.guest_path("../escaped.txt")


async def test_start_and_exec_wraps_cwd(box):
    result = await box.exec("echo hi && exit 3", cwd="src", timeout=12)
    assert result.exit_code == 3
    assert "hi" in result.stdout
    command, timeout = box._fake.commands[-1]
    assert command.startswith(f"cd {GUEST_ROOT}/src")
    assert timeout == 12
    assert box._fake.started


async def test_delete_refuses_root(box):
    with pytest.raises(AppError):
        await box.delete("")


async def test_exists_runs_test_command(box):
    assert await box.exists("note.txt")
    command, _timeout = box._fake.commands[-1]
    assert "test -e" in command
    assert f"{GUEST_ROOT}/note.txt" in command
