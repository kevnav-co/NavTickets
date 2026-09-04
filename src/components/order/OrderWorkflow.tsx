import React, { useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ServiceOrder, OrderStatus, Client, User, Seguimiento, OrderInventoryLine } from '../../types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useValidatedActions } from '../../hooks/useValidatedActions';
import { ServiceOrderSchema } from '../../schemas/order.schema';
import { useOrderActions } from '../../hooks/useOrderActions';
import { getWarrantyInfo } from '../../utils/warranty';
import OrderDetail from './OrderDetail';
import ClientSearchModal from '../shared/ClientSearchModal';
import EquipmentSelectorModal from '../shared/EquipmentSelectorModal';
import InventorySelectorModal from '../shared/InventorySelectorModal';
import UserSearchModal from '../shared/UserSearchModal';
import { Loader2, Package, Plus, X } from 'lucide-react';
import { useFileHandler } from '../../hooks/useFileHandler';
import ImageModal from '../ui/ImageModal';
import { useCollection } from '../../hooks/useCollection';
import { QueryFilter } from '../../hooks/useSupabaseQuery';
import PERMISSIONS, { hasPermission } from '../../permissions';
import { supabase } from '../../services/supabase';

const OrderWorkflow: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const { clients, equipment, users, loading: dataLoading, error: dataError, deleteItem, addItem, inventoryItems, loadInventory } = useData();
  const { updateValidated } = useValidatedActions();
  const { currentUser } = useAuth();
  const { completeOrderAndUpdateEquipment } = useOrderActions();

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [notification, setNotification] = useState<{ show: boolean; title: string; message: string }>({ show: false, title: '', message: '' });
  const [showEquipmentSelector, setShowEquipmentSelector] = useState(false);
  const [showInventorySelector, setShowInventorySelector] = useState(false);
  const [showClientSearch, setShowClientSearch] = useState(false);
  const [showUserSearch, setShowUserSearch] = useState(false);

  // Repuestos usados en esta orden (tabla M:N order_inventory_lines).
  const { data: orderLines } = useCollection<OrderInventoryLine>('order_inventory_lines', {
    filters: id ? [{ column: 'order_id', operator: 'eq', value: id }] : [],
  });

  // Cargar el catálogo de repuestos al entrar a la orden (lazy en DataContext).
  React.useEffect(() => { loadInventory(); }, [loadInventory]);

  const canEdit = useMemo(() => currentUser && hasPermission(currentUser.role, PERMISSIONS.UPDATE_INVENTORY), [currentUser]);

  // Use Supabase QueryFilters instead of Firestore QueryConstraints
  const { data: orders, loading: orderLoading, error: orderError } = useCollection<ServiceOrder>('orders', {
    filters: id ? [{ column: 'id', operator: 'eq', value: id }] : [],
  });

  const order = useMemo(() => (orders && orders.length > 0 ? orders[0] : undefined), [orders]);

  // Historial de seguimientos del tiquete, aislado por empresa (RLS).
  const { data: seguimientos } = useCollection<Seguimiento>('seguimientos', {
    filters: id ? [{ column: 'order_id', operator: 'eq', value: id }] : [],
    orderBy: { column: 'created_at', ascending: false },
    realtime: true,
  });

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
      sessionStorage.removeItem('accountingOrdersCache');
    }
  }, [order, updateValidated]);

  const handleCompleteOrder = useCallback(async (closingData: Partial<ServiceOrder>) => {
    if (!order) return;
    await completeOrderAndUpdateEquipment(order, closingData);
    sessionStorage.removeItem('accountingOrdersCache');
    navigate(`/orders/${order.id}`);
  }, [order, completeOrderAndUpdateEquipment, navigate]);

  const handleDeleteOrderAndImages = useCallback(async () => {
    if (!order || !window.confirm('¿Estás seguro de que quieres eliminar esta orden? Esta acción es irreversible y borrará todos los datos y fotos asociadas.')) return;
    setIsDeleting(true);
    try {
      // Delete order evidence images from Supabase Storage
      const evidenceItems = [
        ...(order.initialEvidence || []),
        ...(order.closingData?.evidenceImages || []),
      ];
      const storageUrls = evidenceItems.filter(
        (item): item is string => typeof item === 'string' && item.includes('supabase.co/storage/v1/object/public')
      );

      if (storageUrls.length > 0) {
        const pathsToDelete = storageUrls.map(url => {
          try {
            const [, rest] = url.split('/public/');
            const parts = rest[0].split('/');
            parts.shift();
            return parts.join('/');
          } catch {
            return null;
          }
        }).filter(Boolean) as string[];

        if (pathsToDelete.length > 0) {
          const { error: storageError } = await supabase.storage.from('order-photos').remove(pathsToDelete);
          if (storageError) {
            console.warn('Failed to delete some evidence files from Supabase Storage:', storageError.message);
          }
        }
      }

      // Delete the order record from Supabase
      await deleteItem('orders', order.id);
      sessionStorage.removeItem('accountingOrdersCache');
      navigate('/orders');
    } catch (error) {
      console.error('Error deleting order:', error);
      setNotification({ show: true, title: 'Error Crítico', message: 'No se pudo eliminar la orden o sus archivos.' });
    } finally {
      setIsDeleting(false);
    }
  }, [order, deleteItem, navigate]);

  const handleClientUpdate = useCallback(async (selectedClient: Client) => {
    if (order) {
      // OJO: NO mandar `equipmentIds` ni `equipmentIds: []` aquí: la tabla `orders`
      // NO tiene columna `equipment_ids` (la relación orden↔equipo vive en
      // `equipment_orders`). Incluirlo hace que PostgREST devuelva 400
      // "column equipment_ids does not exist" y el UPDATE de cliente nunca se
      // persiste (el modal se cerraba/otro quedaba sin guardar).
      await updateValidated('orders', order.id, {
        clientId: selectedClient.id,
        clientName: selectedClient.name,
      }, ServiceOrderSchema);
      sessionStorage.removeItem('accountingOrdersCache');
    }
    setShowClientSearch(false);
  }, [order, updateValidated]);

  const handleUserUpdate = useCallback(async (selectedUser: User) => {
    if (order) {
      await updateValidated('orders', order.id, { technicianId: selectedUser.id }, ServiceOrderSchema);
      sessionStorage.removeItem('accountingOrdersCache');
    }
    setShowUserSearch(false);
  }, [order, updateValidated]);

  const handleEquipmentUpdate = useCallback(async (ids: string[]) => {
    if (order) {
      await updateValidated('orders', order.id, { equipmentIds: ids }, ServiceOrderSchema);
      sessionStorage.removeItem('accountingOrdersCache');
    }
    setShowEquipmentSelector(false);
  }, [order, updateValidated]);

  const handleRemoveEquipment = useCallback(async (equipmentId: string) => {
    if (order) {
      const updatedEquipmentIds = order.equipmentIds?.filter(id => id !== equipmentId) || [];
      await updateValidated('orders', order.id, { equipmentIds: updatedEquipmentIds }, ServiceOrderSchema);
      sessionStorage.removeItem('accountingOrdersCache');
    }
  }, [order, updateValidated]);

  const handleAddNewEquipment = useCallback(() => {
    if (!order) return;
    navigate('/equipment/new', { state: { clientId: order.clientId, returnTo: location.pathname } });
  }, [order, navigate, location.pathname]);

  // Guarda las líneas de repuestos de la orden (reemplazo del set completo).
  const handleInventoryLinesSave = useCallback(async (lines: OrderInventoryLine[]) => {
    if (!order) return;
    try {
      const current = orderLines || [];
      // 1) Quitar las líneas que ya no estén en el nuevo set.
      const newKeys = new Set(lines.filter(l => l.inventoryItemId).map(l => l.inventoryItemId));
      await Promise.all(
        current
          .filter(l => !newKeys.has(l.inventoryItemId))
          .map(l => (l.id ? deleteItem('order_inventory_lines', l) : Promise.resolve()))
      );
      // 2) Upsert del set nuevo (offline-idempotente vía upsert onConflict:id).
      const existing = new Map(current.filter(l => l.id).map(l => [l.inventoryItemId, l.id!]));
      for (const line of lines) {
        if (!line.inventoryItemId) continue;
        await addItem('order_inventory_lines', {
          orderId: order.id,
          inventoryItemId: line.inventoryItemId,
          quantityOut: line.quantityOut || 1,
          unitCostSnapshot: line.unitCostSnapshot ?? 0,
          ...(existing.get(line.inventoryItemId) ? { id: existing.get(line.inventoryItemId) } : {}),
        });
      }
    } catch (err) {
      console.error('Error guardando repuestos:', err);
      setNotification({ show: true, title: 'Error', message: 'No se pudieron guardar los repuestos.' });
    }
    setShowInventorySelector(false);
  }, [order, orderLines, deleteItem, addItem]);

  const handleRemoveInventoryLine = useCallback(async (line: OrderInventoryLine) => {
    if (!order || !line.id) return;
    await deleteItem('order_inventory_lines', line);
  }, [order, deleteItem]);

  const handleGeneratePDF = useCallback(async (action: 'download' | 'share' | 'view') => {
    if (!order || !client || !technician) {
      setNotification({ show: true, title: 'Datos Incompletos', message: 'Falta información de la orden, cliente o técnico.' });
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
      console.error('Failed to load or run PDF generator', error);
      setNotification({ show: true, title: 'Error', message: 'No se pudo cargar el generador de PDF.' });
    } finally {
      setIsGeneratingPdf(false);
      setPdfProgress(0);
    }
  }, [order, client, technician, selectedEquips]);

  if (orderLoading || dataLoading) {
    return <div className="w-full h-screen flex flex-col items-center justify-center gap-4 text-center font-bold text-gray-400"><Loader2 className="animate-spin text-gray-300" size={40} /><p>Cargando datos de la orden...</p></div>;
  }

  const anyError = orderError || dataError;
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
      {showInventorySelector && (
        <InventorySelectorModal
          isOpen
          inventoryItems={inventoryItems || []}
          initialLines={orderLines || []}
          onSave={handleInventoryLinesSave}
          onClose={() => setShowInventorySelector(false)}
        />
      )}
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
        seguimientos={seguimientos || []}
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

      {/* ─── Repuestos usados en la orden (Fase 6) ─────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 pb-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Package size={16} className="text-primary" />
              <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider">Repuestos Usados</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {(() => { let n = 0; for (const l of orderLines || []) n += l.quantityOut || 0; return n; })()}
              </span>
            </div>
            {canEdit && (
              <button
                onClick={() => setShowInventorySelector(true)}
                className="h-8 px-3 bg-primary text-white rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm shadow-primary/20 hover:bg-primary/90 active:scale-95 transition-all flex items-center gap-1"
              >
                <Plus size={14} /> Agregar
              </button>
            )}
          </div>

          <div className="p-2">
            {(orderLines || []).length > 0 ? (
              orderLines!.map(line => {
                const item = inventoryItems?.find(i => i.id === line.inventoryItemId);
                return (
                  <div key={line.id} className="flex items-center gap-3 px-2 py-2.5 border-b border-gray-100 last:border-0">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Package size={14} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-gray-800 truncate">{item?.name || 'Repuesto'}</p>
                      <p className="text-[10px] font-bold text-gray-400">{(item?.sku || '') || ''}</p>
                    </div>
                    <span className="text-sm font-black text-gray-800 shrink-0">
                      x{line.quantityOut || 1}
                      <span className="text-[10px] font-bold text-gray-400 ml-1">{item?.unit || ''}</span>
                    </span>
                    {canEdit && line.id && (
                      <button
                        onClick={() => handleRemoveInventoryLine(line)}
                        className="w-7 h-7 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 active:scale-90 transition-all shrink-0"
                        title="Quitar"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                );
              })
            ) : (
              <button
                onClick={() => canEdit && setShowInventorySelector(true)}
                className={`w-full py-3 text-center text-xs font-bold text-gray-400 ${canEdit ? 'hover:bg-gray-50' : ''} rounded-xl transition-colors`}
              >
                {canEdit ? 'Agregar repuestos usados en esta orden...' : 'Sin repuestos registrados'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default OrderWorkflow;