
import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

// --- TYPES ---
interface ModalInstance {
  name: string;
  data?: any;
}

interface ModalContextType {
  isModalOpen: (modalName: string) => boolean;
  openModal: <T = any>(modalName: string, data?: T) => void;
  closeModal: (modalName?: string) => void;
  getModalData: <T = any>(modalName: string) => T | null;
  modalData: any; // CORRECCIÓN: Añadido para acceso directo a los datos del modal activo.
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

// --- PROVIDER ---
interface ModalProviderProps {
  children: ReactNode;
}

export const ModalProvider: React.FC<ModalProviderProps> = ({ children }) => {
  const [modalStack, setModalStack] = useState<ModalInstance[]>([]);

  const openModal = useCallback(<T = any>(modalName: string, data?: T) => {
    setModalStack(stack => [...stack, { name: modalName, data }]);
  }, []);

  const closeModal = useCallback((modalName?: string) => {
    if (modalName) {
      setModalStack(stack => {
        const newStack = [...stack];
        const modalIndex = newStack.findIndex(m => m.name === modalName);
        if (modalIndex > -1) {
          return newStack.slice(0, modalIndex);
        }
        return stack;
      });
    } else {
      setModalStack(stack => stack.slice(0, -1));
    }
  }, []);

  const isModalOpen = useCallback((modalName: string) => {
    return modalStack.some(m => m.name === modalName);
  }, [modalStack]);

  const getModalData = useCallback(<T = any>(modalName: string): T | null => {
    const modal = modalStack.find(m => m.name === modalName);
    return modal?.data as T || null;
  }, [modalStack]);

  // CORRECCIÓN: Se obtiene el modal activo para exponer sus datos.
  const activeModal = modalStack.length > 0 ? modalStack[modalStack.length - 1] : null;

  const value = {
    isModalOpen,
    openModal,
    closeModal,
    getModalData,
    modalData: activeModal ? activeModal.data : null,
  };

  return (
    <ModalContext.Provider value={value}>{children}</ModalContext.Provider>
  );
};

// --- HOOK ---
export const useModal = (): ModalContextType => {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};
