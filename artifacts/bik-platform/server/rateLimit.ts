import { MAX_RATE_BUCKET_KEYS, PUBLIC_RATE_LIMIT_EMERGENCY, PUBLIC_RATE_LIMIT_PER_IP, RATE_WINDOW_MS } from './runtimeConfig';

export interface RateBucket { count: number; resetAt: number }
type Buckets = Map<string, RateBucket>;
// One sweep timestamp per map, not another collection of IP addresses.
const lastSweeps = new WeakMap<Buckets, number>();

/** Sweep on the first access after a window, and evict oldest-created buckets first. */
export function pruneRateBuckets(buckets: Buckets, now = Date.now()): void {
  const last = lastSweeps.get(buckets);
  if (last === undefined || now < last || now - last >= RATE_WINDOW_MS) {
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
    lastSweeps.set(buckets, now);
  }
  while (buckets.size > MAX_RATE_BUCKET_KEYS) buckets.delete(buckets.keys().next().value!);
}

export function consumeRateBucket(buckets: Buckets, key: string, limit: number, now = Date.now()): boolean {
  pruneRateBuckets(buckets, now);
  const current = buckets.get(key);
  if (current && current.resetAt > now) {
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  }
  // A reset is a fresh bucket for the purpose of oldest-first eviction.
  buckets.delete(key);
  while (buckets.size >= MAX_RATE_BUCKET_KEYS) buckets.delete(buckets.keys().next().value!);
  buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
  return true;
}

/** Blocked requests from one IP cannot spend the emergency allowance for everyone else. */
export function createPublicRateLimiter(buckets: Buckets = new Map()) {
  let emergency: RateBucket | undefined;
  return {
    buckets,
    allow(ip: string, now = Date.now()): boolean {
      if (!consumeRateBucket(buckets, ip, PUBLIC_RATE_LIMIT_PER_IP, now)) return false;
      if (!emergency || emergency.resetAt <= now) emergency = { count: 0, resetAt: now + RATE_WINDOW_MS };
      if (emergency.count >= PUBLIC_RATE_LIMIT_EMERGENCY) return false;
      emergency.count += 1;
      return true;
    }
  };
}
