import React, { useState } from 'react';
import {
  CalendarCheck,
  Sun,
  Sunset,
  Moon,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Sparkles,
  User,
} from 'lucide-react';
import { TodayRoutine, ExplainableAction } from '../../types/recommendation';
import { Badge } from '../common/Badge';
import { CausalChainVisualizer } from '../explainability/CausalChainVisualizer';
import { ImpactCategoryBadges } from '../explainability/ImpactCategoryBadges';

interface RecommendedActionsCardProps {
  todayRoutine?: TodayRoutine;
  isAiGenerated?: boolean;
}

export const RecommendedActionsCard: React.FC<RecommendedActionsCardProps> = ({
  todayRoutine,
  isAiGenerated,
}) => {
  const [activeTab, setActiveTab] = useState<'morning' | 'afternoon' | 'evening' | 'night'>('morning');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  if (!todayRoutine) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-6 text-center text-slate-500">
        Loading personalized actions...
      </div>
    );
  }

  const currentSegment = todayRoutine[activeTab];

  const tabs: { id: 'morning' | 'afternoon' | 'evening' | 'night'; label: string; icon: React.ReactNode; time: string }[] = [
    { id: 'morning', label: 'Morning', icon: <Sun className="w-4 h-4 text-amber-500" />, time: '05:00 - 11:00' },
    { id: 'afternoon', label: 'Afternoon', icon: <Sun className="w-4 h-4 text-orange-500" />, time: '11:00 - 16:00' },
    { id: 'evening', label: 'Evening', icon: <Sunset className="w-4 h-4 text-rose-500" />, time: '16:00 - 20:00' },
    { id: 'night', label: 'Night', icon: <Moon className="w-4 h-4 text-indigo-500" />, time: '20:00 - 07:00' },
  ];

  return (
    <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <CalendarCheck className="w-4 h-4 text-vayu-600" />
              Today's Personalized Routine
            </h3>
            {isAiGenerated && (
              <span className="flex items-center gap-1 text-[10px] font-semibold bg-vayu-50 text-vayu-800 border border-vayu-200/60 px-2 py-0.5 rounded-full">
                <Sparkles className="w-3 h-3 text-vayu-600" />
                Gemini Reasoning
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Diurnally synchronized health protective interventions with complete explainability audit
          </p>
        </div>
      </div>

      {/* Time-of-Day Tabs */}
      <div role="tablist" aria-label="Action timeline periods" className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {tabs.map((tab, idx) => {
          const isActive = activeTab === tab.id;
          const handleTabKeyDown = (e: React.KeyboardEvent) => {
            let nextIndex = idx;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              nextIndex = (idx + 1) % tabs.length;
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              nextIndex = (idx - 1 + tabs.length) % tabs.length;
            } else if (e.key === 'Home') {
              e.preventDefault();
              nextIndex = 0;
            } else if (e.key === 'End') {
              e.preventDefault();
              nextIndex = tabs.length - 1;
            } else {
              return;
            }
            const nextTab = tabs[nextIndex];
            setActiveTab(nextTab.id);
            setExpandedIndex(0);
            document.getElementById(`actions-tab-${nextTab.id}`)?.focus();
          };

          return (
            <button
              id={`actions-tab-${tab.id}`}
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls="actions-tabpanel"
              tabIndex={isActive ? 0 : -1}
              onKeyDown={handleTabKeyDown}
              onClick={() => {
                setActiveTab(tab.id);
                setExpandedIndex(0);
              }}
              className={`p-3 rounded-xl border text-left transition-all ${
                isActive
                  ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                  : 'bg-slate-50 border-slate-200/80 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-xs leading-none">{tab.label}</span>
                {tab.icon}
              </div>
              <span className={`text-[10px] block leading-none ${isActive ? 'text-slate-300' : 'text-slate-600'}`}>
                {tab.time}
              </span>
            </button>
          );
        })}
      </div>

      {/* Segment Summary */}
      <div className="p-3 rounded-xl bg-vayu-50/50 border border-vayu-100 text-xs text-vayu-950 font-medium mb-4 flex items-center gap-2">
        <Clock className="w-4 h-4 text-vayu-700 shrink-0" aria-hidden="true" />
        <span>{currentSegment.summary}</span>
      </div>

      {/* Actions Accordion with Category D Explainability */}
      <div id="actions-tabpanel" role="tabpanel" aria-labelledby={`actions-tab-${activeTab}`} className="space-y-3">
        {currentSegment.actions.map((act: ExplainableAction, idx: number) => {
          const isExpanded = expandedIndex === idx;
          const priorityVariant = {
            critical: 'rose' as const,
            high: 'orange' as const,
            medium: 'amber' as const,
            low: 'slate' as const,
          }[act.priority.toLowerCase()] || ('slate' as const);

          return (
            <div
              key={idx}
              className={`rounded-xl border transition-all ${
                isExpanded
                  ? 'bg-white border-slate-300 shadow-sm'
                  : 'bg-slate-50/50 border-slate-200/80 hover:border-slate-300'
              }`}
            >
              {/* Action Title Header */}
              <button
                type="button"
                aria-expanded={isExpanded}
                aria-controls={`action-explanation-${idx}`}
                onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                className="w-full text-left p-4 cursor-pointer flex items-start justify-between gap-3 focus-visible:ring-2 focus-visible:ring-vayu-600 rounded-xl"
              >
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge variant={priorityVariant} size="sm">
                      {act.priority}
                    </Badge>
                    <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      {act.timing}
                    </span>
                    <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" aria-hidden="true" />
                      {act.beneficiary}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900 leading-snug">
                    {act.action}
                  </h4>
                </div>

                <span className="text-slate-500 p-1" aria-hidden="true">
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
              </button>

              {/* Explainability Breakdown (Category D + Phase 5 Causal Chain) */}
              {isExpanded && (
                <div id={`action-explanation-${idx}`} className="px-4 pb-4 pt-1 border-t border-slate-100 text-xs space-y-3">
                  {/* Causal Chain Flow */}
                  <CausalChainVisualizer
                    causalChain={{
                      live_data: 'Ambient outdoor pollution & diurnal ground inversion curve',
                      household_context: `${act.beneficiary} schedule · Trigger: ${act.trigger_condition}`,
                      detected_risk: act.why_now,
                      recommended_action: act.action,
                      expected_benefit: act.expected_mechanism,
                    }}
                  />

                  {/* Multi-Category Impact Dimensions */}
                  <ImpactCategoryBadges
                    impact={{
                      personal_exposure: 'High Reduction',
                      household_protection: act.beneficiary,
                      community_emissions: act.action.toLowerCase().includes('metro') || act.action.toLowerCase().includes('carpool')
                        ? 'Lowers Traffic Soot'
                        : 'Neutral',
                      practicality: 'Minimal Shift',
                      cost: act.action.toLowerCase().includes('purifier') ? 'Investment' : 'Zero Cost',
                    }}
                  />

                  {/* Trade-off / Limitation */}
                  {act.tradeoff_or_limitation && (
                    <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Trade-off / Practical Limitation: </span>
                        <span>{act.tradeoff_or_limitation}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
