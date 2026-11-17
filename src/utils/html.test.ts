// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { el, escapeHtml, safeUrl } from './html';

describe('escapeHtml', () => {
  it('neutraliza etiquetas y comillas', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });
});

describe('el', () => {
  it('inserta el texto como texto, no como HTML', () => {
    const node = el('h3', 'title', '<script>alert(1)</script>');
    expect(node.querySelector('script')).toBeNull();
    expect(node.textContent).toBe('<script>alert(1)</script>');
  });
});

describe('safeUrl', () => {
  it('acepta https y mailto', () => {
    expect(safeUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeUrl('mailto:a@b.co')).toBe('mailto:a@b.co');
  });
  it('rechaza javascript:, data:, http: y basura', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl(' JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,<b>x</b>')).toBeNull();
    expect(safeUrl('http://example.com')).toBeNull();
    expect(safeUrl('no es url')).toBeNull();
  });
});
