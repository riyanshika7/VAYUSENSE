import React from 'react';
import { ArrowRightLeft, Bus, Layers, Dumbbell, Leaf, CheckCircle2 } from 'lucide-react';
import { SustainableSwaps, SustainableSwapItem } from '../../types/recommendation';
import { Badge } from '../common/Badge';

interface SustainableSwapsCardProps {
  sustainableSwaps?: SustainableSwaps;
}

export const SustainableSwapsCard: React.FC<SustainableSwapsCardProps> = ({ sustainableSwaps }) => {
  if (!sustainableSwaps || !sustainableSwaps.swaps || sustainableSwaps.swaps.length === 0) {
    return null;
  }

  const getCategoryIcon = (cat: string) => {
    switch (cat.toLowerCase()) {
      case 'transit':
        return <Bus className="w-4 h-4 text-blue-600" />;
      case 'trip_chaining':
        return <Layers className="w-4 h-4 text-emerald-600" />;
      case 'exercise':
        return <Dumbbell className="w-4 h-4 text-amber-600" />;
      case 'low_emission_choice':
      default:
        return <Leaf className="w-4 h-4 text-teal-600" />;
    }
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm p-6">
      <div className="pb-4 border-b border-slate-100 mb-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-vayu-600" />
          Sustainable Lifestyle & Commute Swaps
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Practical substitutions that simultaneously lower personal inhalation exposure and urban emissions
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sustainableSwaps.swaps.map((swap: SustainableSwapItem, idx: number) => (
          <div
            key={idx}
            className="rounded-xl p-4 bg-slate-50/70 border border-slate-200/80 flex flex-col justify-between hover:border-slate-300 transition-all"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wide">
                  {getCategoryIcon(swap.swap_category)}
                  {swap.swap_category.replace('_', ' ')}
                </span>
                <Badge variant="teal" size="sm">
                  Recommended Swap
                </Badge>
              </div>

              {/* Current Habit */}
              <div className="text-xs text-slate-500 mb-1">
                Current: <span className="line-through text-slate-500">{swap.current_habit}</span>
              </div>

              {/* Recommended Swap */}
              <p className="text-xs font-semibold text-slate-900 leading-snug">
                {swap.recommended_swap}
              </p>

              {/* Rationale */}
              <p className="text-[11px] text-slate-600 mt-2 leading-relaxed bg-white/80 p-2 rounded-lg border border-slate-100">
                <strong>Why it works:</strong> {swap.rationale}
              </p>
            </div>

            {/* Feasibility note */}
            <div className="mt-3 pt-2 border-t border-slate-200/60 text-[10px] text-slate-500 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
              <span>{swap.feasibility_note}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
