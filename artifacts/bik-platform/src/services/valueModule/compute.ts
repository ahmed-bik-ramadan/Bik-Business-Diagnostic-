export type ValuePath = 'L' | 'R' | 'P' | 'W';
export type ScenarioShare = 0.25 | 0.5 | 0.75;
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
export interface PathResult { path: ValuePath; amount: number | null; status: 'calculated' | 'missing' | 'needMargin' }

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
export function computeCostOfProblem(input: Readonly<ValueInputs>, paths: readonly ValuePath[], share: ScenarioShare = 0.5) {
  const value = (field: ValueField) => parseValueNumber(input[field]);
  const margin = value('margin');
  const validMargin = margin !== null && margin >= 1 && margin <= 100;
  const calculate = (path: ValuePath): PathResult => {
    if ((path === 'L' || path === 'R') && !validMargin) return { path, amount: null, status: 'needMargin' };
    const fields: Record<ValuePath, ValueField[]> = {
      L: ['lostUnits', 'unitNet'], R: ['dormantCount', 'returnsPerYear', 'unitNet'],
      P: ['monthlyUnits', 'unitNet', 'underPct'], W: ['monthlyWaste']
    };
    if (fields[path].some(field => value(field) === null)) return { path, amount: null, status: 'missing' };
    const amount = path === 'L' ? value('lostUnits')! * value('unitNet')! * margin! / 100
      : path === 'R' ? value('dormantCount')! * value('returnsPerYear')! / 12 * value('unitNet')! * margin! / 100
      : path === 'P' ? value('monthlyUnits')! * value('unitNet')! * value('underPct')! / 100
      : value('monthlyWaste')!;
    return Number.isFinite(amount) && amount >= 0 ? { path, amount, status: 'calculated' } : { path, amount: null, status: 'missing' };
  };
  const results = [...new Set(paths)].slice(0, 3).map(calculate);
  const calculated = results.filter(result => result.amount !== null);
  const rawTotal = calculated.length ? calculated.reduce((sum, result) => sum + result.amount!, 0) : null;
  const revenue = value('monthlyRevenue');
  const capped = rawTotal !== null && revenue !== null && rawTotal > revenue;
  const total = rawTotal === null ? null : capped ? revenue : rawTotal;
  const scenarioShare = ([0.25, 0.5, 0.75] as const).includes(share) ? share : 0.5;
  return { paths: results, rawTotal, total, capped, yearly: total === null ? null : total * 12,
    scenarioShare, scenarioGain: total === null ? null : total * scenarioShare };
}
