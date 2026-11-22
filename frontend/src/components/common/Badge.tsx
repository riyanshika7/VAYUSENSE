import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'emerald' | 'amber' | 'orange' | 'rose' | 'purple' | 'slate' | 'teal';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'slate',
  size = 'md',
  className = '',
}) => {
  const variantStyles = {
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    amber: 'bg-amber-50 text-amber-900 border-amber-200/80',
    orange: 'bg-orange-50 text-orange-900 border-orange-200/80',
    rose: 'bg-rose-50 text-rose-900 border-rose-200/80',
    purple: 'bg-purple-50 text-purple-900 border-purple-200/80',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    teal: 'bg-teal-50 text-teal-800 border-teal-200/80',
  }[variant];

  const sizeStyles = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  }[size];

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${variantStyles} ${sizeStyles} ${className}`}
    >
      {children}
    </span>
  );
};
