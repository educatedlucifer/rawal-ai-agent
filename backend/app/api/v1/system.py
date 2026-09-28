"""Health, capabilities and tool catalogue."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app import __version__
from app.api.deps import DB, Auth
from app.core.config import settings
from app.core.errors import AppError
from app.db.models import Setting
from app.mcp import mcp_manager
from app.sandbox import sandboxes
from app.telegram import telegram_bot
from app.tools import registry

router = APIRouter(tags=["system"])


class TelegramConfigBody(BaseModel):
    bot_token: str
    allowed_user_ids: str = ""


@router.get("/telegram/status")
async def get_telegram_status(db: DB, _: Auth):
    token = settings.TELEGRAM_BOT_TOKEN
    allowed_ids = settings.TELEGRAM_ALLOWED_USER_IDS

    # Check database setting if empty in environment
    if not token:
        setting = await db.get(Setting, "telegram_config")
        if setting and isinstance(setting.value, dict):
            token = setting.value.get("bot_token", "")
            allowed_ids = setting.value.get("allowed_user_ids", allowed_ids)

    token_masked = "***" if token else ""

    return {
        "enabled": telegram_bot.enabled,
        "bot_username": getattr(telegram_bot, "bot_username", ""),
        "token_masked": token_masked,
        "allowed_user_ids": allowed_ids,
    }


@router.post("/telegram/config")
async def update_telegram_config(body: TelegramConfigBody, db: DB, _: Auth):
    token = body.bot_token.strip()
    allowed_ids = body.allowed_user_ids.strip()

    # Save to SQLite & automatically flush to MongoDB
    setting = await db.get(Setting, "telegram_config")
    if not setting:
        setting = Setting(key="telegram_config", value={"bot_token": token, "allowed_user_ids": allowed_ids})
        db.add(setting)
    else:
        setting.value = {"bot_token": token, "allowed_user_ids": allowed_ids}
    await db.commit()

    settings.TELEGRAM_BOT_TOKEN = token
    settings.TELEGRAM_ALLOWED_USER_IDS = allowed_ids
    await telegram_bot.init()

    return {
        "enabled": telegram_bot.enabled,
        "bot_username": getattr(telegram_bot, "bot_username", ""),
        "allowed_user_ids": settings.TELEGRAM_ALLOWED_USER_IDS,
    }


@router.get("/health")
async def health():
    # Closed-source: prod reveals nothing fingerprintable (no version/env).
    # Render health checks + the login gate only need status/auth_required.
    if settings.ENV == "prod":
        return {"status": "ok", "auth_required": settings.auth_enabled}
    return {
        "status": "ok",
        "version": __version__,
        "env": settings.ENV,
        "auth_required": settings.auth_enabled,
    }


@router.get("/capabilities")
async def capabilities(_: Auth):
    boxes = await sandboxes.list()
    return {
        "version": __version__,
        "auth_required": settings.auth_enabled,
        "sandbox_backend": await sandboxes.backend(),
        "sandbox_image": settings.SANDBOX_IMAGE,
        "active_sandboxes": [
            {"id": b.id, "status": b.status, "backend": b.backend, "image": b.image} for b in boxes
        ],
        "tools": len(registry.all()),
        "mcp_servers": [
            {"name": s.name, "status": s.status, "tools": len(s.tools), "error": s.error}
            for s in mcp_manager.states()
        ],
        "limits": {
            "max_agent_steps": settings.MAX_AGENT_STEPS,
            "max_context_tokens": settings.MAX_CONTEXT_TOKENS,
            "command_timeout_s": settings.SANDBOX_COMMAND_TIMEOUT_S,
        },
    }


@router.get("/tools")
async def list_tools(_: Auth):
    tools = registry.describe()
    groups: dict[str, int] = {}
    for tool in tools:
        groups[tool["group"]] = groups.get(tool["group"], 0) + 1
    return {"count": len(tools), "groups": groups, "tools": tools}


# ---------------------------------------------------------------------------
# Sandbox backend setting (Celesto local microVM / Celesto Cloud)
# ---------------------------------------------------------------------------


class SandboxConfigIn(BaseModel):
    backend: str = ""  # auto | celesto | cloud | local
    celesto_api_key: str = ""


async def _sandbox_config_view() -> dict:
    from app.core.crypto import mask
    from app.sandbox.manager import load_sandbox_config, resolve_celesto_key

    config = await load_sandbox_config()
    key = resolve_celesto_key(config)
    return {
        "backend": str(config.get("backend") or settings.SANDBOX_BACKEND),
        "effective_backend": await sandboxes.backend(),
        "celesto_configured": bool(key),
        "celesto_key_masked": mask(key),
        "pool": await sandboxes.pool_status(),
    }


@router.get("/sandbox/config")
async def get_sandbox_config(_: Auth):
    return await _sandbox_config_view()


@router.post("/sandbox/config")
async def update_sandbox_config(body: SandboxConfigIn, _: Auth):
    from app.core.crypto import encrypt
    from app.sandbox.manager import save_sandbox_config

    patch: dict = {}
    if body.backend:
        if body.backend not in ("auto", "celesto", "cloud", "local"):
            raise AppError("Unknown sandbox backend", code="bad_backend")
        patch["backend"] = body.backend
    if body.celesto_api_key.strip():
        patch["celesto_key_enc"] = encrypt(body.celesto_api_key.strip())
    await save_sandbox_config(patch)
    await sandboxes.configure()
    return await _sandbox_config_view()
