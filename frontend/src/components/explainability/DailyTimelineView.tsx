/**
 * DailyTimelineView — 24-hour visual diurnal timeline.
 *
 * Visualizes:
 *  - Diurnal atmospheric boundary layer dynamics (morning/evening inversion peaks vs midday solar mixing)
 *  - Scheduled household routines (commute, outdoor walk, children's park play, cooking, sleep)
 *  - Timed protective recommendations aligned to the exact hour they take effect
 */

import React, { useState } from 'react';
import {
  Sun,
  Moon,
  Sunset,
  Sunrise,
  Shield,
} from 'lucide-react';
import { RuleRecommendation } from '../../types/recommendation';
import { HouseholdProfile } from '../../types/profile';

interface DailyTimelineViewProps {
  recommendations: RuleRecommendation[];
  profile: HouseholdProfile;
  currentAqi?: number | null;
}

export const DailyTimelineView: React.FC<DailyTimelineViewProps> = ({
  recommendations,
  profile,
  currentAqi,
}) => {
  const [activeSegment, setActiveSegment] = useState<'all' | 'morning' | 'afternoon' | 'evening' | 'night'>('all');

  const segments = [
    {
      id: 'morning' as const,
      name: 'Early Morning',
      hours: '05:00 – 10:00',
      icon: Sunrise,
      smogLevel: 'Peak Inversion Smog',
      smogTheme: 'bg-rose-50 text-rose-800 border-rose-200',
      description: 'Cool ground temperatures trap vehicular and biomass emissions within the lowest 100 meters.',
      routineEvents: [
        profile.exercise_habits.participates_in_outdoor_exercise &&
        profile.exercise_habits.time_of_day === 'early_morning'
          ? 'Morning Walk/Exercise Scheduled (06:00 – 07:30)'
          : null,
        profile.commute_habits.is_daily_commuter
          ? `Work Commute via ${profile.commute_habits.primary_mode.replace('_', ' ')} (08:30 – 09:30)`
          : null,
      ].filter(Boolean),
      recommendedActions: recommendations.filter(
        (r) =>
          r.timing.toLowerCase().includes('morning') ||
          r.timing.toLowerCase().includes('05:00') ||
          r.timing.toLowerCase().includes('inversion')
      ),
    },
    {
      id: 'afternoon' as const,
      name: 'Midday Dispersion',
      hours: '11:00 – 15:30',
      icon: Sun,
      smogLevel: 'Best Atmospheric Dispersion Window',
      smogTheme: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      description: 'Solar heating generates thermal convection currents, lifting particulate matter high into the boundary layer.',
      routineEvents: [
        'Midday errand window & school pickup',
        'Favorable window for controlled home cross-ventilation',
      ],
      recommendedActions: recommendations.filter(
        (r) =>
          r.timing.toLowerCase().includes('midday') ||
          r.timing.toLowerCase().includes('12:00') ||
          r.timing.toLowerCase().includes('afternoon') ||
          r.timing.toLowerCase().includes('errand')
      ),
    },
    {
      id: 'evening' as const,
      name: 'Evening Commute & Cooking',
      hours: '16:00 – 21:00',
      icon: Sunset,
      smogLevel: 'Secondary Smog Surge + Cooking Aerosols',
      smogTheme: 'bg-orange-50 text-orange-800 border-orange-200',
      description: 'Sunset triggers surface cooling inversion while rush-hour traffic and dinner cooking generate aerosol spikes.',
      routineEvents: [
        profile.has_outdoor_child_play
          ? "Children's Outdoor Play Scheduled (16:30 – 18:00)"
          : null,
        profile.commute_habits.is_daily_commuter
          ? 'Evening Return Commute (18:00 – 19:30)'
          : null,
        'Dinner preparation & stove cooking (19:30 – 21:00)',
      ].filter(Boolean),
      recommendedActions: recommendations.filter(
        (r) =>
          r.timing.toLowerCase().includes('evening') ||
          r.timing.toLowerCase().includes('cooking') ||
          r.timing.toLowerCase().includes('play') ||
          r.timing.toLowerCase().includes('commute')
      ),
    },
    {
      id: 'night' as const,
      name: 'Nighttime Sleep Sanctuary',
      hours: '21:00 – 05:00',
      icon: Moon,
      smogLevel: 'Prolonged Overnight Exposure',
      smogTheme: 'bg-indigo-50 text-indigo-800 border-indigo-200',
      description: 'Overnight shallow boundary layer sustains outdoor smog until sunrise. Sleeping members spend 7–8 continuous hours in one micro-environment.',
      routineEvents: [
        profile.purifier_setup.has_air_purifier
          ? `Bedroom Air Purifier (${profile.purifier_setup.purifier_count} unit)`
          : 'Sealed bedroom enclosure (No active purifier)',
      ],
      recommendedActions: recommendations.filter(
        (r) =>
          r.timing.toLowerCase().includes('night') ||
          r.timing.toLowerCase().includes('sleeping') ||
          r.timing.toLowerCase().includes('purifier') ||
          r.timing.toLowerCase().includes('clean air room')
      ),
    },
  ];

  const filteredSegments =
    activeSegment === 'all'
      ? segments
      : segments.filter((s) => s.id === activeSegment);

  return (
    <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-vayu-700 bg-vayu-50 border border-vayu-200 px-2.5 py-0.5 rounded-full">
              Diurnal Cycle
            </span>
            <span className="text-xs text-slate-500 font-medium">
              24-Hour Atmospheric Exposure Dynamics
            </span>
          </div>
          <h3 className="text-lg font-bold text-slate-900 mt-1">
            Personalized Daily Timeline
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Synchronizes your household schedule with diurnal temperature inversion curves to pinpoint optimal protective timing.
          </p>
        </div>

        {/* Segment filter buttons */}
        <div role="group" aria-label="Filter timeline by time of day" className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
          {(['all', 'morning', 'afternoon', 'evening', 'night'] as const).map((tab) => (
            <button
              type="button"
              aria-pressed={activeSegment === tab}
              key={tab}
              onClick={() => setActiveSegment(tab)}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg capitalize transition-colors ${
                activeSegment === tab
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* 24-Hour Segment Cards */}
      <div className="space-y-4">
        {filteredSegments.map((segment) => {
          const Icon = segment.icon;

          return (
            <div
              key={segment.id}
              className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 space-y-4 hover:border-slate-300 transition-all"
            >
              {/* Segment Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200/80">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white border border-slate-200 text-slate-700 shadow-xs">
                    <Icon className="w-5 h-5 text-vayu-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{segment.name}</h4>
                      <span className="text-xs font-mono font-semibold text-slate-500">
                        ({segment.hours})
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{segment.description}</p>
                  </div>
                </div>

                <span
                  className={`text-[11px] font-bold px-3 py-1 rounded-full border self-start sm:self-auto ${segment.smogTheme}`}
                >
                  {segment.smogLevel}
                </span>
              </div>

              {/* Grid: Household Schedule vs Recommended Actions */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Left Column: Scheduled Household Activities */}
                <div className="md:col-span-5 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    Your Scheduled Household Activities:
                  </span>
                  {segment.routineEvents.length > 0 ? (
                    <ul className="space-y-1.5 text-xs text-slate-700">
                      {segment.routineEvents.map((event, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 p-2 rounded-lg bg-white border border-slate-200/70"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-vayu-600 mt-1.5 shrink-0" />
                          <span className="font-medium">{event}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500 italic bg-white/60 p-2.5 rounded-lg border border-slate-200/50">
                      No high-exposure outdoor activities scheduled during this window.
                    </p>
                  )}
                </div>

                {/* Right Column: Timed Protective Recommendations */}
                <div className="md:col-span-7 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    Protective Actions Required During This Window:
                  </span>
                  {segment.recommendedActions.length > 0 ? (
                    <div className="space-y-2">
                      {segment.recommendedActions.map((rec, i) => (
                        <div
                          key={i}
                          className="p-3 rounded-xl bg-white border border-emerald-200/80 shadow-xs flex items-start gap-2.5"
                        >
                          <Shield className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-slate-900 leading-snug">
                              {rec.action}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              <strong>Why now:</strong> {rec.reason}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic bg-white/60 p-2.5 rounded-lg border border-slate-200/50">
                      Maintain standard building seal. No acute exposure actions required.
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
