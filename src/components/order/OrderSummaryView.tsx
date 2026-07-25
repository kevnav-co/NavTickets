
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ServiceOrder, Client, Equipment, User, OrderStatus, WarrantyJob } from '../../types';
import { CheckCircle2, X, FileDown, Share2, FileText as FileTextIcon, Loader2, History, Cog, Trash2, ShieldCheck, Maximize2, FilePenLine, Eye, Save, PlusCircle, ImageUp, PanelTop, AlertTriangle } from 'lucide-react';
import DeleteConfirmationModal from '../shared/DeleteConfirmationModal';
import PERMISSIONS, { hasPermission } from '../../permissions';
import { useFirestoreActions } from '../../hooks/useFirestoreActions';

const ConfirmationModal = ({ isOpen, onConfirm, onCancel, title, message }: { isOpen: boolean, onConfirm: () => void, onCancel: () => void, title: string, message: string }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl flex flex-col items-center text-center">
        <div className="w-20 h-20 bg-yellow-50 text-yellow-500 rounded-3xl flex items-center justify-center mb-6 border-4 border-white shadow-lg"><AlertTriangle size={40} /></div>
        <h3 className="text-xl font-black uppercase mb-2">{title}</h3>
        <p className="text-xs text-gray-500 mb-8 font-medium">{message}</p>
        <div className="w-full space-y-3">
          <button onClick={onConfirm} className="w-full py-5 bg-violet-600 text-white rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 shadow-lg shadow-violet-500/30"><ShieldCheck size={16} fill="currentColor" />Confirmar y Reabrir</button>
          <button onClick={onCancel} className="w-full py-4 bg-gray-50 text-gray-400 rounded-2xl font-black text-[10px] uppercase">Cancelar</button>
        </div>
      </div>
    </div>
  );
};

const getImageUrl = (evidence: string | Blob): string => {
  if (typeof evidence === 'string') return evidence;
  return URL.createObjectURL(evidence);
};

