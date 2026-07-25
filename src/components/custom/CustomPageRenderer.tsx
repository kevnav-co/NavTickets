// src/components/custom/CustomPageRenderer.tsx
// Renders a custom tab based on its type: built-in, iframe, markdown, or external.

import React, { Suspense, useState } from 'react';
import { TabConfig } from '../../types/company';
import { getBuiltInComponent } from './ComponentRegistry';
import { LoadingFallback } from '../ui/LoadingFallback';
import { ExternalLink, AlertTriangle, RefreshCw } from 'lucide-react';

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
              <AlertTriangle size={48} className="mx-auto mb-4 text-gray-300" />
              <h2 className="text-lg font-bold text-gray-500">Componente no encontrado</h2>
              <p className="text-sm text-gray-400 mt-1">
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
              <AlertTriangle size={48} className="mx-auto mb-4 text-gray-300" />
              <h2 className="text-lg font-bold text-gray-500">URL no configurada</h2>
              <p className="text-sm text-gray-400 mt-1">Este tab iframe no tiene una URL configurada.</p>
            </div>
          </div>
        );
      }

      if (iframeError) {
        return (
          <div className="flex items-center justify-center h-full min-h-[50vh] p-8">
            <div className="text-center">
              <AlertTriangle size={48} className="mx-auto mb-4 text-orange-300" />
              <h2 className="text-lg font-bold text-gray-500">Error al cargar</h2>
              <p className="text-sm text-gray-400 mt-1 mb-4">No se pudo cargar el contenido en: {tab.content}</p>
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

      return (
        <div className="w-full h-full min-h-[80vh]">
          <iframe
            key={iframeKey}
            src={tab.content}
            className="w-full h-full border-0 rounded-lg"
            title={tab.label}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
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
            <div className="text-center text-gray-400">
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
              <AlertTriangle size={48} className="mx-auto mb-4 text-gray-300" />
              <h2 className="text-lg font-bold text-gray-500">URL no configurada</h2>
            </div>
          </div>
        );
      }

      return (
        <div className="flex items-center justify-center h-full min-h-[30vh] p-8">
          <div className="text-center">
            <ExternalLink size={48} className="mx-auto mb-4 text-primary/60" />
            <h2 className="text-lg font-bold text-gray-700 mb-2">{tab.label}</h2>
            <p className="text-sm text-gray-500 mb-6 break-all">{tab.content}</p>
            <a
              href={tab.content}
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
            <AlertTriangle size={48} className="mx-auto mb-4 text-gray-300" />
            <h2 className="text-lg font-bold text-gray-500">Tipo de tab desconocido</h2>
            <p className="text-sm text-gray-400 mt-1">"{tab.type}" no es un tipo de tab soportado.</p>
          </div>
        </div>
      );
  }
};

/**
 * Simple markdown to HTML renderer.
 * Supports: headings, bold, italic, lists, links, paragraphs, code blocks.
 */
function renderSimpleMarkdown(md: string): string {
  let html = md
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-gray-900 text-gray-100 p-4 rounded-2xl overflow-x-auto text-sm my-4"><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-primary px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
    // Headings
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-8 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-black mt-8 mb-4">$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:no-underline">$1</a>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="my-6 border-gray-200" />')
    // Paragraphs (double newlines)
    .replace(/\n\n/g, '</p><p class="mb-4 leading-relaxed text-gray-700">');

  return `<div class="markdown-content"><p class="mb-4 leading-relaxed text-gray-700">${html}</p></div>`;
}

export default CustomPageRenderer;