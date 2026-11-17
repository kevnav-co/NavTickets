// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { renderSimpleMarkdown } from './markdown';

const render = (md: string) => {
  const div = document.createElement('div');
  div.innerHTML = renderSimpleMarkdown(md);
  return div;
};

describe('renderSimpleMarkdown', () => {
  it('no ejecuta HTML incrustado', () => {
    const div = render('<img src=x onerror="alert(1)"> **hola**');
    expect(div.querySelector('img')).toBeNull();
    expect(div.querySelector('strong')?.textContent).toBe('hola');
  });

  it('descarta enlaces javascript: y data:, dejando solo el texto', () => {
    const div = render('[clic](javascript:alert(1)) y [x](data:text/html,hi)');
    expect(div.querySelector('a')).toBeNull();
    expect(div.textContent).toContain('clic');
  });

  it('no permite inyectar atributos con comillas en el href', () => {
    const div = render('[x](https://a.com/"onmouseover="alert(1))');
    const a = div.querySelector('a');
    expect(a?.getAttribute('onmouseover')).toBeNull();
  });

  it('mantiene enlaces https y mailto', () => {
    const links = [...render('[web](https://example.com/a?b=1&c=2) [mail](mailto:a@b.co)').querySelectorAll('a')];
    expect(links.map(a => a.getAttribute('href'))).toEqual(['https://example.com/a?b=1&c=2', 'mailto:a@b.co']);
  });
});
