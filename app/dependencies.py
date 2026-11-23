"""Centralized dependency injection providers for FastAPI routers."""

from fastapi import Depends

from app.config import Settings, get_settings
from app.services.ai_service import AIService
from app.services.waqi_service import WAQIService


def get_waqi_service(settings: Settings = Depends(get_settings)) -> WAQIService:
    """Dependency provider for WAQIService."""
    return WAQIService(settings=settings)


def get_ai_service(settings: Settings = Depends(get_settings)) -> AIService:
    """Dependency provider for AIService."""
    return AIService(settings=settings)
