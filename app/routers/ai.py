"""Router endpoints for Gemini-powered personalized reasoning."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.dependencies import get_ai_service, get_waqi_service
from app.models.ai_response import AIPersonalizedPlan, AIPlanRequest
from app.models.aqi import AQIResponse
from app.models.profile import SAMPLE_PRESETS
from app.services.ai_service import AIService, ParsedProfileFields
from app.services.recommendation_rules import RecommendationRulesEngine
from app.services.risk_engine import RiskEngine
from app.services.waqi_service import WAQIService

router = APIRouter(prefix="/api/ai", tags=["AI Personalized Reasoning"])


# ---------------------------------------------------------------------------
# Request / Response models for NL profile parsing
# ---------------------------------------------------------------------------
class ParseProfileRequest(BaseModel):
    description: str = Field(
        ...,
        min_length=10,
        max_length=2000,
        description="Natural-language description of the household (e.g. 'Two adults commuting by scooter, one 6-year-old, no purifier').",
    )


class ParseProfileResponse(BaseModel):
    suggested_fields: ParsedProfileFields
    requires_confirmation: bool = True
    gemini_used: bool
    message: str


@router.post(
    "/plan",
    response_model=AIPersonalizedPlan,
    status_code=status.HTTP_200_OK,
    summary="Generate comprehensive personalized reasoning plan",
    description=(
        "Uses Google Gemini to generate a personalized air quality exposure plan tailored to a household profile. "
        "Produces structured recommendations for Today's Routine (morning/afternoon/evening/night), Indoor Air Actions, "
        "Sustainable Swaps, Explainability metadata, and Activity Alerts. "
        "Includes a reliable deterministic fallback if the Gemini API is unconfigured or unavailable."
    ),
)
async def generate_ai_plan(
    request: AIPlanRequest,
    waqi_service: WAQIService = Depends(get_waqi_service),
    ai_service: AIService = Depends(get_ai_service),
) -> AIPersonalizedPlan:
    """Generate structured personalized plan with Gemini reasoning or deterministic fallback."""
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

    if resolved_aqi is None:
        if request.location:
            resolved_aqi = await waqi_service.get_aqi_by_feed(request.location)
        elif request.lat is not None and request.lon is not None:
            resolved_aqi = await waqi_service.get_aqi_by_coords(request.lat, request.lon)

    # 3. Deterministic Risk Assessment (Authority anchor: AI must never alter this)
    risk_result = RiskEngine.calculate_risk(resolved_profile, resolved_aqi)

    # 4. Deterministic Rule Recommendations
    rule_recommendations = RecommendationRulesEngine.generate_recommendations(resolved_profile, resolved_aqi)

    # 5. Gemini Personalized Reasoning (or Deterministic Fallback)
    plan = await ai_service.generate_personalized_plan(
        profile=resolved_profile,
        aqi_data=resolved_aqi,
        risk_result=risk_result,
        rule_recommendations=rule_recommendations,
    )

    return plan


@router.post(
    "/parse-profile",
    response_model=ParseProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Parse natural-language household description into profile fields",
    description=(
        "Uses Google Gemini to extract structured household profile fields from a free-text description. "
        "Returns suggested field values that the user must confirm before they are applied. "
        "Falls back to empty suggestions (confidence=0) if Gemini is unavailable — the UI handles this gracefully."
    ),
)
async def parse_profile_from_description(
    request: ParseProfileRequest,
    ai_service: AIService = Depends(get_ai_service),
) -> ParseProfileResponse:
    """Extract profile fields from a natural-language household description."""
    suggested = await ai_service.parse_profile_description(request.description)
    gemini_used = suggested.confidence > 0.0

    return ParseProfileResponse(
        suggested_fields=suggested,
        requires_confirmation=True,
        gemini_used=gemini_used,
        message=(
            "Review the suggested fields and confirm before saving."
            if gemini_used
            else "Gemini is not configured. Add your GEMINI_API_KEY to enable this feature."
        ),
    )
