"""Router endpoints for deterministic exposure risk calculations and recommendations."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status

from app.dependencies import get_waqi_service
from app.models.recommendations import (
    RecommendationResponse,
    RecommendationRuleRequest,
)
from app.routers._helpers import resolve_aqi_context, resolve_household_profile
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
    resolved_profile = resolve_household_profile(request.profile, request.preset_name)

    # 2. Resolve Ambient AQI Data
    resolved_aqi = await resolve_aqi_context(
        request.aqi_data,
        request.location,
        request.lat,
        request.lon,
        waqi_service,
    )

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
