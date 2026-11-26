/**
 * ExplainableRecommendationCard — Primary protective recommendation card with:
 *  - Action title
 *  - Priority badge (Critical, High, Medium, Low)
 *  - Recommended time window
 *  - Affected household members
 *  - Interactive completion checkbox (Done / In Progress / Pending)
 *  - Expandable "Why this?" section containing:
 *      • Visual 5-step Causal Chain
 *      • Triggering AQI & household context
 *      • 5 Multi-dimension Impact categories (Personal, Household, Community, Practicality, Cost)
 *      • Practical trade-offs or limitations
 *      • Supporting auditable rule identifier
 */

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  User,
  AlertCircle,
  Check,
  FileCode2,
} from 'lucide-react';
import { RuleRecommendation } from '../../types/recommendation';
import { CausalChainVisualizer } from './CausalChainVisualizer';
import { ImpactCategoryBadges } from './ImpactCategoryBadges';

interface ExplainableRecommendationCardProps {
  recommendation: RuleRecommendation;
  isCompleted?: boolean;
  onToggleComplete?: () => void;
  defaultExpanded?: boolean;
}

export const ExplainableRecommendationCard: React.FC<ExplainableRecommendationCardProps> = ({
  recommendation,
  isCompleted = false,
  onToggleComplete,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Priority color theme
  const getPriorityTheme = (p: string) => {
    switch (p.toLowerCase()) {
      case 'critical':
        return {
          badge: 'bg-rose-100 text-rose-800 border-rose-300',
          border: 'border-l-4 border-l-rose-600',
        };
      case 'high':
        return {
          badge: 'bg-orange-100 text-orange-800 border-orange-300',
          border: 'border-l-4 border-l-orange-500',
        };
      case 'medium':
        return {
          badge: 'bg-amber-100 text-amber-800 border-amber-300',
          border: 'border-l-4 border-l-amber-500',
        };
      default:
        return {
          badge: 'bg-slate-100 text-slate-800 border-slate-300',
          border: 'border-l-4 border-l-slate-400',
        };
    }
  };

  const theme = getPriorityTheme(recommendation.priority);

  // Fallback causal chain if backend didn't supply one
  const causalChain = recommendation.causal_chain || {
    live_data: 'Verified ambient AQI and diurnal inversion status',
    household_context: `Household schedule: ${recommendation.affected_household_member}`,
    detected_risk: recommendation.reason,
    recommended_action: recommendation.action,
    expected_benefit: recommendation.expected_benefit,
  };

  // Fallback impact categories
  const impactCategories = recommendation.impact_categories || {
    personal_exposure: 'High Reduction',
    household_protection: recommendation.affected_household_member,
    community_emissions: 'Neutral',
    practicality: 'Minimal Shift',
    cost: 'Zero Cost',
  };

  return (
    <div
      className={`rounded-2xl border border-slate-200 shadow-xs transition-all overflow-hidden ${theme.border} ${
        isCompleted ? 'bg-slate-50' : 'bg-white hover:border-slate-300'
      }`}
    >
      <div className="p-4 sm:p-5">
        {/* Top Header: Completion Checkbox + Priority Badge + Time */}
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex items-start gap-3 flex-1">
            {/* Completion checkbox */}
            {onToggleComplete && (
              <button
                type="button"
                role="checkbox"
                aria-checked={isCompleted}
                aria-label={`Mark "${recommendation.action}" as ${isCompleted ? 'pending' : 'completed'}`}
                onClick={onToggleComplete}
                className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center border transition-all shrink-0 ${
                  isCompleted
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                    : 'border-slate-500 bg-white hover:border-slate-700'
                }`}
                title={isCompleted ? 'Mark as pending' : 'Mark as completed today'}
              >
                {isCompleted && <Check className="w-3.5 h-3.5 stroke-[3]" aria-hidden="true" />}
              </button>
            )}

            <div className="flex-1">
              {/* Badges strip */}
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span
                  className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${theme.badge}`}
                >
                  {recommendation.priority} Priority
                </span>

                <span className="flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full">
                  <Clock className="w-3 h-3 text-slate-500" aria-hidden="true" />
                  {recommendation.timing}
                </span>

                <span className="flex items-center gap-1 text-[11px] font-medium text-vayu-800 bg-vayu-50 px-2.5 py-0.5 rounded-full border border-vayu-200/60">
                  <User className="w-3 h-3 text-vayu-600" />
                  {recommendation.affected_household_member}
                </span>
              </div>

              {/* Action Title */}
              <h4
                className={`text-sm sm:text-base font-bold leading-snug ${
                  isCompleted ? 'line-through text-slate-600' : 'text-slate-900'
                }`}
              >
                {recommendation.action}
              </h4>
            </div>
          </div>

          {/* Expand "Why this?" toggle button */}
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? 'Hide' : 'Show'} explanation for "${recommendation.action}"`}
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs font-semibold text-vayu-700 hover:text-vayu-900 bg-vayu-50 hover:bg-vayu-100/80 px-2.5 py-1.5 rounded-xl border border-vayu-200 transition-colors shrink-0"
          >
            <span>{isExpanded ? 'Hide' : 'Why this?'}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
          </button>
        </div>

        {/* Short reason preview if collapsed */}
        {!isExpanded && (
          <p className="text-xs text-slate-600 mt-1 line-clamp-2 pl-8">
            <strong>Mechanism:</strong> {recommendation.reason}
          </p>
        )}

        {/* ── Expandable "Why this?" Deep-Dive Section ── */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-4 animate-in fade-in duration-200">
            {/* 1. Visual 5-Step Causal Chain */}
            <CausalChainVisualizer causalChain={causalChain} />

            {/* 2. Multi-Category Impact Badges */}
            <ImpactCategoryBadges impact={impactCategories} />

            {/* 3. Trade-offs / Limitations Note */}
            {recommendation.tradeoff_or_limitation && (
              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Trade-off / Practical Limitation:</span>
                  <span className="text-amber-800">{recommendation.tradeoff_or_limitation}</span>
                </div>
              </div>
            )}

            {/* 4. Auditable Rule Reference Code */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
              <span className="flex items-center gap-1 font-mono text-[10px]">
                <FileCode2 className="w-3 h-3 text-slate-400" aria-hidden="true" />
                Rule: <strong>{recommendation.supporting_data_rule}</strong>
              </span>
              <span>Confidence: <strong>{recommendation.confidence}</strong></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
