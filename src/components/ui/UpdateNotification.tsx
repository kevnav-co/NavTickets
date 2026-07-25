import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download } from 'lucide-react';

function UpdateNotification() {
  const {
    offlineReady: [, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r);
    },
    onRegisterError(error) {
      console.log('SW registration error:', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (needRefresh) {
    return (
      <div className="fixed bottom-4 right-4 z-[200] bg-white rounded-lg shadow-2xl p-4 w-80 animate-fade-in-up">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
            <Download className="text-red-600" size={20} />
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-gray-800">Actualización Disponible</h4>
            <p className="text-sm text-gray-600 mt-1">
              Hay una nueva versión de la aplicación lista para ser instalada.
            </p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => updateServiceWorker(true)}
            className="flex-1 h-10 bg-primary text-white rounded-lg font-bold text-sm"
          >
            Actualizar Ahora
          </button>
          <button
            onClick={close}
            className="flex-1 h-10 bg-gray-100 text-gray-700 rounded-lg font-bold text-sm"
          >
            Más Tarde
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default UpdateNotification;
