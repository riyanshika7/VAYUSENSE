/**
 * NaturalLanguageProfileCard — AI-assisted household setup from free-form text.
 *
 * Workflow:
 *  1. User enters free text describing their home, family, daily commute, and appliances.
 *  2. Backend parses the description using Gemini (or returns fallback prompt if not configured).
 *  3. Confirmation panel shows detected parameters before touching the user's active profile.
 *  4. User clicks "Confirm & Apply" to merge the detected fields into their profile.
 */

import React, { useState } from 'react';
import {
  Wand2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { ParsedProfileSuggestion } from '../../services/profileService';

interface NaturalLanguageProfileCardProps {
  onParse: (text: string) => Promise<void>;
  isParsing: boolean;
  parseError: string | null;
  parsedSuggestion: ParsedProfileSuggestion | null;
  onConfirm: () => void;
  onDiscard: () => void;
}

const SAMPLE_PROMPTS = [
  'Two adults in Gurgaon commuting 40 min by scooter, 6-year-old child who plays in society park around 5 PM, kitchen chimney installed, no air purifier.',
  'Retired couple in South Delhi, one senior with asthma, daily 6 AM park walk, sealed flat with 2 HEPA purifiers, no incense.',
  'Family of 3: working mother takes AC Metro, father works outdoors, 10-year-old girl with dust allergy, cooks dinner with gas stove, partial window ventilation.',
];

export const NaturalLanguageProfileCard: React.FC<NaturalLanguageProfileCardProps> = ({
  onParse,
  isParsing,
  parseError,
  parsedSuggestion,
  onConfirm,
  onDiscard,
}) => {
  const [description, setDescription] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length >= 10) {
      await onParse(description.trim());
    }
  };

  const handleUseSample = (sample: string) => {
    setDescription(sample);
  };

  const suggestion = parsedSuggestion?.suggested_fields;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-vayu-50/70 via-white to-slate-50/90 border border-vayu-200/80 shadow-sm p-5 space-y-4">
      {/* Header with expand toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-vayu-600 text-white shadow-sm">
            <Wand2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              Natural Language Household Description
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-vayu-100 text-vayu-800">
                AI Powered
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Type or paste your household routine; Gemini will extract profile fields for your confirmation
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls="nl-profile-form"
          onClick={() => setIsOpen(!isOpen)}
          className="self-start sm:self-auto text-xs font-semibold text-vayu-800 hover:text-vayu-900 underline"
        >
          {isOpen ? 'Collapse' : 'Describe in Natural Language'}
        </button>
      </div>

      {isOpen && (
        <form id="nl-profile-form" onSubmit={handleExtract} className="space-y-3 pt-2">
          {/* Quick-fill sample chips */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-vayu-600" aria-hidden="true" />
              Try a sample household:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_PROMPTS.map((sample, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => handleUseSample(sample)}
                  className="text-left text-[11px] px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-vayu-400 hover:bg-vayu-50/50 transition-colors max-w-full truncate"
                  title={sample}
                >
                  "{sample.slice(0, 50)}…"
                </button>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <div className="relative">
            <label htmlFor="nl-profile-textarea" className="sr-only">
              Household description in natural language
            </label>
            <textarea
              id="nl-profile-textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your household: occupants, ages, commute mode & duration, outdoor exercise timing, kitchen exhaust, air purifiers, and health sensitivities..."
              className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-xl p-3 placeholder:text-slate-500 focus:outline-none focus:border-vayu-600 focus:ring-1 focus:ring-vayu-600 shadow-inner resize-none"
            />
          </div>

          {parseError && (
            <div role="alert" className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{parseError}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-[11px] text-slate-500">
              No fields are modified until you review and confirm the detected parameters.
            </p>
            <button
              type="submit"
              disabled={isParsing || description.trim().length < 10}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 active:scale-95 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isParsing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Extracting Fields…
                </>
              ) : (
                <>
                  <Wand2 className="w-3.5 h-3.5" />
                  Extract Profile Fields
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* ── User Confirmation Panel ── */}
      {parsedSuggestion && suggestion && (
        <div className="rounded-xl bg-white border-2 border-vayu-500 shadow-md p-4 space-y-3.5 animate-in fade-in duration-300">
          <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Review Detected Profile Parameters
                </h4>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {parsedSuggestion.message} ({Math.round(parsedSuggestion.suggested_fields.confidence * 100)}% detection confidence)
              </p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
              User Confirmation Required
            </span>
          </div>

          {/* Extracted fields grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            {suggestion.num_adults !== undefined && (
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-500 block">Adults</span>
                <strong className="text-slate-800">{suggestion.num_adults}</strong>
              </div>
            )}
            {suggestion.children_ages && suggestion.children_ages.length > 0 && (
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-500 block">Children Ages</span>
                <strong className="text-slate-800">{suggestion.children_ages.join(', ')} yrs</strong>
              </div>
            )}
            {suggestion.num_older_adults !== undefined && (
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-500 block">Seniors (60+)</span>
                <strong className="text-slate-800">{suggestion.num_older_adults}</strong>
              </div>
            )}
            {suggestion.has_asthma_or_respiratory_vulnerability !== undefined && (
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-500 block">Asthma / Vulnerability</span>
                <strong className={suggestion.has_asthma_or_respiratory_vulnerability ? 'text-rose-700' : 'text-slate-800'}>
                  {suggestion.has_asthma_or_respiratory_vulnerability ? 'Yes (Reported)' : 'None'}
                </strong>
              </div>
            )}
            {suggestion.primary_commute_mode && (
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-500 block">Commute Mode</span>
                <strong className="text-slate-800 capitalize">
                  {suggestion.primary_commute_mode.replace('_', ' ')}
                  {suggestion.commute_minutes ? ` (${suggestion.commute_minutes}m)` : ''}
                </strong>
              </div>
            )}
            {suggestion.participates_in_outdoor_exercise !== undefined && (
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-500 block">Outdoor Exercise</span>
                <strong className="text-slate-800 capitalize">
                  {suggestion.participates_in_outdoor_exercise
                    ? `${suggestion.exercise_time_of_day?.replace('_', ' ') || 'Yes'}`
                    : 'None'}
                </strong>
              </div>
            )}
            {suggestion.has_kitchen_exhaust !== undefined && (
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-500 block">Kitchen Chimney</span>
                <strong className="text-slate-800">
                  {suggestion.has_kitchen_exhaust ? 'Installed' : 'Missing'}
                </strong>
              </div>
            )}
            {suggestion.has_air_purifier !== undefined && (
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-500 block">Air Purifier</span>
                <strong className="text-slate-800">
                  {suggestion.has_air_purifier ? `Yes (${suggestion.purifier_count || 1} unit)` : 'None'}
                </strong>
              </div>
            )}
          </div>

          {suggestion.extraction_notes && (
            <p className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
              <strong>AI Notes:</strong> {suggestion.extraction_notes}
            </p>
          )}

          {/* Action confirmation buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onDiscard}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 active:scale-95 transition-all shadow-sm"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Confirm & Apply to Profile
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
