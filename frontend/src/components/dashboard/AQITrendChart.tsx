import React, { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, Calendar, Info, Activity } from 'lucide-react';
import { ForecastData } from '../../types/aqi';

interface ForecastDataPoint {
  rawDay: string;
  day: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  range: number | null;
}

interface DiurnalDataPoint {
  time: string;
  aqi: number;
  label: string;
}

interface ChartTooltipProps<T> {
  active?: boolean;
  payload?: Array<{
    value: number | string;
    payload: T;
  }>;
  label?: string | number;
}

interface AQITrendChartProps {
  currentAqi: number | null;
  forecast?: ForecastData | null;
}

export const AQITrendChart: React.FC<AQITrendChartProps> = ({ currentAqi, forecast }) => {
  const hasStationForecast = Boolean(forecast?.pm25 && forecast.pm25.length > 0);
  const [activeTab, setActiveTab] = useState<'forecast' | 'diurnal'>(
    hasStationForecast ? 'forecast' : 'diurnal'
  );

  // ── Multi-Day Station Forecast Data ──────────────────────────────────────
  const forecastData = (forecast?.pm25 ?? []).map((pt) => {
    // Format day string e.g. "2026-11-21" to "Nov 21"
    let displayDay = pt.day;
    try {
      const parts = pt.day.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        displayDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
    } catch {}

    const maxVal = pt.max ?? null;
    const minVal = pt.min ?? null;
    return {
      rawDay: pt.day,
      day: displayDay,
      avg: pt.avg ?? null,
      min: minVal,
      max: maxVal,
      range: maxVal !== null && minVal !== null ? maxVal - minVal : null,
    };
  });

  // ── 24-Hour Diurnal Curve (Atmospheric Boundary Layer Model) ──────────────
  const base = currentAqi && currentAqi > 0 ? currentAqi : 150;
  const diurnalFactors = [
    { hour: '00:00', factor: 1.12, label: 'Night Stable Layer' },
    { hour: '02:00', factor: 1.18, label: 'Night Accumulation' },
    { hour: '04:00', factor: 1.24, label: 'Early Dawn Stagnation' },
    { hour: '06:00', factor: 1.28, label: 'Morning Inversion Peak' },
    { hour: '08:00', factor: 1.25, label: 'Morning Commute Peak' },
    { hour: '10:00', factor: 1.05, label: 'Boundary Layer Rising' },
    { hour: '12:00', factor: 0.85, label: 'Solar Thermal Mixing' },
    { hour: '14:00', factor: 0.72, label: 'Midday Dispersion Window' },
    { hour: '16:00', factor: 0.80, label: 'Late Afternoon Cooling' },
    { hour: '18:00', factor: 1.10, label: 'Evening Rush Buildup' },
    { hour: '20:00', factor: 1.22, label: 'Night Cooling Inversion' },
    { hour: '22:00', factor: 1.15, label: 'Surface Trapping' },
  ];

  const diurnalData = diurnalFactors.map((d) => ({
    time: d.hour,
    aqi: Math.round(base * d.factor),
    label: d.label,
  }));

  // Tooltip for Multi-Day Forecast
  const ForecastTooltip = ({ active, payload }: ChartTooltipProps<ForecastDataPoint>) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white px-3.5 py-2.5 rounded-xl text-xs shadow-xl border border-slate-800">
          <p className="font-semibold text-slate-300 font-mono flex items-center justify-between gap-4">
            <span>{dataPoint.rawDay}</span>
            <span className="text-[10px] text-vayu-300 uppercase tracking-wider font-sans">Station Telemetry</span>
          </p>
          <div className="mt-2 space-y-1">
            <div className="flex justify-between items-center gap-4">
              <span className="text-slate-400">Daily Average:</span>
              <span className="text-base font-extrabold text-vayu-300 font-mono">
                {dataPoint.avg !== null ? dataPoint.avg : '—'} <span className="text-xs font-normal text-slate-400">AQI</span>
              </span>
            </div>
            {dataPoint.min !== null && dataPoint.max !== null && (
              <div className="flex justify-between items-center gap-4 text-[11px] text-slate-300">
                <span className="text-slate-400">Recorded Range:</span>
                <span className="font-mono">{dataPoint.min} – {dataPoint.max} AQI</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  // Tooltip for Diurnal Model
  const DiurnalTooltip = ({ active, payload, label }: ChartTooltipProps<DiurnalDataPoint>) => {
    if (active && payload && payload.length) {
      const val = payload[0].value;
      const dataPoint = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white px-3.5 py-2.5 rounded-xl text-xs shadow-xl border border-slate-800">
          <p className="font-semibold text-slate-300 font-mono flex items-center justify-between gap-4">
            <span>{label}</span>
            <span className="text-[10px] text-amber-300 uppercase tracking-wider font-sans">{dataPoint.label}</span>
          </p>
          <p className="text-base font-extrabold text-vayu-300 mt-1 font-mono">
            {val} <span className="text-xs font-normal text-slate-400">AQI (Model)</span>
          </p>
        </div>
      );
    }
    return null;
  };

  const handleTabKeyDown = (e: React.KeyboardEvent, currentTabName: 'forecast' | 'diurnal') => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const nextTab = currentTabName === 'forecast' ? 'diurnal' : 'forecast';
      setActiveTab(nextTab);
      const nextBtn = document.getElementById(`tab-${nextTab}`);
      nextBtn?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveTab('forecast');
      document.getElementById('tab-forecast')?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveTab('diurnal');
      document.getElementById('tab-diurnal')?.focus();
    }
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm p-6">
      {/* Header with Title and Mode Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-vayu-600" />
              Air Quality Trend & Atmospheric Dynamics
            </h3>
            {activeTab === 'forecast' ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                Live Sensor Telemetry
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
                Atmospheric Inversion Model
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {activeTab === 'forecast'
              ? 'Multi-day PM2.5 daily average and range broadcast directly by station telemetry'
              : '24-hour diurnal inversion cycle reflecting atmospheric boundary layer collapse & solar heating'}
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div
          role="tablist"
          aria-label="Air quality chart view"
          className="flex items-center rounded-xl bg-slate-100/80 p-1 text-xs font-semibold self-start sm:self-auto"
        >
          <button
            id="tab-forecast"
            type="button"
            role="tab"
            aria-selected={activeTab === 'forecast'}
            aria-controls="panel-forecast"
            tabIndex={activeTab === 'forecast' ? 0 : -1}
            onKeyDown={(e) => handleTabKeyDown(e, 'forecast')}
            onClick={() => setActiveTab('forecast')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'forecast'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-vayu-600" aria-hidden="true" />
            <span>Station Forecast</span>
          </button>
          <button
            id="tab-diurnal"
            type="button"
            role="tab"
            aria-selected={activeTab === 'diurnal'}
            aria-controls="panel-diurnal"
            tabIndex={activeTab === 'diurnal' ? 0 : -1}
            onKeyDown={(e) => handleTabKeyDown(e, 'diurnal')}
            onClick={() => setActiveTab('diurnal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'diurnal'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-teal-600" aria-hidden="true" />
            <span>24h Diurnal Cycle</span>
          </button>
        </div>
      </div>

      {/* Screen reader text alternative for charts */}
      <div className="sr-only">
        {activeTab === 'forecast' ? (
          <div>
            {hasStationForecast ? (
              <table>
                <caption className="font-bold">Station 5-Day Forecast Data Summary (PM2.5 AQI)</caption>
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col">Average AQI</th>
                    <th scope="col">Min AQI</th>
                    <th scope="col">Max AQI</th>
                  </tr>
                </thead>
                <tbody>
                  {forecastData.map((d) => (
                    <tr key={d.rawDay}>
                      <td>{d.day}</td>
                      <td>{d.avg ?? 'N/A'}</td>
                      <td>{d.min ?? 'N/A'}</td>
                      <td>{d.max ?? 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No multi-day telemetry forecast broadcast by current station.</p>
            )}
          </div>
        ) : (
          <div>
            <table>
              <caption className="font-bold">24-Hour Diurnal Boundary Layer Model Summary</caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Atmospheric Phase</th>
                  <th scope="col">Estimated AQI</th>
                </tr>
              </thead>
              <tbody>
                {diurnalData.map((d) => (
                  <tr key={d.time}>
                    <td>{d.time}</td>
                    <td>{d.label}</td>
                    <td>{d.aqi}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Main Chart Area */}
      {activeTab === 'forecast' ? (
        hasStationForecast ? (
          <div id="panel-forecast" role="tabpanel" aria-labelledby="tab-forecast">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={forecastData} margin={{ top: 15, right: 15, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <Tooltip content={<ForecastTooltip />} />
                  {currentAqi && (
                    <ReferenceLine
                      y={currentAqi}
                      stroke="#0f766e"
                      strokeDasharray="4 4"
                      label={{
                        value: `Live: ${currentAqi}`,
                        position: 'insideTopRight',
                        fill: '#0f766e',
                        fontSize: 10,
                      }}
                    />
                  )}
                  {/* Daily Range Bar */}
                  <Bar
                    dataKey="max"
                    fill="#cbd5e1"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={36}
                    opacity={0.35}
                    name="Daily Max"
                  />
                  {/* Daily Average Line */}
                  <Line
                    type="monotone"
                    dataKey="avg"
                    stroke="#0f766e"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#0f766e', strokeWidth: 2, stroke: '#ffffff' }}
                    activeDot={{ r: 6, fill: '#0d9488' }}
                    name="Daily Average"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-vayu-700" />
                  <span><strong>Line:</strong> Daily Avg AQI</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-slate-300 opacity-60" />
                  <span><strong>Bar:</strong> Daily Range Ceiling (Max)</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 italic">
                Source: Real-time WAQI Station Telemetry array
              </p>
            </div>
          </div>
        ) : (
          <div id="panel-forecast" role="tabpanel" aria-labelledby="tab-forecast" className="py-12 px-6 text-center rounded-xl bg-slate-50 border border-slate-200/70">
            <Info className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-slate-700">Multi-Day Telemetry Not Published</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              This monitoring station does not currently broadcast multi-day forecasting telemetry arrays.
              You can explore the diurnal pattern in the <strong>24h Diurnal Cycle</strong> tab.
            </p>
            <button
              type="button"
              onClick={() => setActiveTab('diurnal')}
              className="mt-3 px-3 py-1.5 text-xs font-semibold rounded-lg bg-vayu-600 text-white hover:bg-vayu-700 transition-colors"
            >
              Switch to 24h Diurnal Model
            </button>
          </div>
        )
      ) : (
        /* 24-Hour Diurnal Ambient Inversion Curve */
        <div id="panel-diurnal" role="tabpanel" aria-labelledby="tab-diurnal">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={diurnalData} margin={{ top: 15, right: 15, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="diurnalAqiGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0f766e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#0f766e" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="time"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <Tooltip content={<DiurnalTooltip />} />
                {currentAqi && (
                  <ReferenceLine
                    y={currentAqi}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    label={{
                      value: `Current: ${currentAqi}`,
                      position: 'insideTopRight',
                      fill: '#ef4444',
                      fontSize: 10,
                    }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="aqi"
                  stroke="#0f766e"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#diurnalAqiGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-500 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span><strong>06:00 - 09:00:</strong> Inversion Peak (Avoid Outdoor Cardio)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span><strong>12:00 - 15:00:</strong> Solar Mixing (Best Ventilation Window)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span><strong>18:00 - 21:00:</strong> Evening Rush Hour Smog Buildup</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
