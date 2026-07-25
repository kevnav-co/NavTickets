
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ServiceOrder, User, Client, Equipment } from '../../types';
import { 
  Camera, ImageIcon, X, CheckCircle2, Plus, Trash2, 
  UserCheck, Maximize2, ListChecks, Building2, 
  Mic, Pencil, Wrench, ChevronRight, Cog
} from 'lucide-react';

interface OrderWarrantyViewProps {
  order: ServiceOrder;
  client?: Client;
  technician?: User;
  equipmentList: Equipment[];
  onAddTechnician: () => void;
  onAddEquipment: () => void;
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
  techSignature: string | null;
  setTechSignature: (value: string | null) => void;
  clientSignature: string | null;
  setClientSignature: (value: string | null) => void;
  currentWarrantyEvidence: (string | Blob)[];
  onUpload: (files: File[], type: keyof ServiceOrder | 'warrantyJobs', isArray?: boolean) => void;
  onRemove: (indexOrUrl: number | string, type: keyof ServiceOrder | 'warrantyJobs', isArray?: boolean) => void;
  onSelectImage: (url: string) => void;
  getEvidenceUrl: (evidence: string | Blob) => string;
  isUploading: boolean;
  isDeleting: boolean;
  onSaveDraft: () => void;
  additionalObservations: string;
  setAdditionalObservations: (value: string) => void;
  canAssign: boolean;
  canUpdate: boolean;
}


