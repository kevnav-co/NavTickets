
import { X } from 'lucide-react';

interface ImageModalProps {
  imageUrl: string;
  onClose: () => void;
}

const ImageModal = ({ imageUrl, onClose }: ImageModalProps) => {
  if (!imageUrl) return null;

  // Maneja el clic en el fondo para cerrar el modal.
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Nos aseguramos de que el clic sea en el fondo y no en la imagen misma.
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 animate-in fade-in z-[999]"
      onClick={handleBackdropClick}
      aria-modal="true"
      role="dialog"
    >
      <div className="relative w-full max-w-4xl h-full max-h-[90vh] flex items-center justify-center">
        <img 
          src={imageUrl} 
          alt="Vista ampliada" 
          className="block max-w-full max-h-full object-contain rounded-lg shadow-2xl"
        />
        {/* El botón de cerrar es independiente y siempre visible sobre la imagen */}
        <button 
          onClick={onClose}
          className="absolute top-2 right-2 bg-white/20 backdrop-blur-sm text-white rounded-full p-3 hover:scale-110 hover:bg-white/30 transition-all shadow-lg"
          aria-label="Cerrar imagen"
        >
          <X size={24} />
        </button>
      </div>
    </div>
  );
};

export default ImageModal;
