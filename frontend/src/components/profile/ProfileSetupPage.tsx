/**
 * ProfileSetupPage — Complete interactive household personalization center.
 *
 * Combines:
 *  - Demo persona presets (Commuter, Family with Young Children, Senior-Sensitive)
 *  - Natural language description AI extraction with user confirmation
 *  - Household member cards (adults, seniors, children ages, respiratory vulnerabilities)
 *  - Schedule editor (commute mode & duration, outdoor exercise timing, child play)
 *  - Indoor air environment & equipment settings (ventilation, kitchen exhaust, incense, purifiers)
 *  - Live local profile persistence and immediate synchronization with recommendations
 */

import React, { useState } from 'react';
import {
  Save,
  CheckCircle2,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { HouseholdProfile } from '../../types/profile';
import { PresetSelector } from './PresetSelector';
import { NaturalLanguageProfileCard } from './NaturalLanguageProfileCard';
import { HouseholdMembersCard } from './HouseholdMembersCard';
import { ScheduleEditorCard } from './ScheduleEditorCard';
import { IndoorConditionsCard } from './IndoorConditionsCard';
import { ParsedProfileSuggestion } from '../../services/profileService';

interface ProfileSetupPageProps {
  activeProfile: HouseholdProfile;
  activePresetId: string;
  onSelectPreset: (presetId: string) => void;
  onUpdateProfile: (updater: (prev: HouseholdProfile) => HouseholdProfile) => void;
  onSaveAs: (id: string, name: string) => void;
  onParseNL: (description: string) => Promise<void>;
  isParsingNL: boolean;
  nlParseError: string | null;
  parsedSuggestion: ParsedProfileSuggestion | null;
  onConfirmParsed: () => void;
  onDiscardParsed: () => void;
  isRecalculating?: boolean;
}

export const ProfileSetupPage: React.FC<ProfileSetupPageProps> = ({
  activeProfile,
  activePresetId,
  onSelectPreset,
  onUpdateProfile,
  onSaveAs,
  onParseNL,
  isParsingNL,
  nlParseError,
  parsedSuggestion,
  onConfirmParsed,
  onDiscardParsed,
  isRecalculating = false,
}) => {
  const [customName, setCustomName] = useState(activeProfile.profile_name || 'My Household');
  const [showSaveToast, setShowSaveToast] = useState(false);

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    if (customName.trim()) {
      onUpdateProfile((prev) => ({
        ...prev,
        profile_name: customName.trim(),
      }));
      setShowSaveToast(true);
      setTimeout(() => setShowSaveToast(false), 2500);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Top Overview Banner ── */}
      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-vayu-700 bg-vayu-50 border border-vayu-200 px-2.5 py-0.5 rounded-full">
                Personalization Engine
              </span>
              {isRecalculating && (
                <span className="text-[11px] font-semibold text-vayu-700 animate-pulse">
                  ● Re-calculating Exposure Risk…
                </span>
              )}
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 mt-1">
              Household Exposure Profile
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 max-w-2xl leading-relaxed">
              VayuSense rejects one-size-fits-all AQI advice. Your family's respiratory sensitivities, commute mode,
              exercise timing, and kitchen habits modulate both the deterministic 0–100 risk score and AI routine.
            </p>
          </div>

          {/* Profile Name & Save Field */}
          <form onSubmit={handleSaveName} className="flex items-center gap-2 self-start md:self-auto">
            <label htmlFor="household-name-input" className="sr-only">
              Household Name
            </label>
            <input
              id="household-name-input"
              aria-label="Household profile name"
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Household Name"
              className="text-xs font-semibold text-slate-800 px-3 py-2 rounded-xl border border-slate-300 bg-white placeholder:text-slate-500 focus:outline-none focus:border-vayu-600 shadow-inner w-44"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors shadow-sm"
              title="Save profile name"
            >
              <Save className="w-3.5 h-3.5" aria-hidden="true" />
              Save
            </button>
          </form>
        </div>

        {/* Privacy & local storage guarantee banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-600 bg-emerald-50/60 px-3.5 py-2.5 rounded-xl border border-emerald-200/70 gap-2">
          <span className="flex items-center gap-2 font-medium text-emerald-900">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              <strong>Private & Local:</strong> Household inputs & health sensitivities remain encrypted in your browser's local storage and are never stored on tracking servers.
            </span>
          </span>
          <span className="text-[11px] text-emerald-800 font-mono bg-emerald-100/70 px-2 py-0.5 rounded shrink-0 self-start sm:self-auto">
            Zero Server Retention
          </span>
        </div>

        {/* Live sync notification banner */}
        <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200/70">
          <span className="flex items-center gap-1.5 font-medium">
            <Info className="w-4 h-4 text-vayu-600 shrink-0" />
            Any parameter changes below immediately update your active exposure assessment & routine recommendations.
          </span>
          {showSaveToast && (
            <span role="status" aria-live="polite" className="text-emerald-700 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              Saved to local store
            </span>
          )}
        </div>
      </div>

      {/* ── Section 1: 3 Selectable Demo Personas ── */}
      <PresetSelector
        activePresetId={activePresetId}
        onSelectPreset={onSelectPreset}
      />

      {/* ── Section 2: Natural Language Description Parser ── */}
      <NaturalLanguageProfileCard
        onParse={onParseNL}
        isParsing={isParsingNL}
        parseError={nlParseError}
        parsedSuggestion={parsedSuggestion}
        onConfirm={onConfirmParsed}
        onDiscard={onDiscardParsed}
      />

      {/* ── Section 3: Household Members & Sensitivities ── */}
      <HouseholdMembersCard
        profile={activeProfile}
        onChange={onUpdateProfile}
      />

      {/* ── Section 4: Daily Schedule & Exposure Timing ── */}
      <ScheduleEditorCard
        profile={activeProfile}
        onChange={onUpdateProfile}
      />

      {/* ── Section 5: Indoor Conditions & Appliances ── */}
      <IndoorConditionsCard
        profile={activeProfile}
        onChange={onUpdateProfile}
      />
    </div>
  );
};
