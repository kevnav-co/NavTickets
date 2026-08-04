import { useConnectivityStatus } from './useConnectivityStatus';

/**
 * Simple offline status hook that derives online/offline state from the
 * connectivity status hook. Supabase does not expose a pending‑writes API
 * like Firestore, so we only expose the basic flags.
 */
export const useOfflineStatus = () => {
  const { isOffline } = useConnectivityStatus();
  const isOnline = !isOffline;
  // No pending‑writes tracking needed – Supabase writes are immediate.
  return { isOnline, isSyncing: false, pendingChanges: isOffline };
};
