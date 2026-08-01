
import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ChangePasswordModal } from './components/layout/ChangePasswordModal';
import SignatureModal from './components/ui/SignatureModal';
import { TransferModal } from './components/Account/TransferModal'; 
import { ExpenseModal } from './components/Account/ExpenseModal';
import { AnnulmentConfirmModal } from './components/Account/AnnulmentConfirmModal';
import { DesktopSidebar } from './components/layout/DesktopSidebar';
import { Header } from './components/layout/Header';
import { MobileNavigation } from './components/layout/MobileNavigation';
import { InstallPWA } from './components/ui/InstallPWA';
import UpdateNotification from './components/ui/UpdateNotification';
import Login from './components/auth/Login';
import { useOfflineStatus } from './hooks/useOfflineStatus';
import { useBackgroundSync } from './hooks/useBackgroundSync';
import { RefreshCw, Save } from 'lucide-react';
import { LoadingFallback } from './components/ui/LoadingFallback';
import { useAuth } from './context/AuthContext';
import { useData } from './context/DataContext';
import { useModal } from './context/ModalContext';
import { usePushNotifications } from './hooks/usePushNotifications';
import { CompanyProvider, useCompany } from './context/CompanyContext';
import { applyCompanyTheme } from './utils/theme';
import CustomPageRenderer from './components/custom/CustomPageRenderer';
import PERMISSIONS, { hasPermission } from './permissions';

// --- LAZY LOADED COMPONENTS ---
const Dashboard = React.lazy(() => import('./components/dashboard/Dashboard'));
const Tasks = React.lazy(() => import('./components/task/Tasks')); 
const Accounting = React.lazy(() => import('./components/Account/Accounting'));
const OrderList = React.lazy(() => import('./components/order/OrderList'));
const ClientManager = React.lazy(() => import('./components/client/ClientManager'));
const ClientDetail = React.lazy(() => import('./components/client/ClientDetail'));
const EquipmentManager = React.lazy(() => import('./components/equipment/EquipmentManager'));
const EquipmentDetail = React.lazy(() => import('./components/equipment/EquipmentDetail'));
const UserManager = React.lazy(() => import('./components/user/UserManager'));
const UserDetail = React.lazy(() => import('./components/user/UserDetail'));
const UserForm = React.lazy(() => import('./components/user/UserForm'));
const OrderWorkflow = React.lazy(() => import('./components/order/OrderWorkflow'));
const NewOrder = React.lazy(() => import('./components/order/NewOrder'));
const ClientForm = React.lazy(() => import('./components/client/ClientForm'));
const EquipmentForm = React.lazy(() => import('./components/equipment/EquipmentForm'));
const ClientMap = React.lazy(() => import('./components/map/ClientMap'));
const AdminPanel = React.lazy(() => import('./components/admin/AdminPanel'));

// --- CONSTANTS AND INTERFACES ---
const GPS_UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutes

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>;
  prompt(): Promise<void>;
}

// --- HELPER COMPONENT ---
const RouteWithLayout: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <><Header title={title} />{children}</>
);

