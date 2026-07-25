
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { User } from '../../types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import PERMISSIONS, { hasPermission, ROLES } from '../../permissions';
import SignatureField from '../ui/SignatureField';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  ChevronLeft, Save, AtSign, Shield, HardHat, Lock, IdCard,
  User as UserIcon, UserPlus, Loader2, MapPin, Eye, EyeOff
} from 'lucide-react';
import { useLocalStorage } from '../../hooks/useLocalStorage';

interface Props {
  users: User[];
}

const initialFormData: Partial<User> = {
  name: '',
  role: 'technician',
  username: '',
  password: '',
  identification: '',
  latitude: 0,
  longitude: 0,
  signature: undefined
};

const UserForm: React.FC<Props> = ({ users }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { updateItem, addItem } = useData();
  const { currentUser } = useAuth();
  const isEditMode = !!id;

  const localStorageKey = isEditMode ? `user-form-${id}` : 'new-user-form';
  const [formData, setFormData] = useLocalStorage<Partial<User>>(localStorageKey, initialFormData);
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  const [gpsStatus, setGpsStatus] = useState<'locating' | 'found' | 'error' | 'idle'>('idle');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const availableRoles = Object.values(ROLES).filter(role => role !== ROLES.DEVELOPER);

  useEffect(() => {
    if (isEditMode) {
      const userToEdit = users.find(u => u.id === id);
      if (userToEdit && JSON.stringify(formData) === JSON.stringify(initialFormData)) {
        setFormData({ ...userToEdit, password: '' });
      }
    } else {
      setGpsStatus('locating');
      if ("geolocation" in navigator) {
        try {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              setFormData(prev => ({ ...prev, latitude: position.coords.latitude, longitude: position.coords.longitude }));
              setGpsStatus('found');
            },
            (error) => {
              setGpsStatus('error');
              console.warn(`Geolocation Error: ${error.message}`);
            },
            { enableHighAccuracy: true, timeout: 5000 }
          );
        } catch (error) {
          setGpsStatus('error');
          console.warn('Geolocation failed due to permissions policy.');
        }
      } else {
        setGpsStatus('error');
      }
    }
  }, [id, users, isEditMode, setFormData, formData]);

  useEffect(() => {
    if (!isEditMode && formData.name) {
       const cleanName = formData.name.trim().toLowerCase();
       const parts = cleanName.split(/\s+/);
       if (parts.length > 0) {
         let generated = parts[0];
         if (parts.length >= 2 && parts[1]) {
            generated = `${parts[0].charAt(0)}${parts[1]}`;
         }
         setFormData(prev => ({...prev, username: generated}));
       }
    }
  }, [formData.name, isEditMode, setFormData]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const errors: { [key: string]: string } = {};
    const userToCheckId = isEditMode ? id : '';

    if (!formData.name?.trim()) {
        errors.name = 'El nombre completo es obligatorio.';
    }
    if (!formData.username?.trim()) {
        errors.username = 'El nombre de usuario es obligatorio.';
    } else if (users.some(user => user.username === formData.username && user.id !== userToCheckId)) {
        errors.username = 'Este nombre de usuario ya está en uso.';
    }

    if (!formData.identification?.trim()) {
        errors.identification = 'La identificación es obligatoria.';
    } else if (users.some(user => user.identification === formData.identification && user.id !== userToCheckId)) {
        errors.identification = 'Esta identificación ya está registrada.';
    }

    if (!isEditMode && !formData.password?.trim()) {
        errors.password = 'La contraseña es obligatoria para nuevos usuarios.';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!validateForm()) {
      setIsLoading(false);
      return;
    }

    const permissionNeeded = isEditMode ? PERMISSIONS.UPDATE_USER : PERMISSIONS.CREATE_USER;
    if (!currentUser || !hasPermission(currentUser.role, permissionNeeded)) {
        alert('No tienes permiso para realizar esta acción.');
        setIsLoading(false);
        return;
    }
    
    try {
        if (isEditMode) {
            if (!id) {
                setIsLoading(false);
                return;
            }

            if (formData.password && formData.password.trim() !== '') {
                try {
                    const functions = getFunctions();
                    const updateUserPassword = httpsCallable(functions, 'updateUserPassword');
                    await updateUserPassword({ userId: id, newPassword: formData.password });
                } catch (error: any) {
                    console.error("Error updating password:", error);
                    alert(`Error al actualizar la contraseña: ${error.message}`);
                    setIsLoading(false);
                    return;
                }
            }

            const { password, ...restOfData } = formData;
            await updateItem('users', id, restOfData);
            alert('Usuario actualizado con éxito');
            window.localStorage.removeItem(localStorageKey);
            navigate(`/users/${id}`);
            
        } else {
            const {id: formId, ...restOfData} = formData;
            await addItem('users', {
                ...restOfData,
                latitude: formData.latitude !== 0 ? formData.latitude : undefined,
                longitude: formData.longitude !== 0 ? formData.longitude : undefined,
                locationUpdatedAt: new Date().toISOString()
            });
            alert('Usuario registrado con éxito');
            window.localStorage.removeItem(localStorageKey);
            navigate('/users');
        }
    } catch (error) {
        console.error("Error saving user:", error);
        alert("No se pudo guardar el usuario. Por favor, intente de nuevo.");
    } finally {
        setIsLoading(false);
    }
  };

  const GpsIndicator = () => {
    if (isEditMode) return null;
    return (
        <div className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wide flex items-center gap-1 ${gpsStatus === 'locating' ? 'bg-yellow-50 text-yellow-600' : gpsStatus === 'found' ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'}`}>
            {gpsStatus === 'locating' && <Loader2 size={10} className="animate-spin" />}
            {gpsStatus === 'found' && <MapPin size={10} />}
            {gpsStatus === 'locating' ? 'OBTENIENDO GPS...' : gpsStatus === 'found' ? 'UBICACIÓN LISTA' : 'SIN GPS'}
        </div>
    );
  }

  return (
    <>
    <div className="bg-white min-h-screen pb-32">
      <header className="px-4 py-3 flex items-center gap-2 sticky top-0 bg-white border-b border-gray-100 z-10">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1 hover:bg-gray-100 rounded-full transition-colors"><ChevronLeft size={22} /></button>
        <h1 className="text-lg font-bold text-gray-800 tracking-tight">{isEditMode ? 'Editar Usuario' : 'Nuevo Usuario'}</h1>
      </header>

      <form onSubmit={handleSubmit} className="p-5 space-y-6 max-w-sm mx-auto">
        <div className="flex flex-col items-center mb-6 pt-4">
          <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center text-[#7b1113] mb-3 shadow-inner">
            {isEditMode ? <UserIcon size={40} /> : <UserPlus size={40} />}
          </div>
          { !isEditMode ? <GpsIndicator /> : <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">Modificar Perfil Navas</p> }
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 ml-1">Nombre Completo</label>
            <input type="text" name="name" placeholder="Ej: Kevin Navas" value={formData.name || ''} onChange={handleInputChange} className={`w-full bg-gray-50 border ${validationErrors.name ? 'border-red-500' : 'border-gray-200'} rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-[#7b1113]/20 text-sm font-medium transition-all`} />
            {validationErrors.name && <p className="text-xs text-red-600 mt-1 ml-1">{validationErrors.name}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 ml-1">Identificación</label>
            <div className="relative flex items-center">
              <div className="absolute left-0 pl-4 pointer-events-none">
                <IdCard size={18} className="text-gray-400" />
              </div>
              <input type="text" name="identification" placeholder="CC o NIT" value={formData.identification || ''} onChange={handleInputChange} className={`w-full bg-gray-50 border ${validationErrors.identification ? 'border-red-500' : 'border-gray-200'} rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-[#7b1113]/20 text-sm font-medium transition-all`} />
            </div>
            {validationErrors.identification && <p className="text-xs text-red-600 mt-1 ml-1">{validationErrors.identification}</p>}
          </div>

          {currentUser && hasPermission(currentUser.role, PERMISSIONS.UPDATE_USER_ROLE) && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2 ml-1">Rol Operativo</label>
              <div className="grid grid-cols-2 gap-3">
                {availableRoles.map(role => (
                  <button 
                    type="button" 
                    key={role as React.Key}
                    onClick={() => setFormData({...formData, role: role as User['role']})}
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all font-bold text-sm capitalize ${formData.role === role ? 'border-[#7b1113] bg-red-50 text-[#7b1113]' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
                      {role === 'technician' ? <HardHat size={16} /> : <Shield size={16} />} 
                      {role as React.ReactNode}
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentUser && hasPermission(currentUser.role, PERMISSIONS.UPDATE_USER_SIGNATURE) && (
            <SignatureField 
              title="Firma Digital"
              savedSignature={formData.signature || null} 
              onSave={(newSignature) => setFormData(prev => ({ ...prev, signature: newSignature || undefined }))}
            />
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 ml-1">Usuario de Sistema</label>
            <div className="relative flex items-center">
                <div className="absolute left-0 pl-4 pointer-events-none">
                    <AtSign size={18} className="text-gray-400" />
                </div>
              <input type="text" name="username" value={formData.username || ''} onChange={handleInputChange} className={`w-full bg-gray-50 border ${validationErrors.username ? 'border-red-500' : 'border-gray-200'} rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-[#7b1113]/20 text-sm font-medium transition-all`} />
            </div>
            {validationErrors.username && <p className="text-xs text-red-600 mt-1 ml-1">{validationErrors.username}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 ml-1">Contraseña</label>
            <div className="relative flex items-center">
                <div className="absolute left-0 pl-4 pointer-events-none">
                    <Lock size={18} className="text-gray-400" />
                </div>
              <input type={showPassword ? "text" : "password"} name="password" placeholder={isEditMode ? "Dejar en blanco para no cambiar" : "••••••••"} value={formData.password || ''} onChange={handleInputChange} className={`w-full bg-gray-50 border ${validationErrors.password ? 'border-red-500' : 'border-gray-200'} rounded-xl py-3 pl-12 pr-12 focus:outline-none focus:ring-2 focus:ring-[#7b1113]/20 text-sm font-medium transition-all`} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-0 pr-4 text-gray-400 hover:text-gray-600 transition-colors">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {validationErrors.password && <p className="text-xs text-red-600 mt-1 ml-1">{validationErrors.password}</p>}
          </div>
        </div>

       <button type="submit" disabled={isLoading} className="w-full bg-[#7b1113] text-white py-5 rounded-[1.5rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-red-900/30 active:scale-[0.98] transition-all disabled:opacity-60 mt-4 flex items-center justify-center gap-3 group">
          {isLoading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>{isEditMode ? 'Guardando...' : 'Registrando...'}</span>
            </> 
          ) : (
            <>
              {isEditMode ? <Save size={18} /> : <UserPlus size={18} />}
              {isEditMode ? 'Guardar Cambios' : 'Registrar Usuario'}
            </>
          )}
        </button>
      </form>
    </div>
    </>
  );
};

export default UserForm;
