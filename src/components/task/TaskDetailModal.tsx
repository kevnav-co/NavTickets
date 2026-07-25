
import React, { useState, useEffect, useRef } from 'react';
import { 
  Check, Trash2, ChevronDown, 
  Bell, Calendar, Repeat, X, UserPlus,
  BellOff, CalendarOff, Loader2, Users, Clock, CalendarClock,
  CalendarRange, Save, Lock
} from 'lucide-react';
import { Task, User } from '../../types';
import TextareaAutosize from 'react-textarea-autosize';
import { useLocalStorage } from '../../hooks/useLocalStorage';

const getReminderDate = (type: 'later' | 'tomorrow' | 'next-week') => {
    const now = new Date();
    if (type === 'later') {
       now.setHours(21, 0, 0, 0);
       if (now.getTime() <= Date.now()) now.setHours(now.getHours() + 1);
       return now;
    }
    if (type === 'tomorrow') {
       const d = new Date();
       d.setDate(d.getDate() + 1);
       d.setHours(9, 0, 0, 0);
       return d;
    }
    if (type === 'next-week') {
       const d = new Date();
       const diff = d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1) + 7; 
       d.setDate(diff);
       d.setHours(9, 0, 0, 0);
       return d;
    }
    return now;
};

const getDueDate = (type: 'today' | 'tomorrow' | 'next-week') => {
    const now = new Date();
    if (type === 'today') return now;
    if (type === 'tomorrow') {
       const d = new Date();
       d.setDate(d.getDate() + 1);
       return d;
    }
    if (type === 'next-week') {
       const d = new Date();
       const diff = d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1) + 7; 
       d.setDate(diff);
       return d;
    }
    return now;
};

const getDayName = (date: Date) => date.toLocaleDateString('es-ES', { weekday: 'short' });

