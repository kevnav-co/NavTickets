// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import CompanyCard from './CompanyCard';
import type { CompanyWithStats } from '../../services/adminService';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const company = {
  id: 'c1', name: 'Plásticos del Sur', slug: 'plasticos-del-sur', theme: {}, features: {}, auth: {}, tabs: [],
  status: 'active',
  overview: { companyId: 'c1', usersCount: 4, ordersTotal: 12, pending: 3, inProgress: 2, closed: 7, corrective: 8,
    preventive: 4, ordersThisMonth: 5, closedThisMonth: 2, lastActivityAt: null },
} as unknown as CompanyWithStats;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const setup = (overrides: Partial<React.ComponentProps<typeof CompanyCard>> = {}) => {
  const props = {
    company, onEdit: vi.fn(), onManageUsers: vi.fn(), onPreview: vi.fn(),
    onSetStatus: vi.fn(async () => {}), onDelete: vi.fn(async () => {}), ...overrides,
  };
  act(() => root.render(<CompanyCard {...props} />));
  return props;
};

const button = (label: string) => {
  const b = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!b) throw new Error(`Sin botón ${label}`);
  return b;
};
const buttonByText = (re: RegExp) => [...container.querySelectorAll('button')].find(b => re.test(b.textContent ?? '')) as HTMLButtonElement;
const click = (el: HTMLElement) => act(() => { el.click(); });
const type = (input: HTMLInputElement, value: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const submit = async (form: HTMLFormElement) => {
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
};

describe('CompanyCard', () => {
  it('muestra estado y estadísticas', () => {
    setup();
    expect(container.textContent).toContain('Activa');
    expect(container.textContent).toContain('3 pend.');
  });

  it('suspende con el motivo escrito', async () => {
    const props = setup();
    click(button('Suspender Plásticos del Sur'));
    const input = container.querySelector('form input') as HTMLInputElement;
    type(input, 'Falta de pago');
    await submit(input.form!);
    expect(props.onSetStatus).toHaveBeenCalledWith('c1', 'suspended', 'Falta de pago');
    expect(container.querySelector('form')).toBeNull();
  });

  it('solo borra tras escribir el nombre exacto', async () => {
    const props = setup();
    click(button('Borrar Plásticos del Sur'));
    const confirm = buttonByText(/Borrar definitivamente/);
    expect(confirm.disabled).toBe(true);
    const input = container.querySelector('form input') as HTMLInputElement;
    type(input, 'plasticos del sur');
    expect(confirm.disabled).toBe(true);
    await submit(input.form!);
    expect(props.onDelete).not.toHaveBeenCalled();
    type(input, 'Plásticos del Sur');
    expect(confirm.disabled).toBe(false);
    await submit(input.form!);
    expect(props.onDelete).toHaveBeenCalledWith('c1', 'Plásticos del Sur');
  });

  it('muestra el error si la acción falla', async () => {
    setup({ onSetStatus: vi.fn(async () => { throw new Error('Solo super_admin'); }) });
    click(button('Suspender Plásticos del Sur'));
    await submit(container.querySelector('form') as HTMLFormElement);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Solo super_admin');
  });

  it('una empresa suspendida ofrece reactivar', async () => {
    const props = setup({ company: { ...company, status: 'suspended', suspendedReason: 'Falta de pago' } as CompanyWithStats });
    expect(container.textContent).toContain('Suspendida');
    expect(container.textContent).toContain('Falta de pago');
    await act(async () => { button('Reactivar Plásticos del Sur').click(); });
    expect(props.onSetStatus).toHaveBeenCalledWith('c1', 'active');
  });
});
