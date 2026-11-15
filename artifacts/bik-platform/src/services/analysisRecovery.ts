import type { DiagnosticReport } from '../types';
import type { AxisDetail } from './deterministicScoring';

export interface AnalysisRecoverySnapshot {
  sessionId: string;
  report: DiagnosticReport;
  axisScores: Record<string, number> | null;
  axisDetails: Record<string, AxisDetail> | null;
  sectorL1: string;
  sectorL2: string;
  consented: boolean;
  savedAt: number;
}

export interface AnalysisRecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

const latestSessionKey = 'bik-analysis-latest-session';
const sessionKey = (sessionId: string) => `bik-analysis-session:${sessionId}`;

export function saveAnalysisRecovery(
  storage: AnalysisRecoveryStorage,
  snapshot: Omit<AnalysisRecoverySnapshot, 'savedAt'>
): AnalysisRecoverySnapshot {
  const saved = { ...snapshot, savedAt: Date.now() };
  // Review wording belongs only to the existing session store, never the cross-session recovery copy.
  if (snapshot.report.review?.length) return saved;
  storage.setItem(sessionKey(snapshot.sessionId), JSON.stringify(saved));
  storage.setItem(latestSessionKey, snapshot.sessionId);
  return saved;
}

export function readAnalysisRecovery(
  storage: Pick<AnalysisRecoveryStorage, 'getItem'>,
  sessionId: string
): AnalysisRecoverySnapshot | null {
  try {
    const raw = storage.getItem(sessionKey(sessionId));
    if (!raw) return null;
    const snapshot = JSON.parse(raw);
    if (snapshot?.sessionId !== sessionId || !snapshot.report?.dual_layer) return null;
    return snapshot as AnalysisRecoverySnapshot;
  } catch {
    return null;
  }
}

export function readLatestAnalysisRecovery(
  storage: Pick<AnalysisRecoveryStorage, 'getItem'>
): AnalysisRecoverySnapshot | null {
  try {
    const sessionId = storage.getItem(latestSessionKey);
    return sessionId ? readAnalysisRecovery(storage, sessionId) : null;
  } catch {
    return null;
  }
}

export function clearLatestAnalysisRecovery(storage: Pick<AnalysisRecoveryStorage, 'removeItem'>): void {
  storage.removeItem?.(latestSessionKey);
}

/** Removes the stored report copy for a session (and the "latest" pointer when it points at that session). */
export function clearAnalysisRecovery(
  storage: Pick<AnalysisRecoveryStorage, 'getItem'> & { removeItem?(key: string): void },
  sessionId: string
): void {
  storage.removeItem?.(sessionKey(sessionId));
  try {
    if (storage.getItem(latestSessionKey) === sessionId) storage.removeItem?.(latestSessionKey);
  } catch {
    // nothing else to clear
  }
}
