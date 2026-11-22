// <img> para archivos de Storage: si la URL es de un bucket privado de fotos, la
// cambia por un enlace firmado antes de mostrarla (src/services/storageUrls.ts).
// El resto de URLs (data:, blob:, logos públicos, externas) se muestran tal cual.
import React, { useEffect, useState } from 'react';
import { cachedStorageUrl, resolveStorageUrl } from '../../services/storageUrls';

export function useStorageUrl(url: string | null | undefined): string | undefined {
  const [resolved, setResolved] = useState<string | undefined>(() => (url ? cachedStorageUrl(url) ?? undefined : undefined));
  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setResolved(undefined);
      return;
    }
    const now = cachedStorageUrl(url);
    if (now) {
      setResolved(now);
      return;
    }
    setResolved(undefined);
    resolveStorageUrl(url).then((u) => { if (!cancelled) setResolved(u); });
    return () => { cancelled = true; };
  }, [url]);
  return resolved;
}

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string | null | undefined };

const StorageImage: React.FC<Props> = ({ src, alt = '', ...rest }) => {
  const url = useStorageUrl(src);
  if (!url) return <span aria-hidden="true" className={`block bg-sunken animate-pulse ${rest.className ?? ''}`} />;
  return <img src={url} alt={alt} {...rest} />;
};

export default StorageImage;
