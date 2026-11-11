// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ModalProvider, useModal } from './ModalContext';

// Pequeño arnés: expone el valor del contexto sin depender de testing-library.
function montar() {
  const ref: { actual: ReturnType<typeof useModal> | null } = { actual: null };
  const Sonda = () => { ref.actual = useModal(); return null; };
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => { root.render(<ModalProvider><Sonda /></ModalProvider>); });
  return {
    ctx: () => ref.actual!,
    run: (fn: () => void) => act(() => { fn(); }),
    desmontar: () => act(() => { root.unmount(); }),
  };
}

describe('ModalContext', () => {
  it('cierra el modal cuando closeModal se usa como manejador de evento', () => {
    const m = montar();
    m.run(() => m.ctx().openModal('password'));
    expect(m.ctx().isModalOpen('password')).toBe(true);

    // `onClose={closeModal}` sobre un <button> hace que React entregue el evento
    // como primer argumento, que la firma interpretaba como nombre de modal.
    const evento = { type: 'click', nativeEvent: {}, preventDefault() {} };
    m.run(() => (m.ctx().closeModal as (a?: unknown) => void)(evento));

    expect(m.ctx().isModalOpen('password')).toBe(false);
    m.desmontar();
  });

  it('cierra por nombre y descarta los apilados encima', () => {
    const m = montar();
    m.run(() => m.ctx().openModal('a'));
    m.run(() => m.ctx().openModal('b'));
    m.run(() => m.ctx().closeModal('a'));

    expect(m.ctx().isModalOpen('a')).toBe(false);
    expect(m.ctx().isModalOpen('b')).toBe(false);
    m.desmontar();
  });

  it('sin argumento cierra solo el ultimo', () => {
    const m = montar();
    m.run(() => m.ctx().openModal('a'));
    m.run(() => m.ctx().openModal('b'));
    m.run(() => m.ctx().closeModal());

    expect(m.ctx().isModalOpen('b')).toBe(false);
    expect(m.ctx().isModalOpen('a')).toBe(true);
    m.desmontar();
  });
});
