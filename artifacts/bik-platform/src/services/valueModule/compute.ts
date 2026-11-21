export type ValuePath = 'L' | 'R' | 'P' | 'W';
export const VALUE_ESTIMATE_LABEL = 'تقدير استرشادي';
export interface ValueInputs {
  unitNet?: unknown;
  margin?: unknown;
  lostUnits?: unknown;
  dormantCount?: unknown;
  returnsPerYear?: unknown;
  monthlyUnits?: unknown;
  underPct?: unknown;
  monthlyWaste?: unknown;
  monthlyRevenue?: unknown;
}
export type ValueField = keyof ValueInputs;
export interface PathResult { path: ValuePath; amount: number | null; status: 'calculated' | 'missing' | 'needMargin' | 'noRevenue' }

/** No signs, exponents, fabricated defaults, or coercion of an empty field to zero. */
export function parseValueNumber(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? input : null;
  if (typeof input !== 'string') return null;
  const normalized = input.trim().replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6f0)).replace(/[\s,،٬]/gu, '').replace(/٫/g, '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/u.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** Health scores and sector averages are deliberately absent from this input. */
export function computeCostOfProblem(input: Readonly<ValueInputs>, paths: readonly ValuePath[]) {
  const value = (field: ValueField) => parseValueNumber(input[field]);
  const revenue = value('monthlyRevenue');
  const noRevenue = revenue === 0;
  const units = value('monthlyUnits');
  const unitNet = value('unitNet');
  const inconsistentSales = revenue !== null && units !== null && unitNet !== null && units * unitNet > 2 * revenue;
  const margin = value('margin');
  const validMargin = margin !== null && margin <= 100;
  const calculate = (path: ValuePath): PathResult => {
    if (noRevenue) return { path, amount: null, status: 'noRevenue' };
    if ((path === 'L' || path === 'R') && !validMargin) return { path, amount: null, status: 'needMargin' };
    const fields: Record<ValuePath, ValueField[]> = {
      L: ['lostUnits', 'unitNet'], R: ['dormantCount', 'returnsPerYear', 'unitNet'],
      P: ['monthlyUnits', 'unitNet', 'underPct'], W: ['monthlyWaste']
    };
    if (fields[path].some(field => value(field) === null)) return { path, amount: null, status: 'missing' };
    const amount = path === 'L' ? value('lostUnits')! * value('unitNet')! * margin! / 100
      : path === 'R' ? value('dormantCount')! * value('returnsPerYear')! / 12 * value('unitNet')! * margin! / 100
      : path === 'P' ? value('monthlyUnits')! * value('unitNet')! * Math.min(value('underPct')!, 100) / 100
      : value('monthlyWaste')!;
    return Number.isFinite(amount) && amount >= 0 ? { path, amount, status: 'calculated' } : { path, amount: null, status: 'missing' };
  };
  const results = [...new Set(paths)].slice(0, 3).map(calculate);
  const lost = results.find(row => row.path === 'L')?.amount;
  const dormant = results.find(row => row.path === 'R')?.amount;
  let overlapExcluded: 'L' | 'R' | null = null;
  if (lost != null && dormant != null) {
    // On a tie retain lost units, regardless of selection order.
    overlapExcluded = lost < dormant ? 'L' : 'R';
  }
  const included = results.flatMap(row => row.path !== overlapExcluded && row.amount !== null ? [row.amount] : []);
  const rawTotal = included.length ? included.reduce((sum, amount) => sum + amount, 0) : null;
  const capped = rawTotal !== null && revenue !== null && rawTotal > revenue;
  const total = capped ? revenue : rawTotal;
  return { paths: results, rawTotal, total, capped, yearly: total === null ? null : total * 12,
    noRevenue, overlapExcluded, inconsistentSales };
}
