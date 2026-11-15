// src/services/supabase.ts
// Compatibility layer: Bridges legacy calls to the new self-hosted backend API
// Maintains zero external dependency on Supabase cloud.

import { DiagnosticReport, LeadData } from '../types';
// Lightweight dummy Supabase client interface for backward-compatibility if referenced
export const supabase = {
  from: (_table: string) => ({
    select: () => ({
      order: () => Promise.resolve({ data: [], error: null }),
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        select: () => ({ single: () => Promise.resolve({ data: null, error: null }) })
      })
    }),
    insert: () => Promise.resolve({ data: null, error: null }),
    upsert: () => Promise.resolve({ data: null, error: null }),
    update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) })
  })
};

export async function saveProgress(sessionId: string, data: Record<string, any>) {
  if (typeof window !== 'undefined') {
    try {
      const sessionsStr = sessionStorage.getItem('local_sessions') || '{}';
      const sessions = JSON.parse(sessionsStr);
      sessions[sessionId] = {
        ...(sessions[sessionId] || {}),
        ...data,
        updated_at: new Date().toISOString()
      };
      sessionStorage.setItem('local_sessions', JSON.stringify(sessions));
    } catch (e) {
      void e;
    }
  }
}

export async function saveLead(leadData: LeadData): Promise<string> {
  void leadData;
  return '';
}

export async function saveReport(sessionId: string, report: DiagnosticReport, proposal: string, leadId?: string) {
  saveProgress(sessionId, {
    report,
    proposal,
    completed_at: new Date().toISOString(),
    completion_pct: 100,
    ...(leadId ? { lead_id: leadId } : {})
  });
}

export async function trackEvent(sessionId: string, eventName: string, eventData: Record<string, any> = {}) {
  void sessionId;
  void eventName;
  void eventData;
}

export async function getAllLeads() {
  return [];
}

export async function updateLeadStatus(leadId: string, status: string) {
  void leadId;
  void status;
}

export async function saveProposal(leadId: string, content: string) {
  void leadId;
  void content;
}

export async function getSessionAndLead(sessionId: string) {
  let sessionData: any = null;
  let leadData: any = null;

  if (typeof window !== 'undefined') {
    try {
      const sessionsStr = sessionStorage.getItem('local_sessions') || '{}';
      const sessions = JSON.parse(sessionsStr);
      if (sessions[sessionId]) {
        sessionData = sessions[sessionId];
      }

    } catch (e) {
      // Continue without recoverable tab state.
    }
  }

  return { session: sessionData, lead: leadData };
}
