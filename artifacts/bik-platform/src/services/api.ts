// src/services/api.ts
// BIK Self-Hosted API Client
// Handles sessions, answers, diagnostics, and leads through the custom backend.

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
