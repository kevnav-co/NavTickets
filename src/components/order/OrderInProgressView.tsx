
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ServiceOrder, User, Client, Equipment, OrderStatus } from '../../types';
import { 
  ChevronLeft, Timer, Camera, ImageIcon, X, CheckCircle2, Plus, Trash2, 
  UserCheck, CreditCard, Maximize2, ListChecks, MapPin, Building2, 
  Mic, Pencil, RefreshCw, Wrench, ChevronRight, ShieldCheck, Loader2, Cog,
  FileText
} from 'lucide-react';
import LiveTimer from '../shared/LiveTimer';
import SignatureField from '../ui/SignatureField';
import OrderWarrantyView from './OrderWarrantyView';
import DeleteConfirmationModal from '../shared/DeleteConfirmationModal';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';

interface OrderInProgressViewProps {
  order: ServiceOrder;
  client?: Client;
  technician?: User;
  equipmentList: Equipment[];
  onAddClient: () => void;
  onUnlinkClient: () => void;
  onAddEquipment: () => void;
  onAddTechnician: () => void;
  onRemoveEquipment: (equipmentId: string) => void;
  tasks: string[];
  newTask: string;
  setNewTask: (value: string) => void;
  addTask: () => void;
  removeTask: (index: number) => void;
  editingTask: { index: number; text: string } | null;
  onEditTask: (index: number) => void;
  onUpdateTask: () => void;
  onCancelEdit: () => void;
  setEditingTask: (value: { index: number; text: string } | null) => void;
  approverName: string;
  setApproverName: (value: string) => void;
  approverId: string;
  setApproverId: (value: string) => void;
  techSignature: string | null;
  setTechSignature: (value: string | null) => void;
  clientSignature: string | null;
  setClientSignature: (value: string | null) => void;
  initialPhotos: (string | Blob)[];
  currentWarrantyEvidence: (string | Blob)[];
  onUpload: (files: File[], type: keyof ServiceOrder, isArray?: boolean) => void;
  onRemove: (indexOrUrl: number | string, type: keyof ServiceOrder, isArray?: boolean) => void;
  onSelectImage: (url: string) => void;
  getEvidenceUrl: (evidence: string | Blob) => string;
  isUploading: boolean;
  isDeleting: boolean;
  onCloseOrder: () => void;
  onSaveDraft: () => void;
  onDestroyOrder: () => void;
  onRestartOrder: () => void;
  onCloseWarrantyJob: () => void;
  additionalObservations: string;
  setAdditionalObservations: (value: string) => void;
  canUpdate: boolean;
  canDelete: boolean;
  canAssign: boolean;
  canRestart?: boolean;
  isUnderWarrantyReview: boolean;
  canUploadInitialEvidence: boolean;
  canUploadFinalEvidence: boolean;
}


