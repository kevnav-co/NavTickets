// src/components/auth/ForcePasswordChange.tsx
//
// Puerta de bloqueo tras un reseteo forzado de contraseña (must_reset_password).
// El usuario ya está autenticado, pero no puede usar la app hasta que cambie su
// clave (la setea un admin o un proceso de desacoplamiento). Se muestra a
// pantalla completa: sin cerrar, sin nav, solo cambiar clave → al salir se
// refresca el perfil y must_reset_password=false desbloquea la app.

import React, { useState } from 'react';
import { Lock, ShieldCheck, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authAccessToken } from '../../services/supabase';

export const ForcePasswordChange: React.FC = () => {
  const { refreshProfile, currentUser } = useAuth();
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!pass || pass.length < 6) return setError('La nueva contraseña debe tener al menos 6 caracteres.');
    if (pass !== confirm) return setError('Las contraseñas no coinciden.');

    setIsSaving(true);
    try {
      const token = await authAccessToken();
      if (!token) throw new Error('Sin sesión activa.');

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-user-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ newPassword: pass }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setDone(true);
      refreshProfile(); // must_reset_password=false → App renderiza lo normal
    } catch (err: any) {
      console.error('Force password change error:', err);
      setError(err.message || 'No se pudo actualizar la contraseña.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-[100dvh] w-full flex items-center justify-center bg-gray-100 p-4 font-sans">
      <div className="w-full max-w-sm bg-white rounded-[2rem] p-8 shadow-2xl">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            {done ? <ShieldCheck size={28} className="text-green-500" /> : <Lock size={28} className="text-primary" />}
          </div>
          <h2 className="text-lg font-black text-gray-900">
            {done ? '¡Contraseña actualizada!' : 'Crea tu nueva contraseña'}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {done
              ? 'Ya puedes continuar.'
              : `Hola, ${currentUser?.name || ''}. Un administrador solicitó que cambies tu clave antes de continuar.`}
          </p>
        </div>

        {done ? null : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Nueva contraseña</label>
              <input
                type="password"
                value={pass}
                onChange={e => setPass(e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Confirmar</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertCircle size={16} className="flex-shrink-0" /> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSaving}
              className="w-full bg-primary text-white py-3.5 rounded-xl font-bold text-sm uppercase tracking-widest shadow-lg active:scale-95 transition-all mt-2 disabled:opacity-50"
            >
              {isSaving ? 'Guardando...' : 'Guardar Contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};