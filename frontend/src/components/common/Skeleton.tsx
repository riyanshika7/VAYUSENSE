/**
 * Skeleton — shimmer placeholder components for loading states.
 *
 * Keeps loading UI visually consistent with final card dimensions so there
 * is no layout shift when real data arrives.
 */

import React from 'react';

// ─── Base primitive ───────────────────────────────────────────────────────────
interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-lg bg-slate-200/80 ${className}`} />
);

// ─── AQI Hero Card skeleton ───────────────────────────────────────────────────
export const AQIHeroCardSkeleton: React.FC = () => (
  <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm p-6 space-y-5">
    {/* Header row */}
    <div className="flex items-start justify-between pb-4 border-b border-slate-100">
      <div className="space-y-2 w-2/3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-3 w-36" />
      </div>
      <Skeleton className="h-6 w-20 rounded-full" />
    </div>

    {/* AQI value + health panel */}
    <div className="grid grid-cols-12 gap-6 py-2 items-center">
      <div className="col-span-5 space-y-3">
        <Skeleton className="h-16 w-28" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <div className="col-span-7 space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>

    {/* Attribution strip */}
    <div className="flex justify-between pt-3 border-t border-slate-100">
      <Skeleton className="h-3 w-48" />
      <Skeleton className="h-3 w-28" />
    </div>
  </div>
);

// ─── Pollutant Breakdown skeleton ─────────────────────────────────────────────
export const PollutantBreakdownSkeleton: React.FC = () => (
  <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm p-6">
    <div className="pb-4 border-b border-slate-100 mb-5 space-y-1.5">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-3 w-96 max-w-full" />
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl p-3.5 border border-slate-100 bg-slate-50 space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-8" />
          </div>
          <Skeleton className="h-7 w-14" />
          <Skeleton className="h-2.5 w-full" />
        </div>
      ))}
    </div>
  </div>
);

// ─── Exposure Risk Score skeleton ─────────────────────────────────────────────
export const ExposureRiskSkeleton: React.FC = () => (
  <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm p-6 space-y-5">
    <div className="flex justify-between pb-4 border-b border-slate-100">
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-5 w-52" />
      </div>
      <Skeleton className="h-6 w-24 rounded-full" />
    </div>
    <div className="space-y-3 py-2">
      <div className="flex justify-between">
        <Skeleton className="h-12 w-24" />
        <Skeleton className="h-8 w-28" />
      </div>
      <Skeleton className="h-3 w-full rounded-full" />
      <div className="flex justify-between">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-2 w-8" />
        ))}
      </div>
    </div>
    <Skeleton className="h-14 w-full rounded-xl" />
  </div>
);

// ─── Generic card skeleton ────────────────────────────────────────────────────
export const GenericCardSkeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm p-6 space-y-4">
    <div className="pb-4 border-b border-slate-100 space-y-1.5">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-64" />
    </div>
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={`h-4 ${i % 2 === 0 ? 'w-full' : 'w-5/6'}`} />
      ))}
    </div>
  </div>
);
