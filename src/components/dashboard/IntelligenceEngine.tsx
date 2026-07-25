
import React, { useState, useMemo, useRef } from 'react';
import { writeBatch, doc, collection } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Client } from '../../types';
import { 
  Sparkles, XCircle, TrendingDown, Crown, ListFilter, UploadCloud, 
  Loader2, CheckSquare, Square, FileSpreadsheet, UserPlus, RefreshCw
} from 'lucide-react';

import { 
  AnalyzedProduct, AnalyzedClient, ClientDiff, AnalysisType 
} from '../../types/intelligence';
import { mapExcelToProduct } from '../../utils/productUtils';

interface IntelligenceEngineProps {
  clients: Client[] | null;
}

const IntelligenceEngine: React.FC<IntelligenceEngineProps> = ({ clients }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [analysisData, setAnalysisData] = useState<{ type: AnalysisType, items: any[] } | null>(null);
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'reading' | 'analyzing'>('idle');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isUploadingFirebase, setIsUploadingFirebase] = useState(false);
  const [filterVIPOnly, setFilterVIPOnly] = useState(false);
  const [filterNotAddedOnly, setFilterNotAddedOnly] = useState(false);
  const [filterNeedsUpdateOnly, setFilterNeedsUpdateOnly] = useState(false);

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!clients) {
      alert("Los datos de clientes aún no han cargado. Por favor, espere unos segundos e intente de nuevo.");
      if(e.target) e.target.value = ''; 
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessingStatus('reading');
    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const XLSX = await import('xlsx');
            const bstr = evt.target?.result;
            const workbook = XLSX.read(bstr, { type: 'binary' });
            const firstSheetName = workbook.SheetNames[0];
            const workbookWorksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(workbookWorksheet);
            if (jsonData.length === 0) { alert("El archivo está vacío."); setProcessingStatus('idle'); return; }
            analyzeData(jsonData);
        } catch (error) {
            console.error("Error leyendo Excel:", error);
            alert("Error al procesar el archivo. Asegúrate de que sea un Excel válido.");
            setProcessingStatus('idle');
        }
    };
    reader.readAsBinaryString(file);
    if(e.target) e.target.value = ''; 
  };

  const analyzeData = (data: any[]) => {
      if (!clients) { 
        setProcessingStatus('idle');
        return;
      }

      setProcessingStatus('analyzing');
      setFilterVIPOnly(false);
      setFilterNotAddedOnly(false);
      setFilterNeedsUpdateOnly(false);

      const firstRow = data[0];
      const keys = Object.keys(firstRow).map(k => k.toLowerCase().trim());
      let type: AnalysisType = null;
      let processedItems: any[] = [];

      if (keys.some(k => k.includes('identificación') || k.includes('identificacion'))) {
          type = 'clients';
          processedItems = data.map((row: any, index) => {
              const identificacion = String(row["Identificación"] || row["Identificacion"] || "S/D").trim();
              
              const nombreExcel = String(row["Nombres"] || row["Nombre"] || "Sin Nombre").trim();
              const aliasExcel = String(row["Alias"] || "").trim();
              const nombreCompleto = aliasExcel ? `${nombreExcel} (${aliasExcel})` : nombreExcel;

              const telefono = String(row["telefono 1"] || row["Telefono 1"] || row["telefono 2"] || row["Telefono 2"] || row["Celular"] || "").trim();
              const email = String(row["E-mail"] || row["e-mail"] || row["Correo"] || row["Email"] || "").trim();
              const direccion = String(row["Dirección"] || row["Direccion"] || "").trim();
              const ciudad = String(row["Ciudad"] || "").trim();

              const existingClient = clients.find(c => c.identification === identificacion);
              const existsInDB = !!existingClient;
              let needsUpdate = false;
              const diff: ClientDiff = {};

              if (existingClient) {
                const oldContact = existingClient.contact || "";
                const oldEmail = existingClient.email || "";

                const addressParts = existingClient.address?.split(',').map(part => part.trim()) || [];
                let oldDireccion = "";
                let oldCiudad = "";
                if (addressParts.length > 1) {
                    oldCiudad = addressParts.pop() || "";
                    oldDireccion = addressParts.join(', ');
                } else {
                    oldDireccion = existingClient.address || "";
                }

                if (telefono && telefono !== oldContact) {
                    needsUpdate = true;
                    diff.telefono = { old: oldContact, new: telefono };
                }
                if (email && email !== oldEmail) {
                    needsUpdate = true;
                    diff.email = { old: oldEmail, new: email };
                }
                if (direccion && direccion !== oldDireccion) {
                    needsUpdate = true;
                    diff.direccion = { old: oldDireccion, new: direccion };
                }
                if (ciudad && ciudad !== oldCiudad) {
                    needsUpdate = true;
                    diff.ciudad = { old: oldCiudad, new: ciudad };
                }
              }

              const isVIP = telefono.length >= 7 && email.includes('@') && direccion.length > 0 && ciudad.length > 0;
              
              return { 
                  id: `temp-cli-${index}-${Date.now()}`, 
                  identificacion, 
                  nombre: nombreCompleto,
                  telefono, email, direccion, ciudad, isVIP, 
                  existsInDB,
                  needsUpdate,
                  dbClient: existingClient,
                  diff 
              } as AnalyzedClient;
          });
      } 
      else if (keys.some(k => k.includes('codigo') || k.includes('saldo actual'))) {
          type = 'products';
          processedItems = data.map((row: any, index) => mapExcelToProduct(row, index));
      }

      if (type) { setAnalysisData({ type, items: processedItems }); setSelectedIds(new Set()); } 
      else { alert("Formato no identificado."); }
      setProcessingStatus('idle');
  };

  const closeAnalysis = () => { 
      setAnalysisData(null); 
      setSelectedIds(new Set()); 
      setFilterVIPOnly(false); 
      setFilterNotAddedOnly(false); 
      setFilterNeedsUpdateOnly(false);
  };

  const displayedItems = useMemo(() => {
      if (!analysisData) return [];
      let items = analysisData.items;
      if (filterVIPOnly && analysisData.type === 'clients') { 
          items = items.filter((i: AnalyzedClient) => i.isVIP && !i.existsInDB); 
      } else if (filterNotAddedOnly && analysisData.type === 'clients') {
          items = items.filter((i: AnalyzedClient) => !i.existsInDB);
      } else if (filterNeedsUpdateOnly && analysisData.type === 'clients') {
          items = items.filter((i: AnalyzedClient) => i.needsUpdate);
      }
      return items;
  }, [analysisData, filterVIPOnly, filterNotAddedOnly, filterNeedsUpdateOnly]);

  const toggleSelection = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
      setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
      if (displayedItems.length === 0) return;
      const allVisibleSelected = displayedItems.every(item => selectedIds.has(item.id));
      const newSet = new Set(selectedIds);
      if (allVisibleSelected) { displayedItems.forEach(item => newSet.delete(item.id)); } 
      else { displayedItems.forEach(item => newSet.add(item.id)); }
      setSelectedIds(newSet);
  };

  const handleUploadSelected = async () => {
    if (!analysisData || selectedIds.size === 0) return;
    setIsUploadingFirebase(true);
    const itemsToUpload = analysisData.items.filter(item => selectedIds.has(item.id));
    const batch = writeBatch(db);
    let newClientsCount = 0;
    let updatedClientsCount = 0;

    try {
        if (analysisData.type === 'clients') {
            const coll = collection(db, 'clients');
            itemsToUpload.forEach((client: AnalyzedClient) => {
                if (client.needsUpdate && client.dbClient?.id) {
                    const ref = doc(db, 'clients', client.dbClient.id);
                    const updatedFields: { [key: string]: any } = {};
                    if (client.diff?.telefono) updatedFields.contact = client.telefono;
                    if (client.diff?.email) updatedFields.email = client.email;
                    if (client.diff?.direccion || client.diff?.ciudad) {
                        const newDir = client.diff?.direccion ? client.direccion : (client.dbClient.address?.split(',')[0]?.trim() || '');
                        const newCity = client.diff?.ciudad ? client.ciudad : (client.dbClient.address?.split(',').length > 1 ? client.dbClient.address.split(',')[1]?.trim() : '');
                        updatedFields.address = [newDir, newCity].filter(Boolean).join(', ');
                    }

                    if (Object.keys(updatedFields).length > 0) {
                        batch.update(ref, updatedFields);
                        updatedClientsCount++;
                    }
                } else if (!client.existsInDB) {
                    const ref = doc(coll);
                    batch.set(ref, { id: ref.id, name: client.nombre, identification: client.identificacion, contact: client.telefono, email: client.email, address: client.direccion ? `${client.direccion}, ${client.ciudad}` : client.ciudad, createdAt: new Date().toISOString() });
                    newClientsCount++;
                }
            });
        } else {
            const coll = collection(db, 'equipment');
            itemsToUpload.forEach((prod: AnalyzedProduct) => {
                const ref = doc(coll);
                batch.set(ref, { id: ref.id, name: prod.descripcion, serialNumber: prod.codigo, description: `Categoría: ${prod.categoria}`, clientId: '', status: 'Activa', voltage: '110V', location: 'Bodega', createdAt: new Date().toISOString(), maintenanceFrequency: 6 });
            });
        }
        
        await batch.commit();

        let successMessage = "Sincronización exitosa.\n";
        if (newClientsCount > 0) successMessage += `${newClientsCount} nuevos clientes agregados.\n`;
        if (updatedClientsCount > 0) successMessage += `${updatedClientsCount} clientes actualizados.\n`;
        if (newClientsCount === 0 && updatedClientsCount === 0 && analysisData.type === 'clients') {
             successMessage = "No se realizaron cambios. Los clientes seleccionados ya estaban sincronizados o no requerían actualización.";
        }


        alert(successMessage);
        closeAnalysis();
    } catch (error) { 
        console.error("Error al guardar en la base de datos:", error);
        alert("Error al guardar en la base de datos."); 
    } finally { 
        setIsUploadingFirebase(false); 
    }
  };


  if (!analysisData) {
      const isProcessing = processingStatus !== 'idle';
      return (
          <div className="pt-8 border-t border-gray-100">
              <button 
                className="w-full bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 py-4 px-4 rounded-2xl shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-3 group disabled:opacity-50 disabled:cursor-wait"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
              >
                {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <FileSpreadsheet size={20} className="text-primary group-hover:scale-110 transition-transform" />}
                <span className="font-bold text-sm uppercase tracking-wide">{isProcessing ? 'Procesando...' : 'Subida de datos (Excel)'}</span>
              </button>
              <input type="file" ref={fileInputRef} onChange={handleExcelUpload} className="hidden" accept=".xlsx, .xls" />
          </div>
      )
  }

  const isProduct = analysisData.type === 'products';
  const items = analysisData.items;
  const allSelected = displayedItems.length > 0 && displayedItems.every(item => selectedIds.has(item.id));
  const totalItems = items.length;
  const criticalItems = isProduct ? items.filter((i: AnalyzedProduct) => i.isLowStock).length : items.filter((i: AnalyzedClient) => i.isVIP).length;
  const notAddedClients = isProduct ? 0 : items.filter((i: AnalyzedClient) => !i.existsInDB).length;
  const clientsToUpdate = isProduct ? 0 : items.filter((i: AnalyzedClient) => i.needsUpdate).length;

  return (
    <div className="fixed inset-0 z-[100] bg-gray-50 flex flex-col animate-in fade-in duration-300">
        <div className="bg-white px-6 py-4 shadow-sm z-20 flex items-center justify-between">
            <div>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2"><Sparkles className="text-primary fill-primary" /> Inteligencia App</h2>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Reporte de {isProduct ? 'Inventario' : 'Base de Clientes'}</p>
            </div>
            <button onClick={closeAnalysis} className="bg-gray-100 text-gray-600 px-4 py-2 rounded-xl text-xs font-bold uppercase hover:bg-gray-200 transition-colors flex items-center gap-2"><XCircle size={16} /> Cerrar</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-28 relative">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 max-w-7xl mx-auto">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100"><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Registros</p><p className="text-3xl font-black text-gray-900 mt-1">{totalItems}</p></div>
                
                <div 
                  onClick={() => { if (!isProduct) { setFilterVIPOnly(!filterVIPOnly); setFilterNotAddedOnly(false); setFilterNeedsUpdateOnly(false); } }} 
                  className={`p-4 rounded-2xl shadow-sm border transition-all relative overflow-hidden group ${!isProduct ? 'cursor-pointer hover:shadow-md active:scale-95' : ''} ${filterVIPOnly ? 'ring-2 ring-yellow-400 ring-offset-2' : ''} ${isProduct ? 'bg-red-50 border-red-100' : 'bg-yellow-50 border-yellow-100'}`}
                >
                    <div className="flex justify-between items-start">
                        <div>
                            <p className={`text-[10px] font-black uppercase tracking-widest ${isProduct ? 'text-red-600' : 'text-yellow-700'}`}>{isProduct ? 'Stock Crítico (<5)' : 'Clientes VIP'}</p>
                            <div className="flex items-center gap-2 mt-1">
                                <p className={`text-3xl font-black ${isProduct ? 'text-red-700' : 'text-yellow-800'}`}>{criticalItems}</p>
                                {isProduct ? <TrendingDown size={24} className="text-red-500" /> : <Crown size={24} className="text-yellow-600 fill-yellow-600" />}
                            </div>
                        </div>
                        {!isProduct && <div className={`p-1.5 rounded-full transition-colors ${filterVIPOnly ? 'bg-yellow-200 text-yellow-800' : 'bg-yellow-100 text-yellow-600'}`}><ListFilter size={16} /></div>}
                    </div>
                </div>

                {!isProduct && (
                  <>
                  <div 
                    onClick={() => { setFilterNotAddedOnly(!filterNotAddedOnly); setFilterVIPOnly(false); setFilterNeedsUpdateOnly(false); }}
                    className={`p-4 rounded-2xl shadow-sm border transition-all relative overflow-hidden group cursor-pointer hover:shadow-md active:scale-95 ${filterNotAddedOnly ? 'ring-2 ring-blue-400 ring-offset-2' : 'bg-blue-50 border-blue-100'}`}
                  >
                      <div className="flex justify-between items-start">
                          <div>
                              <p className='text-[10px] font-black uppercase tracking-widest text-blue-700'>No Agregados</p>
                              <div className="flex items-center gap-2 mt-1">
                                  <p className='text-3xl font-black text-blue-800'>{notAddedClients}</p>
                                  <UserPlus size={24} className="text-blue-600" />
                              </div>
                          </div>
                          <div className={`p-1.5 rounded-full transition-colors ${filterNotAddedOnly ? 'bg-blue-200 text-blue-800' : 'bg-blue-100 text-blue-600'}`}><ListFilter size={16} /></div>
                      </div>
                  </div>
                  <div 
                    onClick={() => { setFilterNeedsUpdateOnly(!filterNeedsUpdateOnly); setFilterNotAddedOnly(false); setFilterVIPOnly(false); }}
                    className={`p-4 rounded-2xl shadow-sm border transition-all relative overflow-hidden group cursor-pointer hover:shadow-md active:scale-95 ${filterNeedsUpdateOnly ? 'ring-2 ring-orange-400 ring-offset-2' : 'bg-orange-50 border-orange-100'}`}
                  >
                      <div className="flex justify-between items-start">
                          <div>
                              <p className='text-[10px] font-black uppercase tracking-widest text-orange-700'>Actualizar Valores</p>
                              <div className="flex items-center gap-2 mt-1">
                                  <p className='text-3xl font-black text-orange-800'>{clientsToUpdate}</p>
                                  <RefreshCw size={22} className="text-orange-600" />
                              </div>
                          </div>
                          <div className={`p-1.5 rounded-full transition-colors ${filterNeedsUpdateOnly ? 'bg-orange-200 text-orange-800' : 'bg-orange-100 text-orange-600'}`}><ListFilter size={16} /></div>
                      </div>
                  </div>
                  </>
                )}
            </div>
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden max-w-7xl mx-auto mb-20">
                <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center sticky top-0 z-10 backdrop-blur-md"><div className="flex items-center gap-2"><h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">{isProduct ? 'Detalle de Productos' : 'Detalle de Clientes'}</h3><span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg">{selectedIds.size} seleccionados</span></div></div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                        <thead>
                            <tr className="text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-white">
                                <th className="p-4 w-12 text-center">
                                    <button onClick={toggleSelectAll} className="text-gray-300 hover:text-primary transition-colors">{allSelected ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} />}</button>
                                </th>
                                <th className="p-4">{isProduct ? 'Referencia' : 'Identificación'}</th>
                                <th className="p-4">{isProduct ? 'Descripción' : 'Nombre'}</th>
                                {!isProduct && (
                                    <>
                                        <th className="p-4">Teléfono</th>
                                        <th className="p-4">Email</th>
                                        <th className="p-4">Dirección</th>
                                    </>
                                )}
                                <th className="p-4 text-right">{isProduct ? 'Inventario' : 'Ciudad'}</th>
                            </tr>
                        </thead>
                        <tbody className="text-[11px] font-medium text-gray-700">
                           {displayedItems.map((item) => { 
                                const isSelected = selectedIds.has(item.id); 
                                const clientItem = item as AnalyzedClient;

                                const getCellClass = (diffField: any) => diffField ? 'bg-orange-100/50' : '';

                                const renderDiff = (diffField: any) => {
                                    if (!diffField) return null;
                                    return (
                                        <div className="absolute top-0 right-2 px-2 py-1 text-[10px] bg-orange-200 text-orange-800 rounded-md opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-lg pointer-events-none">
                                            <span className="font-semibold">Antes:</span> {diffField.old || 'Vacío'}
                                        </div>
                                    );
                                };

                                return (
                                    <tr key={item.id} onClick={() => toggleSelection(item.id)} className={`border-b border-gray-50 transition-colors cursor-pointer group ${isSelected ? 'bg-red-50/30' : 'hover:bg-gray-50'}`}>
                                        <td className="p-4 text-center">
                                            <div className={`${isSelected ? 'text-primary' : 'text-gray-200 group-hover:text-gray-300'}`}>{isSelected ? <CheckSquare size={18} /> : <Square size={18} />}</div>
                                        </td>
                                        <td className="p-4 font-bold text-gray-900">
                                            <div className="flex items-center gap-2">
                                                {clientItem.needsUpdate && <span className="w-2 h-2 rounded-full bg-orange-500" title="Este cliente tiene datos para actualizar"></span>}
                                                {!clientItem.existsInDB && !clientItem.needsUpdate && <span className="w-2 h-2 rounded-full bg-blue-500" title="Este cliente no está en la base de datos"></span>}
                                                {isProduct ? (item as AnalyzedProduct).codigo : clientItem.identificacion}
                                            </div>
                                        </td>
                                        <td className="p-4">{(item as any).nombre || (item as any).descripcion}</td>
                                        {!isProduct && (
                                            <>
                                                <td className={`p-4 relative ${getCellClass(clientItem.diff?.telefono)} ${!clientItem.telefono ? 'text-red-300 italic' : ''}`}>
                                                    {clientItem.telefono || 'Falta'}
                                                    {renderDiff(clientItem.diff?.telefono)}
                                                </td>
                                                <td className={`p-4 relative ${getCellClass(clientItem.diff?.email)} ${!clientItem.email || !clientItem.email.includes('@') ? 'text-red-300 italic' : ''}`}>
                                                    {clientItem.email || 'Falta'}
                                                    {renderDiff(clientItem.diff?.email)}
                                                </td>
                                                <td className={`p-4 relative ${getCellClass(clientItem.diff?.direccion)} ${!clientItem.direccion ? 'text-red-300 italic' : ''}`}>
                                                    {clientItem.direccion || 'Falta'}
                                                    {renderDiff(clientItem.diff?.direccion)}
                                                </td>
                                            </>
                                        )}
                                        <td className={`p-4 text-right font-bold relative ${getCellClass(clientItem.diff?.ciudad)} ${!isProduct && !clientItem.ciudad ? 'text-red-300 italic' : ''}`}>
                                            {(item as any).inventario || clientItem.ciudad || 'Falta'}
                                            {!isProduct && renderDiff(clientItem.diff?.ciudad)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        {selectedIds.size > 0 && (<div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in"><button onClick={handleUploadSelected} disabled={isUploadingFirebase} className="bg-primary text-white pl-6 pr-8 py-4 rounded-full font-black text-xs uppercase tracking-widest shadow-2xl flex items-center gap-4">{(isUploadingFirebase ? <Loader2 size={20} className="animate-spin" /> : <UploadCloud size={18} />)}<span>Sincronizar {selectedIds.size}</span></button></div>)}
    </div>
  );
}

export default IntelligenceEngine;
