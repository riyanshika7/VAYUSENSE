import React, { useState } from 'react';
import { ShieldCheck, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { RiskAssessmentResult } from '../../types/recommendation';
import { Badge } from '../common/Badge';

interface ExposureRiskScoreCardProps {
  riskScore: number;
  riskLevel: string;
  confidenceScore?: number;
  freshnessIndicator?: string;
  isStaleOrMissing?: boolean;
  breakdown?: RiskAssessmentResult['breakdown'];
  summary?: string;
}

export const ExposureRiskScoreCard: React.FC<ExposureRiskScoreCardProps> = ({
  riskScore,
  riskLevel,
  confidenceScore = 0.9,
  freshnessIndicator = 'Live',
  isStaleOrMissing = false,
  breakdown,
  summary,
}) => {
  const [showAudit, setShowAudit] = useState(false);

  const getRiskColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'low':
        return { text: 'text-emerald-700', bg: 'bg-emerald-500', badge: 'emerald' as const };
      case 'moderate':
        return { text: 'text-amber-700', bg: 'bg-amber-500', badge: 'amber' as const };
      case 'elevated':
        return { text: 'text-orange-700', bg: 'bg-orange-500', badge: 'orange' as const };
      case 'high':
        return { text: 'text-rose-700', bg: 'bg-rose-500', badge: 'rose' as const };
      case 'severe':
      default:
        return { text: 'text-purple-800', bg: 'bg-purple-600', badge: 'purple' as const };
    }
  };

  const color = getRiskColor(riskLevel);

  return (
    <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm p-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-vayu-600" />
            Deterministic Exposure Intelligence
          </span>
          <h3 className="text-base font-bold text-slate-900 mt-0.5">
            Personalized Exposure Risk Index
          </h3>
        </div>
        <Badge variant={color.badge} size="md">
          {riskLevel} Risk
        </Badge>
      </div>

      {/* Main Score Bar and Value */}
      <div className="py-5">
        <div className="flex items-baseline justify-between mb-2">
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-extrabold font-mono tracking-tight text-slate-900">
              {riskScore.toFixed(1)}
            </span>
            <span className="text-sm font-semibold text-slate-500">/ 100</span>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-500 block font-medium">Confidence Rating</span>
            <span className="text-sm font-bold text-slate-700 font-mono">
              {(confidenceScore * 100).toFixed(0)}% ({freshnessIndicator})
            </span>
          </div>
        </div>

        {/* 0-100 Gauge Bar */}
        <div
          className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200/60"
          role="meter"
          aria-valuenow={riskScore}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Household personal exposure risk score"
          aria-valuetext={`${riskScore.toFixed(1)} out of 100, ${riskLevel} risk`}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${color.bg}`}
            style={{ width: `${Math.max(4, Math.min(100, riskScore))}%` }}
          />
        </div>

        {/* Scale Benchmarks */}
        <div className="flex justify-between text-[10px] text-slate-500 font-medium mt-1.5 px-0.5">
          <span>0 (Low)</span>
          <span>20</span>
          <span>40 (Moderate)</span>
          <span>60 (Elevated)</span>
          <span>80 (High)</span>
          <span>100 (Severe)</span>
        </div>
      </div>

      {/* Summary Note */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700 leading-relaxed">
        <p className="font-medium text-slate-800">
          {summary ||
            `Exposure risk is calculated deterministically from ambient AQI, household vulnerability, daily commute, activity timing, and indoor conditions.`}
        </p>
        {isStaleOrMissing && (
          <p className="mt-1 text-amber-700 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            AQI data has uncertainty due to stale or missing station measurements; general protective guidelines applied.
          </p>
        )}
      </div>

      {/* Expandable Deterministic Component Breakdown */}
      {breakdown && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          <button
            onClick={() => setShowAudit(!showAudit)}
            className="w-full flex items-center justify-between text-xs font-semibold text-vayu-800 hover:text-vayu-900 py-1"
            aria-expanded={showAudit}
            aria-controls="exposure-risk-breakdown"
          >
            <span>Explainable Scoring Components ({showAudit ? 'Hide Audit Trail' : 'View Audit Trail'})</span>
            {showAudit ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
          </button>

          {showAudit && (
            <div id="exposure-risk-breakdown" className="mt-3 space-y-2.5 text-xs text-slate-600 bg-slate-50/60 p-3.5 rounded-xl border border-slate-100">
              <div className="grid grid-cols-2 gap-2 pb-2 border-b border-slate-200/60">
                <div>
                  <span className="text-slate-500 block text-[11px]">Base Ambient AQI:</span>
                  <strong className="font-mono text-slate-800">
                    +{breakdown.base_aqi_component} pts
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Vulnerability Multiplier:</span>
                  <strong className="font-mono text-slate-800">
                    ×{breakdown.vulnerability_factor}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Exposure Duration:</span>
                  <strong className="font-mono text-slate-800">
                    +{breakdown.exposure_duration_score} pts
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Activity & Timing:</span>
                  <strong className="font-mono text-slate-800">
                    +{breakdown.activity_timing_score} pts
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Indoor Modulation:</span>
                  <strong className={`font-mono ${breakdown.indoor_environment_score < 0 ? 'text-emerald-700' : 'text-slate-800'}`}>
                    {breakdown.indoor_environment_score > 0 ? `+${breakdown.indoor_environment_score}` : breakdown.indoor_environment_score} pts
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Freshness Uncertainty:</span>
                  <strong className="font-mono text-slate-800">
                    +{breakdown.freshness_penalty} pts
                  </strong>
                </div>
              </div>

              {/* Explanations list */}
              {breakdown.explanations && breakdown.explanations.length > 0 && (
                <ul className="space-y-1 text-[11px] text-slate-500 pt-1">
                  {breakdown.explanations.map((exp, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-vayu-600 font-bold">•</span>
                      <span>{exp}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
