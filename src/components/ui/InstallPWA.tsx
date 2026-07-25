
import React, { useState, useEffect } from 'react';
import { PlusSquare, X, Download, Smartphone, MoreVertical, ArrowUpFromLine } from 'lucide-react';

interface Props {
  deferredPrompt?: any;
  onInstall?: () => Promise<void>;
  forceShow?: boolean;
  onDismiss?: () => void;
}

export const InstallPWA: React.FC<Props> = ({ deferredPrompt, onInstall, forceShow, onDismiss }) => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Detectar si ya está instalada (Standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    setIsStandalone(standalone);
    
    // Detectar iOS
    const isIosDevice = /ipad|iphone|ipod/.test(navigator.userAgent.toLowerCase()) && !(window as any).MSStream;
    setIsIOS(isIosDevice);

    if (standalone) return;

    if (forceShow) {
        setShowPrompt(true);
        return;
    }

    // Mostrar banner automáticamente si el navegador lo permite o es iOS
    if (deferredPrompt || isIosDevice) {
        // Reducido el tiempo de espera a 2s para ser más proactivo en el Login
        const timer = setTimeout(() => setShowPrompt(true), 2000);
        return () => clearTimeout(timer);
    }
  }, [deferredPrompt, forceShow, isStandalone]);

    const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      if (onInstall) {
        await onInstall(); // Llama a la función pasada como prop
      }
      setShowPrompt(false);
    }
  };


  if (!showPrompt || isStandalone) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 relative animate-in zoom-in-95 duration-300 border border-gray-100">
          <button 
            onClick={() => { setShowPrompt(false); if(onDismiss) onDismiss(); }} 
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 p-2 bg-gray-100 rounded-full transition-colors hover:bg-gray-200"
          >
            <X size={20} />
          </button>
          
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-[#7b1113] rounded-2xl flex items-center justify-center text-white shadow-lg mb-5 transform rotate-3">
              <Smartphone size={32} />
            </div>

            <h4 className="text-xl font-black text-gray-900 mb-2">Instalar Aplicación</h4>
            
            {isIOS ? (
              <div className="text-sm text-gray-600 leading-relaxed space-y-3 w-full text-left bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <p className="font-bold text-center text-gray-800 mb-2">Pasos para iPhone/iPad:</p>
                  <div className="flex items-center gap-3">
                     <div className="bg-white p-1.5 rounded-lg shadow-sm border border-gray-200">
                        <ArrowUpFromLine size={20} className="text-blue-500" />
                     </div>
                     <span>1. Toca el botón <b>Compartir</b></span>
                  </div>
                  <div className="flex items-center gap-3">
                     <div className="bg-white p-1.5 rounded-lg shadow-sm border border-gray-200">
                        <PlusSquare size={20} className="text-gray-700" />
                     </div>
                     <span>2. Selecciona <b>Agregar al inicio</b></span>
                  </div>
              </div>
            ) : (
                <>
                    <p className="text-sm text-gray-500 mb-6 font-medium px-2">
                      Obtén la mejor experiencia: acceso sin conexión, pantalla completa y notificaciones.
                    </p>
                    {deferredPrompt ? (
                       <button 
                        onClick={handleInstallClick} 
                        className="w-full bg-[#7b1113] text-white py-3.5 rounded-xl text-sm font-bold uppercase tracking-wide flex items-center justify-center gap-2 shadow-lg hover:bg-[#5a0c0e] active:scale-95 transition-all ring-offset-2 focus:ring-2 ring-[#7b1113]"
                       >
                         <Download size={18} /> Instalar Ahora
                       </button>
                   ) : (
                       <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded-xl border border-gray-100 flex items-center justify-center gap-2 w-full">
                          <MoreVertical size={16} />
                          <span>Ve al menú y elige "Instalar aplicación"</span>
                       </div>
                   )}
                </>
            )}
          </div>
        </div>
    </div>
  );
};
