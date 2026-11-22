/**
 * useAQI — React hook for live AQI data fetching and state management.
 *
 * Status machine:
 *   idle → loading → success | error
 *                 ↘ stale   (data present but cache is ageing)
 *
 * The hook:
 *  - Reacts to changes in `location` prop (re-fetches automatically)
 *  - Respects the cache (no duplicate requests within CACHE_FRESH_MS)
 *  - Provides `refresh()` for user-triggered force-refresh
 *  - Auto-refreshes every AUTO_REFRESH_MS in the background
 *  - Cleans up abort controllers on unmount / location change
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { AQIResponse } from '../types/aqi';
import {
  fetchAQIWithCache,
  invalidateCache,
  getCachedEntry,
  type CacheStatus,
} from '../services/aqiService';

// ─── Types ────────────────────────────────────────────────────────────────────
export type AQIStatus = 'idle' | 'loading' | 'success' | 'stale' | 'error';

export interface UseAQIState {
  data: AQIResponse | null;
  status: AQIStatus;
  cacheStatus: CacheStatus | null;
  error: string | null;
  lastFetched: Date | null;
}

export interface UseAQIReturn extends UseAQIState {
  /** Force-refresh the current location, bypassing the cache. */
  refresh: () => void;
  /** True while a network request is in-flight (even when stale data is shown). */
  isRefreshing: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────
/** Background auto-refresh interval. */
const AUTO_REFRESH_MS = 10 * 60 * 1000; // 10 min

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAQI(location: string): UseAQIReturn {
  const [state, setState] = useState<UseAQIState>({
    data: null,
    status: 'idle',
    cacheStatus: null,
    error: null,
    lastFetched: null,
  });

  // Track whether a background refresh is happening while stale data is shown
  const [isRefreshing, setIsRefreshing] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const locationRef = useRef(location);
  locationRef.current = location;

  // ── Core fetch function ──────────────────────────────────────────────────
  const doFetch = useCallback(
    async (loc: string, forceRefresh = false) => {
      // Cancel any in-flight request for a previous location / refresh
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      if (forceRefresh) invalidateCache(loc);

      // If we already have cached data, show it while refreshing in background
      const existing = getCachedEntry(loc);
      if (existing) {
        setIsRefreshing(true);
        setState(prev => ({
          ...prev,
          status: existing.cacheStatus === 'stale' ? 'stale' : 'success',
          cacheStatus: existing.cacheStatus,
          error: null,
        }));
      } else {
        // No existing data — go straight to loading skeleton
        setState(prev => ({ ...prev, status: 'loading', error: null }));
      }

      try {
        const entry = await fetchAQIWithCache(loc, {
          forceRefresh,
          signal: abortRef.current.signal,
        });

        // Guard: skip state update if the location changed mid-flight
        if (locationRef.current !== loc && !forceRefresh) return;

        setState({
          data: entry.data,
          status: entry.cacheStatus === 'stale' ? 'stale' : 'success',
          cacheStatus: entry.cacheStatus,
          error: null,
          lastFetched: new Date(entry.fetchedAt),
        });
      } catch (err: unknown) {
        if ((err as DOMException)?.name === 'AbortError') return;

        const message =
          err instanceof Error ? err.message : 'Failed to fetch air quality data.';

        setState(prev => ({
          ...prev,
          // Keep showing old data if available; mark as error only when no data
          status: prev.data ? 'stale' : 'error',
          error: message,
        }));
      } finally {
        setIsRefreshing(false);
      }
    },
    [] // stable — uses refs for location
  );

  // ── React to location changes ──────────────────────────────────────────────
  useEffect(() => {
    if (!location) return;
    doFetch(location, false);

    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  // ── Background auto-refresh ────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      doFetch(locationRef.current, false);
    }, AUTO_REFRESH_MS);

    return () => clearInterval(timer);
  }, [doFetch]);

  // ── Public refresh (user-triggered) ────────────────────────────────────────
  const refresh = useCallback(() => {
    doFetch(locationRef.current, true);
  }, [doFetch]);

  return { ...state, refresh, isRefreshing };
}
