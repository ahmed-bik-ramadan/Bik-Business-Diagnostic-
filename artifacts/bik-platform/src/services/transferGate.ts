/**
 * Gate for the "I sent this part" button on the report-transfer page.
 *
 * wa.me cannot confirm delivery, and mobile browsers do not report the trip to WhatsApp reliably
 * (tab switches, app-switch freezes, tab reloads). The first version required a visibility
 * hidden->visible cycle and left real phones with a button that never enabled. This gate depends only on
 * time since the client pressed "open" / "copy": it survives reloads (stored per session) and
 * never depends on browser events. It is friction proportional to the time needed to send a message,
 * not proof of delivery.
 */
/** دقّة التصميم: الانتظار كان احتكاكاً عند ذروة رغبة العميل، فأُلغي. منطق "الإرسال من جهاز العميل" بقي كما هو. */
export const MIN_WAIT_MS = 0;

export interface OpenedMark { index: number; at: number }

export const openedKey = (sessionId: string) => `bik-transfer-opened:${sessionId}`;

export function readOpened(storage: Pick<Storage, 'getItem'>, sessionId: string): OpenedMark | null {
  try {
    const raw = storage.getItem(openedKey(sessionId));
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (Number.isInteger(value?.index) && value.index >= 0 && Number.isFinite(value?.at)) return { index: value.index, at: value.at };
  } catch { /* unreadable mark counts as "not opened" */ }
  return null;
}

export function writeOpened(storage: Pick<Storage, 'setItem'>, sessionId: string, mark: OpenedMark): void {
  try { storage.setItem(openedKey(sessionId), JSON.stringify(mark)); } catch { /* the in-memory mark still works for this page view */ }
}

export function clearOpened(storage: Pick<Storage, 'removeItem'>, sessionId: string): void {
  try { storage.removeItem(openedKey(sessionId)); } catch { /* nothing to clear */ }
}

/** Seconds still to wait (0 = ready). A mark for another part, or none, is not ready. */
export function secondsUntilReady(mark: OpenedMark | null, currentIndex: number, now: number, minWaitMs: number = MIN_WAIT_MS): number | null {
  if (!mark || mark.index !== currentIndex) return null;
  const left = minWaitMs - Math.max(0, now - mark.at);
  return left <= 0 ? 0 : Math.ceil(left / 1000);
}
