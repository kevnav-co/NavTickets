
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCcw, Download, Key, LogOut, PenLine, Bell, BellOff, LifeBuoy, Eye } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';
import { useData } from '../../context/DataContext';
import { useModal } from '../../context/ModalContext.tsx';
import { NotificationsModal } from './NotificationsModal';
import SupportModal from '../support/SupportModal';
import { useConnectivityStatus } from '../../hooks/useConnectivityStatus';
import { useWebPush } from '../../hooks/useWebPush';

interface HeaderProps {
  title: string;
}

const colorClasses = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  orange: 'bg-orange-50 text-orange-700 border-orange-100',
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  developer: 'Desarrollador',
  admin: 'Administrador',
  supervisor: 'Supervisor',
  aux_admin: 'Auxiliar Admin',
  technician: 'Técnico',
};

export const Header: React.FC<HeaderProps> = React.memo(({ title }) => {
  const { currentUser, impersonation, stopImpersonation, logout } = useAuth();
  const { company } = useCompany();
  const { openModal } = useModal();
  const { isRefreshing, forceRefresh, notifications, updateItem, deleteItem, loading, loadNotifications } = useData();
  const { text: statusText, color: statusColor } = useConnectivityStatus();
  const navigate = useNavigate();

  // El banner de vista previa vive dentro del Header para que quede ARRIBA de la
  // barra (mismo bloque sticky) y jamás la tape. Al salir, volvemos al Panel Admin.
  const handleExitPreview = async () => {
    await stopImpersonation();
    navigate('/admin', { replace: true });
  };

  // Cargar notificaciones del usuario al montar (Header está siempre presente
  // cuando hay sesión). loadNotifications es idempotente: solo dispara la carga
  // la primera vez, cuando isNotificationsLoaded aún es false.
  useEffect(() => {
    if (currentUser) loadNotifications();
  }, [currentUser, loadNotifications]);

  // Web Push notifications (VAPID)
  const { permission, isSupported, isLoading, initError, actionError, enableNotifications } = useWebPush(
    currentUser,
    async (userId, token) => updateItem('users', userId, { onesignalPlayerId: token })
  );

  // Aviso de diagnóstico visible cuando el push no inicia o el permiso falla
  // (antes toda falla se perdía en console y el botón parecía no hacer nada).
  const [dismissNotifError, setDismissNotifError] = useState(false);
  const notifError = dismissNotifError ? null : (actionError || initError);

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [timeAgo, setTimeAgo] = useState('Hace un momento');
  const userMenuRef = useRef<HTMLDivElement>(null);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);
  const notifPermission = permission;

  // --- Handler: Request notification permission on user gesture (iOS requirement) ---
  const handleEnableNotifications = useCallback(async () => {
    if (!currentUser || !isSupported || isLoading) return;
    await enableNotifications();
  }, [currentUser, isSupported, isLoading, enableNotifications]);

  useEffect(() => {
    const storedLastFetch = localStorage.getItem('navas_last_fetch');
    setLastUpdated(storedLastFetch ? Number(storedLastFetch) : null);
  }, []);

  useEffect(() => {
    if (!isRefreshing) {
      const now = Date.now();
      setLastUpdated(now);
      localStorage.setItem('navas_last_fetch', now.toString());
    }
  }, [isRefreshing]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const updateTime = () => {
      if (!lastUpdated) return setTimeAgo('');
      const minutes = Math.floor((Date.now() - lastUpdated) / 60000);

      if (minutes < 1) setTimeAgo('Hace un momento');
      else if (minutes === 1) setTimeAgo('Hace 1 min');
      else if (minutes < 60) setTimeAgo(`Hace ${minutes} min`);
      else setTimeAgo(`Hace ${Math.floor(minutes / 60)} h`);
    };

    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const handleMarkAsRead = async (notificationId?: string) => {
    if (loading) return;
    const notificationsToUpdate = notificationId
      ? [notifications.find(n => n.id === notificationId)]
      : notifications.filter(n => !n.read);

    const promises = notificationsToUpdate
      .filter(n => n && !n.read)
      .map(n => updateItem('notifications', n!.id, { read: true }));

    await Promise.all(promises);
  };

  const handleDeleteNotification = async (notificationId: string) => {
    if (loading || !notificationId) return;
    await deleteItem('notifications', notificationId);
  };

  const handleClearAll = async () => {
    if (loading || notifications.length === 0) return;
    const promises = notifications.map(n => deleteItem('notifications', n.id));
    await Promise.all(promises);
    setIsNotificationsOpen(false);
  };

  const handleOpenNotifications = () => {
    setIsNotificationsOpen(true);
    if (unreadCount > 0) {
      setTimeout(() => handleMarkAsRead(), 2000);
    }
  }

  // El super_admin gestiona el soporte en su panel (/admin/support), NO en el
  // modal de empresa. Los demás abren el modal para crear sus consultas.
  const handleOpenSupport = useCallback(() => {
    setIsNotificationsOpen(false);
    if (currentUser?.role === 'super_admin') {
      navigate('/admin/support');
    } else {
      setIsSupportOpen(true);
    }
  }, [currentUser?.role, navigate]);

  return (
    <header className="bg-raised flex flex-col sticky top-0 z-50 border-b border-line-soft">
      {/* SIN `backdrop-blur-md`: `backdrop-filter` crea un containing block que rompe
          el `position:fixed` de SupportModal/NotificationsModal (quedan recortados a
          la caja del header). Fondo blanco sólido. */}
      {impersonation && (
        <div className="w-full bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-center gap-3 text-xs font-bold shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
          <Eye size={14} className="flex-shrink-0" />
          <span className="truncate text-center">
            Vista previa: estás viendo <span className="underline">{company?.name || company.id || 'la empresa'}</span> como admin
          </span>
          <button
            onClick={handleExitPreview}
            className="flex-shrink-0 bg-amber-950 text-white px-3 py-1 rounded-md hover:bg-amber-900 transition-colors"
          >
            Salir de la vista
          </button>
        </div>
      )}
      <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-base font-bold text-ink truncate">{title}</h1>
        <button
          onClick={() => forceRefresh()}
          disabled={isRefreshing}
          title="Actualizar datos"
          className={`shrink-0 pl-2 pr-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-wait ${colorClasses[statusColor]}`}
        >
          <RefreshCcw size={12} className={isRefreshing ? "animate-spin" : ""} />
          <div className="flex flex-col items-start leading-none gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-wider">{statusText}</span>
              {timeAgo && <span className="text-[8px] font-medium lowercase opacity-60">{timeAgo}</span>}
          </div>
        </button>
      </div>

      <div className="flex items-center gap-1 md:gap-1.5">
        {/* Soporte interno (consulta al super_admin) */}
        <button
          onClick={handleOpenSupport}
          title={currentUser?.role === 'super_admin' ? 'Gestionar soporte' : 'Soporte de la app'}
          className="p-2 text-ink-faint hover:bg-sunken hover:text-primary rounded-lg transition-colors"
        >
          <LifeBuoy size={19} />
        </button>
        {/* Notification bell or enable-notifications button */}
        {notifPermission === 'granted' ? (
          <button onClick={handleOpenNotifications} title="Notificaciones" className="p-2 text-ink-faint hover:bg-sunken hover:text-ink rounded-lg relative transition-colors">
            <Bell size={19} />
            {unreadCount > 0 &&
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            }
          </button>
        ) : notifPermission !== 'unsupported' && notifPermission !== 'denied' ? (
          <button
            onClick={handleEnableNotifications}
            title="Activar notificaciones"
            className="p-2 text-orange-500 hover:bg-orange-50 rounded-lg relative transition-colors"
          >
            <BellOff size={19} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-orange-500 ring-2 ring-white"></span>
          </button>
        ) : (
          <button onClick={handleOpenNotifications} title="Notificaciones" className="p-2 text-ink-faint hover:bg-sunken hover:text-ink rounded-lg relative transition-colors">
            <Bell size={19} />
            {unreadCount > 0 &&
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            }
          </button>
        )}
         {currentUser && (
            <div className="relative md:hidden ml-1" ref={userMenuRef}>
               <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-white font-semibold text-xs active:scale-95 transition-transform">{currentUser.name?.charAt(0) || 'U'}</button>
               {showUserMenu && (
                 <div className="absolute right-0 top-full mt-2 w-56 bg-raised rounded-xl shadow-lg border border-line overflow-hidden animate-fade-in-up z-50">
                    <div className="px-4 py-3 border-b border-line-soft bg-sunken">
                       <p className="text-sm font-semibold text-ink truncate">{currentUser.name}</p>
                       <p className="text-[10px] text-ink-faint font-medium uppercase tracking-wider mt-0.5">{ROLE_LABELS[currentUser.role] || currentUser.role}</p>
                    </div>
                    <div className="p-1.5">
                       <button onClick={() => { /* Lógica para instalar app */ setShowUserMenu(false); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-sunken rounded-lg text-left transition-colors text-xs font-medium text-ink-soft">
                          <Download size={15} className="text-ink-faint" /> Instalar Aplicación
                       </button>
                       <button onClick={() => { openModal('password'); setShowUserMenu(false); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-sunken rounded-lg text-left transition-colors text-xs font-medium text-ink-soft"><Key size={15} className="text-ink-faint" /> Cambiar Contraseña</button>
                       <button onClick={() => { openModal('signature'); setShowUserMenu(false); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-sunken rounded-lg text-left transition-colors text-xs font-medium text-ink-soft">
                          <PenLine size={15} className="text-ink-faint" /> Actualizar Firma
                       </button>
                       <div className="h-px bg-line-soft my-1 mx-2"></div>
                       <button onClick={() => { logout(); setShowUserMenu(false); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-red-50 rounded-lg text-left transition-colors text-xs font-medium text-red-600"><LogOut size={15} className="text-red-400" /> Cerrar Sesión</button>
                    </div>
                 </div>
               )}
            </div>
         )}
      </div>
      </div>
      {notifError && (
        <div className="flex items-start gap-3 px-4 py-2 bg-orange-50 border-t border-orange-200 text-orange-800 text-xs">
          <div className="flex-1">
            <p className="font-bold uppercase tracking-wide text-[10px] mb-0.5">Notificaciones push</p>
            <p>{notifError}</p>
          </div>
          <button
            onClick={() => setDismissNotifError(true)}
            className="shrink-0 text-orange-500 hover:text-orange-700 font-bold"
          >
            Cerrar
          </button>
        </div>
      )}
      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onNotificationClick={handleMarkAsRead}
        onDeleteNotification={handleDeleteNotification}
        onClearAll={handleClearAll}
        onOpenSupport={handleOpenSupport}
      />
      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
    </header>
  );
});
