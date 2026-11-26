/**
 * ImpactCategoryBadges — Displays the 5 qualitative impact assessment categories:
 * 1. Personal exposure impact
 * 2. Household protection reach
 * 3. Community emissions impact
 * 4. Practicality / ease of adoption
 * 5. Cost tier
 */

import React from 'react';
import { Shield, Home, Globe, ThumbsUp, DollarSign } from 'lucide-react';
import { ImpactCategories } from '../../types/recommendation';

interface ImpactCategoryBadgesProps {
  impact: ImpactCategories;
}

export const ImpactCategoryBadges: React.FC<ImpactCategoryBadgesProps> = ({ impact }) => {
  return (
    <div className="space-y-1.5 pt-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
        Multi-Category Impact Dimensions:
      </span>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {/* 1. Personal Exposure */}
        <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200/80 flex flex-col justify-between">
          <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-800">
            <Shield className="w-3 h-3 text-emerald-600" />
            <span>Personal Exposure</span>
          </div>
          <span className="text-xs font-bold text-emerald-950 mt-1">
            {impact.personal_exposure}
          </span>
        </div>

        {/* 2. Household Protection */}
        <div className="p-2 rounded-lg bg-blue-50 border border-blue-200/80 flex flex-col justify-between">
          <div className="flex items-center gap-1 text-[10px] font-semibold text-blue-800">
            <Home className="w-3 h-3 text-blue-600" />
            <span>Protection Reach</span>
          </div>
          <span className="text-xs font-bold text-blue-950 mt-1 truncate" title={impact.household_protection}>
            {impact.household_protection}
          </span>
        </div>

        {/* 3. Community Emissions */}
        <div className="p-2 rounded-lg bg-teal-50 border border-teal-200/80 flex flex-col justify-between">
          <div className="flex items-center gap-1 text-[10px] font-semibold text-teal-800">
            <Globe className="w-3 h-3 text-teal-600" />
            <span>Community Impact</span>
          </div>
          <span className="text-xs font-bold text-teal-950 mt-1 truncate" title={impact.community_emissions}>
            {impact.community_emissions}
          </span>
        </div>

        {/* 4. Practicality */}
        <div className="p-2 rounded-lg bg-purple-50 border border-purple-200/80 flex flex-col justify-between">
          <div className="flex items-center gap-1 text-[10px] font-semibold text-purple-800">
            <ThumbsUp className="w-3 h-3 text-purple-600" />
            <span>Practicality</span>
          </div>
          <span className="text-xs font-bold text-purple-950 mt-1">
            {impact.practicality}
          </span>
        </div>

        {/* 5. Cost Tier */}
        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
          <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-700">
            <DollarSign className="w-3 h-3 text-slate-600" />
            <span>Cost Requirement</span>
          </div>
          <span className="text-xs font-bold text-slate-900 mt-1">
            {impact.cost}
          </span>
        </div>
      </div>
    </div>
  );
};
