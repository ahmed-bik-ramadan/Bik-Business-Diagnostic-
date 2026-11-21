/** Remove only BIK-owned data. Other applications may share this origin. */
export function clearBikStorage(kind: 'localStorage' | 'sessionStorage'): void {
  if (typeof window === 'undefined') return;
  try {
    const storage = window[kind];
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key && (/^bik[-_]/.test(key) || (kind === 'sessionStorage' && key === 'local_sessions'))) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Some browser settings deny access even to the storage getter.
  }
}

// Welcome and the transfer/report routes load this module once per document.
clearBikStorage('localStorage');

// ReportTransfer still calls these legacy hooks. Never read a snapshot or trust its consent.
export function readAnalysisRecovery(_storage: unknown, _sessionId: string): { consented: boolean } | null {
  return null;
}

export function clearAnalysisRecovery(storage: Pick<Storage, 'removeItem'>, sessionId: string): void {
  storage.removeItem('bik-analysis-session:' + sessionId);
}
