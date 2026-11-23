"""Pydantic schemas for deterministic exposure risk calculations and recommendations."""

from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field

from app.models.aqi import AQIResponse
from app.models.profile import HouseholdProfile


class RecommendationPriority(str, Enum):
    """Priority level for protective health actions."""

    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


class RecommendationConfidence(str, Enum):
    """Confidence rating based on input data freshness and physiological evidence."""

    HIGH = "High"
    MODERATE = "Moderate"
    CAUTIOUS = "Cautious"


class CausalChain(BaseModel):
    """Step-by-step causal chain showing the deterministic trail from measurement to action."""

    live_data: str = Field(..., description="Observed outdoor AQI and pollutant status")
    household_context: str = Field(..., description="Relevant household habit, schedule, or sensitivity")
    detected_risk: str = Field(..., description="Physiological or physical exposure mechanism identified")
    recommended_action: str = Field(..., description="The concrete recommended action")
    expected_benefit: str = Field(..., description="Qualitative protective benefit")


class ImpactCategories(BaseModel):
    """Multi-dimensional impact assessment for a recommendation."""

    personal_exposure: str = Field(..., description="Personal exposure reduction: High, Moderate, Protective")
    household_protection: str = Field(..., description="Reach: Whole Household, Vulnerable Members, Sleeping Quarters, Cook")
    community_emissions: str = Field(..., description="Community emissions impact: Lowers Traffic Soot, Zero Combustion, Neutral")
    practicality: str = Field(..., description="Ease of adoption: Effortless, Minimal Shift, Moderate Coordination")
    cost: str = Field(..., description="Cost tier: Zero Cost, Low Cost, Investment")


class RuleRecommendation(BaseModel):
    """Actionable rule-based recommendation derived deterministically."""

    action: str = Field(..., description="Concrete protective action to be taken")
    timing: str = Field(..., description="Actionable timing window (e.g., 'Immediate', '06:00-09:00', 'During cooking')")
    reason: str = Field(..., description="Underlying mechanism or situational context triggering this rule")
    expected_benefit: str = Field(
        ...,
        description="Qualitative health benefit (no unverified percentage claims)",
    )
    affected_household_member: str = Field(
        ...,
        description="Specific target member (e.g. 'Senior member', 'Commuting adults', 'Young child', 'All')",
    )
    priority: RecommendationPriority = Field(..., description="Urgency and impact tier")
    confidence: RecommendationConfidence = Field(..., description="Confidence grade of the recommendation")
    supporting_data_rule: str = Field(..., description="Auditable rule reference code and rationale")
    causal_chain: Optional[CausalChain] = Field(
        default=None,
        description="Step-by-step deterministic causal chain: Live Data → Context → Risk → Action → Benefit",
    )
    impact_categories: Optional[ImpactCategories] = Field(
        default=None,
        description="Qualitative impact ratings across 5 key dimensions",
    )
    tradeoff_or_limitation: Optional[str] = Field(
        default=None,
        description="Practical limitation or trade-off associated with this action",
    )


class RiskComponentBreakdown(BaseModel):
    """Detailed deterministic component breakdown for the 0-100 risk score."""

    base_aqi_component: float = Field(..., ge=0.0, le=100.0, description="Base risk contribution from ambient AQI")
    vulnerability_factor: float = Field(..., ge=1.0, le=2.5, description="Demographic vulnerability multiplier")
    exposure_duration_score: float = Field(..., ge=0.0, le=30.0, description="Points added for prolonged outdoor duration")
    activity_timing_score: float = Field(..., ge=0.0, le=25.0, description="Points added for high-inhalation activities during peak hours")
    indoor_environment_score: float = Field(..., ge=-15.0, le=25.0, description="Indoor modulation (ventilation, incense, purifiers)")
    freshness_penalty: float = Field(..., ge=0.0, le=15.0, description="Uncertainty penalty added if AQI data is stale")
    explanations: List[str] = Field(default_factory=list, description="Step-by-step deterministic audit trails")


class RiskAssessmentResult(BaseModel):
    """Result of the explainable 0-100 VayuSense Exposure Risk score."""

    exposure_risk_score: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Deterministic exposure risk index (0=Minimal Risk, 100=Extreme Risk)",
    )
    risk_level: str = Field(
        ...,
        description="Categorical risk tier: Low (0-20), Moderate (21-40), Elevated (41-60), High (61-80), Severe (81-100)",
    )
    confidence_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Data confidence rating reflecting measurement freshness and coverage",
    )
    freshness_indicator: str = Field(
        ...,
        description="Timeliness status of the underlying air quality measurement",
    )
    is_stale_or_missing: bool = Field(
        ...,
        description="Flag indicating whether data is stale (>6h) or missing entirely",
    )
    breakdown: RiskComponentBreakdown = Field(..., description="Component-level explainability breakdown")
    summary: str = Field(..., description="Plain-language deterministic summary statement")


class RecommendationRuleRequest(BaseModel):
    """Request payload for deterministic recommendations."""

    profile: Optional[HouseholdProfile] = Field(
        default=None,
        description="Custom household profile. If omitted, preset_name can be specified.",
    )
    preset_name: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Optionally load preset ('daily_commuter', 'family', 'senior_sensitive')",
    )
    aqi_data: Optional[AQIResponse] = Field(
        default=None,
        description="Pre-fetched AQI data payload if available",
    )
    location: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Location name or station to query live if aqi_data is omitted",
    )
    lat: Optional[float] = Field(default=None, ge=-90.0, le=90.0, description="Latitude coordinate if querying by coords")
    lon: Optional[float] = Field(default=None, ge=-180.0, le=180.0, description="Longitude coordinate if querying by coords")


# Alias for flexibility
RecommendationRequest = RecommendationRuleRequest


class RecommendationResponse(BaseModel):
    """Final recommendations and risk assessment response."""

    profile_name: str = Field(..., description="Name or identifier of the evaluated household profile")
    risk_assessment: RiskAssessmentResult = Field(..., description="Computed 0-100 risk score and breakdown")
    recommendations: List[RuleRecommendation] = Field(
        default_factory=list,
        description="Deterministic prioritized rule-based health recommendations",
    )
    generated_at: str = Field(..., description="ISO 8601 UTC timestamp of assessment generation")
    engine_version: str = Field(
        default="VayuSense-Deterministic-v1.0",
        description="Version identifier of the deterministic rules engine",
    )
