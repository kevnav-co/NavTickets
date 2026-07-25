
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Equipment, EquipmentStatus, OrderStatus } from '../../types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import PERMISSIONS, { hasPermission } from '../../permissions';
import {
  X, Save, ChevronDown, Camera, 
  Loader2, Mic, Flame, Calendar, Cog, 
  Zap, ShieldCheck, Clock, ImageUp,
  Hash, Building2} from 'lucide-react';
import { compressImage, validateFile } from '../../utils/index';
import { SUGGESTED_EQUIPMENT_NAMES } from '../../constants';
import ClientSearchModal from '../shared/ClientSearchModal';
import { useFileHandler } from '../../hooks/useFileHandler';
import { useLocalStorage } from '../../hooks/useLocalStorage';

const initialFormData: Partial<Equipment> = {
  name: '',
  description: '',
  serialNumber: '',
  clientId: '',
  voltage: '110V',
  gasType: 'No usa',
  status: 'Activa', 
  imageUrl: '',
  lastMaintenanceDate: new Date().toISOString().split('T')[0],
  maintenanceFrequency: 3,
};

const EquipmentForm: React.FC = () => {
  const { clients, equipment, orders, addItem, updateItem } = useData();
  const { currentUser } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isEditMode = !!id;

  const localStorageKey = isEditMode ? `equipment-form-${id}` : 'new-equipment-form';
  const [formData, setFormData] = useLocalStorage<Partial<Equipment>>(localStorageKey, initialFormData);
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  const initialLoad = useRef(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [showClientSearch, setShowClientSearch] = useState(false);
  
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const { 
    isUploading,
    error: fileError,
    handleUpload,
    handleRemove
  } = useFileHandler({
    doc: formData as Equipment,
    updateDoc: async (updates) => {
      if (isEditMode && id) {
        await updateItem('equipment', id, updates);
      }
      setFormData(prev => ({...prev, ...updates}));
    },
    storagePath: 'equipment_photos',
  });

  const selectedClient = useMemo(() => clients.find(c => c.id === formData.clientId), [formData.clientId, clients]);

  const generateNextSerial = useMemo(() => {
    if (!equipment || equipment.length === 0) return 'SN-0001';
    const usedNumbers = new Set(equipment.map(e => parseInt(e.serialNumber?.match(/(\d+)$/)?.[1] || '0', 10)).filter(n => !isNaN(n) && n > 0));
    let nextNumber = 1;
    while (usedNumbers.has(nextNumber)) {
      nextNumber++;
    }
    return `SN-${nextNumber.toString().padStart(4, '0')}`;
}, [equipment]);

  useEffect(() => {
    if (isDataLoaded || !Array.isArray(clients) || !Array.isArray(equipment) || !Array.isArray(orders)) return;

    if (isEditMode) {
      if (initialLoad.current) {
        const itemToEdit = equipment.find(e => e.id === id);
        if (itemToEdit) {
           if (JSON.stringify(formData) === JSON.stringify(initialFormData)) {
              const lastClosedOrder = orders.filter(o => o.equipmentIds.includes(itemToEdit.id) && o.status === OrderStatus.CLOSED).sort((a,b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime())[0];
              setFormData({...itemToEdit, lastMaintenanceDate: lastClosedOrder?.scheduledDate || itemToEdit.lastMaintenanceDate });
           }
        } else {
            navigate('/equipment');
        }
        initialLoad.current = false;
      }
    } else {
      const prefill = location.state as Partial<Equipment> || {};
       if (initialLoad.current) {
        setFormData(prev => ({ ...initialFormData, ...prev, ...prefill, serialNumber: generateNextSerial }));
        initialLoad.current = false;
       }
    }
    setIsDataLoaded(true);
  }, [id, equipment, clients, orders, isEditMode, navigate, location.state, generateNextSerial, formData, setFormData, isDataLoaded]);


  useEffect(() => {
    if (formData.name && formData.name.length > 2) {
        const suggestions = SUGGESTED_EQUIPMENT_NAMES.filter(s => s.toLowerCase().includes(formData.name!.toLowerCase()));
        setNameSuggestions(suggestions);
    } else {
        setNameSuggestions([]);
    }
  }, [formData.name]);

  const nextMaintenanceInfo = useMemo(() => {
    if (!formData.lastMaintenanceDate || !formData.maintenanceFrequency) return null;
    const nextDate = new Date(formData.lastMaintenanceDate + 'T12:00:00');
    nextDate.setMonth(nextDate.getMonth() + formData.maintenanceFrequency);
    const diffTime = nextDate.getTime() - new Date().setHours(0,0,0,0);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return { text: nextDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }), days: diffDays };
  }, [formData.lastMaintenanceDate, formData.maintenanceFrequency]);

  const validateForm = () => {
    const errors: { [key: string]: string } = {};
    if (!formData.name) {
      errors.name = 'El nombre del equipo es obligatorio.';
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      try {
        const compressedBlob = await compressImage(file);
        const imageFile = new File([compressedBlob], file.name, { type: compressedBlob.type, lastModified: Date.now() });
        await handleUpload([imageFile], 'imageUrl', false);
      } catch (err) { 
        alert("Error al procesar la imagen"); 
        console.error(err);
      }
    }
    if (e.target) e.target.value = '';
  };

  const toggleListening = () => {
    if (isListening) { recognitionRef.current?.stop(); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return alert("Dictado no soportado");
    const r = new SR(); r.lang = 'es-ES'; r.continuous = false; r.interimResults = false;
    r.onstart = () => setIsListening(true);
    r.onresult = (e: any) => setFormData(p => ({ ...p, description: (p.description || '') + e.results[0][0].transcript }));
    r.onend = () => setIsListening(false);
    recognitionRef.current = r; r.start();
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const permissionNeeded = isEditMode ? PERMISSIONS.UPDATE_EQUIPMENT : PERMISSIONS.CREATE_EQUIPMENT;
    if (!currentUser || !hasPermission(currentUser.role, permissionNeeded)) {
        alert('No tienes permiso para realizar esta acción.');
        return;
    }

    if (equipment && formData.serialNumber && equipment.some(i => i.serialNumber === formData.serialNumber && i.id !== id)) { 
      setValidationErrors({ serialNumber: "El S/N ya está registrado." });
      return;
    }
    
    setIsSubmitting(true);
    try {
        const { id: formId, ...dataToSave } = formData;

        if (isEditMode && id) {
            await updateItem('equipment', id, dataToSave);
            alert('Máquina actualizada con éxito');
            window.localStorage.removeItem(localStorageKey);
            const returnTo = (location.state as any)?.returnTo;
            if (returnTo) {
                navigate(returnTo, { state: { updatedEquipmentId: id }, replace: true });
            } else {
                navigate(`/equipment/${id}`);
            }
        } else {
            await addItem('equipment', dataToSave as Omit<Equipment, 'id'>);
            alert('Máquina registrada con éxito');
            window.localStorage.removeItem(localStorageKey);
            navigate('/equipment');
        }
    } catch (error) {
        console.error("Error saving equipment:", error);
        alert("No se pudo guardar la máquina.");
    } finally {
        setIsSubmitting(false);
    }
  };

  const getStatusIndicator = (status?: EquipmentStatus) => {
    if (!status) return {dot: 'bg-gray-400', text: 'text-gray-800', bg: 'bg-gray-100 border-gray-200'};
    const styles: Record<EquipmentStatus, {dot: string, text: string, bg: string}> = {
        'Activa': {dot: 'bg-green-500', text: 'text-green-800', bg: 'bg-green-100 border-green-200'},
        'Inactiva': {dot: 'bg-gray-400', text: 'text-gray-800', bg: 'bg-gray-100 border-gray-200'},
        'En Mantenimiento': {dot: 'bg-orange-500', text: 'text-orange-800', bg: 'bg-orange-100 border-orange-200'},
        'Retirada': {dot: 'bg-red-500', text: 'text-red-800', bg: 'bg-red-100 border-red-200'},
    };
    return styles[status];
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    let finalValue: any = value;

    if (name === 'maintenanceFrequency') {
      finalValue = parseInt(value, 10);
    } else if (name === 'name') {
      finalValue = value.toUpperCase();
    }
    
    setFormData(prev => ({ ...prev, [name]: finalValue }));
    if (validationErrors[name]) {
      setValidationErrors(prev => { const newErrors = {...prev}; delete newErrors[name]; return newErrors; });
    }
  };

  if (!isDataLoaded || !clients) return <div className="w-full h-screen flex items-center justify-center"><Loader2 className="animate-spin text-gray-300" size={40}/></div>;

  const Label = ({ children }: { children: React.ReactNode }) => <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">{children}</label>;
  const statusIndicator = getStatusIndicator(formData.status);
  const statusOptions: { value: EquipmentStatus, label: string }[] = [
    { value: 'Activa', label: 'Operativo' },
    { value: 'En Mantenimiento', label: 'En Mantenimiento' },
    { value: 'Inactiva', label: 'Inactivo / Standby' },
    { value: 'Retirada', label: 'De Baja / Retirado' }
  ];

  return (
    <>
      <input type="file" ref={galleryInputRef} onChange={handleFileSelect} className="hidden" accept="image/*" />
      <input type="file" ref={cameraInputRef} onChange={handleFileSelect} className="hidden" accept="image/*" capture="environment" />

      {showClientSearch && (
        <ClientSearchModal 
          clients={clients} 
          onSelect={(c) => { 
            setFormData(prev => ({ ...prev, clientId: c.id }));
            setShowClientSearch(false); 
          }} 
          onClose={() => setShowClientSearch(false)}
          onAddNew={() => navigate('/clients/new')}
        />
      )}
      
      {fileError && <div className="fixed top-5 right-5 bg-red-100 text-red-700 p-4 rounded-lg z-50">{fileError}</div>}

      <div className="min-h-screen bg-gray-50/50">
        <header className="px-5 py-4 flex items-center justify-between border-b border-gray-100 sticky top-0 bg-white/80 backdrop-blur-md z-40 shadow-sm">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 bg-gray-100 text-gray-400 rounded-full hover:bg-gray-200 transition-colors"><X size={20} /></button>
          <h1 className="text-sm font-black text-gray-800 uppercase tracking-[0.2em]">{isEditMode ? 'Editar Máquina' : 'Nueva Máquina'}</h1>
          <div className="w-10"></div>
        </header>

        <div className="w-full max-w-2xl mx-auto p-4 pb-24">
          <form id="equipment-form" onSubmit={handleSubmit} className="w-full space-y-6">
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
              <div className="flex items-center mb-5"><div className="w-1 h-5 bg-red-500 rounded-full mr-3"></div><h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Identidad Visual</h2></div>
              <div className="space-y-4">
                <div className="h-48 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-center relative group">
                    {isUploading && <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-2xl z-10"><Loader2 className="animate-spin text-[#7b1113]"/></div>}
                    
                    {formData.imageUrl ? (
                      <>
                        <img src={formData.imageUrl} alt="Preview" className="w-full h-full object-contain rounded-lg p-2"/>
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all rounded-2xl">
                          <div className="absolute bottom-2.5 right-2.5 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button title="Reemplazar desde galería" type="button" onClick={() => galleryInputRef.current?.click()} className="bg-white/80 backdrop-blur-sm border border-gray-300 rounded-lg p-2.5 text-xs font-bold text-gray-600 shadow-sm flex items-center gap-1.5 active:scale-95 transition-transform">
                                  <ImageUp size={16}/> 
                              </button>
                              <button title="Reemplazar con cámara" type="button" onClick={() => cameraInputRef.current?.click()} className="bg-white/80 backdrop-blur-sm border border-gray-300 rounded-lg p-2.5 text-xs font-bold text-gray-600 shadow-sm flex items-center gap-1.5 active:scale-95 transition-transform">
                                  <Camera size={16}/> 
                              </button>
                          </div>
                          <button 
                              title="Eliminar imagen"
                              type="button" 
                              onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemove(formData.imageUrl!, 'imageUrl', false);
                              }} 
                              className="absolute top-1.5 right-1.5 bg-red-600/90 text-white p-1.5 rounded-full z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                              <X size={14} strokeWidth={3} />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <Camera size={28} className="text-gray-300 mb-2"/>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Añadir foto del equipo</p>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={() => galleryInputRef.current?.click()} className="bg-white border border-gray-300 rounded-lg py-2 px-3 text-xs font-bold text-gray-600 shadow-sm flex items-center gap-1.5 active:scale-95 transition-transform">
                                <ImageUp size={16}/> Galería
                            </button>
                            <button type="button" onClick={() => cameraInputRef.current?.click()} className="bg-white border border-gray-300 rounded-lg py-2 px-3 text-xs font-bold text-gray-600 shadow-sm flex items-center gap-1.5 active:scale-95 transition-transform">
                                <Camera size={16}/> Cámara
                            </button>
                        </div>
                      </>
                    )}
                </div>
                  
                  <div>
                      <Label>Cliente Propietario</Label>
                      <div className="relative mt-1">
                          <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                              <Building2 className="text-gray-400" size={16}/>
                          </div>
                          <button
                              type="button"
                              onClick={() => setShowClientSearch(true)}
                              className="w-full text-left pl-12 pr-10 py-4 bg-gray-50 rounded-2xl border border-gray-200 outline-none font-bold text-sm focus:ring-2 focus:ring-[#7b1113]/20 h-[58px] flex items-center"
                          >
                              {selectedClient ? (
                                  <span className="text-gray-800 truncate">{selectedClient.name}</span>
                              ) : (
                                  <span className="text-gray-500">SELECCIÓN CLIENTE (OPCIONAL)</span>
                              )}
                          </button>
                          {selectedClient && (
                              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                                  <button
                                      type="button"
                                      onClick={() => setFormData(prev => ({...prev, clientId: ''}))}
                                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                                      title="Limpiar cliente"
                                  >
                                      <X size={16} />
                                  </button>
                              </div>
                          )}
                      </div>
                  </div>

                  <div className="relative">
                      <Label>Nombre Comercial / Modelo</Label>
                      <div className="relative mt-1">
                          <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"><Cog className="text-gray-400" size={16}/></div>
                          <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} onFocus={() => setShowNameSuggestions(true)} onBlur={() => setTimeout(() => setShowNameSuggestions(false), 200)} placeholder="Ej: Licuadora Industrial Lar 15L" className={`w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl border ${validationErrors.name ? 'border-red-500' : 'border-gray-200'} outline-none font-bold text-sm focus:ring-2 focus:ring-[#7b1113]/20 uppercase`} />
                      </div>
                      {validationErrors.name && <p className="text-xs text-red-500 ml-4 mt-1">{validationErrors.name}</p>}
                      {showNameSuggestions && nameSuggestions.length > 0 && (
                          <div className="absolute w-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg z-20 max-h-48 overflow-y-auto"><div className="p-1">
                              {nameSuggestions.map((s, i) => <button key={i} type="button" onClick={() => { setFormData({...formData, name: s}); setShowNameSuggestions(false); }} className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded-xl text-sm font-medium text-gray-700">{s}</button>)}
                          </div></div>
                      )}
                  </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
                <div className="flex items-center mb-5"><div className="w-1 h-5 bg-blue-500 rounded-full mr-3"></div><h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Configuración Técnica</h2></div>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Número de Serie (S/N)</Label>
                            <div className="relative mt-1">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"><Hash className="text-black-400" size={16}/></div>
                                <input name="serialNumber" value={formData.serialNumber || ''} onChange={handleInputChange} className={`w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl border ${validationErrors.serialNumber ? 'border-red-500' : 'border-gray-200'} outline-none font-bold text-sm focus:ring-2 focus:ring-blue-400/20`}/>
                            </div>
                            {validationErrors.serialNumber && <p className="text-xs text-red-500 ml-4 mt-1">{validationErrors.serialNumber}</p>}
                        </div>
                        <div>
                            <Label>Tensión</Label>
                            <div className="relative mt-1">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"><Zap className="text-red-400" size={16}/></div>
                                <select name="voltage" value={formData.voltage || '110V'} onChange={handleInputChange} className="w-full pl-12 pr-8 py-4 bg-gray-50 rounded-2xl border border-gray-200 appearance-none outline-none font-bold text-sm focus:ring-2 focus:ring-blue-400/20">
                                    <option>110V</option>
                                    <option>220V</option>
                                    <option>330V</option>
                                </select>
                                <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none"><ChevronDown className="text-gray-400" size={18}/></div>
                            </div>
                        </div>
                    </div>
                    <div>
                        <Label>Estado de Operación</Label>
                        <div className="relative mt-1">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"><div className={`w-2.5 h-2.5 rounded-full ${statusIndicator.dot}`}/></div>
                            <select name="status" value={formData.status || 'Activa'} onChange={handleInputChange} className={`w-full pl-12 pr-8 py-4 font-black text-xs uppercase tracking-wider rounded-2xl appearance-none outline-none ${statusIndicator.bg} ${statusIndicator.text}`}>
                                {statusOptions.map(option => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none"><ChevronDown size={18}/></div>
                        </div>
                    </div>
                    <div>
                        <Label>Suministro de Gas</Label>
                        <div className="relative mt-1">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"><Flame className="text-orange-500" size={16}/></div>
                            <select name="gasType" value={formData.gasType || 'No usa'} onChange={handleInputChange} className="w-full pl-12 pr-8 py-4 font-black text-xs uppercase rounded-2xl appearance-none outline-none bg-orange-100 border-orange-200 text-orange-800">
                                <option value="No usa">No utiliza gas</option><option value="Natural">Gas Natural</option><option value="Propano">Gas Propano</option>
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none"><ChevronDown size={18}/></div>
                        </div>
                    </div>
                    <div>
                        <Label>Observaciones Preventivas</Label>
                        <div className="relative mt-1">
                            <textarea name="description" value={formData.description || ''} onChange={handleInputChange} className="w-full bg-gray-50 rounded-2xl p-4 pr-12 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-400/20 resize-none h-24 no-scrollbar" placeholder="Detalles sobre cuidados especiales o historial breve..."></textarea>
                            <button type="button" onClick={toggleListening} className={`absolute right-3 bottom-3 p-2 rounded-full transition-colors ${isListening ? 'bg-red-500/10 text-red-600' : 'text-gray-400 hover:bg-gray-100'}`}><Mic size={16} /></button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
              <div className="flex items-center mb-5"><div className="w-1 h-5 bg-green-500 rounded-full mr-3"></div><h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Ciclo de Mantenimiento</h2></div>
              <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                          <Label>Última Intervención</Label>
                          <div className="relative mt-1">
                              <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"><Calendar className="text-green-400" size={16}/></div>
                              <input type="date" name="lastMaintenanceDate" value={formData.lastMaintenanceDate || ''} onChange={handleInputChange} className="w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl border border-gray-200 outline-none font-bold text-sm focus:ring-2 focus:ring-green-400/20"/>
                          </div>
                      </div>
                      <div>
                          <Label>Frecuencia Programada</Label>
                          <div className="relative mt-1">
                              <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"><ShieldCheck className="text-green-400" size={16}/></div>
                              <select name="maintenanceFrequency" value={formData.maintenanceFrequency || 3} onChange={handleInputChange} className="w-full pl-12 pr-8 py-4 bg-gray-50 rounded-2xl border border-gray-200 appearance-none outline-none font-bold text-sm focus:ring-2 focus:ring-green-400/20">
                                  {[1,2,3,4,6,8,10,12].map(m => <option key={m} value={m}>Cada {m} Mes{m > 1 ? 'es' : ''}</option>)}
                              </select>
                              <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none"><ChevronDown size={18}/></div>
                          </div>
                      </div>
                  </div>
                  {nextMaintenanceInfo && (
                      <div className={`rounded-2xl p-3.5 text-center ${nextMaintenanceInfo.days < 7 ? 'bg-red-50' : 'bg-green-50'}`}>
                        <div className={`flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${nextMaintenanceInfo.days < 7 ? 'text-red-600' : 'text-green-700'}`}><Clock size={12}/>Próxima Fecha Sugerida</div>
                        <div className="flex items-baseline justify-center gap-2 mt-1">
                          <span className="text-2xl font-black text-gray-800 tracking-tight">{nextMaintenanceInfo.text}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${nextMaintenanceInfo.days < 0 ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>{nextMaintenanceInfo.days > 0 ? `en ${nextMaintenanceInfo.days} días` : nextMaintenanceInfo.days === 0 ? 'Hoy' : `Vencido`}</span>
                        </div>
                      </div>
                  )}
              </div>
            </div>
             <div className="pt-6">
                <button form="equipment-form" type="submit" disabled={isSubmitting || isUploading} className="w-full bg-[#7b1113] text-white py-5 rounded-[1.5rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-red-900/30 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-3 group">
                    {isSubmitting || isUploading ? (
                    <Loader2 size={20} className="animate-spin" />
                    ) : (
                    <>
                        <Save size={20} />
                        <span>{isEditMode ? 'Actualizar Máquina' : 'Registrar Máquina'}</span>
                    </>
                    )}
                </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default EquipmentForm;
