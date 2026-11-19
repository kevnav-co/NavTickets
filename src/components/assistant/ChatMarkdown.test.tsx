// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import ChatMarkdown, { parseChatMarkdown, parseInline } from './ChatMarkdown';

function html(text: string): HTMLDivElement {
  const host = document.createElement('div');
  act(() => createRoot(host).render(<ChatMarkdown text={text} />));
  return host;
}

describe('parseInline', () => {
  it('reconoce negrita y cursiva', () => {
    expect(parseInline('Tengo **viernes 20** a las *14:00*')).toEqual([
      { type: 'text', text: 'Tengo ' },
      { type: 'strong', text: 'viernes 20' },
      { type: 'text', text: ' a las ' },
      { type: 'em', text: '14:00' },
    ]);
  });

  it('quita comillas invertidas y deja los enlaces como texto', () => {
    expect(parseInline('Servicio `mantenimiento-preventivo` en [mi web](https://x.co)')).toEqual([
      { type: 'text', text: 'Servicio mantenimiento-preventivo en mi web' },
    ]);
  });

  it('un asterisco o guion bajo suelto, o dentro de palabras, queda como texto', () => {
    expect(parseInline('2 * 3 = 6 y snake_case_id')).toEqual([{ type: 'text', text: '2 * 3 = 6 y snake_case_id' }]);
  });

  it('un ** sin cerrar (texto a medias del streaming) se muestra tal cual, sin romper nada', () => {
    expect(parseInline('Tengo **viernes')).toEqual([{ type: 'text', text: 'Tengo **viernes' }]);
  });
});

describe('parseChatMarkdown', () => {
  it('separa párrafos, viñetas y listas numeradas', () => {
    const blocks = parseChatMarkdown('Estos son los huecos:\n\n- **Viernes:** 13:00\n- Sábado: 08:00\n\n1. Nombre\n2. Teléfono\nGracias');
    expect(blocks.map((b) => b.type)).toEqual(['p', 'ul', 'ol', 'p']);
  });

  it('los títulos pasan a una línea en negrita y las reglas horizontales desaparecen', () => {
    expect(parseChatMarkdown('## Resumen\n---\nListo').map((b) => b.type)).toEqual(['heading', 'p']);
  });
});

describe('ChatMarkdown', () => {
  it('pinta negrita y listas como elementos', () => {
    const h = html('Huecos:\n- **Viernes 20:** 13:00, 14:00\n- **Lunes 23:** 08:00');
    expect(h.querySelectorAll('ul > li')).toHaveLength(2);
    expect(h.querySelector('strong')?.textContent).toBe('Viernes 20:');
    expect(h.textContent).not.toContain('**');
  });

  it('nunca interpreta HTML del modelo ni crea enlaces', () => {
    const h = html('<img src=x onerror=alert(1)> **hola** [clic](javascript:alert(1)) <script>x</script>');
    expect(h.querySelector('img')).toBeNull();
    expect(h.querySelector('script')).toBeNull();
    expect(h.querySelector('a')).toBeNull();
    expect(h.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(h.textContent).not.toContain('javascript:');
  });

  it('respeta los saltos de línea dentro de un párrafo', () => {
    expect(html('línea uno\nlínea dos').querySelectorAll('br')).toHaveLength(1);
  });
});
