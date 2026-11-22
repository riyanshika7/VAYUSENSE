"""Router package for VayuSense."""

from app.routers.ai import router as ai_router
from app.routers.aqi import router as aqi_router
from app.routers.profile import router as profile_router
from app.routers.recommendations import router as recommendations_router

__all__ = ["aqi_router", "profile_router", "recommendations_router", "ai_router"]
