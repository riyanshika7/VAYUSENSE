"""Application configuration module using Pydantic Settings."""

import json
from functools import lru_cache
from typing import ClassVar, List, Tuple, Union

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_CORS_ORIGINS: Tuple[str, ...] = (
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
)
_DEFAULT_TRUSTED_PROXIES: Tuple[str, ...] = ()
_ALLOWED_TRUSTED_CLIENT_IP_HEADERS: Tuple[str, ...] = ("", "cf-connecting-ip")


def _parse_str_list(
    v: Union[str, List[str]],
    fallback: List[str],
    *,
    use_fallback_when_empty: bool = True,
) -> List[str]:
    """Parse a JSON array or comma-separated string into non-empty stripped strings."""
    if isinstance(v, str):
        v_trimmed = v.strip()
        if not v_trimmed:
            return list(fallback) if use_fallback_when_empty else []
        if v_trimmed.startswith("[") and v_trimmed.endswith("]"):
            try:
                parsed = json.loads(v_trimmed)
                if isinstance(parsed, list):
                    result = [str(item).strip() for item in parsed if str(item).strip()]
                    return result if result or not use_fallback_when_empty else list(fallback)
            except json.JSONDecodeError:
                pass
        items = [item.strip() for item in v.split(",") if item.strip()]
        return items if items or not use_fallback_when_empty else list(fallback)
    if isinstance(v, list):
        result = [str(item).strip() for item in v if str(item).strip()]
        return result if result or not use_fallback_when_empty else list(fallback)
    return list(fallback) if use_fallback_when_empty else []


class Settings(BaseSettings):
    """Configuration settings loaded from environment variables and .env file."""

    # WAQI API Configuration
    WAQI_API_TOKEN: str = ""
    WAQI_BASE_URL: str = "https://api.waqi.info"
    WAQI_REQUEST_TIMEOUT: float = 10.0

    # Google Gemini API Configuration
    GEMINI_API_KEY: str = ""
    GOOGLE_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GEMINI_REQUEST_TIMEOUT: float = 30.0

    # Application Configuration
    APP_NAME: str = "VayuSense AQI Backend"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False

    # CORS & Proxy Settings
    CORS_ORIGINS: Union[List[str], str] = list(_DEFAULT_CORS_ORIGINS)
    TRUSTED_PROXIES: Union[List[str], str] = list(_DEFAULT_TRUSTED_PROXIES)
    TRUSTED_CLIENT_IP_HEADER: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    DEFAULT_TRUSTED_ORIGINS: ClassVar[List[str]] = list(_DEFAULT_CORS_ORIGINS)

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        """Parse CORS origins whether provided as a JSON array or comma-separated string."""
        return _parse_str_list(v, list(_DEFAULT_CORS_ORIGINS), use_fallback_when_empty=False)

    @field_validator("TRUSTED_PROXIES", mode="before")
    @classmethod
    def assemble_trusted_proxies(cls, v: Union[str, List[str]]) -> List[str]:
        """Parse trusted reverse-proxy IPs or CIDRs for X-Forwarded-For evaluation."""
        return _parse_str_list(v, list(_DEFAULT_TRUSTED_PROXIES), use_fallback_when_empty=False)

    @field_validator("TRUSTED_CLIENT_IP_HEADER", mode="before")
    @classmethod
    def validate_trusted_client_ip_header(cls, v: Union[str, None]) -> str:
        """Restrict trusted edge IP header to an explicitly supported canonical header."""
        normalized = (v or "").strip().lower()
        if normalized not in _ALLOWED_TRUSTED_CLIENT_IP_HEADERS:
            raise ValueError(
                f"Unsupported TRUSTED_CLIENT_IP_HEADER '{v}'. Allowed: '' or 'cf-connecting-ip'."
            )
        return normalized

    @model_validator(mode="after")
    def validate_production_cors_configuration(self) -> "Settings":
        """Fail closed if production omits CORS_ORIGINS or allows wildcard origins."""
        origins = [str(o).strip() for o in (self.CORS_ORIGINS or []) if str(o).strip()]
        if self.ENVIRONMENT.strip().lower() == "production":
            if "CORS_ORIGINS" not in self.model_fields_set or not origins:
                raise ValueError(
                    "ENVIRONMENT=production requires an explicit non-empty CORS_ORIGINS configuration."
                )
            if any(o == "*" or "://" not in o or o.startswith("*.") or "://*" in o for o in origins):
                raise ValueError(
                    "Wildcard or malformed origins are forbidden in CORS_ORIGINS when ENVIRONMENT=production."
                )
        elif not origins:
            self.CORS_ORIGINS = list(_DEFAULT_CORS_ORIGINS)
        return self

    @property
    def is_waqi_configured(self) -> bool:
        """Check if a valid WAQI token is provided."""
        token = self.WAQI_API_TOKEN.strip()
        return bool(token and token.lower() != "your_waqi_api_token_here")

    @property
    def effective_gemini_api_key(self) -> str:
        """Retrieve active Gemini API key from GEMINI_API_KEY or GOOGLE_API_KEY."""
        key = self.GEMINI_API_KEY.strip() or self.GOOGLE_API_KEY.strip()
        if key and key.lower() not in ("your_gemini_api_key_here", "your_api_key_here"):
            return key
        return ""

    @property
    def is_gemini_configured(self) -> bool:
        """Check if a valid Gemini API key is configured."""
        return bool(self.effective_gemini_api_key)


@lru_cache()
def get_settings() -> Settings:
    """Return cached instance of application settings."""
    return Settings()
