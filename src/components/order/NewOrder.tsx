
import React, { useRef, useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useOrderForm } from '../../hooks/useOrderForm';
import { useAuth } from '../../context/AuthContext';
import { 
  X, Calendar as CalendarIcon, ChevronDown, ShieldCheck, Mic, MicOff, Image as ImageIcon, 
  AlertCircle, CalendarRange, Check, ChevronRight, UserPlus, 
  Loader2, Zap, Search, HardHat, Plus
} from 'lucide-react';
import { Equipment } from '../../types'; 
import ClientSearchModal from '../shared/ClientSearchModal';
import AvailabilityModal from './AvailabilityModal';
import PERMISSIONS, { hasPermission } from '../../permissions';

const today = new Date().toISOString().split('T')[0];

const getImageUrl = (evidence: string | Blob): string => {
    if (typeof evidence === 'string') return evidence;
    return URL.createObjectURL(evidence);
}

const NewOrder: React.FC = () => {
  const {
    formData, setFormData, loadingMessage, notification, setNotification,
    isEditMode, id, nextOrderNumber, endTime, 
    selectedClient, assignableRoles, users, equipment, clients, orders, 
    initialEvidence, handleAddImage, removeEvidence, handleServiceNameChange, 
    toggleEquipment, getTechLoad, handleSubmit,
  } = useOrderForm();
  
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const serviceNameRef = useRef<HTMLTextAreaElement>(null);

  const [isListening, setIsListening] = useState(false);
  const [showClientSearch, setShowClientSearch] = useState(false);
  const [showAvailability, setShowAvailability] = useState(false);
  const [equipmentSearchTerm, setEquipmentSearchTerm] = useState('');

  useEffect(() => {
    if (serviceNameRef.current) {
      serviceNameRef.current.style.height = 'auto';
      serviceNameRef.current.style.height = `${serviceNameRef.current.scrollHeight}px`;
    }
  }, [formData.serviceName]);

  useEffect(() => {
    return () => {
      if (!id) {
        window.localStorage.removeItem('new-order-form');
      }
    };
  }, [id]);

  const toggleListening = () => {
    if (isListening) { recognitionRef.current?.stop(); return; }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Navegador no soportado");
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setFormData(prev => ({...prev, description: prev.description + (prev.description.length > 0 && !prev.description.endsWith(' ') ? ' ' : '') + transcript}));
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleAddImage(Array.from(e.target.files));
    }
    e.target.value = ''; // Reset input
  };

  const getPriorityStyle = (p: string) => {
      if (formData.priority !== p) return 'bg-white text-gray-400 border-gray-100 hover:bg-gray-50';
      switch(p) {
          case 'Urgente': return 'bg-red-600 text-white border-red-600 shadow-md ring-2 ring-red-100';
          case 'Alta': return 'bg-orange-500 text-white border-orange-500 shadow-md ring-2 ring-orange-100';
          case 'Media': return 'bg-yellow-400 text-gray-900 border-yellow-400 shadow-md ring-2 ring-yellow-100';
          case 'Baja': return 'bg-green-500 text-white border-green-500 shadow-md ring-2 ring-green-100';
          default: return '';
      }
  };

  if (!currentUser || (!hasPermission(currentUser.role, PERMISSIONS.CREATE_ORDER) && !isEditMode) || (!hasPermission(currentUser.role, PERMISSIONS.UPDATE_ORDER) && isEditMode) ) {
      return <Navigate to="/" />;
  }

  return (
    <div className="bg-gray-50/50 min-h-screen pb-24">
      {notification.show && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in">
           <div className="bg-white rounded-[2rem] p-8 w-full max-w-xs shadow-2xl border-t-4 border-red-500 text-center animate-in zoom-in-95">
              <div className="bg-red-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
                  <AlertCircle size={24} />
              </div>
              <h3 className="font-black text-gray-900 mb-2 uppercase tracking-tight">{notification.title}</h3>
              <p className="text-sm text-gray-500 mb-6 font-medium leading-relaxed">{notification.message}</p>
              <button onClick={() => setNotification({ ...notification, show: false })} className="w-full bg-gray-900 text-white py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">Entendido</button>
           </div>
        </div>
      )}

      {showClientSearch && (
        <ClientSearchModal 
          clients={clients} 
          onSelect={(c) => { 
            setFormData(prev => ({ ...prev, clientId: c.id, selectedEquipmentIds: [] })); 
            setShowClientSearch(false); 
          }} 
          onClose={() => setShowClientSearch(false)}
          onAddNew={() => { navigate('/clients/new'); setShowClientSearch(false); }}
        />
      )}

      {showAvailability && formData.technicianId && (
        <AvailabilityModal 
          technician={users.find(u => u.id === formData.technicianId)!} 
          orders={orders} 
          onClose={() => setShowAvailability(false)} 
          initialDate={formData.date} 
          onApplyTime={(d, t, dur) => { 
            setFormData(prev => ({ ...prev, date: d, time: t, duration: dur }));
            setShowAvailability(false); 
          }} 
        />
      )}

      <header className="px-5 py-4 flex items-center justify-between border-b border-gray-100 sticky top-0 bg-white/80 backdrop-blur-md z-40 shadow-sm">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 bg-gray-100 text-gray-400 rounded-full hover:bg-gray-200 transition-colors"><X size={20} /></button>
        <h1 className="text-sm font-black text-gray-800 uppercase tracking-[0.2em]">{id ? 'Editar Orden' : formData.orderType === 'Preventivo' ? `MP-${nextOrderNumber}` : `MC-${nextOrderNumber}`}</h1>
        <div className="w-10"></div>
      </header>

      <form onSubmit={handleSubmit} className="p-4 space-y-6 max-w-2xl mx-auto w-full">
        <div className="space-y-4">
            <div className="flex bg-gray-200/50 p-1 rounded-2xl border border-gray-100">
                {(['Correctivo', 'Preventivo'] as const).map(t => (
                <button 
                    key={t} 
                    type="button" 
                    onClick={() => setFormData(prev => ({ ...prev, orderType: t }))}
                    className={`flex-1 py-3 rounded-xl font-black text-[11px] uppercase tracking-[0.1em] transition-all duration-300 ${formData.orderType === t ? 'bg-[#7b1113] text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    {t}
                </button>
                ))}
            </div>
            
            <div className="grid grid-cols-4 gap-1 bg-gray-100 p-1 rounded-2xl border border-gray-200">
               {['Baja', 'Media', 'Alta', 'Urgente'].map(p => (
                   <button 
                    key={p} 
                    type="button" 
                    onClick={() => setFormData(prev => ({...prev, priority: p as any}))}
                    className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all duration-300 border-2 border-transparent ${getPriorityStyle(p)}`}
                   >
                       {p.substring(0,3)}
                   </button>
               ))}
            </div>
        </div>

        {/* Client and Equipment Section */}
        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 space-y-6">
          <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">Información del Cliente</label>
              <div className="flex gap-2 items-center">
                  {selectedClient ? (
                      <div className="flex-1 bg-gray-50 border border-gray-100 rounded-[1.25rem] py-3.5 px-4 flex items-center justify-between shadow-sm ring-1 ring-[#7b1113]/20">
                          <div className="min-w-0" onClick={() => setShowClientSearch(true)}>
                              <p className="text-[8px] font-black text-[#7b1113] uppercase tracking-widest leading-none mb-1">Empresa / Propietario</p>
                              <p className="text-sm font-black text-gray-800 truncate">{selectedClient.name}</p>
                          </div>
                          <button
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, clientId: '', selectedEquipmentIds: [] }))}
                              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors ml-2"
                              title="Limpiar cliente"
                          >
                              <X size={16} />
                          </button>
                      </div>
                  ) : (
                      <button 
                          type="button" 
                          onClick={() => setShowClientSearch(true)}
                          className="flex-1 bg-gray-50 border border-gray-100 rounded-[1.25rem] py-3.5 px-4 text-left flex items-center justify-between shadow-sm active:scale-[0.98] transition-all group"
                      >
                          <span className="text-sm font-bold text-gray-300">Seleccionar Cliente... (Opcional)</span>
                          <Search size={20} className="text-gray-300 group-hover:text-[#7b1113] transition-colors" />
                      </button>
                  )}
                  {currentUser && hasPermission(currentUser.role, PERMISSIONS.CREATE_CLIENT) && (
                      <button type="button" onClick={() => navigate('/clients/new')} className="bg-[#7b1113] text-white w-14 h-14 rounded-[1.25rem] shadow-lg flex items-center justify-center active:scale-90 transition-all flex-shrink-0"><UserPlus size={22} /></button>
                  )}
              </div>
          </div>

          {formData.clientId && selectedClient && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-500">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 px-1 gap-2">
                      <div className="flex items-center gap-2">
                          <Zap size={14} className="text-yellow-500 fill-yellow-500 flex-shrink-0" />
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Activos del Cliente</span>
                      </div>
                      
                      <div className="flex-1 w-full relative sm:mx-2 min-w-[120px]">
                          <div className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none">
                              <Search size={12} className="text-gray-400" />
                          </div>
                          <input 
                              type="text" 
                              placeholder="Buscar..." 
                              value={equipmentSearchTerm}
                              onChange={(e) => setEquipmentSearchTerm(e.target.value)}
                              className="w-full bg-gray-50 border border-gray-100 rounded-xl py-1.5 px-3 pl-8 text-xs font-bold text-gray-700 focus:outline-none focus:ring-1 focus:ring-red-200 transition-all placeholder:text-gray-300 placeholder:font-medium"
                          />
                      </div>

                      {currentUser && hasPermission(currentUser.role, PERMISSIONS.CREATE_EQUIPMENT) && (
                          <button type="button" onClick={() => navigate('/equipment/new', { state: { clientId: formData.clientId } })} className="text-[9px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl uppercase flex items-center gap-1 active:scale-95 transition-transform whitespace-nowrap flex-shrink-0"><Plus size={12} /> Nuevo Equipo</button>
                      )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto no-scrollbar pb-1">
                      {equipment.filter((e: Equipment) => {
                          if (e.clientId !== formData.clientId) return false;
                          if (!equipmentSearchTerm) return true;
                          const term = equipmentSearchTerm.toLowerCase();
                          return e.name?.toLowerCase().includes(term) || (e.serialNumber && e.serialNumber.toLowerCase().includes(term));
                      }).map((equip: Equipment) => (
                          <button 
                              key={equip.id} 
                              type="button" 
                              onClick={() => toggleEquipment(equip.id)} 
                              className={`flex items-start gap-3 p-3 rounded-2xl border-2 text-left transition-all ${formData.selectedEquipmentIds.includes(equip.id) ? 'bg-red-50 border-[#7b1113] text-[#7b1113] shadow-md' : 'bg-gray-50/50 border-gray-100 text-gray-400 hover:bg-gray-50'}`}
                          >
                              <div className={`mt-0.5 w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 ${formData.selectedEquipmentIds.includes(equip.id) ? 'bg-[#7b1113]' : 'bg-white border-2 border-gray-200'}`}>
                                  {formData.selectedEquipmentIds.includes(equip.id) && <Check size={10} className="text-white" strokeWidth={4} />}
                              </div>
                              <div className="flex-1">
                                  <p className="text-xs font-black leading-tight uppercase tracking-tighter">{equip.name}</p>
                                  {equip.serialNumber && <p className="text-[10px] font-mono text-gray-400 mt-0.5">S/N: {equip.serialNumber}</p>}
                              </div>
                          </button>
                      ))}
                  </div>
              </div>
          )}
      </div>

        {/* Service Details Section */}
        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 space-y-5">
            <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">Concepto de Servicio</label>
                <div className="relative">
                    <div className="absolute top-4 left-0 flex items-center pl-4 pointer-events-none">
                        <Zap size={18} className="text-red-400" />
                    </div>
                    <textarea 
                        ref={serviceNameRef}
                        value={formData.serviceName} 
                        onChange={(e) => handleServiceNameChange(e.target.value)} 
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 pl-12 text-sm font-black text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#7b1113]/10 transition-all uppercase resize-none overflow-hidden"
                        placeholder="Nombre del Servicio"
                        rows={1}
                        required 
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">Técnico Responsable</label>
                    <div className="relative">
                         <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                            <HardHat size={18} className="text-blue-400" />
                        </div>
                        <select 
                            value={formData.technicianId} 
                            onChange={(e) => setFormData(prev => ({...prev, technicianId: e.target.value}))}
                            className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-4 pl-12 appearance-none text-sm font-black text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#7b1113]/10 transition-all"
                            required
                        >
                            <option value="" className="text-gray-300">Asignar Personal...</option>
                            {users.filter(u => u.role && (assignableRoles as readonly string[]).includes(u.role)).map(u => (
                            <option key={u.id} value={u.id} className="text-gray-900 font-bold">{u.name} (Activas: {getTechLoad(u.id)})</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                    </div>
                </div>

                <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">Verificar Agenda</label>
                    <button 
                        type="button" 
                        onClick={() => setShowAvailability(true)} 
                        disabled={!formData.technicianId} 
                        className="w-full h-[54px] bg-gray-50 text-green-600 border border-gray-100 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-40"
                    >
                        <CalendarRange size={18} /> Disponibilidad
                    </button>
                </div>
            </div>

            <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">Descripción Técnica</label>
                <div className="relative">
                    <textarea 
                        value={formData.description} 
                        onChange={(e) => setFormData(prev => ({...prev, description: e.target.value}))} 
                        className="w-full bg-gray-50 border border-gray-100 rounded-[1.5rem] p-4 pr-12 min-h-[120px] text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#7b1113]/10 transition-all no-scrollbar" 
                        placeholder="Detalles de la falla, solicitud del cliente o notas internas..." 
                        required 
                    />
                    <button 
                        type="button" 
                        onClick={toggleListening} 
                        className={`absolute right-4 bottom-4 p-2.5 rounded-2xl shadow-sm border transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-gray-400 bg-white border-gray-100'}`}
                    >
                        {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                    </button>
                </div>
            </div>
        </div>

        {/* Scheduling Section */}
        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">Fecha Servicio</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                            <CalendarIcon size={18} className="text-green-600" />
                        </div>
                        <input type="date" value={formData.date} min={!isEditMode ? today : undefined} onChange={(e) => setFormData(prev => ({...prev, date: e.target.value}))} className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-4 pl-12 text-sm font-black text-gray-800 focus:outline-none transition-all" />
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">Garantía (Días)</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                            <ShieldCheck size={18} className="text-green-600" />
                        </div>
                        <input 
                            type="number"
                            value={formData.warrantyPeriod}
                            onChange={(e) => setFormData(prev => ({...prev, warrantyPeriod: parseInt(e.target.value) || 0}))}
                            className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-4 pl-12 text-sm font-black text-gray-800 focus:outline-none transition-all"
                            placeholder="Ej: 90"
                        />
                    </div>
                </div>
            </div>

            <div className="bg-blue-50/50 p-5 rounded-[1.5rem] border border-blue-100/50">
                <div className="grid grid-cols-3 gap-4">
                    <div className="text-center space-y-1">
                        <label className="text-[8px] font-black text-blue-400 uppercase tracking-widest block">Hora Inicio</label>
                        <input type="text" value={formData.time} onChange={(e) => setFormData(prev => ({...prev, time: e.target.value}))} className="w-full bg-white border border-blue-100 rounded-xl py-2.5 text-center text-sm font-black text-blue-700 shadow-sm focus:outline-none" />
                    </div>
                    <div className="text-center space-y-1">
                        <label className="text-[8px] font-black text-blue-400 uppercase tracking-widest block">Duración</label>
                        <div className="relative group">
                            <input type="text" value={formData.duration} onChange={(e) => setFormData(prev => ({...prev, duration: e.target.value}))} className="w-full bg-blue-600 border border-blue-600 rounded-xl py-2.5 text-center text-sm font-black text-white shadow-lg focus:outline-none" />
                            <div className="absolute -top-1 -right-1">
                                <span className="flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="text-center space-y-1">
                        <label className="text-[8px] font-black text-blue-400 uppercase tracking-widest block">Fin Estimado</label>
                        <div className="w-full bg-white/50 border border-dashed border-blue-200 rounded-xl py-2.5 text-center text-sm font-black text-blue-400">{endTime}</div>
                    </div>
                </div>
            </div>
        </div>

        {/* Evidence Section */}
        <div className="bg-white rounded-[2.2rem] p-6 shadow-sm border border-gray-100 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ImageIcon size={18} className="text-[#7b1113]" />
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest"> Fotos Iniciales </h3>
            </div>
            
            <div className="flex gap-2">
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()} 
                disabled={!!loadingMessage} 
                className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ImageIcon size={14} /> Galería
              </button>
              <button 
                type="button" 
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.setAttribute('capture', 'environment');
                    fileInputRef.current.click();
                    setTimeout(() => fileInputRef.current?.removeAttribute('capture'), 100);
                  }
                }}
                disabled={!!loadingMessage}
                className="bg-green-100 hover:bg-green-200 text-green-700 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg> Cámara
              </button>
            </div>
            
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden" 
              accept="image/*" 
              multiple
            />
          </div>

            {loadingMessage.includes('Imagen') && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3 animate-in fade-in duration-300">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-xs font-bold text-blue-700">{loadingMessage}</span>
              </div>
            )}

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {initialEvidence.map((evidence: string | Blob, index: number) => (
                <div key={index} className="aspect-square rounded-xl overflow-hidden border border-gray-200 relative group shadow-sm hover:shadow-md transition-shadow">
                  <img src={getImageUrl(evidence)} alt={`evidence-${index}`} className="w-full h-full object-cover" />
                  <button 
                    type="button" 
                    onClick={(e) => {
                      e.stopPropagation();
                      removeEvidence(evidence);
                    }} 
                    className="absolute top-1 right-1 bg-red-600/90 text-white rounded-xl p-2.5 shadow-lg active:scale-95 transition-all z-10"
                  >
                    <X size={16} strokeWidth={3} />
                  </button>
                </div>
              ))}
              {initialEvidence.length === 0 && !loadingMessage && (
                <div className="col-span-full py-10 text-center text-gray-300 text-xs italic border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                  <div className="flex flex-col items-center gap-2"><ImageIcon size={24} className="text-gray-200" /><span>Sin evidencia adjunta</span><span className="text-[10px] text-gray-400">Usa los botones para agregar fotos</span></div>
                </div>
              )}
            </div>
          </div>

          <button type="submit" disabled={!!loadingMessage || !formData.description.trim() || !formData.technicianId} className="w-full bg-[#7b1113] text-white py-5 rounded-[1.5rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-red-900/30 active:scale-[0.98] transition-all disabled:opacity-60 mt-4 flex items-center justify-center gap-3 group">
            {loadingMessage ? (<><Loader2 size={20} className="animate-spin" /><span>{loadingMessage}</span></>) : (<><span>{isEditMode ? 'Guardar Cambios' : 'Crear Orden'}</span><ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" /></>)}
          </button>
      </form>
    </div>
  );
};

export default NewOrder;
