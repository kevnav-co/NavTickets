
import { useState, useEffect, useRef } from 'react';

// SOLUCIÓN DEFINITIVA: Se corrige la firma del evento onend, que también recibe un argumento de evento 
// (aunque no se utilice), alineando la interfaz con la implementación real del navegador.
interface CustomSpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    onresult: ((event: any) => void) | null;
    onerror: ((event: any) => void) | null;
    onend: ((event: any) => void) | null;
}

/**
 * Hook personalizado para manejar el reconocimiento de voz del navegador.
 * @returns Un objeto con el estado de la escucha, la transcripción, funciones para iniciar/detener
 * y una bandera que indica si el navegador es compatible.
 */
export const useSpeechRecognition = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<CustomSpeechRecognition | null>(null);

  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      console.warn('El API de Speech Recognition no es compatible con este navegador.');
      return;
    }

    const recognition: CustomSpeechRecognition = new SpeechRecognitionAPI();
    recognition.continuous = true; 
    recognition.interimResults = true;
    recognition.lang = 'es-ES'; 

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcriptPiece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptPiece;
        } else {
          interimTranscript += transcriptPiece;
        }
      }
      setTranscript(finalTranscript + interimTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error('Error en el reconocimiento de voz:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, []);

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      try {
        setTranscript(''); 
        recognitionRef.current.start();
        setIsListening(true);
      } catch (error) {
        console.error('No se pudo iniciar el reconocimiento de voz:', error);
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const hasRecognitionSupport = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    hasRecognitionSupport,
  };
};