function App() {
  // CONTEXT HOOKS
  const { currentUser, loading: authLoading } = useAuth();
  const { loading: dataLoading, users, updateItem } = useData();
  const { isModalOpen, closeModal } = useModal();
  
  // LOCAL UI STATE
  const { isInternetAvailable, isSyncing } = useOfflineStatus();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installBannerOpen, setInstallBannerOpen] = useState(false);

  // Background Sync
  useBackgroundSync();

  // --- PUSH NOTIFICATIONS (aislado en hook) ---
  // Implementación actual: FCM. Fase 5 migrará a OneSignal.
  const { refreshToken, startForegroundListener } = usePushNotifications();

  // --- GLOBAL EFFECTS ---
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setInstallBannerOpen(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // --- Push notifications: refresco silencioso del token FCM ---
  useEffect(() => {
    // Solo refrescar si ya tiene permiso concedido
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      refreshToken();
    }
    // Nota: La solicitud de permiso se maneja en Header.tsx (gesto del usuario)
  }, [refreshToken]);

  // --- Push notifications: mensajes en foreground ---
  useEffect(() => {
    const cleanup = startForegroundListener();
    return () => cleanup?.();
  }, [startForegroundListener]);

  useEffect(() => {
    if (!currentUser || !navigator.geolocation) return;

    const trackLocation = () => {
        try {
          navigator.geolocation.getCurrentPosition(
              async (position) => {
                  const { latitude, longitude } = position.coords;
                  const locationUpdatedAt = new Date().toISOString();
                  if (isInternetAvailable) {
                      try {
                          await updateItem('users', currentUser.id, { latitude, longitude, locationUpdatedAt });
                      } catch (e) { console.warn("GPS Sync Error:", e); }
                  }
              },
              () => { },
              { enableHighAccuracy: true }
          );
        } catch (error) {}
    };
    
    trackLocation();
    const intervalId = setInterval(trackLocation, GPS_UPDATE_INTERVAL);
    
    return () => clearInterval(intervalId);
  }, [currentUser, isInternetAvailable, updateItem]);
  
  const handleSaveSignature = useCallback(async (signatureDataUrl: string) => {
    if (currentUser) {
      try {
        await updateItem('users', currentUser.id, { signature: signatureDataUrl });
        closeModal();
      } catch (error) {
        console.error("Error al guardar la firma:", error);
      }
    }
  }, [currentUser, updateItem, closeModal]);
  
  if (authLoading || dataLoading) return <LoadingFallback />;

  return (
    <HashRouter>
      <CompanyProvider>
        <AppContent
          isInternetAvailable={isInternetAvailable}
          isSyncing={isSyncing}
          deferredPrompt={deferredPrompt}
          installBannerOpen={installBannerOpen}
          setInstallBannerOpen={setInstallBannerOpen}
          currentUser={currentUser}
          handleSaveSignature={handleSaveSignature}
          closeModal={closeModal}
          isModalOpen={isModalOpen}
          users={users}
        />
      </CompanyProvider>
    </HashRouter>
  );
};

