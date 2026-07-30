
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Plus, Check, ChevronDown, ChevronRight, 
  Bell, Calendar, Repeat, X, User as UserIcon, Users, FileText, Search,
  LayoutGrid, LayoutList, Loader2, Mic, MicOff, CalendarDays
} from 'lucide-react';
import { 
  collection, addDoc, query, onSnapshot, 
  updateDoc, deleteDoc, doc, where
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Task } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { TaskDetailModal } from './TaskDetailModal';
import { TaskSchema } from '../../schemas/task.schema';
import { z } from 'zod';

const Tasks: React.FC = () => {
  const { currentUser } = useAuth();
  const { users } = useData();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => window.innerWidth >= 768 ? 'grid' : 'list');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "tasks"), where('participants', 'array-contains', currentUser.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
        tasksData.sort((a, b) => {
            if (a.completed === b.completed) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            return a.completed ? 1 : -1;
        });
        setTasks(tasksData);
    });
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [newTaskTitle]);

  const handleAddTask = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTaskTitle.trim() || !currentUser) return;
      const newTask: Partial<Task> = {
          title: newTaskTitle,
          completed: false,
          important: false,
          createdAt: new Date().toISOString(),
          createdBy: currentUser.id,
          assignedTo: currentUser.id,
          participants: [currentUser.id]
      };
      const result = TaskSchema.omit({ id: true, companyId: true }).safeParse(newTask);
      if (!result.success) {
          console.error("[Validation] Error al crear tarea:", result.error.issues);
          return;
      }
      try {
          await addDoc(collection(db, "tasks"), result.data);
          setNewTaskTitle('');
      } catch (error) {
          console.error("Error adding task: ", error);
      }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Tu navegador no soporta el dictado por voz.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => setNewTaskTitle(prev => (prev + ' ' + event.results[0][0].transcript).trim());
    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleUpdateTask = async (id: string, data: Partial<Task>) => {
      const partialSchema = TaskSchema.partial();
      const result = partialSchema.safeParse(data);
      if (!result.success) {
          console.error("[Validation] Error al actualizar tarea:", result.error.issues);
          return;
      }
      try {
          await updateDoc(doc(db, "tasks", id), result.data);
      } catch (error) {
          console.error("Error updating task: ", error);
      }
  };

  const handleDeleteTask = async (id: string) => {
      try {
          await deleteDoc(doc(db, "tasks", id));
          if (selectedTask?.id === id) setSelectedTask(null);
      } catch (error) {
          console.error("Error deleting task: ", error);
      }
  };

  const filteredTasks = useMemo(() => tasks.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase())), [tasks, searchQuery]);
  const activeTasks = filteredTasks.filter(t => !t.completed);
  const completedTasks = filteredTasks.filter(t => t.completed);
  const hasFilteredTasks = filteredTasks.length > 0;

  useEffect(() => {
    if (searchQuery && activeTasks.length === 0 && completedTasks.length > 0) {
      setShowCompleted(true);
    }
  }, [searchQuery, activeTasks.length, completedTasks.length]);

 const renderTaskItem = (task: Task) => {
    const creator = users.find(user => user.id === task.createdBy);
    const shouldShowCreator = task.createdBy && task.assignedTo && task.createdBy !== task.assignedTo && creator;

    return (
        <div key={task.id} onClick={() => setSelectedTask(task)} className={`group bg-white p-4 rounded-2xl shadow-sm border transition-all cursor-pointer flex items-start gap-4 active:scale-[0.99] ${selectedTask?.id === task.id ? 'border-red-100 ring-1 ring-red-100' : 'border-gray-100 hover:shadow-md'} ${viewMode === 'grid' ? 'masonry-item' : ''}`}>
            <button onClick={(e) => { e.stopPropagation(); handleUpdateTask(task.id, { completed: !task.completed }); }} className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${task.completed ? 'bg-primary border-primary text-white' : 'border-gray-300 hover:border-primary text-transparent hover:bg-red-50'}`}>
                {task.completed && <Check size={14} strokeWidth={3} />}
            </button>
            <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold whitespace-normal break-words transition-colors ${task.completed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{task.title}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-[10px] text-gray-400 font-medium">{new Date(task.createdAt).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}</span>
                    {task.reminder && <div className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded"><Bell size={10} /><span>{new Date(task.reminder).toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</span></div>}
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-1.5">
                    {task.dueDate && <div className={`flex items-center gap-1 text-[10px] font-bold ${new Date(task.dueDate) < new Date() && !task.completed ? 'text-red-500' : 'text-gray-500'}`}><Calendar size={12} /><span>{new Date(task.dueDate).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>}
                    {task.repeat && <div className="flex items-center gap-1 text-[10px] text-gray-500"><Repeat size={12} /><span>{task.repeat}</span></div>}
                    {task.note && <div className="flex items-center gap-1 text-[10px] text-gray-400 max-w-[150px]"><FileText size={12} /><span className="truncate">{task.note}</span></div>}
                    {shouldShowCreator && (
                        <div className="flex items-center gap-1 text-[10px] text-gray-500 font-medium">
                            <span>Por: {creator.name}</span>
                        </div>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2 pl-2">
               {task.assignedTo && task.assignedTo !== 'ALL' && users ? (
                   <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-black border border-blue-100 shadow-sm" title={users.find(u => u.id === task.assignedTo)?.name}>{users.find(u => u.id === task.assignedTo)?.name.charAt(0)}</div>
               ) : task.assignedTo === 'ALL' ? (
                   <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[10px] font-bold border border-gray-200 shadow-sm"><Users size={14} /></div>
               ) : (
                   <div className="w-7 h-7 rounded-full bg-gray-50 text-gray-300 flex items-center justify-center border border-dashed border-gray-200 group-hover:border-gray-300"><UserIcon size={14} /></div>
               )}
            </div>
        </div>
    );
  };

  if (!users || !currentUser) {
      return (
          <div className="flex items-center justify-center h-full">
              <Loader2 className="animate-spin text-gray-300" size={48} />
          </div>
      );
  }

  return (
    <div className="flex h-full relative bg-gray-50/50">
       <div className="flex-1 flex flex-col min-w-0">
          <div className="sticky top-0 z-20 bg-gray-50/90 backdrop-blur-sm">
            <div className="p-6 border-b border-gray-200/80 flex justify-between items-center h-[88px]">
              {isSearchActive ? (
                  <div className="flex-1 flex items-center gap-2 animate-in fade-in duration-200">
                      <Search size={20} className="text-gray-400" />
                      <input autoFocus type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar tareas..." className="flex-1 bg-transparent outline-none text-lg font-medium text-gray-800 placeholder:text-gray-400"/>
                      <button onClick={() => { setIsSearchActive(false); setSearchQuery(''); }} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200"><X size={18} /></button>
                  </div>
              ) : (
                  <>
                      <div>
                          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Mis Tareas</h1>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">{activeTasks.length} PENDIENTES</p>
                      </div>
                      <div className="flex items-center gap-2">
                          <button 
                              onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
                              className="p-3 bg-white border border-gray-200/80 shadow-sm hover:bg-gray-50 rounded-xl text-gray-500 transition-colors"
                              title={viewMode === 'list' ? "Ver como cuadrícula" : "Ver como lista"}
                          >
                              {viewMode === 'list' ? <LayoutGrid size={22} /> : <LayoutList size={22} />}
                          </button>
                          <button onClick={() => setIsSearchActive(true)} className="p-3 bg-white border border-gray-200/80 shadow-sm hover:bg-gray-50 rounded-xl text-gray-500 transition-colors"><Search size={22} /></button>
                      </div>
                  </>
              )}
            </div>
            {!isSearchActive && (
              <div className="px-4 md:px-6 pb-4 pt-2">
                  <form onSubmit={handleAddTask} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1 flex items-start group transition-all focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 relative">
                      <textarea 
                          ref={textareaRef}
                          rows={1}
                          value={newTaskTitle} 
                          onChange={(e) => setNewTaskTitle(e.target.value)} 
                          placeholder={isListening ? "Escuchando..." : "Agregar una tarea"} 
                          className="flex-1 py-4 px-4 outline-none text-gray-800 font-medium placeholder:text-gray-400 bg-transparent text-sm resize-none overflow-hidden"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleAddTask(e);
                            }
                          }}
                       />
                      <button type="button" onClick={toggleListening} className={`p-2.5 rounded-xl mx-1 mt-1.5 transition-all text-white ${isListening ? 'bg-primary animate-pulse' : 'bg-primary'}`} title={isListening ? "Detener" : "Grabar por voz"}>
                          {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                      </button>
                      {newTaskTitle.trim() && !isListening && (
                          <button type="submit" className="mr-1 mt-1.5 bg-primary text-white p-2.5 rounded-xl shadow-md hover:scale-105 active:scale-95 transition-all animate-in zoom-in duration-200" title="Guardar">
                              <Plus size={20} />
                          </button>
                      )}
                  </form>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24">
            {!hasFilteredTasks ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 -mt-16">
                    {searchQuery ? (
                        <>
                            <Search size={32} className="opacity-30 mb-4"/>
                            <p className="text-sm font-medium">No se encontraron tareas con esta búsqueda.</p>
                        </>
                    ) : (
                        <>
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm"><CalendarDays size={24} className="opacity-30" /></div>
                            <p className="text-sm font-medium">No tienes tareas pendientes.</p>
                        </>
                    )}
                </div>
            ) : (
                <div>
                    {activeTasks.length > 0 && (
                        <div className={viewMode === 'grid' ? "masonry-grid" : "space-y-3"}>
                            {activeTasks.map(renderTaskItem)}
                        </div>
                    )}

                    {completedTasks.length > 0 && (
                        <div className="mt-6 border-t border-gray-100 pt-4">
                            <button onClick={() => setShowCompleted(!showCompleted)} className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 p-2 rounded-lg w-full">
                                {showCompleted ? <ChevronDown size={20} /> : <ChevronRight size={20} />}<span>Completado ({completedTasks.length})</span>
                            </button>
                            {showCompleted && 
                                <div className={`mt-3 opacity-60 ${viewMode === 'grid' ? "masonry-grid" : "space-y-3"}`}>
                                    {completedTasks.map(renderTaskItem)}
                                </div>
                            }
                        </div>
                    )}
                </div>
            )}
          </div>
       </div>

       {selectedTask && (
          <TaskDetailModal 
            task={selectedTask} 
            onClose={() => setSelectedTask(null)} 
            onUpdate={handleUpdateTask} 
            onDelete={handleDeleteTask} 
            users={users} 
            currentUser={currentUser}
          />
       )}
    </div>
  );
};

export default Tasks;
