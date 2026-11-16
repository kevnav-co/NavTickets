// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { readCachedProfile, writeCachedProfile, clearCachedProfile } from './profileCache';
import type { User } from '../types';

const perfil: User = {
  id: 'u1',
  companyId: 'c1',
  name: 'Técnico Demo',
  role: 'technician',
  username: 'tecdemo',
  mustResetPassword: false,
};

describe('profileCache', () => {
  beforeEach(() => localStorage.clear());

  it('devuelve el perfil guardado para el mismo identificador de autenticación', () => {
    writeCachedProfile('auth-1', perfil);
    expect(readCachedProfile('auth-1')).toEqual(perfil);
  });

  it('no devuelve el perfil de otra cuenta', () => {
    writeCachedProfile('auth-1', perfil);
    expect(readCachedProfile('auth-2')).toBeNull();
  });

  it('queda vacío tras cerrar sesión', () => {
    writeCachedProfile('auth-1', perfil);
    clearCachedProfile();
    expect(readCachedProfile('auth-1')).toBeNull();
  });

  it('tolera contenido corrupto en el almacenamiento', () => {
    localStorage.setItem('navtickets_profile_cache', '{no es json');
    expect(readCachedProfile('auth-1')).toBeNull();
  });
});
