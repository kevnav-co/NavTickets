// src/components/custom/ComponentRegistry.ts
// Maps built-in component names to React.lazy imports for dynamic rendering.

import React from 'react';

/**
 * Lazy-loaded built-in components keyed by their registry name.
 * Add new entries here when a new built-in page is created.
 */
const BUILT_IN_COMPONENTS: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  dashboard: React.lazy(() => import('../dashboard/Dashboard')),
  orders: React.lazy(() => import('../order/OrderList')),
  clients: React.lazy(() => import('../client/ClientManager')),
  equipment: React.lazy(() => import('../equipment/EquipmentManager')),
  tasks: React.lazy(() => import('../task/Tasks')),
  map: React.lazy(() => import('../map/ClientMap')),
  users: React.lazy(() => import('../user/UserManager')),
  accounting: React.lazy(() => import('../Account/Accounting')),
};

/**
 * Returns the React component for a given built-in component name.
 * Returns null if the name is not registered.
 */
export function getBuiltInComponent(name: string): React.LazyExoticComponent<React.ComponentType<any>> | null {
  return BUILT_IN_COMPONENTS[name] || null;
}

/**
 * Returns an array of all registered built-in component names.
 */
export function getRegisteredComponentNames(): string[] {
  return Object.keys(BUILT_IN_COMPONENTS);
}

export default BUILT_IN_COMPONENTS;