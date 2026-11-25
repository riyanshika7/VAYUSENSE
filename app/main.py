"""Main FastAPI application entrypoint for VayuSense."""

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.config import get_settings
from app.models.aqi import HealthResponse
from app.routers.ai import router as ai_router
from app.routers.aqi import router as aqi_router
from app.routers.profile import router as profile_router
from app.routers.recommendations import router as recommendations_router
from app.security import (
    InMemoryRateLimiter,
    RequestSizeLimitMiddleware,
    SecurityHeadersMiddleware,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - [%(levelname)s] - %(name)s - %(message)s",
)
logger = logging.getLogger("vayusense")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager for startup and shutdown events."""
    settings = get_settings()
    logger.info("Starting %s v%s in %s mode", settings.APP_NAME, settings.APP_VERSION, settings.ENVIRONMENT)
    if settings.is_waqi_configured:
        logger.info("WAQI API token configured successfully.")
    else:
        logger.warning(
            "WAQI API token is NOT configured or using placeholder. "
            "Real-time AQI queries will fail until WAQI_API_TOKEN is set in .env or environment."
        )
    yield
    logger.info("Shutting down %s", settings.APP_NAME)


def create_app() -> FastAPI:
    """Create and configure the FastAPI application instance."""
    settings = get_settings()

    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description=(
            "Personalized urban air quality assistant for Indian cities. "
            "Provides real-time AQI measurements, pollutant breakdowns, and station tracking "
            "without mock or fabricated data."
        ),
        lifespan=lifespan,
    )

    # 1. Defensive HTTP security headers
    app.add_middleware(SecurityHeadersMiddleware)

    # 2. Maximum request body limit (1 MB) to prevent DoS
    app.add_middleware(RequestSizeLimitMiddleware, max_bytes=1_048_576)

    # 3. Sliding-window rate limiter
    app.add_middleware(InMemoryRateLimiter)

    # 4. Strict CORS configuration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS", "HEAD"],
        allow_headers=["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"],
    )

    # Include routers
    app.include_router(aqi_router)
    app.include_router(profile_router)
    app.include_router(recommendations_router)
    app.include_router(ai_router)

    @app.get(
        "/health",
        response_model=HealthResponse,
        summary="Health check",
        description="Verify backend status and upstream provider token configuration.",
        tags=["System"],
        status_code=status.HTTP_200_OK,
    )
    async def health_check() -> HealthResponse:
        current_settings = get_settings()
        is_healthy = current_settings.is_waqi_configured and current_settings.is_gemini_configured
        return HealthResponse(
            status="healthy" if is_healthy else "degraded",
            app_name=current_settings.APP_NAME,
            version=current_settings.APP_VERSION,
            timestamp=datetime.now(timezone.utc).isoformat(),
            provider="WAQI (aqicn.org)",
            provider_token_configured=current_settings.is_waqi_configured,
            gemini_configured=current_settings.is_gemini_configured,
        )

    @app.get("/", include_in_schema=False)
    async def root():
        """Redirect root requests to interactive API docs."""
        return RedirectResponse(url="/docs")

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
