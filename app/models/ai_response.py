"""Pydantic schemas for Gemini-powered personalized reasoning and AI plan."""

from typing import List, Optional
from pydantic import BaseModel, Field

from app.models.aqi import AQIResponse
from app.models.profile import HouseholdProfile


class ExplainableAction(BaseModel):
    """An individual actionable recommendation with complete explainability metadata."""

    action: str = Field(..., description="What should the user do?")
    why_now: str = Field(..., description="Why is this recommended now?")
    trigger_condition: str = Field(..., description="What data or household condition triggered it?")
    beneficiary: str = Field(..., description="Who benefits in the household?")
    expected_mechanism: str = Field(
        ...,
        description="What exposure reduction mechanism is expected? (Qualitative, no unverified percentage claims)",
    )
    tradeoff_or_limitation: str = Field(
        ...,
        description="What trade-off, limitation, or practical inconvenience exists?",
    )
    timing: str = Field(..., description="Specific time window or situational trigger")
    priority: str = Field(default="Medium", description="Priority tier: Critical, High, Medium, Low")


class DailyRoutineSegment(BaseModel):
    """Actions and schedule adjustments for a specific phase of the day."""

    time_of_day: str = Field(..., description="Period: 'Morning', 'Afternoon', 'Evening', or 'Night'")
    summary: str = Field(..., description="High-level guidance for this time window")
    actions: List[ExplainableAction] = Field(default_factory=list, description="Concrete explainable steps")


class TodayRoutine(BaseModel):
    """Time-sequenced daily action plan."""

    morning: DailyRoutineSegment = Field(..., description="Morning window guidance (05:00 - 11:00)")
    afternoon: DailyRoutineSegment = Field(..., description="Afternoon window guidance (11:00 - 16:00)")
    evening: DailyRoutineSegment = Field(..., description="Evening window guidance (16:00 - 20:00)")
    night: DailyRoutineSegment = Field(..., description="Night window guidance (20:00 - 07:00)")


class IndoorAirActions(BaseModel):
    """Granular indoor management guidance across household sources."""

    cooking: List[ExplainableAction] = Field(default_factory=list, description="Kitchen exhaust, tadka, and door management")
    ventilation: List[ExplainableAction] = Field(default_factory=list, description="Selective window opening and sealing")
    dust_and_cleaning: List[ExplainableAction] = Field(default_factory=list, description="Damp mopping, wiping, and sweeping avoidance")
    incense_and_combustion: List[ExplainableAction] = Field(default_factory=list, description="Agarbatti, dhoop, and mosquito coil mitigation")
    purifier_and_bedrooms: List[ExplainableAction] = Field(default_factory=list, description="Purifier placement, speeds, and bedroom sealing")
    indoor_activities: List[ExplainableAction] = Field(default_factory=list, description="Indoor play and exercise adaptations")


class SustainableSwapItem(BaseModel):
    """A realistic, practical sustainable lifestyle or commuting substitution."""

    swap_category: str = Field(
        ...,
        description="Category: 'transit', 'trip_chaining', 'exercise', or 'low_emission_choice'",
    )
    current_habit: str = Field(..., description="Current habit or routine identified in profile")
    recommended_swap: str = Field(..., description="Healthier or lower-emission practical alternative")
    rationale: str = Field(..., description="Why this swap reduces exposure or personal emissions")
    feasibility_note: str = Field(..., description="Practical feasibility or cost consideration")


class SustainableSwaps(BaseModel):
    """Collection of sustainable exposure reduction substitutions."""

    swaps: List[SustainableSwapItem] = Field(default_factory=list, description="List of practical substitutions")


class PersonalizedAlert(BaseModel):
    """Concise warnings for high-risk scheduled household activities."""

    activity: str = Field(..., description="Activity name (e.g., 'Morning Walk', 'Two-Wheeler Commute', 'Outdoor Child Play')")
    alert_level: str = Field(..., description="Alert severity: 'Warning', 'Caution', or 'Advisory'")
    message: str = Field(..., description="Concise, actionable risk message")
    affected_member: str = Field(..., description="Target family member or demographic")


class AIPersonalizedPlan(BaseModel):
    """Complete personalized reasoning output for VayuSense."""

    plan_id: str = Field(..., description="Unique plan generation identifier")
    profile_name: str = Field(..., description="Name of the evaluated household profile")
    generated_at: str = Field(..., description="ISO 8601 timestamp of plan generation")
    model_used: str = Field(..., description="Model identifier used for reasoning (or 'Deterministic-Fallback')")
    is_fallback: bool = Field(default=False, description="Whether this plan was generated via deterministic fallback")
    fallback_reason: Optional[str] = Field(default=None, description="Reason for fallback if applicable")

    # Deterministic risk engine anchors (Guaranteed never modified or overridden by AI)
    exposure_risk_score: float = Field(..., ge=0.0, le=100.0, description="Official deterministic exposure risk score")
    risk_level: str = Field(..., description="Official deterministic risk level")
    aqi_data_status: str = Field(..., description="Timeliness and provenance of underlying AQI data")

    # Personalized Reasoning Categories
    today_routine: TodayRoutine = Field(..., description="Category A: Morning, afternoon, evening, night routine")
    indoor_air_action: IndoorAirActions = Field(..., description="Category B: Cooking, ventilation, dust, incense, purifier")
    sustainable_swaps: SustainableSwaps = Field(..., description="Category C: Transit, trip chaining, indoor exercise swaps")
    personalized_alerts: List[PersonalizedAlert] = Field(default_factory=list, description="Category E: Concise warnings")

    medical_disclaimer: str = Field(
        default=(
            "VayuSense provides air quality exposure guidance based on environmental measurements and reported habits. "
            "It does not provide medical diagnosis, clinical evaluation, or prescription advice. "
            "Consult a qualified healthcare professional for persistent respiratory symptoms."
        ),
        description="Mandatory health disclaimer",
    )


class AIPlanRequest(BaseModel):
    """Request schema for generating an AI personalized reasoning plan."""

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
