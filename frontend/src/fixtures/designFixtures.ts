/**
 * DESIGN FIXTURES FOR UI DEVELOPMENT ONLY
 *
 * NOTE: These fixtures are strictly for testing visual layouts, typography,
 * and responsive states during development. They are explicitly labeled and
 * MUST NEVER be presented as live air quality data.
 */

import { AQIResponse } from '../types/aqi';
import { HouseholdProfile } from '../types/profile';
import { AIPersonalizedPlan } from '../types/recommendation';

export const DESIGN_FIXTURE_AQI_DELHI: AQIResponse = {
  location_name: "Delhi (Design Fixture)",
  station_name: "Mandir Marg, New Delhi [DESIGN PREVIEW]",
  station_id: 7024,
  coordinates: { latitude: 28.6358, longitude: 77.2245 },
  aqi: 184,
  classification: {
    category: "Unhealthy",
    color_hex: "#EF4444",
    health_implications: "Everyone may begin to experience health effects; members of sensitive groups may experience more serious health effects.",
    scale_name: "WAQI / US EPA Standard",
    methodology_note: "WAQI standardizes reported index values against the US EPA AQI standard. Not calibrated to CPCB Indian National AQI sub-index formula.",
  },
  dominant_pollutant: "pm25",
  pollutants: {
    pm25: { value: 184, unit: "IAQI sub-index", label: "PM2.5 (Fine Particulate)" },
    pm10: { value: 142, unit: "IAQI sub-index", label: "PM10 (Respirable Particulate)" },
    no2: { value: 32.4, unit: "IAQI sub-index", label: "Nitrogen Dioxide (NO2)" },
    so2: null, // Intentionally null: missing != 0
    co: { value: 11.2, unit: "IAQI sub-index", label: "Carbon Monoxide (CO)" },
    o3: { value: 18.0, unit: "IAQI sub-index", label: "Ozone (O3)" },
    meteorological: { t: 23.5, h: 58, p: 1013, w: 2.1 },
  },
  source: "WAQI (Design Fixture - aqicn.org format)",
  attributions: [
    { name: "CPCB - Central Pollution Control Board", url: "https://cpcb.nic.in" },
    { name: "World Air Quality Index Project", url: "https://waqi.info" },
  ],
  station_url: "https://aqicn.org/city/delhi/mandir-marg",
  measurement_time: "2026-11-21 07:00:00",
  measurement_timestamp: 1763689200,
  measurement_timezone: "+05:30",
  retrieval_time: "2026-11-21T01:30:00Z",
  data_freshness: "Live (< 1h ago)",
  forecast: {
    pm25: [
      { day: "2026-11-20", avg: 172, min: 135, max: 215 },
      { day: "2026-11-21", avg: 184, min: 145, max: 230 },
      { day: "2026-11-22", avg: 195, min: 150, max: 245 },
      { day: "2026-11-23", avg: 165, min: 120, max: 200 },
      { day: "2026-11-24", avg: 155, min: 110, max: 190 },
    ],
    pm10: [
      { day: "2026-11-20", avg: 138, min: 95, max: 175 },
      { day: "2026-11-21", avg: 142, min: 100, max: 185 },
      { day: "2026-11-22", avg: 150, min: 110, max: 190 },
      { day: "2026-11-23", avg: 125, min: 85, max: 160 },
      { day: "2026-11-24", avg: 115, min: 80, max: 150 },
    ],
    o3: [
      { day: "2026-11-20", avg: 18, min: 10, max: 28 },
      { day: "2026-11-21", avg: 20, min: 12, max: 32 },
      { day: "2026-11-22", avg: 22, min: 14, max: 35 },
    ],
  },
};

