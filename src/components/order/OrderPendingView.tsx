
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ServiceOrder, Client, User, Equipment } from '../../types';
import { Clock, Building2, User as UserIcon, Wrench, FileText, Camera, Plus, ArrowRight, ChevronRight, ShieldCheck, MapPin, Image as ImageIcon, X, PenLine, Mic, MicOff, Trash2, Calendar, Loader2 } from 'lucide-react';
import { format, parseISO, addHours, addMinutes } from 'date-fns';
import { useData } from '../../context/DataContext';
import { serverTimestamp } from 'firebase/firestore';
import AvailabilityModal from './AvailabilityModal';
import DeleteConfirmationModal from '../shared/DeleteConfirmationModal';

interface Props {
  order: ServiceOrder;
  client: Client | undefined;
  technician: User | undefined;
  currentUser: User | null;
  selectedEquips: Equipment[];
  onStartOrder: () => void;
  onAddEquipment: () => void;
  onRemoveEquipment: (equipmentId: string) => void;
  onAddClient: () => void;
  onUnlinkClient: () => void;
  onAddTechnician: () => void;
  onUnlinkTechnician: () => void;
  onUpdateDescription: (newDescription: string) => Promise<void>;
  initialPhotos: (string | Blob)[];
  onUpload: (file: File, type: 'initialPhotos') => void;
  onRemove: (index: number, type: 'initialPhotos') => void;
  onSelectImage: (url: string) => void;
  getEvidenceUrl: (evidence: string | Blob) => string;
  isUploading: boolean;
  isDeleting: boolean;
  onDestroyOrder: () => void;
  canUpdate: boolean;
  canDelete: boolean;
  canAssign: boolean;
  canStart: boolean;
  canReschedule: boolean;
  canUploadInitialEvidence: boolean;
}

