// src/components/shared/CompanyLogo.tsx
// Dynamic company logo that renders the current company's logo from CompanyContext

import React, { useState } from 'react';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';

interface CompanyLogoProps {
  className?: string;
  variant?: 'default' | 'white';
  alt?: string;
  /** Fuerza el logo de la empresa actual aunque el usuario sea super_admin
   *  (por defecto el super_admin ve su logo de gestor). Lo usa el sidebar de
   *  escritorio para mostrar siempre la imagen de la empresa en cuestión. */
  forceCompany?: boolean;
}

const FALLBACK_LOGO = '/assets/logo-inicio.png';
// Logo que identifica al super_admin (gestor de todas las empresas).
const SUPER_ADMIN_LOGO = '/assets/logo-superadmin.png';

const CompanyLogo: React.FC<CompanyLogoProps> = ({ className, variant = 'default', alt, forceCompany = false }) => {
  const { company } = useCompany();
  const { currentUser } = useAuth();
  const [imgError, setImgError] = useState(false);

  // El super_admin ve su logo propio a menos que se fuerce el de la empresa;
  // cada empresa ve el logo de su empresa.
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const src = variant === 'white'
    ? (company.theme.logoWhiteUrl || company.theme.logoUrl || FALLBACK_LOGO)
    : (isSuperAdmin && !forceCompany)
      ? SUPER_ADMIN_LOGO
      : (company.theme.logoUrl || FALLBACK_LOGO);

  const displayAlt = alt || company.name || 'Logo';

  return (
    <img
      src={imgError ? FALLBACK_LOGO : src}
      alt={displayAlt}
      className={className}
      onError={() => setImgError(true)}
      loading="lazy"
    />
  );
};

export default CompanyLogo;