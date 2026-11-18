import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, ExternalLink, Link2, QrCode } from 'lucide-react';
import { makeQrMatrix, qrPngDataUrl, qrSvgPath, type QrMatrix } from '../../../utils/qr';

interface Props {
  url: string | null;
  slug: string;
}

const QR_MARGIN = 4;

/** Enlace público del chat con botón de copiar y su código QR (SVG en pantalla, PNG para descargar). */
const AssistantLinkCard: React.FC<Props> = ({ url, slug }) => {
  const [matrix, setMatrix] = useState<QrMatrix | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setMatrix(null);
    setQrError(null);
    if (!url) return;
    makeQrMatrix(url)
      .then(m => { if (!cancelled) setMatrix(m); })
      .catch(() => { if (!cancelled) setQrError('No se pudo generar el código QR.'); });
    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      inputRef.current?.select();
    }
  };

  const downloadPng = () => {
    if (!matrix) return;
    const a = document.createElement('a');
    a.href = qrPngDataUrl(matrix);
    a.download = `asistente-${slug}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <section className="card p-5">
      <h2 className="font-bold text-ink mb-1 flex items-center gap-2">
        <Link2 size={18} className="text-primary" /> Enlace para tus clientes
      </h2>
      <p className="text-xs text-ink-faint mb-4">
        Compártelo en tu web, redes o WhatsApp, o imprime el código QR. Quien lo abra habla con el asistente sin crear una cuenta.
      </p>

      {!url ? (
        <p className="text-sm font-semibold text-red-600">
          La empresa no tiene un identificador (slug) válido para el enlace público. Pide al administrador del sistema que lo corrija.
        </p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-5 items-start">
          <div className="flex-1 min-w-0 w-full space-y-3">
            <label className="block">
              <span className="text-xs font-bold text-ink-soft mb-1 block">Enlace público</span>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  readOnly
                  value={url}
                  onFocus={e => e.currentTarget.select()}
                  className="flex-1 min-w-0 h-10 px-3 bg-sunken border border-line rounded-xl text-sm font-mono text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={copy}
                  className="h-10 px-3 inline-flex items-center gap-1.5 rounded-xl bg-sunken text-sm font-bold text-ink-soft hover:bg-line transition-colors"
                >
                  {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </label>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
            >
              <ExternalLink size={14} /> Abrir el chat como lo ve un cliente
            </a>
          </div>

          <div className="flex flex-col items-center gap-2 shrink-0">
            <div className="w-44 h-44 rounded-xl border border-line-soft bg-white p-1 flex items-center justify-center">
              {matrix ? (
                <svg
                  viewBox={`0 0 ${matrix.length + QR_MARGIN * 2} ${matrix.length + QR_MARGIN * 2}`}
                  className="w-full h-full"
                  role="img"
                  aria-label={`Código QR del enlace ${url}`}
                  shapeRendering="crispEdges"
                >
                  <rect width="100%" height="100%" fill="#ffffff" />
                  <path d={qrSvgPath(matrix, QR_MARGIN)} fill="#000000" />
                </svg>
              ) : qrError ? (
                <span className="text-xs text-red-600 text-center px-2">{qrError}</span>
              ) : (
                <QrCode size={40} className="text-ink-faint animate-pulse" aria-label="Generando código QR" />
              )}
            </div>
            <button
              type="button"
              onClick={downloadPng}
              disabled={!matrix}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-xl bg-sunken text-xs font-bold text-ink-soft hover:bg-line transition-colors disabled:opacity-50"
            >
              <Download size={14} /> Descargar QR (PNG)
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default AssistantLinkCard;
