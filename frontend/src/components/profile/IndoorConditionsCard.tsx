/**
 * IndoorConditionsCard — Home ventilation, cooking exhaust, and filtration editor.
 *
 * Configures:
 *  - Ventilation status: sealed AC, partially open, naturally ventilated, poorly ventilated
 *  - Kitchen exhaust / chimney: captures oil aerosols and cooking combustion products
 *  - Indoor combustion: incense (agarbatti), dhoop, mosquito coils (high internal PM2.5 source)
 *  - Air purifiers: count, bedroom placement, continuous operation
 */

import React from 'react';
import {
  Wind,
  Flame,
  Fan,
  Sparkles,
  Home,
} from 'lucide-react';
import { HouseholdProfile, VentilationCondition } from '../../types/profile';

interface IndoorConditionsCardProps {
  profile: HouseholdProfile;
  onChange: (updater: (prev: HouseholdProfile) => HouseholdProfile) => void;
}

const VENTILATION_OPTIONS: { id: VentilationCondition; label: string; desc: string; impact: string }[] = [
  {
    id: 'sealed_ac',
    label: 'Sealed with AC',
    desc: 'Windows kept closed; central or split air conditioning running.',
    impact: '-2.0 pts (Good barrier against outdoor aerosol penetration)',
  },
  {
    id: 'partially_open',
    label: 'Partially Open',
    desc: 'Windows opened intermittently during midday hours for air exchange.',
    impact: 'Neutral (Balancing fresh air vs ambient particulate intake)',
  },
  {
    id: 'naturally_ventilated',
    label: 'Naturally Ventilated',
    desc: 'Balcony doors or multiple windows kept open throughout day and night.',
    impact: '+3.0 pts (Ambient smog enters directly into living spaces)',
  },
  {
    id: 'poorly_ventilated',
    label: 'Poorly Ventilated Enclosure',
    desc: 'Lacks cross-ventilation; traps internal cooking smoke and dust indoors.',
    impact: '+5.0 pts (Traps indoor combustion aerosols for hours)',
  },
];

