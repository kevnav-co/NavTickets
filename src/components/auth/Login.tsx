
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
        src="https://firebasestorage.googleapis.com/v0/b/navas-33818730-80986.firebasestorage.app/o/Logo-Inicio.png?alt=media&token=b516cd08-2ece-445d-ac69-0b91d444d78f"
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
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1513828583688-c52646db42da?auto=format&fit=crop&q=80"
            alt="Fondo Industrial" 
            className="w-full h-full object-cover opacity-40 mix-blend-luminosity"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/90 to-primary/40 mix-blend-multiply"></div>
        </div>

        <div className="relative z-10">
            <img 
              src="https://firebasestorage.googleapis.com/v0/b/navas-33818730-80986.firebasestorage.app/o/Logo-Blanco.png?alt=media&token=f6170240-c993-476d-bb00-8a98ffa4ef13" 
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
        <div className="min-h-full flex flex-col justify-center px-8 py-10 sm:px-12 md:px-20 lg:px-24 xl:px-32 w-full max-w-3xl mx-auto">
          
          <div className="lg:hidden mb-12 flex justify-center w-full">
            <NavasLogo variant="default" size="large" center />
          </div>

          <div className="w-full">
            <div className="mb-10 text-center lg:text-left">
              <h2 className="text-3xl font-bold text-gray-900 tracking-tight mb-3">Bienvenido</h2>
              <p className="text-gray-500">Ingresa tus credenciales para acceder al sistema.</p>
            </div>

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
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                   <label className="text-xs font-bold text-gray-900 uppercase tracking-wide">Contraseña</label>
                </div>
                <div className="flex items-center border-b-2 border-gray-100 focus-within:border-primary transition-colors">
                  <Lock size={20} className="ml-2 text-gray-400" />
                  <input 
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent py-3 pl-3 text-base text-gray-900 placeholder:text-gray-300 focus:outline-none rounded-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-gray-400 hover:text-gray-600 transition-colors p-2"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4">
                <div></div>
                <button type="button" className="text-xs font-bold text-gray-400 cursor-not-allowed">¿Olvidaste tu clave?</button>
              </div>

              {error && (
                <div className="flex items-center gap-3 text-red-600 bg-red-50 p-4 rounded-xl text-sm font-medium animate-shake">
                  <AlertCircle size={18} className="flex-shrink-0" />
                  {error}
                </div>
              )}

              <button 
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary text-white py-4 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-black transition-colors flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed mt-8"
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
