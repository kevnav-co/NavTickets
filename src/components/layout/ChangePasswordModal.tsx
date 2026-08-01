
import React, { useState, useEffect } from 'react';
import { X, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';
import { supabase } from '../../services/supabase';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const { company } = useCompany();
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setSuccess(false);
      setOldPass('');
      setNewPass('');
      setConfirmPass('');
      setIsSaving(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (newPass !== confirmPass) {
      return setError('Las contraseñas nuevas no coinciden.');
    }
    if (newPass.length < 6) {
      return setError('La nueva contraseña debe tener al menos 6 caracteres.');
    }
    if (!currentUser || !currentUser.username) {
        return setError('No se pudo verificar el usuario actual.');
    }

    setIsSaving(true);

    try {
      // 1. Reautenticar con la contraseña actual (requerido por Supabase para cambiar clave)
      const domain = company?.auth?.emailDomain || '@navas.com';
      const userEmail = `${currentUser.username}${domain}`;

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: oldPass,
      });

      if (signInError) {
        if (signInError.message?.includes('Invalid login credentials') || signInError.status === 400) {
          setError('La contraseña actual es incorrecta.');
        } else {
          setError('Error al verificar la contraseña actual.');
        }
        setIsSaving(false);
        return;
      }

      // 2. Actualizar la contraseña
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPass,
      });

      if (updateError) {
        if (updateError.message?.includes('rate limit') || updateError.status === 429) {
          setError('Demasiados intentos fallidos. Inténtalo más tarde.');
        } else {
          console.error("Password update error:", updateError);
          setError('No se pudo actualizar la contraseña. Verifica tu conexión.');
        }
        setIsSaving(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);

    } catch (err: any) {
      console.error("Password update error:", err);
      if (err?.message?.includes('Invalid login credentials')) {
        setError('La contraseña actual es incorrecta.');
      } else {
        setError('No se pudo actualizar la contraseña. Verifica tu conexión.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-black text-gray-900">Cambiar Contraseña</h3>
          <button onClick={onClose} disabled={isSaving}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        {success ? (
          <div className="text-center py-8 flex flex-col items-center justify-center">
            <ShieldCheck size={48} className="text-green-500 mb-4" />
            <h4 className="font-bold text-lg text-gray-800">¡Contraseña Actualizada!</h4>
            <p className="text-sm text-gray-500">Tu contraseña se ha cambiado correctamente.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { label: 'Contraseña Actual', value: oldPass, setter: setOldPass },
              { label: 'Nueva Contraseña', value: newPass, setter: setNewPass },
              { label: 'Confirmar Nueva', value: confirmPass, setter: setConfirmPass }
            ].map((field, i) => (
              <div key={i}>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">{field.label}</label>
                <input 
                  type="password" 
                  value={field.value} 
                  onChange={e => field.setter(e.target.value)} 
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors" 
                  required 
                />
              </div>
            ))}
            {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold flex items-center gap-2"><AlertCircle size={16} /> {error}</div>}
            <button type="submit" disabled={isSaving} className="w-full bg-primary text-white py-3.5 rounded-xl font-bold text-sm uppercase tracking-widest shadow-lg active:scale-95 transition-all mt-2 disabled:opacity-50">
              {isSaving ? 'Actualizando...' : 'Actualizar Clave'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
