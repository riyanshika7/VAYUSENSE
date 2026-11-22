import React from 'react';
import { AlertTriangle, AlertCircle, Bell } from 'lucide-react';
import { PersonalizedAlert } from '../../types/recommendation';

interface PersonalizedAlertsBannerProps {
  alerts?: PersonalizedAlert[];
}

export const PersonalizedAlertsBanner: React.FC<PersonalizedAlertsBannerProps> = ({ alerts }) => {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      {alerts.map((alert, idx) => {
        const isWarning = alert.alert_level.toLowerCase() === 'warning';
        return (
          <div
            key={idx}
            className={`rounded-xl p-3.5 border flex items-start gap-3 transition-all ${
              isWarning
                ? 'bg-rose-50/80 border-rose-200 text-rose-950'
                : 'bg-amber-50/80 border-amber-200 text-amber-950'
            }`}
          >
            <div className={`p-1.5 rounded-lg shrink-0 ${isWarning ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
              {isWarning ? <AlertTriangle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-bold uppercase tracking-wider">
                  {alert.activity}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.2 rounded-full uppercase ${isWarning ? 'bg-rose-200 text-rose-800' : 'bg-amber-200 text-amber-800'}`}>
                  {alert.alert_level}
                </span>
                <span className="text-xs text-slate-500">
                  • Target: <strong className="text-slate-700">{alert.affected_member}</strong>
                </span>
              </div>
              <p className="text-xs leading-relaxed font-medium">
                {alert.message}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
