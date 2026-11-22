"""Application configuration module using Pydantic Settings."""

import json
from functools import lru_cache
from typing import List, Union

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    # CORS Settings
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        """Parse CORS origins whether provided as a JSON array or comma-separated string."""
        if isinstance(v, str):
            v_trimmed = v.strip()
            if v_trimmed.startswith("[") and v_trimmed.endswith("]"):
                try:
                    parsed = json.loads(v_trimmed)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed]
                except json.JSONDecodeError:
                    pass
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        elif isinstance(v, list):
            return [str(item).strip() for item in v]
        return ["*"]

    @property
    def is_waqi_configured(self) -> bool:
        """Check if a valid WAQI token is provided."""
        return bool(
            self.WAQI_API_TOKEN
            and self.WAQI_API_TOKEN.strip()
            and self.WAQI_API_TOKEN.strip().lower() != "your_waqi_api_token_here"
        )

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
