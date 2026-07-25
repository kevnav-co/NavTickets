// src/utils/theme.ts
// Dynamic theme utilities for multi-tenant branding

import { CompanyConfig } from '../types/company';

/**
 * Apply a company's theme to the document root as CSS variables.
 * Call this whenever the company configuration changes.
 */
export function applyCompanyTheme(config: CompanyConfig): void {
  const root = document.documentElement;
  const primary = config.theme.primaryColor || '#7b1113';
  const primaryRgb = hexToRgb(primary);

  root.style.setProperty('--color-primary', primary);
  root.style.setProperty('--color-primary-rgb', primaryRgb);

  // Generate lighter/darker variants
  root.style.setProperty('--color-primary-light', lightenColor(primary, 20));
  root.style.setProperty('--color-primary-dark', darkenColor(primary, 20));
  root.style.setProperty('--color-primary-lighter', lightenColor(primary, 40));
  root.style.setProperty('--color-primary-darker', darkenColor(primary, 40));

  // Update meta tags
  document.title = config.name + ' - Gestión de Mantenimiento';
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', primary);
  const metaAppName = document.querySelector('meta[name="application-name"]');
  if (metaAppName) metaAppName.setAttribute('content', config.name);
  const metaAppleTitle = document.querySelector('meta[apple-mobile-web-app-title"]');
  if (metaAppleTitle) metaAppleTitle.setAttribute('content', config.name);

  // Update favicon if a custom one is provided
  if (config.theme.faviconUrl) {
    let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/png';
      document.head.appendChild(link);
    }
    link.href = config.theme.faviconUrl;
  }

  // Update apple-touch-icon
  if (config.theme.iconUrl) {
    let appleLink = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement;
    if (!appleLink) {
      appleLink = document.createElement('link');
      appleLink.rel = 'apple-touch-icon';
      document.head.appendChild(appleLink);
    }
    appleLink.href = config.theme.iconUrl;
  }
}

/**
 * Convert a hex color to an RGB comma-separated string for rgba(var(--color-primary-rgb), 0.5)
 */
export function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '123, 17, 19';
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

/**
 * Lighten a hex color by a percentage (0-100)
 */
export function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * (percent / 100)));
  const g = Math.min(255, Math.floor(((num >> 8) & 0x00FF) + (255 - ((num >> 8) & 0x00FF)) * (percent / 100)));
  const b = Math.min(255, Math.floor((num & 0x0000FF) + (255 - (num & 0x0000FF)) * (percent / 100)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Darken a hex color by a percentage (0-100)
 */
export function darkenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.floor((num >> 16) * (1 - percent / 100)));
  const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * (1 - percent / 100)));
  const b = Math.max(0, Math.floor((num & 0x0000FF) * (1 - percent / 100)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Get a contrast color (black or white) for text on a colored background
 */
export function getContrastColor(hex: string): string {
  const rgb = hexToRgb(hex).split(',').map(Number);
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
}