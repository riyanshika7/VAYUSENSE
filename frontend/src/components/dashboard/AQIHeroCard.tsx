/**
 * AQIHeroCard — primary AQI display card.
 *
 * Visual states:
 *  - Normal (live / fresh data)
 *  - Stale data: amber freshness badge + stale notice
 *  - Refreshing in background: subtle "Updating…" overlay
 *  - Fixture mode: amber design-preview banner
 *
 * Scale disclaimer: always notes WAQI/US EPA methodology, not CPCB NAQI.
 */

import React from 'react';
import {
  Clock,
  ExternalLink,
  Info,
  MapPin,
  ShieldAlert,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { AQIResponse } from '../../types/aqi';
import { Badge } from '../common/Badge';

interface AQIHeroCardProps {
  aqiData: AQIResponse;
  isFixture?: boolean;
  isRefreshing?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isSafeUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
function getCategoryTheme(cat: string) {
  switch (cat.toLowerCase()) {
    case 'good':
      return {
        bg: 'bg-emerald-500/8 border-emerald-200/60',
        pill: 'bg-emerald-600 text-white',
        badgeVariant: 'emerald' as const,
        freshnessClass: 'text-emerald-700',
      };
    case 'moderate':
      return {
        bg: 'bg-amber-500/8 border-amber-200/60',
        pill: 'bg-amber-600 text-white',
        badgeVariant: 'amber' as const,
        freshnessClass: 'text-amber-700',
      };
    case 'unhealthy for sensitive groups':
      return {
        bg: 'bg-orange-500/8 border-orange-200/60',
        pill: 'bg-orange-600 text-white',
        badgeVariant: 'orange' as const,
        freshnessClass: 'text-orange-700',
      };
    case 'unhealthy':
      return {
        bg: 'bg-rose-500/8 border-rose-200/60',
        pill: 'bg-rose-600 text-white',
        badgeVariant: 'rose' as const,
        freshnessClass: 'text-rose-700',
      };
    case 'very unhealthy':
    case 'hazardous':
      return {
        bg: 'bg-purple-500/8 border-purple-200/60',
        pill: 'bg-purple-800 text-white',
        badgeVariant: 'purple' as const,
        freshnessClass: 'text-purple-700',
      };
    default:
      return {
        bg: 'bg-slate-100/60 border-slate-200/60',
        pill: 'bg-slate-700 text-white',
        badgeVariant: 'slate' as const,
        freshnessClass: 'text-slate-500',
      };
  }
}

/** Derive a UI-visible freshness label + variant from the backend's data_freshness field. */
function getFreshnessDisplay(freshness: string): {
  label: string;
  variant: 'teal' | 'amber' | 'rose' | 'slate';
  isStale: boolean;
} {
  switch (freshness.toLowerCase()) {
    case 'fresh':
    case 'live':
      return { label: 'Live · Fresh', variant: 'teal', isStale: false };
    case 'recent':
      return { label: 'Recent', variant: 'teal', isStale: false };
    case 'stale':
      return { label: 'Stale Data', variant: 'amber', isStale: true };
    case 'very_stale':
    case 'very stale':
      return { label: 'Very Stale', variant: 'rose', isStale: true };
    default:
      return { label: freshness, variant: 'slate', isStale: false };
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export const AQIHeroCard: React.FC<AQIHeroCardProps> = ({
  aqiData,
  isFixture = false,
  isRefreshing = false,
}) => {
  const aqi = aqiData.aqi;
  const classification = aqiData.classification;
  const category = classification?.category ?? 'Unknown';
  const theme = getCategoryTheme(category);
  const freshness = getFreshnessDisplay(aqiData.data_freshness);

  return (
    <div className={`relative rounded-2xl bg-white border shadow-sm p-6 overflow-hidden transition-colors ${theme.bg}`}>

      {/* ── Fixture-mode banner ── */}
      {isFixture && (
        <div className="mb-4 -mt-2 -mx-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200/80 flex items-center justify-between text-xs text-amber-800 font-medium">
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-amber-600" />
            UI Design Fixture — not live measurements. Connect backend for real WAQI data.
          </span>
          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 bg-amber-200/60 rounded py-0.5">
            Preview
          </span>
        </div>
      )}

      {/* ── Stale data notice ── */}
      {freshness.isStale && !isFixture && (
        <div className="mb-4 -mt-2 -mx-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200/70 flex items-center gap-1.5 text-xs text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>
            Station data is <strong>{freshness.label.toLowerCase()}</strong>. The monitoring station may not have
            reported recently. Treat values as approximate.
          </span>
        </div>
      )}

      {/* ── Refreshing overlay ── */}
      {isRefreshing && (
        <div className="absolute top-4 right-4 flex items-center gap-1.5 text-[11px] text-vayu-700 font-medium animate-pulse">
          <RefreshCw className="w-3 h-3 animate-spin" />
          Updating…
        </div>
      )}

      {/* ── Station header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 pb-4 border-b border-black/5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
            <MapPin className="w-3.5 h-3.5 text-vayu-600" aria-hidden="true" />
            <span>Reporting Station</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mt-0.5 leading-snug">
            {aqiData.station_name}
          </h2>
          {aqiData.location_name && aqiData.location_name !== aqiData.station_name && (
            <p className="text-xs text-slate-600 mt-0.5">{aqiData.location_name}</p>
          )}
          {aqiData.coordinates && (
            <p className="text-xs text-slate-600 font-mono mt-0.5">
              {aqiData.coordinates.latitude.toFixed(4)}°N,{' '}
              {aqiData.coordinates.longitude.toFixed(4)}°E
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 self-start">
          <Badge variant={freshness.variant} size="sm">
            <Clock className="w-3 h-3 mr-1" />
            {freshness.label}
          </Badge>
          {isSafeUrl(aqiData.station_url) && (
            <a
              href={aqiData.station_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-600 hover:text-slate-800 p-1 rounded-md hover:bg-slate-50 transition-colors"
              title="View on aqicn.org"
              aria-label={`View ${aqiData.station_name} station on aqicn.org (opens in a new tab)`}
            >
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>

      {/* ── AQI value + health panel ── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 py-6 items-center">

        {/* Large AQI number */}
        <div className="md:col-span-5 flex flex-col justify-center">
          <div className="flex items-baseline gap-3">
            <span className="text-6xl sm:text-7xl font-extrabold tracking-tight text-slate-900 font-mono tabular-nums">
              {aqi !== null && aqi !== undefined ? aqi : '—'}
            </span>
            <span className="text-sm font-semibold uppercase tracking-wider text-slate-600">
              AQI
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase ${theme.pill}`}>
              {category}
            </span>
            {aqiData.dominant_pollutant && (
              <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                Primary:{' '}
                <strong className="uppercase text-slate-800">{aqiData.dominant_pollutant}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Health implication + methodology note */}
        <div className="md:col-span-7 space-y-3 bg-white/70 rounded-xl p-4 border border-black/5">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
              Health Implication
            </h3>
            <p className="text-sm text-slate-700 mt-1 leading-relaxed">
              {classification?.health_implications ||
                'Live air quality status reported by monitoring station.'}
            </p>
          </div>

          {/* ── Scale disclaimer — always shown, never confused with CPCB ── */}
          <div className="pt-2 border-t border-black/5">
            <div className="flex items-start gap-1.5 text-[11px] text-slate-500 leading-normal">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Standardized via{' '}
                <strong className="text-slate-700">
                  {classification?.scale_name ?? 'WAQI / US EPA Standard'}
                </strong>{' '}
                formula.{' '}
                <span className="text-slate-600">
                  This is <em>not</em> the official CPCB National AQI (NAQI) 24-hour
                  sub-index method used by Indian regulatory authorities.
                </span>
              </span>
            </div>
            {classification?.methodology_note && (
              <p className="mt-1.5 text-[10px] text-slate-500 italic leading-snug">
                {classification.methodology_note}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Attribution strip ── */}
      <div className="pt-3 border-t border-black/5 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span>Source:</span>
          <span className="font-medium text-slate-700">{aqiData.source}</span>
          {aqiData.attributions.length > 0 && (
            <span className="text-slate-300" aria-hidden="true">·</span>
          )}
          {aqiData.attributions.slice(0, 2).map((attr, i) => (
            isSafeUrl(attr.url)
              ? (
                <a
                  key={i}
                  href={attr.url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-600 hover:text-vayu-700 hover:underline transition-colors"
                >
                  {attr.name}
                </a>
              )
              : <span key={i} className="text-slate-600">{attr.name}</span>
          ))}
        </div>
        <div className="font-mono text-[11px] text-slate-600">
          Sampled: {aqiData.measurement_time || 'Recent'}
        </div>
      </div>
    </div>
  );
};
