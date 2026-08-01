// src/services/adminService.ts
// Direct Supabase operations for the Super Admin panel.
// Bypasses companyId injection since admins manage companies and cross-company users.

import { supabase, isSupabaseConfigured } from './supabase';
import { CompanyConfig } from '../types/company';
import { User } from '../types';

// ─── Companies ───

export async function listCompanies(): Promise<CompanyConfig[]> {
  if (!isSupabaseConfigured()) throw new Error('Supabase no está configurado.');
  const { data, error } = await (supabase as any)
    .from('companies')
    .select('*')
    .order('name');

  if (error) throw error;
  return (data || []).map(normalizeCompany);
}

export async function getCompany(companyId: string): Promise<CompanyConfig | null> {
  if (!isSupabaseConfigured()) throw new Error('Supabase no está configurado.');
  const { data, error } = await (supabase as any)
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw error;
  }
  return normalizeCompany(data);
}

export async function createCompany(company: Omit<CompanyConfig, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<string> {
  if (!isSupabaseConfigured()) throw new Error('Supabase no está configurado.');

  const now = new Date().toISOString();
  const snakeData: Record<string, any> = {
    name: company.name,
    slug: company.slug || company.name.toLowerCase().replace(/\s+/g, '-'),
    theme: JSON.stringify(company.theme),
    features: JSON.stringify(company.features),
    auth: JSON.stringify(company.auth),
    tabs: JSON.stringify(company.tabs || []),
    created_at: now,
    updated_at: now,
  };

  if (company.id) {
    snakeData.id = company.id;
  }

  const { data, error } = await (supabase as any)
    .from('companies')
    .insert(snakeData)
    .select('id')
    .single();

  if (error) throw error;
  return data?.id;
}

export async function updateCompany(companyId: string, data: Partial<Omit<CompanyConfig, 'id'>>): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase no está configurado.');

  const snakeData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (data.name !== undefined) snakeData.name = data.name;
  if (data.slug !== undefined) snakeData.slug = data.slug;
  if (data.theme !== undefined) snakeData.theme = JSON.stringify(data.theme);
  if (data.features !== undefined) snakeData.features = JSON.stringify(data.features);
  if (data.auth !== undefined) snakeData.auth = JSON.stringify(data.auth);
  if (data.tabs !== undefined) snakeData.tabs = JSON.stringify(data.tabs);

  const { error } = await (supabase as any)
    .from('companies')
    .update(snakeData)
    .eq('id', companyId);

  if (error) throw error;
}

export async function deleteCompany(companyId: string): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase no está configurado.');
  const { error } = await (supabase as any)
    .from('companies')
    .delete()
    .eq('id', companyId);

  if (error) throw error;
}

// ─── Image Upload ───

export async function uploadCompanyImage(file: File, companyId: string, type: 'logo' | 'icon' | 'logoWhite'): Promise<string> {
  if (!isSupabaseConfigured()) throw new Error('Supabase no está configurado.');

  const ext = file.name.split('.').pop() || 'png';
  const filePath = `companies/${companyId}/${type}_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('company-assets')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from('company-assets')
    .getPublicUrl(filePath);

  return publicUrl;
}

// ─── Cross-Company Users ───

export async function listUsersByCompany(companyId: string): Promise<User[]> {
  if (!isSupabaseConfigured()) throw new Error('Supabase no está configurado.');
  const { data, error } = await (supabase as any)
    .from('users')
    .select('*')
    .eq('company_id', companyId)
    .order('name');

  if (error) throw error;
  return (data || []).map(normalizeUser);
}

export async function adminCreateUser(data: Record<string, any>): Promise<string> {
  if (!isSupabaseConfigured()) throw new Error('Supabase no está configurado.');

  const snakeData = toSnakeCase(data);
  const { data: result, error } = await (supabase as any)
    .from('users')
    .insert(snakeData)
    .select('id')
    .single();

  if (error) throw error;
  return result?.id;
}

export async function adminUpdateUser(userId: string, data: Record<string, any>): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase no está configurado.');

  const snakeData = toSnakeCase(data);
  const { error } = await (supabase as any)
    .from('users')
    .update(snakeData)
    .eq('id', userId);

  if (error) throw error;
}

export async function adminDeleteUser(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase no está configurado.');
  const { error } = await (supabase as any)
    .from('users')
    .delete()
    .eq('id', userId);

  if (error) throw error;
}

// ─── Helpers ───

function toSnakeCase(obj: Record<string, any>): Record<string, any> {
  if (!obj || typeof obj !== 'object') return obj;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`);
    result[snakeKey] = value;
  }
  return result;
}

function normalizeCompany(row: any): CompanyConfig {
  const parseJson = (val: any) => {
    if (!val) return undefined;
    if (typeof val === 'string') try { return JSON.parse(val); } catch { return val; }
    return val;
  };

  return {
    id: row.id,
    name: row.name,
    slug: row.slug || '',
    theme: parseJson(row.theme) || { primaryColor: '#7b1113', logoUrl: '', iconUrl: '' },
    features: parseJson(row.features) || { accounting: false, maps: false, aiAssistant: false, equipmentManagement: false },
    auth: parseJson(row.auth) || { emailDomain: '', allowedRoles: [] },
    tabs: parseJson(row.tabs) || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeUser(row: any): User {
  return {
    id: row.id,
    ...row,
  } as User;
}