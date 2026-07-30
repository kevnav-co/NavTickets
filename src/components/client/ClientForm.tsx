import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Client, CuentiClient } from '../../types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useValidatedActions } from '../../hooks/useValidatedActions';
import { ClientSchema } from '../../schemas/client.schema';
import PERMISSIONS, { hasPermission } from '../../permissions';
import {
  Phone, Crosshair, Search, Loader2, IdCard, 
  Building2, Mail, Save, X
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useLocalStorage } from '../../hooks/useLocalStorage';

const initialFormData: Partial<Client> = {
  identification: '',
  name: '',
  email: '',
  address: '',
  contact: '',
  latitude: 8.74798, // Default to Montería
  longitude: -75.88143,
};

const ClientForm: React.FC = () => {
  const { clients } = useData();
  const { addValidated, updateValidated } = useValidatedActions();
  const { currentUser } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation(); // Hook para acceder al state de la navegación
  const isEditMode = !!id;

  const localStorageKey = isEditMode ? `client-form-${id}` : 'new-client-form';
  const [formData, setFormData] = useLocalStorage<Partial<Client>>(localStorageKey, initialFormData);
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  const initialLoad = useRef(true);
  
  const mapDivRef = useRef<HTMLDivElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerInstance = useRef<L.Marker | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isClientFound, setIsClientFound] = useState(true);

  // --- NUEVO EFECTO PARA RELLENAR FORMULARIO DESDE CUENTI ---
  useEffect(() => {
    // Solo se ejecuta en modo de creación y si hay datos en el state
    if (!isEditMode && location.state?.clientToImport) {
      const { clientToImport } = location.state as { clientToImport: CuentiClient };
      
      // Rellena el formulario con los datos importados
      setFormData({
        name: clientToImport.name.toUpperCase(),
        identification: clientToImport.identification.replace(/\D/g, ''), // Limpia no numéricos
        contact: clientToImport.phone?.replace(/\D/g, '') || '',
        email: clientToImport.email || '',
        address: clientToImport.address || '',
        latitude: 8.74798, // Coordenadas por defecto
        longitude: -75.88143,
      });

      // Limpia el state de la ubicación para que no se reutilice si se recarga la página
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [isEditMode, location.state, setFormData, navigate, location.pathname]);

  useEffect(() => {
    if (isEditMode && initialLoad.current) {
      const clientToEdit = clients.find(c => c.id === id);
      if (clientToEdit) {
        if (JSON.stringify(formData) === JSON.stringify(initialFormData)) {
            setFormData(clientToEdit);
        }
      } else {
        setIsClientFound(false);
        setTimeout(() => navigate('/clients'), 2000);
      }
      initialLoad.current = false;
    }
  }, [id, clients, isEditMode, navigate, setFormData, formData]);

  const validateForm = () => {
    const errors: { [key: string]: string } = {};
    if (!formData.name?.trim()) {
        errors.name = 'El nombre comercial es obligatorio.';
    }
    if (!formData.identification?.trim()) {
        errors.identification = 'La identificación fiscal es obligatoria.';
    }
    if (formData.contact && (formData.contact.length < 7 || formData.contact.length > 10)) {
        errors.contact = 'El teléfono debe tener entre 7 y 10 dígitos.';
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        errors.email = 'El formato del email no es válido.';
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let processedValue = value;

    if (name === 'identification' || name === 'contact') {
      processedValue = value.replace(/\D/g, '');
    } else if (name === 'name') {
      processedValue = value.toUpperCase();
    }
    
    setFormData(prev => ({ ...prev, [name]: processedValue }));

    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  }

  useEffect(() => {
    if (!mapDivRef.current || mapInstance.current || !isClientFound) return;

    const map = L.map(mapDivRef.current, {
      center: [formData.latitude || 8.74798, formData.longitude || -75.88143],
      zoom: 15,
      zoomControl: true,
      attributionControl: false,
    });
    mapInstance.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    const customIcon = L.icon({
        iconUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" fill="%23c0392b"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });

    const marker = L.marker([formData.latitude || 8.74798, formData.longitude || -75.88143], { draggable: true, icon: customIcon }).addTo(map);
    markerInstance.current = marker;

    marker.on('dragend', (e) => {
      const { lat, lng } = e.target.getLatLng();
      reverseGeocode(lat, lng);
    });

    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      reverseGeocode(lat, lng);
    });
    
    return () => { map.remove(); mapInstance.current = null; };
  }, [isClientFound, formData.latitude, formData.longitude]);

  useEffect(() => {
      if (mapInstance.current && markerInstance.current && formData.latitude && formData.longitude) {
          const newLatLng = L.latLng(formData.latitude, formData.longitude);
          if (!mapInstance.current.getBounds().pad(0.5).contains(newLatLng)) {
              mapInstance.current.flyTo(newLatLng, 17);
          }
          markerInstance.current.setLatLng(newLatLng);
      }
      if (addressInputRef.current && formData.address !== addressInputRef.current.value) {
        addressInputRef.current.value = formData.address || '';
      }
  }, [formData.latitude, formData.longitude, formData.address]);

  const reverseGeocode = async (lat: number, lng: number) => {
    setIsProcessing(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`);
      const data = await response.json();

      const formatColombianAddress = (addressDetails: any): string => {
        if (!addressDetails) return '';
        
        const abbreviations: { [key: string]: string } = {
          'Carrera': 'Cra',
          'Calle': 'Cll',
          'Avenida': 'Av',
          'Diagonal': 'Diag',
          'Transversal': 'Transv',
          'Circular': 'Circ',
        };

        let road = addressDetails.road || '';
        if (!road) {
          return addressDetails.neighbourhood || data.display_name || '';
        }

        const roadType = road.split(' ')[0];
        if (abbreviations[roadType]) {
          road = road.replace(roadType, abbreviations[roadType]);
        }

        const houseNumber = addressDetails.house_number ? String(addressDetails.house_number).replace('-', ' - ') : '';

        let formattedAddress = road;
        if (houseNumber) {
          formattedAddress += ` # ${houseNumber}`;
        }
        
        return formattedAddress.trim();
      };

      let finalAddress = data.display_name || '';
      if (data && data.address) {
        finalAddress = formatColombianAddress(data.address);
      }
      
      setFormData(prev => ({ ...prev, address: finalAddress, latitude: lat, longitude: lng }));

    } catch (error) {
      console.error("Reverse geocoding error:", error);
    } finally {
      setIsProcessing(false);
    }
  };


  const handleAddressSearch = async () => {
    const addressToSearch = addressInputRef.current?.value;
    if (!addressToSearch || addressToSearch.trim().length < 5) return;
    
    setIsProcessing(true);
    try {
        const query = encodeURIComponent(`${addressToSearch}, Montería, Córdoba, Colombia`);
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1&countrycodes=co`);
        const results = await response.json();

        if (results && results.length > 0) {
            const { lat, lon } = results[0];
            await reverseGeocode(parseFloat(lat), parseFloat(lon)); 
        } else {
            console.warn("Address not found:", addressToSearch);
            setIsProcessing(false);
        }
    } catch (error) {
        console.error("Address search error:", error);
        setIsProcessing(false);
    }
  }

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setIsProcessing(true);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          reverseGeocode(latitude, longitude);
        },
        (error) => {
          console.warn("Geolocation error:", error);
          setIsProcessing(false);
        },
        { enableHighAccuracy: true }
      );
    } catch (error) {
        console.warn("Geolocation failed due to permissions policy.");
        setIsProcessing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
        return;
    }

    const permissionNeeded = isEditMode ? PERMISSIONS.UPDATE_CLIENT : PERMISSIONS.CREATE_CLIENT;
    if (!currentUser || !hasPermission(currentUser.role, permissionNeeded)) {
      alert('No tienes permiso para realizar esta acción.');
      return;
    }

    setIsProcessing(true);

    try {
      if (isEditMode) {
        const clientToEdit = clients.find(c => c.id === id);
        if (!clientToEdit) throw new Error("Client data for editing is not available.");
        
        const changedData: Partial<Client> = Object.keys(formData).reduce((acc, key) => {
          const clientKey = key as keyof Client;
          if (formData[clientKey] !== clientToEdit[clientKey]) {
            // @ts-ignore
            acc[clientKey] = formData[clientKey];
          }
          return acc;
        }, {} as Partial<Client>);

        if (Object.keys(changedData).length > 0) {
           await updateValidated('clients', id, changedData, ClientSchema);
        }
        alert(`Cliente actualizado con éxito`);
        window.localStorage.removeItem(localStorageKey);
        navigate(`/clients/${id}`);
      } else {
        await addValidated('clients', formData, ClientSchema.omit({ id: true, companyId: true }));
        alert(`Cliente creado con éxito`);
        window.localStorage.removeItem(localStorageKey);
        navigate('/clients');
      }
    } catch (error) {
      console.error("Error saving client:", error);
      alert("Error al guardar el cliente");
    } finally {
      setIsProcessing(false);
    }
  };


  if (!isClientFound) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin text-gray-400 mx-auto" size={48} />
          <p className="text-lg text-gray-600 mt-4">Cliente no encontrado. Redirigiendo...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-gray-50 min-h-screen">
        <header className="px-5 py-4 flex items-center justify-between border-b border-gray-100 sticky top-0 bg-white/80 backdrop-blur-md z-40 shadow-sm">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 bg-gray-100 text-gray-400 rounded-full hover:bg-gray-200 transition-colors"><X size={20} /></button>
          <h1 className="text-sm font-black text-gray-800 uppercase tracking-[0.2em]">{isEditMode ? 'Editar Cliente' : 'Nuevo Cliente'}</h1>
          <div className="w-10"></div>
        </header>
        <div className="max-w-3xl mx-auto px-4 pt-8 pb-32 md:pb-8">
          <form id="client-form" onSubmit={handleSubmit} className="space-y-8">
            <div className="bg-white p-8 rounded-3xl shadow-sm">
              <div className="flex items-center mb-6">
                <div className="w-1 h-6 bg-red-800 rounded-full mr-3"></div>
                <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider">Información de Identidad</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-2 block">IDENTIFICACIÓN FISCAL / NIT</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                      <IdCard className="text-gray-400" size={20}/>
                    </div>
                    <input type="text" name="identification" value={formData.identification || ''} onChange={handleInputChange} placeholder="Solo números..." className={`w-full pl-12 pr-4 py-3 bg-gray-50 rounded-lg border ${validationErrors.identification ? 'border-red-500' : 'border-gray-200'} focus:ring-2 focus:ring-red-300 focus:border-red-400 outline-none transition`} />
                  </div>
                  {validationErrors.identification && <p className="text-xs text-red-600 mt-1 ml-1">{validationErrors.identification}</p>}
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-2 block">NOMBRE COMERCIAL / PROPIETARIO</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                      <Building2 className="text-gray-400" size={20}/>
                    </div>
                    <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} placeholder="Se convertirá a mayúsculas..." className={`w-full pl-12 pr-4 py-3 bg-gray-50 rounded-lg border ${validationErrors.name ? 'border-red-500' : 'border-gray-200'} focus:ring-2 focus:ring-red-300 focus:border-red-400 outline-none transition`} />
                  </div>
                  {validationErrors.name && <p className="text-xs text-red-600 mt-1 ml-1">{validationErrors.name}</p>}
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-2 block">TELÉFONO</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                      <Phone className="text-gray-400" size={20}/>
                    </div>
                    <input type="tel" name="contact" value={formData.contact || ''} onChange={handleInputChange} placeholder="Solo números (7-10 dígitos)" className={`w-full pl-12 pr-4 py-3 bg-gray-50 rounded-lg border ${validationErrors.contact ? 'border-red-500' : 'border-gray-200'} focus:ring-2 focus:ring-red-300 focus:border-red-400 outline-none transition`} />
                  </div>
                  {validationErrors.contact && <p className="text-xs text-red-600 mt-1 ml-1">{validationErrors.contact}</p>}
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-2 block">E-MAIL</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                      <Mail className="text-gray-400" size={20}/>
                    </div>
                    <input type="email" name="email" value={formData.email || ''} onChange={handleInputChange} placeholder="correo@ejemplo.com" className={`w-full pl-12 pr-4 py-3 bg-gray-50 rounded-lg border ${validationErrors.email ? 'border-red-500' : 'border-gray-200'} focus:ring-2 focus:ring-red-300 focus:border-red-400 outline-none transition`} />
                  </div>
                  {validationErrors.email && <p className="text-xs text-red-600 mt-1 ml-1">{validationErrors.email}</p>}
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-3xl shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <div className="w-1 h-6 bg-blue-600 rounded-full mr-3"></div>
                  <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider">DIRECCIÓN</h2>
                </div>
                <button type="button" onClick={handleGetCurrentLocation} className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors bg-blue-100/50 hover:bg-blue-100 px-4 py-2 rounded-lg">
                  <Crosshair size={16}/> GPS
                </button>
              </div>

              <div className="relative mb-4">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                  <Search className="text-gray-400" size={20}/>
                </div>
                <input type="text" ref={addressInputRef} onKeyDown={(e) => e.key === 'Enter' && handleAddressSearch()} placeholder="Escribe la dirección..." className="w-full pl-12 pr-4 py-3 bg-gray-50 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none transition" />
              </div>

              <div ref={mapDivRef} className="h-64 md:h-80 w-full rounded-2xl border border-gray-200 shadow-inner cursor-pointer z-0"></div>
              <p className="text-center text-xs text-gray-500 mt-2">Ajusta el pin en el mapa</p>
            </div>
          </form>
        </div>
      </div>
      <footer className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm p-4 z-40 border-t border-gray-100 shadow-[0_-5px_25px_rgba(0,0,0,0.07)]">
        <div className="max-w-3xl mx-auto">
            <button form="client-form" type="submit" disabled={isProcessing} className="w-full bg-primary text-white py-4 rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-lg shadow-red-900/30 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-3 group">
                {isProcessing ? (
                    <Loader2 size={20} className="animate-spin" />
                ) : (
                    <>
                        <Save size={20} />
                        <span>{isEditMode ? 'Guardar Cambios' : 'Registrar Cliente'}</span>
                    </>
                )}
            </button>
        </div>
      </footer>
    </>
  );
};

export default ClientForm;
