/** Operational limits only; no diagnostic score, price or visitor-facing copy is configured here. */
export const RATE_WINDOW_MS = 10 * 60 * 1000;
export const PUBLIC_RATE_LIMIT_PER_IP = 60;
export const PUBLIC_RATE_LIMIT_EMERGENCY = PUBLIC_RATE_LIMIT_PER_IP * 10;
export const CHAT_RATE_LIMIT_PER_IP = 20;
/** Each of the public/chat maps holds at most this many IP entries. */
export const MAX_RATE_BUCKET_KEYS = 10_000;

/** Preserve the previous single-hop default; accept only a non-negative integer. */
export function trustProxyHops(env: Record<string, string | undefined>): number {
  const raw = env.TRUST_PROXY_HOPS?.trim() || '';
  if (!/^\d+$/.test(raw)) return 1;
  const hops = Number(raw);
  return Number.isSafeInteger(hops) && hops >= 0 ? hops : 1;
}
