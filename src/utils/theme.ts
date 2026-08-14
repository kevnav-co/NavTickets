// src/utils/theme.ts
// Dynamic theme utilities for multi-tenant branding - Optimized

import { CompanyConfig } from '../types/company';

/**
 * Simple LRU cache for theme computations
 */
const themeCache = new Map<string, ThemeVariables>();

interface ThemeVariables {
  primary: string;
  primaryRgb: string;
  primaryLight: string;
  primaryDark: string;
  primaryLighter: string;
  primaryDarker: string;
  contrast: string;
}

let lastAppliedConfig: CompanyConfig | null = null;

/**
 * Apply a company's theme to the document root as CSS variables.
 * Optimized: only applies if theme actually changed.
 * Call this whenever the company configuration changes.
 */
export function applyCompanyTheme(config: CompanyConfig): void {
  // Quick check - skip if same config
  if (lastAppliedConfig === config ||
      (lastAppliedConfig && lastAppliedConfig.theme?.primaryColor === config.theme?.primaryColor &&
       lastAppliedConfig.name === config.name &&
       lastAppliedConfig.theme?.faviconUrl === config.theme?.faviconUrl &&
       lastAppliedConfig.theme?.iconUrl === config.theme?.iconUrl)) {
    return;
  }

  const primary = config.theme?.primaryColor || '#7b1113';

  // Get or compute theme variables from cache
  const vars = getThemeVariables(primary);

  // Batch all DOM writes together
  requestAnimationFrame(() => {
    const root = document.documentElement;

    // Apply all CSS variables at once
    root.style.setProperty('--color-primary', vars.primary);
    root.style.setProperty('--color-primary-rgb', vars.primaryRgb);
    root.style.setProperty('--color-primary-light', vars.primaryLight);
    root.style.setProperty('--color-primary-dark', vars.primaryDark);
    root.style.setProperty('--color-primary-lighter', vars.primaryLighter);
    root.style.setProperty('--color-primary-darker', vars.primaryDarker);

    // Update meta tags
    document.title = config.name + ' - Gestión de Mantenimiento';
    updateMetaTag('theme-color', vars.primary);
    updateMetaTag('application-name', config.name);
    updateMetaTag('apple-mobile-web-app-title', config.name);

    // Update favicon if changed
    if (config.theme?.faviconUrl) {
      updateFavicon(config.theme.faviconUrl);
    }

    // Update apple-touch-icon if changed
    if (config.theme?.iconUrl) {
      updateAppleTouchIcon(config.theme.iconUrl);
    }

    lastAppliedConfig = config;
  });
}

function getThemeVariables(primary: string): ThemeVariables {
  if (themeCache.has(primary)) {
    return themeCache.get(primary)!;
  }

  const primaryRgb = hexToRgb(primary);
  const vars: ThemeVariables = {
    primary,
    primaryRgb,
    primaryLight: lightenColor(primary, 20),
    primaryDark: darkenColor(primary, 20),
    primaryLighter: lightenColor(primary, 40),
    primaryDarker: darkenColor(primary, 40),
    contrast: getContrastColor(primary),
  };

  // Limit cache size
  if (themeCache.size > 50) {
    const firstKey = themeCache.keys().next().value;
    if (firstKey) themeCache.delete(firstKey);
  }
  themeCache.set(primary, vars);

  return vars;
}

function updateMetaTag(name: string, content: string): void {
  const meta = document.querySelector(`meta[name="${name}"]`);
  if (meta) meta.setAttribute('content', content);
}

function updateFavicon(href: string): void {
  const selector = 'link[rel="icon"]';
  let link = document.querySelector(selector) as HTMLLinkElement;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    document.head.appendChild(link);
  }
  if (link.href !== href) link.href = href;
}

function updateAppleTouchIcon(href: string): void {
  const selector = 'link[rel="apple-touch-icon"]';
  let link = document.querySelector(selector) as HTMLLinkElement;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'apple-touch-icon';
    document.head.appendChild(link);
  }
  if (link.href !== href) link.href = href;
}

/**
 * Convert a hex color to an RGB comma-separated string for rgba(var(--color-primary-rgb), 0.5)
 * Optimized: no regex, direct parsing
 */
export function hexToRgb(hex: string): string {
  // Remove # if present
  const cleanHex = hex.startsWith('#') ? hex.slice(1) : hex;

  // Handle 3-char hex (e.g., #fff)
  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16);
    const g = parseInt(cleanHex[1] + cleanHex[1], 16);
    const b = parseInt(cleanHex[2] + cleanHex[2], 16);
    return `${r}, ${g}, ${b}`;
  }

  // Standard 6-char hex
  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    return `${r}, ${g}, ${b}`;
  }

  // Fallback to default (NavTickets red)
  return '123, 17, 19';
}

/**
 * Lighten a hex color by a percentage (0-100)
 * Optimized: no string manipulation in hot path
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
 * Optimized: no string manipulation in hot path
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

/**
 * Pre-compute theme variables for a set of colors (useful for color pickers)
 */
export function computeThemeVariables(colors: string[]): Map<string, ThemeVariables> {
  const result = new Map<string, ThemeVariables>();
  for (const color of colors) {
    result.set(color, getThemeVariables(color));
  }
  return result;
}

/**
 * Force clear the theme cache (useful for testing or theme reset)
 */
export function clearThemeCache(): void {
  themeCache.clear();
  lastAppliedConfig = null;
}