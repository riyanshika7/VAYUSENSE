/**
 * useProfile — React hook for household profile state management.
 *
 * Wraps profileService (localStorage) and exposes:
 *  - activeProfile: the currently selected HouseholdProfile
 *  - allProfiles: all stored profiles (builtins + user-saved)
 *  - activeId: current profile key
 *  - setActiveId: switch to a different profile → triggers recommendation refresh
 *  - updateProfile: edit and save the active profile
 *  - applyPreset: load a builtin preset as the active profile (editable copy)
 *  - parseDescription: NL→profile via backend AI (returns suggestion for confirmation)
 *  - applyParsedFields: merge confirmed suggestions into active profile
 */

import { useState, useCallback } from 'react';
import type { HouseholdProfile } from '../types/profile';
import {
  getAllProfiles,
  getActiveId,
  getActiveProfile,
  setActiveId,
  saveProfile,
  parseNLDescription,
  mergeParsedFields,
  BUILTIN_PRESETS,
  type ParsedProfileSuggestion,
} from '../services/profileService';

export interface UseProfileReturn {
  activeProfile: HouseholdProfile;
  allProfiles: Record<string, HouseholdProfile>;
  activeId: string;
  /** Switch to a different profile by ID. */
  switchProfile: (id: string) => void;
  /** Update a field on the active profile and persist. */
  updateProfile: (updater: (prev: HouseholdProfile) => HouseholdProfile) => void;
  /** Load a builtin preset into the active profile slot (makes it editable). */
  applyPreset: (presetId: string) => void;
  /** Save the current active profile under a new name / ID. */
  saveCurrentAs: (id: string, name: string) => void;

  /** NL description parsing state */
  isParsingNL: boolean;
  nlParseError: string | null;
  parsedSuggestion: ParsedProfileSuggestion | null;
  /** Trigger backend NL→profile parse. */
  parseDescription: (description: string) => Promise<void>;
  /** Accept the parsed suggestion and merge into active profile. */
  confirmParsedFields: () => void;
  /** Discard the parsed suggestion. */
  discardParsedFields: () => void;
}

export function useProfile(): UseProfileReturn {
  const [activeId, setActiveIdState] = useState<string>(getActiveId);
  const [allProfiles, setAllProfiles] = useState<Record<string, HouseholdProfile>>(getAllProfiles);
  const [activeProfile, setActiveProfile] = useState<HouseholdProfile>(getActiveProfile);

  // NL parse state
  const [isParsingNL, setIsParsingNL] = useState(false);
  const [nlParseError, setNlParseError] = useState<string | null>(null);
  const [parsedSuggestion, setParsedSuggestion] = useState<ParsedProfileSuggestion | null>(null);

  // ── Reload from storage ────────────────────────────────────────────────────
  const reload = useCallback(() => {
    setAllProfiles(getAllProfiles());
    setActiveProfile(getActiveProfile());
    setActiveIdState(getActiveId());
  }, []);

  // ── Switch profile ─────────────────────────────────────────────────────────
  const switchProfile = useCallback((id: string) => {
    setActiveId(id);
    reload();
  }, [reload]);

  // ── Update active profile ──────────────────────────────────────────────────
  const updateProfile = useCallback((updater: (prev: HouseholdProfile) => HouseholdProfile) => {
    setActiveProfile(prev => {
      const updated = updater(prev);
      saveProfile(activeId, updated);
      setAllProfiles(getAllProfiles());
      return updated;
    });
  }, [activeId]);

  // ── Apply builtin preset ───────────────────────────────────────────────────
  const applyPreset = useCallback((presetId: string) => {
    const preset = BUILTIN_PRESETS[presetId];
    if (!preset) return;
    // Switch to the builtin preset id directly (builtins are always in store)
    setActiveId(presetId);
    reload();
  }, [reload]);

  // ── Save current profile under new id ─────────────────────────────────────
  const saveCurrentAs = useCallback((id: string, name: string) => {
    const namedProfile = { ...activeProfile, profile_name: name };
    saveProfile(id, namedProfile);
    setActiveId(id);
    reload();
  }, [activeProfile, reload]);

  // ── NL description → profile parse ────────────────────────────────────────
  const parseDescription = useCallback(async (description: string) => {
    setIsParsingNL(true);
    setNlParseError(null);
    setParsedSuggestion(null);
    try {
      const result = await parseNLDescription(description);
      setParsedSuggestion(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Parse request failed.';
      setNlParseError(msg);
    } finally {
      setIsParsingNL(false);
    }
  }, []);

  const confirmParsedFields = useCallback(() => {
    if (!parsedSuggestion) return;
    updateProfile(prev => mergeParsedFields(prev, parsedSuggestion.suggested_fields));
    setParsedSuggestion(null);
  }, [parsedSuggestion, updateProfile]);

  const discardParsedFields = useCallback(() => {
    setParsedSuggestion(null);
    setNlParseError(null);
  }, []);

  return {
    activeProfile,
    allProfiles,
    activeId,
    switchProfile,
    updateProfile,
    applyPreset,
    saveCurrentAs,
    isParsingNL,
    nlParseError,
    parsedSuggestion,
    parseDescription,
    confirmParsedFields,
    discardParsedFields,
  };
}
