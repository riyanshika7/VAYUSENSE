import React from 'react';
import { Activity, Thermometer, Droplets, Gauge, Wind } from 'lucide-react';
import { PollutantMeasurements } from '../../types/aqi';

interface PollutantBreakdownProps {
  pollutants: PollutantMeasurements;
}

export const PollutantBreakdown: React.FC<PollutantBreakdownProps> = ({ pollutants }) => {
  const pollutantList = [
    {
      id: 'pm25',
      name: 'PM2.5',
      description: 'Fine Respirable Particles',
      data: pollutants.pm25,
      critical: true,
    },
    {
      id: 'pm10',
      name: 'PM10',
      description: 'Coarse Inhalable Dust',
      data: pollutants.pm10,
      critical: true,
    },
    {
      id: 'no2',
      name: 'NO₂',
      description: 'Nitrogen Dioxide',
      data: pollutants.no2,
      critical: false,
    },
    {
      id: 'so2',
      name: 'SO₂',
      description: 'Sulfur Dioxide',
      data: pollutants.so2,
      critical: false,
    },
    {
      id: 'co',
      name: 'CO',
      description: 'Carbon Monoxide',
      data: pollutants.co,
      critical: false,
    },
    {
      id: 'o3',
      name: 'O₃',
      description: 'Surface Ozone',
      data: pollutants.o3,
      critical: false,
    },
  ];

  const meteo = pollutants.meteorological;

  return (
    <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm p-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
            <Activity className="w-4 h-4 text-vayu-600" />
            Pollutant Concentrations & Indices
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Individual pollutant sub-indices reported by station sensors (missing sensors are marked as unmeasured)
          </p>
        </div>
      </div>

      {/* Grid of Pollutant Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {pollutantList.map((item) => {
          const isReported = item.data && item.data.value !== undefined && item.data.value !== null;
          return (
            <div
              key={item.id}
              className={`rounded-xl p-3.5 border transition-all ${
                isReported
                  ? item.critical && item.data && item.data.value > 100
                    ? 'bg-rose-50/50 border-rose-200/80'
                    : 'bg-slate-50/60 border-slate-200/70 hover:border-slate-300'
                  : 'bg-slate-50/40 border-slate-200/70'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className={`text-xs font-bold font-mono ${isReported ? 'text-slate-700' : 'text-slate-600'}`}>
                  {item.name}
                </span>
                <span className={`text-[10px] font-medium truncate ${item.critical && item.data && item.data.value > 100 ? 'text-rose-700 font-bold' : 'text-slate-400'}`}>
                  {isReported ? (item.critical && item.data && item.data.value > 100 ? 'Elevated' : 'IAQI') : ''}
                </span>
              </div>

              <div className="mt-2">
                {isReported ? (
                  <span className="text-2xl font-extrabold font-mono text-slate-900 tracking-tight">
                    {item.data?.value}
                  </span>
                ) : (
                  <span className="text-xs font-medium text-slate-500 italic">
                    Not reported
                  </span>
                )}
              </div>

              <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">
                {item.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Meteorological strip if reported */}
      {meteo && Object.keys(meteo).length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-6 text-xs text-slate-600">
          <span className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
            Atmospheric Sensors:
          </span>
          {meteo.t !== undefined && (
            <div className="flex items-center gap-1.5 font-medium">
              <Thermometer className="w-3.5 h-3.5 text-amber-500" />
              <span>{meteo.t}°C Temperature</span>
            </div>
          )}
          {meteo.h !== undefined && (
            <div className="flex items-center gap-1.5 font-medium">
              <Droplets className="w-3.5 h-3.5 text-blue-500" />
              <span>{meteo.h}% Humidity</span>
            </div>
          )}
          {meteo.p !== undefined && (
            <div className="flex items-center gap-1.5 font-medium">
              <Gauge className="w-3.5 h-3.5 text-slate-500" />
              <span>{meteo.p} hPa Pressure</span>
            </div>
          )}
          {meteo.w !== undefined && (
            <div className="flex items-center gap-1.5 font-medium">
              <Wind className="w-3.5 h-3.5 text-teal-600" />
              <span>{meteo.w} m/s Wind</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
