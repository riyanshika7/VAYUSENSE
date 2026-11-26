"""Shared request-resolution helpers for FastAPI routers."""

from typing import Optional

from fastapi import HTTPException, status

from app.models.aqi import AQIResponse
from app.models.profile import SAMPLE_PRESETS, HouseholdProfile
from app.services.waqi_service import WAQIService


def resolve_household_profile(
    profile: Optional[HouseholdProfile],
    preset_name: Optional[str],
    *,
    preset_error_prefix: str = "Unknown preset",
    missing_detail: str = "Must provide either 'profile' or a valid 'preset_name'.",
    prefer_preset: bool = False,
) -> HouseholdProfile:
    """Resolve an explicit household profile or named preset, raising HTTP 400 on invalid input."""
    if not prefer_preset and profile is not None:
        return profile
    if preset_name:
        key = preset_name.strip().lower()
        if key not in SAMPLE_PRESETS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{preset_error_prefix} '{preset_name}'. Supported presets: {list(SAMPLE_PRESETS.keys())}",
            )
        return SAMPLE_PRESETS[key]
    if profile is not None:
        return profile
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=missing_detail,
    )


async def resolve_aqi_context(
    aqi_data: Optional[AQIResponse],
    location: Optional[str],
    lat: Optional[float],
    lon: Optional[float],
    waqi_service: WAQIService,
) -> Optional[AQIResponse]:
    """Return supplied AQI telemetry or fetch live station data by location or coordinates."""
    if aqi_data is not None:
        return aqi_data
    if location:
        return await waqi_service.get_aqi_by_feed(location)
    if lat is not None and lon is not None:
        return await waqi_service.get_aqi_by_coords(lat, lon)
    return None
