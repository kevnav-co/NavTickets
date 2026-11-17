import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { X, Search, UserPlus, Loader2, ServerCrash, Crown, RefreshCw, ListFilter, UploadCloud } from 'lucide-react';
import { CuentiClient, Client } from '../../types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { authAccessToken } from '../../services/supabase';

interface CuentiClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingClients: Client[];
}

interface ApiClientData {
  id_cliente: string;
  nombre_cliente: string;
  identificacion: string;
  alias?: string | null;
  direccion: string;
  telefono_1: string;
  email: string;
  ciudad: string;
}

export const CuentiClientModal: React.FC<CuentiClientModalProps> = ({ isOpen, onClose, existingClients }) => {
  const { addItem, updateItem } = useData();
  const { currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [fetchedClients, setFetchedClients] = useState<(CuentiClient & { isVIP: boolean; existsInDB: boolean; needsUpdate: boolean })[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados para filtros inteligentes
  const [filterVIPOnly, setFilterVIPOnly] = useState(false);
  const [filterNotAddedOnly, setFilterNotAddedOnly] = useState(false);
  const [filterNeedsUpdateOnly, setFilterNeedsUpdateOnly] = useState(false);
  const [isSyncingBulk, setIsSyncingBulk] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const fetchCuentiClients = async () => {
        setIsLoading(true);
        setError(null);
        try {
          // Ir por el edge autenticado (cuenti-proxy): nunca exponer la URL de
          // Cuenti/GCP en el bundle ni dejar el endpoint abierto. El edge valida
          // el access_token JWT del usuario y su rol antes de hacer el fetch upstream.
          const token = await authAccessToken();
          const response = await fetch('/api/cuenti/clients', {
            headers: { 'Authorization': `Bearer ${token}` },
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error de red ${response.status}: ${errorText || 'No se pudo conectar con la API de Cuenti'}`);
          }

          const rawData = await response.json();

          // --- DEFENSA CONTRA RESPUESTAS INVÁLIDAS DE CUENTI ---
          let clientsArray: ApiClientData[] = [];
          if (Array.isArray(rawData)) {
             clientsArray = rawData;
          } else if (rawData && typeof rawData.ConsultarClientePaginadoResult === 'string') {
             clientsArray = JSON.parse(rawData.ConsultarClientePaginadoResult);
          } else {
             const apiErrorMsg = rawData.fault?.faultstring || 'La respuesta de Cuenti no tiene el formato esperado.';
             throw new Error(apiErrorMsg);
          }

          const mappedClients = clientsArray.map(apiClient => {
            const identification = apiClient.identificacion || '';
            const phone = apiClient.telefono_1 || '';
            const email = apiClient.email || '';
            const direccion = apiClient.direccion || '';
            const ciudad = apiClient.ciudad || '';
            const aliasRaw = (apiClient.alias || '').trim();

            // Construir nombre completo con alias: "Nombre (Alias)" — misma lógica que IntelligenceEngine (Excel)
            const nombreBase = apiClient.nombre_cliente || '';
            const nombreCompleto = aliasRaw ? `${nombreBase} (${aliasRaw})` : nombreBase;

            const dbMatch = existingClients.find(c => c.identification === identification);
            const existsInDB = !!dbMatch;
            
            let needsUpdate = false;
            if (dbMatch) {
              const oldContact = dbMatch.contact || "";
              const oldEmail = dbMatch.email || "";
              const oldAddress = dbMatch.address || "";
              
              if ((phone && phone !== oldContact) || 
                  (email && email !== oldEmail) || 
                  (direccion && !oldAddress.includes(direccion))) {
                needsUpdate = true;
              }
            }

            const isVIP = phone.length >= 7 && email.includes('@') && direccion.length > 0 && ciudad.length > 0;

            return {
              id: apiClient.id_cliente,
              name: nombreCompleto,
              identification,
              alias: aliasRaw || null,
              address: direccion,
              phone,
              email,
              city: ciudad,
              isVIP,
              existsInDB,
              needsUpdate
            };
          });

          setFetchedClients(mappedClients);
        } catch (err: any) {
          console.error("Error procesando la respuesta de Cuenti:", err);
          setError(err.message || 'Ocurrió un error inesperado.');
        } finally {
          setIsLoading(false);
        }
      };

      fetchCuentiClients();
    }
  }, [isOpen]);

  const filteredClients = useMemo(() => {
    let items = fetchedClients;
    
    // Filtros inteligentes
    if (filterVIPOnly) {
      items = items.filter((c) => c.isVIP && !c.existsInDB);
    } else if (filterNotAddedOnly) {
      items = items.filter((c) => !c.existsInDB);
    } else if (filterNeedsUpdateOnly) {
      items = items.filter((c) => c.needsUpdate);
    }

    if (!searchTerm) return items;
    const lowercasedQuery = searchTerm.toLowerCase();
    return items.filter((client) =>
      client.name.toLowerCase().includes(lowercasedQuery) ||
      (client.identification && client.identification.toLowerCase().includes(lowercasedQuery))
    );
  }, [fetchedClients, searchTerm, filterVIPOnly, filterNotAddedOnly, filterNeedsUpdateOnly]);

  const stats = useMemo(() => {
    return {
      total: fetchedClients.length,
      vip: fetchedClients.filter((c) => c.isVIP && !c.existsInDB).length,
      notAdded: fetchedClients.filter((c) => !c.existsInDB).length,
      needsUpdate: fetchedClients.filter((c) => c.needsUpdate).length
    };
  }, [fetchedClients]);

  // Crea o actualiza en la BD un cliente de Cuenti. Devuelve 'created' | 'updated' | 'unchanged'.
  const syncClient = useCallback(async (client: CuentiClient): Promise<'created' | 'updated' | 'unchanged'> => {
    const dbMatch = existingClients.find(c => c.identification === client.identification);
    if (dbMatch) {
      const updates: Partial<Client> = {};
      if (client.phone && client.phone !== dbMatch.contact) updates.contact = client.phone;
      if (client.email && client.email !== dbMatch.email) updates.email = client.email;
      if (client.address && !dbMatch.address?.includes(client.address)) {
        updates.address = [client.address, client.city].filter(Boolean).join(', ');
      }
      if (Object.keys(updates).length === 0) return 'unchanged';
      await updateItem('clients', dbMatch.id, updates);
      return 'updated';
    }
    if (!currentUser?.companyId) throw new Error('Sesión sin empresa asociada');
    await addItem('clients', {
      companyId: currentUser.companyId,
      name: client.name,
      identification: client.identification,
      contact: client.phone || '',
      email: client.email || '',
      address: [client.address, client.city].filter(Boolean).join(', '),
      city: client.city || '',
    });
    return 'created';
  }, [existingClients, addItem, updateItem, currentUser?.companyId]);

  const handleBulkSync = async () => {
    if (filteredClients.length === 0 || isSyncingBulk) return;
    if (!window.confirm(`¿Deseas sincronizar los ${filteredClients.length} clientes filtrados a la base de datos del sistema?`)) return;

    setIsSyncingBulk(true);
    const counts = { created: 0, updated: 0, unchanged: 0, failed: 0 };
    const failures: string[] = [];
    for (const client of filteredClients) {
      try {
        counts[await syncClient(client)]++;
      } catch (err: any) {
        counts.failed++;
        failures.push(`${client.name}: ${err.message}`);
      }
    }
    setIsSyncingBulk(false);

    if (counts.failed > 0) console.error('[Cuenti] Fallos de sincronización:', failures);
    if (counts.created + counts.updated + counts.failed === 0) {
      alert('No se detectaron cambios pendientes para sincronizar.');
      return;
    }
    alert(`Sincronización finalizada:\n- ${counts.created} nuevos agregados\n- ${counts.updated} actualizados` +
      (counts.failed ? `\n- ${counts.failed} con error (ej.: ${failures[0]})` : ''));
    if (counts.failed === 0) onClose();
  };

  const handleSingleSync = useCallback(async (client: CuentiClient & { needsUpdate: boolean; existsInDB: boolean }) => {
    if (isSyncingBulk) return;
    const actionText = client.needsUpdate && client.existsInDB ? 'actualizar' : 'importar';
    try {
      await syncClient(client);
      setFetchedClients(prev => prev.map(c => c.id === client.id ? { ...c, existsInDB: true, needsUpdate: false } : c));
    } catch (err: any) {
      console.error(`Error al ${actionText} cliente:`, err);
      alert(`Error al ${actionText}: ` + err.message);
    }
  }, [syncClient, isSyncingBulk]);

  if (!isOpen) return null;

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-ink-soft">
          <Loader2 className="animate-spin mb-4" size={48} />
          <p className="font-semibold text-lg">Conectando con Cuenti...</p>
          <p>Obteniendo lista de clientes.</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-red-600 bg-red-50 rounded-lg p-4">
          <ServerCrash className="mb-4" size={48} />
          <p className="font-semibold text-lg">Error de Conexión</p>
          <p className="text-sm text-center mt-2">No se pudo obtener la lista de clientes desde Cuenti.</p>
          <p className="text-xs text-center mt-2 font-mono bg-red-100 p-2 rounded">{error}</p>
        </div>
      );
    }

    return (
      <>
        {/* Filtros Inteligentes */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <div className="bg-raised p-2.5 rounded-xl shadow-sm border border-line-soft">
            <p className="text-[8px] font-black text-ink-faint uppercase tracking-widest">Total Registros</p>
            <p className="text-xl font-black text-ink mt-0.5">{stats.total}</p>
          </div>

          <div 
            onClick={() => { setFilterVIPOnly(!filterVIPOnly); setFilterNotAddedOnly(false); setFilterNeedsUpdateOnly(false); }}
            className={`p-2.5 rounded-xl shadow-sm border transition-all cursor-pointer hover:shadow-md active:scale-95 ${filterVIPOnly ? 'ring-2 ring-yellow-400 ring-offset-2' : ''} bg-yellow-50 border-yellow-100`}
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-yellow-700">VIP</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-xl font-black text-yellow-800">{stats.vip}</p>
                  <Crown size={14} className="text-yellow-600 fill-yellow-600" />
                </div>
              </div>
              <div className={`p-1 rounded-full transition-colors ${filterVIPOnly ? 'bg-yellow-200 text-yellow-800' : 'bg-yellow-100 text-yellow-600'}`}>
                <ListFilter size={12} />
              </div>
            </div>
          </div>

          <div 
            onClick={() => { setFilterNotAddedOnly(!filterNotAddedOnly); setFilterVIPOnly(false); setFilterNeedsUpdateOnly(false); }}
            className={`p-2.5 rounded-xl shadow-sm border transition-all cursor-pointer hover:shadow-md active:scale-95 ${filterNotAddedOnly ? 'ring-2 ring-blue-400 ring-offset-2' : ''} bg-blue-50 border-blue-100`}
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-blue-700">Nuevos</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-xl font-black text-blue-800">{stats.notAdded}</p>
                  <UserPlus size={14} className="text-blue-600" />
                </div>
              </div>
              <div className={`p-1 rounded-full transition-colors ${filterNotAddedOnly ? 'bg-blue-200 text-blue-800' : 'bg-blue-100 text-blue-600'}`}>
                <ListFilter size={12} />
              </div>
            </div>
          </div>

          <div 
            onClick={() => { setFilterNeedsUpdateOnly(!filterNeedsUpdateOnly); setFilterNotAddedOnly(false); setFilterVIPOnly(false); }}
            className={`p-2.5 rounded-xl shadow-sm border transition-all cursor-pointer hover:shadow-md active:scale-95 ${filterNeedsUpdateOnly ? 'ring-2 ring-orange-400 ring-offset-2' : ''} bg-orange-50 border-orange-100`}
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-orange-700">Actualizar</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-xl font-black text-orange-800">{stats.needsUpdate}</p>
                  <RefreshCw size={14} className="text-orange-600" />
                </div>
              </div>
              <div className={`p-1 rounded-full transition-colors ${filterNeedsUpdateOnly ? 'bg-orange-200 text-orange-800' : 'bg-orange-100 text-orange-600'}`}>
                <ListFilter size={12} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
          {filteredClients.length > 0 ? (
            <ul className="space-y-2">
              {filteredClients.map((client) => (
                <li key={client.id} className={`p-3 rounded-lg shadow-sm flex items-center justify-between border-l-4 ${client.needsUpdate ? 'bg-orange-50 border-orange-400' : !client.existsInDB ? 'bg-raised border-blue-400' : 'bg-raised border-line'}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-ink">{client.name}</p>
                        {client.isVIP && <Crown size={14} className="text-yellow-600 fill-yellow-600" />}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-ink-soft font-mono italic">ID: {client.identification || 'N/A'}</p>
                        {client.needsUpdate && <span className="text-[9px] font-bold bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded uppercase">Actualizar</span>}
                        {!client.existsInDB && <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded uppercase">Nuevo</span>}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSingleSync(client)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-lg font-bold text-sm hover:bg-primary/20 transition-colors"
                  >
                    <UserPlus size={16} />
                    {client.needsUpdate ? 'Actualizar' : 'Importar'}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-16 text-ink-soft">
              <Search size={32} className="mx-auto mb-2" />
              <p className="font-medium">No se encontraron clientes.</p>
              <p className="text-sm">La lista de Cuenti está vacía o no hay coincidencias con los filtros.</p>
            </div>
          )}
        </div>
        <div className="text-right mt-4 pt-2 border-t border-line">
            <p className="text-xs font-bold text-ink-faint uppercase tracking-widest">{filteredClients.length} de {fetchedClients.length} cargados</p>
        </div>
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl h-[90vh] bg-sunken rounded-3xl shadow-2xl flex flex-col p-6 m-4">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-line">
          <h2 className="text-2xl font-bold text-ink">Importar Cliente desde Cuenti</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-ink-soft hover:bg-line hover:text-ink transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {!isLoading && !error && (
          <div className="flex gap-2 mb-4">
            <div className="relative flex-grow">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" size={18} />
              <input
                type="text"
                placeholder="Buscar por nombre o identificación..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-11 bg-raised border border-line rounded-xl pl-11 pr-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
            </div>
            {(filterVIPOnly || filterNotAddedOnly || filterNeedsUpdateOnly) && filteredClients.length > 0 && (
              <button
                onClick={handleBulkSync}
                disabled={isSyncingBulk}
                className="flex items-center gap-2 px-4 bg-primary text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all disabled:opacity-50 disabled:cursor-wait active:scale-95 whitespace-nowrap"
              >
                {isSyncingBulk ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                <span className="hidden sm:inline">Sincronizar Todo</span>
                <span className="sm:hidden">Sinc.</span>
              </button>
            )}
          </div>
        )}

        {renderContent()}
      </div>
    </div>
  );
};
