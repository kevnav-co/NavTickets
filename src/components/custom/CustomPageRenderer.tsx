// src/components/custom/CustomPageRenderer.tsx
// Renders a custom tab based on its type: built-in, iframe, markdown, or external.

import React, { Suspense, useState } from 'react';
import { TabConfig } from '../../types/company';
import { getBuiltInComponent } from './ComponentRegistry';
import { LoadingFallback } from '../ui/LoadingFallback';
import { ExternalLink, AlertTriangle, RefreshCw } from 'lucide-react';
import { safeUrl } from '../../utils/html';
import { renderSimpleMarkdown } from '../../utils/markdown';

const InvalidUrl: React.FC = () => (
  <div className="flex items-center justify-center h-full min-h-[50vh] p-8">
    <div className="text-center">
      <AlertTriangle size={48} className="mx-auto mb-4 text-ink-faint" />
      <h2 className="text-lg font-bold text-ink-soft">URL no válida</h2>
      <p className="text-sm text-ink-faint mt-1">Solo se permiten direcciones https://.</p>
    </div>
  </div>
);

interface CustomPageRendererProps {
  tab: TabConfig;
}

const CustomPageRenderer: React.FC<CustomPageRendererProps> = ({ tab }) => {
  const [iframeError, setIframeError] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  switch (tab.type) {
    case 'built-in': {
      const Component = tab.builtInComponent ? getBuiltInComponent(tab.builtInComponent) : null;
      if (!Component) {
        return (
          <div className="flex items-center justify-center h-full min-h-[50vh] p-8">
            <div className="text-center">
              <AlertTriangle size={48} className="mx-auto mb-4 text-ink-faint" />
              <h2 className="text-lg font-bold text-ink-soft">Componente no encontrado</h2>
              <p className="text-sm text-ink-faint mt-1">
                "{tab.builtInComponent}" no está registrado en el sistema.
              </p>
            </div>
          </div>
        );
      }
      return (
        <Suspense fallback={<LoadingFallback />}>
          <Component />
        </Suspense>
      );
    }

    case 'iframe': {
      if (!tab.content) {
        return (
          <div className="flex items-center justify-center h-full min-h-[50vh] p-8">
            <div className="text-center">
              <AlertTriangle size={48} className="mx-auto mb-4 text-ink-faint" />
              <h2 className="text-lg font-bold text-ink-soft">URL no configurada</h2>
              <p className="text-sm text-ink-faint mt-1">Este tab iframe no tiene una URL configurada.</p>
            </div>
          </div>
        );
      }

      if (iframeError) {
        return (
          <div className="flex items-center justify-center h-full min-h-[50vh] p-8">
            <div className="text-center">
              <AlertTriangle size={48} className="mx-auto mb-4 text-orange-300" />
              <h2 className="text-lg font-bold text-ink-soft">Error al cargar</h2>
              <p className="text-sm text-ink-faint mt-1 mb-4">No se pudo cargar el contenido en: {tab.content}</p>
              <button
                onClick={() => { setIframeError(false); setIframeKey(k => k + 1); }}
                className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-bold text-sm"
              >
                <RefreshCw size={16} /> Reintentar
              </button>
            </div>
          </div>
        );
      }

      const iframeSrc = safeUrl(tab.content, ['https:']);
      if (!iframeSrc) return <InvalidUrl />;
      // allow-scripts + allow-same-origin sobre una URL de nuestro propio origen anularía el sandbox.
      const sameOrigin = new URL(iframeSrc).origin === window.location.origin;

      return (
        <div className="w-full h-full min-h-[80vh]">
          <iframe
            key={iframeKey}
            src={iframeSrc}
            className="w-full h-full border-0 rounded-lg"
            title={tab.label}
            sandbox={sameOrigin ? 'allow-scripts allow-forms allow-popups' : 'allow-scripts allow-same-origin allow-forms allow-popups'}
            referrerPolicy="no-referrer"
            onError={() => setIframeError(true)}
            style={{ minHeight: '80vh' }}
          />
        </div>
      );
    }

    case 'markdown': {
      if (!tab.content) {
        return (
          <div className="flex items-center justify-center h-full min-h-[50vh] p-8">
            <div className="text-center text-ink-faint">
              <p>Sin contenido</p>
            </div>
          </div>
        );
      }

      // Simple markdown rendering — convert basic markdown to HTML
      const html = renderSimpleMarkdown(tab.content);
      return (
        <div className="p-6 max-w-4xl mx-auto">
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      );
    }

    case 'external': {
      if (!tab.content) {
        return (
          <div className="flex items-center justify-center h-full min-h-[30vh] p-8">
            <div className="text-center">
              <AlertTriangle size={48} className="mx-auto mb-4 text-ink-faint" />
              <h2 className="text-lg font-bold text-ink-soft">URL no configurada</h2>
            </div>
          </div>
        );
      }

      const externalHref = safeUrl(tab.content, ['https:']);
      if (!externalHref) return <InvalidUrl />;

      return (
        <div className="flex items-center justify-center h-full min-h-[30vh] p-8">
          <div className="text-center">
            <ExternalLink size={48} className="mx-auto mb-4 text-primary/60" />
            <h2 className="text-lg font-bold text-ink-soft mb-2">{tab.label}</h2>
            <p className="text-sm text-ink-soft mb-6 break-all">{tab.content}</p>
            <a
              href={externalHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-primary text-white px-8 py-4 rounded-2xl font-bold text-sm uppercase tracking-wider shadow-lg hover:opacity-90 active:scale-95 transition-all"
            >
              <ExternalLink size={18} />
              Abrir en nueva pestaña
            </a>
          </div>
        </div>
      );
    }

    default:
      return (
        <div className="flex items-center justify-center h-full min-h-[50vh] p-8">
          <div className="text-center">
            <AlertTriangle size={48} className="mx-auto mb-4 text-ink-faint" />
            <h2 className="text-lg font-bold text-ink-soft">Tipo de tab desconocido</h2>
            <p className="text-sm text-ink-faint mt-1">"{tab.type}" no es un tipo de tab soportado.</p>
          </div>
        </div>
      );
  }
};

export default CustomPageRenderer;