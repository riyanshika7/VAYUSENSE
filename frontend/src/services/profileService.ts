/**
 * profileService — localStorage-backed profile CRUD with clean architecture.
 *
 * Storage layout (key: "vayusense_profiles"):
 *   { profiles: Record<id, HouseholdProfile>, activeId: string }
 *
 * Designed for future database persistence: replace the localStorage calls
 * with API calls without changing any hook or component code.
 */

import type { HouseholdProfile } from '../types/profile';
import { DESIGN_FIXTURE_PROFILES } from '../fixtures/designFixtures';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ProfileStore {
  profiles: Record<string, HouseholdProfile>;
  activeId: string;
}

export interface ParsedProfileSuggestion {
  suggested_fields: Partial<HouseholdProfile> & {
    // flat fields returned from backend before merging into nested schema
    is_daily_commuter?: boolean;
    primary_commute_mode?: string;
    commute_minutes?: number;
    participates_in_outdoor_exercise?: boolean;
    exercise_time_of_day?: string;
    exercise_intensity?: string;
    exercise_duration_minutes?: number;
    has_kitchen_exhaust?: boolean;
    uses_indoor_incense_or_coils?: boolean;
    ventilation_condition?: string;
    has_air_purifier?: boolean;
    purifier_count?: number;
    purifier_in_bedrooms?: boolean;
    extraction_notes?: string | null;
    confidence: number;
  };
  requires_confirmation: boolean;
  gemini_used: boolean;
  message: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'vayusense_profiles';

/** Built-in preset profiles — always available, cannot be deleted. */
export const BUILTIN_PRESET_IDS = ['daily_commuter', 'family', 'senior_sensitive'] as const;
export type BuiltinPresetId = typeof BUILTIN_PRESET_IDS[number];

export const BUILTIN_PRESETS: Record<string, HouseholdProfile> = DESIGN_FIXTURE_PROFILES;

export const PRESET_META: Record<string, { title: string; description: string; icon: string }> = {
  daily_commuter: {
    title: 'Daily Commuters',
    description: 'Two working adults commuting by two-wheeler during peak hours.',
    icon: '🛵',
  },
  family: {
    title: 'Family with Young Child',
    description: 'Two adults, one 5-year-old child, evening outdoor play, home-cooked dinners.',
    icon: '👨‍👩‍👧',
  },
  senior_sensitive: {
    title: 'Senior-Sensitive Household',
    description: 'Older adult with asthma sensitivity, daily morning walk, limited mobility.',
    icon: '🧓',
  },
};

// ─── Storage helpers ──────────────────────────────────────────────────────────
function readStore(): ProfileStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return _defaultStore();
    return JSON.parse(raw) as ProfileStore;
  } catch {
    return _defaultStore();
  }
}

function writeStore(store: ProfileStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage quota exceeded or unavailable — silent fail
  }
}

function _defaultStore(): ProfileStore {
  return {
    profiles: { ...BUILTIN_PRESETS },
    activeId: 'daily_commuter',
  };
}

// ─── CRUD operations ──────────────────────────────────────────────────────────
export function getAllProfiles(): Record<string, HouseholdProfile> {
  const store = readStore();
  // Always include builtins even if localStorage was cleared
  return { ...BUILTIN_PRESETS, ...store.profiles };
}

export function getActiveId(): string {
  return readStore().activeId;
}

export function getActiveProfile(): HouseholdProfile {
  const store = readStore();
  const all = getAllProfiles();
  return all[store.activeId] ?? BUILTIN_PRESETS.daily_commuter;
}

export function setActiveId(id: string): void {
  const store = readStore();
  store.activeId = id;
  writeStore(store);
}

export function saveProfile(id: string, profile: HouseholdProfile): void {
  const store = readStore();
  store.profiles[id] = profile;
  writeStore(store);
}

export function deleteProfile(id: string): void {
  if (BUILTIN_PRESET_IDS.includes(id as BuiltinPresetId)) return; // cannot delete builtins
  const store = readStore();
  delete store.profiles[id];
  if (store.activeId === id) store.activeId = 'daily_commuter';
  writeStore(store);
}

