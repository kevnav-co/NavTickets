
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ServiceOrder, Client, User, Equipment, OrderStatus, WarrantyJob } from '../../types';
import { Hourglass, Play, ChevronLeft, Loader2, PenLine } from 'lucide-react';
import OrderPendingView from './OrderPendingView';
import OrderInProgressView from './OrderInProgressView';
import OrderSummaryView from './OrderSummaryView';
import { getUserPermissions } from '../../permissions';
import { useFirestoreActions } from '../../hooks/useFirestoreActions';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { storage } from '../../services/firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { compressImage } from '../../utils/imageCompression';
import { useConnectivityStatus } from '../../hooks/useConnectivityStatus';
import { blobToBase64 } from '../../utils/blobConverter';

const ConfirmationModal = ({ message, onConfirm, onCancel }: { message: string, onConfirm: () => void, onCancel: () => void }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
    <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl flex flex-col items-center text-center">
      <div className="w-20 h-20 bg-yellow-50 text-yellow-500 rounded-3xl flex items-center justify-center mb-6"><Hourglass size={40} /></div>
      <h3 className="text-xl font-black uppercase">Confirmar Acción</h3>
      <p className="text-xs text-gray-500 mb-8 font-medium">{message}</p>
      <div className="w-full space-y-3">
        <button onClick={onConfirm} className="w-full py-5 bg-primary text-white rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2"><Play size={16} fill="currentColor" />Confirmar</button>
        <button onClick={onCancel} className="w-full py-4 bg-gray-50 text-gray-400 rounded-2xl font-black text-[10px] uppercase">Volver</button>
      </div>
    </div>
  </div>
);

interface Props {
  order: ServiceOrder;
  client?: Client;
  technician?: User;
  equipmentList: Equipment[];
  users: User[];
  onStartOrder: () => void;
  onCompleteOrder: (updatedOrder: Partial<ServiceOrder>) => Promise<void>;
  onAddEquipment?: () => void;
  onRemoveEquipment: (equipmentId: string) => void;
  onAddClient?: () => void;
  onAddTechnician: () => void;
  onUpdateOrder: (order: Partial<ServiceOrder>) => Promise<void>;
  handleDeleteOrderAndImages: () => Promise<void>;
  generatePDF: (action: 'download' | 'share' | 'view') => Promise<void>;
  isGeneratingPdf: boolean;
  isDeleting: boolean;
  pdfProgress: number;
  currentUser: User | null;
  onSelectImage: (url: string) => void;
  onUpload: (files: File[], fieldName: keyof ServiceOrder, isArray?: boolean) => Promise<void>;
  onRemove: (indexOrUrl: number | string, fieldName: keyof ServiceOrder, isArray?: boolean) => Promise<void>;
  isUploading: boolean;
  fileError: string | null;
  getFileUrl: (file: string | Blob) => string;
  getWarrantyInfo: (order: Partial<ServiceOrder>) => { expired: boolean; text: string } | null;
}

