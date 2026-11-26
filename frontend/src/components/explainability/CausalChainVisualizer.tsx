/**
 * CausalChainVisualizer — Displays the step-by-step causal chain:
 * LIVE DATA → HOUSEHOLD CONTEXT → DETECTED RISK → RECOMMENDED ACTION → EXPECTED BENEFIT
 *
 * Explains clearly to non-technical users exactly why an action was triggered by actual data.
 */

import React from 'react';
import {
  Activity,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { CausalChain } from '../../types/recommendation';

interface CausalChainVisualizerProps {
  causalChain: CausalChain;
}

export const CausalChainVisualizer: React.FC<CausalChainVisualizerProps> = ({ causalChain }) => {
  const steps = [
    {
      number: '1',
      title: 'Live Data',
      icon: Activity,
      content: causalChain.live_data,
      color: 'bg-blue-50 border-blue-200 text-blue-900',
      badgeColor: 'bg-blue-600 text-white',
      accent: 'border-l-4 border-l-blue-500',
    },
    {
      number: '2',
      title: 'Household Context',
      icon: UserCheck,
      content: causalChain.household_context,
      color: 'bg-indigo-50 border-indigo-200 text-indigo-900',
      badgeColor: 'bg-indigo-600 text-white',
      accent: 'border-l-4 border-l-indigo-500',
    },
    {
      number: '3',
      title: 'Detected Risk',
      icon: AlertTriangle,
      content: causalChain.detected_risk,
      color: 'bg-amber-50 border-amber-200 text-amber-900',
      badgeColor: 'bg-amber-700 text-white',
      accent: 'border-l-4 border-l-amber-500',
    },
    {
      number: '4',
      title: 'Recommended Action',
      icon: CheckCircle2,
      content: causalChain.recommended_action,
      color: 'bg-emerald-50 border-emerald-200 text-emerald-900',
      badgeColor: 'bg-emerald-700 text-white',
      accent: 'border-l-4 border-l-emerald-500',
    },
    {
      number: '5',
      title: 'Expected Benefit',
      icon: ShieldCheck,
      content: causalChain.expected_benefit,
      color: 'bg-teal-50 border-teal-200 text-teal-900',
      badgeColor: 'bg-teal-700 text-white',
      accent: 'border-l-4 border-l-teal-500',
    },
  ];

  return (
    <div className="space-y-2 py-2">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Deterministic Causal Chain:
        </span>
        <span className="text-[10px] text-slate-500">
          Verified ambient readings + verified household schedule
        </span>
      </div>

      {/* Responsive timeline grid */}
      <ol aria-label="Causal reasoning chain" className="grid grid-cols-1 lg:grid-cols-5 gap-2.5 relative list-none pl-0">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isLast = idx === steps.length - 1;

          return (
            <React.Fragment key={idx}>
              <li
                className={`rounded-xl p-3 border ${step.color} ${step.accent} flex flex-col justify-between shadow-xs transition-all`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      {step.title}
                    </span>
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${step.badgeColor}`}
                    >
                      {step.number}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed font-medium">
                    {step.content}
                  </p>
                </div>
              </li>

              {/* Arrow connector between steps (desktop) */}
              {!isLast && (
                <div
                  aria-hidden="true"
                  className="hidden lg:flex items-center justify-center absolute z-10 pointer-events-none"
                  style={{ left: `calc(${(idx + 1) * 20}% - 8px)`, top: '42%' }}
                >
                  <ArrowRight className="w-4 h-4 text-slate-400 bg-white rounded-full p-0.5 shadow-xs" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </div>
  );
};
