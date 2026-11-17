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
    ? (company.theme.logoWhiteUrl || company.theme.logoUrl)
    : (isSuperAdmin && !forceCompany)
      ? SUPER_ADMIN_LOGO
      : company.theme.logoUrl;

  const displayAlt = alt || company.name || 'Logo';

  // Sin imagen propia no sirve recurrir al archivo por defecto: es la variante
  // blanca del logo y sobre un fondo claro queda invisible, de modo que la
  // cabecera parece vacía. El nombre de la empresa cumple el mismo papel y se
  // lee en cualquier fondo.
  // No hereda `className`: ahí viajan medidas pensadas para la imagen (alto
  // máximo, ancho máximo, object-contain) que sobre un texto solo lo recortarían.
  if (!src || imgError) {
    return (
      <span
        className={`font-bold tracking-tight truncate leading-tight max-w-full text-[15px] ${
          variant === 'white' ? 'text-white' : 'text-primary'
        }`}
        title={displayAlt}
      >
        {company.name || 'NavTickets'}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={displayAlt}
      className={className}
      onError={() => setImgError(true)}
      loading="lazy"
    />
  );
};

export default CompanyLogo;