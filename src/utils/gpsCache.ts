// --- GPS CACHE SYSTEM ---
const GPS_CACHE_KEY = 'navas_gps_cache_v1';

export const getCachedGps = (address: string): { lat: number, lng: number } | null => {
  try {
    if (!address) return null;
    const cache = JSON.parse(localStorage.getItem(GPS_CACHE_KEY) || '{}');
    const normalizedAddr = address.trim().toLowerCase();
    return cache[normalizedAddr] || null;
  } catch (e) {
    return null;
  }
};

export const setCachedGps = (address: string, lat: number, lng: number) => {
  try {
    if (!address || !lat || !lng) return;
    const cache = JSON.parse(localStorage.getItem(GPS_CACHE_KEY) || '{}');
    const normalizedAddr = address.trim().toLowerCase();
    
    // Solo guardar si no existe o es diferente (aunque aquí asumimos que lo nuevo es mejor)
    cache[normalizedAddr] = { lat, lng };
    localStorage.setItem(GPS_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error("Error saving GPS cache:", e);
  }
};
