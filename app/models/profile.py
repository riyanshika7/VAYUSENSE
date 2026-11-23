"""Household profile schemas and sample presets for VayuSense."""

from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field, model_validator


class ExerciseIntensity(str, Enum):
    """Intensity levels for physical exercise."""

    LIGHT = "light"
    MODERATE = "moderate"
    VIGOROUS = "vigorous"


class ExerciseTimeOfDay(str, Enum):
    """Preferred time window for exercise."""

    EARLY_MORNING = "early_morning"  # 05:00 - 08:00
    MORNING = "morning"              # 08:00 - 11:00
    AFTERNOON = "afternoon"          # 12:00 - 16:00
    EVENING = "evening"              # 16:00 - 20:00
    NIGHT = "night"                  # 20:00 - 23:00
    INDOOR_ONLY = "indoor_only"
    NONE = "none"


class CommuteMode(str, Enum):
    """Primary transport mode for daily commuters."""

    TWO_WHEELER = "two_wheeler"      # High direct ambient exposure
    OPEN_AUTO = "open_auto"          # High direct ambient exposure
    WALKING_CYCLING = "walking"      # Maximum inhalation rate and direct exposure
    BUS_NON_AC = "bus_non_ac"        # Moderate-high exposure
    METRO_AC = "metro_ac"            # Filtered/enclosed lower exposure
    CAR_AC = "car_ac"                # Recirculating AC lower exposure


class VentilationCondition(str, Enum):
    """Home ventilation profile."""

    SEALED_AC = "sealed_ac"                        # Closed windows with air conditioning
    PARTIALLY_OPEN = "partially_open"              # Some windows opened intermittently
    NATURALLY_VENTILATED = "naturally_ventilated"  # Windows and doors kept open
    POORLY_VENTILATED = "poorly_ventilated"        # Traps indoor smoke and cooking fumes


class TimeWindow(BaseModel):
    """Time window for scheduled activities (e.g., commute, cooking, exercise)."""

    label: str = Field(..., max_length=60, description="Description of the window, e.g., 'Morning commute'")
    start_time: str = Field(..., max_length=10, description="Start time in 24h format HH:MM, e.g., '08:00'")
    end_time: str = Field(..., max_length=10, description="End time in 24h format HH:MM, e.g., '10:00'")


class ExerciseHabits(BaseModel):
    """Exercise and outdoor physical activity habits."""

    participates_in_outdoor_exercise: bool = Field(
        default=False,
        description="Whether household members engage in outdoor sports, running, or walking",
    )
    time_of_day: ExerciseTimeOfDay = Field(
        default=ExerciseTimeOfDay.NONE,
        description="Typical time window for outdoor exercise",
    )
    intensity: ExerciseIntensity = Field(
        default=ExerciseIntensity.MODERATE,
        description="Physical exertion intensity (affects ventilation rate)",
    )
    duration_minutes: int = Field(
        default=0,
        ge=0,
        le=360,
        description="Typical outdoor exercise duration in minutes per day",
    )


class CommuteHabits(BaseModel):
    """Commute patterns for daily travelers."""

    is_daily_commuter: bool = Field(default=False, description="Whether household has active commuters")
    commute_windows: List[TimeWindow] = Field(
        default_factory=list,
        description="Scheduled daily commute departure and arrival windows",
    )
    primary_mode: CommuteMode = Field(
        default=CommuteMode.TWO_WHEELER,
        description="Primary transport mode used for commuting",
    )
    estimated_daily_commute_minutes: int = Field(
        default=0,
        ge=0,
        le=480,
        description="Total round-trip commute duration in minutes",
    )


class CookingHabits(BaseModel):
    """Indoor cooking environment and schedule."""

    has_kitchen_exhaust_or_chimney: bool = Field(
        default=True,
        description="Whether an active kitchen exhaust chimney or fan is installed and used",
    )
    cooking_windows: List[TimeWindow] = Field(
        default_factory=list,
        description="Time slots when heavy frying, tadka, or stove cooking occurs",
    )
    uses_indoor_incense_or_coils: bool = Field(
        default=False,
        description="Whether incense (agarbatti), dhoop, or mosquito coils are burned indoors",
    )


