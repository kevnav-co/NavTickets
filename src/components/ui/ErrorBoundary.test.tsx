// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

const Boom = () => { throw new Error('fallo de render'); };

describe('ErrorBoundary', () => {
  it('muestra el aviso de recuperación en vez de una pantalla en blanco', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = document.createElement('div');
    const root = createRoot(el);
    await act(async () => { root.render(<ErrorBoundary><Boom /></ErrorBoundary>); });
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Algo salió mal');
    expect(consoleError).toHaveBeenCalledWith('[ErrorBoundary]', expect.any(Error), expect.anything());
    root.unmount();
    consoleError.mockRestore();
  });
});
