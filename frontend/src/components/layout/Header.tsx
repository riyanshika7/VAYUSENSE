/**
 * Header — sticky top bar with:
 *  - Live city/station search combobox (debounced WAQI search via backend)
 *  - 6 preset city suggestions (Jalandhar, Delhi, Mumbai, Bengaluru, Kolkata, Lucknow)
 *    shown when input is empty; these are search SUGGESTIONS, not hardcoded measurements
 *  - Profile preset selector
 *  - Refresh AQI button with spinner
 *  - Last-fetched age display
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MapPin,
  RefreshCw,
  Search,
  Calendar,
  UserCheck,
  Menu,
  X,
  Loader2,
  Clock,
  Wifi,
  WifiOff,
  AlertTriangle,
} from 'lucide-react';
import { HouseholdProfile } from '../../types/profile';
import { searchCities, PRESET_CITY_SUGGESTIONS, type CitySearchResult } from '../../services/aqiService';
import type { LocationSelection } from '../../types/aqi';

export type { LocationSelection };

interface HeaderProps {
  currentLocation: LocationSelection;
  onLocationChange: (selection: LocationSelection) => void;
  selectedPreset: string;
  onPresetChange: (presetKey: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
  isRefreshing: boolean;
  isBackendConnected: boolean;
  lastFetched: Date | null;
  onOpenMobileMenu: () => void;
  profiles: Record<string, HouseholdProfile>;
  isDemoMode?: boolean;
  onToggleDemoMode?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatLastFetched(date: Date | null): string {
  if (!date) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin === 1) return '1 min ago';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  return diffHr === 1 ? '1 hr ago' : `${diffHr} hrs ago`;
}

function getAqiBadgeColor(aqi: number | null): string {
  if (aqi === null) return 'bg-slate-100 text-slate-600';
  if (aqi <= 50) return 'bg-emerald-100 text-emerald-700';
  if (aqi <= 100) return 'bg-amber-100 text-amber-700';
  if (aqi <= 150) return 'bg-orange-100 text-orange-700';
  if (aqi <= 200) return 'bg-rose-100 text-rose-700';
  return 'bg-purple-100 text-purple-800';
}

// ─── Component ────────────────────────────────────────────────────────────────
export const Header: React.FC<HeaderProps> = ({
  currentLocation,
  onLocationChange,
  selectedPreset,
  onPresetChange,
  onRefresh,
  isLoading,
  isRefreshing,
  isBackendConnected,
  lastFetched,
  onOpenMobileMenu,
  profiles,
  isDemoMode,
  onToggleDemoMode,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CitySearchResult[]>(PRESET_CITY_SUGGESTIONS);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerBtnRef = useRef<HTMLButtonElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Format today's date in Indian locale
  const formattedDate = new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date());

  // ── Close dropdown on outside click ────────────────────────────────────────
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // ── Debounced search ────────────────────────────────────────────────────────
  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    setSearchError(null);
    setActiveIndex(-1);
    clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setSearchResults(PRESET_CITY_SUGGESTIONS);
      setIsSearching(false);
      return;
    }

    if (value.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchCities(value.trim());
        setSearchResults(results);
        if (results.length === 0) setSearchError('No stations found. Try another name.');
      } catch {
        setSearchError('Search unavailable — check backend connection.');
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);
  }, []);

  // ── Open search panel ───────────────────────────────────────────────────────
  const handleOpenDropdown = () => {
    setIsDropdownOpen(true);
    setSearchQuery('');
    setSearchResults(PRESET_CITY_SUGGESTIONS);
    setSearchError(null);
    setActiveIndex(-1);
    // Focus input on next tick
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ── Select a city/station ───────────────────────────────────────────────────
  const handleSelect = (result: CitySearchResult) => {
    onLocationChange({ query: result.query, label: result.label });
    setIsDropdownOpen(false);
    setSearchQuery('');
    setActiveIndex(-1);
  };

  // ── Keyboard: Escape closes dropdown, ArrowDown/Up moves, Enter selects ───
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsDropdownOpen(false);
      triggerBtnRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (searchResults.length > 0) {
        setActiveIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (searchResults.length > 0) {
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
      }
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < searchResults.length && searchResults[activeIndex]) {
        e.preventDefault();
        handleSelect(searchResults[activeIndex]);
      }
    }
  };

  const isBusy = isLoading || isRefreshing;

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 lg:px-8 py-3">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">

        {/* ── Left: mobile menu + location picker + date ── */}
        <div className="flex items-center gap-3">

          {/* Mobile hamburger */}
          <button
            id="mobile-menu-trigger"
            onClick={onOpenMobileMenu}
            className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* ── Location combobox ── */}
          <div ref={dropdownRef} className="relative">

            {/* Trigger pill */}
            <button
              ref={triggerBtnRef}
              type="button"
              onClick={handleOpenDropdown}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100/80 border border-slate-200 text-sm font-medium text-slate-800 hover:bg-slate-200/60 transition-colors max-w-[220px]"
              aria-haspopup="dialog"
              aria-expanded={isDropdownOpen}
              aria-controls="location-search-dropdown"
              aria-label={`Change monitoring location. Current: ${currentLocation.label}`}
              title="Change monitoring location"
            >
              <MapPin className="w-4 h-4 text-vayu-700 shrink-0" />
              <span className="truncate">{currentLocation.label}</span>
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-auto" />
            </button>

            {/* Dropdown panel */}
            {isDropdownOpen && (
              <div
                id="location-search-dropdown"
                role="region"
                aria-label="Location search"
                className="absolute top-full left-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50"
              >

                {/* Search input */}
                <div className="p-3 border-b border-slate-100">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus-within:border-vayu-500 focus-within:bg-white transition-colors">
                    {isSearching
                      ? <Loader2 className="w-4 h-4 text-vayu-600 animate-spin shrink-0" />
                      : <Search className="w-4 h-4 text-slate-400 shrink-0" />
                    }
                    <label htmlFor="city-search-input" className="sr-only">
                      Search city or monitoring station
                    </label>
                    <input
                      id="city-search-input"
                      ref={inputRef}
                      type="text"
                      role="combobox"
                      aria-expanded={isDropdownOpen}
                      aria-autocomplete="list"
                      aria-controls="city-search-listbox"
                      aria-activedescendant={
                        activeIndex >= 0 && activeIndex < searchResults.length
                          ? `city-option-${activeIndex}`
                          : undefined
                      }
                      value={searchQuery}
                      onChange={e => handleSearchInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Search city or station…"
                      className="flex-1 text-sm bg-transparent border-none outline-none text-slate-800 placeholder:text-slate-500"
                      autoComplete="off"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => handleSearchInput('')}
                        aria-label="Clear search query"
                        className="text-slate-500 hover:text-slate-700"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Results list */}
                <div role="region" aria-label="Search results" className="max-h-72 overflow-y-auto">
                  {/* Section label */}
                  <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-50">
                    {!searchQuery.trim()
                      ? 'Suggested Cities'
                      : searchResults.length > 0
                        ? `${searchResults.length} station${searchResults.length !== 1 ? 's' : ''} found`
                        : 'Search Results'
                    }
                  </div>

                  {searchError && (
                    <div role="alert" className="flex items-center gap-2 px-4 py-3 text-xs text-amber-700 bg-amber-50">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      {searchError}
                    </div>
                  )}

                  {!searchError && searchResults.length === 0 && !isSearching && searchQuery.trim().length >= 2 && (
                    <div className="px-4 py-3 text-xs text-slate-500 italic">
                      No matching stations found.
                    </div>
                  )}

                  <ul id="city-search-listbox" role="listbox" aria-label="Available locations">
                    {searchResults.map((result, idx) => {
                      const isSelected = result.query === currentLocation.query;
                      const isFocused = activeIndex === idx;
                      return (
                        <li
                          id={`city-option-${idx}`}
                          key={`${result.query}-${idx}`}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleSelect(result)}
                          className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer hover:bg-slate-50 ${
                            isFocused ? 'bg-vayu-100 text-vayu-950 ring-1 ring-inset ring-vayu-500' : isSelected ? 'bg-vayu-50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <MapPin className={`w-3.5 h-3.5 shrink-0 ${result.isPreset ? 'text-vayu-600' : 'text-slate-400'}`} aria-hidden="true" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">
                                {result.label}
                              </p>
                              {!result.isPreset && (
                                <p className="text-[10px] text-slate-600 font-mono">{result.query}</p>
                              )}
                            </div>
                          </div>
                          {result.aqi !== null && (
                            <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full shrink-0 ${getAqiBadgeColor(result.aqi)}`}>
                              {result.aqi}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Footer note */}
                <div className="px-4 py-2 text-[10px] text-slate-500 border-t border-slate-100 bg-slate-50/50">
                  Station data via WAQI · Measurements fetched live from backend
                </div>
              </div>
            )}
          </div>

          {/* Date badge */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 font-medium px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{formattedDate}</span>
          </div>
        </div>

        {/* ── Right: status + profile + refresh ── */}
        <div className="flex items-center justify-between md:justify-end gap-3">

          {/* Demo Mode Toggle / Badge */}
          {onToggleDemoMode && (
            <button
              type="button"
              onClick={onToggleDemoMode}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                isDemoMode
                  ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-sm'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
              title={isDemoMode ? "Currently showing DEMO DATA. Click to switch to live readings." : "Click to test offline DEMO DATA."}
            >
              <span className={`w-2 h-2 rounded-full ${isDemoMode ? 'bg-amber-600 animate-pulse' : 'bg-emerald-500'}`} />
              <span className="text-[11px] font-bold">{isDemoMode ? 'DEMO MODE' : 'LIVE'}</span>
            </button>
          )}

          {/* Backend connection indicator + last-fetched age */}
          <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500">
            {isBackendConnected
              ? <Wifi className="w-3.5 h-3.5 text-emerald-500" />
              : <WifiOff className="w-3.5 h-3.5 text-rose-500" />
            }
            {lastFetched && !isBusy && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatLastFetched(lastFetched)}
              </span>
            )}
            {isBusy && (
              <span className="text-vayu-700 font-medium animate-pulse">Updating…</span>
            )}
          </div>

          {/* Profile preset selector */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100/80 border border-slate-200">
            <UserCheck className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="text-xs text-slate-500 hidden sm:inline">Profile:</span>
            <select
              value={selectedPreset}
              onChange={e => onPresetChange(e.target.value)}
              className="bg-transparent border-none text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
              aria-label="Household profile preset"
            >
              {Object.keys(profiles).length > 0 ? (
                Object.entries(profiles).map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.profile_name || id.replace('_', ' ')}
                  </option>
                ))
              ) : (
                <>
                  <option value="daily_commuter">Two-Wheeler Commuters</option>
                  <option value="family">Family (Child: Age 5)</option>
                  <option value="senior_sensitive">Senior (Asthma Sensitivity)</option>
                </>
              )}
            </select>
          </div>

          {/* Refresh AQI button */}
          <button
            onClick={onRefresh}
            disabled={isBusy}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 active:scale-95 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh air quality measurements from WAQI"
            aria-label="Refresh air quality measurements from WAQI"
            aria-busy={isBusy}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh AQI</span>
          </button>
        </div>

      </div>
    </header>
  );
};
