import React from 'react';
import { Layers } from 'lucide-react';
import { CompanyFeatures } from '../../../types/company';

interface FeaturesSectionProps {
  features: CompanyFeatures;
  setFeatures: React.Dispatch<React.SetStateAction<CompanyFeatures>>;
}

const FEATURE_OPTIONS: { key: keyof CompanyFeatures; label: string }[] = [
  { key: 'accounting', label: 'Contabilidad' },
  { key: 'maps', label: 'Mapas' },
  { key: 'aiAssistant', label: 'Asistente IA' },
  { key: 'equipmentManagement', label: 'Gestión Máquinas' },
  { key: 'excelUpload', label: 'Subida de datos (Excel)' },
  { key: 'cuenti', label: 'Integración Cuenti' },
];

const FeaturesSection: React.FC<FeaturesSectionProps> = ({ features, setFeatures }) => (
  <section className="bg-raised rounded-2xl shadow-sm border border-line-soft p-5">
    <h2 className="font-bold text-ink mb-4 flex items-center gap-2">
      <Layers size={18} className="text-primary" /> Funcionalidades
    </h2>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {FEATURE_OPTIONS.map(feat => (
        <label key={feat.key} className="flex items-center gap-3 p-3 rounded-xl border border-line-soft cursor-pointer hover:bg-sunken transition-colors">
          <input
            type="checkbox"
            checked={features[feat.key]}
            onChange={e => setFeatures(prev => ({ ...prev, [feat.key]: e.target.checked }))}
            className="w-4 h-4 rounded accent-primary"
          />
          <span className="text-sm font-medium text-ink-soft">{feat.label}</span>
        </label>
      ))}
    </div>
  </section>
);

export default FeaturesSection;
