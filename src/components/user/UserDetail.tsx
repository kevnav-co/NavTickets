import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { 
  ChevronLeft, AtSign, Shield, Trash2, Edit, IdCard, 
  AlertTriangle, Loader2, UserCheck, Code, Send, 
  CheckCircle2, XCircle, Smartphone, Wifi, WifiOff
} from 'lucide-react';
import PERMISSIONS, { hasPermission } from '../../permissions';

interface TestResult {
  success: boolean;
  error?: string;
  message: string;
  userName?: string;
  tokenPreview?: string;
}

const UserDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { users, deleteItem } = useData();
  const { currentUser } = useAuth();
  
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // --- Push Diagnostics State ---
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const user = users.find(u => u.id === id);

  const { canUpdate, canDelete, isDeveloper, isAdmin } = useMemo(() => {
    const isOwn = currentUser?.id === user?.id;
    return {
      canUpdate: isOwn || hasPermission(currentUser?.role, PERMISSIONS.UPDATE_USER),
      canDelete: !isOwn && hasPermission(currentUser?.role, PERMISSIONS.DELETE_USER),
      isDeveloper: currentUser?.role === 'developer',
      isAdmin: currentUser?.role === 'admin',
    };
  }, [currentUser, user]);

  if (!user) {
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center">
        <Loader2 size={48} className="text-gray-400 animate-spin" />
      </div>
    );
  }

  const getInitials = (name: string = '') => name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

  const confirmDelete = async () => {
    if (!canDelete) return alert("No tienes permiso para esta acción.");
    setIsDeleting(true);
    try {
      await deleteItem('users', user.id);
      setShowDeleteModal(false);
      navigate('/users');
    } catch (error) {
      alert("Error al eliminar.");
      console.error(error);
    } finally {
      setIsDeleting(false);
    }
  };

  // --- Push Diagnostics Handler ---
  const handleSendTestPush = async () => {
    setIsSendingTest(true);
    setTestResult(null);
    try {
      const functions = getFunctions();
      const sendTestNotification = httpsCallable(functions, 'sendTestNotification');
      const result = await sendTestNotification({ userId: user.id });
      setTestResult(result.data as TestResult);
    } catch (error: any) {
      setTestResult({
        success: false,
        error: 'CALL_FAILED',
        message: error.message || 'Error al llamar la Cloud Function.',
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const RoleBadge: React.FC<{role: string}> = ({ role }) => {
    const styles = {
        admin: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', label: 'Admin', icon: <Shield size={12} /> },
        supervisor: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', label: 'Supervisor', icon: <UserCheck size={12} /> },
        technician: { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200', label: 'Técnico', icon: <UserCheck size={12} /> },
        developer: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200', label: 'Developer', icon: <Shield size={12} /> },
    };
    const style = styles[role as keyof typeof styles] || styles.technician;
    return <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border ${style.bg} ${style.text} ${style.border}`}>{style.icon} {style.label}</span>;
  }

  // --- Token Display Helpers ---
  const tokenStatus = user.fcmToken ? 'registered' : 'none';
  const tokenPreview = user.fcmToken 
    ? `${user.fcmToken.substring(0, 16)}...${user.fcmToken.substring(user.fcmToken.length - 8)}`
    : 'Sin token';

  return (
    <>
      <div className="bg-gray-50 min-h-screen w-full max-w-2xl mx-auto pb-32">
        <div className="p-4"><button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm font-bold text-gray-500"><ChevronLeft size={20} />Volver</button></div>
        <div className="px-4 space-y-5">
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200"><div className="flex flex-col items-center text-center"><div className="w-20 h-20 rounded-2xl flex items-center justify-center font-black text-3xl mb-4 bg-red-50 text-red-700">{getInitials(user.name)}</div><h2 className="text-xl font-bold">{user.name}</h2><div className="mt-2"><RoleBadge role={user.role} /></div></div></section>
          <div className="space-y-3">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4"><div className="bg-gray-100 p-3 rounded-lg"><AtSign size={18} /></div><div><p className="text-[10px] font-bold uppercase">Usuario</p><p className="font-semibold">{user.username}</p></div></div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4"><div className="bg-gray-100 p-3 rounded-lg"><IdCard size={18} /></div><div><p className="text-[10px] font-bold uppercase">Identificación</p><p className="font-semibold">{user.identification || 'N/A'}</p></div></div>
          </div>

          {/* ======= DEVELOPER-ONLY: Push Notification Diagnostics Panel ======= */}
          {isDeveloper && (
            <section className="border-2 border-dashed border-purple-300 bg-purple-50/30 rounded-2xl p-5 space-y-4">
              {/* Panel Header */}
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 p-2.5 rounded-xl">
                  <Code size={18} className="text-purple-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-purple-900">Diagnóstico de Notificaciones</h3>
                  <p className="text-[10px] text-purple-500 font-bold uppercase tracking-wider">Solo visible para Developer</p>
                </div>
              </div>

              {/* Token Status */}
              <div className="bg-white rounded-xl p-4 border border-purple-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500 uppercase">Estado del Token FCM</span>
                  {tokenStatus === 'registered' ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-600 border border-green-200">
                      <Wifi size={12} /> Registrado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-500 border border-red-200">
                      <WifiOff size={12} /> Sin Token
                    </span>
                  )}
                </div>
                
                {tokenStatus === 'registered' && (
                  <div className="bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Token (preview)</p>
                    <p className="text-xs font-mono text-gray-600 break-all">{tokenPreview}</p>
                  </div>
                )}

                {tokenStatus === 'none' && (
                  <div className="bg-orange-50 rounded-lg px-3 py-2.5 flex items-start gap-2">
                    <AlertTriangle size={14} className="text-orange-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-orange-700">
                      Este usuario no tiene un token FCM. Necesita activar notificaciones desde su dispositivo (botón de campana en el header).
                      {user.role === 'technician' && ' En iPhone, la app debe estar instalada como PWA.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Platform Info */}
              <div className="bg-white rounded-xl p-4 border border-purple-200">
                <div className="flex items-center gap-3">
                  <div className="bg-gray-100 p-2 rounded-lg">
                    <Smartphone size={16} className="text-gray-500" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Plataforma</p>
                    <p className="text-xs font-semibold text-gray-700">
                      {tokenStatus === 'registered' 
                        ? 'Web Push (FCM detectará iOS/Android automáticamente)' 
                        : 'No determinada — sin token activo'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Send Test Push Button */}
              <button
                onClick={handleSendTestPush}
                disabled={isSendingTest}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-60 disabled:cursor-wait bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.98] shadow-lg shadow-purple-600/20"
              >
                {isSendingTest ? (
                  <><Loader2 size={16} className="animate-spin" /> Enviando Push de Prueba...</>
                ) : (
                  <><Send size={16} /> Enviar Push de Prueba</>
                )}
              </button>

              {/* Test Result */}
              {testResult && (
                <div className={`rounded-xl p-4 border-2 transition-all animate-in fade-in slide-in-from-bottom-2 ${
                  testResult.success 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-start gap-3">
                    {testResult.success ? (
                      <CheckCircle2 size={20} className="text-green-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <XCircle size={20} className="text-red-500 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                        {testResult.success ? '✅ Push Enviado Correctamente' : '❌ Error en el Envío'}
                      </p>
                      <p className={`text-xs mt-1 ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                        {testResult.message}
                      </p>
                      {testResult.error && (
                        <p className="text-[10px] font-mono text-gray-400 mt-2">
                          Código: {testResult.error}
                        </p>
                      )}
                      {testResult.tokenPreview && (
                        <p className="text-[10px] font-mono text-gray-400 mt-1">
                          Token: {testResult.tokenPreview}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
          {/* ======= END DEVELOPER PANEL ======= */}
          
          {(canUpdate || canDelete) && (
            <div className="grid grid-cols-2 gap-3 pt-4">
              {canUpdate && 
                <button 
                  onClick={() => navigate(`/users/${user.id}/edit`)} 
                  className="flex items-center justify-center gap-2 bg-white border border-gray-200 py-3.5 rounded-2xl font-bold text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  <Edit size={16} />Editar
                </button>}
              {canDelete && 
                <button 
                  onClick={() => setShowDeleteModal(true)} 
                  className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                  <Trash2 size={16} />Eliminar
                </button>}
            </div>
          )}
        </div>
      </div>

      {(canUpdate || canDelete) && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-white/80 backdrop-blur-sm border-t md:hidden"><div className="max-w-2xl mx-auto p-4"><div className="grid grid-cols-2 gap-3">
          {canUpdate && <button onClick={() => navigate(`/users/${user.id}/edit`)} className="flex items-center justify-center gap-2 bg-gray-100 py-3.5 rounded-2xl font-bold text-sm"><Edit size={16} />Editar</button>}
          {canDelete && <button onClick={() => setShowDeleteModal(true)} className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm bg-red-50 text-red-600"><Trash2 size={16} />Eliminar</button>}
        </div></div></div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"><div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center"><div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-5"><AlertTriangle size={32} /></div><h3 className="text-lg font-bold">¿Eliminar?</h3><p className="text-sm text-gray-500 mb-6">Se eliminará a <span className="font-bold">{user.name}</span>. Esta acción es irreversible.</p><div className="w-full flex flex-col gap-2">
          <button onClick={confirmDelete} disabled={isDeleting} className="w-full flex items-center justify-center py-3 bg-red-600 text-white rounded-lg font-bold text-sm disabled:bg-red-400">{isDeleting ? <Loader2 size={18} className="animate-spin"/> : 'Sí, Eliminar'}</button>
          <button onClick={() => setShowDeleteModal(false)} className="w-full py-3 bg-gray-100 text-gray-700 rounded-lg font-bold text-sm">Cancelar</button>
        </div></div></div>
      )}
    </>
  );
};

export default UserDetail;
