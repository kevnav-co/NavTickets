// src/components/ui/Toast.tsx
// Lightweight success toast: auto-dismisses after a delay and offers a close button.
// No external deps — kept local to the project style.

import React, { useEffect } from 'react';
import { CheckCircle2, X } from 'lucide-react';

interface ToastProps {
  message: string | null;
  onDismiss: () => void;
  duration?: number;
}

const Toast: React.FC<ToastProps> = ({ message, onDismiss, duration = 3500 }) => {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [message, duration, onDismiss]);

  if (!message) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70]">
      <div className="flex items-center gap-2 pl-4 pr-2 py-3 bg-gray-900/95 text-white text-sm font-bold rounded-2xl shadow-2xl border border-white/10">
        <CheckCircle2 size={18} className="text-emerald-400" />
        <span>{message}</span>
        <button
          onClick={onDismiss}
          className="ml-1 p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          aria-label="Cerrar"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
};

export default Toast;