const formatIsoToDateTime = (iso?: string) => {
    if (!iso) return '--';
    const date = new Date(iso);
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ', ' + date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const calculateDuration = (startIso?: string, endIso?: string): number => {
  if (!startIso || !endIso) return 0;
  try {
    const startDate = new Date(startIso);
    const endDate = new Date(endIso);
    return Math.max(0, endDate.getTime() - startDate.getTime());
  } catch (e) {
    return 0;
  }
};

const formatDuration = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

interface WarrantyJobCardProps {
  job: WarrantyJob;
  index: number;
  users: User[];
  onSelectImage: (url: string) => void;
}

const WarrantyJobCard: React.FC<WarrantyJobCardProps> = ({ job, index, users, onSelectImage }) => {
  const sectionTitleClass = "text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2";
  const infoLabelClass = "text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1";
  const infoValueClass = "text-sm font-black text-gray-900 uppercase";
  const technicianName = users.find(u => u.id === job.technicianId)?.name || 'No especificado';

  return (
    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-6">
      <h3 className={sectionTitleClass}><div className="w-1.5 h-4 bg-violet-600 rounded-full"></div> Trabajo por Garantía #{index + 1}</h3>
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div><label className={infoLabelClass}>Fecha de Reapertura</label><p className={infoValueClass}>{formatIsoToDateTime(job.reopenedAt)}</p></div>
          <div><label className={infoLabelClass}>Técnico Asignado</label><p className={infoValueClass}>{technicianName}</p></div>
        </div>
        {job.tasksPerformed && job.tasksPerformed.length > 0 && (
          <div><label className={infoLabelClass}>Procedimientos</label><div className="space-y-2 mt-2">{job.tasksPerformed.map((t, i) => (<div key={i} className="flex items-start gap-3 p-3 bg-green-50/30 rounded-2xl border border-green-100/50"><CheckCircle2 size={14} className="text-green-500 mt-0.5 flex-shrink-0" /><p className="text-xs font-medium text-gray-700 leading-snug">{t}</p></div>))}</div></div>
        )}
        {job.evidenceImages && job.evidenceImages.length > 0 && (
          <div><label className={infoLabelClass}>Fotos de Evidencia</label><div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-2">{job.evidenceImages.map((src, i) => (<div key={`warranty-${index}-evidence-${i}`} className="relative aspect-square rounded-2xl overflow-hidden border group cursor-pointer" onClick={() => onSelectImage(getImageUrl(src))}><img src={getImageUrl(src)} className="w-full h-full object-cover"/><div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center"><Maximize2 size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" /></div></div>))}</div></div>
        )}
        {job.additionalComments && (<div className="pt-6 border-t mt-6"><label className={infoLabelClass}>Observaciones</label><p className="text-sm font-medium text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-2xl border">{job.additionalComments}</p></div>)}
      </div>
    </div>
  );
};

interface OrderSummaryViewProps {
  order: ServiceOrder;
  client?: Client;
  technician?: User;
  selectedEquips: Equipment[];
  users: User[];
  currentUser: User | null;
  generatePDF: (action: 'download' | 'share' | 'view') => Promise<void>;
  isGeneratingPdf: boolean;
  isDeleting: boolean;
  pdfProgress: number;
  handleDeleteOrderAndImages: () => Promise<void>;
  onSelectImage: (url: string) => void;
  onUpdateOrder: (updatedData: Partial<ServiceOrder>) => Promise<void>;
  onUpload: (files: File[], fieldName: keyof ServiceOrder, isArray?: boolean) => Promise<void>;
  onRemove: (indexOrUrl: number | string, fieldName: keyof ServiceOrder, isArray?: boolean) => Promise<void>;
  isUploading: boolean;
  fileError: string | null;
  getWarrantyInfo: (order: Partial<ServiceOrder>) => { expired: boolean; text: string } | null;
}

const OrderSummaryView: React.FC<OrderSummaryViewProps> = ({
  order, client, technician, selectedEquips, users, currentUser,
  generatePDF, isGeneratingPdf, isDeleting, pdfProgress, handleDeleteOrderAndImages, onSelectImage,
  onUpdateOrder, onUpload, onRemove, isUploading, getWarrantyInfo
}) => {
  const navigate = useNavigate();
  const { updateItem } = useFirestoreActions();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  
  const [isEditMode, setIsEditMode] = useState(false);
  const [editableOrder, setEditableOrder] = useState<Partial<ServiceOrder>>(order);

  const initialEvidenceInputRef = useRef<HTMLInputElement>(null);
  const finalEvidenceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditableOrder(currentEditable => ({ 
        ...currentEditable, 
        initialEvidence: order.initialEvidence, 
        finalEvidence: order.finalEvidence 
    }));
}, [order]);

  const canEdit = hasPermission(currentUser?.role, PERMISSIONS.UPDATE_CLOSED_ORDER);
  const canDelete = hasPermission(currentUser?.role, PERMISSIONS.DELETE_ORDER);

  const onConfirmDelete = async () => {
    await handleDeleteOrderAndImages();
  };

  const handleInputChange = (field: string, value: any) => {
    setEditableOrder(prev => {
        const updated = { ...prev };
        const setNestedValue = (obj: any, path: string, val: any) => {
            const keys = path.split('.');
            let current = obj;
            for (let i = 0; i < keys.length - 1; i++) {
                current = current[keys[i]] = { ...(current[keys[i]] || {}) };
            }
            current[keys[keys.length - 1]] = val;
        };
        setNestedValue(updated, field, value);
        const periodChanged = field === 'warrantyPeriod';
        const endTimeChanged = field === 'endTime';
        if ((periodChanged || endTimeChanged) && updated.status === OrderStatus.CLOSED) {
            const period = updated.warrantyPeriod ? Number(updated.warrantyPeriod) : 0;
            const endTime = updated.endTime;
            if (period > 0 && endTime) {
                const d = new Date(endTime.split('T')[0] + 'T12:00:00Z');
                d.setUTCDate(d.getUTCDate() + period);
                updated.warrantyExpiration = d.toISOString().split('T')[0];
            } else {
                updated.warrantyExpiration = null;
            }
        }
        return updated;
    });
  };

  const handleTaskChange = (index: number, value: string) => {
    const newTasks = [...(editableOrder.closingData?.tasksPerformed || [])];
    newTasks[index] = value;
    handleInputChange('closingData.tasksPerformed', newTasks);
  };

  const addTask = () => {
    const newTasks = [...(editableOrder.closingData?.tasksPerformed || []), ''];
    handleInputChange('closingData.tasksPerformed', newTasks);
  };

  const removeTask = (index: number) => {
    const newTasks = (editableOrder.closingData?.tasksPerformed || []).filter((_, i) => i !== index);
    handleInputChange('closingData.tasksPerformed', newTasks);
  };

 const handleSaveChanges = async () => {
    const { initialEvidence, finalEvidence, ...restOfEditableOrder } = editableOrder;

    const updatePayload: Partial<ServiceOrder> = {
        ...restOfEditableOrder,
        closingData: {
            ...(order.closingData || {}),
            ...(editableOrder.closingData || {}),
        }
    };

    await onUpdateOrder(updatePayload);
    setIsEditMode(false);
  };
  
  const handleCancelEdit = () => {
    setEditableOrder(order);
    setIsEditMode(false);
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: keyof ServiceOrder) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
        await onUpload(files, fieldName, true);
    }
    if(e.target) e.target.value = '';
  };

  const sectionTitleClass = "text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2";
  const infoLabelClass = "text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1";
  const infoValueClass = "text-sm font-black text-gray-900 uppercase";

  const totalDuration = calculateDuration(order.startTime, order.endTime);
  
  const warrantyInfo = useMemo(() => {
    return getWarrantyInfo(isEditMode ? editableOrder : order);
  }, [isEditMode, editableOrder, order, getWarrantyInfo]);

  const canReopenForWarranty = order.status === OrderStatus.CLOSED &&
                               warrantyInfo && !warrantyInfo.expired &&
                               hasPermission(currentUser?.role, PERMISSIONS.REOPEN_WARRANTY_ORDER);

  const handleReopenConfirm = async () => {
    if (!canReopenForWarranty) return;
    setIsReopening(true);
    setShowReopenModal(false);

    const now = new Date();
    const warrantyStartTime = now.toISOString();

    const newWarrantyJob: WarrantyJob = {
      reopenedAt: warrantyStartTime,
      technicianId: order.technicianId,
      startTime: warrantyStartTime,
      endTime: null, 
      tasksPerformed: [],
      additionalComments: '',
      evidenceImages: [],
      clientSignature: null,
      technicianSignature: null
    };

    const updatedWarrantyJobs = [...(order.warrantyJobs || []), newWarrantyJob];

    try {
        const localDate = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        const localTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

        await updateItem('orders', order.id, {
            status: OrderStatus.OPEN,
            isUnderWarrantyReview: true,
            warrantyStartTime: warrantyStartTime, // Keep for overall tracking if needed
            scheduledDate: localDate,
            timeSlot: localTime,
            warrantyJobs: updatedWarrantyJobs,
        });

      const keysToClear = [`tasks-${order.id}`, `addObs-${order.id}`, `clientSig-${order.id}`, `warrantyEv-${order.id}`];
      keysToClear.forEach(key => window.localStorage.removeItem(key));

      navigate(`/orders/${order.id}`, { state: { fromWarrantyReopen: true }, replace: true });
    } catch (error) {
      console.error("Error al reabrir la orden por garantía:", error);
      setIsReopening(false);
    }
  };


  return (
    <>
      <ConfirmationModal 
        isOpen={showReopenModal}
        onConfirm={handleReopenConfirm}
        onCancel={() => setShowReopenModal(false)}
        title="Reabrir por Garantía"
        message="Esta acción reabrirá la orden y creará un nuevo trabajo de garantía. ¿Estás seguro?"
      />
      <input type="file" ref={initialEvidenceInputRef} multiple onChange={(e) => handleFileSelect(e, 'initialEvidence')} className="hidden" accept="image/*" />
      <input type="file" ref={finalEvidenceInputRef} multiple onChange={(e) => handleFileSelect(e, 'finalEvidence')} className="hidden" accept="image/*" />
      <div className="bg-gray-50/50 min-h-screen pb-32 relative">
        <header className="px-5 py-4 flex items-center justify-between sticky top-0 bg-white border-b border-gray-100 z-40 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-2.5 rounded-2xl text-green-600 shadow-sm"><CheckCircle2 size={22} /></div>
            <div>
              <h1 className="text-xs font-black text-gray-800 uppercase tracking-tight leading-none">Orden Certificada</h1>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">#{order.orderNumber} • Finalizada</p>
            </div>
          </div>
        </header>

        <div className="p-4 space-y-6 max-w-2xl mx-auto w-full animate-in fade-in duration-500">
          <div className="bg-white p-4 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-3">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2"><PanelTop size={16}/> Panel de Acciones</h3>
            <button onClick={() => generatePDF('download')} disabled={isGeneratingPdf || isDeleting || isEditMode} className="w-full bg-[#7b1113] text-white py-5 rounded-[1.8rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-red-900/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3 relative overflow-hidden disabled:opacity-50">
              {isGeneratingPdf && (<div className="absolute left-0 top-0 bottom-0 bg-white/20 transition-all duration-300" style={{ width: `${pdfProgress}%` }}></div>)}
              <div className="relative z-10 flex items-center gap-3">
                {isGeneratingPdf ? <Loader2 className="animate-spin" /> : <FileDown size={20} />}
                <span>{isGeneratingPdf ? `Generando... (${pdfProgress}%)` : 'Descargar PDF'}</span>
              </div>
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => generatePDF('share')} disabled={isDeleting || isEditMode} className="w-full bg-gray-100 text-gray-600 py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"><Share2 size={16} /> Compartir</button>
              <button onClick={() => generatePDF('view')} disabled={isDeleting || isEditMode} className="w-full bg-gray-100 text-gray-600 py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"><FileTextIcon size={16} /> Ver</button>
            </div>
            {canEdit && (
                <>
                    {isEditMode ? (
                        <div className="grid grid-cols-2 gap-3">
                           <button onClick={handleSaveChanges} disabled={isUploading} className="w-full bg-green-600 text-white py-4 rounded-2xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-green-500/20 flex items-center justify-center gap-2 disabled:opacity-50">
                                <Save size={16}/> {isUploading ? 'Guardando...' : 'Guardar Cambios'}
                           </button>
                           <button onClick={handleCancelEdit} className="w-full bg-gray-100 text-gray-800 py-4 rounded-2xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-gray-200/20 flex items-center justify-center gap-2">
                                <Eye size={16}/> Modo Vista
                           </button>
                        </div>
                    ) : (
                         <button onClick={() => setIsEditMode(true)} className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-2xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2">
                            <FilePenLine size={16}/> Modo Edición
                        </button>
                    )}
                </>
            )}
          </div>

          <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-4 opacity-5"><History size={80} /></div>
              <h3 className={sectionTitleClass}><div className="w-1.s h-4 bg-blue-600 rounded-full"></div> Cronometría</h3>
              <div className="text-center my-6">
                {isEditMode ? (
                    <input 
                        type="text"
                        value={formatDuration(calculateDuration(editableOrder.startTime, editableOrder.endTime))}
                        readOnly
                        className="text-5xl font-mono font-black text-gray-500 bg-gray-100 border-2 rounded-2xl text-center w-full max-w-xs mx-auto tracking-tighter"
                    />
                ) : (
                    <p className="text-5xl font-mono font-black text-[#7b1113] tracking-tighter">{formatDuration(totalDuration)}</p>
                )}
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-1">Duración Total</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4 border-t border-gray-100">
                  <div className="bg-gray-50/70 rounded-2xl p-3 text-center">
                    <label className={infoLabelClass}>Inicio</label>
                    {isEditMode ? (
                        <input type="datetime-local" value={editableOrder.startTime ? new Date(new Date(editableOrder.startTime).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 16) : ''} onChange={e => handleInputChange('startTime', new Date(e.target.value).toISOString())} className="bg-white border rounded-md p-1 w-full text-xs"/>
                    ) : (
                        <p className="font-semibold text-gray-700 text-xs">{formatIsoToDateTime(order.startTime)}</p>
                    )}
                  </div>
                  <div className="bg-gray-50/70 rounded-2xl p-3 text-center">
                    <label className={infoLabelClass}>Fin</label>
                     {isEditMode ? (
                        <input type="datetime-local" value={editableOrder.endTime ? new Date(new Date(editableOrder.endTime).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 16) : ''} onChange={e => handleInputChange('endTime', new Date(e.target.value).toISOString())} className="bg-white border rounded-md p-1 w-full text-xs"/>
                    ) : (
                        <p className="font-semibold text-gray-700 text-xs">{formatIsoToDateTime(order.endTime)}</p>
                    )}
                  </div>
                  <div className="bg-gray-50/70 rounded-2xl p-3 text-center md:col-span-2">
                    <label className={infoLabelClass}>Garantía</label>
                    {isEditMode ? (
                        <div className="flex items-center justify-center gap-2 max-w-sm mx-auto">
                            <input
                                type="number"
                                value={editableOrder.warrantyPeriod || ''}
                                onChange={e => handleInputChange('warrantyPeriod', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                                className="bg-white border rounded-md p-1 w-full text-xs text-center"
                                placeholder="Días de garantía"
                            />
                            <div className={`w-full font-bold text-xs p-1 rounded-md ${warrantyInfo?.expired ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-800'}`}>
                                {warrantyInfo ? warrantyInfo.text : 'N/A'}
                            </div>
                        </div>
                    ) : (
                        <p className={`font-bold text-xs ${warrantyInfo?.expired ? 'text-gray-500' : 'text-blue-900'}`}>
                            {warrantyInfo ? warrantyInfo.text : 'No especificada'}
                        </p>
                    )}
                </div>
              </div>
              {canReopenForWarranty && !isEditMode && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <button onClick={() => setShowReopenModal(true)} disabled={isReopening || isDeleting} className="w-full bg-violet-600 hover:bg-violet-700 text-white py-3.5 rounded-2xl font-bold text-sm uppercase tracking-wider shadow-lg shadow-violet-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:bg-violet-400">
                    {isReopening ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
                    <span>{isReopening ? 'Reabriendo...' : 'Reabrir por Garantía'}</span>
                  </button>
                </div>
              )}
          </div>

          <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-6">
            <h3 className={sectionTitleClass}><div className="w-1.5 h-4 bg-[#7b1113] rounded-full"></div> Acta de Ejecución</h3>
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div><label className={infoLabelClass}>Cliente</label><p className={infoValueClass}>{client?.name}</p></div>
                    <div><label className={infoLabelClass}>Técnico</label><p className={infoValueClass}>{technician?.name}</p></div>
                </div>
                <div><label className={infoLabelClass}>Equipos</label><div className="space-y-2 mt-2">{selectedEquips.map(e => (<div key={e.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-100"><div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-sm text-gray-400"><Cog size={16} /></div><div className="min-w-0 flex-1"><p className="text-xs font-black text-gray-800 truncate uppercase">{e.name}</p><p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">S/N: {e.serialNumber}</p></div></div>))}</div></div>
                <div>
                    <label className={infoLabelClass}>Descripción de la Orden</label>
                    <div className="bg-yellow-50 p-3.5 rounded-lg flex items-start gap-2.5">
                        <FileTextIcon size={16} className="text-yellow-700 mt-0.5"/>
                        <p className="text-sm text-yellow-900/80 italic font-medium">{`"${order.description}"`}</p>
                    </div>
                </div>
                <div>
                    <label className={infoLabelClass}>Procedimientos</label>
                    <div className="space-y-2 mt-2">
                    {(editableOrder.closingData?.tasksPerformed || []).map((t, i) => (
                        <div key={i} className="flex items-start gap-2 p-1">
                        <CheckCircle2 size={14} className="text-green-500 mt-2.5 flex-shrink-0" />
                        {isEditMode ? (
                            <div className="flex-1 flex gap-2">
                                <input type="text" value={t} onChange={(e) => handleTaskChange(i, e.target.value)} className="w-full text-xs font-medium p-2 bg-gray-50 border rounded-lg"/>
                                <button onClick={() => removeTask(i)} className="p-2 bg-red-100 text-red-500 rounded-lg"><Trash2 size={14}/></button>
                            </div>
                        ) : (
                            <p className="flex-1 text-xs font-medium text-gray-700 leading-snug p-2">{t}</p>
                        )}
                        </div>
                    ))}
                    </div>
                    {isEditMode && <button onClick={addTask} className="mt-2 flex items-center gap-2 text-xs font-bold text-blue-600"><PlusCircle size={14}/> Añadir Tarea</button>}
                </div>

                {isEditMode || (order.initialEvidence && order.initialEvidence.length > 0) ? (
                    <div><label className={infoLabelClass}>Evidencias (Antes)</label><div className={`grid grid-cols-3 sm:grid-cols-4 gap-3 mt-2 ${isEditMode ? 'p-4 border-2 border-dashed rounded-2xl' : ''}`}>
                        {(order.initialEvidence || []).map((src, index) => (<div key={index} className="relative aspect-square rounded-2xl overflow-hidden border group"><img src={getImageUrl(src)} className="w-full h-full object-cover" onClick={() => onSelectImage(getImageUrl(src))} /><div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                            {isEditMode ? <button onClick={() => onRemove(index, 'initialEvidence', true)} className="absolute top-1 right-1 bg-red-500/80 text-white rounded-full p-1 shadow-lg"><X size={12}/></button> : <Maximize2 size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={() => onSelectImage(getImageUrl(src))} />}
                        </div></div>))}
                         {isEditMode && (<button onClick={() => initialEvidenceInputRef.current?.click()} disabled={isUploading} className="aspect-square bg-gray-50 rounded-2xl flex flex-col items-center justify-center text-gray-400 hover:bg-gray-100 disabled:opacity-50">{isUploading ? <Loader2 className="animate-spin" /> : <ImageUp size={24}/>}<span className="text-[9px] font-bold mt-1">Subir</span></button>)}
                    </div></div>
                ) : null}

                {isEditMode || (order.finalEvidence && order.finalEvidence.length > 0) ? (
                    <div><label className={infoLabelClass}>Evidencias (Después)</label><div className={`grid grid-cols-3 sm:grid-cols-4 gap-3 mt-2 ${isEditMode ? 'p-4 border-2 border-dashed rounded-2xl' : ''}`}>
                        {(order.finalEvidence || []).map((src, index) => (<div key={index} className="relative aspect-square rounded-2xl overflow-hidden border group"><img src={getImageUrl(src)} className="w-full h-full object-cover" onClick={() => onSelectImage(getImageUrl(src))} /><div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                            {isEditMode ? <button onClick={() => onRemove(index, 'finalEvidence', true)} className="absolute top-1 right-1 bg-red-500/80 text-white rounded-full p-1 shadow-lg"><X size={12}/></button> : <Maximize2 size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={() => onSelectImage(getImageUrl(src))} />}
                        </div></div>))}
                        {isEditMode && (<button onClick={() => finalEvidenceInputRef.current?.click()} disabled={isUploading} className="aspect-square bg-gray-50 rounded-2xl flex flex-col items-center justify-center text-gray-400 hover:bg-gray-100 disabled:opacity-50">{isUploading ? <Loader2 className="animate-spin" /> : <ImageUp size={24}/>}<span className="text-[9px] font-bold mt-1">Subir</span></button>)}
                    </div></div>
                ) : null}

                <div className="pt-6 border-t mt-6">
                    <label className={infoLabelClass}>Observaciones</label>
                    {isEditMode ? (
                        <textarea value={editableOrder.closingData?.additionalComments || ''} onChange={e => handleInputChange('closingData.additionalComments', e.target.value)} className="w-full text-sm p-3 border rounded-lg bg-gray-50 h-24"/>
                    ) : (
                        <p className="text-sm font-medium text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-2xl border">{order.closingData?.additionalComments}</p>
                    )}
                </div>

                <div className="pt-8 border-t mt-8 flex flex-wrap gap-8 justify-between items-end">
                    <div className="space-y-4 flex-1 min-w-[200px]">
                        <div>
                            <label className={infoLabelClass}>Aprobado Por</label>
                            {isEditMode ? (
                                <input type="text" value={editableOrder.closingData?.approverName || ''} onChange={e => handleInputChange('closingData.approverName', e.target.value)} className="w-full text-sm p-2 border rounded-lg uppercase font-bold"/>
                            ) : (
                                <p className={infoValueClass}>{order.closingData?.approverName}</p>
                            )}
                        </div>
                        <div>
                            <label className={infoLabelClass}>ID Cliente</label>
                            {isEditMode ? (
                                <input type="text" value={editableOrder.closingData?.approverId || ''} onChange={e => handleInputChange('closingData.approverId', e.target.value)} className="w-full text-sm p-2 border rounded-lg uppercase font-bold"/>
                            ) : (
                                <p className={infoValueClass}>{order.closingData?.approverId}</p>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Firma</label>
                        <div className="w-40 h-20 bg-gray-50 rounded-2xl border p-2 shadow-inner">
                        {order.closingData?.clientSignature && <img src={order.closingData.clientSignature} className="w-full h-full object-contain" alt="Firma" />}
                        </div>
                    </div>
                </div>
            </div>
          </div>

          {order.warrantyJobs && order.warrantyJobs.length > 0 && (
            <>
              {order.warrantyJobs
                .filter((job: WarrantyJob) => job.endTime) 
                .map((job: WarrantyJob, index: number) => (
                  <WarrantyJobCard key={index} job={job} index={index} users={users} onSelectImage={onSelectImage} />
              ))}
            </>
          )}

          {canDelete && !isEditMode && (
            <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border-2 border-red-500/20 mt-6">
                <h3 className="text-xs font-black text-red-500 uppercase tracking-[0.2em] mb-3">Zona de Peligro</h3>
                <p className="text-sm text-gray-600 mb-5">La eliminación de una orden de servicio es una acción irreversible. Se borrarán permanentemente todos los datos asociados, incluyendo el informe y las evidencias fotográficas.</p>
                <button onClick={() => setShowDeleteModal(true)} disabled={isDeleting} className="w-full bg-red-600 hover:bg-red-700 text-white py-3.5 rounded-2xl font-bold text-sm uppercase tracking-wider shadow-lg shadow-red-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                    {isDeleting ? <Loader2 className="animate-spin"/> : <Trash2 size={16} />}
                    {isDeleting ? 'Eliminando Orden...' : 'Eliminar Orden de Servicio'}
                </button>
            </div>
          )}
        </div>
      </div>

      {showDeleteModal && (<DeleteConfirmationModal title="Confirmar Eliminación" message="¿Estás seguro de que quieres eliminar esta orden? Esta acción no se puede deshacer." isDeleting={isDeleting} onConfirm={onConfirmDelete} onCancel={() => setShowDeleteModal(false)} />)}
    </>
  );
};

export default OrderSummaryView;
