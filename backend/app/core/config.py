"""Application settings, loaded from environment or `backend/.env`."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator, ValidationInfo
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ---- app -------------------------------------------------------------
    # SPDX-License-Identifier: MIT
    # Copyright (c) rawal-ai-agent contributors. See LICENSE/NOTICE.
    APP_NAME: str = "rawal-ai-agent"
    ENV: Literal["dev", "prod"] = "dev"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: str = "*"

    # ---- security --------------------------------------------------------
    SECRET_KEY: str = ""  # Must be set in production - empty string forces configuration
    JWT_SECRET: str = ""  # Must be set in production - empty string forces configuration
    JWT_ALGORITHM: str = "HS256"
    JWT_TTL_HOURS: int = 72
    JWT_ISSUER: str = "rawal-ai-agent"
    JWT_AUDIENCE: str = "rawal-ai-agent-app"
    # When empty, auth is open (single-user local mode). Set to enable login.
    AUTH_PASSWORD: str = ""
    AUTH_USERNAME: str = "rawal"
    # Prod must never boot open by accident: set a password, or explicitly opt
    # into an anonymous instance with ALLOW_ANONYMOUS=true.
    ALLOW_ANONYMOUS: bool = False

    # ---- storage ---------------------------------------------------------
    DATA_DIR: str = str(REPO_DIR / "data")
    WORKSPACE_ROOT: str = str(REPO_DIR / "data" / "workspaces")
    DATABASE_URL: str = ""
    MONGO_URI: str = ""
    MONGODB_URI: str = ""
    DATABASE_NAME: str = "rawal_ai"
    MONGODB_DB_NAME: str = ""
    GDRIVE_CREDENTIALS_JSON: str = ""
    GDRIVE_FOLDER_ID: str = ""

    @property
    def mongo_uri(self) -> str:
        return self.MONGO_URI or self.MONGODB_URI

    @property
    def database_name(self) -> str:
        # Legacy installs used bhati_ai_agent — accept both, prefer rawal_ai.
        name = self.MONGODB_DB_NAME or self.DATABASE_NAME or "rawal_ai"
        if name == "bhati_ai_agent":
            return "rawal_ai"
        return name

    # ---- llm -------------------------------------------------------------
    DEFAULT_LLM_BASE_URL: str = "https://api.openai.com/v1"
    DEFAULT_LLM_API_KEY: str = ""
    DEFAULT_LLM_MODEL: str = "gpt-4o-mini"
    LLM_TIMEOUT_SECONDS: int = 600
    MAX_AGENT_STEPS: int = 80
    MAX_CONTEXT_TOKENS: int = 160_000
    COMPACT_AT_RATIO: float = 0.75

    # ---- sandbox (Celesto computers) -------------------------------------
    # auto = Celesto local microVM when the SDK is installed, else host-local.
    # celesto = local Celesto computer (Firecracker/QEMU microVM).
    # cloud = Celesto Cloud (needs CELESTO_API_KEY).
    # local = path-confined host process (tests / hosts without virtualization).
    SANDBOX_BACKEND: Literal["auto", "celesto", "cloud", "local"] = "auto"
    SANDBOX_IMAGE: str = "celesto-microvm"
    SANDBOX_FALLBACK_IMAGE: str = "celesto-microvm"
    SANDBOX_CPUS: float = 1.0
    SANDBOX_MEMORY_MB: int = 2048
    SANDBOX_IDLE_TIMEOUT_S: int = 1800
    SANDBOX_NETWORK: str = "bridge"
    SANDBOX_COMMAND_TIMEOUT_S: int = 300
    CELESTO_API_KEY: str = ""
    CELESTO_API_URL: str = "https://api.celesto.ai"
    # Optional remote Chromium endpoint (Browserless, Browserbase, or a private
    # browser service). When set, Render never launches a local browser.
    BROWSER_CDP_URL: str = ""
    BROWSER_MAX_SESSIONS: int = 1
    BROWSER_IDLE_TIMEOUT_S: int = 900

    # ---- integrations ----------------------------------------------------
    GITHUB_TOKEN: str = ""
    GITHUB_WEBHOOK_SECRET: str = ""
    VERCEL_TOKEN: str = ""
    RENDER_TOKEN: str = ""
    HF_TOKEN: str = ""
    SEARCH_PROVIDER: Literal["duckduckgo", "tavily", "brave"] = "duckduckgo"
    TAVILY_API_KEY: str = ""
    BRAVE_API_KEY: str = ""
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_ALLOWED_USER_IDS: str = ""

    # ---- email (transcript sharing) --------------------------------------
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""
    SMTP_FROM: str = ""

    # ---- advanced features ---------------------------------------------
    ENABLE_ANALYTICS: bool = True
    ENABLE_PERFORMANCE_MONITORING: bool = True
    ENABLE_REAL_TIME_COLLABORATION: bool = True
    ENABLE_VOICE_INPUT: bool = True
    ENABLE_WEBRTC_SCREEN_SHARE: bool = True
    ENABLE_CODE_GENERATION_ENHANCEMENTS: bool = True
    ENABLE_ADVANCED_SECURITY_SCANNING: bool = True
    ENABLE_AUTOMATED_TESTING: bool = True
    ENABLE_AI_CODE_REVIEW: bool = True
    ENABLE_MULTI_MODAL_INPUT: bool = True
    ENABLE_KNOWLEDGE_GRAPH: bool = True
    ENABLE_PROJECT_TEMPLATES: bool = True
    ENABLE_WORKFLOW_AUTOMATION: bool = True
    ENABLE_CUSTOM_TOOLS_FRAMEWORK: bool = True
    ENABLE_PLUGIN_SYSTEM: bool = True
    ENABLE_API_RATE_LIMITING: bool = True
    ENABLE_CACHE_LAYER: bool = True
    ENABLE_OBSERVABILITY: bool = True
    ENABLE_DISTRIBUTED_EXECUTION: bool = False
    ENABLE_GPU_ACCELERATION: bool = False

    @field_validator("CORS_ORIGINS")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("SECRET_KEY", "JWT_SECRET")
    @classmethod
    def _validate_secrets(cls, v: str, info: ValidationInfo) -> str:
        if info.data.get("ENV") == "prod" and not v:
            raise ValueError("SECRET_KEY and JWT_SECRET must be set in production")
        return v

    @property
    def cors_origins(self) -> list[str]:
        if self.CORS_ORIGINS in ("*", ""):
            return ["*"]
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        # rawal.db is canonical; fall back to legacy bhati.db if it exists.
        legacy = Path(self.DATA_DIR) / "bhati.db"
        canonical = Path(self.DATA_DIR) / "rawal.db"
        if legacy.exists() and not canonical.exists():
            return f"sqlite+aiosqlite:///{legacy}"
        return f"sqlite+aiosqlite:///{canonical}"

    @property
    def auth_enabled(self) -> bool:
        return bool(self.AUTH_PASSWORD)

    def ensure_dirs(self) -> None:
        Path(self.DATA_DIR).mkdir(parents=True, exist_ok=True)
        Path(self.WORKSPACE_ROOT).mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.ensure_dirs()
    return s


settings = get_settings()
