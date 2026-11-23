/**
 * HouseholdMembersCard — Interactive demographics and health vulnerability editor.
 *
 * Configures:
 *  - Adults (18–59)
 *  - Children with specific ages (influences biological lung development vulnerability)
 *  - Older adults (60+)
 *  - User-reported respiratory sensitivity & asthma
 *  - Outdoor physical workers
 *  - Mobility limitations
 */

import React, { useState } from 'react';
import {
  Users,
  Plus,
  X,
} from 'lucide-react';
import { HouseholdProfile } from '../../types/profile';

interface HouseholdMembersCardProps {
  profile: HouseholdProfile;
  onChange: (updater: (prev: HouseholdProfile) => HouseholdProfile) => void;
}

export const HouseholdMembersCard: React.FC<HouseholdMembersCardProps> = ({
  profile,
  onChange,
}) => {
  const [childAgeInput, setChildAgeInput] = useState('');

  const handleAddChild = (e: React.FormEvent) => {
    e.preventDefault();
    const age = parseInt(childAgeInput.trim(), 10);
    if (!isNaN(age) && age >= 0 && age <= 17) {
      onChange((prev) => ({
        ...prev,
        children_ages: [...prev.children_ages, age],
        has_outdoor_child_play: true, // child presence activates play schedule consideration
      }));
      setChildAgeInput('');
    }
  };

  const handleRemoveChild = (index: number) => {
    onChange((prev) => {
      const updated = prev.children_ages.filter((_, i) => i !== index);
      return {
        ...prev,
        children_ages: updated,
        has_outdoor_child_play: updated.length > 0 ? prev.has_outdoor_child_play : false,
      };
    });
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm p-6 space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-vayu-600" />
            Household Members & Health Sensitivities
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Demographic factors directly determine the biological vulnerability multiplier (1.00× to 1.45×)
          </p>
        </div>
      </div>

      {/* Member Count Steppers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Adults */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800">Adults (18–59)</label>
            <span className="text-[10px] text-slate-400">Working age</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Decrease adult count"
              onClick={() =>
                onChange((prev) => ({
                  ...prev,
                  num_adults: Math.max(0, prev.num_adults - 1),
                }))
              }
              className="w-8 h-8 rounded-lg bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 flex items-center justify-center text-sm shadow-sm"
            >
              -
            </button>
            <span className="font-mono text-xl font-extrabold text-slate-900 w-8 text-center">
              {profile.num_adults}
            </span>
            <button
              type="button"
              aria-label="Increase adult count"
              onClick={() =>
                onChange((prev) => ({
                  ...prev,
                  num_adults: prev.num_adults + 1,
                }))
              }
              className="w-8 h-8 rounded-lg bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 flex items-center justify-center text-sm shadow-sm"
            >
              +
            </button>
          </div>
          <p className="text-[10px] text-slate-400">Baseline biological exposure.</p>
        </div>

        {/* Older Adults / Seniors */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800">Seniors (60+)</label>
            <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
              High Risk
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Decrease seniors count"
              onClick={() =>
                onChange((prev) => ({
                  ...prev,
                  num_older_adults: Math.max(0, prev.num_older_adults - 1),
                }))
              }
              className="w-8 h-8 rounded-lg bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 flex items-center justify-center text-sm shadow-sm"
            >
              -
            </button>
            <span className="font-mono text-xl font-extrabold text-slate-900 w-8 text-center">
              {profile.num_older_adults}
            </span>
            <button
              type="button"
              aria-label="Increase seniors count"
              onClick={() =>
                onChange((prev) => ({
                  ...prev,
                  num_older_adults: prev.num_older_adults + 1,
                }))
              }
              className="w-8 h-8 rounded-lg bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 flex items-center justify-center text-sm shadow-sm"
            >
              +
            </button>
          </div>
          <p className="text-[10px] text-slate-400">Adds demographic vulnerability weight.</p>
        </div>

        {/* Outdoor Workers */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800">Outdoor Workers</label>
            <span className="text-[10px] text-slate-400">Field work</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Decrease outdoor workers count"
              onClick={() =>
                onChange((prev) => ({
                  ...prev,
                  num_outdoor_workers: Math.max(0, prev.num_outdoor_workers - 1),
                }))
              }
              className="w-8 h-8 rounded-lg bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 flex items-center justify-center text-sm shadow-sm"
            >
              -
            </button>
            <span className="font-mono text-xl font-extrabold text-slate-900 w-8 text-center">
              {profile.num_outdoor_workers}
            </span>
            <button
              type="button"
              aria-label="Increase outdoor workers count"
              onClick={() =>
                onChange((prev) => ({
                  ...prev,
                  num_outdoor_workers: prev.num_outdoor_workers + 1,
                }))
              }
              className="w-8 h-8 rounded-lg bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 flex items-center justify-center text-sm shadow-sm"
            >
              +
            </button>
          </div>
          <p className="text-[10px] text-slate-400">Increases duration exposure points.</p>
        </div>
      </div>

      {/* Children Section */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              Children & Minors (Age 0–17)
              <span className="text-[10px] font-normal text-slate-500">
                ({profile.children_ages.length} registered)
              </span>
            </label>
            <p className="text-[11px] text-slate-500">
              Developing lungs inhale more air per kg of body mass than adults.
            </p>
          </div>

          {/* Add child form */}
          <form onSubmit={handleAddChild} className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="17"
              value={childAgeInput}
              onChange={(e) => setChildAgeInput(e.target.value)}
              placeholder="Age (e.g. 5)"
              aria-label="Child age in years (0 to 17)"
              className="w-24 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white focus:outline-none focus:border-vayu-600"
            />
            <button
              type="submit"
              disabled={!childAgeInput.trim()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Add Child
            </button>
          </form>
        </div>

        {/* Child age tag pills */}
        {profile.children_ages.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {profile.children_ages.map((age, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-900 border border-amber-200"
              >
                Child {idx + 1}: <strong>{age} yrs</strong>
                <button
                  type="button"
                  onClick={() => handleRemoveChild(idx)}
                  className="hover:text-rose-700 text-amber-700 ml-0.5"
                  title="Remove child"
                  aria-label={`Remove child aged ${age} years`}
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 italic">
            No children registered in this profile.
          </p>
        )}
      </div>

      {/* Health Sensitivity Toggles */}
      <div className="space-y-3 pt-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          User-Reported Health Vulnerabilities
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Respiratory Sensitivity Toggle */}
          <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={profile.has_respiratory_sensitivity}
              onChange={(e) =>
                onChange((prev) => ({
                  ...prev,
                  has_respiratory_sensitivity: e.target.checked,
                }))
              }
              className="mt-0.5 w-4 h-4 rounded text-vayu-600 focus:ring-vayu-500 border-slate-300"
            />
            <div>
              <span className="text-xs font-bold text-slate-900 block">
                Respiratory Sensitivity
              </span>
              <span className="text-[11px] text-slate-500 block leading-snug mt-0.5">
                Frequent cough, bronchitis history, or allergic rhinitis
              </span>
            </div>
          </label>

          {/* Asthma / Respiratory Vulnerability Toggle */}
          <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={profile.has_asthma_or_respiratory_vulnerability}
              onChange={(e) =>
                onChange((prev) => ({
                  ...prev,
                  has_asthma_or_respiratory_vulnerability: e.target.checked,
                }))
              }
              className="mt-0.5 w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
            />
            <div>
              <span className="text-xs font-bold text-slate-900 block">
                Asthma / Chronic Vulnerability
              </span>
              <span className="text-[11px] text-slate-500 block leading-snug mt-0.5">
                Elevates risk multiplier to maximum tier; prioritizes inhaler readiness
              </span>
            </div>
          </label>

          {/* Limited Mobility Toggle */}
          <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={profile.has_limited_mobility}
              onChange={(e) =>
                onChange((prev) => ({
                  ...prev,
                  has_limited_mobility: e.target.checked,
                }))
              }
              className="mt-0.5 w-4 h-4 rounded text-vayu-600 focus:ring-vayu-500 border-slate-300"
            />
            <div>
              <span className="text-xs font-bold text-slate-900 block">
                Limited Physical Mobility
              </span>
              <span className="text-[11px] text-slate-500 block leading-snug mt-0.5">
                Tailors indoor activity advice and avoids stair/walking recommendations
              </span>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
};
