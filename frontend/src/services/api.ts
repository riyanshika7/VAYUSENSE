/**
 * API client service connecting to the VayuSense FastAPI backend.
 */

import { AQIResponse, AQISearchResponse } from '../types/aqi';
import { HouseholdProfile } from '../types/profile';
import { AIPersonalizedPlan, RecommendationResponse } from '../types/recommendation';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export async function fetchHealth(): Promise<{ status: string; provider_token_configured: boolean; gemini_configured: boolean }> {
  const res = await fetch(`${API_BASE_URL}/health`);
  if (!res.ok) throw new Error(`Health check failed: HTTP ${res.status}`);
  return res.json();
}

export async function fetchLiveAQI(location?: string, lat?: number, lon?: number): Promise<AQIResponse> {
  const params = new URLSearchParams();
  if (location) {
    params.append('location', location);
  } else if (lat !== undefined && lon !== undefined) {
    params.append('lat', lat.toString());
    params.append('lon', lon.toString());
  } else {
    params.append('location', 'delhi'); // Default Indian hub
  }

  const res = await fetch(`${API_BASE_URL}/api/aqi?${params.toString()}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to fetch live AQI: HTTP ${res.status}`);
  }
  return res.json();
}

export async function searchLocations(query: string): Promise<AQISearchResponse> {
  const res = await fetch(`${API_BASE_URL}/api/aqi/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Location search failed: HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchPresets(): Promise<Record<string, HouseholdProfile>> {
  const res = await fetch(`${API_BASE_URL}/api/profile/presets`);
  if (!res.ok) throw new Error(`Failed to fetch presets: HTTP ${res.status}`);
  return res.json();
}

export async function fetchAIPlan(payload: {
  preset_name?: string;
  profile?: HouseholdProfile;
  aqi_data?: AQIResponse;
  location?: string;
}): Promise<AIPersonalizedPlan> {
  const res = await fetch(`${API_BASE_URL}/api/ai/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to generate AI plan: HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchRuleRecommendations(payload: {
  preset_name?: string;
  profile?: HouseholdProfile;
  aqi_data?: AQIResponse;
  location?: string;
}): Promise<RecommendationResponse> {
  const res = await fetch(`${API_BASE_URL}/api/recommendations/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to fetch deterministic recommendations: HTTP ${res.status}`);
  }
  return res.json();
}
