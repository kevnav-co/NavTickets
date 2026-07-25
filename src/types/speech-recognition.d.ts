// src/types/speech-recognition.d.ts

// Defino la interfaz para que TypeScript entienda el API de SpeechRecognition,
// que puede tener prefijos como `webkit` en algunos navegadores.
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((this: SpeechRecognition, ev: any) => any) | null;
  onerror: ((this: SpeechRecognition, ev: any) => any) | null;
  onend: ((this: SpeechRecognition, ev: any) => any) | null;
}

// Extiendo la interfaz global `Window` para que TypeScript no se queje
// si `SpeechRecognition` no existe en todos los navegadores.
declare global {
  interface Window {
    SpeechRecognition?: { new(): SpeechRecognition };
    webkitSpeechRecognition?: { new(): SpeechRecognition };
  }
}

// Añadimos una exportación vacía para asegurarnos de que el archivo sea tratado como un módulo
// y sus declaraciones globales sean aplicadas.
export {};
