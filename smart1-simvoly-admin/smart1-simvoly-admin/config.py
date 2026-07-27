import os
from dataclasses import dataclass


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    secret_key: str = os.getenv("SECRET_KEY", "dev-only-change-me")
    admin_username: str = os.getenv("ADMIN_USERNAME", "admin")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "change-me-now")

    api_base_url: str = os.getenv("SIMVOLY_API_BASE_URL", "").rstrip("/")
    api_key: str = os.getenv("SIMVOLY_API_KEY", "")
    auth_header: str = os.getenv("SIMVOLY_AUTH_HEADER", "Authorization")
    auth_prefix: str = os.getenv("SIMVOLY_AUTH_PREFIX", "Bearer")
    timeout_seconds: int = int(os.getenv("SIMVOLY_TIMEOUT_SECONDS", "25"))
    verify_ssl: bool = env_bool("SIMVOLY_VERIFY_SSL", True)
    mock_mode: bool = env_bool("MOCK_MODE", True)

    database_path: str = os.getenv("DATABASE_PATH", "/var/data/smart1_sites.sqlite3")
    wl_tier: str = os.getenv("SIMVOLY_WL_TIER", "advanced").lower()


SETTINGS = Settings()
