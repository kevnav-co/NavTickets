// src/services/adminService.ts
// Direct Firestore operations for the Super Admin panel.
// Bypasses companyId injection since admins manage companies and cross-company users.

import {
  collection, query, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc,
  where, orderBy, addDoc, Timestamp, DocumentData
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { CompanyConfig } from '../types/company';
import { User } from '../types';

// ─── Companies ───

export async function listCompanies(): Promise<CompanyConfig[]> {
  if (!db) throw new Error('Firestore no está inicializado.');
  const q = query(collection(db, 'companies'), orderBy('name'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CompanyConfig));
}

export async function getCompany(companyId: string): Promise<CompanyConfig | null> {
  if (!db) throw new Error('Firestore no está inicializado.');
  const snap = await getDoc(doc(db, 'companies', companyId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as CompanyConfig;
}

export async function createCompany(company: Omit<CompanyConfig, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<string> {
  if (!db) throw new Error('Firestore no está inicializado.');
  const data = {
    ...company,
    createdAt: Timestamp.now().toDate().toISOString(),
    updatedAt: Timestamp.now().toDate().toISOString(),
  };
  if (company.id) {
    await setDoc(doc(db, 'companies', company.id), data);
    return company.id;
  }
  const docRef = await addDoc(collection(db, 'companies'), data);
  return docRef.id;
}

export async function updateCompany(companyId: string, data: Partial<Omit<CompanyConfig, 'id'>>): Promise<void> {
  if (!db) throw new Error('Firestore no está inicializado.');
  await updateDoc(doc(db, 'companies', companyId), {
    ...data,
    updatedAt: Timestamp.now().toDate().toISOString(),
  });
}

export async function deleteCompany(companyId: string): Promise<void> {
  if (!db) throw new Error('Firestore no está inicializado.');
  await deleteDoc(doc(db, 'companies', companyId));
}

// ─── Image Upload ───

export async function uploadCompanyImage(file: File, companyId: string, type: 'logo' | 'icon' | 'logoWhite'): Promise<string> {
  if (!storage) throw new Error('Storage no está inicializado.');
  const storagePath = `companies/${companyId}/${type}_${Date.now()}.${file.name.split('.').pop()}`;
  const storageRef = ref(storage, storagePath);
  const snapshot = await uploadBytes(storageRef, file);
  return getDownloadURL(snapshot.ref);
}

// ─── Cross-Company Users ───

export async function listUsersByCompany(companyId: string): Promise<User[]> {
  if (!db) throw new Error('Firestore no está inicializado.');
  const q = query(
    collection(db, 'users'),
    where('companyId', '==', companyId),
    orderBy('name')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
}

export async function adminCreateUser(data: Omit<DocumentData, 'id'>): Promise<string> {
  if (!db) throw new Error('Firestore no está inicializado.');
  const docRef = await addDoc(collection(db, 'users'), data);
  return docRef.id;
}

export async function adminUpdateUser(userId: string, data: Partial<DocumentData>): Promise<void> {
  if (!db) throw new Error('Firestore no está inicializado.');
  await updateDoc(doc(db, 'users', userId), data);
}

export async function adminDeleteUser(userId: string): Promise<void> {
  if (!db) throw new Error('Firestore no está inicializado.');
  await deleteDoc(doc(db, 'users', userId));
}