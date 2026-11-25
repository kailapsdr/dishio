"""Reads settings from the .env file (and the environment).

The Gemini API key is only ever read here, on the server. It is never sent
to the browser.
"""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Tried in this order when the main model is overloaded, rate limited or down.
# Each Gemini model has its own free quota, so a backup model usually still works.
DEFAULT_FALLBACK_MODELS = ("gemini-3.1-flash-lite", "gemini-2.5-flash")

# Values that mean "the key has not been filled in yet".
_PLACEHOLDER_KEYS = {"", "paste-your-new-key-here", "your_api_key_here"}


def _int(name: str, default: int, minimum: int = 1) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return max(minimum, int(raw))
    except ValueError:
        return default


def _model_list(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    """Comma-separated model names. Empty = the default list, "none" = no backups."""
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    if raw.lower() == "none":
        return ()
    return tuple(m.strip() for m in raw.split(",") if m.strip())


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str = field(default="", repr=False)  # repr=False: never printed
    gemini_model: str = "gemini-3.5-flash-lite"
    gemini_fallback_models: tuple[str, ...] = DEFAULT_FALLBACK_MODELS
    gemini_timeout_seconds: int = 60
    rate_limit_per_minute: int = 5
    rate_limit_per_day: int = 50
    shelf_life_per_minute: int = 20
    shelf_life_per_day: int = 200
    substitute_per_minute: int = 10
    substitute_per_day: int = 100
    max_ingredients_chars: int = 300
    host: str = "127.0.0.1"
    port: int = 5000
    # Online hosts put a proxy in front of the app, so every visitor would
    # look like the same address. This names the header that carries the
    # visitor's real address (on Render: CF-Connecting-IP). Empty = not used.
    client_ip_header: str = ""

    @property
    def gemini_configured(self) -> bool:
        return self.gemini_api_key.strip().lower() not in _PLACEHOLDER_KEYS


def load_settings(env_file: Path | None = None) -> Settings:
    """Load settings from ``.env`` in the project folder (if it exists)."""
    load_dotenv(env_file or PROJECT_ROOT / ".env", override=False)
    return Settings(
        gemini_api_key=os.getenv("GEMINI_API_KEY", "").strip(),
        gemini_model=os.getenv("GEMINI_MODEL", "").strip() or "gemini-3.5-flash-lite",
        gemini_fallback_models=_model_list("GEMINI_FALLBACK_MODELS", DEFAULT_FALLBACK_MODELS),
        gemini_timeout_seconds=_int("GEMINI_TIMEOUT_SECONDS", 60),
        rate_limit_per_minute=_int("RATE_LIMIT_PER_MINUTE", 5),
        rate_limit_per_day=_int("RATE_LIMIT_PER_DAY", 50),
        shelf_life_per_minute=_int("SHELF_LIFE_PER_MINUTE", 20),
        shelf_life_per_day=_int("SHELF_LIFE_PER_DAY", 200),
        substitute_per_minute=_int("SUBSTITUTE_PER_MINUTE", 10),
        substitute_per_day=_int("SUBSTITUTE_PER_DAY", 100),
        max_ingredients_chars=_int("MAX_INGREDIENTS_CHARS", 300, minimum=20),
        host=os.getenv("HOST", "").strip() or "127.0.0.1",
        port=_int("PORT", 5000),
        client_ip_header=os.getenv("CLIENT_IP_HEADER", "").strip(),
    )
