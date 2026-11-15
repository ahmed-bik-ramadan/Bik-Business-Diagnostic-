import type { WhatsAppReportPart } from './reportTextDelivery';

export type TransferPartStatus = 'pending' | 'sent';

export interface PersistedTransferPart extends WhatsAppReportPart {
  status: TransferPartStatus;
  openedAt: number | null;
  confirmedAt: number | null;
}

export interface ReportTransferProgress {
  sessionId: string;
  parts: PersistedTransferPart[];
  currentIndex: number;
  updatedAt: number;
}

export interface TransferStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const transferProgressKey = (sessionId: string) => `bik-transfer-state:${sessionId}`;
export const transferDoneKey = (sessionId: string) => `bik-transfer-done:${sessionId}`;

/** Non-cryptographic fingerprint (FNV-1a). It only detects that the report text changed; it holds no report text. */
export function partsFingerprint(parts: WhatsAppReportPart[]): string {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    for (const ch of part.message) {
      hash ^= ch.codePointAt(0)!;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash ^= 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${parts.length}:${hash.toString(16)}`;
}

export function isTransferDone(storage: Pick<TransferStorage, 'getItem'>, sessionId: string, parts: WhatsAppReportPart[]): boolean {
  if (!parts.length) return false;
  try {
    const raw = storage.getItem(transferDoneKey(sessionId));
    if (!raw) return false;
    const mark = JSON.parse(raw);
    return mark?.sessionId === sessionId && mark.fingerprint === partsFingerprint(parts);
  } catch {
    return false;
  }
}

export function completedTransferProgress(sessionId: string, parts: WhatsAppReportPart[], at = Date.now()): ReportTransferProgress {
  return {
    sessionId,
    parts: parts.map(part => ({ ...part, status: 'sent' as const, openedAt: at, confirmedAt: at })),
    currentIndex: parts.length,
    updatedAt: at
  };
}

/**
 * Called once the last part is confirmed. Leaves only a small completion mark (no report text) and removes
 * the local copies of the report text: the per-part copies and the recovery snapshot.
 * Returns false (and removes nothing) if the mark could not be written.
 */
export function finishTransfer(
  storage: TransferStorage,
  sessionId: string,
  parts: WhatsAppReportPart[],
  clearRecovery: () => void,
  at = Date.now()
): boolean {
  try {
    storage.setItem(transferDoneKey(sessionId), JSON.stringify({ sessionId, fingerprint: partsFingerprint(parts), completedAt: at }));
  } catch {
    return false;
  }
  try { storage.removeItem?.(transferProgressKey(sessionId)); } catch { /* the done mark already wins on read */ }
  try { clearRecovery(); } catch { /* best effort */ }
  return true;
}

function firstPendingIndex(parts: PersistedTransferPart[]): number {
  const index = parts.findIndex(part => part.status !== 'sent');
  return index < 0 ? parts.length : index;
}

export function createTransferProgress(sessionId: string, parts: WhatsAppReportPart[]): ReportTransferProgress {
  const persistedParts = parts.map(part => ({
    ...part,
    status: 'pending' as const,
    openedAt: null,
    confirmedAt: null
  }));
  return { sessionId, parts: persistedParts, currentIndex: 0, updatedAt: Date.now() };
}

export function readTransferProgress(
  storage: TransferStorage,
  sessionId: string,
  sourceParts: WhatsAppReportPart[]
): ReportTransferProgress {
  if (isTransferDone(storage, sessionId, sourceParts)) return completedTransferProgress(sessionId, sourceParts);
  const raw = storage.getItem(transferProgressKey(sessionId));
  if (!raw) return createTransferProgress(sessionId, sourceParts);

  let saved: any;
  try {
    saved = JSON.parse(raw);
  } catch {
    return createTransferProgress(sessionId, sourceParts);
  }

  if (
    saved?.sessionId !== sessionId
    || !Array.isArray(saved.parts)
    || saved.parts.length !== sourceParts.length
    || !(saved.version === 2
      ? saved.fingerprint === partsFingerprint(sourceParts)
      : saved.parts.every((part: any, index: number) => part?.message === sourceParts[index].message))
  ) {
    return createTransferProgress(sessionId, sourceParts);
  }

  let foundPending = false;
  const normalizedParts = sourceParts.map((part, index) => {
    const savedPart = saved.parts[index];
    // A part counts as sent only when its stored record shows the full real flow:
    // a valid openedAt and a valid confirmedAt. A tampered record that flips status
    // to 'sent' without both timestamps reads back as pending — the client can only
    // reach "sent" through openWhatsApp and confirmTransferPart, which stamp both.
    const isSent = !foundPending
      && savedPart.status === 'sent'
      && Number.isFinite(savedPart.openedAt)
      && Number.isFinite(savedPart.confirmedAt)
      && savedPart.confirmedAt >= savedPart.openedAt;
    if (!isSent) foundPending = true;
    return {
      ...part,
      status: isSent ? 'sent' as const : 'pending' as const,
      openedAt: Number.isFinite(savedPart.openedAt) ? savedPart.openedAt : null,
      confirmedAt: isSent && Number.isFinite(savedPart.confirmedAt) ? savedPart.confirmedAt : null
    };
  });

  // F8 (round-5): a record claiming every part was sent, without a done-mark whose
  // fingerprint matches this report text, is a forged completion and reads back as a
  // fresh transfer. The only real path to "all sent" passes through finishTransfer,
  // which writes the mark; a partial sent prefix is unaffected by this check.
  if (!foundPending && !isTransferDone(storage, sessionId, sourceParts)) {
    return createTransferProgress(sessionId, sourceParts);
  }

  return {
    sessionId,
    parts: normalizedParts,
    currentIndex: firstPendingIndex(normalizedParts),
    updatedAt: Number.isFinite(saved.updatedAt) ? saved.updatedAt : Date.now()
  };
}

export function writeTransferProgress(storage: TransferStorage, progress: ReportTransferProgress): void {
  // For reviewed reports, persist timestamps/statuses and a text fingerprint only.
  // The source text is already in sessionStorage and is supplied again when restoring.
  const saved = progress.parts.some(part => part.body.includes('مراجعتك معنا'))
    ? { ...progress, version: 2, fingerprint: partsFingerprint(progress.parts),
        parts: progress.parts.map(({ status, openedAt, confirmedAt }) => ({ status, openedAt, confirmedAt })) }
    : progress;
  storage.setItem(transferProgressKey(progress.sessionId), JSON.stringify(saved));
}

/**
 * F8 (round-5): the seven session-key wipes, in one shared place instead of scattered
 * removeItem lines. Called at completion AND at restore: whenever the transfer is found
 * already complete, any copy of the report, the answers or the sharing consent left in
 * sessionStorage is destroyed on sight — the transfer record and done-mark in localStorage
 * hold no report text and are not touched.
 */
export function wipeTransferSessionArtifacts(sessionId: string): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  const sessionKeys = [
    'bik-diagnostic-storage',
    `bik-sharing-consent:${sessionId}`,
    'local_sessions',
    'bik_universal_answers',
    'bik_sector_answers',
    'bik_questionnaire_current_index',
    'bik_session_ownership_token'
  ];
  for (const key of sessionKeys) {
    try { window.sessionStorage.removeItem(key); } catch { /* best effort */ }
  }
}

export function markTransferPartOpened(
  progress: ReportTransferProgress,
  index: number,
  openedAt = Date.now()
): ReportTransferProgress {
  if (index < 0 || index >= progress.parts.length || index > progress.currentIndex) {
    throw new RangeError('Cannot open a part before prior parts are confirmed.');
  }
  const parts = progress.parts.map((part, partIndex) =>
    partIndex === index ? { ...part, openedAt } : part
  );
  return { ...progress, parts, updatedAt: openedAt };
}

export function confirmTransferPart(
  progress: ReportTransferProgress,
  index: number,
  confirmedAt = Date.now()
): { progress: ReportTransferProgress; changed: boolean } {
  const part = progress.parts[index];
  if (!part) throw new RangeError('Unknown report part.');
  if (part.status === 'sent') return { progress, changed: false };
  if (index !== progress.currentIndex) throw new RangeError('Cannot skip an unconfirmed report part.');
  if (part.openedAt === null) throw new Error('Open WhatsApp before confirming this report part.');

  const parts = progress.parts.map((value, partIndex) =>
    partIndex === index ? { ...value, status: 'sent' as const, confirmedAt } : value
  );
  return {
    progress: {
      ...progress,
      parts,
      currentIndex: firstPendingIndex(parts),
      updatedAt: confirmedAt
    },
    changed: true
  };
}
