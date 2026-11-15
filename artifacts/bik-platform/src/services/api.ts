// src/services/api.ts
// BIK Self-Hosted API Client
// Handles sessions, answers, diagnostics, leads, and admin operations through the custom backend.

import { DiagnosticReport, LeadData } from '../types';

const BIK_API_BASE = '/_bik-api';
let currentSessionToken: string | null = null;

// Initialize token from memory or sessionStorage
if (typeof window !== 'undefined') {
  currentSessionToken = sessionStorage.getItem('bik_session_ownership_token');
}

export function setSessionOwnershipToken(token: string) {
  currentSessionToken = token;
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('bik_session_ownership_token', token);
  }
}

export function getSessionOwnershipToken(): string | null {
  return currentSessionToken;
}

function getAuthHeaders(): Record<string, string> {
  if (!currentSessionToken && typeof window !== 'undefined') {
    currentSessionToken = sessionStorage.getItem('bik_session_ownership_token');
    if (!currentSessionToken && typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const array = new Uint8Array(24);
      crypto.getRandomValues(array);
      currentSessionToken = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      sessionStorage.setItem('bik_session_ownership_token', currentSessionToken);
    }
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (currentSessionToken) {
    headers['X-Session-Ownership'] = currentSessionToken;
  }
  return headers;
}

// 1. Start or resume a session
export async function startSession(): Promise<{ sessionId: string; ownershipToken: string }> {
  try {
    const res = await fetch(`${BIK_API_BASE}/v1/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });

    if (res.ok) {
      const data = await res.json();
      if (data.ownershipToken) {
        setSessionOwnershipToken(data.ownershipToken);
      }
      return data;
    }
  } catch (err) {
    void err;
  }

  // Safe fallback client-side ephemeral session
  const fallbackSessionId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `bik_${Date.now()}`;
  let fallbackToken = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(24);
    crypto.getRandomValues(array);
    fallbackToken = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  } else {
    fallbackToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
  setSessionOwnershipToken(fallbackToken);
  return { sessionId: fallbackSessionId, ownershipToken: fallbackToken };
}

// 2. Save incremental answers
export async function saveSessionAnswers(data: {
  sessionId: string;
  sectorL1?: string;
  sectorL2?: string;
  diagnosticDepth?: string;
  intakeAnswers?: Record<string, any>;
  universalAnswers?: Record<string, any>;
  sectorAnswers?: Record<string, any>;
  questionHistory?: Array<Record<string, any>>;
}): Promise<boolean> {
  void data;
  return false;
}

// 3. Generate Diagnostic Report (anonymized server-side)
export async function generateDiagnosticReportApi(store: any): Promise<DiagnosticReport> {
  const res = await fetch(`${BIK_API_BASE}/v1/diagnose/generate`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      sessionId: store.sessionId,
      sectorL1: store.sectorL1,
      sectorL2: store.sectorL2,
      diagnosticDepth: store.diagnosticDepth,
      intakeAnswers: store.intakeAnswers,
      universalAnswers: store.universalAnswers,
      sectorAnswers: store.sectorAnswers,
      questionHistory: store.questionHistory
    })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: 'Unknown server error' }));
    throw new Error(errData.error || `Server error: ${res.status}`);
  }

  const data = await res.json();
  return data.report;
}

// 4. Submit Lead (Optional transparent gate)
export async function submitLeadApi(lead: {
  sessionId?: string;
  name: string;
  companyName: string;
  whatsapp: string;
  sectorL1?: string;
  sectorL2?: string;
  country?: string;
  city?: string;
  privacyConsent: boolean;
}): Promise<{ success: boolean; leadId?: string; persisted?: boolean; storageMode?: string; error?: string }> {
  void lead;
  return {
    success: false,
    persisted: false,
    storageMode: 'session_only',
    error: 'بيانات التواصل لا تُرسل إلى الخادم؛ تتم المشاركة مباشرة من جهازك بعد موافقتك.'
  };
}

// ----------------- Admin API Methods -----------------

export async function adminGetSetupStatus(): Promise<{ isSetupRequired: boolean }> {
  try {
    const res = await fetch(`${BIK_API_BASE}/v1/admin/setup/status`);
    if (!res.ok) return { isSetupRequired: false };
    const data = await res.json();
    return { isSetupRequired: !!data.isSetupRequired };
  } catch {
    return { isSetupRequired: false };
  }
}

export async function adminFirstRunSetup(
  setupToken: string,
  username: string,
  password: string
): Promise<{ success: boolean; user?: any; error?: string }> {
  try {
    const res = await fetch(`${BIK_API_BASE}/v1/admin/setup/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ setupToken, username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error };
    }
    return { success: true, user: data.user };
  } catch (err: any) {
    return { success: false, error: err.message || 'فشلت عملية التهيئة' };
  }
}

