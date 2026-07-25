
import React, { useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { EquipmentStatus } from '../../types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useFileHandler } from '../../hooks/useFileHandler';
import EquipmentForm from './EquipmentForm';
import ImageModal from '../ui/ImageModal';
import {
  ChevronLeft, ChevronRight, Cog, Hash, Building2, Calendar, Edit3, Trash2,
  Zap, Flame, FileText, Clock, Camera, Copy, Loader2, 
  ImageIcon, ImageUp
} from 'lucide-react';
import { compressImage, validateFile } from '../../utils/index';
import PERMISSIONS, { hasPermission } from '../../permissions';
import DeleteConfirmationModal from '../shared/DeleteConfirmationModal';

const EquipmentDetail: React.FC = () => {
  const { equipment, clients, updateItem, deleteItem } = useData();
  const { currentUser } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const isNew = location.pathname === '/equipment/new';
  const isEdit = location.pathname === `/equipment/${id}/edit`;

  const item = useMemo(() => isNew ? null : equipment.find(e => e.id === id), [id, equipment, isNew]);
  

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { 
    isUploading,
    error: fileError,
    selectedImage,
    handleSelectImage,
    handleCloseModal,
    handleUpload,
  } = useFileHandler({
    doc: item!,
    updateDoc: async (updates) => {
      if (item) {
        await updateItem('equipment', item.id, updates);
      }
    },
    storagePath: 'equipment_photos',
  });

  const permissions = useMemo(() => ({
    canCreate: hasPermission(currentUser?.role, PERMISSIONS.CREATE_EQUIPMENT),
    canUpdate: hasPermission(currentUser?.role, PERMISSIONS.UPDATE_EQUIPMENT),
    canDelete: hasPermission(currentUser?.role, PERMISSIONS.DELETE_EQUIPMENT),
  }), [currentUser]);

  const client = clients.find(c => c.id === item?.clientId);


  const performDelete = async (equipmentId: string) => {
    if (!permissions.canDelete) {
      alert("No tienes permisos para eliminar.");
      return;
    }
    setIsDeleting(true);
    try {
      await deleteItem('equipment', equipmentId);
      navigate('/equipment');
    } catch (error) {
      console.error('Error al eliminar:', error);
      alert('No se pudo eliminar el equipo.');
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };


  const handleDeleteFromDetail = () => {
    if (id) {
      performDelete(id);
    }
  };
  
  const handleClone = () => {
    if (!permissions.canCreate || !item) return alert('No tienes permiso.');
    const { id, serialNumber, createdAt, ...cloneData } = item;
    navigate('/equipment/new', { state: { ...cloneData, serialNumber: '' } });
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
       try {
          const compressedBlob = await compressImage(file);
          const imageFile = new File([compressedBlob], file.name, { type: compressedBlob.type, lastModified: Date.now() });
          await handleUpload([imageFile], 'imageUrl', false);
       } catch (error) { 
         console.error("Error subiendo foto", error); 
         alert("Error al subir la imagen");
       }
    }
    if (e.target) e.target.value = '';
  };

  if (!isNew && !item) return <div className="w-full h-screen flex items-center justify-center"><Loader2 className="animate-spin text-gray-300" size={40}/></div>;

  const getStatusStyle = (status: EquipmentStatus) => {
    const styles: Record<EquipmentStatus, {color: string, bg: string, border: string, label: string}> = {
      'Activa': { color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', label: 'Activa' },
      'Inactiva': { color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200', label: 'Inactiva' },
      'En Mantenimiento': { color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', label: 'En Mantenimiento' },
      'Retirada': { color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: 'Retirada' },
    };
    return styles[status] || styles.Inactiva;
  };
  const statusStyle = item ? getStatusStyle(item.status) : getStatusStyle('Activa');

  if (isNew || isEdit) {
    return (
        <div className="bg-gray-50 min-h-screen">
            <header className="p-4 flex justify-between items-center sticky top-0 bg-gray-50/80 backdrop-blur-sm z-30">
              <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-gray-800">
                <ChevronLeft size={20} /> Volver
              </button>
              <h1 className="font-bold text-lg uppercase tracking-wider">{isNew ? 'Nueva Máquina' : 'Editar Máquina'}</h1>
              <div className="w-16"></div>
            </header>
            <div className="p-4">
                <EquipmentForm />
            </div>
        </div>
    );
  }

  const nextMaintenanceInfo = useMemo(() => {
    if (!item?.lastMaintenanceDate || !item.maintenanceFrequency) return null;
    const lastDate = new Date(item.lastMaintenanceDate + 'T12:00:00');
    const nextDate = new Date(lastDate);
    nextDate.setMonth(nextDate.getMonth() + item.maintenanceFrequency);
    const today = new Date();
    today.setHours(0,0,0,0);
    const diffDays = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const textDate = nextDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    return { date: textDate, days: diffDays, isOverdue: diffDays < 0, isWarning: diffDays >= 0 && diffDays <= 30 };
  }, [item?.lastMaintenanceDate, item?.maintenanceFrequency]);

  return (
    <>
      <input type="file" ref={galleryInputRef} onChange={handlePhotoSelect} className="hidden" accept="image/*" />
      <input type="file" ref={cameraInputRef} onChange={handlePhotoSelect} className="hidden" accept="image/*" capture="environment" />

      {fileError && <div className="fixed top-5 right-5 bg-red-100 text-red-700 p-4 rounded-lg z-50">{fileError}</div>}

      <div className="bg-gray-50 min-h-screen pb-24 max-w-5xl mx-auto">
        <header className="p-4 flex justify-between items-center sticky top-0 bg-gray-50/80 backdrop-blur-sm z-30">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-gray-800">
            <ChevronLeft size={20} /> Volver
          </button>
        </header>

        <div className="p-4 md:p-6 space-y-6">
          <section className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-200">
            <div className="relative h-64 bg-gray-100 group" onClick={() => item?.imageUrl && handleSelectImage(item.imageUrl)}>
              {isUploading ? (
                <div className="w-full h-full flex items-center justify-center"><Loader2 className="text-gray-400 animate-spin" size={40} /></div>
              ) : item?.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain cursor-pointer" />
              ) : (
                <div className="w-full h-full border-4 border-dashed border-gray-200 rounded-t-3xl flex flex-col items-center justify-center p-4">
                  <ImageIcon size={40} className="text-gray-300 mb-2"/>
                  <p className="text-gray-500 font-bold mb-4 text-center">Este equipo no tiene foto</p>
                </div>
              )}
              {permissions.canUpdate && (
                <div className="absolute top-4 right-4 z-20 space-y-2">
                    <button onClick={(e) => { e.stopPropagation(); galleryInputRef.current?.click(); }} className="w-12 h-12 flex items-center justify-center gap-2 bg-white/80 backdrop-blur-sm text-gray-800 font-bold rounded-xl hover:bg-white transition-colors shadow-md">
                        <ImageUp size={20} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }} className="w-12 h-12 flex items-center justify-center gap-2 bg-white/80 backdrop-blur-sm text-gray-800 font-bold rounded-xl hover:bg-white transition-colors shadow-md">
                        <Camera size={20} />
                    </button>
                </div>
              )}
            </div>

            <div className="p-6 space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 text-red-500 text-xs font-bold uppercase mb-1">
                    <Cog size={14} /> {item?.brand || 'Hardware Navas'}
                  </div>
                  <h1 className="text-3xl font-black text-gray-800">{item?.name}</h1>
                </div>
                <div className={`${statusStyle.bg} ${statusStyle.color} ${statusStyle.border} border px-3 py-1.5 rounded-xl font-black text-[10px] uppercase shadow-md flex items-center gap-2`}>
                  <div className={`w-2 h-2 rounded-full`} style={{ backgroundColor: statusStyle.color.replace('text-', '').split('-')[0] }} />
                  {statusStyle.label}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-200">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-gray-500">N/S</p>
                  <div className="flex items-center gap-2 font-bold text-sm text-gray-800">
                    <div className="p-2 bg-gray-100 rounded-lg text-gray-600"><Hash size={16} /></div>
                    {item?.serialNumber}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-gray-500">Voltaje</p>
                  <div className="flex items-center gap-2 font-bold text-sm text-gray-800">
                    <div className="p-2 bg-gray-100 rounded-lg text-gray-600"><Zap size={16} /></div>
                    {item?.voltage}
                  </div>
                </div>
              </div>
              {item?.gasType && item.gasType !== 'No usa' && <div className="pt-4 border-t border-gray-200"><div className="space-y-1"><p className="text-[10px] font-black uppercase">Combustible</p><div className="flex items-center gap-2 text-orange-600 font-bold text-sm"><div className="p-2 bg-orange-50 rounded-lg"><Flame size={16} /></div>{item.gasType}</div></div></div>}
              {item?.description && <div className="pt-4 border-t border-gray-200"><p className="text-[10px] font-black uppercase mb-3">Descripción</p><div className="bg-gray-50 p-4 rounded-2xl text-sm flex items-start gap-3"><FileText size={18} className="flex-shrink-0 mt-0.5" /><p>{item.description}</p></div></div>}
              <div className="pt-4 border-t border-gray-200">
                <p className="text-[10px] font-black uppercase mb-3">Cliente</p>
                <button onClick={() => client && navigate(`/clients/${client.id}`)} className="w-full flex justify-between items-center p-4 bg-gray-50 rounded-2xl" disabled={!client}>
                    <div className="flex items-center gap-3 font-bold text-sm">
                        <div className="bg-white p-2 rounded-xl"><Building2 size={20} className="text-[#7b1113]" /></div>
                        {client?.name || 'N/A'}
                    </div>
                    <ChevronRight size={20} className="text-gray-400" />
                </button>
              </div>
            </div>
          </section>

          <section className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 space-y-4">
            <div className="flex justify-between border-b border-gray-200 pb-4"><h3 className="font-bold flex items-center gap-2"><Calendar size={18} className="text-[#7b1113]" />Mantenimiento</h3>{nextMaintenanceInfo ? <div className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${nextMaintenanceInfo.isOverdue ? 'bg-red-100 text-red-600' : nextMaintenanceInfo.isWarning ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>{nextMaintenanceInfo.isOverdue ? 'Vencido' : 'Programado'}</div> : <span className="text-[10px] font-bold uppercase">No Programado</span>}</div>
            <div className="grid grid-cols-2 gap-4"><div className="bg-gray-50 p-3 rounded-2xl border border-gray-200"><p className="text-[9px] font-black uppercase mb-1">Frecuencia</p><p className="font-bold text-sm">Cada {item?.maintenanceFrequency || 6} Meses</p></div><div className="bg-gray-50 p-3 rounded-2xl border border-gray-200"><p className="text-[9px] font-black uppercase mb-1">Próxima Fecha</p><p className={`font-bold text-sm ${nextMaintenanceInfo?.isOverdue ? 'text-red-600' : nextMaintenanceInfo?.isWarning ? 'text-orange-600' : ''}`}>{nextMaintenanceInfo ? nextMaintenanceInfo.date : '--/--/----'}</p></div></div>
            {nextMaintenanceInfo && <div className={`flex items-center gap-2 text-sm justify-center p-2 rounded-xl ${nextMaintenanceInfo.isOverdue ? 'bg-red-50 text-red-600' : ''}`}><Clock size={14} /><span className="font-medium">{nextMaintenanceInfo.isOverdue ? `Vencido hace ${Math.abs(nextMaintenanceInfo.days)} días` : `Faltan ${nextMaintenanceInfo.days} días`}</span></div>}
          </section>

          <div className="grid grid-cols-3 gap-3 pt-4">
            {permissions.canCreate && <button onClick={handleClone} className="flex flex-col items-center justify-center gap-1.5 bg-blue-50 text-blue-600 py-4 rounded-2xl font-bold"><Copy size={18} /><span className="text-[10px] uppercase">Clonar</span></button>}
            {permissions.canUpdate && <button onClick={() => navigate(`/equipment/${item?.id}/edit`)} className="flex flex-col items-center justify-center gap-1.5 bg-white border border-gray-300 py-4 rounded-2xl font-bold"><Edit3 size={18} /><span className="text-[10px] uppercase">Editar</span></button>}
            {permissions.canDelete && <button onClick={() => setShowDeleteModal(true)} className="flex flex-col items-center justify-center gap-1.5 bg-red-50 text-red-600 py-4 rounded-2xl font-bold"><Trash2 size={18} /><span className="text-[10px] uppercase">Eliminar</span></button>}
          </div>
        </div>
      </div>
      {selectedImage && <ImageModal imageUrl={selectedImage} onClose={handleCloseModal} />}
      {showDeleteModal && <DeleteConfirmationModal title="Confirmar Eliminación" message="¿Estás seguro de que quieres eliminar este equipo? Esta acción es irreversible." isDeleting={isDeleting} onConfirm={handleDeleteFromDetail} onCancel={() => setShowDeleteModal(false)} />}
    </>
  );
};

export default EquipmentDetail;
