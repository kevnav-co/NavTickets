// src/components/ui/Toast.tsx
// Elegant toast notification with success and error variants.
// Auto-dismisses after a delay (longer for errors) and offers a close button.
// Used in AdminPanel (success on save) and CompanyForm (validation/server errors).

import React, { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

interface ToastProps {
  message: string | null;
  onDismiss: () => void;
  variant?: 'success' | 'error';
  duration?: number;
}

const Toast: React.FC<ToastProps> = ({
  message,
  onDismiss,
  variant = 'success',
  duration,
}) => {
  // Errores duran más para dar tiempo a leerlos.
  const resolvedDuration = duration ?? (variant === 'error' ? 7000 : 3500);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, resolvedDuration);
    return () => clearTimeout(t);
  }, [message, resolvedDuration, onDismiss]);

  if (!message) return null;

  const isError = variant === 'error';

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] px-3">
      <div
        className={`flex items-center gap-2.5 pl-4 pr-2 py-3 text-white text-sm font-bold rounded-2xl shadow-2xl border ${
          isError
            ? 'bg-red-600/95 border-red-500/40'
            : 'bg-gray-900/95 border-white/10'
        }`}
      >
        {isError
          ? <AlertTriangle size={18} className="text-amber-300 flex-shrink-0" />
          : <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />}
        <span className="leading-snug">{message}</span>
        <button
          onClick={onDismiss}
          className="ml-1 p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors flex-shrink-0"
          aria-label="Cerrar"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
};

export default Toast;