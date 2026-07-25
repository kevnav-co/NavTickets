
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { writeBatch, doc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { User, OrderStatus } from '../../types';
import { useNavigate, Navigate } from 'react-router-dom';
import { Loader2, Navigation, RefreshCw, Layers, Check, WifiOff } from 'lucide-react';
import { getCachedGps, setCachedGps } from '../../utils/index';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import PERMISSIONS, { hasPermission, ROLES } from '../../permissions';

// NOTE: Leaflet and its CSS are now loaded dynamically in a useEffect hook.

const ClientMap: React.FC = () => {
  const navigate = useNavigate();
  const { clients, orders, users, updateItem } = useData();
  const { currentUser } = useAuth();
  const { isInternetAvailable } = useOfflineStatus();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null); // To store the dynamically imported Leaflet module
  const mapInstanceRef = useRef<any | null>(null); // To store the map instance
  const markersLayerRef = useRef<any | null>(null);
  const tileLayerRef = useRef<any | null>(null); 

  const [isMapReady, setIsMapReady] = useState(false);
  const [showClients] = useState(true);
  const [showUsers, setShowUsers] = useState(true);
  const [showWithService, setShowWithService] = useState(true);
  const [showWithoutService, setShowWithoutService] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [mapStyle, setMapStyle] = useState<'default' | 'hot'>('default');
  const [showLayerMenu, setShowLayerMenu] = useState(false);

  const DEFAULT_CENTER: [number, number] = [8.7559, -75.8870]; 

  const validUsers = useMemo(() => {
    const allValidUsers = (users || []).filter((u: User) => u.latitude && u.longitude);
    if (!currentUser) return [];
    const { role, id } = currentUser;

    if (role === ROLES.ADMIN || role === ROLES.DEVELOPER || role === ROLES.SUPERVISOR) {
        return allValidUsers;
    }
    if (role === ROLES.TECHNICIAN) {
        return allValidUsers.filter(u => u.id === id);
    }
    return [];
  }, [users, currentUser]);

  const validClients = useMemo(() => {
    const allValidClients = (clients || []).filter(c => c.latitude && c.longitude);
    if (!currentUser) return [];
    const { role, id } = currentUser;

    if (role === ROLES.ADMIN || role === ROLES.DEVELOPER) {
        return allValidClients;
    }

    const activeOrders = orders.filter(o => o.status !== OrderStatus.CLOSED);

    if (role === ROLES.SUPERVISOR) {
        const activeClientIds = new Set(activeOrders.map(o => o.clientId));
        return allValidClients.filter(c => activeClientIds.has(c.id));
    }
    
    if (role === ROLES.TECHNICIAN) {
        const techClientIds = new Set(activeOrders.filter(o => o.technicianId === id).map(o => o.clientId));
        return allValidClients.filter(c => techClientIds.has(c.id));
    }

    return [];
  }, [clients, orders, currentUser]);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initMap = async () => {
      try {
        // Dynamically import Leaflet and its CSS
        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');
        leafletRef.current = L;

        const map = L.map(mapContainerRef.current!, {
          center: DEFAULT_CENTER,
          zoom: 13,
          zoomControl: false,
          attributionControl: true 
        });

        L.control.zoom({ position: 'bottomright' }).addTo(map);
        map.attributionControl.setPrefix('<a href="https://leafletjs.com" title="A JS library for interactive maps">Leaflet</a>');

        markersLayerRef.current = L.layerGroup().addTo(map);
        mapInstanceRef.current = map;

        if (currentUser?.latitude && currentUser?.longitude) {
          map.setView([currentUser.latitude, currentUser.longitude], 14);
        }

        setIsMapReady(true); // Signal that the map is ready

      } catch (error) {
        console.error("Failed to load Leaflet map:", error);
        // Optionally, show an error message to the user
      }
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        setIsMapReady(false);
      }
    };
  }, [currentUser]);

  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current) return;
    const L = leafletRef.current;

    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

    let tileUrl = '';
    let attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

    switch (mapStyle) {
      case 'hot':
        tileUrl = 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png';
        attribution += ', Tiles style by <a href="https://www.hotosm.org/" target="_blank">HOT</a>';
        break;
      default:
        tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        break;
    }

    tileLayerRef.current = L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution: attribution
    }).addTo(mapInstanceRef.current);

    tileLayerRef.current.bringToBack();
  }, [mapStyle, isMapReady]);

  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current || !markersLayerRef.current) return;
    const L = leafletRef.current;

    const layer = markersLayerRef.current;
    layer.clearLayers();

    if (showClients) {
      validClients.forEach(client => {
        const hasActive = orders.some(o => o.clientId === client.id && o.status !== OrderStatus.CLOSED);
        
        if (hasActive && !showWithService) return;
        if (!hasActive && !showWithoutService) return;

        const color = hasActive ? '#2563EB' : '#6B7280'; 

        const clientIcon = L.divIcon({
          className: 'custom-div-icon',
          html: `
            <div style="position: relative; width: 34px; height: 38px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0px 3px 5px rgba(0,0,0,0.3));">
              <svg width="34" height="38" viewBox="0 0 34 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 0H30C32.2091 0 34 1.79086 34 4V30C34 32.2091 32.2091 34 30 34H21L17 38L13 34H4C1.79086 34 0 32.2091 0 30V4C0 1.79086 1.79086 0 4 0Z" fill="${color}" stroke="white" stroke-width="2.5"/>
              </svg>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; top: 8px; left: 8px;">
                <rect width="16" height="20" x="4" y="2" rx="2" ry="2"/>
                <path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>
              </svg>
            </div>
          `,
          iconSize: [34, 38],
          iconAnchor: [17, 38]
        });

        const marker = L.marker([client.latitude!, client.longitude!], { icon: clientIcon });
        
        const popupContent = document.createElement('div');
        popupContent.className = 'p-3 text-center';
        popupContent.innerHTML = `
          <div class="flex flex-col items-center">
            <h3 class="font-bold text-gray-900 text-sm mb-1 line-clamp-1">${client.name}</h3>
            <p class="text-[10px] text-gray-500 mb-3 line-clamp-2">${client.address}</p>
            <button id="view-client-${client.id}" class="w-full bg-primary text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-transform">Ver Expediente</button>
          </div>
        `;

        marker.bindPopup(popupContent);
        marker.on('popupopen', () => {
            document.getElementById(`view-client-${client.id}`)?.addEventListener('click', () => navigate(`/clients/${client.id}`));
        });

        layer.addLayer(marker);
      });
    }

    if (showUsers) {
      validUsers.forEach((user: User) => {
        const isMe = user.id === currentUser?.id;
        const initials = user.name.substring(0, 2).toUpperCase();
        
        const hasActiveOrder = orders.some(o => o.technicianId === user.id && o.status !== OrderStatus.CLOSED);
        const lastUpdate = user.locationUpdatedAt ? new Date(user.locationUpdatedAt).getTime() : 0;
        const isRecent = (Date.now() - lastUpdate) < (20 * 60 * 1000);
        
        const borderColor = hasActiveOrder ? '#22c55e' : (isRecent ? '#2563EB' : '#9ca3af');
        const dotColor = hasActiveOrder ? '#22c55e' : (isRecent ? '#2563EB' : null);

        const userIcon = L.divIcon({
          className: 'user-icon',
          html: `
            <div style="position: relative; cursor: pointer;">
              <div style="
                width: 38px; height: 38px; border-radius: 50%; 
                background-color: ${isMe ? 'var(--color-primary)' : '#1f2937'}; 
                color: white; display: flex; align-items: center; justify-content: center; 
                font-size: 11px; font-weight: 900; 
                border: 3px solid ${borderColor}; 
                box-shadow: 0 4px 6px rgba(0,0,0,0.2);
              ">${initials}</div>
              ${dotColor ? `
                <div style="
                  position: absolute; top: 0; right: 0; 
                  width: 10px; height: 10px; background-color: ${dotColor}; 
                  border-radius: 50%; border: 2px solid white;
                "></div>
              ` : ''}
            </div>
          `,
          iconSize: [38, 38],
          iconAnchor: [19, 19]
        });

        const marker = L.marker([user.latitude!, user.longitude!], { icon: userIcon, zIndexOffset: 1000 });
        const lastSeen = user.locationUpdatedAt ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(user.locationUpdatedAt)) : 'N/A';

        const statusText = hasActiveOrder ? '🟢 En servicio' : isRecent ? '🔵 Activo ahora' : `🔴 Visto: ${lastSeen}`;
        const statusColor = hasActiveOrder ? 'text-green-600 font-bold' : isRecent ? 'text-blue-600 font-bold' : 'text-gray-500';

        const popupContent = document.createElement('div');
        popupContent.className = 'p-3 text-center';
        popupContent.innerHTML = `
          <p class="text-[10px] font-black text-gray-400 uppercase mb-1">Técnico ${isMe ? '(Yo)' : ''}</p>
          <h3 class="font-bold text-gray-900 text-sm mb-1">${user.name}</h3>
          <p class="text-[10px] ${statusColor} mb-3">${statusText}</p>
          <button id="view-user-${user.id}" class="w-full bg-gray-100 text-gray-800 py-2 rounded-lg text-[10px] font-bold uppercase active:scale-95 transition-transform border border-gray-200">Ver Perfil</button>
        `;

        marker.bindPopup(popupContent);
        marker.on('popupopen', () => {
            document.getElementById(`view-user-${user.id}`)?.addEventListener('click', () => navigate(`/users/${user.id}`));
        });

        layer.addLayer(marker);
      });
    }

  }, [isMapReady, showClients, showUsers, showWithService, showWithoutService, validClients, validUsers, orders, navigate, currentUser]);

  const handleLocate = () => {
    if (!isMapReady || !navigator.geolocation || !mapInstanceRef.current || !currentUser) return;
    setIsLocating(true);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          updateItem('users', currentUser.id, { latitude, longitude, locationUpdatedAt: new Date().toISOString() });
          mapInstanceRef.current?.flyTo([latitude, longitude], 16);
          setIsLocating(false);
        },
        (error) => {
          setIsLocating(false);
          console.warn(`Geolocation Error: ${error.message}`);
        },
        { enableHighAccuracy: true }
      );
    } catch (error) {
        setIsLocating(false);
        console.warn('Geolocation failed due to permissions policy.');
    }
  };

  const handleUpdateCoordinates = async () => {
    const clientsToUpdate = clients.filter(c => c.address && c.address.length > 5 && (!c.latitude || !c.longitude || (c.latitude === 0 && c.longitude === 0)));
    if (clientsToUpdate.length === 0) {
      alert("Todos los clientes con dirección ya tienen ubicación válida.");
      return;
    }
    if (!window.confirm(`Se encontraron ${clientsToUpdate.length} clientes sin coordenadas. ¿Deseas geolocalizarlos automáticamente? Esta acción puede tardar y consume recursos.`)) return;

    setIsUpdating(true);
    try {
      const batch = writeBatch(db);
      let updatedCount = 0;
      let notFoundCount = 0;

      for (const client of clientsToUpdate) {
        try {
          const cachedCoords = getCachedGps(client.address);
          if (cachedCoords) {
            batch.update(doc(db, 'clients', client.id), { latitude: cachedCoords.lat, longitude: cachedCoords.lng });
            updatedCount++;
          } else {
            await new Promise(r => setTimeout(r, 1000));
            
            const query = encodeURIComponent(`${client.address}, Montería, Córdoba, Colombia`);
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1&countrycodes=co`);
            
            if (!response.ok) {
              console.warn(`Nominatim request failed for ${client.name} with status: ${response.status}`);
              continue;
            }

            const results = await response.json();

            if (results && results.length > 0) {
              const { lat, lon } = results[0];
              const latitude = parseFloat(lat);
              const longitude = parseFloat(lon);
              
              batch.update(doc(db, 'clients', client.id), { latitude, longitude });
              setCachedGps(client.address, latitude, longitude);
              updatedCount++;
            } else {
              console.log(`No results found for address: ${client.address}`);
              notFoundCount++;
            }
          }
        } catch (err) {
          console.error(`Error processing client ${client.name}:`, err);
        }
      }

      if (updatedCount > 0) {
        await batch.commit();
        alert(`¡Éxito! Se actualizaron ${updatedCount} clientes. ${notFoundCount > 0 ? `No se pudieron encontrar ${notFoundCount}.` : ''}`);
        window.location.reload();
      } else {
        alert(`No se pudo actualizar ninguna ubicación. ${notFoundCount > 0 ? `${notFoundCount} direcciones no fueron encontradas.` : ''}`);
      }
    } catch (error) {
      console.error("An error occurred during the geocoding batch process:", error);
      alert("Ocurrió un error inesperado al actualizar las coordenadas. Revisa la consola para más detalles.");
    } finally {
      setIsUpdating(false);
    }
  };

  const layers = [
      { id: 'default', label: 'OpenStreetMap' },
      { id: 'hot', label: 'OSM Humanitario' },
  ];

  if (!currentUser || !hasPermission(currentUser.role, PERMISSIONS.VIEW_MAP)) {
    return <Navigate to="/" />;
  }

  const userHasAdminRights = currentUser.role === ROLES.ADMIN || currentUser.role === ROLES.DEVELOPER;

  return (
    <div className="relative w-full h-[calc(100vh-140px)] md:h-[calc(100vh-80px)] rounded-t-[2.5rem] shadow-inner bg-gray-100 overflow-hidden border-t border-gray-200">
      {!isMapReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 z-10">
          <Loader2 size={32} className="animate-spin text-primary" />
          <p className="mt-4 text-sm font-bold text-gray-500">Cargando mapa...</p>
        </div>
      )}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {!isInternetAvailable && (
        <div className="absolute top-0 left-0 right-0 z-[1100] bg-orange-500 text-white px-4 py-2 text-center text-[10px] font-black uppercase tracking-widest shadow-md animate-in slide-in-from-top flex items-center justify-center gap-2">
           <WifiOff size={14} />
           <span>Modo Offline: Visualizando mapa en caché. Datos limitados.</span>
        </div>
      )}

      <div className={`absolute left-4 z-[1000] flex flex-col gap-2 ${!isInternetAvailable ? 'top-12' : 'top-4'}`}>
        <button onClick={handleLocate} className="w-11 h-11 bg-white rounded-2xl shadow-xl flex items-center justify-center text-primary active:scale-90 transition-transform border border-gray-100">
          {isLocating ? <Loader2 size={20} className="animate-spin" /> : <Navigation size={20} />}
        </button>
        <div className="relative">
            <button onClick={() => setShowLayerMenu(!showLayerMenu)} className={`w-11 h-11 rounded-2xl shadow-xl flex items-center justify-center active:scale-90 transition-transform border border-gray-100 ${showLayerMenu ? 'bg-primary text-white' : 'bg-white text-gray-700'}`}>
                <Layers size={20} />
            </button>
            {showLayerMenu && (
                <div className="absolute top-0 left-14 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 w-48 animate-in fade-in slide-in-from-left-2 overflow-hidden">
                    <div className="flex flex-col gap-1">
                        {layers.map(layer => (
                            <button key={layer.id} onClick={() => { setMapStyle(layer.id as any); setShowLayerMenu(false); }} className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-colors ${mapStyle === layer.id ? 'bg-gray-100 text-primary' : 'text-gray-600 hover:bg-gray-50'}`}>
                                <span>{layer.label}</span>
                                {mapStyle === layer.id && <Check size={14} />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
        {currentUser?.role === 'admin' && (
            <button onClick={handleUpdateCoordinates} disabled={isUpdating || !isInternetAvailable} className={`w-11 h-11 bg-white rounded-2xl shadow-xl flex items-center justify-center text-blue-600 active:scale-90 transition-transform border border-gray-100 ${!isInternetAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}>
              {isUpdating ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
            </button>
        )}
      </div>

      
      <div className="absolute bottom-[2rem] left-0 right-0 z-[1000] text-center">
        <div className="inline-flex items-center gap-1 sm:gap-2 bg-white/95 backdrop-blur-md px-2 sm:px-3 py-2 sm:py-3 rounded-full shadow-2xl border border-white/50 whitespace-nowrap animate-in fade-in slide-in-from-bottom-2">
            {userHasAdminRights && (<>
              <button 
                onClick={() => setShowWithService(!showWithService)}
                className={`flex items-center gap-1.5 active:scale-95 transition-all text-[9px] font-black uppercase ${showWithService ? 'text-gray-700 opacity-100' : 'text-gray-400 opacity-50 grayscale'}`}
              >
                <div className="w-2.5 h-2.5 bg-blue-600 rounded-full border border-white shadow-sm"></div>
                <span>Con Servicio</span>
              </button>
      
              <button 
                onClick={() => setShowWithoutService(!showWithoutService)}
                className={`flex items-center gap-1.5 border-l border-gray-200 pl-1 sm:pl-2 active:scale-95 transition-all text-[9px] font-black uppercase ${showWithoutService ? 'text-gray-700 opacity-100' : 'text-gray-400 opacity-50 grayscale'}`}
              >
                <div className="w-2.5 h-2.5 bg-gray-400 rounded-full border border-white shadow-sm"></div>
                <span>Sin Servicio</span>
              </button>
            </>)}
    
            {(userHasAdminRights || currentUser.role === ROLES.SUPERVISOR) && (
              <button 
                onClick={() => setShowUsers(!showUsers)}
                className={`flex items-center gap-1.5 border-l border-gray-200 pl-1 sm:pl-2 active:scale-95 transition-all text-[9px] font-black uppercase ${showUsers ? 'text-gray-700 opacity-100' : 'text-gray-400 opacity-50 grayscale'}`}>
                <div className="w-2.5 h-2.5 bg-primary rounded-full border border-white shadow-sm"></div>
                <span>Técnicos</span>
              </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ClientMap);