class PurifierSetup(BaseModel):
    """Home air purifier equipment and configuration."""

    has_air_purifier: bool = Field(
        default=False,
        description="Whether the household has one or more operational HEPA/carbon air purifiers",
    )
    purifier_count: int = Field(default=0, ge=0, le=50, description="Total number of functional purifiers")
    located_in_bedrooms: bool = Field(default=False, description="Purifier active in sleeping quarters")
    operates_continuously: bool = Field(
        default=False,
        description="Whether purifier runs 24/7 or is turned on only intermittently",
    )


class HouseholdProfile(BaseModel):
    """Comprehensive household demographic and lifestyle exposure profile."""

    profile_id: Optional[str] = Field(default=None, max_length=64, description="Optional profile identifier or label")
    profile_name: Optional[str] = Field(default="My Household", max_length=100, description="User-friendly name for this profile")

    # Demographics
    num_adults: int = Field(default=1, ge=0, le=20, description="Number of adults aged 18-59")
    children_ages: List[int] = Field(
        default_factory=list,
        max_length=20,
        description="List of ages for each child under 18 in the household (e.g. [4, 9])",
    )
    num_older_adults: int = Field(
        default=0,
        ge=0,
        le=20,
        description="Number of senior household members aged 60+",
    )

    # Health Sensitivities (User-reported; explicitly NOT a clinical diagnosis)
    has_respiratory_sensitivity: bool = Field(
        default=False,
        description="User-reported general respiratory sensitivity (allergies, dust sensitivity)",
    )
    has_asthma_or_respiratory_vulnerability: bool = Field(
        default=False,
        description="User-reported asthma, COPD, or chronic respiratory condition (informational, not a diagnosis)",
    )
    has_limited_mobility: bool = Field(
        default=False,
        description="Whether vulnerable members have limited mobility or cannot easily relocate",
    )

    # Occupational and Commuting Exposure
    num_outdoor_workers: int = Field(
        default=0,
        ge=0,
        le=20,
        description="Number of household members working outdoors (traffic, construction, street vendors)",
    )
    commute_habits: CommuteHabits = Field(default_factory=CommuteHabits)

    # Exercise & Recreation
    exercise_habits: ExerciseHabits = Field(default_factory=ExerciseHabits)
    has_outdoor_child_play: bool = Field(
        default=False,
        description="Whether young children play outdoors regularly after school or in evenings",
    )
    child_play_window: Optional[TimeWindow] = Field(
        default=None,
        description="Time slot when children typically play outdoors",
    )

    # Indoor Environment
    cooking_habits: CookingHabits = Field(default_factory=CookingHabits)
    ventilation: VentilationCondition = Field(
        default=VentilationCondition.NATURALLY_VENTILATED,
        description="Home ventilation profile",
    )
    purifier_setup: PurifierSetup = Field(default_factory=PurifierSetup)

    @model_validator(mode="after")
    def validate_profile_consistency(self) -> "HouseholdProfile":
        """Verify demographic constraints and consistency."""
        if (self.num_adults + len(self.children_ages) + self.num_older_adults) < 1:
            raise ValueError("Household profile must contain at least one occupant (adult, child, or older adult).")
        for age in self.children_ages:
            if age < 0 or age >= 18:
                raise ValueError(f"Child age must be between 0 and 17 inclusive. Received: {age}")
        return self

    @property
    def total_members(self) -> int:
        """Total number of individuals in the household."""
        return self.num_adults + len(self.children_ages) + self.num_older_adults

    @property
    def has_young_children(self) -> bool:
        """Whether household has infants or young children under age 6."""
        return any(age < 6 for age in self.children_ages)


# ==============================================================================
# Sample Household Presets (As defined in Phase 2 Requirements)
# ==============================================================================