const OrderInProgressView: React.FC<OrderInProgressViewProps> = (
  {
    order, client, technician, equipmentList, onAddClient, onUnlinkClient, onAddEquipment, onRemoveEquipment, 
    tasks, newTask, setNewTask, addTask, removeTask, editingTask, onEditTask, onUpdateTask, onCancelEdit, setEditingTask,
    approverName, setApproverName, approverId, setApproverId, techSignature, setTechSignature, clientSignature, setClientSignature,
    initialPhotos, currentWarrantyEvidence, onUpload, onRemove, onSelectImage, getEvidenceUrl, isUploading, isDeleting,
    onCloseOrder, onSaveDraft, onDestroyOrder, onRestartOrder, onCloseWarrantyJob,
    additionalObservations, setAdditionalObservations, canUpdate, canDelete, canRestart, canAssign,
    isUnderWarrantyReview,
    canUploadInitialEvidence,
    canUploadFinalEvidence,
    onAddTechnician,
  }
) => {
  const navigate = useNavigate();
  const { isInternetAvailable } = useOfflineStatus();
  const beforePhotoFileInputRef = useRef<HTMLInputElement>(null);
  const beforePhotoCameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const isReadyToClose = isUnderWarrantyReview
    ? tasks.length > 0 && currentWarrantyEvidence.length > 0 && additionalObservations
    : tasks.length > 0 && 
      techSignature && 
      clientSignature && 
      approverName && 
      approverId && 
      order.clientId && 
      order.equipmentIds && 
      order.equipmentIds.length > 0 && 
      additionalObservations &&
      (order.initialEvidence || []).length > 0 &&
      (order.finalEvidence || []).length > 0;

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const observationsTextareaRef = useRef<HTMLTextAreaElement>(null);
  const taskTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (taskTextareaRef.current) {
      taskTextareaRef.current.style.height = 'auto';
      taskTextareaRef.current.style.height = `${taskTextareaRef.current.scrollHeight}px`;
    }
  }, [newTask]);
  
  useEffect(() => {
    if (observationsTextareaRef.current) {
        observationsTextareaRef.current.style.height = 'auto';
        observationsTextareaRef.current.style.height = `${observationsTextareaRef.current.scrollHeight}px`;
    }
  }, [additionalObservations]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: keyof ServiceOrder, isArray = true) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      onUpload(filesArray, type, isArray);
      e.target.value = ''; 
    }
  };

  const toggleListening = (field: 'task' | 'observations') => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Reconocimiento de voz no soportado.");

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (field === 'task') {
        setNewTask(newTask + (newTask.endsWith(' ') ? '' : ' ') + transcript);
      } else {
        setAdditionalObservations(additionalObservations + (additionalObservations.endsWith(' ') ? '' : ' ') + transcript);
      }
    };
    recognition.onerror = (event: any) => { console.error("Error de voz:", event.error); setIsListening(false); };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

  const renderStandardView = () => (
    <div className="p-4 space-y-6 max-w-2xl mx-auto w-full animate-in fade-in duration-500">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-6 rounded-full bg-yellow-500"></div>
              <h3 className="font-bold text-xs text-gray-500 uppercase tracking-wider flex items-center gap-2">Descripción de la Orden</h3>
            </div>
          </div>
          <div className="p-4 pt-0">
            <div className="bg-yellow-50 p-3.5 rounded-lg flex items-start gap-2.5">
                <FileText size={16} className="text-yellow-700 mt-0.5"/>
                <p className="text-sm text-yellow-900/80 italic font-medium">{`"${order.description}"`}</p>
            </div>
          </div>
        </div>
        <div onClick={canUpdate && !isDeleting ? onAddClient : undefined} className={`bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between ${canUpdate && !isDeleting ? 'cursor-pointer' : ''}`}>
          <div className="flex items-center gap-4">
              <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center"><Building2 className="text-blue-500" size={22} /></div>
              <div>
                  <p className="text-[11px] font-bold text-gray-400">CLIENTE SOLICITANTE</p>
                  <p className="font-bold text-base text-gray-800">{client?.name || 'Asignar cliente'}</p>
                  {client && <p className="text-xs text-gray-500 flex items-center gap-1.5"><MapPin size={10}/> {client.address || 'Sin dirección registrada'}</p>}
              </div>
          </div>
          {canUpdate && client && !isDeleting ? (<button onClick={(e) => { e.stopPropagation(); onUnlinkClient(); }} className="p-2 text-gray-400 hover:text-red-500"><X size={18} /></button>) : canUpdate && !isDeleting ? <ChevronRight size={20} className="text-gray-300" /> : null}
        </div>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 flex justify-between items-center">
              <div className="flex items-center gap-3"><div className="w-1.5 h-6 rounded-full bg-red-500"></div><h3 className="font-bold text-xs text-gray-500 uppercase tracking-wider flex items-center gap-2"><Wrench size={14} /> Equipos a Intervenir ({equipmentList.length})</h3></div>
              {canUpdate && !isDeleting && <button onClick={onAddEquipment} disabled={!client} className="text-xs font-bold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Plus size={12}/> {equipmentList.length > 0 ? 'Modificar' : 'Vincular'}</button>}
          </div>
          <div className="p-4 pt-0"><div className="space-y-2">{equipmentList.length > 0 ? equipmentList.map(e => (
              <div key={e.id} onClick={() => navigate(`/equipment/${e.id}`)} className="flex items-center justify-between bg-gray-50 p-2.5 rounded-xl cursor-pointer">
                  <div className="flex items-center gap-3">
                      <div className="bg-white w-12 h-12 flex-shrink-0 rounded-lg shadow-sm overflow-hidden flex items-center justify-center">
                          {e.imageUrl ? 
                              <img src={e.imageUrl} alt={e.name} className="w-full h-full object-cover"/> 
                              : <Cog size={24} className="text-gray-300" />
                          }
                      </div>
                      <div><p className="font-bold text-sm text-gray-800">{e.name}</p><p className="text-xs text-gray-500"># {e.serialNumber}</p></div>
                  </div>
                  <div className="flex items-center gap-3">{canUpdate && !isDeleting && <button onClick={(ev) => { ev.stopPropagation(); onRemoveEquipment(e.id); }} className="p-1 text-gray-400 hover:text-red-500"><X size={16} /></button>}<ChevronRight size={20} className="text-gray-300 mr-1"/></div>
              </div>
          )) : <p className="text-sm text-center text-gray-400 py-3">No hay activos vinculados.</p>}</div></div>
        </div>
        {initialPhotos.length > 0 && (
          <div className="bg-white p-6 rounded-[2.2rem] shadow-sm border border-gray-100 space-y-4">
            <div className="flex justify-between items-center mb-2"><div className="flex items-center gap-2"><div className="w-1.5 h-5 bg-blue-500 rounded-full"></div><h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Fotos Iniciales (Referencia)</h4></div></div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">{initialPhotos.map((src, i) => (
                <div key={`initial-photo-${i}`} className="relative aspect-square rounded-2xl group cursor-pointer" onClick={() => onSelectImage(getEvidenceUrl(src))}>
                    <img src={getEvidenceUrl(src)} className="w-full h-full object-cover" alt={`Foto inicial ${i + 1}`} />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center"><Maximize2 size={24} className="text-white opacity-0 group-hover:opacity-100" /></div>
                </div>
            ))}</div>
          </div>
        )}
        <div className="bg-white p-6 rounded-[2.2rem] shadow-sm border border-gray-100 space-y-4">
          <div className="flex justify-between items-center mb-2"><div className="flex items-center gap-2"><div className="w-1.5 h-5 bg-[#7b1113] rounded-full"></div><h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">EVIDENCIAS (ANTES)</h4></div>{canUploadInitialEvidence && !isDeleting && <div className="flex items-center gap-2"><button onClick={() => beforePhotoFileInputRef.current?.click()} disabled={isUploading} className="text-blue-600 text-[9px] font-black bg-blue-50 px-3 py-2 rounded-xl uppercase flex items-center gap-2"><ImageIcon size={14} /> Galería</button><button onClick={() => beforePhotoCameraInputRef.current?.click()} disabled={isUploading} className="text-green-600 text-[9px] font-black bg-green-50 px-3 py-2 rounded-xl uppercase flex items-center gap-2"><Camera size={14} /> Cámara</button></div>}</div>
          {(order.initialEvidence || []).length > 0 ? <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">{(order.initialEvidence || []).map((src, i) => <div key={`before-${i}`} className="relative aspect-square rounded-2xl group cursor-pointer" onClick={() => onSelectImage(getEvidenceUrl(src))}><img src={getEvidenceUrl(src)} className="w-full h-full object-cover" alt={`Evidencia antes ${i + 1}`} /><div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center"><Maximize2 size={24} className="text-white opacity-0 group-hover:opacity-100" /></div>{canUpdate && !isDeleting && <button onClick={(e) => { e.stopPropagation(); onRemove(i, 'initialEvidence', true); }} className="absolute top-1 right-1 bg-red-600/95 text-white p-2.5 rounded-xl z-20 shadow-xl active:scale-95 transition-all"><X size={16} strokeWidth={4} /></button>}</div>)}</div> : <div className="py-12 border-2 border-dashed border-gray-100 rounded-[2rem] flex flex-col items-center justify-center text-center text-gray-400 gap-3"><ImageIcon size={32} className="opacity-50" /><p className="text-sm font-black uppercase tracking-widest">SIN EVIDENCIA ADJUNTA</p><p className="text-xs font-medium -mt-2">Usa los botones para agregar fotos</p></div>}
        </div>
        <div className="bg-white p-6 rounded-[2.2rem] shadow-sm border border-gray-100 space-y-4">
          <div className="flex justify-between items-center mb-2"><div className="flex items-center gap-2"><div className="w-1.5 h-5 bg-[#7b1113] rounded-full"></div><h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Evidencias (Despues)</h4></div>{canUploadFinalEvidence && !isDeleting && <div className="flex items-center gap-2"><button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="text-blue-600 text-[9px] font-black bg-blue-50 px-3 py-2 rounded-xl uppercase flex items-center gap-2"><ImageIcon size={14} /> Galería</button><button onClick={() => cameraInputRef.current?.click()} disabled={isUploading} className="text-green-600 text-[9px] font-black bg-green-50 px-3 py-2 rounded-xl uppercase flex items-center gap-2"><Camera size={14} /> Cámara</button></div>}</div>
          {(order.finalEvidence || []).length > 0 ? <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">{(order.finalEvidence || []).map((src, i) => <div key={`final-${i}`} className="relative aspect-square rounded-2xl group cursor-pointer" onClick={() => onSelectImage(getEvidenceUrl(src))}><img src={getEvidenceUrl(src)} className="w-full h-full object-cover" alt={`Evidencia final ${i+1}`} /><div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center"><Maximize2 size={24} className="text-white opacity-0 group-hover:opacity-100" /></div>{canUpdate && !isDeleting && <button onClick={(e) => { e.stopPropagation(); onRemove(i, 'finalEvidence', true); }} className="absolute top-1 right-1 bg-red-600/95 text-white p-2.5 rounded-xl z-20 shadow-xl active:scale-95 transition-all"><X size={16} strokeWidth={4} /></button>}</div>)}</div> : <div className="py-12 border-2 border-dashed border-gray-100 rounded-[2rem] flex flex-col items-center justify-center text-center text-gray-400 gap-3"><ImageIcon size={32} className="opacity-50" /><p className="text-sm font-black uppercase tracking-widest">SIN EVIDENCIA ADJUNTA</p><p className="text-xs font-medium -mt-2">Usa los botones para agregar fotos</p></div>}
        </div>
        <div className="bg-white p-6 rounded-[2.2rem] shadow-sm border border-gray-100 space-y-5">
          <div className="flex justify-between items-center"><div className="flex items-center gap-2"><div className="w-1.5 h-5 bg-green-600"></div><h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Procedimientos</h4></div>{canUpdate && !isDeleting && <button type="button" onClick={addTask} className="text-[9px] font-black bg-red-50 text-red-600 px-3 py-2 rounded-xl uppercase flex items-center gap-2"><Plus size={14} />Agregar</button>}</div>
          {canUpdate && !isDeleting && <div className="flex gap-3 items-start mt-4"><textarea ref={taskTextareaRef} value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="Ej: Cambio de rodamientos..." className="flex-1 w-full bg-gray-50 rounded-2xl p-4 text-xs font-medium" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTask(); } }} rows={1} /><button type="button" onClick={() => toggleListening('task')} disabled={!isInternetAvailable} className={`p-4 rounded-2xl ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-500'} disabled:opacity-50 disabled:cursor-not-allowed`}><Mic size={18} /></button></div>}
          <div className="space-y-2">{tasks.length === 0 ? <div className="py-8 text-center bg-gray-50/50 rounded-3xl"><ListChecks size={24} className="mx-auto mb-2 text-gray-200" /><p className="text-[10px] font-bold text-gray-300 uppercase">Sin procedimientos</p></div> : tasks.map((task, idx) => <div key={idx} className="bg-gray-50 rounded-[1.5rem] overflow-hidden">{editingTask?.index === idx ? <div className="p-4"><textarea value={editingTask.text} onChange={e => setEditingTask({ ...editingTask, text: e.target.value })} className="w-full bg-white rounded-xl p-3 text-xs font-medium" rows={3} /><div className="flex justify-end gap-2 mt-2"><button onClick={onCancelEdit} className="text-[10px] font-bold text-gray-500 px-3 py-1.5 rounded-lg">Cancelar</button><button onClick={onUpdateTask} className="text-[10px] font-bold text-white bg-green-600 px-3 py-1.5 rounded-lg">Guardar</button></div></div> : <div className="flex items-start gap-4 p-4"><div className="mt-0.5 text-green-600"><CheckCircle2 size={16} /></div><p className="flex-1 text-xs font-bold text-gray-700 uppercase">{task}</p>{canUpdate && !isDeleting && <div className="flex gap-1"><button onClick={() => onEditTask(idx)} className="text-gray-300 hover:text-blue-500 p-1"><Pencil size={16} /></button><button onClick={() => removeTask(idx)} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={16} /></button></div>}</div>}</div>)}</div>
        </div>
        <div className="bg-white p-6 rounded-[2.2rem] shadow-sm border border-gray-100 space-y-5">
          <div className="flex items-center gap-2"><div className="w-1.5 h-5 bg-yellow-500"></div><h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Observaciones Adicionales</h4></div>
          {canUpdate && !isDeleting && <div className="relative"><textarea ref={observationsTextareaRef} value={additionalObservations} onChange={e => setAdditionalObservations(e.target.value)} onBlur={onSaveDraft} placeholder="Añade observaciones..." className="w-full bg-gray-50 rounded-2xl p-4 text-xs font-medium h-24 pr-12"/><button type="button" onClick={() => toggleListening('observations')} disabled={!isInternetAvailable} className={`absolute right-3 top-3 p-2 rounded-full ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-200 text-gray-600'} disabled:opacity-50 disabled:cursor-not-allowed`}><Mic size={18} /></button></div>}
        </div>
        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-6"><div className="flex items-center gap-2 border-b border-gray-50 pb-4"><div className="w-1.5 h-5 bg-[#7b1113]"></div><h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Certificación</h4></div><div className="grid grid-cols-1 md:grid-cols-2 gap-5"><div className="space-y-2"><label className="text-[9px] font-black text-gray-400 uppercase ml-1">Aprueba *</label><div className="relative group"><input type="text" value={approverName} onChange={e => setApproverName(e.target.value)} onBlur={onSaveDraft} placeholder="¿Quién aprueba?" className="w-full bg-gray-50 rounded-2xl py-4 px-4 pl-11 text-sm font-black" readOnly={isDeleting} /><UserCheck size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" /></div></div><div className="space-y-2"><label className="text-[9px] font-black text-gray-400 uppercase ml-1">Cédula / ID *</label><div className="relative group"><input type="tel" value={approverId} onChange={e => setApproverId(e.target.value)} onBlur={onSaveDraft} placeholder="Nº de ID" className="w-full bg-gray-50 rounded-2xl py-4 px-4 pl-11 text-sm font-black" readOnly={isDeleting} /><CreditCard size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" /></div></div></div><div className="grid grid-cols-1 gap-6 pt-2"><SignatureField title={`Firma Técnico: ${technician?.name || 'TÉCNICO'}`} savedSignature={techSignature} onSave={setTechSignature} disabled={isDeleting} loadableSignatureUrl={technician?.signature} onLoadSavedSignature={() => { if (technician?.signature) { setTechSignature(technician.signature); } }} /><SignatureField title="Firma Cliente *" savedSignature={clientSignature} onSave={setClientSignature} disabled={isDeleting} /></div></div>
        
        {canDelete && (
            <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border-2 border-red-500/20 mt-6">
                <h3 className="text-xs font-black text-red-500 uppercase tracking-[0.2em] mb-3">Zona de Peligro</h3>
                <p className="text-sm text-gray-600 mb-5">La eliminación de una orden es una acción irreversible. Se borrarán permanentemente todos los datos asociados.</p>
                <button onClick={() => setShowDeleteModal(true)} disabled={isDeleting} className="w-full bg-red-600 hover:bg-red-700 text-white py-3.5 rounded-2xl font-bold text-sm uppercase tracking-wider shadow-lg shadow-red-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                    {isDeleting ? <Loader2 className="animate-spin"/> : <Trash2 size={16} />}
                    {isDeleting ? 'Eliminando Orden...' : 'Eliminar Orden de Servicio'}
                </button>
            </div>
        )}
    </div>
  );


  return (
    <>
      <div className="bg-gray-50/50 min-h-screen pb-40">
        <input type="file" accept="image/*" multiple ref={beforePhotoFileInputRef} onChange={(e) => handleFileChange(e, 'initialEvidence')} style={{ display: 'none' }} />
        <input type="file" accept="image/*" capture="environment" multiple ref={beforePhotoCameraInputRef} onChange={(e) => handleFileChange(e, 'initialEvidence')} style={{ display: 'none' }} />
        <input type="file" accept="image/*" multiple ref={fileInputRef} onChange={(e) => handleFileChange(e, 'finalEvidence')} style={{ display: 'none' }} />
        <input type="file" accept="image/*" capture="environment" multiple ref={cameraInputRef} onChange={(e) => handleFileChange(e, 'finalEvidence')} style={{ display: 'none' }} />
        
        <header className="px-5 py-4 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-gray-100 shadow-sm">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 bg-gray-100 text-gray-400 rounded-full"><ChevronLeft size={20} /></button>
          <div className="text-center">
            <h1 className={`text-xs font-black uppercase tracking-widest mb-0.5 ${isUnderWarrantyReview ? 'text-blue-600' : 'text-[#7b1113]'}`}>
              {isUnderWarrantyReview ? 'Trabajo por Garantía' : 'Mantenimiento en Vivo'}
            </h1>
            <p className="text-sm font-black text-gray-800 uppercase tracking-tight">#{order.orderNumber} &bull; {order.serviceName}</p>
          </div>
          <div className="w-10"></div>
        </header>

        <div className="p-4 space-y-6 max-w-2xl mx-auto w-full">
          <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 relative overflow-hidden">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-inner ${isUnderWarrantyReview ? 'bg-blue-50 text-blue-800' : 'bg-red-50 text-red-800'}`}>
                  {isUnderWarrantyReview ? <ShieldCheck size={20} /> : <Timer size={20} className={order.status === OrderStatus.OPEN ? "animate-pulse" : ""} />}
                </div>
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Resumen de Tiempo</h3>
              </div>
              <LiveTimer order={order} isWarranty={isUnderWarrantyReview} />
              {canRestart && !isUnderWarrantyReview &&
                <button type="button" onClick={onRestartOrder} disabled={isDeleting} className="w-full text-[9px] font-black text-yellow-600 bg-yellow-50 px-4 py-3 rounded-xl uppercase flex items-center justify-center gap-2 mt-4 disabled:opacity-50">
                  <RefreshCw size={14} />
                  Reiniciar Orden
                </button>
              }
          </div>
        </div>

        {isUnderWarrantyReview ? (
          <OrderWarrantyView 
            order={order}
            client={client}
            technician={technician}
            equipmentList={equipmentList}
            onAddTechnician={onAddTechnician}
            onAddEquipment={onAddEquipment} 
            onRemoveEquipment={onRemoveEquipment} 
            tasks={tasks}
            newTask={newTask}
            setNewTask={setNewTask}
            addTask={addTask}
            removeTask={removeTask}
            editingTask={editingTask}
            onEditTask={onEditTask}
            onUpdateTask={onUpdateTask}
            onCancelEdit={onCancelEdit}
            setEditingTask={setEditingTask}
            techSignature={techSignature}
            setTechSignature={setTechSignature}
            clientSignature={clientSignature}
            setClientSignature={setClientSignature}
            currentWarrantyEvidence={currentWarrantyEvidence}
            onUpload={onUpload}
            onRemove={onRemove}
            onSelectImage={onSelectImage}
            getEvidenceUrl={getEvidenceUrl}
            isUploading={isUploading}
            isDeleting={isDeleting}
            onSaveDraft={onSaveDraft}
            additionalObservations={additionalObservations}
            setAdditionalObservations={setAdditionalObservations}
            canAssign={canAssign}
            canUpdate={canUpdate} 
          />
        ) : renderStandardView()}
        
        <div className="fixed bottom-16 md:static left-0 right-0 p-4 z-[60] md:bg-transparent md:p-0 md:border-0 md:mt-10 max-w-2xl mx-auto w-full">
          {isUnderWarrantyReview ? (
            <button onClick={onCloseWarrantyJob} disabled={!isReadyToClose || isDeleting} className={`w-full py-5 rounded-[1.8rem] font-black text-sm uppercase tracking-[0.25em] flex items-center justify-center gap-3 ${isReadyToClose ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
              <ShieldCheck size={18} />
              {isDeleting ? 'Cerrando...' : 'CERRAR TRABAJO DE GARANTÍA'}
            </button>
          ) : (
            <button onClick={onCloseOrder} disabled={!isReadyToClose || isDeleting} className={`w-full py-5 rounded-[1.8rem] font-black text-sm uppercase tracking-[0.25em] flex items-center justify-center gap-3 ${isReadyToClose ? 'bg-green-600 text-white shadow-lg shadow-green-500/30' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
              {isDeleting ? 'Procesando...': (isReadyToClose ? 'CERRAR Y CERTIFICAR' : 'DATOS PENDIENTES')}
            </button>
          )}
        </div>
      </div>
      {showDeleteModal && (
          <DeleteConfirmationModal 
              title="Confirmar Eliminación"
              message="¿Estás seguro de que quieres eliminar esta orden? Esta acción no se puede deshacer."
              isDeleting={isDeleting}
              onConfirm={onDestroyOrder} 
              onCancel={() => setShowDeleteModal(false)} 
          />
      )}
    </> 
  );
};

export default OrderInProgressView;
