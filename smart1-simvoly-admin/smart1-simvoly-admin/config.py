import os
from dataclasses import dataclass

def b(name, default=False):
    return os.getenv(name, str(default)).strip().lower() in {"1","true","yes","on"}

@dataclass(frozen=True)
class Settings:
    secret_key: str = os.getenv("SECRET_KEY", "dev-only-change-me")
    admin_username: str = os.getenv("ADMIN_USERNAME", "admin")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "change-me")
    database_path: str = os.getenv("DATABASE_PATH", "/var/data/smart1_sites.sqlite3")
    mock_mode: bool = b("MOCK_MODE", True)
    enable_write_actions: bool = b("ENABLE_WRITE_ACTIONS", False)
    use_bg_as_platform_cost: bool = b("USE_BG_AS_PLATFORM_COST", False)
    api_base_url: str = os.getenv("SIMVOLY_API_BASE_URL", "").rstrip("/")
    api_key: str = os.getenv("SIMVOLY_API_KEY", "")
    auth_header: str = os.getenv("SIMVOLY_AUTH_HEADER", "Authorization")
    auth_prefix: str = os.getenv("SIMVOLY_AUTH_PREFIX", "Bearer")
    timeout_seconds: int = int(os.getenv("SIMVOLY_TIMEOUT_SECONDS", "30"))
    verify_ssl: bool = b("SIMVOLY_VERIFY_SSL", True)
    reseller_name: str = os.getenv("RESELLER_NAME", "Smart 1 Sites")
SETTINGS = Settings()
