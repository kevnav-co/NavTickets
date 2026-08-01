
import React, { useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ServiceOrder, OrderStatus, Client, User } from '../../types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useValidatedActions } from '../../hooks/useValidatedActions';
import { ServiceOrderSchema } from '../../schemas/order.schema';
import { useOrderActions } from '../../hooks/useOrderActions';
import { getWarrantyInfo } from '../../utils/warranty';
import OrderDetail from './OrderDetail';
import ClientSearchModal from '../shared/ClientSearchModal';
import EquipmentSelectorModal from '../shared/EquipmentSelectorModal';
import UserSearchModal from '../shared/UserSearchModal';
import { Loader2 } from 'lucide-react';
import { storage } from '../../services/firebase';
import { ref, listAll, deleteObject } from 'firebase/storage';
import { useFileHandler } from '../../hooks/useFileHandler';
import ImageModal from '../ui/ImageModal';
import PERMISSIONS, { hasPermission } from '../../permissions';

const OrderWorkflow: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const { clients, equipment, users, loading: dataLoading, error: dataError, deleteItem, getOrderById } = useData();
  const { updateValidated } = useValidatedActions();
  const { currentUser } = useAuth();
  const { completeOrderAndUpdateEquipment } = useOrderActions();

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [notification, setNotification] = useState<{ show: boolean, title: string, message: string }>({ show: false, title: '', message: '' });
  const [showEquipmentSelector, setShowEquipmentSelector] = useState(false);
  const [showClientSearch, setShowClientSearch] = useState(false);
  const [showUserSearch, setShowUserSearch] = useState(false);

  const order = useMemo(() => (id ? getOrderById(id) : undefined), [id, getOrderById]);

  const canViewOrder = useMemo(() => {
    if (!order || !currentUser) return false;
    if (hasPermission(currentUser.role, PERMISSIONS.VIEW_ALL_ORDERS)) return true;
    return order.technicianId === currentUser.id;
  }, [order, currentUser]);

  const client = useMemo(() => clients?.find(c => c.id === order?.clientId), [clients, order]);
  const technician = useMemo(() => users?.find(u => u.id === order?.technicianId), [users, order]);
  const selectedEquips = useMemo(() => equipment?.filter(e => order?.equipmentIds?.includes(e.id)) ?? [], [equipment, order]);
  const availableClientEquipment = useMemo(() => equipment?.filter(e => e.clientId === order?.clientId) ?? [], [equipment, order]);

  const handleUpdateOrder = useCallback(async (updatedData: Partial<ServiceOrder>) => {
    if (!order) return;
    await updateValidated('orders', order.id, updatedData, ServiceOrderSchema);
    sessionStorage.removeItem('accountingOrdersCache'); // Invalidate cache
  }, [order, updateValidated]);

  const { selectedImage, handleSelectImage, handleCloseModal, isUploading, error: fileError, getFileUrl, handleUpload, handleRemove } = useFileHandler({
    doc: order!,
    updateDoc: handleUpdateOrder,
    storagePath: 'orders',
  });

  const handleStartOrder = useCallback(async () => {
    if (order) {
      await updateValidated('orders', order.id, { status: OrderStatus.OPEN, startTime: new Date().toISOString() }, ServiceOrderSchema);
      sessionStorage.removeItem('accountingOrdersCache'); // Invalidate cache
    }
  }, [order, updateValidated]);

  const handleCompleteOrder = useCallback(async (closingData: Partial<ServiceOrder>) => {
    if (!order) return;
    await completeOrderAndUpdateEquipment(order, closingData);
    sessionStorage.removeItem('accountingOrdersCache'); // Invalidate cache
    navigate(`/orders/${order.id}`);
  }, [order, completeOrderAndUpdateEquipment, navigate]);
  
  const handleDeleteOrderAndImages = useCallback(async () => {
    if (!order || !window.confirm("¿Estás seguro de que quieres eliminar esta orden? Esta acción es irreversible y borrará todos los datos y fotos asociadas.")) return;
    setIsDeleting(true);
    try {
      const orderFolderRef = ref(storage, `orders/${order.id}`);
      const res = await listAll(orderFolderRef);
      const deleteFilePromises = res.items.map(itemRef => deleteObject(itemRef));
      const deleteFolderPromises = res.prefixes.map(async (folderRef) => {
        const folderItems = await listAll(folderRef);
        const folderFilePromises = folderItems.items.map(itemRef => deleteObject(itemRef));
        return Promise.all(folderFilePromises);
      });
      await Promise.all([...deleteFilePromises, ...deleteFolderPromises.flat()]);
      await deleteItem('orders', order.id);
      sessionStorage.removeItem('accountingOrdersCache'); // Invalidate cache
      navigate('/orders');
    } catch (error) {
      console.error("Error deleting order:", error);
      setNotification({ show: true, title: "Error Crítico", message: "No se pudo eliminar la orden o sus archivos." });
    } finally {
      setIsDeleting(false);
    }
  }, [order, deleteItem, navigate]);
  
  const handleClientUpdate = useCallback(async (selectedClient: Client) => {
    if (order) {
        await updateValidated('orders', order.id, {
            clientId: selectedClient.id,
            clientName: selectedClient.name, // Add clientName on update
            equipmentIds: []
        }, ServiceOrderSchema);
        sessionStorage.removeItem('accountingOrdersCache'); // Invalidate cache
    }
    setShowClientSearch(false);
  }, [order, updateValidated]);

  const handleUserUpdate = useCallback(async (selectedUser: User) => {
    if (order) {
        await updateValidated('orders', order.id, { technicianId: selectedUser.id }, ServiceOrderSchema);
        sessionStorage.removeItem('accountingOrdersCache'); // Invalidate cache
    }
    setShowUserSearch(false);
  }, [order, updateValidated]);

  const handleEquipmentUpdate = useCallback(async (ids: string[]) => {
    if(order) {
        await updateValidated('orders', order.id, { equipmentIds: ids }, ServiceOrderSchema);
        sessionStorage.removeItem('accountingOrdersCache'); // Invalidate cache
    }
    setShowEquipmentSelector(false);
  }, [order, updateValidated]);
  
  const handleRemoveEquipment = useCallback(async (equipmentId: string) => {
    if (order) {
      const updatedEquipmentIds = order.equipmentIds?.filter(id => id !== equipmentId) || [];
      await updateValidated('orders', order.id, { equipmentIds: updatedEquipmentIds }, ServiceOrderSchema);
      sessionStorage.removeItem('accountingOrdersCache'); // Invalidate cache
    }
  }, [order, updateValidated]);

  const handleAddNewEquipment = useCallback(() => {
    if (!order) return;
    navigate('/equipment/new', { state: { clientId: order.clientId, returnTo: location.pathname } });
  }, [order, navigate, location.pathname]);

  const handleGeneratePDF = useCallback(async (action: 'download' | 'share' | 'view') => {
    if (!order || !client || !technician) {
      setNotification({ show: true, title: "Datos Incompletos", message: "Falta información de la orden, cliente o técnico." });
      return;
    }
    setIsGeneratingPdf(true);
    try {
        const { generateServiceActa } = await import('../../utils/pdfGenerator');
        const pdfParams = {
            order,
            client,
            technician,
            selectedEquips,
            tasks: order.closingData?.tasksPerformed || [],
            additionalComments: order.closingData?.additionalComments || '',
            approverName: order.closingData?.approverName || client.name,
            approverId: order.closingData?.approverId || client.identification || '',
            techSignature: technician.signature || null,
            clientSignature: order.closingData?.clientSignature || null,
            setPdfProgress,
            setNotification,
        };
        await generateServiceActa(pdfParams, action);
    } catch (error) {
        console.error("Failed to load or run PDF generator", error);
        setNotification({ show: true, title: "Error", message: "No se pudo cargar el generador de PDF." });
    } finally {
        setIsGeneratingPdf(false);
        setPdfProgress(0);
    }
  }, [order, client, technician, selectedEquips]);

  if (dataLoading) {
    return <div className="w-full h-screen flex flex-col items-center justify-center gap-4 text-center font-bold text-gray-400"><Loader2 className="animate-spin text-gray-300" size={40} /><p>Cargando datos de la orden...</p></div>;
  }

  const anyError = dataError;
  if (anyError) {
    return <div className="p-10 text-center font-bold text-red-500">Error al cargar los datos: {anyError.message}</div>;
  }

  if (!order) {
    return <div className="p-10 text-center font-bold text-gray-400">Orden no encontrada...</div>;
  }

  if (!canViewOrder) {
    return <div className="p-10 text-center font-bold text-red-500">No tienes permisos para ver esta orden.</div>;
  }

  return (
    <>
      {showClientSearch && <ClientSearchModal clients={clients || []} onSelect={handleClientUpdate} onClose={() => setShowClientSearch(false)} onAddNew={() => navigate('/clients/new')} />}
      {showUserSearch && <UserSearchModal users={users || []} onSelect={handleUserUpdate} onClose={() => setShowUserSearch(false)} />}
      <EquipmentSelectorModal isOpen={showEquipmentSelector} onClose={() => setShowEquipmentSelector(false)} onSelect={handleEquipmentUpdate} onAddNew={handleAddNewEquipment} availableEquipment={availableClientEquipment} currentEquipmentIds={selectedEquips.map(e => e.id)} />
      {notification.show && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center" onClick={() => setNotification({ ...notification, show: false })}>
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center border-t-8 border-red-500 animate-in zoom-in-95">
            <h3 className="text-lg font-black text-gray-800 mb-2">{notification.title}</h3>
            <p className="text-sm text-gray-500 whitespace-pre-line">{notification.message}</p>
          </div>
        </div>
      )}
      {selectedImage && <ImageModal imageUrl={selectedImage} onClose={handleCloseModal} />}

      <OrderDetail
        order={order}
        client={client}
        technician={technician}
        equipmentList={selectedEquips}
        users={users || []}
        onStartOrder={handleStartOrder}
        onCompleteOrder={handleCompleteOrder}
        onAddEquipment={() => setShowEquipmentSelector(true)}
        onRemoveEquipment={handleRemoveEquipment}
        onAddClient={() => setShowClientSearch(true)}
        onAddTechnician={() => setShowUserSearch(true)}
        onUpdateOrder={handleUpdateOrder}
        handleDeleteOrderAndImages={handleDeleteOrderAndImages}
        isDeleting={isDeleting}
        generatePDF={handleGeneratePDF}
        isGeneratingPdf={isGeneratingPdf}
        pdfProgress={pdfProgress}
        currentUser={currentUser}
        onSelectImage={handleSelectImage}
        onUpload={handleUpload}
        onRemove={handleRemove}
        isUploading={isUploading}
        fileError={fileError}
        getFileUrl={getFileUrl}
        getWarrantyInfo={getWarrantyInfo}
      />
    </>
  );
};

export default OrderWorkflow;