export const DESIGN_FIXTURE_PROFILES: Record<string, HouseholdProfile> = {
  daily_commuter: {
    profile_id: "preset_daily_commuter",
    profile_name: "Daily Commuter Household",
    num_adults: 2,
    children_ages: [],
    num_older_adults: 0,
    has_respiratory_sensitivity: false,
    has_asthma_or_respiratory_vulnerability: false,
    has_limited_mobility: false,
    num_outdoor_workers: 0,
    commute_habits: {
      is_daily_commuter: true,
      commute_windows: [
        { label: "Morning Commute", start_time: "08:00", end_time: "10:00" },
        { label: "Evening Return", start_time: "18:00", end_time: "20:00" },
      ],
      primary_mode: "two_wheeler",
      estimated_daily_commute_minutes: 120,
    },
    exercise_habits: {
      participates_in_outdoor_exercise: false,
      time_of_day: "none",
      intensity: "moderate",
      duration_minutes: 0,
    },
    has_outdoor_child_play: false,
    cooking_habits: {
      has_kitchen_exhaust_or_chimney: true,
      cooking_windows: [{ label: "Evening Dinner", start_time: "20:00", end_time: "21:00" }],
      uses_indoor_incense_or_coils: false,
    },
    ventilation: "partially_open",
    purifier_setup: {
      has_air_purifier: false,
      purifier_count: 0,
      located_in_bedrooms: false,
      operates_continuously: false,
    },
  },
  family: {
    profile_id: "preset_family",
    profile_name: "Family with Young Child",
    num_adults: 2,
    children_ages: [5],
    num_older_adults: 0,
    has_respiratory_sensitivity: false,
    has_asthma_or_respiratory_vulnerability: false,
    has_limited_mobility: false,
    num_outdoor_workers: 0,
    commute_habits: {
      is_daily_commuter: true,
      commute_windows: [
        { label: "School/Work Commute", start_time: "08:30", end_time: "09:30" },
        { label: "Evening Return", start_time: "17:30", end_time: "18:30" },
      ],
      primary_mode: "car_ac",
      estimated_daily_commute_minutes: 60,
    },
    exercise_habits: {
      participates_in_outdoor_exercise: false,
      time_of_day: "none",
      intensity: "light",
      duration_minutes: 0,
    },
    has_outdoor_child_play: true,
    child_play_window: { label: "After-School Play", start_time: "16:30", end_time: "18:00" },
    cooking_habits: {
      has_kitchen_exhaust_or_chimney: true,
      cooking_windows: [{ label: "Family Dinner", start_time: "20:00", end_time: "21:00" }],
      uses_indoor_incense_or_coils: false,
    },
    ventilation: "naturally_ventilated",
    purifier_setup: {
      has_air_purifier: true,
      purifier_count: 1,
      located_in_bedrooms: true,
      operates_continuously: false,
    },
  },
  senior_sensitive: {
    profile_id: "preset_senior_sensitive",
    profile_name: "Senior-Sensitive Household",
    num_adults: 0,
    children_ages: [],
    num_older_adults: 1,
    has_respiratory_sensitivity: true,
    has_asthma_or_respiratory_vulnerability: true,
    has_limited_mobility: true,
    num_outdoor_workers: 0,
    commute_habits: {
      is_daily_commuter: false,
      commute_windows: [],
      primary_mode: "walking",
      estimated_daily_commute_minutes: 0,
    },
    exercise_habits: {
      participates_in_outdoor_exercise: true,
      time_of_day: "early_morning",
      intensity: "light",
      duration_minutes: 60,
    },
    has_outdoor_child_play: false,
    cooking_habits: {
      has_kitchen_exhaust_or_chimney: false,
      cooking_windows: [{ label: "Dinner", start_time: "19:30", end_time: "20:30" }],
      uses_indoor_incense_or_coils: true,
    },
    ventilation: "naturally_ventilated",
    purifier_setup: {
      has_air_purifier: false,
      purifier_count: 0,
      located_in_bedrooms: false,
      operates_continuously: false,
    },
  },
};