// ─── NL description → profile fields (via backend) ───────────────────────────
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export async function parseNLDescription(description: string): Promise<ParsedProfileSuggestion> {
  const res = await fetch(`${API_BASE}/api/ai/parse-profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Parse request failed: HTTP ${res.status}`);
  }

  return res.json();
}

// ─── Merge flat parsed fields → HouseholdProfile shape ───────────────────────
/**
 * Applies non-null suggested fields from a parse result onto a base profile.
 * Only overwrites fields that the AI was confident about (non-null in suggestion).
 */
export function mergeParsedFields(
  base: HouseholdProfile,
  suggestion: ParsedProfileSuggestion['suggested_fields']
): HouseholdProfile {
  const merged = structuredClone(base) as HouseholdProfile;

  if (suggestion.profile_name != null) merged.profile_name = suggestion.profile_name;
  if (suggestion.num_adults != null) merged.num_adults = suggestion.num_adults;
  if (suggestion.children_ages != null) merged.children_ages = suggestion.children_ages;
  if (suggestion.num_older_adults != null) merged.num_older_adults = suggestion.num_older_adults;
  if (suggestion.has_respiratory_sensitivity != null)
    merged.has_respiratory_sensitivity = suggestion.has_respiratory_sensitivity;
  if (suggestion.has_asthma_or_respiratory_vulnerability != null)
    merged.has_asthma_or_respiratory_vulnerability = suggestion.has_asthma_or_respiratory_vulnerability;
  if (suggestion.has_limited_mobility != null)
    merged.has_limited_mobility = suggestion.has_limited_mobility;
  if (suggestion.num_outdoor_workers != null)
    merged.num_outdoor_workers = suggestion.num_outdoor_workers;
  if (suggestion.has_outdoor_child_play != null)
    merged.has_outdoor_child_play = suggestion.has_outdoor_child_play;

  // Commute
  if (suggestion.is_daily_commuter != null)
    merged.commute_habits.is_daily_commuter = suggestion.is_daily_commuter;
  if (suggestion.primary_commute_mode != null)
    merged.commute_habits.primary_mode = suggestion.primary_commute_mode as HouseholdProfile['commute_habits']['primary_mode'];
  if (suggestion.commute_minutes != null)
    merged.commute_habits.estimated_daily_commute_minutes = suggestion.commute_minutes;

  // Exercise
  if (suggestion.participates_in_outdoor_exercise != null)
    merged.exercise_habits.participates_in_outdoor_exercise = suggestion.participates_in_outdoor_exercise;
  if (suggestion.exercise_time_of_day != null)
    merged.exercise_habits.time_of_day = suggestion.exercise_time_of_day as HouseholdProfile['exercise_habits']['time_of_day'];
  if (suggestion.exercise_intensity != null)
    merged.exercise_habits.intensity = suggestion.exercise_intensity as HouseholdProfile['exercise_habits']['intensity'];
  if (suggestion.exercise_duration_minutes != null)
    merged.exercise_habits.duration_minutes = suggestion.exercise_duration_minutes;

  // Cooking
  if (suggestion.has_kitchen_exhaust != null)
    merged.cooking_habits.has_kitchen_exhaust_or_chimney = suggestion.has_kitchen_exhaust;
  if (suggestion.uses_indoor_incense_or_coils != null)
    merged.cooking_habits.uses_indoor_incense_or_coils = suggestion.uses_indoor_incense_or_coils;

  // Indoor
  if (suggestion.ventilation_condition != null)
    merged.ventilation = suggestion.ventilation_condition as HouseholdProfile['ventilation'];

  // Purifier
  if (suggestion.has_air_purifier != null)
    merged.purifier_setup.has_air_purifier = suggestion.has_air_purifier;
  if (suggestion.purifier_count != null)
    merged.purifier_setup.purifier_count = suggestion.purifier_count;
  if (suggestion.purifier_in_bedrooms != null)
    merged.purifier_setup.located_in_bedrooms = suggestion.purifier_in_bedrooms;

  return merged;
}