const OrderPendingView: React.FC<Props> = ({ 
  order, client, technician, selectedEquips, onStartOrder, onAddEquipment, 
  currentUser,
  onRemoveEquipment, onAddClient, onUnlinkClient, onAddTechnician, onUnlinkTechnician, onUpdateDescription,
  initialPhotos, onUpload, onRemove, onSelectImage, getEvidenceUrl, isUploading, isDeleting,
  onDestroyOrder,
  canUpdate,
  canDelete,
  canAssign,
  canStart,
  canReschedule,
  canUploadInitialEvidence
}) => {
  const navigate = useNavigate();
  const { updateItem, orders } = useData();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [description, setDescription] = useState(order.description);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const [isScheduling, setIsScheduling] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleApplyReschedule = async (newDate: string, newTime: string, duration: string) => {
    if (!currentUser) return;

    try {
      const [durationHours, durationMinutes] = duration.split(':').map(Number);
      const startTime = new Date(`${newDate}T${newTime}:00`);
      let endTime = addHours(startTime, durationHours);
      endTime = addMinutes(endTime, durationMinutes);

      const updateData = {
        scheduledDate: newDate,
        timeSlot: newTime,
        scheduledEndTime: format(endTime, 'HH:mm'),
        updatedAt: serverTimestamp(),
        lastUpdatedBy: currentUser.id,
      };

      await updateItem('orders', order.id, updateData);
      setIsScheduling(false);
    } catch (error) {
      console.error("Error al reprogramar la orden:", error);
      alert('Hubo un error al reprogramar la orden. Revisa la consola para más detalles.');
    }
  };

  useEffect(() => {
    if (!isEditingDesc) {
      setDescription(order.description);
    }
  }, [order.description, isEditingDesc]);

  const handleUpdateDescription = async () => {
    await onUpdateDescription(description);
    setIsEditingDesc(false);
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("La función de reconocimiento de voz no es compatible con tu navegador.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setDescription(prev => prev + (prev.length > 0 && !prev.endsWith(' ') ? ' ' : '') + transcript);
    };
    recognition.onerror = (event: any) => {
      console.error("Error en reconocimiento de voz: ", event.error);
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  };


  const InfoSection: React.FC<{ title: React.ReactNode; barColor: string; children: React.ReactNode; action?: React.ReactNode; }> = 
    ({ title, barColor, children, action }) => (
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className={`w-1.5 h-6 rounded-full ${barColor}`}></div>
            <h3 className="font-bold text-xs text-gray-500 uppercase tracking-wider flex items-center gap-2">{title}</h3>
          </div>
          {action}
        </div>
        <div className="p-4 pt-0">{children}</div>
      </div>
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0], 'initialPhotos');
      e.target.value = ''; // Reset file input
    }
  };

  return (
    <>
      <div className="bg-gray-50/80 min-h-screen">
        <main className="p-4 space-y-3 pb-28 max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3"><div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center"><Clock size={20} className="text-red-500" /></div><p className="font-bold text-gray-500">Tiempo de Servicio</p></div>
                  <div className="bg-red-50 text-red-600 font-mono font-bold text-base px-4 py-2 rounded-xl">00:00:00</div>
              </div>
              <div className="grid grid-cols-4 gap-2 pt-4 mt-4 border-t border-gray-100 text-center">
                  <div><p className="text-[10px] font-bold text-gray-400 uppercase">Inicio Est.</p><p className="text-xl font-black text-gray-800">{order.timeSlot}</p></div>
                  <div><p className="text-[10px] font-bold text-gray-400 uppercase">Duración</p><p className="text-base font-black text-white bg-blue-500 rounded-lg px-3 py-1 inline-block">{order.scheduledEndTime ? `${(parseInt(order.scheduledEndTime.split(':')[0]) - parseInt(order.timeSlot.split(':')[0]))}h` : 'N/A'}</p></div>
                  <div><p className="text-[10px] font-bold text-gray-400 uppercase">Fin Est.</p><p className="text-xl font-black text-gray-800">{order.scheduledEndTime}</p></div>
                  <div>
                    <p className="text-[10px] font-bold text-red-800 uppercase">Programado</p>
                    <p className="text-sm font-bold text-gray-700">{format(parseISO(order.scheduledDate), 'dd/MM/yyyy')}</p>
                  </div>
              </div>
              {canReschedule && (
                <div className="border-t border-gray-100 mt-4 pt-4">
                  <button
                    onClick={() => setIsScheduling(true)}
                    disabled={!technician || isDeleting}
                    className="w-full text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg py-2.5 flex items-center justify-center gap-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-all"
                  >
                    <Calendar size={14} />
                    Reprogramar
                  </button>
                </div>
              )}
          </div>

          <div onClick={canAssign && !isDeleting ? onAddClient : undefined} className={`bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between ${canAssign && !isDeleting ? 'cursor-pointer' : ''}`}>
              <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center"><Building2 className="text-blue-500" size={22} /></div>
                  <div><p className="text-[11px] font-bold text-gray-400">CLIENTE SOLICITANTE</p><p className="font-bold text-base text-gray-800">{client?.name || 'Asignar cliente'}</p>{client && <p className="text-xs text-gray-500 flex items-center gap-1.5"><MapPin size={10}/> {client.address || 'Sin dirección registrada'}</p>}</div>
              </div>
              {canAssign && client && !isDeleting ? (<button onClick={(e) => { e.stopPropagation(); onUnlinkClient(); }} className="p-2 text-gray-400 hover:text-red-500"><X size={18} /></button>) : canAssign && !isDeleting ? <ChevronRight size={20} className="text-gray-300" /> : null}
          </div>

          <div onClick={canAssign && !isDeleting ? onAddTechnician : undefined} className={`bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between ${canAssign && !isDeleting ? 'cursor-pointer' : ''}`}>
              <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center"><UserIcon className="text-red-500" size={22} /></div>
                  <div><p className="text-[11px] font-bold text-gray-400">RESPONSABLE TÉCNICO</p><p className="font-bold text-base text-gray-800">{technician?.name || 'No asignado'}</p>{technician && <span className="flex items-center gap-1.5 text-xs text-green-600"><ShieldCheck size={12}/> VERIFICADO POR NAVAS APP</span>}</div>
              </div>
              {canAssign && technician && !isDeleting ? (<button onClick={(e) => { e.stopPropagation(); onUnlinkTechnician(); }} className="p-2 text-gray-400 hover:text-red-500"><X size={18} /></button>) : canAssign && !isDeleting ? <ChevronRight size={20} className="text-gray-300" /> : null}
          </div>

          <InfoSection title="Activos a Intervenir" barColor="bg-red-500" action={
              canUpdate && !isDeleting && <button onClick={onAddEquipment} className="text-xs font-bold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Plus size={12}/> Vincular Máquina</button>
          }>
              <div className="space-y-2">
                  {selectedEquips.length > 0 ? selectedEquips.map(e => (
                      <div key={e.id} onClick={() => navigate(`/equipment/${e.id}`)} className="flex items-center justify-between bg-gray-50 p-2.5 rounded-xl cursor-pointer">
                          <div className="flex items-center gap-3"><div className="bg-white p-2 rounded-lg shadow-sm"><Wrench size={18} className="text-gray-400"/></div><div><p className="font-bold text-sm text-gray-800">{e.name}</p><p className="text-xs text-gray-500"># {e.serialNumber}</p></div></div>
                          <div className="flex items-center gap-3"><span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded-md">{e.voltage}</span>
                            {canUpdate && !isDeleting && <button onClick={(ev) => { ev.stopPropagation(); onRemoveEquipment(e.id); }} className="p-1 text-gray-400 hover:text-red-500"><X size={16} /></button>}
                            <ChevronRight size={20} className="text-gray-300 mr-1"/>
                          </div>
                      </div>
                  )) : <p className="text-sm text-center text-gray-400 py-3">No hay activos vinculados.</p>}
              </div>
          </InfoSection>
          
          <InfoSection title="Descripción de la Orden" barColor="bg-yellow-500" action={
              canUpdate && currentUser?.role !== 'technician' && !isEditingDesc && !isDeleting && 
              <button onClick={() => setIsEditingDesc(true)} className="text-xs font-bold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5"><PenLine size={12}/> Editar</button>
            }
          >
            {isEditingDesc ? (
              <div className="space-y-2">
                <div className="relative"><textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full p-4 pr-12 border border-gray-200 bg-gray-50 rounded-2xl text-sm min-h-[120px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder='Describe la solicitud...' /><button type="button" onClick={toggleListening} className={`absolute right-3 bottom-3 p-2 rounded-full ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-200 text-gray-600'}`}>{isListening ? <MicOff size={16} /> : <Mic size={16} />}</button></div>
                <div className="flex justify-end gap-2"><button onClick={() => setIsEditingDesc(false)} className="text-xs font-bold text-gray-600 bg-gray-100 px-4 py-2 rounded-lg">Cancelar</button><button onClick={handleUpdateDescription} className="text-xs font-bold text-white bg-blue-500 px-4 py-2 rounded-lg">Guardar</button></div>
              </div>
            ) : (
              <div className="bg-yellow-50 p-3.5 rounded-lg flex items-start gap-2.5"><FileText size={16} className="text-yellow-700 mt-0.5"/><p className="text-sm text-yellow-900/80 italic font-medium">{`"${order.description}"`}</p></div>
            )}
          </InfoSection>

          <InfoSection title={<><ImageIcon size={14} className="text-red-700"/> FOTOS INICIALES</>} barColor="bg-red-500" action={
                canUploadInitialEvidence && currentUser?.role !== 'technician' && !isDeleting && 
                <div className="flex items-center gap-2">
                  <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="bg-blue-100 text-blue-600 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"><ImageIcon size={14}/> GALERÍA</button>
                  <button onClick={() => cameraInputRef.current?.click()} disabled={isUploading} className="bg-green-100 text-green-600 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"><Camera size={14}/> CÁMARA</button>
                </div>
              }
          >
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
            <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-2 min-h-[120px] flex items-center justify-center">
                  {initialPhotos.length === 0 && !isUploading ? (
                      <div className="text-center text-gray-400"><ImageIcon size={24} className="mx-auto mb-2"/><p className="font-bold text-sm">Sin evidencia adjunta</p><p className="text-xs">Usa los botones para agregar fotos</p></div>
                  ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 w-full">
                          {initialPhotos.map((img, index) => (
                              <div key={index} className="relative aspect-square rounded-lg overflow-hidden border border-gray-100 shadow-sm" onClick={() => onSelectImage(getEvidenceUrl(img))}>
                                  <img src={getEvidenceUrl(img)} alt={`evidence-${index}`} className="w-full h-full object-cover" />
                                  {canUpdate && !isDeleting && <button onClick={(e) => {e.stopPropagation(); onRemove(index, 'initialPhotos')}} className="absolute top-1 right-1 bg-red-600/95 text-white rounded-xl p-2.5 shadow-xl active:scale-95 transition-all"><X size={14} strokeWidth={3} /></button>}
                              </div>
                          ))}
                          {isUploading && <div className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div></div>}
                      </div>
                  )}
              </div>
          </InfoSection>

          {canDelete && (
            <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border-2 border-red-500/20 mt-6">
                <h3 className="text-xs font-black text-red-500 uppercase tracking-[0.2em] mb-3">Zona de Peligro</h3>
                <p className="text-sm text-gray-600 mb-5">La eliminación de una orden de servicio es una acción irreversible. Se borrarán permanentemente todos los datos asociados, incluyendo el informe y las evidencias fotográficas.</p>
                <button onClick={() => setShowDeleteModal(true)} disabled={isDeleting} className="w-full bg-red-600 hover:bg-red-700 text-white py-3.5 rounded-2xl font-bold text-sm uppercase tracking-wider shadow-lg shadow-red-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                    {isDeleting ? <Loader2 className="animate-spin"/> : <Trash2 size={16} />}
                    {isDeleting ? 'Eliminando Orden...' : 'Eliminar Orden de Servicio'}
                </button>
            </div>
          )}
        </main>

        {canStart && <footer className="fixed bottom-16 md:bottom-0 left-0 md:left-64 right-0 bg-white/90 backdrop-blur-sm p-4 border-t border-gray-100 z-10">
          <button onClick={onStartOrder} disabled={isDeleting} className="w-full bg-[#7b1113] text-white font-bold py-4 rounded-2xl text-base flex items-center justify-center gap-2 shadow-lg shadow-red-900/40 active:scale-95 transition-transform disabled:opacity-50">
            {isDeleting ? 'Procesando...': 'INICIAR EJECUCIÓN'} <ArrowRight size={20} />
          </button>
        </footer>}
        
        {isScheduling && technician && (
          <AvailabilityModal
            technician={technician}
            orders={orders}
            onClose={() => setIsScheduling(false)}
            onApplyTime={handleApplyReschedule}
            initialDate={order.scheduledDate}
          />
        )}
      </div>
      {showDeleteModal && (
        <DeleteConfirmationModal 
          title="Confirmar Eliminación"
          message="¿Estás seguro de que quieres eliminar esta orden? Esta acción no se puede deshacer y borrará permanentemente todos los datos y archivos asociados."
          isDeleting={isDeleting}
          onConfirm={onDestroyOrder} 
          onCancel={() => setShowDeleteModal(false)} 
        />
      )}
    </>
  );
};

export default OrderPendingView;