export const DESIGN_FIXTURE_AI_PLAN: AIPersonalizedPlan = {
  plan_id: "fixture_plan_preview",
  profile_name: "Daily Commuter Household",
  generated_at: "2026-11-21T01:30:00Z",
  model_used: "VayuSense-Preview-Engine",
  is_fallback: true,
  fallback_reason: "Design Preview Fixture",
  exposure_risk_score: 58.4,
  risk_level: "Elevated",
  aqi_data_status: "Live (< 1h ago) data (Mandir Marg, Delhi)",
  today_routine: {
    morning: {
      time_of_day: "Morning",
      summary: "High boundary inversion smog. Shield against roadside vehicular exhaust and keep home sealed.",
      actions: [
        {
          action: "Engage cabin air recirculation in vehicles; two-wheeler riders must wear snug N95 respirators.",
          why_now: "Morning rush hour bottleneck concentrates diesel soot and black carbon in roadway wake plumes.",
          trigger_condition: "Commute scheduled 08:00-10:00 AM on two-wheeler.",
          beneficiary: "Commuting adults",
          expected_mechanism: "N95 filter media captures sub-micron particulates; cabin recirculation blocks vehicle wake exhaust.",
          tradeoff_or_limitation: "Respirator breathing resistance; requires snug facial seal.",
          timing: "08:00 - 10:00 AM",
          priority: "High",
        },
        {
          action: "Keep balcony doors and windows tightly closed until midday thermal dispersion begins.",
          why_now: "Cool morning air traps particulate matter near ground level.",
          trigger_condition: "Diurnal smog cycle in urban basin.",
          beneficiary: "All occupants",
          expected_mechanism: "Physical building envelope prevents ambient particulate infiltration.",
          tradeoff_or_limitation: "Indoor air may feel still; use low ceiling fan circulation.",
          timing: "05:00 - 10:30 AM",
          priority: "High",
        },
      ],
    },
    afternoon: {
      time_of_day: "Afternoon",
      summary: "Atmospheric boundary layer expands with solar heating, creating the day's lowest ambient concentrations.",
      actions: [
        {
          action: "Consolidate evening errands into a single 30-minute midday trip.",
          why_now: "Midday air dispersion reduces total inhaled particulate dose per minute outdoors.",
          trigger_condition: "Trip consolidation rule.",
          beneficiary: "Adult running errands",
          expected_mechanism: "Reduces repeated entries and cumulative outdoor exposure time.",
          tradeoff_or_limitation: "Requires planning midday time away from work.",
          timing: "01:00 - 02:30 PM",
          priority: "Medium",
        },
      ],
    },
    evening: {
      time_of_day: "Evening",
      summary: "Vehicular traffic and temperature drop cause PM2.5 to rise rapidly after sunset.",
      actions: [
        {
          action: "Operate kitchen exhaust fan on maximum throughout dinner prep and for 15 minutes post-cooking.",
          why_now: "Evening tadka seasoning and frying release concentrated bursts of ultrafine particulates and acrolein.",
          trigger_condition: "Cooking scheduled 20:00-21:00.",
          beneficiary: "Primary cook and family members",
          expected_mechanism: "Direct-source mechanical exhaust prevents indoor particulate accumulation in living areas.",
          tradeoff_or_limitation: "Exhaust motor noise.",
          timing: "08:00 - 09:15 PM",
          priority: "High",
        },
      ],
    },
    night: {
      time_of_day: "Night",
      summary: "Establish an enclosed, low-particulate sanctuary in the bedroom for overnight pulmonary recovery.",
      actions: [
        {
          action: "Seal bedroom doors and exterior windows; ensure no smoldering coils or incense are burned.",
          why_now: "Sleeping occupants breathe continuously in one closed space for 7-8 hours.",
          trigger_condition: "Overnight micro-environment management.",
          beneficiary: "All sleeping occupants",
          expected_mechanism: "Prevents overnight ambient infiltration and avoids internal particulate generation.",
          tradeoff_or_limitation: "Requires managing room temperature without open windows.",
          timing: "10:00 PM - 07:00 AM",
          priority: "High",
        },
      ],
    },
  },
  indoor_air_action: {
    cooking: [
      {
        action: "Run kitchen chimney before igniting burners and keep running 15 min after cooking ends.",
        why_now: "Cooking oil vaporization generates high domestic PM2.5 peaks.",
        trigger_condition: "Kitchen setup.",
        beneficiary: "Whole household",
        expected_mechanism: "Evacuates aerosolized droplets before they diffuse to sleeping quarters.",
        tradeoff_or_limitation: "Fan noise.",
        timing: "Meal prep",
        priority: "High",
      },
    ],
    ventilation: [
      {
        action: "Avoid natural cross-ventilation during morning (05:00-10:00) and night (20:00-05:00).",
        why_now: "Thermal inversion traps outdoor particulate near the ground during these hours.",
        trigger_condition: "Naturally ventilated home profile.",
        beneficiary: "Whole family",
        expected_mechanism: "Blocks outdoor particulate influx.",
        tradeoff_or_limitation: "Reduced fresh airflow.",
        timing: "Diurnal schedule",
        priority: "High",
      },
    ],
    dust_and_cleaning: [
      {
        action: "Use damp microfiber cloths and wet mopping; avoid dry broom sweeping.",
        why_now: "Daily dust management without aerosolization.",
        trigger_condition: "Floor cleaning.",
        beneficiary: "All occupants",
        expected_mechanism: "Moisture traps settled dust and prevents resuspension into the breathing zone.",
        tradeoff_or_limitation: "Floor drying time.",
        timing: "Morning",
        priority: "Medium",
      },
    ],
    incense_and_combustion: [
      {
        action: "Do not burn incense, dhoop, or mosquito coils in closed rooms.",
        why_now: "Smoldering materials produce concentrated fine particulate comparable to cigarette smoke.",
        trigger_condition: "Indoor air quality protection.",
        beneficiary: "All members",
        expected_mechanism: "Eliminates significant internal source of respirable combustion products.",
        tradeoff_or_limitation: "Requires flameless electric lamps for spiritual practice.",
        timing: "Always",
        priority: "Critical",
      },
    ],
    purifier_and_bedrooms: [
      {
        action: "Consider a true-HEPA purifier placed 2 feet away from walls in the primary bedroom.",
        why_now: "Provides overnight respiratory recovery from daytime outdoor exposure.",
        trigger_condition: "No purifier currently installed.",
        beneficiary: "Sleeping occupants",
        expected_mechanism: "Continuous HEPA recirculating filtration.",
        tradeoff_or_limitation: "Equipment investment.",
        timing: "Overnight",
        priority: "High",
      },
    ],
    indoor_activities: [
      {
        action: "Opt for sedentary or low-intensity recreation during peak smog hours.",
        why_now: "Lower breathing rates minimize particulate intake.",
        trigger_condition: "Elevated ambient AQI.",
        beneficiary: "Children and adults",
        expected_mechanism: "Reduces minute ventilation volume.",
        tradeoff_or_limitation: "Less physical play.",
        timing: "Evening",
        priority: "Medium",
      },
    ],
  },
  sustainable_swaps: {
    swaps: [
      {
        swap_category: "transit",
        current_habit: "Daily two-wheeler commute (120 min/day)",
        recommended_swap: "Shift to Metro Rail or air-conditioned bus on days with AQI > 150",
        rationale: "Enclosed transit bypasses direct inhalation of roadside vehicle exhaust and diesel soot",
        feasibility_note: "Requires aligning with nearby metro feeder routes",
      },
      {
        swap_category: "trip_chaining",
        current_habit: "Multiple fragmented neighborhood runs",
        recommended_swap: "Chain grocery, pharmacy, and bank stops into one coordinated midday circuit",
        rationale: "Reduces cumulative ambient exposure duration and minimizes repeated door openings",
        feasibility_note: "Requires a consolidated daily checklist",
      },
      {
        swap_category: "exercise",
        current_habit: "Early morning outdoor walk",
        recommended_swap: "Indoor mat workout, stretching, or stair climbing",
        rationale: "Maintains fitness while avoiding heavy inhalation of ground inversion smog",
        feasibility_note: "Zero equipment needed; uses home floor space",
      },
    ],
  },
  personalized_alerts: [
    {
      activity: "Two-Wheeler Commute Alert",
      alert_level: "Warning",
      message: "Rush hour roadside particulate levels are elevated. Wear an N95 respirator snugly sealed over nose and mouth.",
      affected_member: "Daily commuters",
    },
    {
      activity: "Cooking Fumes Notice",
      alert_level: "Caution",
      message: "Ensure the kitchen chimney is running throughout dinner preparation to avoid particulate buildup in bedrooms.",
      affected_member: "Cook and family",
    },
  ],
  medical_disclaimer:
    "VayuSense provides air quality exposure intelligence based on environmental measurements and reported habits. It does not provide medical diagnosis, clinical evaluation, or prescription advice.",
};
