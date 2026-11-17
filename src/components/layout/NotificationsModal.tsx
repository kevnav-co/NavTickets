import React, { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Bell, Inbox, Trash2, LifeBuoy } from 'lucide-react';
import { AppNotification } from '../../types';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onNotificationClick: (notificationId?: string) => void;
  onDeleteNotification: (notificationId: string) => void;
  onClearAll: () => void;
  onOpenSupport?: () => void;
}

// Helper function to safely convert Firestore timestamps
const formatTimestamp = (timestamp: any): string => {
  if (timestamp && typeof timestamp.seconds === 'number') {
    return new Date(timestamp.seconds * 1000).toLocaleString();
  } else {
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date.toLocaleString();
    }
  }
  return "Fecha inválida";
};

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onNotificationClick,
  onDeleteNotification,
  onClearAll,
  onOpenSupport,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const handleItemClick = (notification: AppNotification) => {
    if (notification.path) {
      navigate(notification.path);
    }
    onNotificationClick(notification.id);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[9999] flex justify-center items-start animate-in fade-in">
      <div ref={modalRef} className="relative bg-raised rounded-2xl shadow-2xl w-full max-w-md mt-16 border border-line/80 flex flex-col" style={{ maxHeight: '80vh', height: '700px' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-line-soft">
          <div className="flex items-center gap-3">
            <Bell size={20} className="text-primary" />
            <h2 className="text-lg font-bold text-ink">Notificaciones</h2>
          </div>
          <button onClick={onClose} className="p-2 text-ink-faint hover:bg-sunken rounded-full">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {notifications.length > 0 ? (
            notifications.map(notif => (
              <div
                key={notif.id}
                className={`w-full text-left p-3 rounded-lg flex items-start justify-between gap-3 transition-colors ${!notif.read ? 'bg-red-50/50' : 'hover:bg-sunken'}`}
              >
                <div
                  className="flex-grow flex items-start gap-3 cursor-pointer"
                  onClick={() => handleItemClick(notif)}
                >
                  {!notif.read && <div className="w-2.5 h-2.5 rounded-full bg-primary mt-1.5 flex-shrink-0"></div>}
                  <div className={notif.read ? 'pl-5' : ''}>
                    <p className="text-sm text-ink-soft break-words">{notif.body}</p>
                    <span className="text-xs text-ink-faint font-medium">{formatTimestamp(notif.timestamp)}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteNotification(notif.id);
                  }}
                  className="p-1 text-ink-faint hover:text-red-600 rounded-full flex-shrink-0"
                  aria-label="Eliminar notificación"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          ) : (
            <div className="text-center py-20 flex flex-col items-center justify-center text-ink-faint">
              <Inbox size={40} className="mb-3" />
              <h3 className="text-lg font-bold text-ink-soft">Bandeja vacía</h3>
              <p className="text-sm">No tienes notificaciones nuevas.</p>
              {onOpenSupport && (
                <button
                  onClick={() => { onOpenSupport(); onClose(); }}
                  className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-primary/30 text-sm font-bold text-primary hover:bg-red-50/50 transition-colors"
                >
                  <LifeBuoy size={16} /> Enviar consulta a soporte
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="p-3 border-t border-line-soft space-y-2">
            {onOpenSupport && (
              <button
                onClick={() => { onOpenSupport(); onClose(); }}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-dashed border-primary/30 text-sm font-bold text-primary hover:bg-red-50/50 transition-colors"
              >
                <LifeBuoy size={15} /> Enviar consulta a soporte
              </button>
            )}
            <div className="flex justify-center items-center gap-6">
              {notifications.some(n => !n.read) && (
                <button onClick={() => onNotificationClick()} className="text-sm font-bold text-ink-soft hover:text-black">
                  Marcar todas como leídas
                </button>
              )}
              <button onClick={onClearAll} className="text-sm font-bold text-red-500 hover:text-red-700">
                Limpiar bandeja
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
