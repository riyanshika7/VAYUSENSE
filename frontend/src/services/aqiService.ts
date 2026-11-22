/**
 * AQI Service — cache layer on top of the raw API client.
 *
 * Responsibilities:
 *  - Short-lived in-memory TTL cache (avoids hammering the backend on every re-render)
 *  - Derives a cache-freshness status separate from the backend's data_freshness field
 *  - Provides a typed AbortController-aware fetch wrapper
 *  - Never invents measurements; all data comes from the backend exactly as received
 */

import { fetchLiveAQI, searchLocations } from './api';
import type { AQIResponse, AQISearchResponse, StationSearchResult } from '../types/aqi';

// ─── Cache-freshness constants ────────────────────────────────────────────────
/** Requests younger than this are served from cache without hitting the backend. */
const CACHE_FRESH_MS = 5 * 60 * 1000; // 5 min

/** After this, the cache entry is considered stale (still usable, visually flagged). */
const CACHE_STALE_MS = 30 * 60 * 1000; // 30 min

// ─── Types ────────────────────────────────────────────────────────────────────
export type CacheStatus = 'fresh' | 'stale' | 'expired';

export interface AQICacheEntry {
  data: AQIResponse;
  fetchedAt: number; // Date.now() ms
  cacheStatus: CacheStatus;
}

/** Lightweight suggestion shown in the city search dropdown. */
export interface CitySearchResult {
  /** The string to pass as `location` to the backend.
   *  Preset cities use lowercase city name; WAQI station results use `@{uid}`. */
  query: string;
  /** Human-readable label for the UI. */
  label: string;
  /** AQI value if available from search result — never fabricated, may be null. */
  aqi: number | null;
  isPreset: boolean;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────
const _cache = new Map<string, AQICacheEntry>();

function _cacheKey(location: string): string {
  return location.toLowerCase().trim();
}

function _computeCacheStatus(fetchedAt: number): CacheStatus {
  const age = Date.now() - fetchedAt;
  if (age < CACHE_FRESH_MS) return 'fresh';
  if (age < CACHE_STALE_MS) return 'stale';
  return 'expired';
}

export function getCachedEntry(location: string): AQICacheEntry | null {
  const key = _cacheKey(location);
  const entry = _cache.get(key);
  if (!entry) return null;
  // Recompute cache status on each read so it degrades over time
  entry.cacheStatus = _computeCacheStatus(entry.fetchedAt);
  return entry;
}

export function invalidateCache(location: string): void {
  _cache.delete(_cacheKey(location));
}

export function clearAllCache(): void {
  _cache.clear();
}

// ─── Fetch with cache ─────────────────────────────────────────────────────────
/**
 * Fetch AQI for a named location (city name or `@stationId`).
 *
 * Returns cached data if still fresh. Throws if the backend returns an error.
 * Pass `forceRefresh=true` to bypass the cache (e.g. user-triggered refresh).
 */
export async function fetchAQIWithCache(
  location: string,
  options: { forceRefresh?: boolean; signal?: AbortSignal } = {}
): Promise<AQICacheEntry> {
  const { forceRefresh = false, signal } = options;
  const key = _cacheKey(location);

  // Serve from cache if fresh and not force-refreshed
  if (!forceRefresh) {
    const cached = getCachedEntry(key);
    if (cached && cached.cacheStatus === 'fresh') return cached;
  }

  // Fetch from backend — may throw; callers handle errors
  const data = await fetchLiveAQI(location);

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const entry: AQICacheEntry = {
    data,
    fetchedAt: Date.now(),
    cacheStatus: 'fresh',
  };
  _cache.set(key, entry);
  return entry;
}

// ─── Station search with preset suggestions ───────────────────────────────────

/**
 * The 6 required preset city suggestions shown when the search input is empty.
 * These are search query suggestions only — not hardcoded measurement values.
 */
export const PRESET_CITY_SUGGESTIONS: CitySearchResult[] = [
  { query: 'jalandhar', label: 'Jalandhar', aqi: null, isPreset: true },
  { query: 'delhi',     label: 'Delhi',     aqi: null, isPreset: true },
  { query: 'mumbai',    label: 'Mumbai',    aqi: null, isPreset: true },
  { query: 'bengaluru', label: 'Bengaluru', aqi: null, isPreset: true },
  { query: 'kolkata',   label: 'Kolkata',   aqi: null, isPreset: true },
  { query: 'lucknow',   label: 'Lucknow',   aqi: null, isPreset: true },
];

/**
 * Search for stations matching `query`.
 * Maps raw WAQI results to `CitySearchResult`, using `@{uid}` for precise lookup.
 */
export async function searchCities(query: string): Promise<CitySearchResult[]> {
  if (!query.trim()) return PRESET_CITY_SUGGESTIONS;

  const response: AQISearchResponse = await searchLocations(query);

  return response.results.map((r: StationSearchResult) => ({
    query: `@${r.station_id}`,
    label: r.station_name,
    aqi: r.aqi ?? null,
    isPreset: false,
  }));
}
