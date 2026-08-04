
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCcw, Download, Key, LogOut, PenLine, Bell, BellOff, Users2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useModal } from '../../context/ModalContext.tsx';
import { NotificationsModal } from './NotificationsModal';
import { useConnectivityStatus } from '../../hooks/useConnectivityStatus';
import { useOneSignal } from '../../hooks/useOneSignal';
import PERMISSIONS, { hasPermission } from '../../permissions';

interface HeaderProps {
  title: string;
}

const colorClasses = {
  green: 'bg-green-100 text-green-700',
  blue: 'bg-blue-100 text-blue-700',
  orange: 'bg-orange-100 text-orange-700',
};

export const Header: React.FC<HeaderProps> = React.memo(({ title }) => {
  const { currentUser, logout } = useAuth();
  const { openModal } = useModal();
  const { isRefreshing, forceRefresh, notifications, updateItem, deleteItem, loading } = useData();
  const { text: statusText, color: statusColor } = useConnectivityStatus();
  const navigate = useNavigate();

  // OneSignal push notifications
  const { permission, isSupported, isLoading, enableNotifications } = useOneSignal(
    currentUser,
    async (userId, token) => updateItem('users', userId, { fcmToken: token })
  );

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
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

  return (
    <header className="bg-white/80 backdrop-blur-md px-5 py-4 flex items-center justify-between sticky top-0 z-50 border-b border-gray-100 shadow-sm">
      <div className="flex items-center gap-3">
        <h1 className="text-md font-bold text-gray-800">{title}</h1>
        <button
          onClick={() => forceRefresh()}
          disabled={isRefreshing}
          className={`px-3 py-1.5 rounded-xl flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-wait ${colorClasses[statusColor]}`}
        >
          <RefreshCcw size={13} className={isRefreshing ? "animate-spin" : ""} />
          <div className="flex flex-col items-start leading-none">
              <span className="text-[10px] font-black uppercase">{statusText}</span>
              {timeAgo && <span className="text-[7px] font-bold lowercase opacity-70">{timeAgo}</span>}
          </div>
        </button>
      </div>

      <div className="flex items-center gap-4">
        {/* Notification bell or enable-notifications button */}
        {notifPermission === 'granted' ? (
          <button onClick={handleOpenNotifications} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full relative">
            <Bell size={22} />
            {unreadCount > 0 &&
              <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary border-2 border-white animate-pulse"></div>
            }
          </button>
        ) : notifPermission !== 'unsupported' && notifPermission !== 'denied' ? (
          <button
            onClick={handleEnableNotifications}
            title="Activar notificaciones"
            className="p-2 text-orange-500 hover:bg-orange-50 rounded-full relative transition-colors"
          >
            <BellOff size={22} />
            <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-orange-500 border-2 border-white"></div>
          </button>
        ) : (
          <button onClick={handleOpenNotifications} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full relative">
            <Bell size={22} />
            {unreadCount > 0 &&
              <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary border-2 border-white animate-pulse"></div>
            }
          </button>
        )}
         {currentUser && (
            <div className="relative md:hidden" ref={userMenuRef}>
               <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary text-white font-bold text-sm shadow-md border-2 border-white active:scale-95 transition-transform">{currentUser.name?.charAt(0) || 'U'}</button>
               {showUserMenu && (
                 <div className="absolute right-0 top-full mt-2 w-60 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-top-2 z-50">
                    <div className="p-4 border-b border-gray-50 bg-gray-50/50">
                       <p className="text-sm font-bold text-gray-900 truncate">{currentUser.name}</p>
                       <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{currentUser.role === 'admin' ? 'Administrador' : 'Técnico'}</p>
                    </div>
                    <div className="p-2 space-y-1">
                       <button onClick={() => { /* Lógica para instalar app */ setShowUserMenu(false); }} className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-50 rounded-xl text-left transition-colors text-xs font-bold text-gray-700">
                          <Download size={14} className="text-gray-400" /> Instalar Aplicación
                       </button>
                       <button onClick={() => { openModal('password'); setShowUserMenu(false); }} className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-50 rounded-xl text-left transition-colors text-xs font-bold text-gray-700"><Key size={14} className="text-gray-400" /> Cambiar Contraseña</button>
                       <button onClick={() => { openModal('signature'); setShowUserMenu(false); }} className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-50 rounded-xl text-left transition-colors text-xs font-bold text-gray-700">
                          <PenLine size={14} className="text-gray-400" /> Actualizar Firma
                       </button>
                       {hasPermission(currentUser.role, PERMISSIONS.VIEW_USERS) && (
                          <button onClick={() => { navigate('/users'); setShowUserMenu(false); }} className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-50 rounded-xl text-left transition-colors text-xs font-bold text-gray-700">
                             <Users2 size={14} className="text-gray-400" /> Gestionar Equipo
                          </button>
                       )}
                       <div className="h-px bg-gray-50 mx-2"></div>
                       <button onClick={() => { logout(); setShowUserMenu(false); }} className="w-full flex items-center gap-3 px-3 py-3 hover:bg-red-50 rounded-xl text-left transition-colors text-xs font-bold text-red-600"><LogOut size={14} className="text-red-400" /> Cerrar Sesión</button>
                    </div>
                 </div>
               )}
            </div>
         )}
      </div>
      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onNotificationClick={handleMarkAsRead}
        onDeleteNotification={handleDeleteNotification}
        onClearAll={handleClearAll}
      />
    </header>
  );
});