const OrderWarrantyView: React.FC<OrderWarrantyViewProps> = (
  {
    client, technician, equipmentList, onAddTechnician, onAddEquipment, onRemoveEquipment,
    tasks, newTask, setNewTask, addTask, removeTask, editingTask, onEditTask, onUpdateTask, onCancelEdit, setEditingTask,
    
    currentWarrantyEvidence, onUpload, onRemove, onSelectImage, getEvidenceUrl, isUploading, isDeleting,
    onSaveDraft, additionalObservations, setAdditionalObservations, canAssign, canUpdate
  }
) => {
  const navigate = useNavigate();
  const warrantyFileInputRef = useRef<HTMLInputElement>(null);
  const warrantyCameraInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      onUpload(filesArray, 'warrantyJobs', true);
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

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto w-full animate-in fade-in duration-500">
        <input type="file" accept="image/*" multiple ref={warrantyFileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
        <input type="file" accept="image/*" capture="environment" multiple ref={warrantyCameraInputRef} onChange={handleFileChange} style={{ display: 'none' }} />

        <div 
          onClick={canAssign ? onAddTechnician : undefined}
          className={`bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex justify-between items-center ${canAssign ? 'cursor-pointer' : ''}`}
        >
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center"><UserCheck className="text-blue-500" size={30} /></div>
                <div>
                    <p className="text-sm font-bold text-gray-400">TÉCNICO RESPONSABLE</p>
                    <p className="font-bold text-lg text-gray-800">{technician?.name || 'No asignado'}</p>
                </div>
            </div>
            {canAssign && <ChevronRight size={24} className="text-gray-300" />}
        </div>

        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex justify-between items-center">
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center"><Building2 className="text-red-500" size={30} /></div>
                <div>
                    <p className="text-sm font-bold text-gray-400">CLIENTE SOLICITANTE</p>
                    <p className="font-bold text-lg text-gray-800">{client?.name || 'No asignado'}</p>
                </div>
            </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-6 rounded-full bg-blue-500"></div>
              <h3 className="font-bold text-xs text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <Wrench size={14} /> Equipos a Intervenir ({equipmentList.length})
              </h3>
            </div>
            {canUpdate && !isDeleting && (
              <button onClick={onAddEquipment} disabled={!client} className="text-xs font-bold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5 disabled:opacity-50">
                <Plus size={12}/> {equipmentList.length > 0 ? 'Modificar' : 'Vincular'}
              </button>
            )}
          </div>
          <div className="p-4 pt-0">
            <div className="space-y-2">
              {equipmentList.length > 0 ? equipmentList.map(e => (
                  <div key={e.id} className="flex items-center justify-between bg-gray-50 p-2.5 rounded-xl">
                    <div onClick={() => navigate(`/equipment/${e.id}`)} className="flex items-center gap-3 cursor-pointer flex-grow min-w-0">
                        <div className="bg-white w-12 h-12 flex-shrink-0 rounded-lg shadow-sm overflow-hidden flex items-center justify-center">
                            {e.imageUrl ? 
                                <img src={e.imageUrl} alt={e.name} className="w-full h-full object-cover"/> 
                                : <Cog size={24} className="text-gray-300" />
                            }
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-gray-800 truncate">{e.name}</p>
                          <p className="text-xs text-gray-500"># {e.serialNumber}</p>
                        </div>
                    </div>
                    <div className="flex items-center flex-shrink-0">
                      {canUpdate && !isDeleting && (
                        <button onClick={(ev) => { ev.stopPropagation(); onRemoveEquipment(e.id); }} className="p-2 text-gray-400 hover:text-red-500">
                          <X size={16} />
                        </button>
                      )}
                      <ChevronRight onClick={() => navigate(`/equipment/${e.id}`)} size={20} className="text-gray-300 mr-1 cursor-pointer"/>
                    </div>
                  </div>
              )) : <p className="text-sm text-center text-gray-400 py-3">No hay equipos vinculados.</p>}
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2.2rem] shadow-sm border border-gray-100 space-y-4">
            <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2"><div className="w-1.5 h-5 bg-blue-600 rounded-full"></div><h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Evidencias (Garantía)</h4></div>
                {canUpdate && !isDeleting && (
                  <div className="flex items-center gap-2">
                      <button onClick={() => warrantyFileInputRef.current?.click()} disabled={isUploading} className="text-blue-600 text-[9px] font-black bg-blue-50 px-3 py-2 rounded-xl uppercase flex items-center gap-2"><ImageIcon size={14} /> Galería</button>
                      <button onClick={() => warrantyCameraInputRef.current?.click()} disabled={isUploading} className="text-green-600 text-[9px] font-black bg-green-50 px-3 py-2 rounded-xl uppercase flex items-center gap-2"><Camera size={14} /> Cámara</button>
                  </div>
                )}
            </div>
            {currentWarrantyEvidence.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {currentWarrantyEvidence.map((src, i) => (
                        <div key={`warranty-evidence-${i}`} className="relative aspect-square rounded-2xl group cursor-pointer" onClick={() => onSelectImage(getEvidenceUrl(src))}>
                            <img src={getEvidenceUrl(src)} className="w-full h-full object-cover" alt={`Evidencia de garantía ${i+1}`}/>
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center"><Maximize2 size={24} className="text-white opacity-0 group-hover:opacity-100" /></div>
                            {canUpdate && !isDeleting && (
                              <button onClick={(e) => { e.stopPropagation(); onRemove(i, 'warrantyJobs', true); }} className="absolute top-1.5 right-1.5 bg-red-600/90 text-white p-1.5 rounded-xl z-10 opacity-0 group-hover:opacity-100"><X size={12} strokeWidth={4} /></button>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="py-12 border-2 border-dashed border-gray-100 rounded-[2rem] flex flex-col items-center justify-center text-center text-gray-400 gap-3">
                    <ImageIcon size={32} className="opacity-50" /><p className="text-sm font-black uppercase tracking-widest">SIN EVIDENCIA DE GARANTÍA</p><p className="text-xs font-medium -mt-2">Agrega fotos del trabajo realizado</p>
                </div>
            )}
        </div>

        <div className="bg-white p-6 rounded-[2.2rem] shadow-sm border border-gray-100 space-y-5">
            <div className="flex justify-between items-center"><div className="flex items-center gap-2"><div className="w-1.5 h-5 rounded-full bg-blue-600"></div><h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Procedimientos Garantía</h4></div>
            {canUpdate && !isDeleting && <button type="button" onClick={addTask} className="text-[9px] font-black bg-blue-50 text-blue-600 px-3 py-2 rounded-xl uppercase flex items-center gap-2"><Plus size={14} />Agregar</button>}
            </div>
            {canUpdate && !isDeleting && (
              <div className="flex gap-3 items-start mt-4">
                  <textarea ref={taskTextareaRef} value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Ej: Se ajustó el termostato..." className="flex-1 w-full bg-gray-50 rounded-2xl p-4 text-xs font-medium" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTask(); } }} rows={1} />
                  <button type="button" onClick={() => toggleListening('task')} className={`p-4 rounded-2xl ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-500'}`}><Mic size={18} /></button>
              </div>
            )}
            <div className="space-y-2">{tasks.length === 0 ? (<div className="py-8 text-center bg-gray-50/50 rounded-3xl"><ListChecks size={24} className="mx-auto mb-2 text-gray-200" /><p className="text-[10px] font-bold text-gray-300 uppercase">Sin procedimientos</p></div>) : (tasks.map((task, idx) => (<div key={idx} className="bg-gray-50 rounded-[1.5rem] overflow-hidden"><div className="flex items-start gap-4 p-4"><div className="mt-0.5 text-blue-600"><CheckCircle2 size={16} /></div><p className="flex-1 text-xs font-bold text-gray-700 uppercase">{task}</p>{!isDeleting && editingTask?.index !== idx && <div className="flex gap-1"><button onClick={() => onEditTask(idx)} className="text-gray-300 hover:text-blue-500 p-1"><Pencil size={16} /></button><button onClick={() => removeTask(idx)} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={16} /></button></div>}</div>{editingTask?.index === idx && <div className="p-4 bg-gray-100"><textarea value={editingTask.text} onChange={(e) => setEditingTask({ ...editingTask, text: e.target.value })} className="w-full bg-white rounded-xl p-3 text-xs font-medium" rows={3} /><div className="flex justify-end gap-2 mt-2"><button onClick={onCancelEdit} className="text-xs font-bold text-gray-500 px-3 py-1.5 rounded-lg">Cancelar</button><button onClick={onUpdateTask} className="text-xs font-bold text-white bg-green-600 px-3 py-1.5 rounded-lg">Guardar</button></div></div>}</div>)))}</div>
        </div>

        <div className="bg-white p-6 rounded-[2.2rem] shadow-sm border border-gray-100 space-y-5">
            <div className="flex items-center gap-2"><div className="w-segoe h-5 rounded-full bg-blue-600"></div><h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Observaciones de Garantía</h4></div>
            {canUpdate && !isDeleting && (
              <div className="relative">
                <textarea ref={observationsTextareaRef} value={additionalObservations} onChange={(e) => setAdditionalObservations(e.target.value)} onBlur={onSaveDraft} placeholder="Añade observaciones sobre la garantía..." className="w-full bg-gray-50 rounded-2xl p-4 text-xs font-medium h-24 pr-12"/>
                <button type="button" onClick={() => toggleListening('observations')} className={`absolute right-3 top-3 p-2 rounded-full ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-200 text-gray-600'}`}><Mic size={18} /></button>
              </div>
            )}
        </div>
        {/* <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-6">
            <div className="flex items-center gap-2 border-b border-gray-50 pb-4"><div className="w-1.5 h-5 rounded-full bg-blue-600"></div><h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Certificación de Garantía</h4></div>
            <SignatureField 
              title={`Firma Técnico: ${technician?.name || 'TÉCNICO'}`} 
              savedSignature={techSignature} 
              onSave={setTechSignature} 
              disabled={isDeleting} 
              loadableSignatureUrl={technician?.signature} 
              onLoadSavedSignature={() => { if (technician?.signature) { setTechSignature(technician.signature); } }}
            />
            <SignatureField 
              title="Firma Cliente *" 
              savedSignature={clientSignature} 
              onSave={setClientSignature} 
              disabled={isDeleting} 
            />
        </div> */}
    </div>
  );
};

export default OrderWarrantyView;
