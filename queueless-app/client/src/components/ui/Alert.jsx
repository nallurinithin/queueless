import React from 'react';
import { Info, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';

export function Alert({
  children,
  variant = 'info',
  title,
  className = '',
}) {
  const icons = {
    info: <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />,
    success: <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />,
    danger: <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />,
  };

  const variants = {
    info: 'bg-sky-50 border-sky-200 text-sky-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    danger: 'bg-rose-50 border-rose-200 text-rose-800',
  };

  return (
    <div
      role="alert"
      className={`flex items-start space-x-3 p-4 rounded-xl border text-sm ${variants[variant] || variants.info} ${className}`}
    >
      {icons[variant]}
      <div className="flex-1">
        {title && <h4 className="font-semibold mb-1">{title}</h4>}
        <div className="text-sm opacity-90 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