export const TaskDetailModal = ({ 
  task, 
  onClose, 
  onUpdate, 
  onDelete,
  users,
  currentUser
}: { 
  task: Task | null, 
  onClose: () => void, 
  onUpdate: (id: string, data: Partial<Task>) => void,
  onDelete: (id: string) => void,
  users: User[],
  currentUser: User | null
}) => {
  if (!task || !users || !currentUser) return null;

  const localStorageKey = `task-detail-${task.id}`;
  const [localTask, setLocalTask] = useLocalStorage<Partial<Task>>(localStorageKey, task);

  const [isSaving, setIsSaving] = useState(false);
  const [showReminderMenu, setShowReminderMenu] = useState(false);
  const [showDueDateMenu, setShowDueDateMenu] = useState(false);
  const [showRepeatMenu, setShowRepeatMenu] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const reminderMenuRef = useRef<HTMLDivElement>(null);
  const dueDateMenuRef = useRef<HTMLDivElement>(null);
  const repeatMenuRef = useRef<HTMLDivElement>(null);
  const customDateInputRef = useRef<HTMLInputElement>(null);
  const customDueDateInputRef = useRef<HTMLInputElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // When the modal is opened for a different task, reset the `hasChanges` flag.
    setHasChanges(false);
  }, [task.id]);

  const updateLocalTask = (data: Partial<Task>) => {
      setLocalTask(prev => ({...prev, ...data}));
      if (!hasChanges) setHasChanges(true);
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalContentRef.current && !modalContentRef.current.contains(event.target as Node)) {
        if (showReminderMenu || showDueDateMenu || showRepeatMenu) {
            setShowReminderMenu(false);
            setShowDueDateMenu(false);
            setShowRepeatMenu(false);
        } else {
            onClose();
        }
      } else {
        if (reminderMenuRef.current && !reminderMenuRef.current.contains(event.target as Node)) setShowReminderMenu(false);
        if (dueDateMenuRef.current && !dueDateMenuRef.current.contains(event.target as Node)) setShowDueDateMenu(false);
        if (repeatMenuRef.current && !repeatMenuRef.current.contains(event.target as Node)) setShowRepeatMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose, showReminderMenu, showDueDateMenu, showRepeatMenu]);

  const isCreator = currentUser.id === task.createdBy;
  const isAssignee = currentUser.id === task.assignedTo;
  const canEditMainFields = isCreator;
  const canCompleteTask = isCreator || isAssignee;
  const canEditNote = isCreator || isAssignee;
  
  const handleSaveChanges = async () => {
      if (!task.id || !hasChanges) return;
      setIsSaving(true);
      await onUpdate(task.id, localTask);
      window.localStorage.removeItem(localStorageKey);
      setIsSaving(false);
      setHasChanges(false);
      onClose();
  }

  const handleAssignUser = (userId: string) => {
    if (!canEditMainFields) return;
    const creator = task.createdBy || currentUser?.id || '';
    let newParticipants: string[] = [];

    if (userId === 'ALL') {
        const allTechs = users.filter(u => u.role === 'technician' || u.role === 'admin').map(u => u.id);
        newParticipants = Array.from(new Set([...allTechs, creator]));
    } else {
        const newAssignee = userId || '';
        newParticipants = Array.from(new Set([creator, newAssignee].filter(Boolean)));
    }
    
    updateLocalTask({ assignedTo: userId, participants: newParticipants });
  };

  const handleSetReminder = (date: Date | null) => {
      if (!canEditMainFields) return;
      updateLocalTask({ 
          reminder: date ? date.toISOString() : undefined, 
          reminderNotificationSent: false 
      });
      setShowReminderMenu(false);
  };

  const handleCustomDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.value) handleSetReminder(new Date(e.target.value));
  };

  const handleSetDueDate = (date: Date | null) => {
      if (!canEditMainFields) return;
      if (date) {
        date.setHours(23, 59, 59, 999);
        updateLocalTask({ 
            dueDate: date.toISOString(),
            dueDateNotificationSent: false
        });
      } else {
        updateLocalTask({ 
            dueDate: undefined,
            dueDateNotificationSent: false
        });
      }
      setShowDueDateMenu(false);
  };

  const handleCustomDueDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.value) {
          const [y, m, d] = e.target.value.split('-').map(Number);
          handleSetDueDate(new Date(y, m - 1, d));
      }
  };

  const handleSetRepeat = (value: string | null) => {
      if (!canEditMainFields) return;
      updateLocalTask({ repeat: value || undefined });
      setShowRepeatMenu(false);
  };

  const getNextDayShort = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString('es-ES', { weekday: 'short' });
  };

  const confirmDelete = () => {
      if (!canEditMainFields) return;
      if (window.confirm("¿Seguro que quieres eliminar esta tarea?")) {
          onDelete(task.id);
          window.localStorage.removeItem(localStorageKey);
          onClose();
      }
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-start md:items-center justify-center px-4 pt-8 pb-20 md:p-6 animate-in fade-in">
      <div ref={modalContentRef} className="bg-gray-50 rounded-3xl shadow-2xl w-full max-w-lg max-h-full flex flex-col border border-gray-200/80">
        <div className="bg-white p-5 flex items-start gap-4 border-b border-gray-100 rounded-t-3xl">
           <button 
              onClick={() => canCompleteTask && updateLocalTask({ completed: !localTask.completed })}
              disabled={!canCompleteTask}
              className={`mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0 ${localTask.completed ? 'bg-[#7b1113] border-[#7b1113] text-white' : 'border-gray-400'} ${canCompleteTask ? 'hover:border-[#7b1113]' : 'cursor-not-allowed'}`}
           >
              {localTask.completed && <Check size={14} strokeWidth={3} />}
           </button>
           <div className="flex-1 pt-0.5">
               <TextareaAutosize 
                value={localTask.title || ''}
                onChange={(e) => updateLocalTask({ title: e.target.value })}
                placeholder="Nombre de la tarea"
                disabled={!canEditMainFields}
                className={`w-full bg-transparent text-lg font-bold outline-none resize-none overflow-hidden ${localTask.completed ? 'line-through text-gray-400' : 'text-gray-900'} ${!canEditMainFields ? 'text-gray-500 cursor-not-allowed' : ''}`}
                maxRows={5}
              />
           </div>
           <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full">
              <X size={20} />
           </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
           {!canEditMainFields && !isAssignee && (
             <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs font-medium p-3 rounded-lg flex items-center gap-3">
                <Lock size={16}/>
                <span>Solo el creador o el asignado pueden editar esta tarea.</span>
             </div>
           )}
           <div className={`bg-white rounded-xl border border-gray-200 shadow-sm relative ${!canEditMainFields ? 'opacity-70' : ''}`}>
              <div className="relative" ref={reminderMenuRef}>
                <button onClick={() => canEditMainFields && setShowReminderMenu(!showReminderMenu)} disabled={!canEditMainFields} className={`w-full flex items-center gap-4 p-4 text-left text-gray-600 rounded-t-xl ${canEditMainFields ? 'hover:bg-gray-50' : 'cursor-not-allowed'}`}>
                    <Bell size={20} className={localTask.reminder ? "text-[#7b1113]" : "text-gray-400"} />
                    <div className="flex flex-col items-start">
                        <span className="text-sm font-medium">Recordarme</span>
                        {localTask.reminder && <span className="text-[10px] text-[#7b1113] font-bold">{new Date(localTask.reminder).toLocaleString()}</span>}
                    </div>
                </button>
                {showReminderMenu && (
                    <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-lg shadow-2xl border border-gray-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 origin-top-left">
                       <div className="py-2.5 border-b border-gray-100 text-center text-xs font-bold text-gray-700 select-none">Aviso</div>
                        <div className="py-1">
                            {localTask.reminder && <button onClick={() => handleSetReminder(null)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 text-sm text-red-600 group border-b border-gray-50"><BellOff size={16} /><span>Quitar</span></button>}
                            <button onClick={() => handleSetReminder(getReminderDate('later'))} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-sm text-gray-700 group"><div className="flex items-center gap-3"><Clock size={16} className="text-gray-400 group-hover:text-[#7b1113]" /><span>Más tarde</span></div><span className="text-gray-400 text-xs">21:00</span></button>
                            <button onClick={() => handleSetReminder(getReminderDate('tomorrow'))} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-sm text-gray-700 group"><div className="flex items-center gap-3"><Clock size={16} className="text-gray-400 group-hover:text-[#7b1113]" /><span>Mañana</span></div><span className="text-gray-400 text-xs">{getNextDayShort()}, 9:00</span></button>
                            <button onClick={() => handleSetReminder(getReminderDate('next-week'))} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-sm text-gray-700 group"><div className="flex items-center gap-3"><Clock size={16} className="text-gray-400 group-hover:text-[#7b1113]" /><span>Próx. Semana</span></div><span className="text-gray-400 text-xs">lun., 9:00</span></button>
                            <div className="h-px bg-gray-100 my-1 mx-2"></div>
                            <button onClick={() => customDateInputRef.current?.showPicker()} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-sm text-gray-700 group"><div className="flex items-center gap-3"><CalendarClock size={16} className="text-gray-400 group-hover:text-[#7b1113]" /><span>Elegir fecha</span></div></button>
                            <input type="datetime-local" ref={customDateInputRef} onChange={handleCustomDateChange} className="invisible absolute h-0 w-0" />
                        </div>
                    </div>
                )}
              </div>
              <div className="h-px bg-gray-100 mx-4"></div>
              <div className="relative" ref={dueDateMenuRef}>
                  <button onClick={() => canEditMainFields && setShowDueDateMenu(!showDueDateMenu)} disabled={!canEditMainFields} className={`w-full flex items-center gap-4 p-4 text-left text-gray-600 ${canEditMainFields ? 'hover:bg-gray-50' : 'cursor-not-allowed'}`}>
                     <Calendar size={20} className={localTask.dueDate ? "text-[#7b1113]" : "text-gray-400"} /><div className="flex flex-col items-start"><span className="text-sm font-medium">Vencimiento</span>{localTask.dueDate && <span className="text-[10px] text-[#7b1113] font-bold">{new Date(localTask.dueDate).toLocaleDateString()}</span>}</div>
                  </button>
                  {showDueDateMenu && (
                    <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-lg shadow-2xl border border-gray-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 origin-top-left">
                        <div className="py-2.5 border-b border-gray-100 text-center text-xs font-bold text-gray-700">Vencimiento</div>
                        <div className="py-1">
                            {localTask.dueDate && <button onClick={() => handleSetDueDate(null)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 text-sm text-red-600 group border-b border-gray-50"><CalendarOff size={16} /><span>Quitar</span></button>}
                            <button onClick={() => handleSetDueDate(getDueDate('today'))} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-sm text-gray-700 group"><div className="flex items-center gap-3"><Calendar size={16} className="text-gray-400 group-hover:text-[#7b1113]" /><span>Hoy</span></div><span className="text-gray-400 text-xs">{getDayName(getDueDate('today'))}</span></button>
                            <button onClick={() => handleSetDueDate(getDueDate('tomorrow'))} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-sm text-gray-700 group"><div className="flex items-center gap-3"><Calendar size={16} className="text-gray-400 group-hover:text-[#7b1113]" /><span>Mañana</span></div><span className="text-gray-400 text-xs">{getDayName(getDueDate('tomorrow'))}</span></button>
                            <button onClick={() => handleSetDueDate(getDueDate('next-week'))} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-sm text-gray-700 group"><div className="flex items-center gap-3"><Calendar size={16} className="text-gray-400 group-hover:text-[#7b1113]" /><span>Próx. Semana</span></div><span className="text-gray-400 text-xs">{getDayName(getDueDate('next-week'))}</span></button>
                            <div className="h-px bg-gray-100 my-1 mx-2"></div>
                            <button onClick={() => customDueDateInputRef.current?.showPicker()} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-sm text-gray-700 group"><div className="flex items-center gap-3"><CalendarClock size={16} className="text-gray-400 group-hover:text-[#7b1113]" /><span>Elegir fecha</span></div></button>
                            <input type="date" ref={customDueDateInputRef} onChange={handleCustomDueDateChange} className="invisible absolute h-0 w-0" />
                        </div>
                    </div>
                  )}
              </div>
              <div className="h-px bg-gray-100 mx-4"></div>
              <div className="relative" ref={repeatMenuRef}>
                  <button onClick={() => canEditMainFields && setShowRepeatMenu(!showRepeatMenu)} disabled={!canEditMainFields} className={`w-full flex items-center gap-4 p-4 text-left text-gray-600 rounded-b-xl ${canEditMainFields ? 'hover:bg-gray-50' : 'cursor-not-allowed'}`}>
                     <Repeat size={20} className={localTask.repeat ? "text-[#7b1113]" : "text-gray-400"} /><div className="flex flex-col items-start"><span className="text-sm font-medium">Repetir</span>{localTask.repeat && <span className="text-[10px] text-[#7b1113] font-bold">{localTask.repeat}</span>}</div>
                  </button>
                  {showRepeatMenu && (
                    <div className="absolute top-full left-0 mb-1 w-72 bg-white rounded-lg shadow-2xl border border-gray-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 origin-bottom-left">
                        <div className="py-2.5 border-b border-gray-100 text-center text-xs font-bold text-gray-700">Repetir</div>
                        <div className="py-1">
                            {localTask.repeat && <button onClick={() => handleSetRepeat(null)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 text-sm text-red-600 group border-b border-gray-50"><X size={16} /><span>No repetir</span></button>}
                            {['Diariamente', 'Días laborables', 'Semanalmente', 'Mensualmente', 'Anualmente'].map(opt => <button key={opt} onClick={() => handleSetRepeat(opt)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-sm text-gray-700 group"><CalendarRange size={16} className="text-gray-400 group-hover:text-[#7b1113]" /><span>{opt}</span></button>)}
                        </div>
                    </div>
                  )}
              </div>
           </div>

           <div className={`bg-white rounded-xl border border-gray-200 shadow-sm relative ${!canEditMainFields ? 'opacity-70' : ''}`}>
              <div className={`w-full flex items-center gap-4 p-4 text-left text-gray-600 relative group rounded-xl ${!canEditMainFields ? 'cursor-not-allowed' : ''}`}>
                 {localTask.assignedTo === 'ALL' ? <Users size={20} className="text-[#7b1113]" /> : <UserPlus size={20} className="text-gray-400" />}
                 <div className="flex-1">
                    <select value={localTask.assignedTo || ''} onChange={(e) => handleAssignUser(e.target.value)} disabled={!canEditMainFields} className="w-full bg-transparent text-sm font-medium focus:outline-none appearance-none cursor-pointer text-gray-700 disabled:cursor-not-allowed">
                        <option value={currentUser?.id}>Asignarme a mí</option>
                        <option value="ALL">Todos los Técnicos</option>
                        {users.filter(u => u.id !== currentUser?.id).map(user => <option key={user.id} value={user.id}>Asignar a {user.name}</option>)}
                    </select>
                 </div>
                 <ChevronDown size={16} className="text-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
           </div>
           <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden h-40 flex flex-col">
              <TextareaAutosize 
                value={localTask.note || ''} 
                onChange={(e) => updateLocalTask({ note: e.target.value })} 
                placeholder="Agregar nota..." 
                disabled={!canEditNote}
                className={`flex-1 p-4 w-full resize-none outline-none text-sm text-gray-700 placeholder:text-gray-400 disabled:bg-gray-50 disabled:cursor-not-allowed`}
                minRows={4} 
              />
           </div>
        </div>
        <div className="bg-white border-t border-gray-200 p-4 flex items-center justify-between rounded-b-3xl">
           <span className="text-xs text-gray-400 font-medium">Creado {new Date(task.createdAt).toLocaleDateString()}</span>
           
           <div className="flex items-center gap-2">
                {hasChanges && (
                   <button 
                     onClick={handleSaveChanges}
                     disabled={isSaving}
                     className="flex items-center justify-center gap-2 bg-[#7b1113] text-white px-4 py-2.5 rounded-xl font-bold active:scale-95 transition-all shadow-sm disabled:opacity-50 text-sm"
                    >
                       {isSaving ? <Loader2 size={18} className="animate-spin"/> : <Save size={18} />}
                       <span>Guardar</span>
                   </button>
                )}
               {canEditMainFields && (
                 <button onClick={confirmDelete} className="p-2.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg">
                     <Trash2 size={20} />
                 </button>
               )}
           </div>
        </div>
      </div>
    </div>
  );
};
