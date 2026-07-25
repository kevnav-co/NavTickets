
import React, { useRef, useEffect, useState } from 'react';
import { X, PenTool, Eraser, CheckCircle2, Upload } from 'lucide-react';
import { validateFile } from '../../utils/index';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: string) => void;
  title: string;
}

const SignatureModal: React.FC<SignatureModalProps> = ({ isOpen, onClose, onSave, title }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setTimeout(() => {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = canvas.offsetWidth;
          canvas.height = canvas.offsetHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#000000';
          }
        }
      }, 100);
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => { document.body.style.overflow = 'auto'; };
  }, [isOpen]);

  if (!isOpen) return null;

  const getPos = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: any) => { e.preventDefault(); setIsDrawing(true); const { x, y } = getPos(e); const ctx = canvasRef.current?.getContext('2d'); ctx?.beginPath(); ctx?.moveTo(x, y); };
  const draw = (e: any) => { if (!isDrawing) return; e.preventDefault(); const { x, y } = getPos(e); const ctx = canvasRef.current?.getContext('2d'); ctx?.lineTo(x, y); ctx?.stroke(); setHasSignature(true); };
  const stopDrawing = () => setIsDrawing(false);
  const clear = () => { const canvas = canvasRef.current; const ctx = canvas?.getContext('2d'); if (canvas && ctx) { ctx.clearRect(0, 0, canvas.width, canvas.height); setHasSignature(false); } };
  
  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
    
    // Encuentra los límites de la firma
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const alpha = data[(y * canvas.width + x) * 4 + 3];
        if (alpha > 0) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    // Si el lienzo está vacío, no hacer nada
    if (minX > maxX || minY > maxY) {
      onClose();
      return;
    }

    // Agrega un padding alrededor de la firma
    const padding = 20;
    const cropWidth = maxX - minX + padding * 2;
    const cropHeight = maxY - minY + padding * 2;

    // Crea un nuevo lienzo para la firma recortada
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = cropWidth;
    croppedCanvas.height = cropHeight;
    const croppedCtx = croppedCanvas.getContext('2d');

    if (!croppedCtx) return;

    // Dibuja la firma recortada en el nuevo lienzo
    croppedCtx.drawImage(
      canvas,
      minX - padding, // Coordenada X de inicio del recorte
      minY - padding, // Coordenada Y de inicio del recorte
      cropWidth,      // Ancho del recorte
      cropHeight,     // Alto del recorte
      0,              // Coordenada X de destino en el nuevo lienzo
      0,              // Coordenada Y de destino en el nuevo lienzo
      cropWidth,      // Ancho de destino en el nuevo lienzo
      cropHeight      // Alto de destino en el nuevo lienzo
    );

    // Obtiene la URL de la imagen de la firma recortada
    const dataUrl = croppedCanvas.toDataURL('image/png');
    if (dataUrl) {
      onSave(dataUrl);
    }
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!validateFile(file, 'image')) { e.target.value = ''; return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext('2d');
          if (canvas && ctx) {
            clear();
            const scale = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.8;
            const w = img.width * scale; const h = img.height * scale;
            const x = (canvas.width - w) / 2; const y = (canvas.height - h) / 2;
            ctx.drawImage(img, x, y, w, h);
            setHasSignature(true);
          }
        };
        img.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 h-[80vh] md:h-auto">
        <header className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div>
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">{title}</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Firma digital o adjunta imagen</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors text-gray-400"><X size={20} /></button>
        </header>
        <div className="flex-1 bg-white relative touch-none cursor-crosshair">
          <canvas ref={canvasRef} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} className="w-full h-full min-h-[350px] bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:24px_24px]"/>
          {!hasSignature && (<div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-gray-200 select-none"> <PenTool size={64} className="mb-4 opacity-10" /> <span className="text-xs font-black uppercase tracking-[0.3em] opacity-20">Dibujar Firma Aquí</span> </div>)}
          <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute bottom-6 right-6 bg-white/90 backdrop-blur-sm border border-gray-200 p-4 rounded-2xl shadow-xl text-gray-500 hover:text-primary transition-all active:scale-90"> <Upload size={24} /> </button>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
        </div>
        <footer className="p-6 grid grid-cols-2 gap-4 bg-gray-50/50 border-t border-gray-100">
          <button type="button" onClick={clear} className="flex items-center justify-center gap-2 py-4 bg-white border border-gray-200 text-gray-500 rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"> <Eraser size={16} /> Limpiar </button>
          <button type="button" onClick={handleSave} disabled={!hasSignature} className={`flex items-center justify-center gap-2 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg ${hasSignature ? 'bg-primary text-white active:scale-95' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}> <CheckCircle2 size={16} /> Guardar Firma </button>
        </footer>
      </div>
    </div>
  );
};

export default SignatureModal;
