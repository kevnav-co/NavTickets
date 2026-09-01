// src/components/auth/ResetPassword.tsx
// Paso 2 del flujo "olvidé mi contraseña": el usuario llega desde el correo con
// un token tipo .../#/reset-password?token=<hash>. Pide la nueva contraseña y la
// aplica vía el edge `reset-password-with-token` (público, token de un solo uso).

import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle2, XCircle, ChevronLeft, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '../../services/supabase';

const ResetPassword: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const token = new URLSearchParams(location.search).get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [expired, setExpired] = useState(false);

  if (!token) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 p-6 font-sans">
        <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-5"><XCircle size={32} /></div>
          <h3 className="text-lg font-bold text-gray-900">Enlace inválido</h3>
          <p className="text-sm text-gray-500 mt-2">Falta el token de recuperación en la URL.</p>
          <button onClick={() => navigate('/')} className="mt-6 w-full py-3 bg-primary text-white rounded-xl font-bold text-sm">Ir al inicio de sesión</button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setIsLoading(true);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('reset-password-with-token', {
        body: { token, newPassword: password },
      });
      if (invokeErr) throw invokeErr;
      if (!data?.ok) {
        // El edge devuelve { ok:true } en éxito; si no, el error viaja en invokeErr.
        setError('No se pudo restablecer la contraseña.');
        setIsLoading(false);
        return;
      }
      setDone(true);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (/expirad/i.test(msg)) {
        setExpired(true);
      } else if (/inválido|utilizado/i.test(msg)) {
        setError('El enlace es inválido o ya fue utilizado.');
      } else {
        setError('Ocurrió un error. Inténtalo de nuevo.');
      }
      console.error('ResetPassword error:', msg);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex bg-white overflow-hidden font-sans">
      <div className="hidden lg:flex lg:w-1/2 xl:w-5/12 relative flex-col justify-between p-16 xl:p-20 z-10 overflow-hidden bg-primary">
        <div className="absolute inset-0 z-0">
          <img src="https://images.unsplash.com/photo-1513828583688-c52646db42da?auto=format&fit=crop&q=80" alt="Fondo Industrial" className="w-full h-full object-cover opacity-40 mix-blend-luminosity" />
          <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/90 to-primary/40 mix-blend-multiply"></div>
        </div>
        <div className="relative z-10">
          <img src="/assets/logo-blanco.png?v=fondoblanco4" alt="Logo de la empresa" className="w-full h-auto object-contain" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-white relative">
        <div className="min-h-full flex flex-col justify-center px-8 py-10 sm:px-12 md:px-20 lg:px-24 xl:px-32 w-full max-w-3xl mx-auto">
          <button onClick={() => navigate('/')} className="mb-10 inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-gray-800 transition-colors">
            <ChevronLeft size={18} /> Volver al inicio de sesión
          </button>

          <div className="w-full">
            {expired ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
                <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4"><XCircle size={28} /></div>
                <h3 className="text-lg font-bold text-gray-900">El enlace ha expirado</h3>
                <p className="text-sm text-gray-600 mt-2">El enlace es de un solo uso y caduca a los 30 minutos. Solicita uno nuevo.</p>
                <button onClick={() => navigate('/forgot-password')} className="mt-6 w-full py-3 bg-primary text-white rounded-xl font-bold text-sm">Solicitar otro enlace</button>
              </div>
            ) : done ? (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
                <div className="w-14 h-14 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4"><CheckCircle2 size={28} /></div>
                <h3 className="text-lg font-bold text-gray-900">Contraseña actualizada</h3>
                <p className="text-sm text-gray-600 mt-2">Ya puedes iniciar sesión con tu nueva contraseña.</p>
                <button onClick={() => navigate('/')} className="mt-6 w-full py-3 bg-primary text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2"><ShieldCheck size={16} /> Ir al inicio de sesión</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="mb-8 text-center lg:text-left">
                  <h2 className="text-3xl font-bold text-gray-900 tracking-tight mb-3">Nueva contraseña</h2>
                  <p className="text-gray-500">Elige una contraseña nueva para tu cuenta.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-900 uppercase tracking-wide">Nueva contraseña</label>
                  <div className="flex items-center border-b-2 border-gray-100 focus-within:border-primary transition-colors">
                    <Lock size={20} className="ml-2 text-gray-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-transparent py-3 pl-3 text-base text-gray-900 placeholder:text-gray-300 focus:outline-none rounded-none"
                      autoFocus
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-gray-400 hover:text-gray-600 transition-colors p-2">
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-900 uppercase tracking-wide">Confirmar contraseña</label>
                  <div className="flex items-center border-b-2 border-gray-100 focus-within:border-primary transition-colors">
                    <Lock size={20} className="ml-2 text-gray-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="w-full bg-transparent py-3 pl-3 text-base text-gray-900 placeholder:text-gray-300 focus:outline-none rounded-none"
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-3 text-red-600 bg-red-50 p-4 rounded-xl text-sm font-medium">
                    <XCircle size={18} className="flex-shrink-0" /> {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-primary text-white py-4 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-black transition-colors flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <span>Guardar contraseña</span>
                      <ShieldCheck size={18} />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;