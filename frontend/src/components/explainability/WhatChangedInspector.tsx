/**
 * WhatChangedInspector — Explains what changed when the user switches location,
 * profile persona, or schedule.
 *
 * Uses actual deterministic delta metrics:
 *  - Location & AQI delta (e.g. Delhi AQI 220 → Bengaluru AQI 65)
 *  - Household Profile delta (e.g. Commuter → Senior-Sensitive)
 *  - Risk Score delta (e.g. 52.0 → 74.5 [+22.5 pts])
 *  - Rule changes: which protective rules were activated or deactivated and why!
 */

import React from 'react';
import {
  GitCompare,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  MapPin,
  Users,
  ShieldAlert,
  CheckCircle,
  XCircle,
} from 'lucide-react';

export interface WhatChangedState {
  prevLocation: string;
  currLocation: string;
  prevAqi: number | null;
  currAqi: number | null;
  prevProfileName: string;
  currProfileName: string;
  prevRiskScore: number;
  currRiskScore: number;
  addedRuleTitles: string[];
  removedRuleTitles: string[];
  changeRationale: string;
}

interface WhatChangedInspectorProps {
  delta: WhatChangedState | null;
}

export const WhatChangedInspector: React.FC<WhatChangedInspectorProps> = ({ delta }) => {
  if (!delta) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm p-6 space-y-2">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-vayu-600" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
            What Changed? (Audit Delta Inspector)
          </h3>
        </div>
        <p className="text-xs text-slate-500">
          Switch your location in the top bar or change your household profile under "My Household" to inspect the real-time causal delta.
        </p>
      </div>
    );
  }

  const scoreDiff = delta.currRiskScore - delta.prevRiskScore;
  const aqiDiff =
    delta.currAqi !== null && delta.prevAqi !== null ? delta.currAqi - delta.prevAqi : null;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-white via-slate-50/50 to-vayu-50/30 border border-slate-200/90 shadow-sm p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-vayu-700 bg-vayu-50 border border-vayu-200 px-2.5 py-0.5 rounded-full">
              Causal Delta Engine
            </span>
            <span className="text-xs text-slate-500 font-medium">Real-Time Comparison</span>
          </div>
          <h3 className="text-lg font-bold text-slate-900 mt-1">
            What Changed & Why Recommendations Shifted
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Deterministic audit trail comparing your current settings against your previous state.
          </p>
        </div>
      </div>

      {/* 3 Metric Comparison Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* 1. Location & AQI Shift */}
        <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <MapPin className="w-3 h-3 text-vayu-600" />
            Location & AQI Shift
          </span>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <span>{delta.prevLocation}</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-vayu-900">{delta.currLocation}</span>
          </div>
          {aqiDiff !== null && (
            <p className="text-[11px] font-mono font-medium text-slate-500">
              AQI: {delta.prevAqi} → {delta.currAqi}{' '}
              <span className={aqiDiff > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>
                ({aqiDiff > 0 ? `+${aqiDiff}` : aqiDiff} pts)
              </span>
            </p>
          )}
        </div>

        {/* 2. Profile Persona Shift */}
        <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <Users className="w-3 h-3 text-vayu-600" />
            Household Persona Shift
          </span>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 truncate">
            <span className="truncate">{delta.prevProfileName}</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-vayu-900 truncate">{delta.currProfileName}</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Demographic vulnerability re-computed
          </p>
        </div>

        {/* 3. Exposure Risk Score Delta */}
        <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3 text-vayu-600" />
            Exposure Risk Delta
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-extrabold font-mono text-slate-900">
              {delta.currRiskScore.toFixed(1)}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              (was {delta.prevRiskScore.toFixed(1)})
            </span>
            <span
              className={`text-xs font-bold flex items-center gap-0.5 ml-auto font-mono ${
                scoreDiff > 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {scoreDiff > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {scoreDiff > 0 ? `+${scoreDiff.toFixed(1)}` : scoreDiff.toFixed(1)}
            </span>
          </div>
          <p className="text-[10px] text-slate-400">
            0–100 deterministic risk score scale
          </p>
        </div>
      </div>

      {/* Plain-Language Rationale Box */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 leading-relaxed">
        <span className="font-bold text-slate-900 block mb-1">Causal Explanation:</span>
        <p>{delta.changeRationale}</p>
      </div>

      {/* Activated vs Deactivated Recommendations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
        {/* Newly Activated Rules */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            Newly Activated Protective Rules ({delta.addedRuleTitles.length})
          </span>
          {delta.addedRuleTitles.length > 0 ? (
            <ul className="space-y-1 text-xs text-slate-700">
              {delta.addedRuleTitles.map((title, i) => (
                <li
                  key={i}
                  className="p-2 rounded-lg bg-emerald-50/50 border border-emerald-200/60 leading-snug"
                >
                  {title}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400 italic">No new protective rules triggered.</p>
          )}
        </div>

        {/* Deactivated Rules */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-slate-400" />
            Deactivated / Waived Rules ({delta.removedRuleTitles.length})
          </span>
          {delta.removedRuleTitles.length > 0 ? (
            <ul className="space-y-1 text-xs text-slate-500">
              {delta.removedRuleTitles.map((title, i) => (
                <li
                  key={i}
                  className="p-2 rounded-lg bg-slate-100/70 border border-slate-200/60 leading-snug line-through"
                >
                  {title}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400 italic">No existing rules deactivated.</p>
          )}
        </div>
      </div>
    </div>
  );
};
