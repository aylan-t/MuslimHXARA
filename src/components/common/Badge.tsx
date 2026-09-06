import React from 'react';

interface BadgeProps {
  variant: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ variant, children, className = '' }) => {
  const styles = {
    success: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
    warning: 'bg-amber-100 text-amber-800 border border-amber-300',
    error: 'bg-red-100 text-red-800 border border-red-300',
    info: 'bg-sky-100 text-sky-800 border border-sky-300',
    neutral: 'bg-slate-100 text-slate-700 border border-slate-300'
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

