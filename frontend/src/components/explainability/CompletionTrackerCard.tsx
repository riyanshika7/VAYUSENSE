/**
 * CompletionTrackerCard — Interactive protective action checklist.
 *
 * Capabilities:
 *  - Tracks completion status (Pending vs Done) for each recommendation today
 *  - Calculates an active "Protective Shield Rating" (% actions completed)
 *  - Persists completed action IDs in localStorage keyed by today's ISO date string
 *  - Allows quick marking and resetting
 */

import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Circle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Award,
} from 'lucide-react';
import { RuleRecommendation } from '../../types/recommendation';

interface CompletionTrackerCardProps {
  recommendations: RuleRecommendation[];
  completedActionKeys: string[];
  onToggleAction: (actionKey: string) => void;
  onResetCompleted: () => void;
}

export const CompletionTrackerCard: React.FC<CompletionTrackerCardProps> = ({
  recommendations,
  completedActionKeys,
  onToggleAction,
  onResetCompleted,
}) => {
  const total = recommendations.length;
  const completedCount = recommendations.filter((r) =>
    completedActionKeys.includes(r.supporting_data_rule || r.action)
  ).length;

  const percentage = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  // Rating label
  const getShieldRating = (pct: number) => {
    if (pct >= 85) return { label: 'Optimal Shield', color: 'text-emerald-700 bg-emerald-100', bar: 'bg-emerald-600' };
    if (pct >= 50) return { label: 'Moderate Defense', color: 'text-amber-800 bg-amber-100', bar: 'bg-amber-500' };
    if (pct > 0) return { label: 'Partial Shield', color: 'text-orange-800 bg-orange-100', bar: 'bg-orange-500' };
    return { label: 'Unshielded', color: 'text-slate-600 bg-slate-100', bar: 'bg-slate-400' };
  };

  const rating = getShieldRating(percentage);

  return (
    <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-vayu-700 bg-vayu-50 border border-vayu-200 px-2.5 py-0.5 rounded-full">
              Daily Compliance Tracker
            </span>
            <span className="text-xs text-slate-500 font-medium">Today's Protection</span>
          </div>
          <h3 className="text-lg font-bold text-slate-900 mt-1">
            Household Action Tracker
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Mark each protective intervention as your family completes it today to maintain your household clean air shield.
          </p>
        </div>

        {completedCount > 0 && (
          <button
            type="button"
            onClick={onResetCompleted}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 self-start sm:self-auto py-1 px-2.5 rounded-lg border border-slate-200 hover:bg-slate-50"
            title="Reset today's checklist"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Today
          </button>
        )}
      </div>

      {/* Progress Bar & Metric Banner */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-vayu-700" />
            <div>
              <span className="text-xs text-slate-400 block font-medium">Protective Status</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rating.color}`}>
                {rating.label} ({percentage}%)
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-400 block font-medium">Actions Completed</span>
            <span className="text-sm font-extrabold font-mono text-slate-900">
              {completedCount} of {total} Complete
            </span>
          </div>
        </div>

        {/* Bar */}
        <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${rating.bar}`}
            style={{ width: `${Math.max(4, percentage)}%` }}
          />
        </div>
      </div>

      {/* Checklist of Recommendations */}
      <div className="space-y-2">
        {recommendations.map((rec) => {
          const key = rec.supporting_data_rule || rec.action;
          const isDone = completedActionKeys.includes(key);

          return (
            <button
              type="button"
              key={key}
              onClick={() => onToggleAction(key)}
              className={`w-full p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all ${
                isDone
                  ? 'bg-emerald-50/60 border-emerald-200 text-slate-700'
                  : 'bg-white border-slate-200 hover:border-slate-300 text-slate-900'
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-300" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold leading-snug ${isDone ? 'line-through text-slate-500' : ''}`}>
                  {rec.action}
                </p>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                  <span className="font-medium text-slate-500">{rec.timing}</span>
                  <span>•</span>
                  <span>{rec.affected_household_member}</span>
                </div>
              </div>

              {isDone && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full shrink-0">
                  Done
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
