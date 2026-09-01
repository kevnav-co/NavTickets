// src/components/auth/ForgotPassword.tsx
// Paso 1 del flujo "olvidé mi contraseña" (usuario NO autenticado).
// Pide el username → llama al edge `request-password-reset` (público) → si el
// usuario tiene `users.email`, se le manda un link de un solo uso. La respuesta
// es genérica para NO revelar si el username existe (anti-enumeración).

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User as UserIcon, MailCheck, ChevronLeft, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '../../services/supabase';

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const clean = username?.trim();
    if (!clean) {
      setError('Ingresa tu usuario.');
      return;
    }
    setIsLoading(true);
    try {
      const { error: invokeErr } = await supabase.functions.invoke('request-password-reset', {
        body: { username: clean },
      });
      if (invokeErr) throw invokeErr;
      setSent(true);
    } catch (err) {
      console.error('ForgotPassword error:', err);
      setError('Ocurrió un error. Revisa tu conexión e inténtalo de nuevo.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex bg-white overflow-hidden font-sans">
      <div className="hidden lg:flex lg:w-1/2 xl:w-5/12 relative flex-col justify-between p-16 xl:p-20 z-10 overflow-hidden bg-primary">
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1513828583688-c52646db42da?auto=format&fit=crop&q=80"
            alt="Fondo Industrial"
            className="w-full h-full object-cover opacity-40 mix-blend-luminosity"
          />
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
            <div className="mb-8 text-center lg:text-left">
              <h2 className="text-3xl font-bold text-gray-900 tracking-tight mb-3">Recupera tu contraseña</h2>
              <p className="text-gray-500">Ingresa tu usuario y te enviaremos un enlace de reseteo a tu correo de recuperación.</p>
            </div>

            {sent ? (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-6 flex items-start gap-4">
                <div className="bg-green-100 p-3 rounded-xl flex-shrink-0"><MailCheck size={22} className="text-green-600" /></div>
                <div>
                  <p className="font-bold text-green-800 text-sm">Solicitud recibida</p>
                  <p className="text-sm text-green-700 mt-1">
                    Si existe una cuenta con ese usuario, te enviamos un enlace de recuperación a tu correo.
                    Revisa tu bandeja de entrada (y el spam). El enlace expira en 30 minutos.
                  </p>
                  <button onClick={() => { setSent(false); setUsername(''); }} className="mt-4 text-xs font-bold text-green-700 underline">Enviar de nuevo</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-900 uppercase tracking-wide">Usuario</label>
                  <div className="flex items-center border-b-2 border-gray-100 focus-within:border-primary transition-colors">
                    <UserIcon size={20} className="ml-2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Ej: usuario"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-transparent py-3 pl-3 pr-4 text-base text-gray-900 placeholder:text-gray-300 focus:outline-none rounded-none"
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoFocus
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-3 text-red-600 bg-red-50 p-4 rounded-xl text-sm font-medium">
                    <AlertCircle size={18} className="flex-shrink-0" /> {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-primary text-white py-4 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-black transition-colors flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Enviando...</span>
                    </div>
                  ) : (
                    <>
                      <span>Enviar enlace</span>
                      <ArrowRight size={18} />
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

export default ForgotPassword;