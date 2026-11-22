"""Router endpoints for managing household profiles and presets."""

from typing import Dict, Optional
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.models.profile import (
    PRESET_DAILY_COMMUTER,
    PRESET_FAMILY,
    PRESET_SENIOR_SENSITIVE,
    SAMPLE_PRESETS,
    HouseholdProfile,
)

router = APIRouter(prefix="/api/profile", tags=["Household Profiles"])


class ProfileCreateRequest(BaseModel):
    """Payload to create or load a household profile."""

    preset_name: Optional[str] = Field(
        default=None,
        description="Optionally load a preset profile: 'daily_commuter', 'family', or 'senior_sensitive'",
    )
    custom_profile: Optional[HouseholdProfile] = Field(
        default=None,
        description="Full customized household profile data (used if preset_name is omitted)",
    )


class ProfileResponse(BaseModel):
    """Response containing validated profile and demographic summary."""

    profile: HouseholdProfile
    total_members: int
    has_vulnerable_members: bool
    summary: str


@router.get(
    "/presets",
    response_model=Dict[str, HouseholdProfile],
    summary="List available sample household presets",
    description="Retrieve the three predefined representative presets: daily commuter, family, and senior-sensitive.",
)
async def list_presets() -> Dict[str, HouseholdProfile]:
    """Return all sample household presets."""
    return SAMPLE_PRESETS


@router.get(
    "/presets/{preset_name}",
    response_model=HouseholdProfile,
    summary="Get a specific sample preset",
    description="Fetch preset configuration by name ('daily_commuter', 'family', or 'senior_sensitive').",
)
async def get_preset(preset_name: str) -> HouseholdProfile:
    """Return specific sample preset."""
    key = preset_name.strip().lower()
    if key not in SAMPLE_PRESETS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Preset '{preset_name}' not found. Available presets: {list(SAMPLE_PRESETS.keys())}",
        )
    return SAMPLE_PRESETS[key]


@router.post(
    "",
    response_model=ProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create or initialize a household profile",
    description=(
        "Initialize a household profile either by referencing one of the 3 presets "
        "('daily_commuter', 'family', 'senior_sensitive') or providing a custom configuration."
    ),
)
async def create_profile(payload: ProfileCreateRequest) -> ProfileResponse:
    """Validate and return the structured household profile."""
    if payload.preset_name:
        key = payload.preset_name.strip().lower()
        if key not in SAMPLE_PRESETS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid preset '{payload.preset_name}'. Supported presets: {list(SAMPLE_PRESETS.keys())}",
            )
        resolved_profile = SAMPLE_PRESETS[key]
    elif payload.custom_profile:
        resolved_profile = payload.custom_profile
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must provide either 'preset_name' or 'custom_profile'.",
        )

    has_vulnerable = (
        len(resolved_profile.children_ages) > 0
        or resolved_profile.num_older_adults > 0
        or resolved_profile.has_asthma_or_respiratory_vulnerability
        or resolved_profile.has_respiratory_sensitivity
    )

    summary_parts = [
        f"Profile '{resolved_profile.profile_name}' configured with {resolved_profile.total_members} member(s): "
        f"{resolved_profile.num_adults} adult(s), {len(resolved_profile.children_ages)} child(ren), "
        f"{resolved_profile.num_older_adults} senior(s)."
    ]
    if resolved_profile.has_asthma_or_respiratory_vulnerability:
        summary_parts.append("User-reported respiratory vulnerability flagged.")
    if resolved_profile.commute_habits.is_daily_commuter:
        summary_parts.append(
            f"Daily commute active ({resolved_profile.commute_habits.estimated_daily_commute_minutes} min/day via "
            f"{resolved_profile.commute_habits.primary_mode.value})."
        )

    return ProfileResponse(
        profile=resolved_profile,
        total_members=resolved_profile.total_members,
        has_vulnerable_members=has_vulnerable,
        summary=" ".join(summary_parts),
    )
