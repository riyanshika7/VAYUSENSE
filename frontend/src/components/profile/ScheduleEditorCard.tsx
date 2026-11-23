/**
 * ScheduleEditorCard — Routine and activity timing editor.
 *
 * Configures:
 *  - Commute patterns: mode (two-wheeler, open auto, bus, metro, car), duration, rush-hour windows
 *  - Exercise routine: outdoor vs indoor, time of day (early morning inversion risk), intensity
 *  - Child outdoor recreation: after-school park play timing
 *  - Cooking times: dinner / lunch peak combustion windows
 */

import React from 'react';
import {
  Clock,
  Bike,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import {
  HouseholdProfile,
  CommuteMode,
  ExerciseTimeOfDay,
  ExerciseIntensity,
} from '../../types/profile';

interface ScheduleEditorCardProps {
  profile: HouseholdProfile;
  onChange: (updater: (prev: HouseholdProfile) => HouseholdProfile) => void;
}

const COMMUTE_MODES: { id: CommuteMode; label: string; exposure: string; desc: string }[] = [
  { id: 'two_wheeler', label: 'Two-Wheeler (Motorcycle / Scooter)', exposure: 'Very High', desc: 'Direct breathing of vehicle exhaust wakes.' },
  { id: 'open_auto', label: 'Open Auto-Rickshaw', exposure: 'Very High', desc: 'Direct street-level particulate inhalation.' },
  { id: 'walking', label: 'Walking / Cycling', exposure: 'Maximum', desc: 'Elevated respiration rate directly on roadside.' },
  { id: 'bus_non_ac', label: 'Non-AC Bus', exposure: 'High', desc: 'Open windows permit traffic exhaust influx.' },
  { id: 'metro_ac', label: 'AC Metro Rail', exposure: 'Low', desc: 'Enclosed cabins with central air filtration.' },
  { id: 'car_ac', label: 'Car (AC Recirculate)', exposure: 'Low-Mod', desc: 'Cabin filter buffers against ambient soot.' },
];

const EXERCISE_TIMES: { id: ExerciseTimeOfDay; label: string; note: string }[] = [
  { id: 'early_morning', label: 'Early Morning (05:00 – 08:00)', note: '⚠️ Peak ground-level smog inversion' },
  { id: 'morning', label: 'Morning (08:00 – 11:00)', note: 'High rush-hour vehicle exhaust' },
  { id: 'afternoon', label: 'Midday / Afternoon (12:00 – 16:00)', note: '✅ Best daytime dispersion window' },
  { id: 'evening', label: 'Evening (16:00 – 20:00)', note: '⚠️ Smog starts accumulating again' },
  { id: 'indoor_only', label: 'Indoor Gym / Home Only', note: '✅ Shielded from ambient inversion' },
  { id: 'none', label: 'No Regular Workout', note: 'Baseline exposure' },
];

export const ScheduleEditorCard: React.FC<ScheduleEditorCardProps> = ({
  profile,
  onChange,
}) => {
  const commute = profile.commute_habits;
  const exercise = profile.exercise_habits;

  return (
    <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm p-6 space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-slate-100">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
          <Clock className="w-4 h-4 text-vayu-600" />
          Daily Schedule & Exposure Timing
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Pollution follows diurnal cycles; activity timing determines whether household members inhale peak smog
        </p>
      </div>

      {/* ── 1. Commute Habits ── */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bike className="w-4 h-4 text-vayu-700" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Daily Work Commute
            </h4>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={commute.is_daily_commuter}
              onChange={(e) =>
                onChange((prev) => ({
                  ...prev,
                  commute_habits: {
                    ...prev.commute_habits,
                    is_daily_commuter: e.target.checked,
                  },
                }))
              }
              className="w-4 h-4 rounded text-vayu-600 focus:ring-vayu-500 border-slate-300"
            />
            <span>Active Commuters</span>
          </label>
        </div>

        {commute.is_daily_commuter ? (
          <div className="space-y-4 pt-1">
            {/* Primary Mode Dropdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="commute-mode-select" className="text-xs font-bold text-slate-700 block mb-1">
                  Primary Commute Mode
                </label>
                <select
                  id="commute-mode-select"
                  value={commute.primary_mode}
                  onChange={(e) =>
                    onChange((prev) => ({
                      ...prev,
                      commute_habits: {
                        ...prev.commute_habits,
                        primary_mode: e.target.value as CommuteMode,
                      },
                    }))
                  }
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-800 focus:outline-none focus:border-vayu-600 cursor-pointer"
                >
                  {COMMUTE_MODES.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.label} ({mode.exposure} exposure)
                    </option>
                  ))}
                </select>
              </div>

              {/* Commute Duration */}
              <div>
                <label htmlFor="commute-duration-range" className="text-xs font-bold text-slate-700 block mb-1">
                  Daily Round-Trip Commute: <strong>{commute.estimated_daily_commute_minutes} minutes</strong>
                </label>
                <input
                  id="commute-duration-range"
                  aria-label="Daily round-trip commute in minutes"
                  type="range"
                  min="10"
                  max="180"
                  step="5"
                  value={commute.estimated_daily_commute_minutes}
                  onChange={(e) =>
                    onChange((prev) => ({
                      ...prev,
                      commute_habits: {
                        ...prev.commute_habits,
                        estimated_daily_commute_minutes: parseInt(e.target.value, 10),
                      },
                    }))
                  }
                  className="w-full accent-vayu-600"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>10m</span>
                  <span>60m (1 hr)</span>
                  <span>120m (2 hr)</span>
                  <span>180m</span>
                </div>
              </div>
            </div>

            {/* Commute Timing Warning if open-air */}
            {['two_wheeler', 'open_auto', 'walking'].includes(commute.primary_mode) && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>High roadside exposure:</strong> Commuting via open mode in peak traffic adds +7.0 points to exposure risk. An N95 respirator is recommended for this route.
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 italic">
            No regular outdoor commute (work from home or retired). In-transit exposure points waived.
          </p>
        )}
      </div>

      {/* ── 2. Exercise Habits ── */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-vayu-700" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Exercise & Outdoor Workouts
            </h4>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={exercise.participates_in_outdoor_exercise}
              onChange={(e) =>
                onChange((prev) => ({
                  ...prev,
                  exercise_habits: {
                    ...prev.exercise_habits,
                    participates_in_outdoor_exercise: e.target.checked,
                  },
                }))
              }
              className="w-4 h-4 rounded text-vayu-600 focus:ring-vayu-500 border-slate-300"
            />
            <span>Outdoor Exercise Active</span>
          </label>
        </div>

        {exercise.participates_in_outdoor_exercise ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            {/* Preferred Time Window */}
            <div className="sm:col-span-2">
              <label htmlFor="exercise-time-select" className="text-xs font-bold text-slate-700 block mb-1">
                Preferred Exercise Time
              </label>
              <select
                id="exercise-time-select"
                value={exercise.time_of_day}
                onChange={(e) =>
                  onChange((prev) => ({
                    ...prev,
                    exercise_habits: {
                      ...prev.exercise_habits,
                      time_of_day: e.target.value as ExerciseTimeOfDay,
                    },
                  }))
                }
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-800 focus:outline-none focus:border-vayu-600 cursor-pointer"
              >
                {EXERCISE_TIMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} — {t.note}
                  </option>
                ))}
              </select>
            </div>

            {/* Exercise Intensity */}
            <div>
              <label htmlFor="exercise-intensity-select" className="text-xs font-bold text-slate-700 block mb-1">
                Intensity Level
              </label>
              <select
                id="exercise-intensity-select"
                value={exercise.intensity}
                onChange={(e) =>
                  onChange((prev) => ({
                    ...prev,
                    exercise_habits: {
                      ...prev.exercise_habits,
                      intensity: e.target.value as ExerciseIntensity,
                    },
                  }))
                }
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-800 focus:outline-none focus:border-vayu-600 cursor-pointer"
              >
                <option value="light">Light (Walking, Strolling)</option>
                <option value="moderate">Moderate (Brisk Walk, Jogging)</option>
                <option value="vigorous">Vigorous (Running, Cycling)</option>
              </select>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 italic">
            No regular outdoor exercise reported.
          </p>
        )}
      </div>

      {/* ── 3. Children's Outdoor Play ── */}
      {profile.children_ages.length > 0 && (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between">
          <label htmlFor="child-play-checkbox" className="cursor-pointer flex-1">
            <span className="text-xs font-bold text-slate-800 block">
              Children's After-School Outdoor Play (16:30 – 18:30)
            </span>
            <span className="text-[11px] text-slate-500 block">
              Late afternoon is when evening smog begins accumulating in North Indian cities.
            </span>
          </label>
          <input
            id="child-play-checkbox"
            aria-label="Consider children's after-school outdoor play"
            type="checkbox"
            checked={profile.has_outdoor_child_play}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                has_outdoor_child_play: e.target.checked,
              }))
            }
            className="w-4 h-4 rounded text-vayu-600 focus:ring-vayu-500 border-slate-300 ml-4 cursor-pointer"
          />
        </div>
      )}
    </div>
  );
};
