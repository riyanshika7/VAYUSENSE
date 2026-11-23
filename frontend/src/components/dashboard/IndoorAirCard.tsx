import React from 'react';
import {
  Flame,
  Wind,
  Sparkles,
  Ban,
  Shield,
  Home,
} from 'lucide-react';
import { IndoorAirActions, ExplainableAction } from '../../types/recommendation';
import { Badge } from '../common/Badge';

interface IndoorAirCardProps {
  indoorActions?: IndoorAirActions;
}

export const IndoorAirCard: React.FC<IndoorAirCardProps> = ({ indoorActions }) => {
  if (!indoorActions) {
    return null;
  }

  const sections: {
    id: keyof IndoorAirActions;
    title: string;
    icon: React.ReactNode;
    items: ExplainableAction[];
    accent: string;
  }[] = [
    {
      id: 'cooking',
      title: 'Cooking & Kitchen Exhaust',
      icon: <Flame className="w-4 h-4 text-orange-600" />,
      items: indoorActions.cooking,
      accent: 'border-orange-200/80 bg-orange-50/20',
    },
    {
      id: 'ventilation',
      title: 'Selective Window Ventilation',
      icon: <Wind className="w-4 h-4 text-teal-600" />,
      items: indoorActions.ventilation,
      accent: 'border-teal-200/80 bg-teal-50/20',
    },
    {
      id: 'dust_and_cleaning',
      title: 'Dusting & Cleaning Protocol',
      icon: <Sparkles className="w-4 h-4 text-blue-600" />,
      items: indoorActions.dust_and_cleaning,
      accent: 'border-blue-200/80 bg-blue-50/20',
    },
    {
      id: 'incense_and_combustion',
      title: 'Incense, Dhoop & Mosquito Coils',
      icon: <Ban className="w-4 h-4 text-rose-600" />,
      items: indoorActions.incense_and_combustion,
      accent: 'border-rose-200/80 bg-rose-50/20',
    },
    {
      id: 'purifier_and_bedrooms',
      title: 'Bedroom Air Purifier Sanctuary',
      icon: <Shield className="w-4 h-4 text-indigo-600" />,
      items: indoorActions.purifier_and_bedrooms,
      accent: 'border-indigo-200/80 bg-indigo-50/20',
    },
  ];

  return (
    <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm p-6">
      <div className="pb-4 border-b border-slate-100 mb-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
          <Home className="w-4 h-4 text-vayu-600" />
          Indoor Air Micro-Environment Actions
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">
          Eliminate internal particulate generation and control infiltration across cooking, cleaning, and sleeping spaces
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((section) => {
          if (!section.items || section.items.length === 0) return null;
          const first = section.items[0];

          return (
            <div
              key={section.id}
              className={`rounded-xl p-4 border ${section.accent} flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 uppercase tracking-wide">
                    {section.icon}
                    {section.title}
                  </h4>
                  <Badge variant="slate" size="sm">
                    {first.timing}
                  </Badge>
                </div>
                <p className="text-xs text-slate-800 font-medium leading-relaxed">
                  {first.action}
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-200/60 text-[11px] text-slate-500 flex items-center justify-between">
                <span>Beneficiary: <strong className="text-slate-700">{first.beneficiary}</strong></span>
                <span className="text-vayu-800 font-medium">{first.expected_mechanism.split(';')[0]}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
