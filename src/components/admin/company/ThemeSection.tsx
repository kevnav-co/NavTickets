import React, { useRef } from 'react';
import { Palette, X } from 'lucide-react';
import { CompanyTheme } from '../../../types/company';
import InfoTip from '../../ui/InfoTip';

interface ThemeSectionProps {
  theme: CompanyTheme;
  setTheme: React.Dispatch<React.SetStateAction<CompanyTheme>>;
  companyId: string | null;
  createdCompanyId: string | null;
  uploading: 'logo' | 'icon' | 'logoWhite' | 'favicon' | null;
  onImageUpload: (file: File, type: 'logo' | 'icon' | 'logoWhite' | 'favicon') => Promise<void>;
}

const ThemeSection: React.FC<ThemeSectionProps> = ({
  theme, setTheme, companyId, createdCompanyId, uploading, onImageUpload,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const logoWhiteInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const triggerFileInput = (type: 'logo' | 'icon' | 'logoWhite' | 'favicon') => {
    if (type === 'logo') fileInputRef.current?.click();
    else if (type === 'icon') iconInputRef.current?.click();
    else if (type === 'logoWhite') logoWhiteInputRef.current?.click();
    else faviconInputRef.current?.click();
  };

  const canUpload = !!(companyId ?? createdCompanyId);

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Palette size={18} className="text-primary" /> Tema y Branding
      </h2>
      <div className="space-y-4">
        {/* Primary Color */}
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1 block">Color Principal</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={theme.primaryColor}
              onChange={e => setTheme(prev => ({ ...prev, primaryColor: e.target.value }))}
              className="w-12 h-12 rounded-xl border border-gray-200 cursor-pointer"
            />
            <span className="text-sm font-mono text-gray-600">{theme.primaryColor}</span>
          </div>
        </div>

        {/* Logo */}
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1 block">Logo (fondo claro)</label>
          <div className="flex items-center gap-3">
            {theme.logoUrl && (
              <img src={theme.logoUrl} alt="Logo" className="w-16 h-16 object-contain rounded-xl border border-gray-100" />
            )}
            <button
              type="button"
              onClick={() => canUpload ? triggerFileInput('logo') : alert('Guarda la empresa primero antes de subir imágenes.')}
              disabled={uploading === 'logo'}
              className="h-11 px-4 bg-gray-100 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {uploading === 'logo' ? 'Subiendo...' : theme.logoUrl ? 'Cambiar' : 'Subir Logo'}
            </button>
            {theme.logoUrl && (
              <button
                type="button"
                onClick={() => setTheme(prev => ({ ...prev, logoUrl: '' }))}
                className="p-2 text-gray-400 hover:text-red-500"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && onImageUpload(e.target.files[0], 'logo')} />
        </div>

        {/* Logo White */}
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1 block">Logo (fondo oscuro, opcional)</label>
          <div className="flex items-center gap-3">
            {theme.logoWhiteUrl && (
              <img src={theme.logoWhiteUrl} alt="Logo White" className="w-16 h-16 object-contain rounded-xl border border-gray-800 bg-gray-800" />
            )}
            <button
              type="button"
              onClick={() => canUpload ? triggerFileInput('logoWhite') : alert('Guarda la empresa primero antes de subir imágenes.')}
              disabled={uploading === 'logoWhite'}
              className="h-11 px-4 bg-gray-100 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {uploading === 'logoWhite' ? 'Subiendo...' : theme.logoWhiteUrl ? 'Cambiar' : 'Subir'}
            </button>
            {theme.logoWhiteUrl && (
              <button onClick={() => setTheme(prev => ({ ...prev, logoWhiteUrl: '' }))} className="p-2 text-gray-400 hover:text-red-500"><X size={16} /></button>
            )}
          </div>
          <input ref={logoWhiteInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && onImageUpload(e.target.files[0], 'logoWhite')} />
        </div>

        {/* Icon */}
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1 block">Icono de App</label>
          <div className="flex items-center gap-3">
            {theme.iconUrl && (
              <img src={theme.iconUrl} alt="Icon" className="w-12 h-12 object-contain rounded-xl border border-gray-100" />
            )}
            <button
              type="button"
              onClick={() => canUpload ? triggerFileInput('icon') : alert('Guarda la empresa primero antes de subir imágenes.')}
              disabled={uploading === 'icon'}
              className="h-11 px-4 bg-gray-100 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {uploading === 'icon' ? 'Subiendo...' : theme.iconUrl ? 'Cambiar' : 'Subir Icono'}
            </button>
            {theme.iconUrl && (
              <button onClick={() => setTheme(prev => ({ ...prev, iconUrl: '' }))} className="p-2 text-gray-400 hover:text-red-500"><X size={16} /></button>
            )}
          </div>
          <input ref={iconInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && onImageUpload(e.target.files[0], 'icon')} />
        </div>

        {/* Favicon */}
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1 block">Favicon</label>
          <div className="flex items-center gap-3">
            {theme.faviconUrl && (
              <img src={theme.faviconUrl} alt="Favicon" className="w-8 h-8 object-contain rounded-lg border border-gray-100" />
            )}
            <button
              type="button"
              onClick={() => canUpload ? triggerFileInput('favicon') : alert('Guarda la empresa primero antes de subir imágenes.')}
              disabled={uploading === 'favicon'}
              className="h-11 px-4 bg-gray-100 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {uploading === 'favicon' ? 'Subiendo...' : theme.faviconUrl ? 'Cambiar' : 'Subir Favicon'}
            </button>
            {theme.faviconUrl && (
              <button onClick={() => setTheme(prev => ({ ...prev, faviconUrl: undefined }))} className="p-2 text-gray-400 hover:text-red-500"><X size={16} /></button>
            )}
          </div>
          <input ref={faviconInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && onImageUpload(e.target.files[0], 'favicon')} />
        </div>

        {/* Accent Color */}
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1 block">Color de Acento</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={theme.accentColor || theme.primaryColor}
              onChange={e => setTheme(prev => ({ ...prev, accentColor: e.target.value }))}
              className="w-12 h-12 rounded-xl border border-gray-200 cursor-pointer"
            />
            <span className="text-sm font-mono text-gray-600">{theme.accentColor || '— (usa primary)'}</span>
          </div>
        </div>

        {/* Secondary Color */}
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1 block">Color Secundario</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={theme.secondaryColor || theme.primaryColor}
              onChange={e => setTheme(prev => ({ ...prev, secondaryColor: e.target.value }))}
              className="w-12 h-12 rounded-xl border border-gray-200 cursor-pointer"
            />
            <span className="text-sm font-mono text-gray-600">{theme.secondaryColor || '— (usa primary oscuro)'}</span>
          </div>
        </div>

        {/* Suffix de la app */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-xs font-bold text-gray-500">Sufijo del nombre de la app</label>
            <InfoTip text="Texto que acompaña al nombre de la empresa en el título de la ventana/PWA. Default: ' - Gestión de Mantenimiento'. Déjalo vacío para mostrar solo el nombre." />
          </div>
          <input
            type="text"
            value={theme.titleSuffix ?? ''}
            onChange={e => setTheme(prev => ({ ...prev, titleSuffix: e.target.value }))}
            placeholder=" - Gestión de Mantenimiento"
            className="w-full h-11 px-4 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>
    </section>
  );
};

export default ThemeSection;
