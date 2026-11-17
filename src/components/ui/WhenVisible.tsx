import React, { useEffect, useRef, useState } from 'react';

interface WhenVisibleProps {
  /** Altura que reserva el hueco antes de montar, para no desplazar el contenido. */
  minHeight: string;
  placeholder?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Monta a sus hijos la primera vez que el hueco se acerca a la pantalla.
 *
 * `React.lazy` solo aplaza la descarga hasta que el componente se monta, de modo
 * que un bloque perezoso colocado bajo el pliegue se descarga igualmente nada más
 * entrar, aunque nadie llegue a verlo. Difiriendo el montaje, su chunk viaja solo
 * cuando el usuario se desplaza hasta él.
 */
export const WhenVisible: React.FC<WhenVisibleProps> = ({ minHeight, placeholder = null, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible || !ref.current) return;
    // El margen arranca la carga antes de que el hueco asome, para que el
    // contenido suela estar listo cuando se llega a él.
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { rootMargin: '300px' },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [visible]);

  return <div ref={ref} style={visible ? undefined : { minHeight }}>{visible ? children : placeholder}</div>;
};

export default WhenVisible;
