/**
 * PresetSelector — 3 selectable demo personas:
 * 1. Commuter household (two working adults, two-wheeler commute, rush-hour exposure)
 * 2. Family with young children (two adults, 5-yr child, outdoor evening play, home cooking)
 * 3. Senior-sensitive household (older adult, asthma sensitivity, morning walks, limited mobility)
 *
 * Populates realistic profile inputs and allows subsequent manual customization.
 */

import React from 'react';
import { Briefcase, Baby, HeartPulse, Check, Sparkles } from 'lucide-react';

interface PresetSelectorProps {
  activePresetId: string;
  onSelectPreset: (presetId: string) => void;
  isModified?: boolean;
}

const PRESET_CARDS = [
  {
    id: 'daily_commuter',
    title: 'Commuter Household',
    subtitle: 'Two Working Adults',
    icon: Briefcase,
    color: 'from-blue-500/10 to-indigo-500/10 border-blue-200 text-blue-700',
    activeBadge: 'bg-blue-600',
    highlights: ['Two-wheeler commute (45 min)', 'Morning/evening rush hour', 'Peak exhaust exposure'],
    impact: 'Elevates in-transit exposure score (+7 pts); recommends N95 & AC transit swaps.',
  },
  {
    id: 'family',
    title: 'Family with Young Children',
    subtitle: 'Two Adults + 5-yr Child',
    icon: Baby,
    color: 'from-amber-500/10 to-orange-500/10 border-amber-200 text-amber-700',
    activeBadge: 'bg-amber-600',
    highlights: ['5-year-old child', 'After-school outdoor play', 'Dinner cooked at 8 PM'],
    impact: 'Triggers child vulnerability multiplier & alerts to reschedule evening park play indoors.',
  },
  {
    id: 'senior_sensitive',
    title: 'Senior-Sensitive Household',
    subtitle: 'Older Adult + Asthma',
    icon: HeartPulse,
    color: 'from-rose-500/10 to-pink-500/10 border-rose-200 text-rose-700',
    activeBadge: 'bg-rose-600',
    highlights: ['Senior (Age 68)', 'Asthma & respiratory vulnerability', 'Early morning walk habit'],
    impact: 'Max demographic multiplier (×1.4); flags early morning inversion risk & advises indoor yoga.',
  },
];

export const PresetSelector: React.FC<PresetSelectorProps> = ({
  activePresetId,
  onSelectPreset,
  isModified = false,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-vayu-600" />
            Selectable Demo Personas
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Choose a representative Indian household persona or customize individual inputs below
          </p>
        </div>
        {isModified && (
          <span className="self-start sm:self-auto text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full">
            ● Custom edits applied to active profile
          </span>
        )}
      </div>

      <div role="radiogroup" aria-label="Selectable household demo personas" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PRESET_CARDS.map((preset, idx) => {
          const Icon = preset.icon;
          const isSelected = activePresetId === preset.id;

          const handleKeyDown = (e: React.KeyboardEvent) => {
            let nextIndex = idx;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              nextIndex = (idx + 1) % PRESET_CARDS.length;
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              nextIndex = (idx - 1 + PRESET_CARDS.length) % PRESET_CARDS.length;
            } else if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              onSelectPreset(preset.id);
              return;
            } else {
              return;
            }
            const nextPreset = PRESET_CARDS[nextIndex];
            onSelectPreset(nextPreset.id);
            document.getElementById(`preset-radio-${nextPreset.id}`)?.focus();
          };

          return (
            <button
              id={`preset-radio-${preset.id}`}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onKeyDown={handleKeyDown}
              key={preset.id}
              onClick={() => onSelectPreset(preset.id)}
              className={`relative rounded-2xl p-4 text-left border transition-all flex flex-col justify-between ${
                isSelected
                  ? 'border-slate-900 bg-white ring-2 ring-slate-900 shadow-md'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
                    <Icon className="w-5 h-5 text-vayu-700" />
                  </div>
                  {isSelected ? (
                    <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-900 text-white">
                      <Check className="w-3 h-3" />
                      Active
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400 font-medium">Click to Load</span>
                  )}
                </div>

                <h4 className="text-sm font-bold text-slate-900">{preset.title}</h4>
                <p className="text-xs text-slate-500 mb-3">{preset.subtitle}</p>

                <div className="space-y-1 mb-3">
                  {preset.highlights.map((h, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-vayu-500 shrink-0" />
                      <span className="truncate">{h}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-100 mt-2">
                <p className="text-[10px] text-slate-500 leading-relaxed italic">
                  <strong>Impact:</strong> {preset.impact}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
