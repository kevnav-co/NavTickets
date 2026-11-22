// Pantalla para los usuarios de una empresa suspendida (migración 054). La base
// ya les niega los datos (current_company_id() es NULL); aquí solo se explica
// por qué y se ofrece salir.
import React from 'react';
import { Lock, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const CompanySuspended: React.FC = () => {
  const { logout, currentUser } = useAuth();
  return (
    <div className="h-[100dvh] w-full flex items-center justify-center bg-sunken p-4 font-sans">
      <div className="w-full max-w-sm bg-raised rounded-[2rem] p-8 shadow-2xl text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-4 mx-auto">
          <Lock size={28} className="text-amber-600" aria-hidden />
        </div>
        <h2 className="text-lg font-black text-ink">Empresa suspendida</h2>
        <p className="text-sm text-ink-soft mt-2">
          El acceso de tu empresa a NavTickets está suspendido. Tus datos se conservan.
          Para reactivarlo, comunícate con el administrador de la plataforma.
        </p>
        {currentUser?.username && (
          <p className="text-xs text-ink-faint mt-4">Sesión: {currentUser.username}</p>
        )}
        <button
          type="button"
          onClick={() => logout()}
          className="mt-6 w-full h-11 rounded-xl bg-ink text-white text-sm font-bold inline-flex items-center justify-center gap-2"
        >
          <LogOut size={16} aria-hidden /> Cerrar sesión
        </button>
      </div>
    </div>
  );
};