export const IndoorConditionsCard: React.FC<IndoorConditionsCardProps> = ({
  profile,
  onChange,
}) => {
  const cooking = profile.cooking_habits;
  const purifier = profile.purifier_setup;

  return (
    <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm p-6 space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-slate-100">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
          <Home className="w-4 h-4 text-vayu-600" />
          Indoor Air Environment & Appliances
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Modulates the exposure score (-10 to +15 pts) based on indoor sources and filtration capacity
        </p>
      </div>

      {/* ── 1. Ventilation Selection ── */}
      <div className="space-y-3">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <Wind className="w-4 h-4 text-vayu-600" />
          Home Building Envelope & Ventilation Mode
        </label>

        <div role="radiogroup" aria-label="Home building envelope and ventilation mode" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {VENTILATION_OPTIONS.map((opt, idx) => {
            const isSelected = profile.ventilation === opt.id;

            const handleKeyDown = (e: React.KeyboardEvent) => {
              let nextIndex = idx;
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                nextIndex = (idx + 1) % VENTILATION_OPTIONS.length;
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                nextIndex = (idx - 1 + VENTILATION_OPTIONS.length) % VENTILATION_OPTIONS.length;
              } else if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                onChange((prev) => ({ ...prev, ventilation: opt.id }));
                return;
              } else {
                return;
              }
              const nextOpt = VENTILATION_OPTIONS[nextIndex];
              onChange((prev) => ({ ...prev, ventilation: nextOpt.id }));
              document.getElementById(`vent-radio-${nextOpt.id}`)?.focus();
            };

            return (
              <button
                id={`vent-radio-${opt.id}`}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onKeyDown={handleKeyDown}
                key={opt.id}
                onClick={() =>
                  onChange((prev) => ({
                    ...prev,
                    ventilation: opt.id,
                  }))
                }
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold">{opt.label}</span>
                  {isSelected && (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-white/20 text-white">
                      Selected
                    </span>
                  )}
                </div>
                <p className={`text-[11px] leading-snug mb-1.5 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                  {opt.desc}
                </p>
                <p className={`text-[10px] font-mono ${isSelected ? 'text-emerald-300' : 'text-slate-600'}`}>
                  {opt.impact}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. Cooking Exhaust & Incense ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
        {/* Kitchen Chimney */}
        <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors bg-slate-50/50">
          <input
            type="checkbox"
            checked={cooking.has_kitchen_exhaust_or_chimney}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                cooking_habits: {
                  ...prev.cooking_habits,
                  has_kitchen_exhaust_or_chimney: e.target.checked,
                },
              }))
            }
            className="mt-0.5 w-4 h-4 rounded text-vayu-600 focus:ring-vayu-500 border-slate-300"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <Fan className="w-3.5 h-3.5 text-vayu-600" />
              <span className="text-xs font-bold text-slate-900">
                Kitchen Exhaust Fan or Chimney
              </span>
            </div>
            <span className="text-[11px] text-slate-500 block leading-snug mt-1">
              Active mechanical exhaust captures tadka and oil aerosol bursts before spreading through the house.
            </span>
          </div>
        </label>

        {/* Incense / Coils */}
        <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors bg-slate-50/50">
          <input
            type="checkbox"
            checked={cooking.uses_indoor_incense_or_coils}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                cooking_habits: {
                  ...prev.cooking_habits,
                  uses_indoor_incense_or_coils: e.target.checked,
                },
              }))
            }
            className="mt-0.5 w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-rose-500" />
              <span className="text-xs font-bold text-slate-900">
                Incense (Agarbatti) / Mosquito Coils Indoors
              </span>
            </div>
            <span className="text-[11px] text-slate-500 block leading-snug mt-1">
              Smoldering materials release severe internal PM2.5 bursts. Adds +6.0 risk penalty points.
            </span>
          </div>
        </label>
      </div>

      {/* ── 3. Air Purifier Setup ── */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-vayu-700" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              HEPA Air Purifier Setup
            </h4>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={purifier.has_air_purifier}
              onChange={(e) =>
                onChange((prev) => ({
                  ...prev,
                  purifier_setup: {
                    ...prev.purifier_setup,
                    has_air_purifier: e.target.checked,
                    purifier_count: e.target.checked ? Math.max(1, prev.purifier_setup.purifier_count) : 0,
                  },
                }))
              }
              className="w-4 h-4 rounded text-vayu-600 focus:ring-vayu-500 border-slate-300"
            />
            <span>Purifier Available</span>
          </label>
        </div>

        {purifier.has_air_purifier ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            {/* Units Count */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Number of Working Units
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Decrease air purifier count"
                  onClick={() =>
                    onChange((prev) => ({
                      ...prev,
                      purifier_setup: {
                        ...prev.purifier_setup,
                        purifier_count: Math.max(1, prev.purifier_setup.purifier_count - 1),
                      },
                    }))
                  }
                  className="w-8 h-8 rounded-lg bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 flex items-center justify-center text-sm shadow-sm"
                >
                  -
                </button>
                <span className="font-mono text-lg font-extrabold text-slate-900 w-8 text-center">
                  {purifier.purifier_count}
                </span>
                <button
                  type="button"
                  aria-label="Increase air purifier count"
                  onClick={() =>
                    onChange((prev) => ({
                      ...prev,
                      purifier_setup: {
                        ...prev.purifier_setup,
                        purifier_count: prev.purifier_setup.purifier_count + 1,
                      },
                    }))
                  }
                  className="w-8 h-8 rounded-lg bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 flex items-center justify-center text-sm shadow-sm"
                >
                  +
                </button>
              </div>
            </div>

            {/* Bedroom Placement Toggle */}
            <label className="flex items-center gap-2.5 self-center cursor-pointer text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={purifier.located_in_bedrooms}
                onChange={(e) =>
                  onChange((prev) => ({
                    ...prev,
                    purifier_setup: {
                      ...prev.purifier_setup,
                      located_in_bedrooms: e.target.checked,
                    },
                  }))
                }
                className="w-4 h-4 rounded text-vayu-600 focus:ring-vayu-500 border-slate-300"
              />
              <span>Placed in Primary Bedroom (Sleeping micro-environment)</span>
            </label>

            {/* Continuous Operation Toggle */}
            <label className="flex items-center gap-2.5 self-center cursor-pointer text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={purifier.operates_continuously}
                onChange={(e) =>
                  onChange((prev) => ({
                    ...prev,
                    purifier_setup: {
                      ...prev.purifier_setup,
                      operates_continuously: e.target.checked,
                    },
                  }))
                }
                className="w-4 h-4 rounded text-vayu-600 focus:ring-vayu-500 border-slate-300"
              />
              <span>Runs continuously (instead of manual short bursts)</span>
            </label>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 italic">
            No air purifier in household. Recommendations will emphasize building envelope management and clean bedroom isolation.
          </p>
        )}
      </div>
    </div>
  );
};
