
import React, { useState } from 'react';
import { User as UserIcon, Lock, AlertCircle, Smartphone, ArrowRight, Zap, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';

const NavasLogo = ({ variant = 'default', size = "large", center = false }: { variant?: 'default' | 'white', size?: "small" | "large" | "xl", center?: boolean }) => {
  const isXl = size === "xl";
  const isLarge = size === "large";
  const heightClass = isXl ? 'h-40' : isLarge ? 'h-28' : 'h-12';

  return (
    <div className={`flex flex-col ${center ? 'items-center' : 'items-start'} gap-2`}>
      <img
        src="/assets/logo-inicio-movil.jpg?v=1"
        alt="Logo de la empresa"
        className={`${heightClass} w-auto object-contain transition-all duration-300 ${variant === 'white' ? 'brightness-0 invert drop-shadow-md' : ''}`}
      />
    </div>
  );
};

const Login: React.FC = () => {
  const { login } = useAuth();
  const { company } = useCompany();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const cleanUser = username?.trim();
    const cleanPass = password?.trim();
    
    if (!cleanUser || !cleanPass) {
      setError('Ingresa tu usuario y contraseña');
      return;
    }

    setIsLoading(true);
    
    try {
      const success = await login(cleanUser, cleanPass);
      if (success) {
        navigate('/dashboard');
      } else {
        setError('Usuario o contraseña incorrectos.');
        setIsLoading(false);
      }
    } catch (err) {
        setError('Ocurrió un error al intentar iniciar sesión. Por favor, revisa tu conexión a internet.');
        setIsLoading(false);
        console.error("Login error:", err);
    }
  };

  return (
    <div className="h-[100dvh] w-full flex bg-white overflow-hidden font-sans">
      <div className="hidden lg:flex lg:w-1/2 xl:w-5/12 relative flex-col justify-between p-16 xl:p-20 z-10 overflow-hidden bg-primary">
        {/* Fondo decorativo en CSS puro: sin descarga externa, no se rompe sin red. */}
        <div className="absolute inset-0 z-0" aria-hidden="true">
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
          <div className="absolute -top-32 -right-24 w-[26rem] h-[26rem] rounded-full bg-white/[0.06] blur-3xl" />
          <div className="absolute -bottom-40 -left-20 w-[30rem] h-[30rem] rounded-full bg-black/20 blur-3xl" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-white/[0.04]" />
        </div>

        <div className="relative z-10">
            <img
              src="/assets/logo-blanco.png?v=fondoblanco4"
              alt="Logo de la empresa"
              className="w-full h-auto object-contain"
            />
        </div>

        <div className="relative z-10 text-white space-y-10">
          <div>
            <h2 className="text-4xl font-bold text-white mb-6 leading-tight drop-shadow-sm">Gestión Profesional</h2>
            <p className="text-lg font-normal opacity-90 leading-relaxed max-w-md drop-shadow-sm">
              Control integral de órdenes de servicio, técnicos e inventario. Simple, rápido y efectivo
            </p>
          </div>
          
          <div className="space-y-4">
             <div className="flex items-center gap-4 text-white">
                <Smartphone className="w-5 h-5 opacity-80" />
                <span className="text-sm font-medium">Diseño Mobile First</span>
             </div>
             <div className="flex items-center gap-4 text-white">
                <Zap className="w-5 h-5 opacity-80" />
                <span className="text-sm font-medium">Sincronización Inteligente</span>
             </div>
          </div>
        </div>

        <div className="relative z-10 text-[10px] text-white/50 font-bold uppercase tracking-[0.2em]">
          {company?.name || 'Plataforma'} v2.5.0
        </div>
      </div>

       <div className="flex-1 overflow-y-auto bg-white relative">
        <div className="min-h-full flex flex-col justify-center px-8 py-12 sm:px-12 w-full max-w-md mx-auto">
          
          <div className="lg:hidden mb-12 flex justify-center w-full">
            <NavasLogo variant="default" size="large" center />
          </div>

          <div className="w-full">
            <div className="mb-8 text-center lg:text-left">
              <h2 className="text-2xl font-bold text-ink tracking-tight mb-2">Bienvenido</h2>
              <p className="text-sm text-ink-soft">Ingresa tus credenciales para acceder al sistema.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider">Usuario</label>
                <div className="flex items-center gap-2 px-3 bg-sunken border border-line rounded-lg focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/10 transition-all">
                  <UserIcon size={18} className="text-ink-faint shrink-0" />
                  <input
                    type="text"
                    placeholder="Ej: usuario"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-transparent py-3 text-[15px] text-ink placeholder:text-ink-faint focus:outline-none border-0 focus:ring-0 focus:shadow-none"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider">Contraseña</label>
                <div className="flex items-center gap-2 pl-3 pr-1 bg-sunken border border-line rounded-lg focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/10 transition-all">
                  <Lock size={18} className="text-ink-faint shrink-0" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent py-3 text-[15px] text-ink placeholder:text-ink-faint focus:outline-none border-0 focus:ring-0 focus:shadow-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="text-ink-faint hover:text-ink-soft transition-colors p-2 shrink-0"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <button type="button" onClick={() => navigate('/forgot-password')} className="text-xs font-semibold text-primary hover:underline">¿Olvidaste tu clave?</button>
              </div>

              {error && (
                <div className="flex items-center gap-2.5 text-red-700 bg-red-50 border border-red-100 p-3 rounded-lg text-[13px] font-medium animate-shake">
                  <AlertCircle size={17} className="flex-shrink-0 text-red-500" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary text-white py-3.5 rounded-lg font-semibold text-[13px] uppercase tracking-widest hover:bg-primary-dark transition-colors flex items-center justify-center gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Ingresando...</span>
                  </div>
                ) : (
                  <>
                    <span>Iniciar Sesión</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
      `}} />
    </div>
  );
};

export default Login;