const OrderDetail: React.FC<Props> = ({ 
  order, client, technician, equipmentList, users, onStartOrder, onCompleteOrder, 
  onAddEquipment, onRemoveEquipment, onAddClient, onAddTechnician, onUpdateOrder, 
  handleDeleteOrderAndImages,
  generatePDF, isGeneratingPdf, isDeleting, pdfProgress, currentUser,
  onSelectImage, 
  onUpload: genericUpload, 
  onRemove: genericRemove, 
  isUploading,
  fileError,
  getFileUrl, 
  getWarrantyInfo
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { updateItem } = useFirestoreActions();
  const connectivityStatus = useConnectivityStatus();
  const initialLoad = useRef(true);

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationInfo, setConfirmationInfo] = useState({ message: '', action: () => {} });

  const currentJob = useMemo(() => 
    order.isUnderWarrantyReview && order.warrantyJobs && order.warrantyJobs.length > 0 
      ? order.warrantyJobs[order.warrantyJobs.length - 1] 
      : undefined
  , [order.isUnderWarrantyReview, order.warrantyJobs]);

  const [tasks, setTasks] = useLocalStorage<string[]>(`tasks-${order.id}`, []);
  const [approverName, setApproverName] = useLocalStorage<string>(`approverName-${order.id}`, '');
  const [approverId, setApproverId] = useLocalStorage<string>(`approverId-${order.id}`, '');
  const [techSignature, setTechSignature] = useLocalStorage<string | null>(`techSig-${order.id}`, null);
  const [clientSignature, setClientSignature] = useLocalStorage<string | null>(`clientSig-${order.id}`, null);
  const [additionalObservations, setAdditionalObservations] = useLocalStorage<string>(`addObs-${order.id}`, '');
  const [currentWarrantyEvidence, setCurrentWarrantyEvidence] = useLocalStorage<(string | Blob)[]>(`warrantyEv-${order.id}`, []);
  
  const [newTask, setNewTask] = useState('');
  const [editingTask, setEditingTask] = useState<{ index: number; text: string } | null>(null);
  const [isWarrantyUploading, setIsWarrantyUploading] = useState(false);

  useEffect(() => {
    if (location.state?.fromWarrantyReopen) {
      setTasks([]);
      setAdditionalObservations('');
      setClientSignature(null);
      setCurrentWarrantyEvidence([]);
      window.localStorage.removeItem(`tasks-${order.id}`);
      window.localStorage.removeItem(`addObs-${order.id}`);
      window.localStorage.removeItem(`clientSig-${order.id}`);
      window.localStorage.removeItem(`warrantyEv-${order.id}`);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate, setTasks, setAdditionalObservations, setClientSignature, setCurrentWarrantyEvidence, order.id]);

  useEffect(() => {
    if (initialLoad.current) {
      let signatureToSet: string | null = null;
      let draftUpdate: Partial<ServiceOrder> | null = null;

      if (order.isUnderWarrantyReview) {
        const jobSignature = currentJob?.technicianSignature;
        setTasks(currentJob?.tasksPerformed || []);
        setAdditionalObservations(currentJob?.additionalComments || '');
        setClientSignature(currentJob?.clientSignature || null);
        setCurrentWarrantyEvidence(currentJob?.evidenceImages || []);

        if (!jobSignature && technician?.signature) {
          signatureToSet = technician.signature;
          const lastJobIndex = (order.warrantyJobs?.length || 0) - 1;
          if (lastJobIndex >= 0) {
            const updatedJobs = [...(order.warrantyJobs || [])];
            updatedJobs[lastJobIndex] = { ...updatedJobs[lastJobIndex], technicianSignature: signatureToSet };
            draftUpdate = { warrantyJobs: updatedJobs };
          }
        } else {
          signatureToSet = jobSignature || null;
        }
      } else {
        const closingSignature = order.closingData?.technicianSignature;
        setTasks(order.closingData?.tasksPerformed || []);
        setAdditionalObservations(order.closingData?.additionalComments || '');
        setApproverName(order.closingData?.approverName || '');
        setApproverId(order.closingData?.approverId || '');
        setClientSignature(order.closingData?.clientSignature || null);

        if (!closingSignature && technician?.signature) {
          signatureToSet = technician.signature;
          draftUpdate = { closingData: { ...order.closingData, technicianSignature: signatureToSet } };
        } else {
          signatureToSet = closingSignature || null;
        }
      }

      setTechSignature(signatureToSet);
      if (draftUpdate) {
        onUpdateOrder(draftUpdate);
      }

      initialLoad.current = false;
    }
  }, [order, currentJob, technician, setTasks, setAdditionalObservations, setApproverName, setApproverId, setTechSignature, setClientSignature, setCurrentWarrantyEvidence, onUpdateOrder]);

  const handleWarrantyImageUpload = async (files: File[]) => {
    if (!files || files.length === 0) return;
    
    setIsWarrantyUploading(true);
    try {
        const uploadPromises = files.map(async (file) => {
            const compressedFile = await compressImage(file);
            if (!compressedFile) throw new Error(`Compression failed for ${file.name}`);
            
            if (connectivityStatus.text === 'Online') {
                const filePath = `orders/${order.id}/warrantyJobs/${Date.now()}_${file.name}`;
                const storageRef = ref(storage, filePath);
                const uploadTask = uploadBytesResumable(storageRef, compressedFile);
                await uploadTask;
                return getDownloadURL(uploadTask.snapshot.ref);
            } else {
                return blobToBase64(compressedFile);
            }
        });

        const downloadURLs = await Promise.all(uploadPromises);
        
        const lastJobIndex = (order.warrantyJobs?.length || 0) - 1;
        if (lastJobIndex < 0) return;

        const updatedJobs = JSON.parse(JSON.stringify(order.warrantyJobs));
        const currentImages = updatedJobs[lastJobIndex].evidenceImages || [];
        updatedJobs[lastJobIndex].evidenceImages = [...currentImages, ...downloadURLs];
        
        await onUpdateOrder({ warrantyJobs: updatedJobs });
        setCurrentWarrantyEvidence(prev => [...(prev.filter(item => typeof item === 'string')), ...downloadURLs]);

    } catch (error) {
        console.error("Error uploading warranty images:", error);
    } finally {
        setIsWarrantyUploading(false);
    }
  };

  const handleWarrantyImageRemove = async (indexOrUrl: number | string) => {
    const lastJobIndex = (order.warrantyJobs?.length || 0) - 1;
    if (lastJobIndex < 0) return;

    const updatedJobs = JSON.parse(JSON.stringify(order.warrantyJobs));
    const jobImages = updatedJobs[lastJobIndex].evidenceImages || [];
    let urlToDelete: string | undefined;
    let newImages: string[];

    if (typeof indexOrUrl === 'number') {
        urlToDelete = jobImages[indexOrUrl];
        newImages = jobImages.filter((_: string, i: number) => i !== indexOrUrl);
    } else {
        urlToDelete = indexOrUrl;
        newImages = jobImages.filter((url: string) => url !== indexOrUrl);
    }
    
    if (urlToDelete) {
      try {
        if (urlToDelete.includes('firebasestorage')) {
          const fileRef = ref(storage, urlToDelete);
          await deleteObject(fileRef);
        }
        
        updatedJobs[lastJobIndex].evidenceImages = newImages;
        await onUpdateOrder({ warrantyJobs: updatedJobs });
        setCurrentWarrantyEvidence(newImages);

      } catch (error: any) {
        if (error.code !== 'storage/object-not-found') {
            console.error("Error deleting warranty image:", error);
        }
      }
    }
  };

  const masterUploadHandler = async (files: File[], fieldName: keyof ServiceOrder | 'warrantyJobs', isArray?: boolean) => {
    if (fieldName === 'warrantyJobs') {
      await handleWarrantyImageUpload(files);
    } else {
      await genericUpload(files, fieldName as keyof ServiceOrder, isArray);
    }
  };

  const masterRemoveHandler = async (indexOrUrl: number | string, fieldName: keyof ServiceOrder | 'warrantyJobs', isArray?: boolean) => {
    if (fieldName === 'warrantyJobs') {
      await handleWarrantyImageRemove(indexOrUrl);
    } else {
      await genericRemove(indexOrUrl, fieldName as keyof ServiceOrder, isArray);
    }
  };

  const cleanupLocalStorage = () => {
    const keys = [`tasks-${order.id}`, `approverName-${order.id}`, `approverId-${order.id}`, `techSig-${order.id}`, `clientSig-${order.id}`, `addObs-${order.id}`, `warrantyEv-${order.id}`];
    keys.forEach(key => window.localStorage.removeItem(key));
  };

  const permissions = useMemo(() => getUserPermissions(currentUser), [currentUser]);

  const handleEditServiceName = async () => {
    if (currentUser?.role !== 'admin') return;
    const newServiceName = prompt('Editar Concepto de Servicio', order.serviceName);
    if (newServiceName && newServiceName.trim() !== '' && newServiceName !== order.serviceName) {
        try {
            await onUpdateOrder({ 
                serviceName: newServiceName.trim(),
                updatedAt: new Date().toISOString(), // Use ISO string for consistency
                lastUpdatedBy: currentUser.id,
            });
        } catch (error) {
            console.error("Error updating service name:", error);
            alert("No se pudo actualizar el concepto del servicio.");
        }
    }
  };

  const formatTimeDiff = (minutes: number): string => {
    const absMinutes = Math.abs(minutes);
    if (absMinutes < 60) return `${absMinutes} min`;
    const hours = Math.floor(absMinutes / 60);
    const remainingMinutes = absMinutes % 60;
    return `${hours}h${remainingMinutes > 0 ? ` ${remainingMinutes}m` : ''}`;
  };
  
  const handleInitiateStart = () => {
    const now = new Date();
    const timeSlot = order.timeSlot && order.timeSlot.match(/^\d{2}:\d{2}$/) ? order.timeSlot : '00:00';
    const scheduledDateTime = new Date(`${order.scheduledDate}T${timeSlot}`);
    
    const action = () => { onStartOrder(); setShowConfirmation(false); };

    if (isNaN(scheduledDateTime.getTime())) {
        setConfirmationInfo({ message: '¿Confirmas el inicio del servicio?', action });
        setShowConfirmation(true);
        return;
    }

    const diffMinutes = Math.round((now.getTime() - scheduledDateTime.getTime()) / 60000);
    let message = '¿Confirmas el inicio del servicio?';
    if (diffMinutes < -15) message = `Iniciando ${formatTimeDiff(diffMinutes)} antes. ¿Continuar?`;
    else if (diffMinutes > 15) message = `Iniciando con un retraso de ${formatTimeDiff(diffMinutes)}. ¿Continuar?`;

    setConfirmationInfo({ message, action });
    setShowConfirmation(true);
  };

  const handleRestartOrder = () => {
    const action = async () => {
      await onUpdateOrder({ startTime: new Date().toISOString() });
      setShowConfirmation(false);
    };
    setConfirmationInfo({ message: '¿Reiniciar el contador de la orden? La hora de inicio se actualizará.', action });
    setShowConfirmation(true);
  };

  const handleUnlink = (type: 'client' | 'technician') => {
    const message = type === 'client' ? '¿Desvincular cliente?' : '¿Desvincular técnico?';
    const fieldToUpdate = type === 'client' ? { clientId: undefined } : { technicianId: '' };
    const action = async () => { await onUpdateOrder(fieldToUpdate); setShowConfirmation(false); }
    setConfirmationInfo({ message, action });
    setShowConfirmation(true);
  }

  const handleSaveDraft = async (updatedData: { tasks?: string[], observations?: string, techSig?: string | null, clientSig?: string | null } = {}) => {
    const { tasks: updatedTasks, observations: updatedObservations, techSig: updatedTechSig, clientSig: updatedClientSig } = updatedData;

    const dataToSave = {
        tasks: updatedTasks !== undefined ? updatedTasks : tasks,
        observations: updatedObservations !== undefined ? updatedObservations : additionalObservations,
        techSignature: updatedTechSig !== undefined ? updatedTechSig : techSignature,
        clientSignature: updatedClientSig !== undefined ? updatedClientSig : clientSignature,
    };

    let draft: Partial<ServiceOrder> = {};
    if (order.isUnderWarrantyReview) {
        const lastJobIndex = (order.warrantyJobs?.length || 0) - 1;
        if (lastJobIndex < 0) return;
        const updatedJobs: WarrantyJob[] = JSON.parse(JSON.stringify(order.warrantyJobs || []));
        const jobToUpdate = updatedJobs[lastJobIndex];
        
        updatedJobs[lastJobIndex] = { 
            ...jobToUpdate,
            tasksPerformed: dataToSave.tasks, 
            additionalComments: dataToSave.observations, 
            technicianSignature: dataToSave.techSignature, 
            clientSignature: dataToSave.clientSignature,
            technicianId: jobToUpdate.technicianId || order.technicianId, 
        };
        draft = { warrantyJobs: updatedJobs };
    } else {
        draft = {
            closingData: { 
              ...order.closingData,
              tasksPerformed: dataToSave.tasks, 
              approverName, 
              approverId, 
              technicianSignature: dataToSave.techSignature, 
              clientSignature: dataToSave.clientSignature,
              additionalComments: dataToSave.observations 
            },
        };
    }
    await onUpdateOrder(draft);
  };

  const handleCompleteOrderWrapper = async () => {
    await onCompleteOrder({
      endTime: new Date().toISOString(),
      status: OrderStatus.CLOSED,
      closingData: {
        ...order.closingData,
        tasksPerformed: tasks,
        approverName,
        approverId,
        technicianSignature: techSignature || null,
        clientSignature: clientSignature || null,
        additionalComments: additionalObservations,
        evidenceImages: order.finalEvidence || [],
      },
    });
    cleanupLocalStorage();
  }

  const handleCloseWarrantyJob = async () => {
    if (!currentUser || !order.warrantyJobs || order.warrantyJobs.length === 0) return;
    const currentJobIndex = order.warrantyJobs.length - 1;
    const updatedJobs = [...order.warrantyJobs];
    updatedJobs[currentJobIndex] = { ...updatedJobs[currentJobIndex], endTime: new Date().toISOString(), tasksPerformed: tasks, additionalComments: additionalObservations, evidenceImages: currentWarrantyEvidence.filter(e => typeof e === 'string') as string[], technicianSignature: techSignature || null, clientSignature: clientSignature || null };
    await updateItem('orders', order.id, { status: OrderStatus.CLOSED, isUnderWarrantyReview: false, warrantyJobs: updatedJobs, warrantyStartTime: null, warrantyEndTime: null });
    cleanupLocalStorage();
    navigate(`/orders/${order.id}`);
  };

  const handleAddTask = () => {
    const newTasks = [...tasks, newTask];
    setTasks(newTasks);
    setNewTask('');
    handleSaveDraft({ tasks: newTasks });
  };

  const handleRemoveTask = (index: number) => {
    const newTasks = tasks.filter((_, i) => i !== index);
    setTasks(newTasks);
    handleSaveDraft({ tasks: newTasks });
  };

  const handleUpdateTask = () => {
    if(editingTask) {
      const newTasks = [...tasks];
      newTasks[editingTask.index] = editingTask.text;
      setTasks(newTasks);
      setEditingTask(null);
      handleSaveDraft({ tasks: newTasks });
    }
  };

  const renderContent = () => {
    if (!order || !currentUser) return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin" /></div>;
    
    const warrantyTechnicianId = currentJob?.technicianId;
    const viewTechnician = warrantyTechnicianId ? users.find(u => u.id === warrantyTechnicianId) : technician;
    const totalUploading = isUploading || isWarrantyUploading;

    switch (order.status) {
      case OrderStatus.PENDING:
        return (
          <OrderPendingView 
            order={order} client={client} technician={technician} selectedEquips={equipmentList}
            currentUser={currentUser}
            onStartOrder={handleInitiateStart} onAddEquipment={onAddEquipment!} onRemoveEquipment={onRemoveEquipment}
            onAddClient={onAddClient!} onUnlinkClient={() => handleUnlink('client')}
            onAddTechnician={onAddTechnician} onUnlinkTechnician={() => handleUnlink('technician')}
            onUpdateDescription={(d) => onUpdateOrder({ description: d })}
            initialPhotos={order.initialPhotos || []} 
            onUpload={(file, type) => masterUploadHandler([file], type as keyof ServiceOrder, true)}
            onRemove={(index, type) => masterRemoveHandler(index, type as keyof ServiceOrder, true)}
            onSelectImage={onSelectImage} getEvidenceUrl={getFileUrl} 
            isUploading={totalUploading} isDeleting={isDeleting} onDestroyOrder={handleDeleteOrderAndImages} 
            canUpdate={permissions.canUpdate} canDelete={permissions.canDelete} canAssign={permissions.canAssign} 
            canStart={permissions.canStart} canReschedule={permissions.canReschedule} 
            canUploadInitialEvidence={permissions.canUploadInitialEvidence}
          />
        );
      case OrderStatus.OPEN:
        return (
           <OrderInProgressView 
            order={order} 
            client={client} 
            technician={viewTechnician} 
            equipmentList={equipmentList}
            isDeleting={isDeleting} 
            isUploading={totalUploading}
            onAddClient={onAddClient!} 
            onUnlinkClient={() => handleUnlink('client')}
            onAddEquipment={onAddEquipment!} 
            onRemoveEquipment={onRemoveEquipment}
            onAddTechnician={onAddTechnician}
            tasks={tasks} 
            newTask={newTask} 
            setNewTask={setNewTask}
            addTask={handleAddTask}
            removeTask={handleRemoveTask}
            editingTask={editingTask} 
            onEditTask={(index: number) => setEditingTask({ index, text: tasks[index] })}
            onUpdateTask={handleUpdateTask}
            onCancelEdit={() => setEditingTask(null)} 
            setEditingTask={setEditingTask}
            techSignature={techSignature} 
            setTechSignature={(sig) => { setTechSignature(sig); handleSaveDraft({ techSig: sig }); }}
            clientSignature={clientSignature} 
            setClientSignature={(sig) => { setClientSignature(sig); handleSaveDraft({ clientSig: sig }); }}
            onSelectImage={onSelectImage} 
            getEvidenceUrl={getFileUrl}
            additionalObservations={additionalObservations} 
            setAdditionalObservations={(obs) => { setAdditionalObservations(obs); handleSaveDraft({ observations: obs }); }}
            onSaveDraft={() => handleSaveDraft({ observations: additionalObservations, tasks: tasks })}
            onDestroyOrder={handleDeleteOrderAndImages} 
            onRestartOrder={handleRestartOrder}
            canUpdate={permissions.canUpdate} 
            canDelete={permissions.canDelete} 
            canRestart={permissions.canRestart} 
            canAssign={permissions.canAssign}
            isUnderWarrantyReview={order.isUnderWarrantyReview || false}
            approverName={approverName} 
            setApproverName={setApproverName}
            approverId={approverId} 
            setApproverId={setApproverId}
            initialPhotos={order.initialPhotos || []}
            currentWarrantyEvidence={currentWarrantyEvidence}
            onUpload={masterUploadHandler}
            onRemove={masterRemoveHandler}
            onCloseOrder={handleCompleteOrderWrapper}
            onCloseWarrantyJob={handleCloseWarrantyJob}
            canUploadInitialEvidence={permissions.canUploadInitialEvidence}
            canUploadFinalEvidence={permissions.canUploadFinalEvidence}
          />
        );
      case OrderStatus.CLOSED:
         return (
          <OrderSummaryView 
            order={order} client={client} technician={technician} selectedEquips={equipmentList} users={users}
            currentUser={currentUser} generatePDF={generatePDF} isGeneratingPdf={isGeneratingPdf} isDeleting={isDeleting}
            pdfProgress={pdfProgress} handleDeleteOrderAndImages={handleDeleteOrderAndImages}
            onSelectImage={onSelectImage} onUpdateOrder={onUpdateOrder} 
            onUpload={(files, type) => masterUploadHandler(files, type, true)}
            onRemove={(index, type) => masterRemoveHandler(index, type, true)}
            isUploading={totalUploading} fileError={fileError} getWarrantyInfo={getWarrantyInfo}
          />
        );
      default:
        return <p>Estado de orden no reconocido.</p>;
    }
  };

  return (
    <div className="bg-gray-50/50 min-h-screen pb-40">
      {order.status !== OrderStatus.OPEN && (
        <header className="sticky top-0 bg-gray-50/90 backdrop-blur-sm z-20 flex items-center justify-between p-4">
            <button onClick={() => navigate(-1)} className="p-2 bg-white rounded-full shadow-sm"><ChevronLeft size={20} /></button>
            <div className="text-center">
                <p className="text-xs font-bold uppercase">Expediente</p>
                <div className="flex items-center gap-2">
                    <h1 className="text-lg font-black">#{order.orderNumber} • {order.serviceName}</h1>
                    {currentUser?.role === 'admin' && (
                        <button onClick={handleEditServiceName} className="text-gray-400 hover:text-blue-500 transition-colors">
                            <PenLine size={16} />
                        </button>
                    )}
                </div>
            </div>
            <div className="w-10 h-10"></div>
        </header>
      )}
      {showConfirmation && <ConfirmationModal message={confirmationInfo.message} onConfirm={confirmationInfo.action} onCancel={() => setShowConfirmation(false)} />}
      {fileError && <div className="fixed bottom-4 right-4 z-[200] bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg shadow-lg"><p className="font-bold">Error de Archivo</p><p>{fileError}</p></div>}
      {renderContent()}
    </div>
  );
};

export default OrderDetail;
