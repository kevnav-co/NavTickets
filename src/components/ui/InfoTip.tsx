// src/components/ui/InfoTip.tsx
// Small informational icon that shows an elegant tooltip on hover with a longer
// explanation of a field, giving absolute clarity about what to fill.
// Pure CSS tooltip — no dependencies, no JS positioning.

import React from 'react';
import { Info } from 'lucide-react';

interface InfoTipProps {
  text: string;
  side?: 'top' | 'bottom';
  className?: string;
}

const InfoTip: React.FC<InfoTipProps> = ({ text, side = 'top', className }) => (
  <span className={`relative inline-flex items-center group ${className ?? ''}`}>
    <Info
      size={14}
      className="text-gray-400 hover:text-primary cursor-help transition-colors"
      aria-label="Más información"
    />
    <span
      role="tooltip"
      className={`pointer-events-none absolute left-1/2 -translate-x-1/2 z-30 w-64 px-3 py-2 rounded-xl bg-gray-900/95 text-white text-[11px] leading-relaxed font-medium shadow-xl border border-white/10 text-left opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${
        side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
      }`}
    >
      {text}
    </span>
  </span>
);

export default InfoTip;