import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  error: Error | null;
}

/** Evita la pantalla en blanco: muestra un aviso con opción de recargar si un componente falla al renderizar. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="min-h-screen flex items-center justify-center p-6 bg-sunken">
        <div className="max-w-md w-full bg-raised rounded-2xl shadow-lg p-8 text-center">
          <AlertTriangle className="mx-auto text-red-500 mb-4" size={48} />
          <h1 className="text-xl font-bold text-ink mb-2">Algo salió mal</h1>
          <p className="text-sm text-ink-soft mb-6">
            La aplicación encontró un error inesperado. Tus datos guardados no se perdieron; recarga para continuar.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-bold text-sm"
          >
            <RefreshCw size={16} /> Recargar
          </button>
        </div>
      </div>
    );
  }
}
