import { BLIND_SPOT_FORMULAS } from '../data/sectorFinancialTaxonomy';
import { VALUE_ESTIMATE_LABEL } from './valueModule/compute';

export interface SectorBlindSpot {
  id: string;
  name: string;
  monthlyAmount: number;
}

export interface SectorBlindSpotsResult {
  spots: SectorBlindSpot[];
  monthlyTotal: number | null;
  sensitivities: SectorBlindSpot[];
}

function totalDeclaredLosses(amounts: readonly number[]): number | null {
  if (!amounts.length) return null;
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  return Number.isFinite(total) ? total : null;
}

export function computeSectorBlindSpots(sectorL1: string | undefined | null, answers: Record<string, unknown>): SectorBlindSpotsResult {
  const formulas = sectorL1 && Object.hasOwn(BLIND_SPOT_FORMULAS, sectorL1)
    ? BLIND_SPOT_FORMULAS[sectorL1] : BLIND_SPOT_FORMULAS.universal;
  const spots: SectorBlindSpot[] = [];
  const sensitivities: SectorBlindSpot[] = [];
  for (const formula of formulas) {
    const { id, name } = formula;
    const monthlyAmount = formula.compute(answers, answers);
    if (monthlyAmount === null) continue;
    const row = { id, name, monthlyAmount };
    if (formula.kind === 'sensitivity') sensitivities.push(row);
    else spots.push(row);
  }
  return { spots, monthlyTotal: totalDeclaredLosses(spots.map(spot => spot.monthlyAmount)), sensitivities };
}

// Older session reports stored both kinds together, identified only by their published names.
const declaredNames = new Set(Object.values(BLIND_SPOT_FORMULAS).flat()
  .filter(formula => formula.kind === 'declaredLoss').map(formula => formula.name));
type ReportedRow = { name: string; monthly_amount: number };

export function declaredSectorRows(rows: readonly ReportedRow[] | undefined): ReportedRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter(row => row && declaredNames.has(row.name) && Number.isFinite(row.monthly_amount) && row.monthly_amount > 0);
}

export function legacySectorLossTotal(rows: readonly ReportedRow[] | undefined): number | null {
  return totalDeclaredLosses(declaredSectorRows(rows).map(row => row.monthly_amount));
}

export function formatOnePointSensitivity(subject: string, value: number, currency: string | undefined): string {
  const number = value.toLocaleString('en-US', { maximumSignificantDigits: 15 });
  const amount = currency === 'USD' ? `$${number}` : [number, currency].filter(Boolean).join(' ');
  return `كل نقطة مئوية من ${subject} تساوي بحسب أرقامك: ${amount} شهرياً (${VALUE_ESTIMATE_LABEL})`;
}