// --- EXTRAÍDO a componente interno para tener acceso a useCompany ---
function AppContent({
  isInternetAvailable,
  isSyncing,
  deferredPrompt,
  installBannerOpen,
  setInstallBannerOpen,
  currentUser,
  handleSaveSignature,
  closeModal,
  isModalOpen,
  users,
}: {
  isInternetAvailable: boolean;
  isSyncing: boolean;
  deferredPrompt: BeforeInstallPromptEvent | null;
  installBannerOpen: boolean;
  setInstallBannerOpen: (v: boolean) => void;
  currentUser: any;
  handleSaveSignature: (sig: string) => Promise<void>;
  closeModal: () => void;
  isModalOpen: (key: string) => boolean;
  users: any[];
}) {
  const { company, loading: companyLoading } = useCompany();

  // Apply company theme when it changes
  useEffect(() => {
    if (!company || !company.theme) return;
    applyCompanyTheme(company);
  }, [company]);

  // Send company name to service worker for dynamic push notification title
  useEffect(() => {
    if (!company?.name || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(reg => {
      reg.active?.postMessage({ type: 'SET_COMPANY_NAME', name: company.name });
    }).catch(() => {});
  }, [company?.name]);

  if (companyLoading) return <LoadingFallback />;

  return (
    <div className="h-[100dvh] bg-gray-50 flex flex-col md:flex-row">

      {!isInternetAvailable && <div className="fixed top-0 left-0 right-0 bg-gray-900 text-white z-[100] px-4 py-2 flex items-center justify-center gap-2 text-xs font-bold"><Save size={14} className="text-orange-400" /><span>Modo En Cache (Offline)</span></div>}
      {isInternetAvailable && isSyncing && <div className="fixed top-0 left-0 right-0 bg-blue-600 text-white z-[100] px-4 py-2 flex items-center justify-center gap-2 text-xs font-bold"><RefreshCw size={14} className="animate-spin" /><span>Sincronizando con la Nube...</span></div>}
      <InstallPWA deferredPrompt={deferredPrompt} forceShow={installBannerOpen} onDismiss={() => setInstallBannerOpen(false)} />
      <UpdateNotification />

      {!currentUser ? (
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      ) : (
        <>
          <DesktopSidebar />

          {/* --- MODALS --- */}
          <ChangePasswordModal
              isOpen={isModalOpen('password')}
              onClose={closeModal}
          />
          <SignatureModal
            isOpen={isModalOpen('signature')}
            onClose={closeModal}
            onSave={handleSaveSignature}
            title="Actualizar Firma"
          />
          <TransferModal />
          <ExpenseModal />
          <AnnulmentConfirmModal />

          <div className={`flex-1 flex flex-col min-w-0 transition-all ${!isInternetAvailable || isSyncing ? 'pt-8' : ''} overflow-y-auto`}>
            <main className="flex-1 md:pb-0">
              <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  {/* --- ROUTES --- */}
                  <Route path="/" element={<RouteWithLayout title="Inicio"><Dashboard /></RouteWithLayout>} />
                  <Route path="/tasks" element={<RouteWithLayout title="Tareas"><Tasks /></RouteWithLayout>} />
                  {currentUser && currentUser.role === 'developer' && (
                      <Route path="/accounting" element={<RouteWithLayout title="Contable"><Accounting /></RouteWithLayout>} />
                  )}
                  {currentUser && currentUser.role === 'super_admin' && (
                      <Route path="/admin" element={<RouteWithLayout title="Panel Admin"><AdminPanel /></RouteWithLayout>} />
                  )}
                  <Route path="/orders" element={<RouteWithLayout title="Órdenes"><OrderList /></RouteWithLayout>} />
                  <Route path="/orders/new" element={<RouteWithLayout title="Nueva Orden"><NewOrder /></RouteWithLayout>} />
                  <Route path="/orders/:id" element={<RouteWithLayout title="Detalle de Orden"><OrderWorkflow /></RouteWithLayout>} />

                  <Route path="/clients" element={<RouteWithLayout title="Clientes"><ClientManager /></RouteWithLayout>} />
                  <Route path="/clients/new" element={<RouteWithLayout title="Nuevo Cliente"><ClientForm /></RouteWithLayout>} />
                  <Route path="/clients/:id" element={<RouteWithLayout title="Detalle de Cliente"><ClientDetail /></RouteWithLayout>} />
                  <Route path="/clients/:id/edit" element={<RouteWithLayout title="Editar Cliente"><ClientForm /></RouteWithLayout>} />

                  <Route path="/equipment" element={<RouteWithLayout title="Máquinas"><EquipmentManager /></RouteWithLayout>} />
                  <Route path="/equipment/new" element={<RouteWithLayout title="Nueva Máquina"><EquipmentForm /></RouteWithLayout>} />
                  <Route path="/equipment/:id" element={<RouteWithLayout title="Detalle de Máquina"><EquipmentDetail /></RouteWithLayout>} />
                  <Route path="/equipment/:id/edit" element={<RouteWithLayout title="Editar Máquina"><EquipmentForm /></RouteWithLayout>} />

                  {currentUser && hasPermission(currentUser.role, PERMISSIONS.VIEW_USERS) && (
                      <>
                          <Route path="/users" element={<RouteWithLayout title="Equipo"><UserManager /></RouteWithLayout>} />
                          <Route path="/users/new" element={<RouteWithLayout title="Nuevo Usuario"><UserForm users={users} /></RouteWithLayout>} />
                          <Route path="/users/:id" element={<RouteWithLayout title="Detalle de Usuario"><UserDetail /></RouteWithLayout>} />
                          <Route path="/users/:id/edit" element={<RouteWithLayout title="Editar Usuario"><UserForm users={users} /></RouteWithLayout>} />
                      </>
                  )}

                  <Route path="/map" element={<RouteWithLayout title="Mapa"><ClientMap /></RouteWithLayout>} />

                  {/* --- DYNAMIC COMPANY TABS --- */}
                  {company.tabs?.filter(t => t.enabled && t.type !== 'built-in').map(tab => (
                    <Route
                      key={tab.id}
                      path={tab.route.replace(/^\//, '')}
                      element={<RouteWithLayout title={tab.label}><CustomPageRenderer tab={tab} /></RouteWithLayout>}
                    />
                  ))}

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </main>
          </div>
          <MobileNavigation />
        </>
      )}
    </div>
  );
}

export default App;
