// src/components/shared/CompanyLogo.tsx
// Dynamic company logo that renders the current company's logo from CompanyContext

import React, { useState } from 'react';
import { useCompany } from '../../context/CompanyContext';

interface CompanyLogoProps {
  className?: string;
  variant?: 'default' | 'white';
  alt?: string;
}

const FALLBACK_LOGO = '/assets/logo-inicio.png';

const CompanyLogo: React.FC<CompanyLogoProps> = ({ className, variant = 'default', alt }) => {
  const { company } = useCompany();
  const [imgError, setImgError] = useState(false);

  const src = variant === 'white' && company.theme.logoWhiteUrl
    ? company.theme.logoWhiteUrl
    : company.theme.logoUrl || FALLBACK_LOGO;

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