export async function adminLogin(username: string, password: string): Promise<{ success: boolean; error?: string; user?: any; waitSeconds?: number }> {
  try {
    const res = await fetch(`${BIK_API_BASE}/v1/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error, waitSeconds: data.waitSeconds };
    }

    return { success: true, user: data.user };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error' };
  }
}

export async function adminLogout(): Promise<boolean> {
  try {
    const res = await fetch(`${BIK_API_BASE}/v1/admin/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function adminGetMe(): Promise<{ authenticated: boolean; user?: any }> {
  try {
    const res = await fetch(`${BIK_API_BASE}/v1/admin/me`, {
      method: 'GET',
      credentials: 'include'
    });
    if (!res.ok) return { authenticated: false };
    const data = await res.json();
    return { authenticated: true, user: data.user };
  } catch {
    return { authenticated: false };
  }
}

export async function adminGetLeads(filters: {
  search?: string;
  status?: string;
  sector?: string;
  page?: number;
  limit?: number;
}): Promise<{ leads: any[]; total: number; error?: string }> {
  try {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.status) params.append('status', filters.status);
    if (filters.sector) params.append('sector', filters.sector);
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));

    const res = await fetch(`${BIK_API_BASE}/v1/admin/leads?${params.toString()}`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unauthorized or failed' }));
      return { leads: [], total: 0, error: err.error };
    }

    const data = await res.json();
    return { leads: data.leads, total: data.total };
  } catch (err: any) {
    return { leads: [], total: 0, error: err.message };
  }
}

export async function adminGetLeadDetails(id: string): Promise<any | null> {
  try {
    const res = await fetch(`${BIK_API_BASE}/v1/admin/leads/${id}`, {
      method: 'GET',
      credentials: 'include'
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.lead;
  } catch {
    return null;
  }
}

export async function adminUpdateLeadStatus(id: string, status: string): Promise<boolean> {
  try {
    const res = await fetch(`${BIK_API_BASE}/v1/admin/leads/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status })
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function adminAddLeadNote(id: string, noteText: string): Promise<any | null> {
  try {
    const res = await fetch(`${BIK_API_BASE}/v1/admin/leads/${id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ noteText })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.note;
  } catch {
    return null;
  }
}

export async function adminSaveProposal(id: string, proposalText: string): Promise<boolean> {
  try {
    const res = await fetch(`${BIK_API_BASE}/v1/admin/leads/${id}/proposal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ proposalText })
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function adminDeleteLead(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BIK_API_BASE}/v1/admin/leads/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    return res.ok;
  } catch {
    return false;
  }
}

// System Health & Storage Diagnostic Check
export async function getSystemHealth(): Promise<{ status: string; storageMode: string; timestamp: string }> {
  try {
    const res = await fetch(`${BIK_API_BASE}/v1/health`);
    if (!res.ok) return { status: 'error', storageMode: 'unknown', timestamp: new Date().toISOString() };
    return await res.json();
  } catch {
    return { status: 'offline', storageMode: 'session_only', timestamp: new Date().toISOString() };
  }
}
