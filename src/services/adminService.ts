import { supabase } from './supabase';
import { CompanyConfig } from '../types/company';
import { User } from '../types';

/** Helper to convert camelCase keys to snake_case for Supabase storage. */
function toSnakeCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snake = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
    result[snake] = value;
  }
  return result;
}

/** Normalizes a company row from Supabase (snake_case) to the app's camelCase shape. */
function normalizeCompany(row: any): CompanyConfig {
  if (!row) return row as any;
  return {
    id: row.id,
    name: row.name,
    logo: row.logo,
    icon: row.icon,
    logoWhite: row.logo_white ?? row.logoWhite,
    email: row.email,
    phone: row.phone,
    address: row.address,
    colors: typeof row.colors === 'string' ? JSON.parse(row.colors) : (row.colors || {}),
    notificationConfig: typeof row.notification_config === 'string' ? JSON.parse(row.notification_config) : (row.notification_config || {}),
    customScripts: typeof row.custom_scripts === 'string' ? JSON.parse(row.custom_scripts) : (row.custom_scripts || {}),
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  } as CompanyConfig;
}

/** Normalizes a user row from Supabase. */
function normalizeUser(row: any): User {
  if (!row) return row as any;
  return {
    id: row.id,
    companyId: row.company_id ?? row.companyId,
    name: row.name,
    role: row.role,
    username: row.username,
    email: row.email,
    latitude: row.latitude,
    longitude: row.longitude,
  } as User;
}

// ─── Companies ───
export async function listCompanies(): Promise<CompanyConfig[]> {
  const { data, error } = await (supabase as any).from('companies').select('*').order('name');
  if (error) throw new Error(error.message);
  return (data || []).map(normalizeCompany);
}

export async function getCompany(companyId: string): Promise<CompanyConfig | null> {
  const { data, error } = await (supabase as any).from('companies').select('*').eq('id', companyId).single();
  if (error) return null;
  return normalizeCompany(data);
}

export async function createCompany(company: Omit<CompanyConfig, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<string> {
  const now = new Date().toISOString();
  const payload = {
    ...toSnakeCase(company),
    created_at: now,
    updated_at: now,
  };
  if (company.id) {
    // Insert with explicit ID (Supabase allows inserting with primary key)
    const { error } = await (supabase as any).from('companies').insert({ ...payload, id: company.id });
    if (error) throw new Error(error.message);
    return company.id;
  }
  const { data: inserted, error } = await (supabase as any).from('companies').insert(payload).select('id').single();
  if (error) throw new Error(error.message);
  return inserted.id;
}

export async function updateCompany(companyId: string, data: Partial<Omit<CompanyConfig, 'id'>>): Promise<void> {
  const { error } = await (supabase as any).from('companies').update({
    ...toSnakeCase(data),
    updated_at: new Date().toISOString(),
  }).eq('id', companyId);
  if (error) throw new Error(error.message);
}

export async function deleteCompany(companyId: string): Promise<void> {
  const { error } = await (supabase as any).from('companies').delete().eq('id', companyId);
  if (error) throw new Error(error.message);
}

// ─── Image Upload ───
export async function uploadCompanyImage(file: File, companyId: string, type: 'logo' | 'icon' | 'logoWhite'): Promise<string> {
  const ext = file.name.split('.').pop();
  const storagePath = `companies/${companyId}/${type}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('company-assets').upload(storagePath, file, { upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('company-assets').getPublicUrl(storagePath);
  return data.publicUrl;
}

// ─── Cross‑Company Users ───
export async function listUsersByCompany(companyId: string): Promise<User[]> {
  const { data, error } = await (supabase as any).from('users').select('*').eq('company_id', companyId).order('name');
  if (error) throw new Error(error.message);
  return (data || []).map(normalizeUser);
}

export async function adminCreateUser(data: Omit<Record<string, any>, 'id'>): Promise<string> {
  const { data: inserted, error } = await (supabase as any).from('users').insert(toSnakeCase(data)).select('id').single();
  if (error) throw new Error(error.message);
  return inserted.id;
}

export async function adminUpdateUser(userId: string, data: Partial<Record<string, any>>): Promise<void> {
  const { error } = await (supabase as any).from('users').update(toSnakeCase(data)).eq('id', userId);
  if (error) throw new Error(error.message);
}

export async function adminDeleteUser(userId: string): Promise<void> {
  const { error } = await (supabase as any).from('users').delete().eq('id', userId);
  if (error) throw new Error(error.message);
}
