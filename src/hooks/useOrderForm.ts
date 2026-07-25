
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { ServiceOrder, OrderStatus, User } from '../types';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { storage } from '../services/firebase';
import { ref, getDownloadURL, deleteObject, uploadBytes } from 'firebase/storage';
import { compressImage } from '../utils/index';
import PERMISSIONS, { ROLES, hasPermission } from '../permissions';

const TIME_REGEX = /^^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$$/;
const today = new Date().toISOString().split('T')[0];

const initialFormData = {
  orderType: 'Preventivo' as 'Correctivo' | 'Preventivo',
  clientId: '',
  selectedEquipmentIds: [] as string[],
  serviceName: 'MTTO PREVENTIVO GENERAL',
  description: '',
  technicianId: '',
  date: today,
  time: '08:00',
  duration: '01:00',
  priority: 'Media' as 'Baja' | 'Media' | 'Alta' | 'Urgente',
  warrantyPeriod: 90,
};

export const useOrderForm = () => {
  const { clients, equipment, users, orders, addItem, updateItem } = useData();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  const [formData, setFormData] = useState(initialFormData);
  const [isServiceNameManuallySet, setIsServiceNameManuallySet] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [notification, setNotification] = useState<{ show: boolean, title: string, message: string, type: 'error' | 'success' }>({ show: false, title: '', message: '', type: 'error' });
  const [initialEvidence, setInitialEvidence] = useState<(string | Blob)[]>([]);

  // Effect to load data from localStorage ONLY IN EDIT MODE
  useEffect(() => {
    if (isEditMode && id) {
      const savedData = localStorage.getItem(`order-form-${id}`);
      if (savedData) {
        setFormData(JSON.parse(savedData));
      } else {
        const orderToEdit = orders.find(o => o.id === id);
        if (orderToEdit) {
            setFormData(prev => ({
                ...prev,
                orderType: orderToEdit.orderType,
                clientId: orderToEdit.clientId || '',
                selectedEquipmentIds: orderToEdit.equipmentIds || [],
                serviceName: orderToEdit.serviceName,
                description: orderToEdit.description,
                technicianId: orderToEdit.technicianId,
                date: orderToEdit.scheduledDate,
                time: orderToEdit.timeSlot,
                priority: orderToEdit.priority,
                warrantyPeriod: orderToEdit.warrantyPeriod || 0,
                duration: (() => {
                  if (orderToEdit.scheduledEndTime && orderToEdit.timeSlot) {
                    const [sh, sm] = orderToEdit.timeSlot.split(':').map(Number);
                    const [eh, em] = orderToEdit.scheduledEndTime.split(':').map(Number);
                    if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
                        const totalMins = (eh * 60 + em) - (sh * 60 + sm);
                        if (totalMins > 0) {
                            return `${Math.floor(totalMins / 60).toString().padStart(2, '0')}:${(totalMins % 60).toString().padStart(2, '0')}`;
                        }
                    }
                  }
                  return '01:00';
                })()
            }));
            setInitialEvidence(orderToEdit.initialPhotos || []);
            setIsServiceNameManuallySet(true);
        }
      }
    }
  }, [id, isEditMode, orders]);

  // Effect to save data to localStorage ONLY IN EDIT MODE
  useEffect(() => {
    if (isEditMode && id) {
      localStorage.setItem(`order-form-${id}`, JSON.stringify(formData));
    }
  }, [formData, id, isEditMode]);

  // FINAL FIX: Effect to handle data passed from navigation (e.g., GlobalCalendar)
  useEffect(() => {
    const stateFromNavigation = location.state as any; // Cast to any to handle flexible properties

    if (stateFromNavigation && !isEditMode) {
      // 1. Smart Merge: Prioritize navigated state over initial data
      const mergedState = { ...initialFormData, ...stateFromNavigation };

      // 2. Flexible Date Parsing: Look for 'date' or 'start' (common in calendar libs)
      const dateCandidate = stateFromNavigation.date || stateFromNavigation.start;

      if (dateCandidate) {
        try {
          const d = new Date(dateCandidate);
          if (!isNaN(d.getTime())) {
            // 3. Correct Translation: Set date (YYYY-MM-DD) and time (HH:mm) from the parsed date
            mergedState.date = d.toISOString().split('T')[0];
            const hours = d.getHours().toString().padStart(2, '0');
            const minutes = d.getMinutes().toString().padStart(2, '0');
            mergedState.time = `${hours}:${minutes}`;
          }
        } catch (e) {
          console.error("Could not parse date from navigation state:", dateCandidate, e);
        }
      }

      // 4. Set the final, correctly translated state
      setFormData(mergedState);
      setIsServiceNameManuallySet(false);
      
      // 5. Clean up history state to prevent issues on refresh
      window.history.replaceState(null, '');
    }
  }, [location.state, isEditMode]);

  // Auto-generate service name
  useEffect(() => {
    if (isServiceNameManuallySet) return;
    const type = formData.orderType.toUpperCase();
    const names = equipment
      .filter(e => formData.selectedEquipmentIds.includes(e.id))
      .map(e => e.name)
      .filter(Boolean);
    const newServiceName = names.length > 0
      ? `MTTO ${type} DE ${names.join(', ')}`.toUpperCase()
      : `MTTO ${type} GENERAL`;

    if (formData.serviceName !== newServiceName) {
      setFormData(prev => ({ ...prev, serviceName: newServiceName }));
    }
  }, [formData.orderType, formData.selectedEquipmentIds, equipment, isServiceNameManuallySet, formData.serviceName]);
  
  const endTime = useMemo(() => {
    if (TIME_REGEX.test(formData.time) && TIME_REGEX.test(formData.duration)) {
      const [sh, sm] = formData.time.split(':').map(Number);
      const [dh, dm] = formData.duration.split(':').map(Number);
      let totalM = (sh * 60 + sm) + (dh * 60 + dm);
      return `${(Math.floor(totalM / 60) % 24).toString().padStart(2, '0')}:${(totalM % 60).toString().padStart(2, '0')}`;
    } else return '--:--';
  }, [formData.time, formData.duration]);

  const warrantyExpiration = useMemo(() => {
    const order = isEditMode ? orders.find(o => o.id === id) : null;
    const baseDate = order?.endTime || formData.date;
    if (baseDate && formData.warrantyPeriod) {
      try {
        const d = new Date(baseDate.split('T')[0] + 'T12:00:00');
        d.setDate(d.getDate() + formData.warrantyPeriod);
        return d.toISOString().split('T')[0];
      } catch (e) { return ''; }
    }
    return '';
  }, [formData.date, formData.warrantyPeriod, id, isEditMode, orders]);

  const selectedClient = useMemo(() => clients.find(c => c.id === formData.clientId), [formData.clientId, clients]);
  const assignableRoles: User['role'][] = useMemo(() => [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.TECHNICIAN], []);

  const nextOrderNumber = useMemo(() => {
    if (id) {
      const existing = orders.find(o => o.id === id);
      if (existing) return existing.orderNumber;
    }
    return (orders.length > 0 ? Math.max(...orders.map(o => o.orderNumber)) : 0) + 1;
  }, [orders, id]);

  const handleServiceNameChange = (newServiceName: string) => {
    setFormData(prev => ({...prev, serviceName: newServiceName.toUpperCase()}));
    setIsServiceNameManuallySet(true);
  };

  const handleAddImage = useCallback(async (files: File[]) => {
    if (!files || files.length === 0) return;
    setLoadingMessage(`Comprimiendo ${files.length} imagen(es)...`);
    const compressedBlobs: Blob[] = [];
    try {
        const blobs = await Promise.all(files.map(compressImage));
        compressedBlobs.push(...blobs);
        setInitialEvidence(prev => [...prev, ...blobs]);
    } catch(err) {
        console.error("Error al comprimir:", err);
        setNotification({ show: true, title: "Error de Compresión", message: "Hubo un error al comprimir las imágenes.", type: 'error' });
        setLoadingMessage('');
        return;
    }
    setLoadingMessage(`Subiendo ${files.length} imagen(es)...`);
    const orderIdForPath = id || 'new_order_temp_id';
    const uploadPromises = compressedBlobs.map((blob, index) => {
      const fileName = `${Date.now()}_${files[index].name}`;
      const storageRef = ref(storage, `orders/${orderIdForPath}/initialPhotos/${fileName}`);
      return uploadBytes(storageRef, blob).then(snapshot => getDownloadURL(snapshot.ref));
    });
    try {
      const urls = await Promise.all(uploadPromises);
      setInitialEvidence(prev => prev.map(item => {
        const index = compressedBlobs.indexOf(item as Blob);
        return index !== -1 ? urls[index] : item;
      }));
    } catch (error) {
      console.error('Error al subir imágenes:', error);
      setNotification({ show: true, title: "Error de Subida", message: "No se pudo subir las imágenes. Se quitarán de la lista.", type: 'error' });
      setInitialEvidence(prev => prev.filter(item => !(item instanceof Blob)));
    } finally {
      setLoadingMessage('');
    }
  }, [id]);

  const removeEvidence = useCallback(async (evidenceToRemove: string | Blob) => {
    if (loadingMessage) return;
    if (!window.confirm("¿Seguro que quieres eliminar esta imagen?")) return;
    setInitialEvidence(prev => prev.filter(item => item !== evidenceToRemove));
    if (typeof evidenceToRemove === 'string' && evidenceToRemove.includes('firebasestorage')) {
      try {
        const imageRef = ref(storage, evidenceToRemove);
        await deleteObject(imageRef);
      } catch (error: any) {
        if (error.code !== 'storage/object-not-found') {
            console.error("Error al eliminar de Storage:", error);
            setNotification({ show: true, title: "Error de Borrado", message: "No se pudo eliminar el archivo del servidor.", type: 'error' });
        }
      }
    }
  }, [loadingMessage]);

  const toggleEquipment = (equipmentId: string) => {
    setFormData(prev => {
      const newSelectedIds = prev.selectedEquipmentIds.includes(equipmentId)
        ? prev.selectedEquipmentIds.filter(item => item !== equipmentId)
        : [...prev.selectedEquipmentIds, equipmentId];
      return { ...prev, selectedEquipmentIds: newSelectedIds };
    });
    setIsServiceNameManuallySet(false);
  };

  const getTechLoad = useCallback((techId: string) => orders.filter(o => o.technicianId === techId && o.status !== OrderStatus.CLOSED).length, [orders]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (initialEvidence.some(e => e instanceof Blob)) {
      setNotification({ show: true, title: "Imágenes Cargando", message: "Por favor espera a que todas las imágenes terminen de subirse.", type: 'error' });
      return;
    }
    if (!formData.description.trim() || !formData.technicianId) {
      setNotification({ show: true, title: "Incompleto", message: "Faltan campos obligatorios (Técnico o Descripción).", type: 'error' });
      return;
    }

    setLoadingMessage(id ? 'Guardando Cambios...' : 'Creando Orden...');
    
    try {
        const currentOrder = id ? orders.find(o => o.id === id) : null;
        const orderData: Omit<ServiceOrder, 'id' | 'createdAt' | 'updatedAt'> = {
            orderNumber: nextOrderNumber,
            equipmentIds: formData.selectedEquipmentIds,
            technicianId: formData.technicianId,
            scheduledDate: formData.date,
            timeSlot: formData.time,
            scheduledEndTime: endTime,
            description: formData.description,
            status: currentOrder ? currentOrder.status : OrderStatus.PENDING,
            initialPhotos: initialEvidence as string[],
            procedures: currentOrder?.procedures || ['Inspección Inicial'],
            orderType: formData.orderType,
            serviceName: formData.serviceName.toUpperCase(),
            priority: formData.priority,
            warrantyPeriod: formData.warrantyPeriod,
            warrantyExpiration: warrantyExpiration,
            clientId: formData.clientId || undefined,
            clientName: selectedClient?.name,
            closingData: currentOrder?.closingData || {},
        };

        if (id) {
            if (!currentUser || !hasPermission(currentUser.role, PERMISSIONS.UPDATE_ORDER)) throw new Error('Permiso denegado.');
            await updateItem('orders', id, { ...orderData, updatedAt: new Date().toISOString() });
            localStorage.removeItem(`order-form-${id}`); // Clean up on successful submission
            alert("Orden actualizada");
            navigate(`/orders/${id}`);
        } else {
            if (!currentUser || !hasPermission(currentUser.role, PERMISSIONS.CREATE_ORDER)) throw new Error('Permiso denegado.');
            const newOrderId = await addItem('orders', orderData as Omit<ServiceOrder, 'id'>);
            alert(`Orden ${nextOrderNumber} creada`);
            navigate(`/orders/${newOrderId}`);
        }
    } catch (error) {
        console.error("Error al guardar:", error);
        setNotification({ show: true, title: "Error", message: (error as Error).message || "No se pudo guardar la orden.", type: 'error' });
    } finally {
        setLoadingMessage('');
    }
  };

  return {
    formData, setFormData, loadingMessage, notification, setNotification,
    isEditMode, id, nextOrderNumber, endTime, warrantyExpiration,
    selectedClient, assignableRoles, users, equipment, clients, orders,
    initialEvidence, handleAddImage, removeEvidence, handleServiceNameChange,
    toggleEquipment, getTechLoad, handleSubmit,
  };
};