PRESET_DAILY_COMMUTER = HouseholdProfile(
    profile_id="preset_daily_commuter",
    profile_name="Daily Commuter Household",
    num_adults=2,
    children_ages=[],
    num_older_adults=0,
    has_respiratory_sensitivity=False,
    has_asthma_or_respiratory_vulnerability=False,
    num_outdoor_workers=0,
    commute_habits=CommuteHabits(
        is_daily_commuter=True,
        commute_windows=[
            TimeWindow(label="Morning Commute", start_time="08:00", end_time="10:00"),
            TimeWindow(label="Evening Return", start_time="18:00", end_time="20:00"),
        ],
        primary_mode=CommuteMode.TWO_WHEELER,
        estimated_daily_commute_minutes=120,
    ),
    exercise_habits=ExerciseHabits(
        participates_in_outdoor_exercise=False,
        time_of_day=ExerciseTimeOfDay.NONE,
    ),
    cooking_habits=CookingHabits(
        has_kitchen_exhaust_or_chimney=True,
        cooking_windows=[
            TimeWindow(label="Evening Dinner", start_time="20:00", end_time="21:00"),
        ],
    ),
    ventilation=VentilationCondition.PARTIALLY_OPEN,
    purifier_setup=PurifierSetup(has_air_purifier=False),
)

PRESET_FAMILY = HouseholdProfile(
    profile_id="preset_family",
    profile_name="Family with Young Child",
    num_adults=2,
    children_ages=[5],
    num_older_adults=0,
    has_respiratory_sensitivity=False,
    has_asthma_or_respiratory_vulnerability=False,
    num_outdoor_workers=0,
    commute_habits=CommuteHabits(
        is_daily_commuter=True,
        commute_windows=[
            TimeWindow(label="Work/School Commute", start_time="08:30", end_time="09:30"),
            TimeWindow(label="Evening Commute", start_time="17:30", end_time="18:30"),
        ],
        primary_mode=CommuteMode.CAR_AC,
        estimated_daily_commute_minutes=60,
    ),
    exercise_habits=ExerciseHabits(
        participates_in_outdoor_exercise=False,
        time_of_day=ExerciseTimeOfDay.NONE,
    ),
    has_outdoor_child_play=True,
    child_play_window=TimeWindow(
        label="After-School Outdoor Play",
        start_time="16:30",
        end_time="18:00",
    ),
    cooking_habits=CookingHabits(
        has_kitchen_exhaust_or_chimney=True,
        cooking_windows=[
            TimeWindow(label="Dinner Prep", start_time="20:00", end_time="21:00"),
        ],
    ),
    ventilation=VentilationCondition.NATURALLY_VENTILATED,
    purifier_setup=PurifierSetup(
        has_air_purifier=True,
        purifier_count=1,
        located_in_bedrooms=True,
        operates_continuously=False,
    ),
)

PRESET_SENIOR_SENSITIVE = HouseholdProfile(
    profile_id="preset_senior_sensitive",
    profile_name="Senior-Sensitive Household",
    num_adults=0,
    children_ages=[],
    num_older_adults=1,
    has_respiratory_sensitivity=True,
    has_asthma_or_respiratory_vulnerability=True,
    has_limited_mobility=True,
    num_outdoor_workers=0,
    commute_habits=CommuteHabits(
        is_daily_commuter=False,
        commute_windows=[],
        estimated_daily_commute_minutes=0,
    ),
    exercise_habits=ExerciseHabits(
        participates_in_outdoor_exercise=True,
        time_of_day=ExerciseTimeOfDay.EARLY_MORNING,
        intensity=ExerciseIntensity.LIGHT,
        duration_minutes=60,
    ),
    cooking_habits=CookingHabits(
        has_kitchen_exhaust_or_chimney=False,
        cooking_windows=[
            TimeWindow(label="Simple Dinner", start_time="19:30", end_time="20:30"),
        ],
        uses_indoor_incense_or_coils=True,
    ),
    ventilation=VentilationCondition.NATURALLY_VENTILATED,
    purifier_setup=PurifierSetup(has_air_purifier=False),
)

SAMPLE_PRESETS = {
    "daily_commuter": PRESET_DAILY_COMMUTER,
    "family": PRESET_FAMILY,
    "senior_sensitive": PRESET_SENIOR_SENSITIVE,
}
