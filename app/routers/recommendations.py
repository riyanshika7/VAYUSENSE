"""Router endpoints for deterministic exposure risk calculations and recommendations."""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_waqi_service
from app.models.aqi import AQIResponse
from app.models.profile import SAMPLE_PRESETS
from app.models.recommendations import (
    RecommendationResponse,
    RecommendationRuleRequest,
)
from app.services.recommendation_rules import RecommendationRulesEngine
from app.services.risk_engine import RiskEngine
from app.services.waqi_service import WAQIService

router = APIRouter(prefix="/api/recommendations", tags=["Exposure Intelligence"])


@router.post(
    "/rules",
    response_model=RecommendationResponse,
    status_code=status.HTTP_200_OK,
    summary="Compute deterministic exposure risk score and rule-based recommendations",
    description=(
        "Evaluates a household profile against ambient air quality metrics using deterministic rules. "
        "Calculates an explainable 0-100 VayuSense Exposure Risk score and generates concrete, prioritized "
        "health actions without relying on generative AI."
    ),
)
async def generate_rule_recommendations(
    request: RecommendationRuleRequest,
    waqi_service: WAQIService = Depends(get_waqi_service),
) -> RecommendationResponse:
    """Generate deterministic recommendations and exposure risk assessment."""
    # 1. Resolve Household Profile
    if request.profile:
        resolved_profile = request.profile
    elif request.preset_name:
        key = request.preset_name.strip().lower()
        if key not in SAMPLE_PRESETS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown preset '{request.preset_name}'. Supported presets: {list(SAMPLE_PRESETS.keys())}",
            )
        resolved_profile = SAMPLE_PRESETS[key]
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must provide either 'profile' or a valid 'preset_name'.",
        )

    # 2. Resolve Ambient AQI Data
    resolved_aqi: Optional[AQIResponse] = request.aqi_data

    # If AQI was not provided directly in request, attempt to fetch live using location or coords if supplied
    if resolved_aqi is None:
        if request.location:
            resolved_aqi = await waqi_service.get_aqi_by_feed(request.location)
        elif request.lat is not None and request.lon is not None:
            resolved_aqi = await waqi_service.get_aqi_by_coords(request.lat, request.lon)

    # 3. Calculate Deterministic Risk Score
    risk_assessment = RiskEngine.calculate_risk(resolved_profile, resolved_aqi)

    # 4. Generate Deterministic Protective Recommendations
    recommendations = RecommendationRulesEngine.generate_recommendations(resolved_profile, resolved_aqi)

    return RecommendationResponse(
        profile_name=resolved_profile.profile_name or "Household",
        risk_assessment=risk_assessment,
        recommendations=recommendations,
        generated_at=datetime.now(timezone.utc).isoformat(),
        engine_version="VayuSense-Deterministic-v1.0",
    )
